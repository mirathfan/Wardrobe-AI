import {
  buildOutfitRetrievalPlan,
  canonicalizeOutfitCandidateBuckets,
  normalizeOutfitGenerationInput,
  retrieveOutfitGenerationContext,
} from "../outfitContext";
import { canonicalizeOutfitRole } from "../outfitRole";
import type {
  OutfitCandidate,
  OutfitCandidateBuckets,
  OutfitRole,
} from "../outfitTypes";

function candidate(
  itemId: string,
  role: OutfitRole,
  name: string,
  score = 0.8,
  aiMetadataCategory = role,
): OutfitCandidate {
  return {
    itemId,
    name,
    role,
    canonicalRole: role,
    allowedRole: role,
    sourceRole: role,
    sourceCategory: role,
    sourceAiMetadataCategory: aiMetadataCategory,
    category: role,
    colors: ["black"],
    score,
    vectorScore: score,
    finalScore: score,
    reason: "test candidate",
    imageUrl: null,
    aiMetadata: {
      category: aiMetadataCategory,
      styleTags: [],
      occasionTags: [],
    },
    embeddingTextPreview: null,
    status: "AVAILABLE",
  };
}

function emptyBuckets(): OutfitCandidateBuckets {
  return {
    top: [],
    bottom: [],
    footwear: [],
    outerwear: [],
    accessory: [],
    one_piece: [],
  };
}

describe("buildOutfitRetrievalPlan", () => {
  it("applies black color mainly to footwear for office outfit with black shoes", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "office outfit with black shoes",
      formality: "smart_casual",
    }));

    expect(plan.intent.categorySpecificConstraints.footwear).toEqual(["black"]);
    expect(plan.intent.categorySpecificConstraints.top).toBeUndefined();
    expect(plan.categoryQueries.footwear).toContain("black loafers");
    expect(plan.categoryQueries.top).not.toContain("colors black");
  });

  it("produces office-safe top, bottom, and footwear category queries", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "office outfit",
      occasion: "office",
    }));

    expect(plan.categoryQueries.top).toContain("button shirt");
    expect(plan.categoryQueries.top).toContain("oxford shirt");
    expect(plan.categoryQueries.bottom).toContain("trousers");
    expect(plan.categoryQueries.bottom).toContain("tailored pants");
    expect(plan.categoryQueries.footwear).toContain("black loafers");
  });

  it("produces warm-weather category queries for summer requests", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "summer casual outfit",
      weather: "hot",
      formality: "casual",
    }));

    expect(plan.intent.weather).toBe("hot");
    expect(plan.categoryQueries.top).toContain("linen shirt");
    expect(plan.categoryQueries.bottom).toContain("shorts");
    expect(plan.categoryQueries.footwear).toContain("summer footwear");
  });

  it("produces elevated category queries for date night", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "date night outfit",
      occasion: "dinner",
    }));

    expect(plan.intent.styleHints).toEqual(expect.arrayContaining(["elevated", "date night"]));
    expect(plan.categoryQueries.top).toContain("elevated shirt");
    expect(plan.categoryQueries.top).toContain("sleek night-out top");
    expect(plan.categoryQueries.footwear).toContain("loafers");
  });

  it("does not include office language for date-night-only queries", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "date night outfit",
      formality: "smart_casual",
    }));
    const text = JSON.stringify(plan.categoryQueries);

    expect(text).toContain("dinner");
    expect(text).toContain("sleek night-out top");
    expect(text).not.toMatch(/\boffice\b/);
    expect(text).not.toMatch(/\bprofessional\b/);
    expect(text).not.toContain("black office shoes");
    expect(text).not.toContain("clean professional shirt");
  });

  it("allows office date queries to include both office and date language", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "office date outfit",
      occasion: "office",
    }));
    const text = JSON.stringify(plan.categoryQueries);

    expect(text).toContain("office");
    expect(text).toContain("clean professional shirt");
    expect(text).toContain("sleek night-out top");
  });

  it("uses elevated dinner terms for dinner outfits", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "dinner outfit",
    }));
    const text = JSON.stringify(plan.categoryQueries);

    expect(text).toContain("dinner");
    expect(text).toContain("refined accessory");
    expect(text).toContain("dress shoes");
    expect(text).not.toContain("black office shoes");
  });

  it("keeps office/professional terms for office outfits", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "office outfit",
      occasion: "office",
    }));
    const text = JSON.stringify(plan.categoryQueries);

    expect(text).toContain("office");
    expect(text).toContain("professional");
    expect(text).toContain("black office shoes");
  });

  it("produces streetwear category queries for streetwear requests", () => {
    const plan = buildOutfitRetrievalPlan(normalizeOutfitGenerationInput({
      query: "streetwear outfit",
    }));

    expect(plan.intent.styleHints).toEqual(expect.arrayContaining(["streetwear"]));
    expect(plan.categoryQueries.top).toContain("hoodie");
    expect(plan.categoryQueries.bottom).toContain("cargos");
    expect(plan.categoryQueries.footwear).toContain("statement sneakers");
  });

  it("normalizes selected item IDs as required hard anchors", () => {
    const input = normalizeOutfitGenerationInput({
      query: "style these pants",
      selectedItemIds: ["pants-1", "pants-1", "shoe-1"],
      avoidTerms: ["sandals"],
    });

    expect(input.requiredItemIds).toEqual(["pants-1", "shoe-1"]);
    expect(input.avoidTerms).toEqual(["sandals"]);
  });

  it("injects required selected candidates into retrieval buckets", async () => {
    const requiredBottom = candidate("black-cargos", "bottom", "Black cargos", 1);
    const context = await retrieveOutfitGenerationContext("uid", {
      query: "style the pants I just added",
      selectedItemIds: ["black-cargos"],
    }, {
      retrieveRoleCandidates: async ({ role }) => {
        if (role === "top") return [candidate("shirt", "top", "White shirt")];
        if (role === "footwear") return [candidate("loafers", "footwear", "Black loafers")];
        return [];
      },
      retrieveRequiredItemCandidates: async () => ({ candidates: [requiredBottom] }),
    });

    expect(context.candidates.bottom.map((item) => item.itemId)).toContain("black-cargos");
    expect(context.diagnostics.candidateCounts.bottom).toBe(1);
  });
});

