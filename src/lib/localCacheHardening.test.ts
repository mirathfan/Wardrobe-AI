/* eslint-disable import/first */
jest.mock("@/src/lib/storage", () => ({
  Storage: {
    getAllKeys: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

import { sanitizeChatMessageForCache } from "@/src/lib/localCache";
import type { AIMessage } from "@/src/components/ai/chatTypes";

describe("AURA local cache hardening", () => {
  it("removes diagnostics and vectors from cached agent responses", () => {
    const message = {
      id: "message-1",
      type: "assistant",
      kind: "aura_agent",
      createdAt: 1,
      agentResponse: {
        mode: "generate_outfit",
        message: "Here is an outfit.",
        suggestedActions: [],
        diagnostics: { trace: "debug" },
        outfits: [
          {
            outfitId: "outfit-1",
            title: "Office fit",
            scoreBreakdown: { total: 1 },
            items: [
              {
                itemId: "shoe-1",
                name: "Loafers",
                queryVector: [1, 2, 3],
                aiMetadata: { rawVector: [4] },
              },
            ],
          },
        ],
      },
    } as unknown as AIMessage;

    const cached = sanitizeChatMessageForCache(message);
    const serialized = JSON.stringify(cached);

    expect(cached?.agentResponse).toMatchObject({
      mode: "generate_outfit",
      message: "Here is an outfit.",
    });
    expect(serialized).not.toContain("diagnostics");
    expect(serialized).not.toContain("scoreBreakdown");
    expect(serialized).not.toContain("queryVector");
    expect(serialized).not.toContain("aiMetadata");
    expect(serialized).not.toContain("rawVector");
  });
});
