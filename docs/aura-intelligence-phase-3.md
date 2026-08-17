# AURA Intelligence Phase 3: Closet Outfit Generation

Phase 3 builds closet-only outfit recommendations on top of Phase 2 Wardrobe RAG retrieval. It retrieves role-balanced candidates from the user's real ready closet items, sends only those candidates to OpenAI, validates the generated JSON, attaches full item details, and returns ranked outfit cards for developer testing.

This phase does not add LangChain, LangGraph, style memory, visual search, shopping recommendations, planner saves, feedback learning, or production UI.

For persistent style memory and feedback learning, see [AURA Intelligence Phase 4](./aura-intelligence-phase-4.md).

## Category-Balanced Retrieval

Phase 3 does not pass a flat top-12 retrieval list to the model. It builds a deterministic outfit retrieval plan and retrieves candidates by role:

- top
- bottom
- footwear
- outerwear
- accessory
- one_piece

For `"office outfit with black shoes"`, AURA decomposes the request into role-specific searches:

- top: office-safe shirts, button shirts, oxford shirts, polos, knit polos, overshirts
- bottom: trousers, chinos, tailored pants, clean dark jeans
- footwear: black loafers, black dress shoes, black derbies, clean black leather sneakers
- outerwear: blazer, overshirt, clean jacket, structured layer
- accessory: watch, belt, minimal accessory

The phrase `"black shoes"` applies black strongly to footwear only. It should not force the shirt, pants, or outerwear to be black.

## Callables

### `previewOutfitGenerationContext`

Authenticated callable. Does not call OpenAI.

Input:

```json
{
  "query": "office outfit with black shoes",
  "occasion": "office",
  "weather": "mild",
  "formality": "smart_casual"
}
```

Returns:

```json
{
  "query": "office outfit with black shoes",
  "retrievalPlan": {},
  "candidates": {
    "top": [],
    "bottom": [],
    "footwear": [],
    "outerwear": [],
    "accessory": [],
    "one_piece": []
  },
  "diagnostics": {
    "candidateCounts": {},
    "missingRequiredRoles": []
  }
}
```

### `generateOutfitRecommendations`

Authenticated callable. Builds context, calls OpenAI server-side, validates, optionally repairs once, and returns complete outfit recommendations.

Input:

```json
{
  "query": "office outfit with black shoes",
  "count": 3,
  "occasion": "office",
  "weather": "mild",
  "formality": "smart_casual",
  "preferredColors": [],
  "requiredColors": [],
  "includeDiagnostics": true
}
```

Response:

```json
{
  "query": "office outfit with black shoes",
  "retrievalPlan": {},
  "outfits": [
    {
      "outfitId": "outfit-1",
      "title": "Clean Smart Casual Office Fit",
      "vibe": "polished, minimal, smart casual",
      "occasion": "office",
      "formality": "smart_casual",
      "items": [
        {
          "itemId": "top_item_id",
          "role": "top",
          "name": "Light blue relaxed fit linen-blend shirt",
          "category": "top",
          "colors": ["blue"],
          "imageUrl": "https://example.com/top.jpg",
          "reason": "Clean office-safe top that balances the black shoes.",
          "aiMetadata": {}
        },
        {
          "itemId": "shoe_item_id",
          "role": "footwear",
          "name": "DRESS PENNY LOAFERS",
          "category": "footwear",
          "colors": ["black"],
          "imageUrl": "https://example.com/shoes.jpg",
          "reason": "Black loafers match the requested black shoes.",
          "aiMetadata": {}
        }
      ],
      "explanation": "This outfit is office-safe but not too formal.",
      "stylingTips": ["Tuck the shirt slightly"],
      "missingItems": [],
      "confidence": 0.91,
      "scoreBreakdown": {
        "categoryCompleteness": 1,
        "occasionFit": 1,
        "colorCoherence": 0.9,
        "colorCoherenceReasons": ["neutrals dominate", "repeated color anchor: black"],
        "formalityFit": 1,
        "targetFormality": 3,
        "itemEffectiveFormalities": [],
        "retrievalStrength": 0.91,
        "diversityScore": 1,
        "diversityPenalties": [],
        "penalties": [],
        "total": 0.96
      }
    }
  ],
  "diagnostics": {}
}
```

## Validation Rules

Generated outfits are validated before returning:

- every `itemId` must exist in the retrieved candidates
- no hallucinated item IDs
- no duplicate item IDs in the same outfit
- outfit must include `top + bottom + footwear` or `one_piece + footwear`
- explicit office/work/business/professional outfits reject tank/sleeveless tops unless layered
- explicit office/work/business/professional outfits reject sandals, slides, gym/running shoes, and loud athletic shoes unless explicitly requested
- rainy contexts warn on suede and avoid sandals where metadata is available
- confidence is clamped to `0..1`
- styling tips and missing items are capped at five

If validation fails and repair is enabled, AURA calls the model once more with validation errors and the same candidate list. It does not loop.

## Server Config

