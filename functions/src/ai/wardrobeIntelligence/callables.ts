import { FieldPath, getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger, setLogContext, tracedHandler } from "../../shared/logger";
import { redactUid } from "../../shared/rateLimit";
import {
  DRAFT_CLEANUP_CONFIRM,
  MAX_DRAFT_CLEANUP_RETURNED_ITEMS,
  buildBulkAbandonedDraftCleanupPlan,
  cutoffTimestampForDays,
  draftCleanupCutoffDays,
  draftCleanupItem,
  draftCleanupLimit,
  previewAbandonedDraftCleanupRecords,
  validateBulkAbandonedDraftCleanupConfirm,
  type DraftCleanupBulkResult,
  type DraftCleanupPreviewResult,
  type DraftCleanupRecord,
} from "./draftCleanup";
import {
  auditClosetDraftItemRecords,
  draftAuditLimit,
  validateDeleteDraftClosetItem,
} from "./draftAudit";
import { indexClosetItemIntelligence, serializeMetadataPreview } from "./indexClosetItem";
import { buildClosetItemEmbeddingText } from "./embeddingText";
import { normalizeClosetItemMetadata } from "./metadata";
import { getClosetItemIndexSkipReason } from "./skip";
import { safeRecordAuraMetricEvent } from "./metrics";
import type { BackfillItemEntry, ClosetItemDocument } from "./types";

const DEFAULT_BACKFILL_LIMIT = 50;
const MAX_BACKFILL_LIMIT = 100;
const MAX_BACKFILL_DEBUG_ITEMS = 50;
const BACKFILL_ALL_BATCH_SIZE = 100;
const FIRESTORE_DELETE_BATCH_LIMIT = 400;

type CleanupDocRecord = DraftCleanupRecord & {
  ref: DocumentReference;
};

function requireAuthUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Please sign in first.");
  }
  return uid;
}

function requireItemId(value: unknown): string {
  const itemId = String(value ?? "").trim();
  if (!itemId) {
    throw new HttpsError("invalid-argument", "A closet item ID is required.");
  }
  return itemId;
}

function backfillLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_BACKFILL_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_BACKFILL_LIMIT;
  return Math.max(1, Math.min(MAX_BACKFILL_LIMIT, Math.floor(parsed)));
}

