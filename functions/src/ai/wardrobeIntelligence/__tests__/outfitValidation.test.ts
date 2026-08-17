import { buildOutfitRetrievalPlan, normalizeOutfitGenerationInput } from "../outfitContext";
import type {
  GeneratedOutfit,
  NormalizedOutfitGenerationInput,
  OutfitCandidate,
  OutfitCandidateBuckets,
  OutfitGenerationContext,
  OutfitRole,
} from "../outfitTypes";
import {
  buildValidatedOutfitResponse,
  getEffectiveFormality,
  getTargetFormality,
  scoreColorCoherence,
  scoreGeneratedOutfit,
  scoreOutfitDiversity,
  validateGeneratedOutfits,
} from "../outfitValidation";

function candidate(itemId: string, role: OutfitRole, name: string, formality = 3, score = 0.8): OutfitCandidate {
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
    score,
    vectorScore: score,
    finalScore: score,
    reason: "test candidate",
    imageUrl: null,
    aiMetadata: {
      category: role === "footwear" ? "shoes" : role,
      formality,
      styleTags: ["smart casual"],
      occasionTags: ["office"],
    },
    embeddingTextPreview: null,
    status: "AVAILABLE",
  };
}

function context(overrides: Partial<OutfitCandidateBuckets> = {}): OutfitGenerationContext {
  const buckets: OutfitCandidateBuckets = {
    top: [candidate("shirt", "top", "White Oxford shirt", 3, 0.9)],
    bottom: [candidate("trousers", "bottom", "Black straight trousers", 3, 0.88)],
    footwear: [candidate("loafers", "footwear", "DRESS PENNY LOAFERS", 4, 0.95)],
    outerwear: [candidate("blazer", "outerwear", "Navy blazer", 4, 0.8)],
    accessory: [candidate("watch", "accessory", "Minimal watch", 3, 0.7)],
    one_piece: [candidate("dress", "one_piece", "Black dress", 3, 0.76)],
    ...overrides,
  };
  return {
    retrievalPlan: buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "office outfit with black shoes",
      occasion: "office",
      formality: "smart_casual",
    })),
    candidates: buckets,
    diagnostics: {
      candidateLimitPerCategory: 8,
      rawLimitPerCategory: 24,
      missingRequiredRoles: [],
      candidateCounts: {
        top: buckets.top.length,
        bottom: buckets.bottom.length,
        footwear: buckets.footwear.length,
        outerwear: buckets.outerwear.length,
        accessory: buckets.accessory.length,
        one_piece: buckets.one_piece.length,
      },
      categoryQueries: buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({ query: "office outfit" })).categoryQueries,
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

function input(query = "office outfit with black shoes"): NormalizedOutfitGenerationInput {
  return normalizeOutfitGenerationInput({ query, occasion: "office", formality: "smart_casual" });
}

function outfit(items: GeneratedOutfit["items"], confidence = 0.9): GeneratedOutfit {
  return {
    title: "Office fit",
    vibe: "polished",
    occasion: "office",
    formality: "smart_casual",
    items,
    explanation: "A closet outfit.",
    stylingTips: ["Tuck the shirt"],
    missingItems: [],
    confidence,
  };
}

function withColors(nextCandidate: OutfitCandidate, colors: string[]): OutfitCandidate {
  return {
    ...nextCandidate,
    colors,
  };
}