```text
AURA_OUTFIT_GENERATION_MODEL=gpt-5.4-mini
AURA_OUTFIT_GENERATION_MAX_CANDIDATES_PER_CATEGORY=8
AURA_OUTFIT_GENERATION_MAX_OUTFITS=3
AURA_OUTFIT_GENERATION_ENABLE_REPAIR=true
```

All model config stays server-side in Firebase Functions.

## Debug Panel

The developer-only `/dev/intelligence-debug` screen includes an Outfit Generation section:

- query
- count
- occasion
- weather
- formality
- diagnostics toggle
- Preview Outfit Context
- Generate Outfits
- quick tests for office, summer, date night, streetwear, smart casual dinner, and rainy day

Use `Preview Outfit Context` first to inspect role-balanced candidates. Then use `Generate Outfits` to call OpenAI and validate complete outfit recommendations.

## Phase 3.1 Tuning

Phase 3.1 improves recommendation quality without changing the production UI.

### Date-Night Intent

Date, dinner, evening, restaurant, and night-out queries now use elevated social styling language:

- elevated
- date night
- dinner
- night out
- sleek
- polished
- romantic
- refined
- textured
- dark tones
- leather
- subtle statement

Date-night-only plans should not include office/professional terms such as `black office shoes` or `clean professional shirt`. Office language is still used when the user explicitly asks for office, work, interview, business, professional, meeting, corporate, or workwear.

### Effective Formality

Scoring now uses effective formality instead of trusting raw `aiMetadata.formality` alone. Existing metadata can be stale or under-scored, so AURA derives a 1-5 score from role, canonical role, category, name, subcategory, material, and tags.

Examples:

- loafers, derbies, oxfords, and dress shoes score around 4
- polos, knit polos, linen shirts, button shirts, trousers, chinos, and tailored pants score around 3
- clean minimal leather sneakers score around 2.5-3
- graphic tees, jerseys, tank tops, running shoes, slides, and sandals score casual
- watches and leather belts score smart casual

`targetFormality` is derived from the request intent. Smart casual, office smart casual, dinner, and date night target roughly 3. Formal/business targets roughly 4. Casual, summer, vacation, and streetwear target roughly 1.5-2.

### Color Coherence

`scoreBreakdown.colorCoherence` now comes from a deterministic palette scorer with `colorCoherenceReasons`.

The scorer rewards:

- neutral palettes
- repeated color anchors
- coordinated shoes and belts
- light tops with darker bottoms/footwear
- one statement color balanced by neutrals

It normalizes color strings such as `light blue`, `blue / white`, `#111111`, `off white`, `cream`, `dark brown`, and `grey`.

### Outfit Diversity

After generation and validation, outfits are reranked with deterministic diversity scoring. The system penalizes repeated tops, repeated core outfits, and repeated footwear when alternatives exist. Reusing footwear is only lightly penalized when the closet has one viable footwear candidate. Accessories receive smaller reuse penalties.

The final score breakdown includes:

- `diversityScore`
- `diversityPenalties`
- diversity-adjusted `total`

### Metadata Cleanup

Phase 3.1 also improves Phase 1 deterministic metadata normalization so shirts do not remain categorized as `one_piece`.

Items such as linen shirts, resort shirts, button shirts, oxford shirts, camp-collar shirts, polos, t-shirts, football shirts, jerseys, utility shirts, and short-sleeved utility shirts normalize to `top`. Jackets, coats, puffers, blazers, racer jackets, shirt jackets, and shackets remain `outerwear`. Dresses, jumpsuits, and rompers remain `one_piece`. Oxford shirts and Oxford shoes are handled separately.

`AI_METADATA_VERSION` and `EMBEDDING_TEXT_VERSION` were bumped so affected items can be regenerated.

After deploy, run the full backfill from the debug panel:

1. Open `/dev/intelligence-debug`.
2. Set `force=true`.
3. Set `dryRun=true`.
4. Run `Backfill Entire Closet` and inspect indexed/skipped/failed items.
5. Set `dryRun=false`.
6. Run `Backfill Entire Closet` again to regenerate corrected metadata and embedding text.

### Debug Visibility

The dev-only debug panel now shows each outfit's total score, category completeness, occasion fit, color coherence, color coherence reasons, formality fit, target formality, retrieval strength, diversity score, diversity penalties, and validation penalties.

Each outfit item shows raw `aiMetadata.formality`, effective formality, canonical role, allowed role, source category, and `aiMetadata.category`. Warning chips highlight metadata category mismatches and large raw-vs-effective formality corrections.

## Testing Queries

- `office outfit with black shoes`: should retrieve black footwear without forcing all categories black.
- `summer casual outfit`: should favor breathable tops, shorts/light pants, and summer footwear.
- `date night outfit`: should favor elevated tops, trousers/dark denim, and polished footwear.
- `streetwear outfit`: should favor streetwear tops, cargos/denim, and sneakers.
- `rainy day outfit`: should avoid sandals and warn against rain-sensitive pieces where metadata exists.

## Limitations

- No style memory yet.
- No LangGraph or multi-step agent orchestration yet.
- No planner save action yet.
- No production user-facing outfit UI yet.
- Outfit quality still depends on item metadata, embeddings, and retrieval coverage.
