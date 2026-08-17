/* eslint-disable import/first */
jest.mock("@/src/lib/firebase", () => ({
  db: {},
}));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  serverTimestamp: jest.fn(() => "server-timestamp"),
  setDoc: jest.fn(),
}));

import {
  normalizeSavedOutfit,
  savedOutfitItemCount,
  savedOutfitSubtitle,
  savedOutfitToAgentOutfit,
} from "@/src/lib/savedOutfits";

describe("saved outfit helpers", () => {
  const rawSavedOutfit = {
    source: "aura_agent",
    title: "Blue office fit",
    vibe: "clean",
    occasion: "office",
    formality: "business_casual",
    itemIds: ["shirt-1", "pants-1"],
    items: [
      {
        itemId: "shirt-1",
        role: "top",
        name: "Blue Shirt",
        category: "shirt",
        subcategory: "button up",
        brand: "AURA",
        colors: ["blue", "white"],
        imageUrl: "https://example.com/shirt.png",
        reason: "Keeps the look polished.",
        aiMetadata: { vector: [1, 2, 3] },
      },
      {
        itemId: "shoe-1",
        role: "shoes",
        name: "Black Loafers",
        category: "shoes",
        colors: ["black"],
        imageUrl: null,
      },
    ],
    explanation: "Balanced for work.",
    stylingTips: ["Wear with a watch."],
    missingItems: ["rain coat"],
    outfitFingerprint: "fingerprint-1",
    sourceQuery: "Give me an office outfit",
    savedAtMs: 1_717_200_000_000,
  };

  it("normalizes the savedOutfits document shape used by the lookbook", () => {
    const record = normalizeSavedOutfit("saved-1", rawSavedOutfit);

    expect(record).toMatchObject({
      id: "saved-1",
      source: "aura_agent",
      title: "Blue office fit",
      formality: "business_casual",
      itemIds: ["shirt-1", "pants-1", "shoe-1"],
      active: true,
    });
    expect(record?.items[1]?.role).toBe("footwear");
    expect(savedOutfitItemCount(record!)).toBe(3);
    expect(savedOutfitSubtitle(record!)).toBe("office · clean");
  });

  it("converts saved outfits back to agent outfits without debug fields", () => {
    const record = normalizeSavedOutfit("saved-1", rawSavedOutfit);
    const outfit = savedOutfitToAgentOutfit(record!);

    expect(outfit).toMatchObject({
      outfitId: "saved-1",
      title: "Blue office fit",
      occasion: "office",
      items: [
        expect.objectContaining({
          itemId: "shirt-1",
          role: "top",
          imageUrl: "https://example.com/shirt.png",
        }),
        expect.objectContaining({
          itemId: "shoe-1",
          role: "footwear",
        }),
      ],
    });
    expect(JSON.stringify(outfit)).not.toContain("aiMetadata");
  });

  it("ignores inactive saved outfit records", () => {
    expect(normalizeSavedOutfit("saved-2", { ...rawSavedOutfit, active: false })).toBeNull();
  });
});
