# AURA Phase 10: Metrics, Quality, and Resume Evidence

## What This Phase Adds

Phase 10 adds developer-facing aggregate metrics for AURA. The goal is to monitor quality, detect regressions, and generate resume-ready evidence without changing outfit generation behavior or adding invasive tracking.

Metrics are user-scoped and stored as a single aggregate document:

```text
users/{uid}/auraMetrics/main
```

## Metrics Model

The metrics document uses `metricsVersion: 1` and contains these groups:

- `wardrobe`: ready closet items, indexed items, missing embeddings, embedding coverage.
- `retrieval`: retrieval counts, success/failure counts, latency, returned item averages, category bucket averages.
- `outfitGeneration`: generation requests, returned outfit counts, average scores, validation failures, repairs.
- `agent`: agent runs, mode counts, average graph duration, node timing averages, LangGraph/internal runner counts.
- `styleMemory`: memory counts, feedback counts, average memories retrieved.
- `savedOutfits`: saved outfit counts and duplicate save attempts.
- `calendar`: wear/planned event counts and weather warnings.
- `reliability`: recent errors, errors by code, timeouts, fallbacks.

## Metric Events

The backend records small metric events and folds them into the aggregate document:

- `wardrobe_coverage_checked`
- `retrieval_completed`
- `retrieval_failed`
- `outfit_generation_completed`
- `outfit_generation_failed`
- `agent_run_completed`
- `agent_run_failed`
- `style_feedback_recorded`
- `style_memory_retrieved`
- `saved_outfit_created`
- `saved_outfit_duplicate`
- `wear_event_created`
- `planned_event_created`
- `weather_warning_generated`

Metric write failures are non-blocking. If a metric write fails, the user action still succeeds.

## Privacy Rules

Metrics do not store:

- raw prompts
- raw OpenAI responses
- raw chat transcripts
- embedding vectors
- `_values`
- diagnostics payloads
- `aiMetadata`
- auth tokens or secrets

Metrics may store:

- counts
- averages
- booleans
- mode names
- category counts
- requested/returned counts
- error codes
- timestamps

## Developer Callables

Added callable functions:

- `getAuraMetrics`: returns `users/{uid}/auraMetrics/main` or a default metrics object.
- `refreshAuraMetricsSnapshot`: recomputes current counts from Firestore. Supports `{ dryRun: true }`.
- `getAuraResumeMetrics`: returns a simplified metrics summary and resume bullets.
- `resetAuraMetrics`: resets the aggregate metrics document only. Requires `{ confirm: "RESET_AURA_METRICS" }`.

## Developer UI

The dev-only screen at `/dev/intelligence-debug` includes an **AURA Metrics** section with:

- Get Metrics
- Refresh Snapshot
- Dry Run Snapshot
- Get Resume Metrics
- Reset Metrics

It displays cards for wardrobe coverage, agent, outfit generation, style memory, saved/calendar, reliability, and resume bullets.

## Resume Metrics Output

`getAuraResumeMetrics` returns:

- `wardrobeItemsIndexed`
- `embeddingCoveragePercent`
- `generatedOutfitsCount`
- `agentRunsCount`
- `savedOutfitsCount`
- `wearEventsCount`
- `styleMemoriesCount`
- `feedbackActionsCount`
- `averageAgentLatencyMs`
- `validationSuccessRate`
- `repairRate`
- `langGraphEnabled`
- `featureSummary`
- `resumeBullets`

Example bullets include:

- Built a LangGraph-powered AI styling agent with wardrobe RAG, style memory, closet-only outfit generation, refinement, explanation, and feedback learning.
- Indexed wardrobe items with embedding coverage for retrieval-augmented outfit generation.
- Generated closet-based outfit recommendations with validation to prevent hallucinated items.
- Implemented feedback learning from likes, saves, wears, and dislikes.

## Manual QA Checklist

1. Open `/dev/intelligence-debug`.
2. Tap **Refresh Snapshot**.
3. Confirm wardrobe coverage, saved outfits, style memory, and calendar counts appear.
4. Generate an outfit in AURA.
5. Tap **Get Metrics** and confirm agent run / outfit generation counters increment.
6. Save an outfit.
7. Confirm saved outfit counters increment.
8. Tap Wore This.
9. Confirm wear event counters increment.
10. Use More Like This or Not My Vibe.
11. Confirm feedback counters increment.
12. Tap **Get Resume Metrics**.
13. Confirm resume bullets render and are copyable.
14. Inspect returned JSON and confirm no `embeddingVector`, `_values`, raw OpenAI response, or diagnostics payloads appear.