describe("canonicalizeOutfitRole", () => {
  it.each([
    ["Light blue Relaxed Fit Linen-blend shirt", "one_piece", "top"],
    ["Blue Oxford shirt", "one_piece", "top"],
    ["DRESS PENNY LOAFERS", "one_piece", "footwear"],
    ["Black Oxford shoes", "one_piece", "footwear"],
    ["Black straight trousers", "one_piece", "bottom"],
    ["Black Coated racer jacket", "top", "outerwear"],
    ["Minimal watch", "one_piece", "accessory"],
    ["Tailored jumpsuit", "top", "one_piece"],
  ])("classifies %s as %s", (name, proposedRole, expectedRole) => {
    expect(canonicalizeOutfitRole({
      name,
      category: proposedRole,
      aiMetadata: { category: proposedRole },
    }, proposedRole)).toBe(expectedRole);
  });
});

describe("canonicalizeOutfitCandidateBuckets", () => {
  it("moves candidates into canonical buckets and dedupes by highest score", () => {
    const buckets = emptyBuckets();
    buckets.one_piece = [
      candidate("shirt-1", "one_piece", "Light blue Relaxed Fit Linen-blend shirt", 0.64, "one_piece"),
      candidate("loafer-1", "one_piece", "DRESS PENNY LOAFERS", 0.7, "one_piece"),
      candidate("duplicate-shirt", "one_piece", "Blue Oxford shirt", 0.2, "one_piece"),
    ];
    buckets.top = [
      candidate("duplicate-shirt", "top", "Blue Oxford shirt", 0.95, "top"),
    ];

    const normalized = canonicalizeOutfitCandidateBuckets(buckets);

    expect(normalized.top.map((item) => item.itemId)).toEqual(expect.arrayContaining([
      "shirt-1",
      "duplicate-shirt",
    ]));
    expect(normalized.footwear.map((item) => item.itemId)).toContain("loafer-1");
    expect(normalized.one_piece.map((item) => item.itemId)).not.toContain("shirt-1");
    expect(normalized.one_piece.map((item) => item.itemId)).not.toContain("loafer-1");
    expect(normalized.top.find((item) => item.itemId === "duplicate-shirt")?.score).toBe(0.95);
    expect(normalized.top.find((item) => item.itemId === "shirt-1")?.allowedRole).toBe("top");
    expect(normalized.footwear.find((item) => item.itemId === "loafer-1")?.allowedRole).toBe("footwear");
  });
});
