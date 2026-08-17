# AURA Intelligence Phase 1

Phase 1 builds the wardrobe intelligence indexing layer for closet items. It normalizes item metadata, builds deterministic semantic text, generates OpenAI text embeddings, and stores those embeddings on each closet item document for future Wardrobe RAG work.

This phase does not add full RAG chat, LangChain, LangGraph, outfit generation, recommendation ranking, visual CLIP search, or UI screens.

## Firestore Path

Closet items live at:

```text
users/{uid}/items/{itemId}
```

The collection group for vector indexing is `items`.

## New Closet Item Fields

Phase 1 adds or updates these generated fields on closet item documents:

```text
aiMetadata
aiMetadataVersion
embeddingText
embeddingHash
embeddingVector
embeddingModel
embeddingDimensions
embeddingVersion
embeddingUpdatedAt
intelligenceUpdatedAt
```

`aiMetadata` contains normalized category, subcategory, brand, colors, material, fit, formality, warmth, style tags, occasion tags, season tags, weather tags, search aliases, confidence, source, and an update timestamp.

## Functions Added

- `onClosetItemWriteIndexIntelligence`: Firestore trigger for `users/{uid}/items/{itemId}` creates and updates.
- `reindexClosetItem`: authenticated callable for one item.
- `backfillWardrobeIntelligence`: authenticated callable for one paginated batch of a user's closet items.
- `backfillWardrobeIntelligenceAll`: authenticated callable that runs all paginated batches server-side.
- `previewClosetItemIntelligence`: authenticated callable that returns normalized metadata and embedding text without writing.

The trigger skips deletes, generated-field-only writes, draft/processing/deleted item states, and unchanged embedding hashes.

## Env And Secrets

Required:

```text
OPENAI_API_KEY
```

Optional:

```text
AURA_EMBEDDING_MODEL=text-embedding-3-large
AURA_EMBEDDING_DIMENSIONS=2048
AURA_ENABLE_AI_METADATA_ENRICHMENT=false
```

Embeddings default to `text-embedding-3-large` with `2048` dimensions and `encoding_format: "float"` so they fit Firestore vector search limits.

## Local Development

From `closet/functions`:

```bash
npm install
npm test
npm run build
npm run serve
```

Set `OPENAI_API_KEY` in the Firebase Functions environment or local emulator environment before running functions that generate embeddings.

## Backfill Usage

Call `backfillWardrobeIntelligence` from an authenticated Firebase client or the Functions emulator shell:

```ts
await httpsCallable(functions, "backfillWardrobeIntelligence")({
  limit: 50,
  force: false,
  dryRun: true,
  cursor: null,
});
```

Use `dryRun: true` first. Then run with `dryRun: false` to write embeddings. `limit` defaults to `50` and is capped at `100` per batch. Backfill batches are sorted by closet item document ID. If `hasMore` is true, pass `nextCursor` as `cursor` to process the next page.

The callable returns aggregate counts plus the first 50 item-level debug entries for each result bucket:

```json
{
  "processed": 10,
  "indexed": 2,
  "skipped": 7,
  "failed": 1,
  "hasMore": true,
  "nextCursor": "JvFYg7kwDW3NZykc6Z0v",
  "totalBatchSize": 10,
  "indexedItems": [
    {
      "itemId": "ITEM_ID",
      "name": "Black oversized Nike hoodie",
      "category": "top",
      "reason": "new embedding generated"
    }
  ],
  "skippedItems": [
    {
      "itemId": "ITEM_ID",
      "name": "White Oxford shirt",
      "category": "top",
      "reason": "matching embedding hash"
    }
  ],
  "failedItems": [
    {
      "itemId": "ITEM_ID",
      "name": "Black leather loafers",
      "category": "footwear",
      "reason": "OPENAI_API_KEY is not configured for Firebase Functions."
    }
  ],
  "dryRun": true
}
```

To backfill the entire closet from the server-side callable:

