import { HttpsError } from "firebase-functions/v2/https";
import type { ClosetItemDocument } from "./types";

export const DRAFT_CLEANUP_CONFIRM = "DELETE_ABANDONED_DRAFTS";
export const DEFAULT_DRAFT_CLEANUP_CUTOFF_DAYS = 7;
export const DEFAULT_DRAFT_CLEANUP_LIMIT = 100;
export const MAX_DRAFT_CLEANUP_LIMIT = 500;
export const MAX_DRAFT_CLEANUP_RETURNED_ITEMS = 100;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type DraftCleanupItem = {
  itemId: string;
  name: string;
  category: string;
  createdAt: string | number | null;
  updatedAt: string | number | null;
  draftState: string | null;
  itemLifecycleStatus: string | null;
  reason: string;
};

export type DraftCleanupPreviewResult = {
  cutoffDays: number;
  cutoffTimestamp: number;
  totalChecked: number;
  deleteCandidateCount: number;
  candidates: DraftCleanupItem[];
};

export type DraftCleanupBulkResult = {
  cutoffDays: number;
  totalChecked: number;
  deletedCount: number;
  skippedCount: number;
  deletedItems: DraftCleanupItem[];
  skippedItems: DraftCleanupItem[];
};

export type DraftCleanupRecord = {
  uid?: string;
  itemId: string;
  item: ClosetItemDocument;
};

export type DraftCleanupBulkPlan = DraftCleanupBulkResult & {
  deleteRecords: DraftCleanupRecord[];
};

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function hasText(value: unknown): boolean {
  return cleanString(value).length > 0;
}

function nullableString(value: unknown): string | null {
  const text = cleanString(value);
  return text ? text : null;
}

function normalizedLower(value: unknown): string {
  return cleanString(value).toLowerCase();
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nestedIngestionStatus(item: ClosetItemDocument): string {
  return cleanString(optionalRecord(item.ingestion).status);
}

function hasIngestionObjectState(item: ClosetItemDocument): boolean {
  const ingestion = optionalRecord(item.ingestion);
  return Object.keys(ingestion).some((key) => hasText(ingestion[key]));
}

function statusIs(value: unknown, expected: string): boolean {
  return normalizedLower(value) === expected;
}

function isReadyItem(item: ClosetItemDocument): boolean {
  return statusIs(item.itemLifecycleStatus, "ready") || statusIs(item.draftState, "ready");
}

function isNeedsReview(item: ClosetItemDocument): boolean {
  return statusIs(item.itemLifecycleStatus, "needs_review") || statusIs(item.draftState, "needs_review");
}

function isPhotoUploaded(item: ClosetItemDocument): boolean {
  return statusIs(item.itemLifecycleStatus, "photo_uploaded") || statusIs(item.draftState, "photo_uploaded");
}

function isCandidate(item: ClosetItemDocument): boolean {
  return statusIs(item.itemLifecycleStatus, "candidate") || statusIs(item.draftState, "candidate");
}

function isPendingOrProcessing(item: ClosetItemDocument): boolean {
  const values = [
    item.itemLifecycleStatus,
    item.draftState,
    item.ingestionStatus,
    nestedIngestionStatus(item),
  ].map(normalizedLower);
  return values.some((value) => value === "pending" || value === "processing" || value === "uploading");
}

function isFailed(item: ClosetItemDocument): boolean {
  const values = [
    item.itemLifecycleStatus,
    item.draftState,
    item.ingestionStatus,
    nestedIngestionStatus(item),
  ].map(normalizedLower);
  return values.includes("failed");
}

function isIngestionDone(item: ClosetItemDocument): boolean {
  return statusIs(item.ingestionStatus, "done") || statusIs(nestedIngestionStatus(item), "done");
}

function hasEmbedding(item: ClosetItemDocument): boolean {
  return item.embeddingVector != null || hasText(item.embeddingHash);
}

function arrayHasText(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => hasText(entry));
}

