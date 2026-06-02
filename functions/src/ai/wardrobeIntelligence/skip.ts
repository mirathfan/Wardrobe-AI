import type { ClosetItemDocument } from "./types";

export const GENERATED_INTELLIGENCE_FIELDS = new Set([
  "aiMetadata",
  "aiMetadataVersion",
  "embeddingText",
  "embeddingHash",
  "embeddingVector",
  "embeddingRaw",
  "embeddingModel",
  "embeddingDimensions",
  "embeddingVersion",
  "embeddingUpdatedAt",
  "intelligenceUpdatedAt",
  "lastIntelligenceRunAt",
  "lastIntelligenceReason",
]);

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

export function changedTopLevelFields(
  before: ClosetItemDocument | undefined,
  after: ClosetItemDocument | undefined,
): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys]
    .filter((key) => stableJson(before?.[key]) !== stableJson(after?.[key]))
    .sort((left, right) => left.localeCompare(right));
}

export function isGeneratedFieldOnlyUpdate(
  before: ClosetItemDocument | undefined,
  after: ClosetItemDocument | undefined,
): boolean {
  if (!before || !after) return false;
  const changed = changedTopLevelFields(before, after);
  return changed.length > 0 && changed.every((field) => GENERATED_INTELLIGENCE_FIELDS.has(field));
}

export function shouldSkipIntelligenceIndexing(
  before: ClosetItemDocument | undefined,
  after: ClosetItemDocument | undefined,
): boolean {
  if (!after) return true;
  if (!before) return false;
  const changed = changedTopLevelFields(before, after);
  if (!changed.length) return true;
  return changed.every((field) => GENERATED_INTELLIGENCE_FIELDS.has(field));
}

function normalizedItemStatus(item: ClosetItemDocument): string {
  return String(item.status ?? "").trim().toUpperCase();
}

function hasMinimumIndexingFields(item: ClosetItemDocument): boolean {
  const textSignals = [
    item.name,
    item.title,
    item.category,
    item.subCategory,
    item.subcategory,
    item.type,
    item.brand,
    item.material,
    item.notes,
    item.productDescription,
  ].some((value) => String(value ?? "").trim().length > 0);
  const listSignals = [item.colors, item.aiColors, item.displayColors, item.detailTags, item.aestheticTags]
    .some((value) => Array.isArray(value) && value.length > 0);
  return textSignals || listSignals;
}

export function getClosetItemIndexSkipReason(item: ClosetItemDocument): string | null {
  const lifecycle = String(item.itemLifecycleStatus ?? "").trim().toLowerCase();
  const draftState = String(item.draftState ?? "").trim().toLowerCase();
  const ingestionStatus = String(
    (item.ingestion && typeof item.ingestion === "object"
      ? (item.ingestion as Record<string, unknown>).status
      : item.ingestionStatus) ?? "",
  ).trim().toLowerCase();
  const status = normalizedItemStatus(item);

  if (!hasMinimumIndexingFields(item)) return "missing required fields";
  if (status && status !== "AVAILABLE" && status !== "WORN" && status !== "IN_LAUNDRY") {
    return "unsupported status";
  }

  if (lifecycle === "deleted" || draftState === "cancelled") return "deleted";
  if (lifecycle === "needs_review" || draftState === "photo_uploaded") return "needs review";
  if (item.isDraft === true && draftState !== "ready") return "is draft";
  if (lifecycle === "candidate" || draftState === "draft" || draftState === "awaiting_confirmation") return "is draft";
  if (lifecycle === "uploading" || lifecycle === "processing" || lifecycle === "failed") return "unsupported status";
  if (draftState && draftState !== "ready") return "unsupported status";
  if (ingestionStatus === "pending" || ingestionStatus === "processing" || ingestionStatus === "failed") {
    return "unsupported status";
  }
  return null;
}

export function isIndexableClosetItemState(item: ClosetItemDocument): boolean {
  return getClosetItemIndexSkipReason(item) === null;
}
