import { handleRunAuraStylingAgent } from "../agentCallables";
import type { AuraAgentDeps } from "../agentNodes";
import type {
  OutfitCandidate,
  OutfitCandidateBuckets,
  OutfitGenerationContext,
  OutfitRole,
  ValidatedOutfit,
} from "../outfitTypes";

function candidate(itemId: string, role: OutfitRole): OutfitCandidate {
  return {
    itemId,
    name: itemId,
    role,
    canonicalRole: role,
    allowedRole: role,
    sourceRole: role,
    sourceCategory: role,
    sourceAiMetadataCategory: role,
    category: role,
    colors: ["black"],
    score: 0.9,
    vectorScore: 0.9,
    finalScore: 0.9,
    reason: "test",
    imageUrl: null,
    aiMetadata: { category: role },
    embeddingTextPreview: null,
    status: "AVAILABLE",
  };
}

function context(): OutfitGenerationContext {
  const candidates: OutfitCandidateBuckets = {
    top: [candidate("shirt", "top")],
    bottom: [candidate("pants", "bottom")],
    footwear: [candidate("loafers", "footwear")],
    outerwear: [],
    accessory: [],
    one_piece: [],
  };
  return {
    retrievalPlan: {
      intent: {
        occasion: "office",
        formality: "smart_casual",
        styleHints: [],
        colorHints: [],
        categorySpecificConstraints: {},
      },
      categoryQueries: {
        top: "top",
        bottom: "bottom",
        footwear: "footwear",
        outerwear: "outerwear",
        accessory: "accessory",
        one_piece: "one piece",
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
        top: "top",
        bottom: "bottom",
        footwear: "footwear",
        outerwear: "outerwear",
        accessory: "accessory",
        one_piece: "one piece",
      },
    },
  };
}

function outfit(): ValidatedOutfit {
  return {
    outfitId: "outfit-1",
    title: "Office Fit",
    vibe: "polished",
    occasion: "office",
    formality: "smart_casual",
    items: [],
    explanation: "Works for office.",
    stylingTips: [],
    missingItems: [],
    confidence: 0.9,
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

function deps(): AuraAgentDeps {
  return {
    retrieveStyleMemory: async () => null,
    retrieveOutfitContext: async () => context(),
    generateOutfits: async () => ({
      outfits: [outfit()],
      validationErrors: [],
      validationWarnings: [],
      repaired: false,
    }),
  };
}

describe("handleRunAuraStylingAgent", () => {
  it("requires auth", async () => {
    await expect(handleRunAuraStylingAgent(undefined, {
      query: "office outfit",
    }, deps())).rejects.toThrow("Please sign in first.");
  });

  it("normalizes callable input and returns an agent response", async () => {
    const response = await handleRunAuraStylingAgent("uid", {
      query: "office outfit",
      mode: "generate_outfit",
      count: 2,
      useStyleMemory: false,
    }, deps());

    expect(response.mode).toBe("generate_outfit");
    expect(response.outfits?.[0].title).toBe("Office Fit");
  });
});
