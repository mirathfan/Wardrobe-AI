import { HttpsError } from "firebase-functions/v2/https";
import {
  applyAuraMetricEvent,
  buildAuraMetricsFromCollections,
  buildAuraResumeMetrics,
  createDefaultAuraMetrics,
  sanitizeMetricsPayload,
  validationSuccessRate,
} from "../metrics";
import {
  handleGetAuraMetrics,
  handleResetAuraMetrics,
} from "../metricsCallables";

describe("AURA metrics helpers", () => {
  it("builds the default metrics shape", () => {
    const metrics = createDefaultAuraMetrics("user-1");
    expect(metrics).toMatchObject({
      userId: "user-1",
      metricsVersion: 1,
      wardrobe: {
        readyVisibleItems: 0,
        embeddingCoveragePercent: 0,
      },
      retrieval: {
        totalRetrievals: 0,
      },
      agent: {
        modeCounts: {
          generate_outfit: 0,
          refine_outfit: 0,
          explain_outfit: 0,
          feedback: 0,
          unknown: 0,
        },
      },
    });
  });

  it("increments counters and updates averages", () => {
    let metrics = createDefaultAuraMetrics("user-1");
    metrics = applyAuraMetricEvent(metrics, {
      type: "retrieval_completed",
      latencyMs: 100,
      returnedCount: 4,
      categoryCounts: { top: 2, bottom: 1, footwear: 1 },
    });
    metrics = applyAuraMetricEvent(metrics, {
      type: "retrieval_completed",
      latencyMs: 300,
      returnedCount: 8,
      categoryCounts: { top: 4, bottom: 2, footwear: 2 },
    });

    expect(metrics.retrieval.totalRetrievals).toBe(2);
    expect(metrics.retrieval.successfulRetrievals).toBe(2);
    expect(metrics.retrieval.averageLatencyMs).toBe(200);
    expect(metrics.retrieval.averageReturnedItems).toBe(6);
    expect(metrics.retrieval.averageCandidateCountsByCategory.top).toBe(3);
  });

  it("increments mode counts and node timings", () => {
    const metrics = applyAuraMetricEvent(createDefaultAuraMetrics("user-1"), {
      type: "agent_run_completed",
      mode: "generate_outfit",
      durationMs: 1200,
      runner: "langgraph",
      nodeTimings: [
        { node: "classify_intent", durationMs: 20 },
        { node: "generate_outfits", durationMs: 700 },
      ],
    });

    expect(metrics.agent.totalAgentRuns).toBe(1);
    expect(metrics.agent.successfulAgentRuns).toBe(1);
    expect(metrics.agent.modeCounts.generate_outfit).toBe(1);
    expect(metrics.agent.langGraphRunCount).toBe(1);
    expect(metrics.agent.averageNodeTimings.generate_outfits).toBe(700);
  });

  it("calculates repair and validation rates", () => {
    let metrics = createDefaultAuraMetrics("user-1");
    metrics = applyAuraMetricEvent(metrics, {
      type: "outfit_generation_completed",
      requestedCount: 3,
      returnedCount: 2,
      averageOutfitScore: 0.82,
      averageStylePreferenceFit: 0.74,
      validationFailureCount: 1,
      repaired: true,
    });
    metrics = applyAuraMetricEvent(metrics, {
      type: "outfit_generation_failed",
      requestedCount: 3,
      zeroValidOutfits: true,
      code: "failed-precondition",
    });

    expect(metrics.outfitGeneration.totalGenerationRequests).toBe(2);
    expect(metrics.outfitGeneration.repairRate).toBe(0.5);
    expect(metrics.outfitGeneration.zeroValidOutfitFailures).toBe(1);
    expect(validationSuccessRate(metrics)).toBe(0.5);
  });

  it("sanitizes vectors and raw model payloads", () => {
    const sanitized = sanitizeMetricsPayload({
      total: 1,
      embeddingVector: [1, 2, 3],
      nested: {
        _values: [4, 5],
        rawOpenAIResponse: { output: "secret" },
        safeCount: 2,
      },
    });

    expect(JSON.stringify(sanitized)).not.toContain("embeddingVector");
    expect(JSON.stringify(sanitized)).not.toContain("_values");
    expect(JSON.stringify(sanitized)).not.toContain("rawOpenAIResponse");
    expect(sanitized).toEqual({ total: 1, nested: { safeCount: 2 } });
  });

  it("builds snapshot counts from existing user collections", () => {
    const metrics = buildAuraMetricsFromCollections("user-1", {
      items: [
        {
          id: "shirt-1",
          data: {
            itemLifecycleStatus: "ready",
            draftState: "ready",
            status: "AVAILABLE",
            ingestionStatus: "done",
            embeddingVector: [0.1],
          },
        },
        {
          id: "shoe-1",
          data: {
            itemLifecycleStatus: "ready",
            draftState: "ready",
            status: "AVAILABLE",
            ingestionStatus: "done",
          },
        },
      ],
      styleMemories: [
        { id: "m1", data: { active: true, polarity: "positive", source: "manual" } },
        { id: "m2", data: { active: true, polarity: "negative" } },
      ],
      savedOutfits: [
        { id: "s1", data: { active: true, source: "aura_agent" } },
        { id: "s2", data: { active: false, source: "aura_agent" } },
      ],
      outfitEvents: [
        { id: "p1", data: { active: true, source: "aura_agent", type: "planned", weatherWarnings: [{}] } },
        { id: "w1", data: { active: true, source: "aura_agent", type: "worn" } },
      ],
    });

    expect(metrics.wardrobe.readyVisibleItems).toBe(2);
    expect(metrics.wardrobe.indexedReadyItems).toBe(1);
    expect(metrics.styleMemory.activeMemories).toBe(2);
    expect(metrics.savedOutfits.totalSavedOutfits).toBe(1);
    expect(metrics.calendar.totalPlannedEvents).toBe(1);
    expect(metrics.calendar.weatherWarningsGenerated).toBe(1);
  });

  it("returns resume-ready metrics and bullets", () => {
    const metrics = createDefaultAuraMetrics("user-1");
    metrics.wardrobe.indexedReadyItems = 52;
    metrics.wardrobe.embeddingCoveragePercent = 100;
    metrics.outfitGeneration.returnedOutfitCountTotal = 24;
    metrics.agent.totalAgentRuns = 12;
    metrics.agent.langGraphRunCount = 12;
    metrics.savedOutfits.totalSavedOutfits = 4;
    metrics.calendar.totalWearEvents = 3;
    metrics.styleMemory.activeMemories = 8;
    metrics.styleMemory.totalFeedbackActions = 9;

    const resume = buildAuraResumeMetrics(metrics);
    expect(resume.wardrobeItemsIndexed).toBe(52);
    expect(resume.langGraphEnabled).toBe(true);
    expect(resume.resumeBullets.join(" ")).toContain("52 wardrobe items");
  });
});

describe("AURA metrics callables", () => {
  it("requires auth for getAuraMetrics", async () => {
    await expect(handleGetAuraMetrics(undefined)).rejects.toBeInstanceOf(HttpsError);
  });

  it("requires reset confirmation", async () => {
    await expect(handleResetAuraMetrics("user-1", { confirm: "NOPE" })).rejects.toMatchObject({
      code: "invalid-argument",
    });
  });
});