describe("validateGeneratedOutfits", () => {
  it("passes a valid top + bottom + footwear outfit", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "office-safe" },
        { itemId: "trousers", role: "bottom", reason: "smart casual" },
        { itemId: "loafers", role: "footwear", reason: "black shoes" },
      ]),
    ], context(), input());

    expect(result.valid).toBe(true);
  });

  it("fails hallucinated item IDs", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "fake-shoes", role: "footwear", reason: "" },
      ]),
    ], context(), input());

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("hallucinated itemId");
  });

  it("fails duplicate item IDs", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ]),
    ], context(), input());

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("duplicate itemId");
  });

  it("requires selected item IDs in every generated outfit", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ]),
    ], context(), normalizeOutfitGenerationInput({
      query: "style these pants",
      requiredItemIds: ["trousers"],
    }));

    expect(result.valid).toBe(true);

    const missing = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ]),
    ], context(), normalizeOutfitGenerationInput({
      query: "style these pants",
      requiredItemIds: ["trousers"],
    }));

    expect(missing.valid).toBe(false);
    expect(missing.errors.join(" ")).toContain("missing required selected itemId trousers");
  });

  it("rejects explicit avoided item IDs and avoided terms", () => {
    const sandalContext = context({
      footwear: [
        candidate("sandals", "footwear", "Black leather sandals", 1, 0.9),
        candidate("loafers", "footwear", "DRESS PENNY LOAFERS", 4, 0.95),
      ],
    });
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "sandals", role: "footwear", reason: "" },
      ]),
    ], sandalContext, normalizeOutfitGenerationInput({
      query: "date outfit don't use sandals",
      avoidItemIds: ["shirt"],
      avoidTerms: ["sandals"],
    }));

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("used explicitly avoided itemId shirt");
    expect(result.errors.join(" ")).toContain("matched avoided term sandals");
  });

  it("rejects office tank top without a layer", () => {
    const ctx = context({ top: [candidate("tank", "top", "Black tank top", 1, 0.92)] });
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "tank", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ]),
    ], ctx, input());

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("weak top");
  });

  it("rejects office sandals", () => {
    const ctx = context({ footwear: [candidate("sandals", "footwear", "Black sandals", 1, 0.9)] });
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "sandals", role: "footwear", reason: "" },
      ]),
    ], ctx, input());

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("weak footwear");
  });

  it("passes one_piece + footwear", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "dress", role: "one_piece", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ]),
    ], context(), input());

    expect(result.valid).toBe(true);
  });

  it("passes a shirt that was sourced from a one_piece bucket after canonical role correction", () => {
    const misbucketedShirt = {
      ...candidate("linen-shirt", "one_piece", "Light blue Relaxed Fit Linen-blend shirt", 3, 0.93),
      role: "top" as const,
      canonicalRole: "top" as const,
      allowedRole: "top" as const,
      sourceRole: "one_piece" as const,
      sourceCategory: "one_piece",
      sourceAiMetadataCategory: "one_piece",
      category: "one_piece" as const,
      aiMetadata: {
        category: "one_piece",
        formality: 3,
        styleTags: ["smart casual"],
        occasionTags: ["office"],
      },
    };
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "linen-shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ]),
    ], context({ top: [misbucketedShirt] }), input());

    expect(result.valid).toBe(true);
  });

  it("rejects a true one_piece item used as a top", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "dress", role: "top", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ]),
    ], context(), input());

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("allowedRole is one_piece");
  });

  it("accepts safe footwear role aliases", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "loafers", role: "shoes" as "footwear", reason: "" },
      ]),
    ], context(), input());

    expect(result.valid).toBe(true);
    expect(result.normalizedOutfits[0].items[2].role).toBe("footwear");
  });

  it("auto-corrects obvious generated role mismatches when the candidate is not one_piece", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "loafers", role: "one_piece", reason: "" },
      ]),
    ], context(), input());

    expect(result.valid).toBe(true);
    expect(result.normalizedOutfits[0].items[2].role).toBe("footwear");
    expect(result.validationWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "auto_corrected_role" }),
    ]));
  });

  it("allows shirt-jacket outerwear to be used as a top", () => {
    const shirtJacket = candidate("shirt-jacket", "outerwear", "Navy shirt jacket", 3, 0.88);
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt-jacket", role: "top", reason: "wearable as a top layer" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ]),
    ], context({ outerwear: [shirtJacket] }), input());

    expect(result.valid).toBe(true);
    expect(result.validationWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "warning" }),
    ]));
  });

  it("fails missing footwear", () => {
    const result = validateGeneratedOutfits([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
      ]),
    ], context(), input());

    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("footwear");
  });

  it("clamps confidence in validated response", () => {
    const response = buildValidatedOutfitResponse([
      outfit([
        { itemId: "shirt", role: "top", reason: "" },
        { itemId: "trousers", role: "bottom", reason: "" },
        { itemId: "loafers", role: "footwear", reason: "" },
      ], 1.7),
    ], context(), input());

    expect(response[0].confidence).toBe(1);
  });
});

