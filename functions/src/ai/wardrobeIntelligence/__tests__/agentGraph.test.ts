import { HttpsError } from "firebase-functions/v2/https";
import {
  createAuraStylingAgentLangGraph,
  runAuraStylingAgentGraph,
} from "../agentGraph";
import type { AuraAgentDeps } from "../agentNodes";
import type {
  OutfitCandidate,
  OutfitCandidateBuckets,
  OutfitGenerationContext,
  OutfitRole,
  ValidatedOutfit,
} from "../outfitTypes";
import type { StyleMemoryContextResponse, StyleProfile } from "../styleMemoryTypes";

function candidate(itemId: string, role: OutfitRole, name: string): OutfitCandidate {
  return {
    itemId,
    name,
    role,
    canonicalRole: role,
    allowedRole: role,
    sourceRole: role,
    sourceCategory: role,
    sourceAiMetadataCategory: role,
    category: role === "footwear" ? "footwear" : role,
    colors: ["black"],
    score: 0.9,
    vectorScore: 0.9,
    finalScore: 0.9,
    reason: "test candidate",
    imageUrl: null,
    aiMetadata: { category: role, styleTags: ["minimal"], occasionTags: ["office"] },
    embeddingTextPreview: null,
    status: "AVAILABLE",
  };
}

function context(): OutfitGenerationContext {
  const candidates: OutfitCandidateBuckets = {
    top: [candidate("shirt", "top", "White shirt")],
    bottom: [candidate("pants", "bottom", "Black trousers")],
    footwear: [candidate("loafers", "footwear", "Black loafers")],
    outerwear: [],
    accessory: [],
    one_piece: [],
  };
  return {
    retrievalPlan: {
      intent: {
        occasion: "office",
        formality: "smart_casual",
        styleHints: ["polished"],
        colorHints: ["black"],
        categorySpecificConstraints: { footwear: ["black"] },
      },
      categoryQueries: {
        top: "office top",
        bottom: "office bottom",
        footwear: "office black footwear",
        outerwear: "office outerwear",
        accessory: "office accessory",
        one_piece: "office one piece",
      },
    },
    candidates,
    diagnostics: {
      candidateLimitPerCategory: 8,
      rawLimitPerCategory: 24,
      missingRequiredRoles: [],
      candidateCounts: {
        top: 1,
        bottom: 1,
        footwear: 1,
        outerwear: 0,
        accessory: 0,
        one_piece: 0,
      },
      categoryQueries: {
        top: "office top",
        bottom: "office bottom",
        footwear: "office black footwear",
        outerwear: "office outerwear",
        accessory: "office accessory",
        one_piece: "office one piece",
      },
    },
  };
}

function outfit(): ValidatedOutfit {
  return {
    outfitId: "outfit-1",
    title: "Clean Office Fit",
    vibe: "polished",
    occasion: "office",
    formality: "smart_casual",
    items: [
      {
        itemId: "shirt",
        role: "top",
        reason: "clean top",
        name: "White shirt",
        category: "top",
        colors: ["white"],
        imageUrl: null,
        aiMetadata: { category: "top" },
      },
      {
        itemId: "loafers",
        role: "footwear",
        reason: "black shoes",
        name: "Black loafers",
        category: "footwear",
        colors: ["black"],
        imageUrl: null,
        aiMetadata: { category: "footwear" },
      },
    ],
    explanation: "A clean office outfit.",
    stylingTips: ["Tuck the shirt"],
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
    memoryCount: 0,
    positiveMemoryCount: 0,
    negativeMemoryCount: 0,
    profileVersion: 1,
  };
}

function styleMemory(): StyleMemoryContextResponse {
  return {
    query: "office outfit",
    memoryQueryText: "office outfit",
    positiveMemories: [],
    negativeMemories: [],
    profileSummary: "Prefers polished outfits.",
    profileSignals: profile(),
  };
}

function deps(overrides: Partial<AuraAgentDeps> = {}) {
  const calls: string[] = [];
  const base: AuraAgentDeps = {
    retrieveStyleMemory: async () => {
      calls.push("memory");
      return styleMemory();
    },
    retrieveOutfitContext: async () => {
      calls.push("context");
      return context();
    },
    generateOutfits: async ({ input }) => {
      calls.push(`generate:${input.query}`);
      return {
        outfits: [outfit()],
        validationErrors: [],
        validationWarnings: [],
        repaired: false,
      };
    },
    recordFeedback: async () => {
      calls.push("feedback");
      return { written: 1 };
    },
    ...overrides,
  };
  return { calls, deps: base };
}