const IMAGE_URL_KEY_PATTERN =
  /(?:image|photo|thumb|thumbnail|crop|refined|cleaned|original|primary|preview|normalized|layout).*?(?:url|uri)|(?:url|uri).*?(?:image|photo|thumb|thumbnail|crop|refined|cleaned|original|primary|preview|normalized|layout)/i;

function recordsHaveImageUrl(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (hasText(entry)) return true;
    const record = optionalRecord(entry);
    return Object.keys(record).some((key) => {
      const lowerKey = key.toLowerCase();
      return (lowerKey.includes("url") || lowerKey.includes("uri")) && hasText(record[key]);
    });
  });
}

function hasImageUrlLikeValue(value: unknown, keyHint = ""): boolean {
  const imageKey = IMAGE_URL_KEY_PATTERN.test(keyHint);
  if (imageKey && hasText(value)) return true;

  if (Array.isArray(value)) {
    if (imageKey && value.some(hasText)) return true;
    return value.some((entry) => hasImageUrlLikeValue(entry));
  }

  const record = optionalRecord(value);
  return Object.entries(record).some(([key, entry]) => hasImageUrlLikeValue(entry, key));
}

export function hasDraftCleanupImageUrl(item: ClosetItemDocument): boolean {
  const photos = optionalRecord(item.photos);
  const productPolish = optionalRecord(item.productPolish);
  const photosProductPolish = optionalRecord(photos.productPolish);
  const outfitExtraction = optionalRecord(item.outfitExtraction);
  const directImageFields = [
    item.imageUrl,
    item.imageUri,
    item.imageUrls,
    item.photoUrl,
    item.photoUri,
    item.cleanedImageUrl,
    item.cleanedImageUrls,
    item.originalImageUrl,
    item.normalizedImageUrl,
    item.refinedImageUrl,
    item.layoutCropUrl,
    item.originalCropUrl,
    item.cropImageUrl,
    item.primaryImageUrl,
    item.thumbnailUrl,
    item.thumbUrl,
    item.sourceOriginalUrl,
    productPolish.refinedImageUrl,
    photos.primaryUrl,
    photos.cleanedUrl,
    photos.cleanedPhotoUrl,
    photos.cleanedThumbUrl,
    photos.originalUrl,
    photos.normalizedUrl,
    photos.normalizedImageUrl,
    photos.refinedUrl,
    photos.layoutCropUrl,
    photos.originalCropUrl,
    photos.previewUrl,
    photos.croppedUrl,
    photos.thumbnailUrl,
    photos.aiUrl,
    photos.thumbUrl,
    photosProductPolish.refinedImageUrl,
    outfitExtraction.imageUrl,
    outfitExtraction.cleanedImageUrl,
    outfitExtraction.normalizedImageUrl,
    outfitExtraction.layoutCropUrl,
    outfitExtraction.originalCropUrl,
    outfitExtraction.cropImageUrl,
  ];
  return directImageFields.some(hasText) ||
    arrayHasText(item.imageUrls) ||
    arrayHasText(item.cleanedImageUrls) ||
    arrayHasText(item.secondaryImageUrls) ||
    arrayHasText(photos.urls) ||
    arrayHasText(photos.imageUrls) ||
    arrayHasText(photos.cleanedImageUrls) ||
    recordsHaveImageUrl(item.images) ||
    recordsHaveImageUrl(photos.images) ||
    hasImageUrlLikeValue(item);
}

