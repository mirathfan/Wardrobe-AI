import { HttpsError } from "firebase-functions/v2/https";
import {
  DAY_MS,
  DRAFT_CLEANUP_CONFIRM,
  buildBulkAbandonedDraftCleanupPlan,
  getDraftCleanupReason,
  isAutoDeleteSafeAbandonedDraft,
  previewAbandonedDraftCleanupRecords,
} from "../draftCleanup";
import type { ClosetItemDocument } from "../types";

const nowMs = Date.UTC(2026, 4, 30, 12);
const cutoffDays = 7;
const cutoffMs = nowMs - cutoffDays * DAY_MS;
const oldCreatedAt = cutoffMs - 1;
const newCreatedAt = cutoffMs + 1;

function emptyOldDraft(overrides: ClosetItemDocument = {}): ClosetItemDocument {
  return {
    isDraft: true,
    draftState: "draft",
    createdAt: oldCreatedAt,
    status: "AVAILABLE",
    category: "top",
    ...overrides,
  };
}

function safe(item: ClosetItemDocument): boolean {
  return isAutoDeleteSafeAbandonedDraft(item, cutoffMs);
}

describe("isAutoDeleteSafeAbandonedDraft", () => {
  it("allows an empty draft older than seven days", () => {
    expect(safe(emptyOldDraft())).toBe(true);
    expect(getDraftCleanupReason(emptyOldDraft(), cutoffMs, cutoffDays))
      .toBe("empty draft older than 7 days");
  });

  it("rejects an empty draft newer than seven days", () => {
    expect(safe(emptyOldDraft({ createdAt: newCreatedAt }))).toBe(false);
  });

  it("rejects ready items", () => {
    expect(safe(emptyOldDraft({ itemLifecycleStatus: "ready" }))).toBe(false);
    expect(getDraftCleanupReason(emptyOldDraft({ draftState: "ready" }), cutoffMs, cutoffDays))
      .toBe("not cleanup safe: ready item");
  });

  it("rejects needs_review items", () => {
    expect(safe(emptyOldDraft({ itemLifecycleStatus: "needs_review" }))).toBe(false);
  });

  it("rejects photo_uploaded items", () => {
    expect(safe(emptyOldDraft({ draftState: "photo_uploaded" }))).toBe(false);
  });

  it("rejects candidate items", () => {
    expect(safe(emptyOldDraft({ itemLifecycleStatus: "candidate" }))).toBe(false);
  });

  it("rejects pending ingestion items", () => {
    expect(safe(emptyOldDraft({ ingestionStatus: "pending" }))).toBe(false);
    expect(safe(emptyOldDraft({ ingestion: { status: "processing" } }))).toBe(false);
  });

  it("rejects failed items", () => {
    expect(safe(emptyOldDraft({ itemLifecycleStatus: "failed" }))).toBe(false);
    expect(safe(emptyOldDraft({ ingestion: { status: "failed" } }))).toBe(false);
  });

  it("rejects items with imageUrl", () => {
    expect(safe(emptyOldDraft({ imageUrl: "https://example.com/item.jpg" }))).toBe(false);
    expect(safe(emptyOldDraft({ imageUrls: ["https://example.com/item.jpg"] }))).toBe(false);
  });

  it("rejects items with photos.primaryUrl", () => {
    expect(safe(emptyOldDraft({ photos: { primaryUrl: "https://example.com/item.jpg" } }))).toBe(false);
  });

  it("rejects items with nested image URL-like fields", () => {
    expect(safe(emptyOldDraft({
      productPolish: { refinedImageUrl: "https://example.com/refined.jpg" },
    }))).toBe(false);
    expect(safe(emptyOldDraft({
      photos: { productPolish: { refinedImageUrl: "https://example.com/photo-refined.jpg" } },
    }))).toBe(false);
    expect(safe(emptyOldDraft({
      outfitExtraction: { normalizedImageUrl: "https://example.com/extracted.jpg" },
    }))).toBe(false);
  });

  it("rejects items with product or source URLs", () => {
    expect(safe(emptyOldDraft({ sourceUrl: "https://example.com/product" }))).toBe(false);
    expect(safe(emptyOldDraft({
      linkMetadata: { canonicalUrl: "https://example.com/product" },
    }))).toBe(false);
    expect(getDraftCleanupReason(
      emptyOldDraft({ product: { productUrl: "https://example.com/product" } }),
      cutoffMs,
      cutoffDays,
    )).toBe("not cleanup safe: has product/source url");
  });

  it("rejects items with embeddingHash or embeddingVector", () => {
    expect(safe(emptyOldDraft({ embeddingHash: "abc123" }))).toBe(false);
    expect(safe(emptyOldDraft({ embeddingVector: [0.1, 0.2] }))).toBe(false);
  });

  it("rejects ingestion done items", () => {
    expect(safe(emptyOldDraft({ ingestionStatus: "done" }))).toBe(false);
    expect(safe(emptyOldDraft({ ingestion: { status: "done" } }))).toBe(false);
  });
});

