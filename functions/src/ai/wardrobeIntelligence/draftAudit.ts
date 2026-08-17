import { HttpsError } from "firebase-functions/v2/https";
import type { ClosetItemDocument } from "./types";

export const DRAFT_AUDIT_DELETE_CONFIRM = "DELETE_DRAFT_ITEM";
export const DEFAULT_DRAFT_AUDIT_LIMIT = 50;
export const MAX_DRAFT_AUDIT_LIMIT = 200;
export const MAX_DRAFT_AUDIT_ITEMS = 100;

export type DraftAuditItem = {
  itemId: string;
  name: string;
  category: string;
  status: string | null;
  isDraft: boolean;
  itemLifecycleStatus: string | null;
  draftState: string | null;
  ingestionStatus: string | null;
  nestedIngestionStatus: string | null;
  createdAt: string | number | null;
  updatedAt: string | number | null;
  imageUrl: string | null;
  reason: string;
};

export type DraftAuditSummary = {
  totalChecked: number;
  hiddenDraftCount: number;
  trueDraftCount: number;
  needsReviewCount: number;
  candidateCount: number;
  failedCount: number;
  pendingIngestionCount: number;
  readyVisibleCount: number;
  indexedReadyCount: number;
  missingEmbeddingReadyCount: number;
};

export type DraftAuditResult = DraftAuditSummary & {
  draftItems: DraftAuditItem[];
};

export function draftAuditLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_DRAFT_AUDIT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_DRAFT_AUDIT_LIMIT;
  return Math.max(1, Math.min(MAX_DRAFT_AUDIT_LIMIT, Math.floor(parsed)));
}

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableString(value: unknown): string | null {
  const text = cleanString(value);
  return text ? text : null;
}

function normalizedLower(value: unknown): string {
  return cleanString(value).toLowerCase();
}

function nestedIngestionStatus(item: ClosetItemDocument): string {
  if (!item.ingestion || typeof item.ingestion !== "object") return "";
  return cleanString((item.ingestion as Record<string, unknown>).status);
}

function isNeedsReview(item: ClosetItemDocument): boolean {
  return normalizedLower(item.itemLifecycleStatus) === "needs_review";
}

function isCandidate(item: ClosetItemDocument): boolean {
  return normalizedLower(item.itemLifecycleStatus) === "candidate";
}

function isFailed(item: ClosetItemDocument): boolean {
  return normalizedLower(item.itemLifecycleStatus) === "failed" ||
    normalizedLower(item.draftState) === "failed" ||
    normalizedLower(item.ingestionStatus) === "failed" ||
    normalizedLower(nestedIngestionStatus(item)) === "failed";
}

function isPendingIngestion(item: ClosetItemDocument): boolean {
  return normalizedLower(item.ingestionStatus) === "pending" ||
    normalizedLower(nestedIngestionStatus(item)) === "pending";
}

function hasEmbedding(item: ClosetItemDocument): boolean {
  return Boolean(item.embeddingVector ?? item.embeddingHash);
}

function itemName(item: ClosetItemDocument): string {
  return cleanString(item.name ?? item.title ?? item.subCategory ?? item.subcategory ?? item.category) || "Untitled item";
}

function itemCategory(item: ClosetItemDocument): string {
  return cleanString(item.category ?? item.subCategory ?? item.subcategory ?? item.type) || "unknown";
}

function firstImageFromImages(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const primary = value.find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).isPrimary === true);
  const candidates = [primary, ...value].filter(Boolean) as Record<string, unknown>[];
  for (const candidate of candidates) {
    const url = cleanString(candidate.cleanedUrl ?? candidate.refinedUrl ?? candidate.originalUrl ?? candidate.sourceOriginalUrl);
    if (url) return url;
  }
  return "";
}

function imageUrl(item: ClosetItemDocument): string | null {
  const photos = item.photos && typeof item.photos === "object"
    ? item.photos as Record<string, unknown>
    : {};
  const direct = cleanString(
    item.cleanedImageUrl ??
      item.refinedImageUrl ??
      item.originalImageUrl ??
      item.photoUrl ??
      photos.cleanedUrl ??
      photos.cleanedPhotoUrl ??
      photos.primaryUrl ??
      photos.thumbUrl ??
      photos.originalUrl,
  );
  if (direct) return direct;
  const photoUrls = Array.isArray(photos.urls) ? cleanString(photos.urls[0]) : "";
  if (photoUrls) return photoUrls;
  return firstImageFromImages(item.images ?? photos.images) || null;
}

function serializedDate(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const maybeTimestamp = value as { toDate?: () => Date; toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    if (typeof maybeTimestamp.toMillis === "function") {
      const millis = maybeTimestamp.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1000000);
    }
  }
  return null;
}