describe("scoreGeneratedOutfit", () => {
  it("scores complete outfits higher than incomplete outfits", () => {
    const ctx = context();
    const complete = scoreGeneratedOutfit(outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]), ctx, input());
    const incomplete = scoreGeneratedOutfit(outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
    ]), ctx, input());

    expect(complete.total).toBeGreaterThan(incomplete.total);
  });

  it("scores office-safe loafers/trousers/shirt higher than tank/sandal outfit", () => {
    const weakCtx = context({
      top: [candidate("tank", "top", "Black tank top", 1, 0.95)],
      footwear: [candidate("sandals", "footwear", "Black sandals", 1, 0.95)],
    });
    const strong = scoreGeneratedOutfit(outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]), context(), input());
    const weak = scoreGeneratedOutfit(outfit([
      { itemId: "tank", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "sandals", role: "footwear", reason: "" },
    ]), weakCtx, input());

    expect(strong.total).toBeGreaterThan(weak.total);
  });

  it("uses candidate retrieval strength", () => {
    const strongCtx = context({ top: [candidate("shirt", "top", "White Oxford shirt", 3, 0.95)] });
    const weakCtx = context({ top: [candidate("shirt", "top", "White Oxford shirt", 3, 0.2)] });
    const generated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, strongCtx, input()).retrievalStrength)
      .toBeGreaterThan(scoreGeneratedOutfit(generated, weakCtx, input()).retrievalStrength);
  });

  it("scores date-night polo/trousers/loafers/watch with strong effective formality", () => {
    const ctx = context({
      top: [candidate("polo", "top", "Navy knit polo", 1, 0.9)],
      accessory: [candidate("watch", "accessory", "Leather strap watch", 1, 0.85)],
    });
    const generated = outfit([
      { itemId: "polo", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
      { itemId: "watch", role: "accessory", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "date night outfit",
      occasion: "dinner",
      formality: "smart_casual",
    })).formalityFit).toBeGreaterThan(0.7);
  });

  it("scores black trousers/polo/loafers/belt as color coherent", () => {
    const ctx = context({
      top: [withColors(candidate("polo", "top", "Light blue polo", 1, 0.9), ["light blue"])],
      bottom: [withColors(candidate("trousers", "bottom", "Black straight trousers", 1, 0.9), ["black"])],
      footwear: [withColors(candidate("loafers", "footwear", "Black leather loafers", 1, 0.9), ["black"])],
      accessory: [withColors(candidate("belt", "accessory", "Black leather belt", 1, 0.85), ["black"])],
    });
    const generated = outfit([
      { itemId: "polo", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
      { itemId: "belt", role: "accessory", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, ctx, input("office outfit")).colorCoherence).toBeGreaterThan(0.75);
  });

  it("scores beige and white summer outfit as color coherent", () => {
    const ctx = context({
      top: [withColors(candidate("linen-shirt", "top", "Beige linen shirt", 2, 0.9), ["beige"])],
      bottom: [withColors(candidate("linen-trousers", "bottom", "White linen trousers", 2, 0.9), ["white"])],
      footwear: [withColors(candidate("sneakers", "footwear", "White minimal leather sneakers", 2, 0.88), ["white"])],
      accessory: [withColors(candidate("sunglasses", "accessory", "Beige sunglasses", 1, 0.7), ["beige"])],
    });
    const generated = outfit([
      { itemId: "linen-shirt", role: "top", reason: "" },
      { itemId: "linen-trousers", role: "bottom", reason: "" },
      { itemId: "sneakers", role: "footwear", reason: "" },
      { itemId: "sunglasses", role: "accessory", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "summer casual outfit",
      weather: "hot",
      formality: "casual",
    })).colorCoherence).toBeGreaterThan(0.75);
  });

  it("supports elevated summer casual linen outfits", () => {
    const ctx = context({
      top: [candidate("resort-shirt", "top", "Linen resort shirt", 3, 0.9)],
      bottom: [candidate("linen-trousers", "bottom", "White linen trousers", 3, 0.88)],
      footwear: [candidate("sneakers", "footwear", "Clean minimal leather sneakers", 3, 0.86)],
    });
    const generated = outfit([
      { itemId: "resort-shirt", role: "top", reason: "" },
      { itemId: "linen-trousers", role: "bottom", reason: "" },
      { itemId: "sneakers", role: "footwear", reason: "" },
    ]);
    const score = scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "summer casual outfit",
      weather: "hot",
      formality: "casual",
    }));

    expect(score.targetFormalityRange).toEqual([2, 3.2]);
    expect(score.formalityFit).toBeGreaterThanOrEqual(0.75);
  });

  it("supports resort casual linen trousers with loafers", () => {
    const ctx = context({
      top: [candidate("linen-shirt", "top", "Linen shirt", 3, 0.9)],
      bottom: [candidate("linen-trousers", "bottom", "White linen trousers", 3, 0.88)],
      footwear: [candidate("loafers", "footwear", "Brown leather loafers", 4, 0.86)],
    });
    const generated = outfit([
      { itemId: "linen-shirt", role: "top", reason: "" },
      { itemId: "linen-trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "resort casual vacation outfit",
      formality: "casual",
    })).formalityFit).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps beach casual low-formality outfits fitting beach intent", () => {
    const ctx = context({
      top: [candidate("tank", "top", "White tank top", 1, 0.8)],
      bottom: [candidate("shorts", "bottom", "Linen shorts", 1, 0.8)],
      footwear: [candidate("sandals", "footwear", "Brown sandals", 1, 0.8)],
    });
    const generated = outfit([
      { itemId: "tank", role: "top", reason: "" },
      { itemId: "shorts", role: "bottom", reason: "" },
      { itemId: "sandals", role: "footwear", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "beach pool summer outfit",
      formality: "casual",
    })).formalityFit).toBeGreaterThanOrEqual(0.75);
  });

  it("penalizes blazer and dress shoes for beach casual", () => {
    const ctx = context({
      top: [candidate("shirt", "top", "White Oxford shirt", 3, 0.8)],
      bottom: [candidate("trousers", "bottom", "Black straight trousers", 3, 0.8)],
      footwear: [candidate("dress-shoes", "footwear", "Black Oxford dress shoes", 4, 0.8)],
      outerwear: [candidate("blazer", "outerwear", "Navy blazer", 4, 0.8)],
    });
    const generated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "dress-shoes", role: "footwear", reason: "" },
      { itemId: "blazer", role: "outerwear", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "beach pool summer outfit",
      formality: "casual",
    })).formalityFit).toBeLessThan(0.75);
  });

  it("keeps streetwear target casual", () => {
    const ctx = context({
      top: [candidate("graphic", "top", "Black graphic tee", 1, 0.9)],
      bottom: [candidate("jeans", "bottom", "Dark jeans", 2, 0.9)],
      footwear: [candidate("sneakers", "footwear", "Statement sneakers", 2, 0.9)],
    });
    ctx.retrievalPlan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({ query: "streetwear outfit", formality: "casual" }));
    const generated = outfit([
      { itemId: "graphic", role: "top", reason: "" },
      { itemId: "jeans", role: "bottom", reason: "" },
      { itemId: "sneakers", role: "footwear", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "streetwear outfit",
      formality: "casual",
    })).targetFormalityRange).toEqual([1, 2.25]);
  });

  it("boosts outfits matching preferred style memory", () => {
    const ctx = context({
      top: [candidate("polo", "top", "Navy knit polo", 3, 0.9)],
      footwear: [candidate("loafers", "footwear", "Black leather loafers", 4, 0.9)],
    });
    const memoryCtx = {
      ...ctx,
      styleMemory: {
        profileSummary: "Prefers polos and black loafers.",
        profileSignals: {
          ...emptyProfileSignals(),
          preferredColors: [{ value: "black", weight: 4 }],
          preferredStyleTags: [{ value: "smart casual", weight: 4 }],
          preferredCategories: [{ value: "footwear", weight: 3 }],
          preferredMaterials: [{ value: "leather", weight: 3 }],
          itemAffinities: [{ value: "loafers", weight: 5 }],
        },
        positiveMemories: [{ id: "m1", text: "User likes black loafers and polos.", strength: 4, confidence: 0.9, type: "positive_preference" }],
        negativeMemories: [],
      },
    };
    const generated = outfit([
      { itemId: "polo", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, memoryCtx, input()).stylePreferenceFit).toBeGreaterThan(0.75);
  });

  it("does not let avoided color memory override explicit requested colors", () => {
    const baseCtx = context({
      footwear: [candidate("loafers", "footwear", "Black leather loafers", 4, 0.9)],
    });
    const ctx = {
      ...baseCtx,
      styleMemory: {
        profileSummary: "Avoids black.",
        profileSignals: {
          ...emptyProfileSignals(),
          avoidedColors: [{ value: "black", weight: 5 }],
        },
        positiveMemories: [],
        negativeMemories: [{ id: "m1", text: "Avoid black.", strength: 5, confidence: 0.9, type: "color_preference" }],
      },
    };
    const generated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);

    expect(scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "office outfit with black shoes",
      preferredColors: ["black"],
      formality: "smart_casual",
    })).memoryPenalties).toEqual([]);
  });

  it("penalizes exact disliked items strongly", () => {
    const baseCtx = context();
    const ctx = {
      ...baseCtx,
      styleMemory: {
        profileSummary: "Avoids loafers.",
        profileSignals: {
          ...emptyProfileSignals(),
          avoidedItemIds: [{ value: "loafers", weight: 5 }],
        },
        positiveMemories: [],
        negativeMemories: [{
          id: "m1",
          text: "Avoid selected item.",
          strength: 5,
          confidence: 0.9,
          type: "avoidance",
          entities: { itemIds: ["loafers"] },
          occasionCompatibility: 1,
        }],
      },
    };
    const generated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);
    const score = scoreGeneratedOutfit(generated, ctx, input());

    expect(score.stylePreferenceFit).toBeLessThan(0.6);
    expect(score.memoryPenalties.join(" ")).toContain("matched avoided item: DRESS PENNY LOAFERS");
  });

  it("does not penalize a different item only because it shares a generic category", () => {
    const baseCtx = context({
      footwear: [candidate("derbies", "footwear", "Black derby shoes", 4, 0.9)],
    });
    const ctx = {
      ...baseCtx,
      styleMemory: {
        profileSummary: "Legacy broad category avoid.",
        profileSignals: {
          ...emptyProfileSignals(),
          avoidedCategories: [{ value: "footwear", weight: 5 }],
        },
        positiveMemories: [],
        negativeMemories: [],
      },
    };
    const generated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "derbies", role: "footwear", reason: "" },
    ]);
    const score = scoreGeneratedOutfit(generated, ctx, input());

    expect(score.stylePreferenceFit).toBe(0.75);
    expect(score.memoryPenalties).toEqual([]);
  });

  it("does not apply streetwear negative memory to office outfits without distinctive overlap", () => {
    const baseCtx = context();
    const ctx = {
      ...baseCtx,
      styleMemory: {
        profileSummary: "Disliked one streetwear outfit.",
        profileSignals: emptyProfileSignals(),
        positiveMemories: [],
        negativeMemories: [{
          id: "m1",
          text: "User disliked a streetwear outfit.",
          strength: 4,
          confidence: 0.9,
          type: "negative_preference",
          entities: {
            itemIds: ["graphic-jersey"],
            styleTags: ["streetwear"],
            colors: ["black", "blue"],
            subcategories: [],
          },
          occasionCompatibility: 0.15,
        }],
      },
    };
    const generated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);
    const score = scoreGeneratedOutfit(generated, ctx, input());

    expect(score.stylePreferenceFit).toBe(0.75);
    expect(score.memoryPenalties).toEqual([]);
  });

  it("does not boost streetwear outfits from office positive memory text alone", () => {
    const baseCtx = context({
      top: [candidate("graphic", "top", "Black graphic tee", 1, 0.9)],
      bottom: [candidate("jeans", "bottom", "Dark jeans", 2, 0.9)],
      footwear: [candidate("sneakers", "footwear", "Statement sneakers", 2, 0.9)],
    });
    const ctx = {
      ...baseCtx,
      styleMemory: {
        profileSummary: "Office positive memory should be filtered upstream.",
        profileSignals: emptyProfileSignals(),
        positiveMemories: [{
          id: "m1",
          text: "User likes office outfits with light blue linen shirts, black trousers, and dress loafers.",
          strength: 4,
          confidence: 0.9,
          type: "positive_preference",
          entities: {
            itemIds: ["linen-shirt", "trousers", "loafers"],
            styleTags: ["smart casual", "minimal"],
            colors: ["black", "blue"],
          },
          occasionCompatibility: 0.15,
        }],
        negativeMemories: [],
      },
    };
    const generated = outfit([
      { itemId: "graphic", role: "top", reason: "" },
      { itemId: "jeans", role: "bottom", reason: "" },
      { itemId: "sneakers", role: "footwear", reason: "" },
    ]);
    const score = scoreGeneratedOutfit(generated, ctx, normalizeOutfitGenerationInput({
      query: "streetwear outfit",
      formality: "casual",
    }));

    expect(score.stylePreferenceFit).toBe(0.75);
    expect(score.memoryBoosts).toEqual([]);
  });

  it("applies occasion formality bias from style memory", () => {
    const baseCtx = context();
    const ctx = {
      ...baseCtx,
      styleMemory: {
        profileSummary: "Prefers office outfits less formal.",
        profileSignals: {
          ...emptyProfileSignals(),
          formalityBiasByOccasion: { office: -1 },
        },
        positiveMemories: [],
        negativeMemories: [],
      },
    };
    const generated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);
    const score = scoreGeneratedOutfit(generated, ctx, input());

    expect(score.targetFormalityRange).toEqual([2.25, 3.25]);
    expect(score.formalityBiasApplied).toBe(-1);
    expect(score.formalityBiasReason).toContain("lowered");
  });

  it("raises target formality for too_casual style memory", () => {
    const baseCtx = context();
    const ctx = {
      ...baseCtx,
      styleMemory: {
        profileSummary: "Prefers office outfits more elevated.",
        profileSignals: {
          ...emptyProfileSignals(),
          formalityBiasByOccasion: { office: 1 },
        },
        positiveMemories: [],
        negativeMemories: [],
      },
    };
    const generated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);
    const score = scoreGeneratedOutfit(generated, ctx, input());

    expect(score.targetFormalityRange).toEqual([2.75, 3.75]);
    expect(score.formalityBiasApplied).toBe(1);
    expect(score.formalityBiasReason).toContain("raised");
  });
});

