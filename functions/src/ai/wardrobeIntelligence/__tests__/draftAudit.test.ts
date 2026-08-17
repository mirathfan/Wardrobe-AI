import { HttpsError } from "firebase-functions/v2/https";
import {
  DRAFT_AUDIT_DELETE_CONFIRM,
  auditClosetDraftItemRecords,
  isHiddenDraftItem,
  isReadyClosetItem,
  validateDeleteDraftClosetItem,
} from "../draftAudit";
import type { ClosetItemDocument } from "../types";

const readyAvailableItem: ClosetItemDocument = {
  name: "Black regular tee",
  category: "top",
  status: "AVAILABLE",
  isDraft: false,
  itemLifecycleStatus: "ready",
  draftState: "ready",
  ingestionStatus: "done",
};

function auditOne(item: ClosetItemDocument) {
  return auditClosetDraftItemRecords([{ itemId: "item-1", item }]);
}

describe("draft audit classification", () => {
  it("treats draftState ready done AVAILABLE items as ready and excludes them", () => {
    const result = auditOne(readyAvailableItem);

    expect(isReadyClosetItem(readyAvailableItem)).toBe(true);
    expect(isHiddenDraftItem(readyAvailableItem)).toBe(false);
    expect(result.readyVisibleCount).toBe(1);
    expect(result.hiddenDraftCount).toBe(0);
    expect(result.draftItems).toEqual([]);
  });

  it("treats WORN ready items as visible", () => {
    const item = { ...readyAvailableItem, status: "WORN" };

    expect(isReadyClosetItem(item)).toBe(true);
    expect(isHiddenDraftItem(item)).toBe(false);
    expect(auditOne(item).readyVisibleCount).toBe(1);
  });

  it("treats IN_LAUNDRY ready items as visible", () => {
    const item = { ...readyAvailableItem, status: "IN_LAUNDRY" };

    expect(isReadyClosetItem(item)).toBe(true);
    expect(isHiddenDraftItem(item)).toBe(false);
    expect(auditOne(item).readyVisibleCount).toBe(1);
  });

  it("counts ready indexed and missing-embedding items separately", () => {
    const result = auditClosetDraftItemRecords([
      { itemId: "indexed", item: { ...readyAvailableItem, embeddingHash: "hash" } },
      { itemId: "missing", item: readyAvailableItem },
    ]);

    expect(result.readyVisibleCount).toBe(2);
    expect(result.indexedReadyCount).toBe(1);
    expect(result.missingEmbeddingReadyCount).toBe(1);
  });

  it("identifies real drafts", () => {
    const item = {
      ...readyAvailableItem,
      isDraft: true,
      draftState: "draft",
      itemLifecycleStatus: "candidate",
      ingestionStatus: "pending",
    };
    const result = auditOne(item);

    expect(isReadyClosetItem(item)).toBe(false);
    expect(isHiddenDraftItem(item)).toBe(true);
    expect(result.hiddenDraftCount).toBe(1);
    expect(result.trueDraftCount).toBe(1);
    expect(result.draftItems[0].reason).toBe("multiple hidden states");
  });

  it("identifies needs_review photo_uploaded items", () => {
    const item = {
      ...readyAvailableItem,
      itemLifecycleStatus: "needs_review",
      draftState: "photo_uploaded",
    };
    const result = auditOne(item);

    expect(isHiddenDraftItem(item)).toBe(true);
    expect(result.needsReviewCount).toBe(1);
    expect(result.draftItems[0].reason).toBe("multiple hidden states");
  });

  it("identifies candidate pending items", () => {
    const item = {
      ...readyAvailableItem,
      itemLifecycleStatus: "candidate",
      ingestionStatus: "pending",
    };
    const result = auditOne(item);

    expect(isHiddenDraftItem(item)).toBe(true);
    expect(result.candidateCount).toBe(1);
    expect(result.pendingIngestionCount).toBe(1);
    expect(result.draftItems[0].reason).toBe("multiple hidden states");
  });

  it("identifies failed items", () => {
    const item = {
      ...readyAvailableItem,
      itemLifecycleStatus: "failed",
      ingestionStatus: "failed",
    };
    const result = auditOne(item);

    expect(isHiddenDraftItem(item)).toBe(true);
    expect(result.failedCount).toBe(1);
    expect(result.draftItems[0].reason).toBe("multiple hidden states");
  });

  it("treats draftState ready with nested ingestion done as ready when top-level ingestion is missing", () => {
    const item: ClosetItemDocument = {
      ...readyAvailableItem,
      ingestionStatus: undefined,
      ingestion: { status: "done" },
    };

    expect(isReadyClosetItem(item)).toBe(true);
    expect(isHiddenDraftItem(item)).toBe(false);
    expect(auditOne(item).draftItems).toEqual([]);
  });

  it("treats draftState ready with pending ingestion as hidden, not ready", () => {
    const item = {
      ...readyAvailableItem,
      ingestionStatus: "pending",
    };
    const result = auditOne(item);

    expect(isReadyClosetItem(item)).toBe(false);
    expect(isHiddenDraftItem(item)).toBe(true);
    expect(result.pendingIngestionCount).toBe(1);
    expect(result.draftItems[0].reason).toBe("pending ingestion");
  });
});

describe("delete draft closet item safety", () => {
  it("rejects delete without the exact confirmation string", () => {
    expect(() => validateDeleteDraftClosetItem({ ...readyAvailableItem, isDraft: true }, "delete"))
      .toThrow(HttpsError);
  });

  it("rejects deleting a ready closet item", () => {
    expect(() => validateDeleteDraftClosetItem(readyAvailableItem, DRAFT_AUDIT_DELETE_CONFIRM))
      .toThrow("Refusing to delete ready closet item.");
  });

  it("rejects deleting a normal non-hidden item", () => {
    const item = {
      ...readyAvailableItem,
      itemLifecycleStatus: "ready-ish",
      draftState: "ready",
      ingestionStatus: "done",
    };

    expect(() => validateDeleteDraftClosetItem(item, DRAFT_AUDIT_DELETE_CONFIRM))
      .toThrow(HttpsError);
  });

  it("allows deleting an isDraft item", () => {
    expect(validateDeleteDraftClosetItem(
      { ...readyAvailableItem, isDraft: true, draftState: "draft" },
      DRAFT_AUDIT_DELETE_CONFIRM,
    )).toBe("multiple hidden states");
  });
});
