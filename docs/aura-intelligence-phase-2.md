# AURA Intelligence Phase 2: Wardrobe RAG Retrieval

Phase 2 adds a retrieval-only wardrobe context engine. It turns a user styling request into deterministic retrieval text, embeds that text with the same Phase 1 embedding pipeline, searches the signed-in user's closet item vectors, and returns ranked ready items for future RAG and outfit workflows.

This phase does not generate outfits, call a chat model, use LangChain/LangGraph, add style memory, add visual embeddings, or perform shopping.

Phase 3 builds on this retrieval layer with role-balanced closet outfit generation. See [AURA Intelligence Phase 3](./aura-intelligence-phase-3.md).

## Callable

`retrieveWardrobeContext`

Input:

```json
{
  "query": "office outfit with black shoes",
  "limit": 12,
  "occasion": "office",
  "categories": ["top", "bottom", "footwear"],
  "styleTags": ["minimal"],
  "colors": ["black"],
  "weather": "mild",
  "formality": "smart_casual",
  "includeDiagnostics": true
}
```

Response:

```json
{
  "query": "office outfit with black shoes",
  "retrievalQueryText": "Request: office outfit with black shoes. Occasion: office. Formality: smart casual. Categories: top, bottom, footwear. Colors: black. Requested style tags: minimal. Style: clean, polished, professional, smart casual, trousers, loafers, button shirts, polos, overshirts, minimal sneakers, black, leather, boots, footwear, tops, shirts, tees, knits, bottoms, pants, jeans, shorts, shoes, sneakers, sandals.",
  "limit": 12,
  "results": [
    {
      "itemId": "loafers-1",
      "name": "Black leather loafers",
      "category": "footwear",
      "subcategory": "loafer",
      "brand": "G.H. Bass",
      "colors": ["black"],
      "score": 1,
      "vectorScore": 0.84,
      "finalScore": 1,
      "boostsApplied": ["boosted: loafer matches smart casual office"],
      "penaltiesApplied": [],
      "distance": 0.16,
      "reason": "matches black color; matches footwear category; fits office occasion; boosted: loafer matches smart casual office",
      "imageUrl": "https://example.com/loafers.jpg",
      "aiMetadata": {},
      "embeddingTextPreview": "Category: shoes. Subcategory: loafer...",
      "status": "AVAILABLE",
      "itemLifecycleStatus": "ready"
    }
  ],
  "categoryBuckets": {
    "top": [],
    "bottom": [],
    "footwear": [],
    "outerwear": [],
    "accessory": [],
    "one_piece": [],
    "unknown": []
  },
  "diagnostics": {
    "vectorField": "embeddingVector",
    "distanceMeasure": "COSINE",
    "distanceResultField": "vectorDistance",
    "rawVectorLimit": 36,
    "rawResultCount": 36,
    "readyResultCount": 30,
    "filteredResultCount": 12,
    "returnedResultCount": 12,
    "embeddingDimensions": 2048
  }
}
```

## How Retrieval Works

1. The callable requires Firebase Auth and only searches `users/{uid}/items`.
2. `buildWardrobeRetrievalQueryText` deterministically expands the request with occasion, weather, formality, category, color, style, and synonym hints.
3. The expanded retrieval text is embedded by `createTextEmbedding`, reusing the Phase 1 embedding model and dimensions.
4. Firestore vector search runs against `embeddingVector` with COSINE distance.
5. Results are filtered to ready visible closet items only, using Phase 1 draft-audit readiness rules.
6. Optional category, color, and style filters are applied after vector search.
7. Office/work/smart-casual/formal queries apply deterministic boosts and penalties after vector search.
8. The callable returns flat ranked `results`, bucketed results, and optional diagnostics.

## Retrieval Scoring

Each result includes:

- `vectorScore`: the original score derived from Firestore COSINE distance.
- `score` and `finalScore`: the post-processed score used for ranking.
- `boostsApplied`: deterministic boosts such as `boosted: loafer matches smart casual office`.
- `penaltiesApplied`: deterministic penalties such as `penalized: sleeveless top is weak for office`.

For office/work/smart-casual/formal queries, AURA boosts office-ready pieces such as loafers, derbies, oxfords, trousers, button shirts, oxford shirts, polos, knit polos, overshirts, and blazers. It penalizes weak office matches such as tank tops, vest tops, sleeveless tops, graphic tees, athletic tops, sandals, slides, running shoes, gym shoes, and loud sneakers. Casual and streetwear queries do not use these office-specific penalties.

## Ready Filtering

Retrieval only returns items that:

- are not drafts
- have `itemLifecycleStatus: "ready"`
- have `draftState: "ready"`
- have a visible closet status such as `AVAILABLE`, `WORN`, or `IN_LAUNDRY`
- have completed ingestion
- have an `embeddingVector`

Hidden drafts, needs-review items, failed ingestions, and items missing vectors are excluded.

## Vector Index Notes

Firestore may require a vector index for `users/{uid}/items` on:

- vector field: `embeddingVector`
- distance measure: `COSINE`

If the index is missing, `retrieveWardrobeContext` returns a `failed-precondition` callable error with the original Firestore message and a `firestore_vector_index_required` detail code.

## Debug Panel

The developer-only screen at `/dev/intelligence-debug` includes a Wardrobe Retrieval section with:

- query
- limit
- occasion
- weather
- formality
- categories
- style tags
- colors
- diagnostics toggle
- quick test prompts

It shows a retrieval summary, category bucket counts, result cards, and the raw response JSON. The entire screen is gated behind `__DEV__`.

Result cards show vector score, final score, boosts, penalties, display category, `aiMetadata.category`, and a warning badge when the display category conflicts with normalized metadata.

## Reindexing After Quality Updates

The footwear normalization and formality changes bumped:

```text
AI_METADATA_VERSION=2
EMBEDDING_TEXT_VERSION=2
```

After deploy, reindex ready closet items so stored `aiMetadata`, `embeddingText`, and embedding hashes reflect the corrected category and formality rules.

Recommended debug flow:

1. Open `/dev/intelligence-debug`.
2. Run `Backfill Entire Closet` with `Dry run` enabled and `Force` enabled.
3. If the dry run looks correct, disable `Dry run`, keep `Force` enabled, and run the backfill.
4. Preview or reindex the item `DRESS PENNY LOAFERS` and verify `aiMetadata.category` is `shoes`, with the retrieval bucket displayed as `footwear`.
5. Run the quick test `Office outfit with black shoes` and verify tank tops no longer outrank loafers/trousers for the office query.

## Limitations

This is retrieval infrastructure only. Batch retrieval, outfit assembly, RAG prompt construction, LLM chat, style memory, visual similarity, and shopping recommendations are intentionally deferred.
