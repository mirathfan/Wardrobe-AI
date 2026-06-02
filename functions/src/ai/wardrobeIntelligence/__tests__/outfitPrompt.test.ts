import { buildOutfitRetrievalPlan, normalizeOutfitGenerationInput } from "../outfitContext";
import {
  buildOutfitGenerationDeveloperPrompt,
  buildOutfitGenerationUserPrompt,
} from "../outfitPrompt";
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
    sourceCategory: role,
    sourceAiMetadataCategory: role === "footwear" ? "shoes" : role,
    category: role,
    colors: ["black"],
    score: 0.9,
    vectorScore: 0.9,
    finalScore: 0.9,
    reason: "test candidate",
    imageUrl: null,
    aiMetadata: {
      category: role === "footwear" ? "shoes" : role,
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

describe("outfit generation prompts", () => {
  it("exposes allowedRole in the user prompt", () => {
    const prompt = buildOutfitGenerationUserPrompt(
      normalizeOutfitGenerationInput({ query: "office outfit with black shoes" }),
      context(),
    );
    const payload = JSON.parse(prompt) as {
      candidatesByRole: { footwear: Array<{ itemId: string; allowedRole?: string; role?: string }> };
      outputSchema: { outfits: Array<{ items: Array<{ role: string }> }> };
    };

    expect(payload.candidatesByRole.footwear[0]).toMatchObject({
      itemId: "loafers",
      allowedRole: "footwear",
    });
    expect(payload.candidatesByRole.footwear[0].role).toBeUndefined();
    expect(payload.outputSchema.outfits[0].items[0].role).toContain("allowedRole");
  });

  it("tells the model to use the exact allowedRole", () => {
    expect(buildOutfitGenerationDeveloperPrompt()).toContain("allowedRole");
  });

  it("includes positive and negative style memory guidance when present", () => {
    const ctx = {
      ...context(),
      styleMemory: {
        profileSummary: "Prefers clean neutral outfits.",
        profileSignals: {
          ...emptyProfileSignals(),
          preferredColors: [{ value: "black", weight: 4 }],
          avoidedStyleTags: [{ value: "loud graphic", weight: 4 }],
        },
        positiveMemories: [{ id: "m1", text: "Likes black loafers.", strength: 4, confidence: 0.9, type: "positive_preference" }],
        negativeMemories: [{ id: "m2", text: "Avoid loud graphic tees.", strength: 4, confidence: 0.9, type: "negative_preference" }],
      },
    };
    const prompt = buildOutfitGenerationUserPrompt(
      normalizeOutfitGenerationInput({ query: "office outfit" }),
      ctx,
    );
    const payload = JSON.parse(prompt) as { styleMemory?: { positiveMemories?: string[]; negativeMemories?: string[]; profileSummary?: string } };

    expect(payload.styleMemory?.profileSummary).toContain("clean neutral");
    expect(payload.styleMemory?.positiveMemories?.[0]).toContain("User tends to like");
    expect(payload.styleMemory?.negativeMemories?.[0]).toContain("Avoid");
    expect(buildOutfitGenerationDeveloperPrompt()).toContain("Use style memory");
  });
});
