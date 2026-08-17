import {
  changedTopLevelFields,
  isGeneratedFieldOnlyUpdate,
  shouldSkipIntelligenceIndexing,
} from "../skip";

describe("wardrobe intelligence indexing skip detection", () => {
  it("skips generated-field-only updates", () => {
    const before = {
      name: "Black hoodie",
      embeddingHash: "old",
    };
    const after = {
      name: "Black hoodie",
      embeddingHash: "new",
      embeddingText: "Category: top.",
      embeddingDimensions: 2048,
    };

    expect(changedTopLevelFields(before, after)).toEqual([
      "embeddingDimensions",
      "embeddingHash",
      "embeddingText",
    ]);
    expect(isGeneratedFieldOnlyUpdate(before, after)).toBe(true);
    expect(shouldSkipIntelligenceIndexing(before, after)).toBe(true);
  });

  it("does not skip user/product field updates", () => {
    const before = {
      name: "Black hoodie",
      embeddingHash: "same",
    };
    const after = {
      name: "Black Nike hoodie",
      embeddingHash: "same",
    };

    expect(shouldSkipIntelligenceIndexing(before, after)).toBe(false);
  });

  it("does not skip creates", () => {
    expect(shouldSkipIntelligenceIndexing(undefined, { name: "Black hoodie" })).toBe(false);
  });
});
