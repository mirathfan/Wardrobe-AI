import { buildClosetItemEmbeddingText } from "../embeddingText";
import { normalizeClosetItemMetadata } from "../metadata";
import { blackOversizedNikeHoodie } from "./fixtures";

describe("buildClosetItemEmbeddingText", () => {
  it("builds concise semantic text with stable wardrobe signals", () => {
    const metadata = normalizeClosetItemMetadata(blackOversizedNikeHoodie);
    const text = buildClosetItemEmbeddingText(blackOversizedNikeHoodie, metadata);

    expect(text).toContain("Category: top.");
    expect(text).toContain("Subcategory: hoodie.");
    expect(text).toContain("Name: Black oversized Nike hoodie.");
    expect(text).toContain("Brand: Nike.");
    expect(text).toContain("Colors: black.");
    expect(text).toContain("Fit: oversized.");
    expect(text).toContain("Material: cotton fleece.");
    expect(text).toContain("Formality: 1/5.");
    expect(text).toContain("Warmth:");
    expect(text.length).toBeLessThanOrEqual(1000);
  });

  it("removes URLs and email-like private data from notes", () => {
    const item = {
      ...blackOversizedNikeHoodie,
      notes: "Source https://example.com/item and email person@example.com. Keep with denim.",
    };
    const text = buildClosetItemEmbeddingText(item, normalizeClosetItemMetadata(item));

    expect(text).not.toContain("https://example.com");
    expect(text).not.toContain("person@example.com");
    expect(text).toContain("Keep with denim.");
  });
});