export function draftAuditReasons(item: ClosetItemDocument): string[] {
  if (isReadyClosetItem(item)) return [];

  const lifecycle = normalizedLower(item.itemLifecycleStatus);
  const draftState = normalizedLower(item.draftState);
  const ingestionStatus = normalizedLower(item.ingestionStatus);
  const nestedStatus = normalizedLower(nestedIngestionStatus(item));
  const reasons: string[] = [];
  if (item.isDraft === true) reasons.push("isDraft true");
  if (lifecycle === "needs_review") reasons.push("needs review");
  if (lifecycle === "candidate") reasons.push("candidate item");
  if (lifecycle === "failed" || draftState === "failed") reasons.push("failed item");
  if (draftState === "draft") reasons.push("draft state draft");
  if (draftState === "photo_uploaded") reasons.push("photo uploaded draft");
  if (ingestionStatus === "pending" || nestedStatus === "pending") reasons.push("pending ingestion");
  if (ingestionStatus === "failed" || nestedStatus === "failed") {
    reasons.push("failed ingestion");
  }
  return [...new Set(reasons)];
}

export function draftAuditReason(item: ClosetItemDocument): string | null {
  const reasons = draftAuditReasons(item);
  if (!reasons.length) return null;
  return reasons.length > 1 ? "multiple hidden states" : reasons[0];
}

export function isReadyClosetItem(item: ClosetItemDocument): boolean {
  if (item.isDraft === true) return false;
  if (normalizedLower(item.itemLifecycleStatus) !== "ready") return false;
  if (normalizedLower(item.draftState) !== "ready") return false;
  if (!["AVAILABLE", "WORN", "IN_LAUNDRY"].includes(cleanString(item.status).toUpperCase())) {
    return false;
  }

  const ingestionStatus = normalizedLower(item.ingestionStatus);
  const nestedStatus = normalizedLower(nestedIngestionStatus(item));
  const ingestionOk = ingestionStatus === "done" || (!ingestionStatus && nestedStatus === "done");
  const nestedOk = nestedStatus === "done" || (!nestedStatus && ingestionStatus === "done");
  return ingestionOk && nestedOk;
}

export function isHiddenDraftItem(item: ClosetItemDocument): boolean {
  if (isReadyClosetItem(item)) return false;
  return draftAuditReasons(item).length > 0;
}

export function draftAuditItem(itemId: string, item: ClosetItemDocument): DraftAuditItem | null {
  const reason = draftAuditReason(item);
  if (!reason) return null;
  return {
    itemId,
    name: itemName(item),
    category: itemCategory(item),
    status: nullableString(item.status),
    isDraft: item.isDraft === true,
    itemLifecycleStatus: nullableString(item.itemLifecycleStatus),
    draftState: nullableString(item.draftState),
    ingestionStatus: nullableString(item.ingestionStatus),
    nestedIngestionStatus: nullableString(nestedIngestionStatus(item)),
    createdAt: serializedDate(item.createdAt),
    updatedAt: serializedDate(item.updatedAt),
    imageUrl: imageUrl(item),
    reason,
  };
}

export function auditClosetDraftItemRecords(
  records: { itemId: string; item: ClosetItemDocument }[],
): DraftAuditResult {
  const summary: DraftAuditSummary = {
    totalChecked: records.length,
    hiddenDraftCount: 0,
    trueDraftCount: 0,
    needsReviewCount: 0,
    candidateCount: 0,
    failedCount: 0,
    pendingIngestionCount: 0,
    readyVisibleCount: 0,
    indexedReadyCount: 0,
    missingEmbeddingReadyCount: 0,
  };
  const draftItems: DraftAuditItem[] = [];

  for (const record of records) {
    const item = record.item;
    const ready = isReadyClosetItem(item);
    const hidden = isHiddenDraftItem(item);

    if (item.isDraft === true) summary.trueDraftCount += 1;
    if (isNeedsReview(item)) summary.needsReviewCount += 1;
    if (isCandidate(item)) summary.candidateCount += 1;
    if (isFailed(item)) summary.failedCount += 1;
    if (isPendingIngestion(item)) summary.pendingIngestionCount += 1;
    if (ready) {
      summary.readyVisibleCount += 1;
      if (hasEmbedding(item)) {
        summary.indexedReadyCount += 1;
      } else {
        summary.missingEmbeddingReadyCount += 1;
      }
    }

    if (!hidden) continue;
    summary.hiddenDraftCount += 1;
    const entry = draftAuditItem(record.itemId, item);
    if (!entry) continue;
    if (draftItems.length < MAX_DRAFT_AUDIT_ITEMS) draftItems.push(entry);
  }

  return {
    ...summary,
    draftItems,
  };
}

export function validateDeleteDraftClosetItem(
  item: ClosetItemDocument,
  confirm: unknown,
): string {
  if (confirm !== DRAFT_AUDIT_DELETE_CONFIRM) {
    throw new HttpsError("invalid-argument", "Missing DELETE_DRAFT_ITEM confirmation.");
  }

  if (isReadyClosetItem(item)) {
    throw new HttpsError("failed-precondition", "Refusing to delete ready closet item.");
  }

  if (!isHiddenDraftItem(item)) {
    throw new HttpsError(
      "failed-precondition",
      "Refusing to delete a closet item that does not look like a draft or hidden review item.",
    );
  }

  return draftAuditReason(item) ?? "hidden draft item";
}