function hasProductOrSourceUrl(item: ClosetItemDocument): boolean {
  const product = optionalRecord(item.product);
  const metadata = optionalRecord(item.metadata);
  const linkMetadata = optionalRecord(item.linkMetadata);
  const ingestionSource = optionalRecord(item.ingestionSource);
  const source = optionalRecord(item.source);
  const candidates = [
    item.sourceUrl,
    item.productUrl,
    item.productPageUrl,
    item.purchaseUrl,
    item.affiliateUrl,
    item.canonicalUrl,
    item.url,
    product.url,
    product.sourceUrl,
    product.productUrl,
    source.url,
    source.sourceUrl,
    source.productUrl,
    metadata.sourceUrl,
    metadata.productUrl,
    metadata.canonicalUrl,
    metadata.url,
    linkMetadata.sourceUrl,
    linkMetadata.productUrl,
    linkMetadata.canonicalUrl,
    linkMetadata.url,
    ingestionSource.sourceUrl,
    ingestionSource.productUrl,
  ];
  return candidates.some(hasText);
}

function timestampMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  if (value && typeof value === "object") {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof maybeTimestamp.toMillis === "function") {
      const millis = maybeTimestamp.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof maybeTimestamp.toDate === "function") {
      const millis = maybeTimestamp.toDate().getTime();
      return Number.isFinite(millis) ? millis : null;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1000000);
    }
  }
  return null;
}

function serializedDate(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  const millis = timestampMillis(value);
  return millis == null ? null : millis;
}

function itemName(item: ClosetItemDocument): string {
  return cleanString(item.name ?? item.title ?? item.subCategory ?? item.subcategory ?? item.category) || "Untitled item";
}

function itemCategory(item: ClosetItemDocument): string {
  return cleanString(item.category ?? item.subCategory ?? item.subcategory ?? item.type) || "unknown";
}

function cutoffLabel(cutoffDays: number): string {
  return `${cutoffDays} ${cutoffDays === 1 ? "day" : "days"}`;
}

export function draftCleanupCutoffDays(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_DRAFT_CLEANUP_CUTOFF_DAYS);
  if (!Number.isFinite(parsed)) return DEFAULT_DRAFT_CLEANUP_CUTOFF_DAYS;
  return Math.max(1, Math.floor(parsed));
}

export function draftCleanupLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_DRAFT_CLEANUP_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_DRAFT_CLEANUP_LIMIT;
  return Math.max(1, Math.min(MAX_DRAFT_CLEANUP_LIMIT, Math.floor(parsed)));
}

export function cutoffTimestampForDays(cutoffDays: number, nowMs = Date.now()): number {
  return nowMs - cutoffDays * DAY_MS;
}

function draftCleanupUnsafeReason(item: ClosetItemDocument, cutoffMs: number): string | null {
  if (item.isDraft !== true) return "not cleanup safe: not draft";
  if (isReadyItem(item)) return "not cleanup safe: ready item";
  if (isNeedsReview(item)) return "not cleanup safe: needs review";
  if (isPhotoUploaded(item)) return "not cleanup safe: photo uploaded";
  if (isCandidate(item)) return "not cleanup safe: candidate";
  if (isPendingOrProcessing(item)) return "not cleanup safe: pending";
  if (isFailed(item)) return "not cleanup safe: failed";
  if (isIngestionDone(item)) return "not cleanup safe: ingestion done";
  if (hasDraftCleanupImageUrl(item)) return "not cleanup safe: has image";
  if (hasProductOrSourceUrl(item)) return "not cleanup safe: has product/source url";
  if (hasEmbedding(item)) return "not cleanup safe: has embedding";

  const draftState = normalizedLower(item.draftState);
  if (draftState && draftState !== "draft") return "not cleanup safe: unsupported draft state";

  const lifecycle = normalizedLower(item.itemLifecycleStatus);
  if (lifecycle && lifecycle !== "draft") return "not cleanup safe: unsupported lifecycle state";

  if (hasText(item.ingestionStatus) || hasText(nestedIngestionStatus(item)) || hasIngestionObjectState(item)) {
    return "not cleanup safe: has ingestion state";
  }

  const createdAt = timestampMillis(item.createdAt);
  if (createdAt == null) return "not cleanup safe: missing createdAt";
  if (createdAt >= cutoffMs) return "not cleanup safe: newer than cutoff";

  return null;
}