function nullableCursor(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function errorReason(error: unknown): string {
  if (error instanceof HttpsError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function itemName(item: ClosetItemDocument): string {
  return String(item.name ?? item.title ?? item.subCategory ?? item.subcategory ?? item.category ?? "Untitled item")
    .trim() || "Untitled item";
}

function itemCategory(item: ClosetItemDocument): string {
  return String(item.category ?? item.subCategory ?? item.subcategory ?? item.type ?? "unknown").trim() || "unknown";
}

function backfillItemEntry(itemId: string, item: ClosetItemDocument, reason: string): BackfillItemEntry {
  return {
    itemId,
    name: itemName(item),
    category: itemCategory(item),
    reason,
  };
}

function pushDebugItem(items: BackfillItemEntry[], entry: BackfillItemEntry) {
  if (items.length < MAX_BACKFILL_DEBUG_ITEMS) items.push(entry);
}

async function readDraftCleanupRecords(uid: string, limit: number): Promise<CleanupDocRecord[]> {
  const snap = await getFirestore()
    .collection("users")
    .doc(uid)
    .collection("items")
    .where("isDraft", "==", true)
    .limit(limit)
    .get();

  return snap.docs.map((docSnap) => ({
    uid,
    itemId: docSnap.id,
    item: { id: docSnap.id, ...docSnap.data() } as ClosetItemDocument,
    ref: docSnap.ref,
  }));
}

async function rereadDraftCleanupRecords(records: CleanupDocRecord[]): Promise<{
  freshRecords: CleanupDocRecord[];
  missingItems: DraftCleanupBulkResult["skippedItems"];
}> {
  const freshRecords: CleanupDocRecord[] = [];
  const missingItems: DraftCleanupBulkResult["skippedItems"] = [];

  for (const record of records) {
    const freshSnap = await record.ref.get();
    if (!freshSnap.exists) {
      if (missingItems.length < MAX_DRAFT_CLEANUP_RETURNED_ITEMS) {
        missingItems.push(draftCleanupItem(
          { uid: record.uid, itemId: record.itemId, item: {} as ClosetItemDocument },
          "not cleanup safe: missing before delete",
        ));
      }
      continue;
    }
    freshRecords.push({
      ...record,
      item: { id: freshSnap.id, ...freshSnap.data() } as ClosetItemDocument,
    });
  }

  return { freshRecords, missingItems };
}

async function deleteCleanupRecords(records: CleanupDocRecord[]): Promise<void> {
  const db = getFirestore();
  for (let index = 0; index < records.length; index += FIRESTORE_DELETE_BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = records.slice(index, index + FIRESTORE_DELETE_BATCH_LIMIT);
    for (const record of chunk) {
      batch.delete(record.ref);
    }
    await batch.commit();
  }
}

type BackfillBatchArgs = {
  uid: string;
  limit: number;
  force: boolean;
  dryRun: boolean;
  cursor?: string | null;
  includeDebugItems?: boolean;
};

type BackfillBatchResult = {
  processed: number;
  indexed: number;
  skipped: number;
  failed: number;
  indexedItems: BackfillItemEntry[];
  skippedItems: BackfillItemEntry[];
  failedItems: BackfillItemEntry[];
  hasMore: boolean;
  nextCursor: string | null;
  totalBatchSize: number;
  dryRun: boolean;
};

async function processBackfillBatch(args: BackfillBatchArgs): Promise<BackfillBatchResult> {
  let query = getFirestore()
    .collection("users")
    .doc(args.uid)
    .collection("items")
    .orderBy(FieldPath.documentId());

  if (args.cursor) {
    query = query.startAfter(args.cursor);
  }

  const snap = await query.limit(args.limit + 1).get();
  const docsToProcess = snap.docs.slice(0, args.limit);
  const hasMore = snap.docs.length > args.limit;
  const nextCursor = docsToProcess.at(-1)?.id ?? null;
  const includeDebugItems = args.includeDebugItems !== false;

  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  const indexedItems: BackfillItemEntry[] = [];
  const skippedItems: BackfillItemEntry[] = [];
  const failedItems: BackfillItemEntry[] = [];

  for (const doc of docsToProcess) {
    const item = { id: doc.id, ...doc.data() } as ClosetItemDocument;
    const skipReason = getClosetItemIndexSkipReason(item);
    if (skipReason) {
      skipped += 1;
      if (includeDebugItems) pushDebugItem(skippedItems, backfillItemEntry(doc.id, item, skipReason));
      continue;
    }
    try {
      const result = await indexClosetItemIntelligence({
        itemId: doc.id,
        item,
        ref: doc.ref,
        force: args.force,
        dryRun: args.dryRun,
      });
      if (result.status === "indexed") {
        indexed += 1;
        if (includeDebugItems) pushDebugItem(indexedItems, backfillItemEntry(doc.id, item, result.reason));
      } else {
        skipped += 1;
        if (includeDebugItems) pushDebugItem(skippedItems, backfillItemEntry(doc.id, item, result.reason));
      }
    } catch (error) {
      failed += 1;
      if (includeDebugItems) pushDebugItem(failedItems, backfillItemEntry(doc.id, item, errorReason(error)));
      logger.error("[WARDROBE_INTELLIGENCE] backfill item failed", {
        itemId: doc.id,
        reason: errorReason(error),
      });
    }
  }

  return {
    processed: docsToProcess.length,
    indexed,
    skipped,
    failed,
    indexedItems,
    skippedItems,
    failedItems,
    hasMore,
    nextCursor: hasMore ? nextCursor : null,
    totalBatchSize: docsToProcess.length,
    dryRun: args.dryRun,
  };
}

export const reindexClosetItem = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    const itemId = requireItemId(request.data?.itemId);
    const force = request.data?.force === true;
    const ref = getFirestore().collection("users").doc(uid).collection("items").doc(itemId);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Closet item not found.");
    }

    const result = await indexClosetItemIntelligence({
      itemId,
      item: { id: itemId, ...snap.data() } as ClosetItemDocument,
      ref,
      force,
    });

    return {
      itemId,
      status: result.status,
      reason: result.reason,
      embeddingTextPreview: result.embeddingTextPreview,
      metadataPreview: serializeMetadataPreview(result.aiMetadata),
    };
  }),
);

