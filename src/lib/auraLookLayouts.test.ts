import {
  buildRenderPlan,
  detectOutfitLayoutType,
  type BoardPiece,
} from "@/src/lib/auraLookLayouts";
import type { AuraLook, AuraLookPiece } from "@/src/types/aura";

function lookPiece(
  role: AuraLookPiece["role"],
  itemName: string,
): AuraLookPiece {
  const id = itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return {
    role,
    itemName,
    source: "closet",
    itemId: id,
    imageUrl: `https://example.com/${id}.png`,
  };
}

function makeLook(pieces: AuraLookPiece[]): AuraLook {
  return {
    lookTitle: "Balanced flatlay",
    vibe: "clean",
    shortExplanation: "A balanced outfit preview.",
    pieces,
    fromCloset: pieces.map((piece) => piece.itemId ?? piece.itemName),
    addToComplete: [],
    alternates: [],
    actions: [],
  };
}

function centerX(item: { leftPct: number; widthPct: number }) {
  return item.leftPct + item.widthPct / 2;
}

describe("AURA flatlay canvas layouts", () => {
  it("keeps five-item saved/profile flatlays on the old balanced classic layout", () => {
    const plan = buildRenderPlan(
      makeLook([
        lookPiece("top", "Black tee"),
        lookPiece("bottom", "Gray pants"),
        lookPiece("outerwear", "Black jacket"),
        lookPiece("shoes", "White sneakers"),
        lookPiece("accessory", "Silver watch"),
      ]),
      undefined,
      { variant: "home" },
    );

    expect(plan.layoutType).toBe("classic_full");
    expect(plan.placedItems.map((item) => item.slotName)).toEqual(
      expect.arrayContaining([
        "layered-shirt",
        "layered-jacket",
        "bottom-center",
        "bottom-left-shoes",
      ]),
    );

    const bottom = plan.placedItems.find((item) => item.slotKind === "bottom");
    const jacket = plan.placedItems.find((item) => item.slotKind === "outerwear");
    expect(bottom).toBeTruthy();
    expect(jacket).toBeTruthy();
    expect(centerX(bottom!)).toBeLessThanOrEqual(56);
    expect(centerX(bottom!)).toBeLessThan(centerX(jacket!));
    expect(plan.stripItems.map((item) => item.itemName)).toContain("Silver watch");
  });

  it("does not use the Today Look stretched tile layout for three-item flatlays", () => {
    const plan = buildRenderPlan(
      makeLook([
        lookPiece("top", "Light blue polo"),
        lookPiece("bottom", "Black trousers"),
        lookPiece("shoes", "Black loafers"),
      ]),
      undefined,
      { variant: "home" },
    );

    expect(plan.layoutType).toBe("no_jacket");
    expect(plan.placedItems.map((item) => item.slotName)).toEqual(
      expect.arrayContaining([
        "left-top-alone",
        "bottom-no-jacket",
        "bottom-left-shoes",
      ]),
    );
    expect(plan.placedItems.some((item) => item.slotName.includes("core-three"))).toBe(false);
  });

  it("routes top, bottom, footwear, and outerwear canvas pieces to classic_full", () => {
    const pieces = [
      { key: "top", role: "top", itemName: "Tee", searchTokens: "tee" },
      { key: "bottom", role: "bottom", itemName: "Pants", searchTokens: "pants" },
      { key: "outerwear", role: "outerwear", itemName: "Jacket", searchTokens: "jacket" },
      { key: "shoes", role: "footwear", itemName: "Sneakers", searchTokens: "sneakers" },
    ].map((piece) => ({
      source: "closet",
      ...piece,
    })) as BoardPiece[];

    expect(detectOutfitLayoutType(pieces)).toBe("classic_full");
  });
});