export function isAutoDeleteSafeAbandonedDraft(item: ClosetItemDocument, cutoffMs: number): boolean {
  return draftCleanupUnsafeReason(item, cutoffMs) === null;
}

export function getDraftCleanupReason(
  item: ClosetItemDocument,
  cutoffMs = cutoffTimestampForDays(DEFAULT_DRAFT_CLEANUP_CUTOFF_DAYS),
  cutoffDays = DEFAULT_DRAFT_CLEANUP_CUTOFF_DAYS,
): string {
  return draftCleanupUnsafeReason(item, cutoffMs) ?? `empty draft older than ${cutoffLabel(cutoffDays)}`;
}

export function draftCleanupItem(
  record: DraftCleanupRecord,
  reason: string,
): DraftCleanupItem {
  const item = record.item;
  return {
    itemId: record.itemId,
    name: itemName(item),
    category: itemCategory(item),
    createdAt: serializedDate(item.createdAt),
    updatedAt: serializedDate(item.updatedAt),
    draftState: nullableString(item.draftState),
    itemLifecycleStatus: nullableString(item.itemLifecycleStatus),
    reason,
  };
}

function scopedRecords(records: DraftCleanupRecord[], uid?: string): DraftCleanupRecord[] {
  if (!uid) return records;
  return records.filter((record) => !record.uid || record.uid === uid);
}

function pushReturnedItem(items: DraftCleanupItem[], item: DraftCleanupItem) {
  if (items.length < MAX_DRAFT_CLEANUP_RETURNED_ITEMS) items.push(item);
}

export function previewAbandonedDraftCleanupRecords(args: {
  uid?: string;
  records: DraftCleanupRecord[];
  cutoffDays: number;
  cutoffMs: number;
}): DraftCleanupPreviewResult {
  const records = scopedRecords(args.records, args.uid);
  let deleteCandidateCount = 0;
  const candidates: DraftCleanupItem[] = [];

  for (const record of records) {
    if (!isAutoDeleteSafeAbandonedDraft(record.item, args.cutoffMs)) continue;
    deleteCandidateCount += 1;
    pushReturnedItem(candidates, draftCleanupItem(
      record,
      getDraftCleanupReason(record.item, args.cutoffMs, args.cutoffDays),
    ));
  }

  return {
    cutoffDays: args.cutoffDays,
    cutoffTimestamp: args.cutoffMs,
    totalChecked: records.length,
    deleteCandidateCount,
    candidates,
  };
}

export function validateBulkAbandonedDraftCleanupConfirm(confirm: unknown): void {
  if (confirm !== DRAFT_CLEANUP_CONFIRM) {
    throw new HttpsError("invalid-argument", "Missing DELETE_ABANDONED_DRAFTS confirmation.");
  }
}

export function buildBulkAbandonedDraftCleanupPlan(args: {
  uid?: string;
  records: DraftCleanupRecord[];
  cutoffDays: number;
  cutoffMs: number;
  confirm: unknown;
}): DraftCleanupBulkPlan {
  validateBulkAbandonedDraftCleanupConfirm(args.confirm);
  const records = scopedRecords(args.records, args.uid);
  const deleteRecords: DraftCleanupRecord[] = [];
  const deletedItems: DraftCleanupItem[] = [];
  const skippedItems: DraftCleanupItem[] = [];

  for (const record of records) {
    const reason = getDraftCleanupReason(record.item, args.cutoffMs, args.cutoffDays);
    if (isAutoDeleteSafeAbandonedDraft(record.item, args.cutoffMs)) {
      deleteRecords.push(record);
      pushReturnedItem(deletedItems, draftCleanupItem(record, reason));
    } else {
      pushReturnedItem(skippedItems, draftCleanupItem(record, reason));
    }
  }

  return {
    cutoffDays: args.cutoffDays,
    totalChecked: records.length,
    deletedCount: deleteRecords.length,
    skippedCount: records.length - deleteRecords.length,
    deletedItems,
    skippedItems,
    deleteRecords,
  };
}
