import {
  formatAuraVibeLabel,
  getAgentDisplayMessage,
} from "@/src/lib/auraAgentDisplay";
import type { AuraAgentOutfit, AuraAgentResponse } from "@/src/types/auraAgent";

const baseOutfit: Pick<AuraAgentOutfit, "vibe" | "occasion" | "formality"> = {
  vibe: "clean, classic, slightly polished",
  occasion: "office",
  formality: "smart_casual",
};
const titledOutfit = { title: "Classic Blue And Black" } as AuraAgentOutfit;

describe("auraAgentDisplay", () => {
  it("formats AURA vibe labels as compact useful tags", () => {
    expect(formatAuraVibeLabel(baseOutfit)).toBe("CLEAN · CLASSIC · POLISHED");
    expect(
      formatAuraVibeLabel({
        ...baseOutfit,
        vibe: "very classic / kind of polished. a bit easy",
      }),
    ).toBe("CLASSIC · POLISHED · EASY");
    expect(
      formatAuraVibeLabel({
        ...baseOutfit,
        vibe: "classic and polished with easy base",
      }),
    ).toBe("CLASSIC · POLISHED · EASY");
  });

  it("falls back to occasion and formality when the vibe is empty", () => {
    expect(
      formatAuraVibeLabel({
        vibe: "",
        occasion: "dinner",
        formality: "smart_casual",
      }),
    ).toBe("DINNER · SMART CASUAL");
  });

  it("uses the first outfit title for the visible agent response message", () => {
    const response = {
      message: "I found one closet-based option: older title.",
      outfits: [titledOutfit],
    } as AuraAgentResponse;

    expect(getAgentDisplayMessage(response)).toBe(
      "I found one closet-based option: Classic Blue And Black.",
    );
  });

  it("uses returned outfit count for multi-outfit responses", () => {
    const response = {
      message: "I found one closet-based option: older title.",
      outfits: [
        titledOutfit,
        { title: "Soft Office Layers" },
        { title: "Minimal Dinner Fit" },
      ],
    } as AuraAgentResponse;

    expect(getAgentDisplayMessage(response)).toBe(
      "I found 3 closet-based options. First up: Classic Blue And Black.",
    );
  });

  it("uses shortage copy when requested count is higher than returned count", () => {
    const response = {
      message: "I found one closet-based option: older title.",
      requestedCount: 3,
      outfits: [titledOutfit],
    } as AuraAgentResponse;

    expect(getAgentDisplayMessage(response)).toBe(
      "I found 1 closet-based option from your current wardrobe.",
    );
  });

  it("falls back when no complete outfit was returned", () => {
    expect(getAgentDisplayMessage({ message: "", outfits: [] } as unknown as AuraAgentResponse)).toBe(
      "I couldn't find a complete outfit yet.",
    );
  });
});
