# AURA Phase 10.1 Offline Evals

## Why This Exists

AURA already tracks aggregate production counters, but counters do not prove outfit quality. The offline eval harness gives us a repeatable golden set for checking retrieval relevance, outfit completeness, hallucination rate, style-memory influence, and agent regressions before prompt, retrieval, or scoring changes ship.

The harness is developer-only. It uses synthetic closet fixtures, does not run for normal users, does not touch Firestore, and does not store raw model or judge responses in user data.

## Golden Set Schema

Eval cases live in `functions/src/ai/wardrobeIntelligence/evals/evalCases.ts`.

Each case includes:

```ts
{
  id: string;
  name: string;
  query: string;
  occasion?: string;
  formality?: string;
  weather?: string;
  closetFixtureId: string;
  previousOutfitItemIds?: string[];
  styleMemory?: {
    dislikedOutfitItemIds?: string[];
    dislikedStyleTags?: string[];
    positiveStyleTags?: string[];
  };
  expected: {
    requiredRoles: OutfitRole[];
    preferredCategories?: string[];
    preferredSubcategories?: string[];
    preferredColors?: string[];
    avoidedSubcategories?: string[];
    avoidedStyleTags?: string[];
    mustIncludeItemNames?: string[];
    mustNotIncludeItemNames?: string[];
    expectedMode?: AuraStylingAgentMode;
    expectedCount?: number;
    expectedOccasionPatterns?: string[];
    expectedFormality?: string;
    notes: string;
  };
}
```

The initial fixture closet includes blue polos/shirts, black trousers and jeans, black loafers, sneakers, sandals, racer jacket, graphic tee, cap, watch, belt, linen resort shirt, and white linen trousers.

## Retrieval Eval Metrics

Retrieval evals are deterministic and do not call OpenAI or Firestore. The fixture items are scored by query and expectation overlap.

Metrics:

- `precisionAt5`
- `precisionAt10`
- `requiredRoleCoverage`
- `forbiddenViolations`
- `averageRelevantScore`
- `categoryBalance`

## Outfit Generation Eval Metrics

Generation evals use the real outfit validation pipeline with a mocked model response. This catches hallucinated item IDs, missing roles, forbidden items, validation failures, and repair-rate changes without calling OpenAI.

Metrics:

- `closetOnlyItemRate`
- `hallucinatedItemCount`
- `requiredRoleCoverage`
- `categoryCompleteness`
- `forbiddenItemViolations`
- `occasionFitHeuristic`
- `formalityFit`
- `colorCoherence`
- `validationPassRate`
- `repairRate`

## Agent Regression Evals

Agent evals use the deterministic intent classifier plus a production-shaped response. They check:

- mode
- requested count
- occasion/formality inference
- generated outfit count
- suggested action presence
- no vector leakage
- no diagnostics leakage
- no singular “one option” copy when multiple outfits are returned

## Optional LLM Judge

By default, the LLM judge is disabled.

Enable it only for local developer runs:

```sh
AURA_EVAL_USE_LLM_JUDGE=true npm run eval:aura -- --judge
```

The judge receives only synthetic fixture data and sanitized outfit summaries. The harness parses the JSON response and writes the parsed scores only; it does not store raw OpenAI responses.

Judge scores:

- occasion appropriateness
- outfit coherence
- style quality
- weather suitability
- user request satisfaction
- closet-only faithfulness
- overall score

## How To Run

From `functions`:

```sh
npm run eval:aura
```

Useful options:

```sh
npm run eval:aura -- --suite retrieval
npm run eval:aura -- --suite generation
npm run eval:aura -- --suite agent
npm run eval:aura -- --case office-black-shoes
npm run eval:aura -- --output reports/aura-eval-report.json
```

## Report Output

Reports are written locally:

- `functions/reports/aura-eval-report.json`
- `functions/reports/aura-eval-report.md`

The Markdown report includes:

- total cases
- pass rate
- average scores
- failed cases
- failure reasons
- regression notes
- timestamp

## How To Add New Cases

1. Add or reuse synthetic closet items in `closetFixtures.ts`.
2. Add a new case in `evalCases.ts`.
3. Add expected roles, preferred/avoided subcategories, and any count/mode expectations.
4. Add a canned outfit plan in `evalRunner.ts`.
5. Run `npm run eval:aura`.
6. Keep failures intentional and documented when adding harder cases.

## Resume Value

This harness gives concrete quality metrics to report:

- validation success rate
- hallucination rate
- outfit quality score
- retrieval Precision@K
- regression pass rate
- optional LLM judge score

It also makes future prompt and retrieval changes measurable instead of vibe-based.

## Phase 10.2 Hard Evals And Gates

Phase 10.2 adds a harder suite for sparse closets, missing footwear, conflicting memories, ambiguous prompts, capped counts, weather conflicts, bad metadata, duplicate avoidance, disliked exact outfits, no-ready-item closets, casual-only formal requests, and vector leakage regressions.

Case suites:

- `standard`: the original golden set.
- `hard`: messy closets and edge cases.

Fixture variants now include:

- `sparseOfficeCloset`
- `missingFootwearCloset`
- `weatherConflictCloset`
- `badMetadataCloset`
- `draftOnlyCloset`
- `casualOnlyCloset`
- `diverseOfficeCloset`

## Phase 10.2 Commands

Run standard plus hard:

```sh
npm run eval:aura
```

Run only standard:

```sh
npm run eval:aura -- --suite standard
```

Run only hard:

```sh
npm run eval:aura -- --suite hard
```

Run one case:

```sh
npm run eval:aura -- --case missing-footwear
```

Run the regression gate:

```sh
npm run eval:aura:gate
```

Compare before/after reports:

```sh
npm run eval:aura:compare -- --before reports/before.json --after reports/after.json
```

## Gate Thresholds

Standard suite:

- pass rate >= 0.95
- hallucination rate = 0
- vector leakage = 0
- average overall score >= 0.8

Hard suite:

- pass rate >= 0.75
- hallucination rate = 0
- vector leakage = 0
- graceful failure rate for impossible cases >= 0.9
- average overall score >= 0.65

Critical failures always fail the gate:

- hallucinated item ID
- vector leakage
- raw model response leakage
- hidden/draft item selected
- unhandled eval crash

## Comparison Reports

The compare command writes:

- `functions/reports/aura-eval-comparison.md`

It shows:

- pass rate delta
- average score delta
- hallucination delta
- repair rate delta
- validation failure delta
- changed verdicts
- improved cases
- regressed cases

## Interpreting Failures

Read failures in this order:

1. Critical failures: fix immediately.
2. Standard suite failures: usually block prompt/retrieval changes.
3. Hard suite failures: acceptable only if the gate still passes and the failure is a known product limitation.
4. Score deltas: compare before/after when a case still passes but quality shifts.

Run the gate before changing:

- prompts
- retrieval scoring
- metadata normalization
- style memory scoring
- validation rules

## Adding A Hard Case

1. Add a synthetic fixture or fixture variant in `closetFixtures.ts`.
2. Add a `suite: "hard"` case in `evalCases.ts`.
3. Include required roles, preferred/avoided subcategories, and any expected count/mode behavior.
4. Add the canned outfit plan in `evalRunner.ts`.
5. Add a focused test if it covers a new failure class.
6. Run `npm run eval:aura:gate`.