export const backfillWardrobeIntelligence = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 540 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    const limit = backfillLimit(request.data?.limit);
    const force = request.data?.force === true;
    const dryRun = request.data?.dryRun === true;
    const cursor = nullableCursor(request.data?.cursor);
    return processBackfillBatch({ uid, limit, force, dryRun, cursor });
  }),
);

export const backfillWardrobeIntelligenceAll = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 540 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    const uidHash = redactUid(uid);
    setLogContext({ uidHash });
    const force = request.data?.force === true;
    const dryRun = request.data?.dryRun === true;

    let cursor: string | null = null;
    let totalProcessed = 0;
    let totalIndexed = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let batchesExecuted = 0;

    try {
      do {
        const batch = await processBackfillBatch({
          uid,
          limit: BACKFILL_ALL_BATCH_SIZE,
          force,
          dryRun,
          cursor,
          includeDebugItems: false,
        });
        batchesExecuted += 1;
        totalProcessed += batch.processed;
        totalIndexed += batch.indexed;
        totalSkipped += batch.skipped;
        totalFailed += batch.failed;
        cursor = batch.nextCursor;
        logger.info("[AURA_INTELLIGENCE_BACKFILL_ALL] batch processed", {
          uidHash,
          batch: batchesExecuted,
          processed: batch.processed,
          indexed: batch.indexed,
          skipped: batch.skipped,
          failed: batch.failed,
          hasMore: batch.hasMore,
        });
        if (!batch.hasMore) break;
      } while (cursor);

      logger.info("[AURA_INTELLIGENCE_BACKFILL_ALL] completed", {
        uidHash,
        totalProcessed,
        totalIndexed,
        totalSkipped,
        totalFailed,
        batchesExecuted,
      });
    } catch (error) {
      logger.error("[AURA_INTELLIGENCE_BACKFILL_ALL] stopped early", {
        uidHash,
        batchesExecuted,
        reason: errorReason(error),
      });
    }

    return {
      totalProcessed,
      totalIndexed,
      totalSkipped,
      totalFailed,
      batchesExecuted,
      dryRun,
    };
  }),
);

export const previewClosetItemIntelligence = onCall(
  { timeoutSeconds: 60 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    const itemId = requireItemId(request.data?.itemId);
    const ref = getFirestore().collection("users").doc(uid).collection("items").doc(itemId);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Closet item not found.");
    }

    const item = { id: itemId, ...snap.data() } as ClosetItemDocument;
    const aiMetadata = normalizeClosetItemMetadata(item);
    const embeddingText = buildClosetItemEmbeddingText(item, aiMetadata);
    return {
      itemId,
      aiMetadata: serializeMetadataPreview(aiMetadata),
      embeddingText,
    };
  }),
);

export const auditClosetDraftItems = onCall(
  { timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    const limit = draftAuditLimit(request.data?.limit);
    const snap = await getFirestore()
      .collection("users")
      .doc(uid)
      .collection("items")
      .limit(limit)
      .get();

    const result = auditClosetDraftItemRecords(
      snap.docs.map((doc) => ({
        itemId: doc.id,
        item: { id: doc.id, ...doc.data() } as ClosetItemDocument,
      })),
    );
    await safeRecordAuraMetricEvent(uid, {
      type: "wardrobe_coverage_checked",
      readyVisibleItems: result.readyVisibleCount,
      indexedReadyItems: result.indexedReadyCount,
      missingEmbeddingReadyItems: result.missingEmbeddingReadyCount,
    });
    return result;
  }),
);

