import { HttpsError } from "firebase-functions/v2/https";
import {
  handleGenerateOutfitRecommendations,
  handlePreviewOutfitGenerationContext,
} from "../outfitCallables";
import {
  buildOutfitRetrievalPlan,
  normalizeOutfitGenerationInput,
} from "../outfitContext";
import {
  generateValidatedOutfitsFromContext,
  type OutfitOpenAIClient,
} from "../outfitGeneration";
import type {
  OutfitCandidate,
  OutfitCandidateBuckets,
  OutfitGenerationContext,
  OutfitRole,
} from "../outfitTypes";

function candidate(itemId: string, role: OutfitRole, name: string): OutfitCandidate {
  return {
    itemId,
    name,
    role,
    canonicalRole: role,
    allowedRole: role,
    sourceRole: role,
    sourceCategory: role === "footwear" ? "footwear" : role,
    sourceAiMetadataCategory: role === "footwear" ? "shoes" : role,
    category: role === "footwear" ? "footwear" : role,
    colors: name.toLowerCase().includes("black") ? ["black"] : ["white"],
    score: 0.9,
    vectorScore: 0.9,
    finalScore: 0.9,
    reason: "test candidate",
    imageUrl: null,
    aiMetadata: {
      category: role === "footwear" ? "shoes" : role,
      formality: role === "footwear" ? 4 : 3,
      styleTags: ["smart casual"],
      occasionTags: ["office"],
    },
    embeddingTextPreview: null,
    status: "AVAILABLE",
  };
}

function context(): OutfitGenerationContext {
  const candidates: OutfitCandidateBuckets = {
    top: [candidate("shirt", "top", "White Oxford shirt")],
    bottom: [candidate("trousers", "bottom", "Black straight trousers")],
    footwear: [candidate("loafers", "footwear", "DRESS PENNY LOAFERS")],
    outerwear: [],
    accessory: [],
    one_piece: [],
  };
  const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
    query: "office outfit with black shoes",
    occasion: "office",
    formality: "smart_casual",
  }));
  return {
    retrievalPlan: plan,
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
      categoryQueries: plan.categoryQueries,
    },
  };
}

function emptyProfileSignals() {
  return {
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
    formalityBiasByOccasion: {},
  };
}

function openAiClient(outputs: string[]): OutfitOpenAIClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    responses: {
      create: async (args) => {
        calls.push(args);
        return { output_text: outputs[Math.min(calls.length - 1, outputs.length - 1)] };
      },
    },
  };
}

function validPayload() {
  return JSON.stringify({
    outfits: [
      {
        title: "Clean Office Fit",
        vibe: "polished",
        occasion: "office",
        formality: "smart_casual",
        items: [
          { itemId: "shirt", role: "top", reason: "office-safe shirt" },
          { itemId: "trousers", role: "bottom", reason: "smart trousers" },
          { itemId: "loafers", role: "footwear", reason: "black shoes" },
        ],
        explanation: "A clean outfit.",
        stylingTips: ["Tuck the shirt"],
        missingItems: [],
        confidence: 0.91,
      },
    ],
  });
}

function invalidPayload() {
  return JSON.stringify({
    outfits: [
      {
        title: "Bad",
        vibe: "bad",
        occasion: "office",
        formality: "smart_casual",
        items: [
          { itemId: "fake", role: "top", reason: "not real" },
          { itemId: "trousers", role: "bottom", reason: "" },
          { itemId: "loafers", role: "footwear", reason: "" },
        ],
        explanation: "",
        stylingTips: [],
        missingItems: [],
        confidence: 0.5,
      },
    ],
  });
}

describe("generateValidatedOutfitsFromContext", () => {
  it("calls OpenAI once for valid structured output", async () => {
    const client = openAiClient([validPayload()]);
    const result = await generateValidatedOutfitsFromContext(
      normalizeOutfitGenerationInput({ query: "office outfit with black shoes" }),
      context(),
      { client },
    );

    expect(client.calls).toHaveLength(1);
    expect(result.outfits).toHaveLength(1);
    expect(result.repaired).toBe(false);
  });

  it("repairs once when the first generated output is invalid", async () => {
    const client = openAiClient([invalidPayload(), validPayload()]);
    const result = await generateValidatedOutfitsFromContext(
      normalizeOutfitGenerationInput({ query: "office outfit with black shoes" }),
      context(),
      { client },
    );

    expect(client.calls).toHaveLength(2);
    expect(result.repaired).toBe(true);
    expect(result.validationWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "repaired" }),
    ]));
    expect(result.outfits[0].items.map((item) => item.itemId)).toEqual(["shirt", "trousers", "loafers"]);
  });

  it("keeps valid outfits and drops invalid outfits without failing the callable", async () => {
    const mixedPayload = JSON.stringify({
      outfits: [
        JSON.parse(validPayload()).outfits[0],
        {
          title: "Bad",
          vibe: "bad",
          occasion: "office",
          formality: "smart_casual",
          items: [
            { itemId: "fake", role: "top", reason: "not real" },
            { itemId: "trousers", role: "bottom", reason: "" },
            { itemId: "loafers", role: "footwear", reason: "" },
          ],
          explanation: "",
          stylingTips: [],
          missingItems: [],
          confidence: 0.5,
        },
      ],
    });
    const client = openAiClient([mixedPayload]);
    const result = await generateValidatedOutfitsFromContext(
      normalizeOutfitGenerationInput({ query: "office outfit with black shoes" }),
      context(),
      { client, repair: false },
    );

    expect(client.calls).toHaveLength(1);
    expect(result.repaired).toBe(false);
    expect(result.outfits).toHaveLength(1);
    expect(result.validationWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "dropped" }),
    ]));
    expect(result.outfits[0].items.map((item) => item.itemId)).toEqual(["shirt", "trousers", "loafers"]);
  });

  it("throws only when zero generated outfits remain valid", async () => {
    const client = openAiClient([invalidPayload()]);

    await expect(generateValidatedOutfitsFromContext(
      normalizeOutfitGenerationInput({ query: "office outfit with black shoes" }),
      context(),
      { client, repair: false },
    )).rejects.toThrow(HttpsError);
  });
});

