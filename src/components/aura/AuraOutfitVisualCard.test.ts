import {
  buildAuraLookFromDailyOutfit,
  buildAuraLookFromSlotItems,
  getAuraOutfitVisualCardModeConfig,
} from "@/src/components/aura/AuraOutfitVisualCard";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { DailyOutfitRecord } from "@/src/utils/dailyOutfits";

jest.mock("@/src/components/aura/AuraLookCard", () => ({
  AuraLookCard: () => null,
}));

function item(id: string, category: string, extra: Partial<ClothingItem> = {}): ClothingItem {
  return {
    ...extra,
    id,
    brand: "AURA",
    status: "AVAILABLE",
    wearCountSinceWash: 0,
    createdAt: 0,
    category,
    name: extra.name ?? id,
  };
}

describe("AuraOutfitVisualCard helpers", () => {
  it("maps size modes to the original AuraLookCard visual variants", () => {
    expect(getAuraOutfitVisualCardModeConfig("full")).toEqual({
      compact: false,
      boardOnly: false,
      boardVariant: "chat",
    });
    expect(getAuraOutfitVisualCardModeConfig("medium")).toEqual({
      compact: true,
      boardOnly: false,
      boardVariant: "chat",
    });
    expect(getAuraOutfitVisualCardModeConfig("thumbnail")).toEqual({
      compact: true,
      boardOnly: true,
      boardVariant: "studio",
    });
  });

  it("builds a shared Aura look from a daily planned outfit", () => {
    const record: DailyOutfitRecord = {
      dateKey: "2026-06-03",
      plannedOutfit: {
        itemsByCategory: {
          top: "top-1",
          bottom: "bottom-1",
          shoes: "shoe-1",
        },
        title: "Office easy",
        source: "aura_agent",
        score: 92,
        reasons: ["Simple, polished, and wearable today."],
        createdAt: 1,
      },
    };
    const look = buildAuraLookFromDailyOutfit(
      record,
      new Map([
        ["top-1", item("top-1", "top", { name: "Blue shirt" })],
        ["bottom-1", item("bottom-1", "bottom", { name: "Black trousers" })],
        ["shoe-1", item("shoe-1", "shoes", { name: "Loafers" })],
      ]),
    );

    expect(look?.lookTitle).toBe("Office easy");
    expect(look?.vibe).toBe("AURA");
    expect(look?.pieces.map((piece) => piece.role)).toEqual(["top", "bottom", "shoes"]);
  });

  it("builds thumbnail looks from direct slot items for calendar previews", () => {
    const look = buildAuraLookFromSlotItems({
      top: item("top-1", "top", { name: "White tee" }),
      bottom: item("bottom-1", "bottom", { name: "Denim" }),
      shoes: item("shoe-1", "shoes", { name: "Sneakers" }),
    });

    expect(look?.lookTitle).toBe("Outfit preview");
    expect(look?.pieces.map((piece) => piece.itemName)).toEqual(["White tee", "Denim", "Sneakers"]);
  });
});
