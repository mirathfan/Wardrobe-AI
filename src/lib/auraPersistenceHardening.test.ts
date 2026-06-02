/* eslint-disable import/first */
jest.mock("@/src/lib/firebase", () => ({
  db: {},
}));

jest.mock("@/src/lib/localCache", () => ({
  setCachedChatList: jest.fn(),
  setCachedRecentMessages: jest.fn(),
}));

jest.mock("firebase/firestore", () => ({
  collection: jest.fn(),
  deleteDoc: jest.fn(),
  doc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  increment: jest.fn(),
  limit: jest.fn(),
  orderBy: jest.fn(),
  query: jest.fn(),
  setDoc: jest.fn(),
  writeBatch: jest.fn(),
}));

import { sanitizeAgentResponseForStorage } from "@/src/lib/aiChats";

describe("AURA chat persistence hardening", () => {
  it("removes private fields from persisted agent responses", () => {
    const persisted = sanitizeAgentResponseForStorage({
      mode: "generate_outfit",
      message: "Here is an outfit.",
      suggestedActions: [],
      diagnostics: { langGraph: "private" },
      outfits: [
        {
          outfitId: "outfit-1",
          title: "Office fit",
          scoreBreakdown: { total: 1 },
          items: [
            {
              itemId: "shoe-1",
              name: "Loafers",
              aiMetadata: { rawVector: [1, 2, 3] },
              embeddingVector: [4, 5, 6],
            },
          ],
        },
      ],
    });

    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain("diagnostics");
    expect(serialized).not.toContain("scoreBreakdown");
    expect(serialized).not.toContain("aiMetadata");
    expect(serialized).not.toContain("embeddingVector");
    expect(serialized).not.toContain("rawVector");
    expect(persisted).toMatchObject({
      mode: "generate_outfit",
      message: "Here is an outfit.",
      outfits: [
        {
          outfitId: "outfit-1",
          items: [{ itemId: "shoe-1", name: "Loafers" }],
        },
      ],
    });
  });
});
