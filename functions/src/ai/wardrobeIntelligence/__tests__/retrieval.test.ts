import { HttpsError } from "firebase-functions/v2/https";
import {
  buildCategoryBuckets,
  buildRetrievalReason,
  buildWardrobeRetrievalResults,
  categoryBucket,
  normalizeWardrobeRetrievalInput,
  rawVectorLimit,
  scoreFromCosineDistance,
} from "../retrieval";
import type { ClosetItemDocument, NormalizedClosetItemMetadata } from "../types";

const readyBase: ClosetItemDocument = {
  name: "Ready item",
  status: "AVAILABLE",
  isDraft: false,
  itemLifecycleStatus: "ready",
  draftState: "ready",
  ingestionStatus: "done",
  embeddingVector: [0.1, 0.2],
};

function metadata(overrides: Partial<NormalizedClosetItemMetadata> = {}): Partial<NormalizedClosetItemMetadata> {
  return {
    category: "top",
    colors: ["black"],
    fit: "regular",
    formality: 2,
    warmth: 2,
    styleTags: ["minimal"],
    occasionTags: ["office"],
    seasonTags: ["summer"],
    weatherTags: ["warm"],
    searchAliases: ["black top"],
    confidence: 0.8,
    source: "deterministic",
    updatedAt: null,
    ...overrides,
  };
}

describe("wardrobe retrieval validation", () => {
  it("requires a non-empty query", () => {
    expect(() => normalizeWardrobeRetrievalInput({ query: " " })).toThrow(HttpsError);
  });

  it("normalizes limit, formality, and comma-separated filters", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "office outfit",
      limit: 500,
      formality: "smart casual",
      categories: "top, footwear",
      colors: "black, white",
    });

    expect(input.limit).toBe(50);
    expect(input.formality).toBe("smart_casual");
    expect(input.categories).toEqual(["top", "footwear"]);
    expect(input.colors).toEqual(["black", "white"]);
  });
});

