# AURA Intelligence Phase 4: Style Memory + Feedback Learning

Phase 4 adds persistent style memory so AURA can learn from feedback such as likes, dislikes, saves, wears, "not my vibe", "more like this", "less like this", formality adjustments, color preferences, streetwear preferences, and item-level preferences.

This phase does not add LangChain, LangGraph, visual search, shopping recommendations, planner/calendar save, multi-agent workflows, or production feedback UI.

Next: [Phase 5 controlled styling agent](./aura-intelligence-phase-5.md).

## Phase 3.2 Tweak

Phase 4 includes a Phase 3.2 scoring fix for summer and resort casual outfits.

Outfit scoring now uses `targetFormalityRange` instead of a single target number. This prevents elevated vacation outfits from being unfairly penalized.

- beach or pool casual: `1.0-2.0`
- sightseeing or travel casual: `1.5-2.5`
- resort casual or elevated vacation: `2.0-3.2`
- summer or vacation dinner: `2.5-3.5`

The response includes:

- `targetFormality`
- `targetFormalityRange`
- `formalityFit`
- `formalityFitReason`

Good linen resort outfits with linen shirts, linen trousers, clean sneakers, loafers, sunglasses, or watches should usually score `formalityFit >= 0.75`.

## Style Memory Model

Style memories live under:

```text
users/{uid}/styleMemories/{memoryId}
```

Each memory contains:

- `type`: positive/negative preference, avoidance, occasion, color, fit, brand, category, formality, item affinity, or manual note
- `polarity`: `positive`, `negative`, or `neutral`
- `source`: outfit feedback, item feedback, saved outfit, worn outfit, manual, or debug
- `text` and `normalizedText`
- `strength`, `confidence`, and `reinforcementCount`
- extracted entities: item IDs, outfit ID, query, occasion, formality, colors, categories, style tags, fits, brands, materials, and subcategories
- `embeddingText`, `embeddingHash`, vector embedding, model, and dimensions
- lifecycle fields: `active`, timestamps, and soft-delete metadata

Embedding text is limited to style preference information. It should not include unrelated private user data.

## Style Profile Model

The deterministic aggregate profile lives at:

```text
users/{uid}/styleProfile/main
```

It contains weighted preferred and avoided signals for:

- colors
- style tags
- fits
- brands
- categories
- materials
- item affinities
- occasion profiles
- formality bias by occasion

The summary is deterministic, not LLM-summarized yet.

Example:

```text
Prefers smart casual, minimal; likes colors black, navy; likes categories footwear, top; avoids loud graphic.
```

## Feedback Types

Supported feedback:

- `like`
- `dislike`
- `save`
- `wear`
- `not_my_vibe`
- `more_like_this`
- `less_like_this`
- `too_formal`
- `too_casual`
- `more_formal`
- `more_casual`
- `more_streetwear`
- `less_streetwear`
- `more_color`
- `less_color`
- `prefer_item`
- `avoid_item`
- `manual_note`

Positive feedback creates positive preference or item affinity memories. Negative feedback creates negative preference or avoidance memories. Adjustment feedback creates targeted formality, color, or style-tag memories.

## Reinforcement

Style memory dedupe uses a deterministic fingerprint made from:

- user ID
- memory type
- polarity
- source
- occasion
- formality
- top normalized entities
- normalized text bucket

When a matching active memory already exists, AURA reinforces it instead of creating duplicates:

- increments `reinforcementCount`
- increases `strength` up to 5
- updates confidence and reinforcement timestamps

Likes and dislikes do not merge. Different occasions do not merge incorrectly.

## Memory Retrieval

`retrieveStyleMemoryContext` embeds the current query, searches the user's `styleMemories` subcollection, filters inactive memories, separates positive and negative memories, and returns the style profile summary/signals.

Callable responses never return `embeddingVector`. They may return `embeddingText`, scores, and diagnostics, but raw vectors stay server-side.

Generation uses the memory context as guidance, but it must never override the current user request.

## Phase 4.1 Memory Precision

Phase 4.1 narrows how negative memory affects outfit generation before Phase 2 RAG work expands retrieval.

Memory retrieval now applies occasion compatibility and returns diagnostics:

- `semanticScore`
- `occasionCompatibility`
- `finalMemoryScore`
- `diagnostics.excludedMemoryCount`
- `diagnostics.excludedMemoriesPreview`

Low-compatibility memories are excluded unless they are manual/global. For example, a disliked streetwear outfit should not steer office outfit generation.

Feedback semantics are now scoped:

- negative outfit feedback keeps exact item IDs and only distinctive outfit signals
- `too_formal` / `too_casual` only update formality preference
- `more_streetwear` / `less_streetwear` only update the `streetwear` style tag
- item feedback is item-only

Style profile aggregation now protects against broad negative blacklists. Generic categories (`top`, `bottom`, `footwear`, `accessory`, `one_piece`), generic colors (`black`, `white`, `blue`, `gray`, `beige`, `brown`, `navy`), generic materials, and generic style tags are not promoted into avoid lists unless explicitly requested.

The profile also tracks:

- `avoidedItemIds`
- `avoidedOutfitFingerprints`
- `occasionProfiles[].avoidedItemIds`
- `occasionProfiles[].formalityAdjustment`
- `formalityBiasByOccasion`

Outfit scoring now favors precision:

- exact liked items boost
- exact disliked items penalize
- negative memories penalize only exact item overlap or multiple distinctive matching signals
- generic category-only matches do not penalize outfits
- occasion mismatch reduces memory impact
- score breakdown includes `formalityBiasApplied` and `formalityBiasReason`

## Outfit Generation Integration

`generateOutfitRecommendations` accepts:

```json
{
  "useStyleMemory": true
}
```

Default is `true`.

When enabled:

1. AURA builds the outfit retrieval plan.
2. AURA retrieves closet candidates.
3. AURA retrieves relevant style memories.
4. AURA adds positive memories, negative memories, and profile summary/signals to the prompt.
5. AURA scores returned outfits with deterministic style preference scoring.

The score breakdown includes:

- `stylePreferenceFit`
- `styleMemoryReasons`
- `memoryBoosts`
- `memoryPenalties`

Explicit request constraints win over conflicting memories. For example, if the user asks for black shoes, an old "avoid black" memory should not penalize black footwear for that request.

## Callables

- `recordOutfitFeedback`
- `retrieveStyleMemoryContext`
- `getStyleProfile`
- `rebuildStyleProfileFromMemories`
- `listStyleMemories`
- `deleteStyleMemory`
- `softDeleteAllStyleMemories`

`deleteStyleMemory` is a safe soft delete and requires:

```json
{
  "confirm": "DELETE_STYLE_MEMORY"
}
```

`softDeleteAllStyleMemories` is a developer cleanup callable for the signed-in user only. It soft-deletes active memories, resets the default style profile, and requires:

```json
{
  "confirm": "SOFT_DELETE_ALL_STYLE_MEMORIES"
}
```

## Debug Panel

The developer-only `/dev/intelligence-debug` screen includes a Style Memory section.

Use it to:

- record feedback on the last generated outfit
- add manual style memory notes
- retrieve memory context
- get the style profile
- rebuild the style profile as dry run or write
- list recent memories
- soft-delete a memory by ID
- inspect memory relevance diagnostics
- warn on suspicious broad avoided categories/colors
- soft-delete all debug style memories

Generated outfit cards include feedback buttons for like, dislike, save, wear, not my vibe, more/less like this, too formal/casual, more/less streetwear, and more/less color.

## Phase 4.1 Retest

1. Open `/dev/intelligence-debug`.
2. Generate an office outfit and record `Like`; verify `recordOutfitFeedback` omits `embeddingVector`.
3. Generate or record a streetwear outfit and press `Not my vibe`; verify the memory keeps exact item IDs and distinctive signals only.
4. Retrieve memories for `office outfit`; verify streetwear negatives appear in `excludedMemoriesPreview`.
5. Retrieve memories for `streetwear outfit`; verify the streetwear negative is returned.
6. Press `Get Style Profile`; verify no suspicious broad avoided category/color warning appears after rebuilding.
7. Press `Rebuild Style Profile Write` if old broad signals are present.
8. Use `Delete All Debug Memories` only when resetting debug data for the signed-in user.

## Vector Index

Style memories use Firestore vector search.

Create a vector index for:

```text
Collection group: styleMemories
Vector field: embeddingVector
Dimension: 2048
Distance: COSINE
```

If using direct user subcollection indexes in the Firebase console, use:

```text
users/{uid}/styleMemories
embeddingVector
2048 dimensions
COSINE
```

When the index is missing, AURA surfaces:

```text
Style memory vector index required.
```

## Privacy Notes

Style memory embedding text should contain only wardrobe/style preference data needed for personalization. Do not add unrelated private user information to style memories.

## Limitations

- LangGraph-style orchestration begins in Phase 5 with a controlled internal graph runner.
- No LangChain orchestration.
- No visual search.
- No production feedback UI yet.
- No shopping gap detector.
- No planner/calendar save.
- Memories are deterministic and not LLM-summarized yet.
