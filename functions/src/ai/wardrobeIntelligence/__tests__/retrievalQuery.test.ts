import { normalizeWardrobeRetrievalInput } from "../retrieval";
import { buildWardrobeRetrievalQueryText } from "../retrievalQuery";

describe("buildWardrobeRetrievalQueryText", () => {
  it("adds deterministic office and black footwear retrieval context", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "office outfit with black shoes",
      occasion: "office",
      formality: "smart_casual",
    });
    const text = buildWardrobeRetrievalQueryText(input);

    expect(text).toContain("Occasion: office.");
    expect(text).toContain("Formality: smart casual.");
    expect(text).toContain("Style: clean, polished, professional, smart casual");
    expect(text).toContain("trousers");
    expect(text).toContain("loafers");
    expect(text).toContain("button shirts");
    expect(text).toContain("minimal sneakers");
    expect(text).toContain("black");
    expect(text).toContain("footwear");
    expect(text.length).toBeLessThanOrEqual(1000);
  });

  it("adds warm-weather vacation synonyms for summer beach requests", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "summer beach outfit",
      weather: "hot",
      formality: "casual",
      styleTags: ["vacation"],
    });
    const text = buildWardrobeRetrievalQueryText(input);

    expect(text).toContain("Weather: hot.");
    expect(text).toContain("Formality: casual.");
    expect(text).toContain("breathable");
    expect(text).toContain("linen");
    expect(text).toContain("cotton");
    expect(text).toContain("relaxed");
    expect(text).toContain("sandals");
    expect(text).toContain("resort shirts");
    expect(text).toContain("shorts");
  });

  it("is deterministic for the same normalized input", () => {
    const input = normalizeWardrobeRetrievalInput({
      query: "smart casual dinner",
      occasion: "dinner",
      formality: "smart casual",
      styleTags: "classic, minimal",
    });

    expect(buildWardrobeRetrievalQueryText(input)).toBe(buildWardrobeRetrievalQueryText(input));
  });
});