describe("wardrobe retrieval ranking helpers", () => {
  it("uses bounded raw vector batch limits", () => {
    expect(rawVectorLimit(12)).toBe(36);
    expect(rawVectorLimit(50)).toBe(100);
  });

  it("converts cosine distance into a bounded similarity score", () => {
    expect(scoreFromCosineDistance(0)).toBe(1);
    expect(scoreFromCosineDistance(0.24321)).toBe(0.7568);
    expect(scoreFromCosineDistance(1.2)).toBe(0);
    expect(scoreFromCosineDistance(undefined)).toBeNull();
  });

  it("maps shoes into the retrieval footwear bucket", () => {
    expect(categoryBucket("shoes")).toBe("footwear");
    expect(categoryBucket("black leather loafers")).toBe("footwear");
    expect(categoryBucket("DRESS PENNY LOAFERS")).toBe("footwear");
  });

  it("filters to ready items with embedding vectors", () => {
    const input = normalizeWardrobeRetrievalInput({ query: "black outfit", limit: 10 });
    const results = buildWardrobeRetrievalResults(input, [
      {
        itemId: "ready",
        distance: 0.2,
        item: { ...readyBase, name: "Black tee", aiMetadata: metadata() },
      },
      {
        itemId: "draft",
        distance: 0.1,
        item: { ...readyBase, name: "Draft tee", isDraft: true, aiMetadata: metadata() },
      },
      {
        itemId: "missing-vector",
        distance: 0.1,
        item: { ...readyBase, name: "Missing vector", embeddingVector: undefined, aiMetadata: metadata() },
      },
    ]);

    expect(results.map((result) => result.itemId)).toEqual(["ready"]);
  });

  it("builds ranked category buckets without changing result order", () => {
    const input = normalizeWardrobeRetrievalInput({ query: "office outfit", limit: 10 });
    const results = buildWardrobeRetrievalResults(input, [
      {
        itemId: "loafers",
        distance: 0.1,
        item: {
          ...readyBase,
          name: "Black leather loafers",
          category: "footwear",
          aiMetadata: metadata({ category: "shoes", subcategory: "loafer", formality: 4 }),
        },
      },
      {
        itemId: "shirt",
        distance: 0.2,
        item: {
          ...readyBase,
          name: "White Oxford shirt",
          category: "top",
          aiMetadata: metadata({ category: "top", colors: ["white"], subcategory: "shirt", formality: 3 }),
        },
      },
    ]);
    const buckets = buildCategoryBuckets(results);

    expect(buckets.footwear.map((item) => item.itemId)).toEqual(["loafers"]);
    expect(buckets.top.map((item) => item.itemId)).toEqual(["shirt"]);
  });

  it("puts loafers in footwear, not one_piece, even if stored metadata is stale", () => {
    const input = normalizeWardrobeRetrievalInput({ query: "office outfit with black shoes", limit: 10 });
    const results = buildWardrobeRetrievalResults(input, [
      {
        itemId: "dress-penny-loafers",
        distance: 0.2,
        item: {
          ...readyBase,
          name: "DRESS PENNY LOAFERS",
          category: "Shoes",
          aiMetadata: metadata({ category: "one_piece", subcategory: "dress", formality: 1 }),
        },
      },
    ]);
    const buckets = buildCategoryBuckets(results);

    expect(results[0].category).toBe("footwear");
    expect(results[0].aiMetadata.category).toBe("shoes");
    expect(buckets.footwear.map((item) => item.itemId)).toEqual(["dress-penny-loafers"]);
    expect(buckets.one_piece).toEqual([]);
  });

  it("builds deterministic reasons from filters and metadata", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "office outfit with black shoes",
      occasion: "office",
      formality: "smart_casual",
      categories: ["footwear"],
      colors: ["black"],
    });
    const item: ClosetItemDocument = {
      ...readyBase,
      name: "Black leather loafers",
      category: "footwear",
      aiMetadata: metadata({
        category: "shoes",
        subcategory: "loafer",
        colors: ["black"],
        formality: 4,
        occasionTags: ["office", "dinner"],
      }),
    };

    const reason = buildRetrievalReason(input, item, item.aiMetadata as NormalizedClosetItemMetadata);

    expect(reason).toContain("matches black color");
    expect(reason).toContain("matches footwear category");
    expect(reason).toContain("fits office occasion");
  });

  it("penalizes tank tops for office queries", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "office outfit",
      occasion: "office",
      formality: "smart_casual",
      limit: 10,
    });
    const results = buildWardrobeRetrievalResults(input, [
      {
        itemId: "tank",
        distance: 0.05,
        item: {
          ...readyBase,
          name: "Black tank top",
          category: "top",
          aiMetadata: metadata({ category: "top", subcategory: "tank", formality: 1 }),
        },
      },
    ]);

    expect(results[0].vectorScore).toBe(0.95);
    expect(results[0].score).toBeLessThan(results[0].vectorScore ?? 0);
    expect(results[0].penaltiesApplied).toEqual(expect.arrayContaining([
      "penalized: sleeveless top is weak for office",
    ]));
    expect(results[0].reason).toContain("penalized: sleeveless top is weak for office");
  });

  it("boosts loafers and trousers for office queries", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "office outfit with black shoes",
      occasion: "office",
      formality: "smart_casual",
      limit: 10,
    });
    const results = buildWardrobeRetrievalResults(input, [
      {
        itemId: "loafers",
        distance: 0.3,
        item: {
          ...readyBase,
          name: "Black leather penny loafers",
          category: "footwear",
          aiMetadata: metadata({ category: "shoes", subcategory: "loafer", formality: 4 }),
        },
      },
      {
        itemId: "trousers",
        distance: 0.35,
        item: {
          ...readyBase,
          name: "Straight trousers",
          category: "bottom",
          aiMetadata: metadata({ category: "bottom", subcategory: "trousers", formality: 3 }),
        },
      },
    ]);

    expect(results.find((item) => item.itemId === "loafers")?.boostsApplied).toEqual(expect.arrayContaining([
      "boosted: loafer matches smart casual office",
    ]));
    expect(results.find((item) => item.itemId === "trousers")?.boostsApplied).toEqual(expect.arrayContaining([
      "boosted: trousers match smart casual office",
    ]));
  });

  it("penalizes graphic tees for office queries", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "smart casual office outfit",
      formality: "smart_casual",
      limit: 10,
    });
    const results = buildWardrobeRetrievalResults(input, [
      {
        itemId: "graphic-tee",
        distance: 0.1,
        item: {
          ...readyBase,
          name: "Loud graphic tee",
          category: "top",
          aiMetadata: metadata({ category: "top", subcategory: "tee", formality: 1, styleTags: ["streetwear"] }),
        },
      },
    ]);

    expect(results[0].penaltiesApplied).toEqual(expect.arrayContaining([
      "penalized: graphic tee is weak for office",
    ]));
  });

  it("reranks office results by final score instead of raw vector score", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "office outfit with black shoes",
      occasion: "office",
      formality: "smart_casual",
      limit: 3,
    });
    const results = buildWardrobeRetrievalResults(input, [
      {
        itemId: "tank",
        distance: 0.02,
        item: {
          ...readyBase,
          name: "Black tank top",
          category: "top",
          aiMetadata: metadata({ category: "top", subcategory: "tank", formality: 1 }),
        },
      },
      {
        itemId: "loafers",
        distance: 0.18,
        item: {
          ...readyBase,
          name: "Black leather loafers",
          category: "footwear",
          aiMetadata: metadata({ category: "shoes", subcategory: "loafer", formality: 4 }),
        },
      },
      {
        itemId: "trousers",
        distance: 0.22,
        item: {
          ...readyBase,
          name: "Straight trousers",
          category: "bottom",
          aiMetadata: metadata({ category: "bottom", subcategory: "trousers", formality: 3 }),
        },
      },
    ]);

    expect(results[0].itemId).toBe("loafers");
    expect(results.map((item) => item.itemId)).toEqual(["loafers", "trousers", "tank"]);
    expect(results.find((item) => item.itemId === "tank")?.vectorScore).toBeGreaterThan(
      results.find((item) => item.itemId === "loafers")?.vectorScore ?? 0,
    );
  });
});