export const previewAbandonedDraftCleanup = onCall(
  { timeoutSeconds: 120 },
  tracedHandler(async (request): Promise<DraftCleanupPreviewResult> => {
    const uid = requireAuthUid(request.auth?.uid);
    const uidHash = redactUid(uid);
    setLogContext({ uidHash });
    const cutoffDays = draftCleanupCutoffDays(request.data?.cutoffDays);
    const cutoffMs = cutoffTimestampForDays(cutoffDays);
    const limit = draftCleanupLimit(request.data?.limit);
    const records = await readDraftCleanupRecords(uid, limit);
    const result = previewAbandonedDraftCleanupRecords({
      uid,
      records,
      cutoffDays,
      cutoffMs,
    });

    logger.info("[AURA_DRAFT_CLEANUP] preview completed", {
      uidHash,
      cutoffDays,
      limit,
      totalChecked: result.totalChecked,
      deleteCandidateCount: result.deleteCandidateCount,
    });

    return result;
  }),
);

export const bulkDeleteAbandonedDrafts = onCall(
  { timeoutSeconds: 120 },
  tracedHandler(async (request): Promise<DraftCleanupBulkResult> => {
    const uid = requireAuthUid(request.auth?.uid);
    const uidHash = redactUid(uid);
    setLogContext({ uidHash });
    validateBulkAbandonedDraftCleanupConfirm(request.data?.confirm);
    const cutoffDays = draftCleanupCutoffDays(request.data?.cutoffDays);
    const cutoffMs = cutoffTimestampForDays(cutoffDays);
    const limit = draftCleanupLimit(request.data?.limit);

    logger.warn("[AURA_DRAFT_CLEANUP] bulk delete started", {
      uidHash,
      cutoffDays,
      limit,
      confirm: DRAFT_CLEANUP_CONFIRM,
    });

    const initialRecords = await readDraftCleanupRecords(uid, limit);
    const { freshRecords, missingItems } = await rereadDraftCleanupRecords(initialRecords);
    const plan = buildBulkAbandonedDraftCleanupPlan({
      uid,
      records: freshRecords,
      cutoffDays,
      cutoffMs,
      confirm: request.data?.confirm,
    });

    await deleteCleanupRecords(plan.deleteRecords as CleanupDocRecord[]);

    const skippedItems = [
      ...missingItems,
      ...plan.skippedItems,
    ].slice(0, MAX_DRAFT_CLEANUP_RETURNED_ITEMS);
    const result: DraftCleanupBulkResult = {
      cutoffDays,
      totalChecked: initialRecords.length,
      deletedCount: plan.deletedCount,
      skippedCount: plan.skippedCount + missingItems.length,
      deletedItems: plan.deletedItems,
      skippedItems,
    };

    logger.warn("[AURA_DRAFT_CLEANUP] bulk delete completed", {
      uidHash,
      cutoffDays,
      totalChecked: result.totalChecked,
      deletedCount: result.deletedCount,
      skippedCount: result.skippedCount,
    });

    return result;
  }),
);

export const deleteDraftClosetItem = onCall(
  { timeoutSeconds: 60 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    const itemId = requireItemId(request.data?.itemId);
    const ref = getFirestore().collection("users").doc(uid).collection("items").doc(itemId);
    const snap = await ref.get();

    if (!snap.exists) {
      throw new HttpsError("not-found", "Draft closet item not found.");
    }

    const item = { id: itemId, ...snap.data() } as ClosetItemDocument;
    const reason = validateDeleteDraftClosetItem(item, request.data?.confirm);
    logger.warn("[AURA_DRAFT_AUDIT] deleting draft closet item document", {
      uidHash: redactUid(uid),
      itemId,
      reason,
    });
    await ref.delete();
    return {
      itemId,
      deleted: true,
      reason,
    };
  }),
);