describe("effective formality", () => {
  it("uses item semantics over stale raw metadata", () => {
    expect(getEffectiveFormality(candidate("polo", "top", "Navy knit polo", 1))).toBeGreaterThanOrEqual(3);
    expect(getEffectiveFormality(candidate("trousers", "bottom", "Black straight trousers", 1))).toBeGreaterThanOrEqual(3);
    expect(getEffectiveFormality(candidate("loafers", "footwear", "DRESS PENNY LOAFERS", 1))).toBeGreaterThanOrEqual(4);
    expect(getEffectiveFormality(candidate("watch", "accessory", "Leather watch", 1))).toBeGreaterThanOrEqual(3);
    expect(getEffectiveFormality(candidate("belt", "accessory", "Black leather belt", 1))).toBeGreaterThanOrEqual(3);
    expect(getEffectiveFormality(candidate("graphic", "top", "Loud graphic tee", 4))).toBe(1);
    expect(getEffectiveFormality(candidate("tank", "top", "Black tank top", 4))).toBe(1);
    expect(getEffectiveFormality(candidate("sneaker", "footwear", "Clean minimal leather sneakers", 1))).toBeGreaterThanOrEqual(2.5);
  });

  it("targets dinner/date and office smart casual around 3", () => {
    expect(getTargetFormality({ query: "date night outfit" })).toBe(3);
    expect(getTargetFormality({ query: "office outfit", formality: "smart_casual" })).toBe(3);
  });
});

