import {
  getAuraChatBottomPadding,
  shouldShowAuraTypingBubble,
} from "./chatListLayout";
import { shouldUseFullWidthAgentMessage } from "./chatMessageLayout";

describe("ChatList helpers", () => {
  it("keeps enough bottom padding for card actions above the composer and tab bar", () => {
    expect(getAuraChatBottomPadding(120)).toBe(320);
    expect(getAuraChatBottomPadding(280)).toBe(320);
    expect(getAuraChatBottomPadding(360)).toBe(360);
  });

  it("hides the typing bubble once an agent response is the last message", () => {
    expect(
      shouldShowAuraTypingBubble({
        loading: true,
        hasStreamingMessage: false,
        lastMessage: { type: "assistant", kind: "aura_agent" },
      }),
    ).toBe(false);
  });

  it("shows the typing bubble while waiting on a user message", () => {
    expect(
      shouldShowAuraTypingBubble({
        loading: true,
        hasStreamingMessage: false,
        lastMessage: { type: "user", kind: "user_text" },
      }),
    ).toBe(true);
  });

  it("uses full-width layout only for agent outfit messages", () => {
    expect(
      shouldUseFullWidthAgentMessage({
        kind: "aura_agent",
        agentResponse: { message: "agent" },
      }),
    ).toBe(true);
    expect(
      shouldUseFullWidthAgentMessage({
        kind: "aura_text",
        agentResponse: undefined,
      }),
    ).toBe(false);
  });
});
