import { hashEmbeddingInput } from "../hash";

describe("hashEmbeddingInput", () => {
  it("is deterministic for the same input", () => {
    const first = hashEmbeddingInput("Category: top.", 1, 1, "text-embedding-3-large", 2048);
    const second = hashEmbeddingInput("Category: top.", 1, 1, "text-embedding-3-large", 2048);

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });

  it("changes when embedding configuration changes", () => {
    const first = hashEmbeddingInput("Category: top.", 1, 1, "text-embedding-3-large", 2048);
    const second = hashEmbeddingInput("Category: top.", 1, 1, "text-embedding-3-large", 1024);

    expect(first).not.toBe(second);
  });
});