describe("outfit callable handlers", () => {
  it("rejects unauthenticated preview requests", async () => {
    await expect(handlePreviewOutfitGenerationContext(undefined, { query: "office outfit" }, {
      retrieveContext: async () => context(),
    })).rejects.toThrow(HttpsError);
  });

  it("rejects empty queries", async () => {
    await expect(handleGenerateOutfitRecommendations("uid", { query: " " }, {
      retrieveContext: async () => context(),
    })).rejects.toThrow(HttpsError);
  });

  it("caps count at 5", () => {
    expect(normalizeOutfitGenerationInput({ query: "office outfit", count: 99 }).count).toBe(5);
  });

  it("previewOutfitGenerationContext does not call OpenAI", async () => {
    const response = await handlePreviewOutfitGenerationContext("uid", { query: "office outfit" }, {
      retrieveContext: async () => context(),
    });

    expect(response.candidates.footwear[0].itemId).toBe("loafers");
  });

  it("generateOutfitRecommendations delegates generation after retrieval", async () => {
    const response = await handleGenerateOutfitRecommendations("uid", {
      query: "office outfit with black shoes",
      includeDiagnostics: true,
      useStyleMemory: false,
    }, {
      retrieveContext: async () => context(),
      generateValidatedOutfits: async () => ({
        outfits: [
          {
            outfitId: "outfit-1",
            title: "Clean Office Fit",
            vibe: "polished",
            occasion: "office",
            formality: "smart_casual",
            items: [],
            explanation: "",
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
              targetFormalityRange: [2.5, 3.5],
              formalityFitReason: "items fit target formality range",
              formalityBiasApplied: 0,
              formalityBiasReason: "no style memory formality bias applied",
              itemEffectiveFormalities: [],
              retrievalStrength: 1,
              stylePreferenceFit: 0.75,
              styleMemoryReasons: [],
              memoryBoosts: [],
              memoryPenalties: [],
              diversityScore: 1,
              diversityPenalties: [],
              penalties: [],
              total: 1,
            },
          },
        ],
        validationErrors: [],
        validationWarnings: [],
        repaired: false,
      }),
    });

    expect(response.outfits).toHaveLength(1);
    const diagnostics = response.diagnostics as {
      context?: { candidateCounts?: { footwear?: number } };
    } | undefined;
    expect(diagnostics?.context?.candidateCounts?.footwear).toBe(1);
  });

  it("retrieves style memory by default for outfit generation", async () => {
    let sawStyleMemory = false;
    const response = await handleGenerateOutfitRecommendations("uid", {
      query: "office outfit with black shoes",
      includeDiagnostics: true,
    }, {
      retrieveContext: async () => context(),
      retrieveStyleMemory: async () => ({
        profileSummary: "Prefers black loafers.",
        profileSignals: {
          ...emptyProfileSignals(),
          preferredColors: [{ value: "black", weight: 4 }],
        },
        positiveMemories: [{ id: "m1", text: "Likes black loafers.", strength: 4, confidence: 0.9, type: "positive_preference" }],
        negativeMemories: [],
      }),
      generateValidatedOutfits: async ({ context: generationContext }) => {
        sawStyleMemory = Boolean(generationContext.styleMemory);
        return {
          outfits: [],
          validationErrors: [],
          validationWarnings: [],
          repaired: false,
        };
      },
    });

    expect(sawStyleMemory).toBe(true);
    expect(response.diagnostics?.styleMemory).toBeTruthy();
  });

  it("skips style memory retrieval when useStyleMemory is false", async () => {
    let calledMemory = false;
    await handleGenerateOutfitRecommendations("uid", {
      query: "office outfit with black shoes",
      useStyleMemory: false,
    }, {
      retrieveContext: async () => context(),
      retrieveStyleMemory: async () => {
        calledMemory = true;
        return null;
      },
      generateValidatedOutfits: async () => ({
        outfits: [],
        validationErrors: [],
        validationWarnings: [],
        repaired: false,
      }),
    });

    expect(calledMemory).toBe(false);
  });
});
