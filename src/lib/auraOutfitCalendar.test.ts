import {
  buildOutfitWeatherWarnings,
  parseOutfitDateInstruction,
} from "@/shared/auraOutfitCalendar";
import { resolveReferencedOutfit } from "@/src/lib/auraAgentActions";
import type { AuraAgentOutfit, AuraAgentResponse } from "@/src/types/auraAgent";

const NOW = new Date("2026-06-01T17:00:00.000Z");

function outfit(id: string): AuraAgentOutfit {
  return {
    outfitId: id,
    title: id,
    vibe: "clean",
    occasion: "office",
    formality: "smart_casual",
    explanation: "test",
    stylingTips: [],
    missingItems: [],
    confidence: 0.8,
    items: [
      {
        itemId: `${id}-shoe`,
        role: "footwear",
        reason: "test",
        name: "Suede loafers",
        category: "shoes",
        subcategory: "loafer",
        colors: ["brown"],
        imageUrl: null,
      },
    ],
  };
}

describe("AURA outfit calendar helpers", () => {
  it("parses natural-language date instructions", () => {
    expect(parseOutfitDateInstruction("I wore this today", NOW).dateKey).toBe("2026-06-01");
    expect(parseOutfitDateInstruction("plan this outfit for tomorrow", NOW).dateKey).toBe("2026-06-02");
    expect(parseOutfitDateInstruction("I wore this yesterday", NOW).dateKey).toBe("2026-05-31");
    expect(parseOutfitDateInstruction("save this for next Friday", NOW).dateKey).toBe("2026-06-05");
    expect(parseOutfitDateInstruction("save the third one for Friday", NOW).dateKey).toBe("2026-06-05");
    expect(parseOutfitDateInstruction("save outfit 2 for tomorrow", NOW).dateKey).toBe("2026-06-02");
    expect(parseOutfitDateInstruction("wear outfit 2 tomorrow", NOW).dateKey).toBe("2026-06-02");
    expect(parseOutfitDateInstruction("I wore this last Friday", NOW).dateKey).toBe("2026-05-29");
    expect(parseOutfitDateInstruction("I wore this on May 30", NOW).dateKey).toBe("2026-05-30");
    expect(parseOutfitDateInstruction("schedule this in 2 days", NOW).dateKey).toBe("2026-06-03");
  });

  it("resolves outfit index phrases against the latest agent response", () => {
    const response = {
      outfits: [outfit("outfit-1"), outfit("outfit-2"), outfit("outfit-3")],
    } as AuraAgentResponse;

    expect(resolveReferencedOutfit("wear outfit 2 tomorrow", response, response.outfits?.[0])?.outfitId).toBe("outfit-2");
    expect(resolveReferencedOutfit("save the third one for Friday", response, response.outfits?.[0])?.outfitId).toBe("outfit-3");
    expect(resolveReferencedOutfit("plan this for tomorrow", response, response.outfits?.[1])?.outfitId).toBe("outfit-2");
  });

  it("builds deterministic weather warnings", () => {
    const warnings = buildOutfitWeatherWarnings(outfit("rainy"), {
      dateKey: "2026-06-05",
      condition: "Rain showers",
      precipitationChance: 80,
      temperatureLow: 5,
    });

    expect(warnings.map((warning) => warning.message).join(" ")).toContain("rainy");
    expect(warnings.map((warning) => warning.message).join(" ")).toContain("no outerwear");
    expect(warnings.some((warning) => warning.itemIds?.includes("rainy-shoe"))).toBe(true);
  });
});