describe("scoreColorCoherence", () => {
  it("scores black anchors with a light blue polo highly", () => {
    const result = scoreColorCoherence([
      withColors(candidate("polo", "top", "Light blue polo"), ["light blue"]),
      withColors(candidate("trousers", "bottom", "Black straight trousers"), ["black"]),
      withColors(candidate("loafers", "footwear", "Black loafers"), ["black"]),
      withColors(candidate("belt", "accessory", "Black belt"), ["black"]),
    ]);

    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.reasons.join(" ")).toContain("repeated color anchor");
  });

  it("scores beige and white linen outfits highly", () => {
    const result = scoreColorCoherence([
      withColors(candidate("shirt", "top", "Beige linen shirt"), ["beige"]),
      withColors(candidate("trousers", "bottom", "White linen trousers"), ["white"]),
      withColors(candidate("sneakers", "footwear", "White sneakers"), ["white"]),
      withColors(candidate("sunglasses", "accessory", "Beige sunglasses"), ["beige"]),
    ]);

    expect(result.score).toBeGreaterThanOrEqual(0.85);
  });

  it("scores dark streetwear with neutral sneakers and cap as coherent", () => {
    const result = scoreColorCoherence([
      withColors(candidate("tee", "top", "Black graphic tee"), ["black"]),
      withColors(candidate("jeans", "bottom", "Dark jeans"), ["blue"]),
      withColors(candidate("sneakers", "footwear", "White gray sneakers"), ["white", "gray"]),
      withColors(candidate("cap", "accessory", "Black cap"), ["black"]),
    ]);

    expect(result.score).toBeGreaterThanOrEqual(0.75);
  });

  it("scores loud unrelated multicolor outfits lower", () => {
    const result = scoreColorCoherence([
      withColors(candidate("top", "top", "Loud multi-color top"), ["red", "yellow", "purple"]),
      withColors(candidate("shoes", "footwear", "Multi-color shoes"), ["green", "orange", "multicolor"]),
      withColors(candidate("cap", "accessory", "Blue cap"), ["blue"]),
    ]);

    expect(result.score).toBeLessThan(0.65);
  });
});

