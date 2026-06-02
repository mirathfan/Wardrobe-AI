import {
  buildAgentResponse,
  buildExplanationFromOutfit,
  buildFeedbackResponse,
  buildStyleMemorySummary,
  sanitizeAgentResponse,
} from "../agentResponse";
import { classifyAuraStylingAgentIntent } from "../agentIntent";
import type { AuraStylingAgentState } from "../agentTypes";
import type { StyleMemoryContextResponse, StyleProfile } from "../styleMemoryTypes";
import type { ValidatedOutfit } from "../outfitTypes";

function profile(): StyleProfile {
  return {
    userId: "uid",
    summary: "Prefers polished outfits.",
    preferredColors: [],
    avoidedColors: [],
    preferredStyleTags: [],
    avoidedStyleTags: [],
    preferredFits: [],
    avoidedFits: [],
    preferredBrands: [],
    avoidedBrands: [],
    preferredCategories: [],
    avoidedCategories: [],
    preferredMaterials: [],
    avoidedMaterials: [],
    itemAffinities: [],
    avoidedItemIds: [],
    avoidedOutfitFingerprints: [],
    occasionProfiles: {},
    formalityBiasByOccasion: {},
    memoryCount: 2,
    positiveMemoryCount: 1,
    negativeMemoryCount: 1,
    profileVersion: 1,
  };
}

function styleMemory(): StyleMemoryContextResponse {
  const leakedMemory = {
    id: "pos",
    userId: "uid",
    fingerprint: "pos",
    type: "positive_preference",
    polarity: "positive",
    source: "outfit_feedback",
    text: "likes loafers",
    normalizedText: "likes loafers",
    strength: 3,
    confidence: 0.8,
    entities: {
      itemIds: [],
      colors: [],
      categories: [],
      styleTags: [],
      fits: [],
      brands: [],
      materials: [],
      subcategories: [],
    },
    reinforcementCount: 1,
    embeddingText: "likes loafers",
    embeddingHash: "hash",
    embeddingVector: [1, 2, 3],
    embeddingModel: "test",
    embeddingDimensions: 3,
    active: true,
  } as unknown as StyleMemoryContextResponse["positiveMemories"][number];
  return {
    query: "office outfit",
    memoryQueryText: "office outfit",
    positiveMemories: [leakedMemory],
    negativeMemories: [],
    profileSummary: "Prefers polished outfits.",
    profileSignals: profile(),
  };
}

function outfit(): ValidatedOutfit {
  return {
    outfitId: "outfit-1",
    title: "Clean Office Fit",
    vibe: "polished",
    occasion: "office",
    formality: "smart_casual",
    items: [{
      itemId: "shirt",
      role: "top",
      reason: "clean top",
      name: "White shirt",
      category: "top",
      colors: ["white"],
      imageUrl: null,
      aiMetadata: { category: "top", embeddingVector: [1, 2, 3] },
    }],
    explanation: "A clean office outfit.",
    stylingTips: [],
    missingItems: [],
    confidence: 0.91,
    scoreBreakdown: {
      categoryCompleteness: 1,
      occasionFit: 1,
      colorCoherence: 1,
      colorCoherenceReasons: [],
      formalityFit: 1,
      targetFormality: 3,
      targetFormalityRange: [2, 4],
      formalityFitReason: "matches",
      formalityBiasApplied: 0,
      formalityBiasReason: "none",
      itemEffectiveFormalities: [],
      retrievalStrength: 1,
      stylePreferenceFit: 1,
      styleMemoryReasons: [],
      memoryBoosts: [],
      memoryPenalties: [],
      diversityScore: 1,
      diversityPenalties: [],
      penalties: [],
      total: 1,
    },
  };
}

function state(): AuraStylingAgentState {
  const request = {
    query: "office outfit",
    includeDiagnostics: true,
  };
  return {
    uid: "uid",
    request,
    intent: classifyAuraStylingAgentIntent(request),
    styleMemory: styleMemory(),
    outfits: [outfit()],
    diagnostics: {
      graphRunId: "run",
      runner: "langgraph",
      langGraphEnabled: true,
      graphVersion: "phase-5-langgraph-v1",
      maxSteps: 10,
      mode: "generate_outfit",
      steps: [],
      nodesExecuted: [],
      nodeTimings: [],
      warnings: [],
      errors: [],
    },
  };
}

describe("agent response helpers", () => {
  it("builds an outfit response with message, actions, and outfits", () => {
    const response = buildAgentResponse(state());

    expect(response.message).toContain("Clean Office Fit");
    expect(response.suggestedActions.map((action) => action.id)).toContain("explain");
    expect(response.outfits).toHaveLength(1);
  });

  it("summarizes style memory and strips vectors from the response", () => {
    const response = buildAgentResponse(state());
    const serialized = JSON.stringify(response);

    expect(response.styleMemorySummary?.positiveMemoryCount).toBe(1);
    expect(serialized).not.toContain("embeddingVector");
  });

  it("builds explanations from previous outfit rationales and scores", () => {
    const explanation = buildExplanationFromOutfit(outfit());

    expect(explanation.title).toBe("Clean Office Fit");
    expect(explanation.itemRationales[0]).toMatchObject({
      itemId: "shirt",
      role: "top",
      reason: "clean top",
    });
    expect(explanation.scoreBreakdown?.total).toBe(1);
  });

  it("builds feedback responses", () => {
    const nextState = {
      ...state(),
      intent: classifyAuraStylingAgentIntent({
        mode: "feedback",
        query: "not my vibe",
        feedbackType: "not_my_vibe",
      }),
      feedbackResult: { written: 1 },
    };
    const response = buildFeedbackResponse(nextState);

    expect(response.feedback?.recorded).toBe(true);
    expect(response.feedback?.feedbackType).toBe("not_my_vibe");
  });

  it("sanitizes nested vector-like fields", () => {
    const result = sanitizeAgentResponse({
      ok: true,
      embeddingVector: [1, 2, 3],
      _values: [9],
      queryVector: [8],
      nested: {
        rawVector: [4, 5],
        vector: [6, 7],
        keep: "value",
      },
    });

    expect(result).toEqual({
      ok: true,
      nested: {
        keep: "value",
      },
    });
    expect(JSON.stringify(result)).not.toContain("queryVector");
  });

  it("returns warning-only memory summaries when retrieval is unavailable", () => {
    const summary = buildStyleMemorySummary(null, ["Style memory unavailable"]);

    expect(summary?.positiveMemoryCount).toBe(0);
    expect(summary?.warnings).toEqual(["Style memory unavailable"]);
  });
});
