import { buildStructuredOutfitBatchPrompt } from "@/src/lib/auraChatHelpers";
import type { AIMessage } from "@/src/components/ai/chatTypes";

jest.mock("@/src/lib/aiChats", () => ({
  summarizeChatTitle: jest.fn(() => "AURA chat"),
}));

function userMessage(text: string): AIMessage {
  return {
    id: `user-${text}`,
    type: "user",
    kind: "user_text",
    text,
    createdAt: Date.now(),
  };
}

describe("aura chat helper prompts", () => {
  it("inherits the prior styling request for short multi-outfit follow-ups", () => {
    const prompt = buildStructuredOutfitBatchPrompt("give me three outfits", [
      userMessage("Give me an outfit for a hotel date"),
    ]);

    expect(prompt).toContain("Previous styling request: Give me an outfit for a hotel date.");
    expect(prompt).toContain("Keep the same occasion and styling intent");
    expect(prompt).toContain("Current request: give me three outfits.");
  });

  it("does not override a new explicit occasion", () => {
    const prompt = buildStructuredOutfitBatchPrompt("give me three outfits for work", [
      userMessage("Give me an outfit for a hotel date"),
    ]);

    expect(prompt).toBe("give me three outfits for work");
  });
});
