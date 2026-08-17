# AURA Draft Cleanup

AURA creates transient closet item documents while the add-item flow is open so photo upload, AI extraction, and manual edits can share one `users/{uid}/items/{itemId}` document. Some sessions can end before a photo is uploaded, leaving hidden empty drafts.

## Safe To Delete

Automatic cleanup deletes only strict empty abandoned drafts:

- `isDraft === true`
- `draftState` is `draft`, missing, or null
- `itemLifecycleStatus` is `draft`, missing, or null
- top-level `ingestionStatus` is missing or null
- nested `ingestion.status` is missing or null
- no `imageUrl`, `photoUrl`, `photos.primaryUrl`, `cleanedImageUrl`, `originalImageUrl`, or other photo/image URL fields
- no product/source URL
- no `embeddingHash` or `embeddingVector`
- `createdAt` is older than the configured cutoff

The default cutoff is 7 days.

## Never Deleted

Cleanup refuses to delete ready or in-progress/review documents, including:

- `itemLifecycleStatus === "ready"` or `draftState === "ready"`
- `needs_review`
- `photo_uploaded`
- `candidate`
- pending, processing, or failed ingestion states
- `ingestionStatus === "done"` or `ingestion.status === "done"`
- any item with image URLs, product/source URLs, or embeddings

This intentionally excludes `needs_review` and `photo_uploaded` items because those can represent user work or uploaded photos that still need review.

## Automatic Cleanup

`cleanupAbandonedDraftClosetItems` runs once per day in `America/Chicago`. It scans users in batches, checks each user's draft closet items, rereads each candidate immediately before deletion, and caps deletes at 1000 Firestore documents per run. It deletes only Firestore item documents and does not delete Storage files.

Logs use the `[AURA_DRAFT_CLEANUP]` prefix and include start, per-user summary, deleted-item, and completion entries.

## Developer Preview

Use the dev-only Intelligence Debug screen:

1. Open `Abandoned Draft Cleanup`.
2. Set `cutoffDays` and `limit`.
3. Tap `Preview Cleanup`.

This calls `previewAbandonedDraftCleanup` and returns safe delete candidates without deleting anything.

## Developer Bulk Cleanup

Use the same debug section and tap `Delete Abandoned Drafts`. The callable requires:

```json
{
  "confirm": "DELETE_ABANDONED_DRAFTS"
}
```

`bulkDeleteAbandonedDrafts` rereads and rechecks every item immediately before deleting, deletes only strict empty abandoned drafts, returns capped deleted/skipped item lists, and leaves Storage untouched.

After a bulk cleanup, rerun Draft Audit to confirm that ready, review, uploaded, candidate, pending, and failed items remain untouched.