describe("scoreOutfitDiversity", () => {
  it("penalizes repeated tops across generated outfits", () => {
    const previous = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);
    const repeated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "jeans", role: "bottom", reason: "" },
      { itemId: "sneakers", role: "footwear", reason: "" },
    ]);
    const ctx = context({
      top: [candidate("shirt", "top", "White Oxford shirt"), candidate("polo", "top", "Navy knit polo")],
      bottom: [candidate("trousers", "bottom", "Black straight trousers"), candidate("jeans", "bottom", "Dark jeans")],
      footwear: [candidate("loafers", "footwear", "Black loafers"), candidate("sneakers", "footwear", "White sneakers")],
    });

    expect(scoreOutfitDiversity(repeated, [previous], ctx).penalties.join(" ")).toContain("reused top");
    expect(scoreOutfitDiversity(repeated, [previous], ctx).score).toBeLessThan(0.9);
  });

  it("only lightly penalizes repeated shoes when footwear candidates are limited", () => {
    const previous = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);
    const repeatedShoes = outfit([
      { itemId: "polo", role: "top", reason: "" },
      { itemId: "chinos", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);
    const ctx = context({
      top: [candidate("shirt", "top", "White Oxford shirt"), candidate("polo", "top", "Navy knit polo")],
      bottom: [candidate("trousers", "bottom", "Black straight trousers"), candidate("chinos", "bottom", "Tan chinos")],
      footwear: [candidate("loafers", "footwear", "Black loafers")],
    });

    expect(scoreOutfitDiversity(repeatedShoes, [previous], ctx).score).toBeGreaterThan(0.9);
  });

  it("ranks varied top and bottom combinations higher than repeated cores", () => {
    const repeated = outfit([
      { itemId: "shirt", role: "top", reason: "" },
      { itemId: "trousers", role: "bottom", reason: "" },
      { itemId: "loafers", role: "footwear", reason: "" },
    ]);
    const varied = outfit([
      { itemId: "polo", role: "top", reason: "" },
      { itemId: "chinos", role: "bottom", reason: "" },
      { itemId: "sneakers", role: "footwear", reason: "" },
    ]);
    const ctx = context({
      top: [candidate("shirt", "top", "White Oxford shirt"), candidate("polo", "top", "Navy knit polo")],
      bottom: [candidate("trousers", "bottom", "Black straight trousers"), candidate("chinos", "bottom", "Tan chinos")],
      footwear: [candidate("loafers", "footwear", "Black loafers"), candidate("sneakers", "footwear", "White sneakers")],
    });

    expect(scoreOutfitDiversity(varied, [repeated], ctx).score)
      .toBeGreaterThan(scoreOutfitDiversity(repeated, [repeated], ctx).score);
  });
});