describe("runAuraStylingAgentGraph", () => {
  const originalUseLangGraph = process.env.AURA_AGENT_USE_LANGGRAPH;

  afterEach(() => {
    if (originalUseLangGraph === undefined) {
      delete process.env.AURA_AGENT_USE_LANGGRAPH;
    } else {
      process.env.AURA_AGENT_USE_LANGGRAPH = originalUseLangGraph;
    }
  });

  it("compiles the LangGraph graph", () => {
    const graph = createAuraStylingAgentLangGraph(deps().deps);

    expect(graph).toBeDefined();
  });

  it("runs the generate path through memory, context, generation, and response nodes", async () => {
    const harness = deps();
    const response = await runAuraStylingAgentGraph("uid", {
      query: "office outfit with black shoes",
      includeDiagnostics: true,
    }, harness.deps);

    expect(response.mode).toBe("generate_outfit");
    expect(response.outfits).toHaveLength(1);
    expect(harness.calls).toEqual(expect.arrayContaining(["memory", "context"]));
    expect(harness.calls.some((call) => call.startsWith("generate:office outfit with black shoes"))).toBe(true);
    expect(response.diagnostics?.steps).toEqual([
      "classify_intent",
      "retrieve_style_memory",
      "retrieve_outfit_context",
      "generate_outfits",
      "build_agent_response",
    ]);
    expect(response.diagnostics?.nodesExecuted).toEqual(response.diagnostics?.steps);
    expect(response.diagnostics?.runner).toBe("langgraph");
    expect(response.diagnostics?.langGraphEnabled).toBe(true);
    expect(response.diagnostics?.graphVersion).toBe("phase-5-langgraph-v1");
  });

  it("skips style memory retrieval when disabled", async () => {
    const harness = deps();
    const response = await runAuraStylingAgentGraph("uid", {
      query: "office outfit",
      useStyleMemory: false,
      includeDiagnostics: true,
    }, harness.deps);

    expect(response.mode).toBe("generate_outfit");
    expect(harness.calls).not.toContain("memory");
    expect(harness.calls).toContain("context");
  });

  it("continues without memory when the style memory vector index is missing", async () => {
    const harness = deps({
      retrieveStyleMemory: async () => {
        throw new HttpsError("failed-precondition", "style memory vector index is not ready");
      },
    });
    const response = await runAuraStylingAgentGraph("uid", {
      query: "office outfit",
      includeDiagnostics: true,
    }, harness.deps);

    expect(response.outfits).toHaveLength(1);
    expect(response.diagnostics?.warnings.join(" ")).toContain("Style memory unavailable");
  });

  it("fails when wardrobe retrieval fails", async () => {
    const harness = deps({
      retrieveOutfitContext: async () => {
        throw new HttpsError("internal", "wardrobe retrieval failed");
      },
    });

    await expect(runAuraStylingAgentGraph("uid", {
      query: "office outfit",
    }, harness.deps)).rejects.toThrow("wardrobe retrieval failed");
  });

  it("explains a previous outfit without retrieval or generation", async () => {
    const harness = deps();
    const response = await runAuraStylingAgentGraph("uid", {
      mode: "explain_outfit",
      query: "why does this work?",
      previousOutfit: outfit() as unknown as Record<string, unknown>,
      includeDiagnostics: true,
    }, harness.deps);

    expect(response.mode).toBe("explain_outfit");
    expect(response.explanation?.itemRationales).toHaveLength(2);
    expect(harness.calls).toEqual([]);
    expect(response.diagnostics?.steps).toEqual(["classify_intent", "build_explanation_response"]);
  });

  it("adds refinement instructions to the generated outfit query", async () => {
    const harness = deps();
    const response = await runAuraStylingAgentGraph("uid", {
      mode: "refine_outfit",
      query: "make it less formal",
      previousOutfit: outfit() as unknown as Record<string, unknown>,
      includeDiagnostics: true,
    }, harness.deps);

    expect(harness.calls.some((call) => call.includes("Refinement request: make it less formal"))).toBe(true);
    expect(response.diagnostics?.steps).toEqual([
      "classify_intent",
      "resolve_refinement_context",
      "retrieve_style_memory",
      "retrieve_outfit_context",
      "generate_outfits",
      "build_agent_response",
    ]);
  });

  it("records feedback through the style memory path", async () => {
    const harness = deps();
    const response = await runAuraStylingAgentGraph("uid", {
      mode: "feedback",
      query: "not my vibe",
      feedbackType: "not_my_vibe",
      previousOutfit: outfit() as unknown as Record<string, unknown>,
      includeDiagnostics: true,
    }, harness.deps);

    expect(harness.calls).toEqual(["feedback"]);
    expect(response.feedback?.recorded).toBe(true);
    expect(response.diagnostics?.steps).toEqual([
      "classify_intent",
      "record_feedback",
      "build_feedback_response",
    ]);
  });

  it("keeps the LangGraph path under the max step budget", async () => {
    const harness = deps();
    const response = await runAuraStylingAgentGraph("uid", {
      query: "streetwear outfit",
      includeDiagnostics: true,
    }, harness.deps);

    expect(response.diagnostics?.steps.length).toBeLessThanOrEqual(10);
    expect(response.diagnostics?.runner).toBe("langgraph");
    expect(response.diagnostics?.nodeTimings.length).toBe(response.diagnostics?.steps.length);
  });

  it("uses the internal runner when AURA_AGENT_USE_LANGGRAPH=false", async () => {
    process.env.AURA_AGENT_USE_LANGGRAPH = "false";
    const harness = deps();
    const response = await runAuraStylingAgentGraph("uid", {
      query: "office outfit",
      includeDiagnostics: true,
    }, harness.deps);

    expect(response.diagnostics?.runner).toBe("controlled-internal-graph");
    expect(response.diagnostics?.langGraphEnabled).toBe(false);
    expect(response.diagnostics?.graphVersion).toBe("phase-5-internal-v1");
  });

  it("routes unknown requests to fallback_response", async () => {
    const harness = deps();
    const response = await runAuraStylingAgentGraph("uid", {
      query: "hello there",
      includeDiagnostics: true,
    }, harness.deps);

    expect(response.mode).toBe("unknown");
    expect(response.diagnostics?.steps).toEqual(["classify_intent", "fallback_response"]);
    expect(harness.calls).toEqual([]);
  });
});