describe("bulkDeleteAbandonedDrafts planning", () => {
  it("rejects missing confirm", () => {
    expect(() => buildBulkAbandonedDraftCleanupPlan({
      records: [],
      cutoffDays,
      cutoffMs,
      confirm: undefined,
    })).toThrow(HttpsError);
  });

  it("deletes only safe abandoned drafts and skips unsafe drafts", () => {
    const plan = buildBulkAbandonedDraftCleanupPlan({
      records: [
        { uid: "user-1", itemId: "safe", item: emptyOldDraft({ name: "Safe draft" }) },
        { uid: "user-1", itemId: "image", item: emptyOldDraft({ imageUrl: "https://example.com/item.jpg" }) },
        { uid: "user-1", itemId: "review", item: emptyOldDraft({ itemLifecycleStatus: "needs_review" }) },
      ],
      cutoffDays,
      cutoffMs,
      confirm: DRAFT_CLEANUP_CONFIRM,
    });

    expect(plan.deletedCount).toBe(1);
    expect(plan.skippedCount).toBe(2);
    expect(plan.deleteRecords.map((record) => record.itemId)).toEqual(["safe"]);
    expect(plan.deletedItems[0]).toMatchObject({
      itemId: "safe",
      reason: "empty draft older than 7 days",
    });
    expect(plan.skippedItems.map((item) => item.reason)).toEqual([
      "not cleanup safe: has image",
      "not cleanup safe: needs review",
    ]);
  });

  it("only plans deletes for the requested user scope", () => {
    const plan = buildBulkAbandonedDraftCleanupPlan({
      uid: "user-1",
      records: [
        { uid: "user-1", itemId: "mine", item: emptyOldDraft() },
        { uid: "user-2", itemId: "theirs", item: emptyOldDraft() },
      ],
      cutoffDays,
      cutoffMs,
      confirm: DRAFT_CLEANUP_CONFIRM,
    });

    expect(plan.totalChecked).toBe(1);
    expect(plan.deleteRecords.map((record) => record.itemId)).toEqual(["mine"]);
  });
});

describe("previewAbandonedDraftCleanup", () => {
  it("returns candidates without mutating records", () => {
    const safeDraft = emptyOldDraft({ name: "Old empty draft" });
    const records = [
      { uid: "user-1", itemId: "candidate", item: safeDraft },
      { uid: "user-1", itemId: "new", item: emptyOldDraft({ createdAt: newCreatedAt }) },
    ];

    const result = previewAbandonedDraftCleanupRecords({
      uid: "user-1",
      records,
      cutoffDays,
      cutoffMs,
    });

    expect(result.totalChecked).toBe(2);
    expect(result.deleteCandidateCount).toBe(1);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        itemId: "candidate",
        name: "Old empty draft",
        reason: "empty draft older than 7 days",
      }),
    ]);
    expect(records[0].item).toBe(safeDraft);
  });
});