```ts
await httpsCallable(functions, "backfillWardrobeIntelligenceAll")({
  force: false,
  dryRun: true,
});
```

It processes internally in batches of 100 and returns totals:

```json
{
  "totalProcessed": 157,
  "totalIndexed": 12,
  "totalSkipped": 145,
  "totalFailed": 0,
  "batchesExecuted": 2,
  "dryRun": true
}
```

To reindex one item:

```ts
await httpsCallable(functions, "reindexClosetItem")({
  itemId: "ITEM_ID",
  force: true,
});
```

To preview without writing:

```ts
await httpsCallable(functions, "previewClosetItemIntelligence")({
  itemId: "ITEM_ID",
});
```

## Firestore Vector Index

Create the vector index after deploy:

```bash
gcloud firestore indexes composite create \
  --collection-group=items \
  --query-scope=COLLECTION \
  --field-config field-path=embeddingVector,vector-config='{"dimension":"2048", "flat": "{}"}' \
  --database='(default)'
```

If `AURA_EMBEDDING_DIMENSIONS` changes, recreate the vector index with the same dimension.

## Implementation Notes

The indexing helpers live in `functions/src/ai/wardrobeIntelligence`. The deterministic hash includes embedding text, metadata version, text version, model, and dimensions, so unchanged closet items do not call OpenAI again.

Current version constants:

```text
AI_METADATA_VERSION=2
EMBEDDING_TEXT_VERSION=2
EMBEDDING_VERSION=1
```

Version 2 fixes footwear normalization and deterministic formality scoring. Run a forced backfill for ready items after deploy so stored metadata and embeddings are regenerated with the corrected rules.

The current implementation uses deterministic metadata normalization. `AURA_ENABLE_AI_METADATA_ENRICHMENT` is reserved for a future optional vision-enrichment pass and Phase 1 does not depend on it.

## Draft Audit Tool

The developer-only Intelligence Debug screen also includes a Draft Audit tool for finding closet item documents that are hidden from the normal closet UI but still exist under `users/{uid}/items`.

Callable functions:

```text
auditClosetDraftItems
deleteDraftClosetItem
```

`auditClosetDraftItems` requires Firebase Auth and only reads the authenticated user's `users/{uid}/items` collection. It returns summary counts plus up to 100 draft audit entries.

`draftState: "ready"` is a finalized state, not a draft. Ready items are intentionally excluded when they have `itemLifecycleStatus: "ready"`, done ingestion, `isDraft !== true`, and a visible closet status (`AVAILABLE`, `WORN`, or `IN_LAUNDRY`).

The audit flags real draft or hidden states:

```text
isDraft === true
itemLifecycleStatus === "needs_review"
itemLifecycleStatus === "candidate"
itemLifecycleStatus === "failed"
draftState === "draft"
draftState === "photo_uploaded"
draftState === "failed"
ingestionStatus === "pending"
ingestionStatus === "failed"
ingestion.status === "pending"
ingestion.status === "failed"
```

Run an audit from the dev panel or with an authenticated callable:

```ts
await httpsCallable(functions, "auditClosetDraftItems")({
  limit: 100,
});
```

`deleteDraftClosetItem` is intentionally narrow. It requires Auth, scopes to `users/{uid}/items/{itemId}`, and requires:

```json
{
  "itemId": "ITEM_ID",
  "confirm": "DELETE_DRAFT_ITEM"
}
```

It deletes only the Firestore item document. It does not delete Storage images in this phase. Deletion is blocked for ready closet items. The callable only allows deletion when the document is hidden or draft-like:

```text
isDraft === true
itemLifecycleStatus === "needs_review"
itemLifecycleStatus === "candidate"
itemLifecycleStatus === "failed"
draftState === "draft"
draftState === "photo_uploaded"
draftState === "failed"
ingestionStatus === "pending"
ingestionStatus === "failed"
ingestion.status === "pending"
ingestion.status === "failed"
```

All deletes are logged with `[AURA_DRAFT_AUDIT]`.
