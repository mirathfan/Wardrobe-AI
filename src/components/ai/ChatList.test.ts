import {
  getAuraChatBottomPadding,
  shouldShowAuraTypingBubble,
} from "./chatListLayout";
import {
  getAuraAgentRenderSource,
  shouldShowAuraAgentSourceBadge,
  shouldUseFullWidthAgentMessage,
} from "./chatMessageLayout";

describe("ChatList helpers", () => {
  it("keeps enough bottom padding for card actions above the composer and tab bar", () => {
    expect(getAuraChatBottomPadding(120)).toBe(380);
    expect(getAuraChatBottomPadding(280)).toBe(380);
    expect(getAuraChatBottomPadding(360)).toBe(380);
    expect(getAuraChatBottomPadding(420)).toBe(420);
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

  it("classifies agent, legacy, cached, and text-only render sources", () => {
    expect(
      getAuraAgentRenderSource({
        type: "assistant",
        kind: "aura_agent",
        agentResponse: { message: "agent" } as never,
      }),
    ).toBe("agent");
    expect(
      getAuraAgentRenderSource({
        type: "assistant",
        kind: "aura_card",
        aura: { look: { lookTitle: "Legacy" } } as never,
      }),
    ).toBe("legacy");
    expect(
      getAuraAgentRenderSource({
        type: "assistant",
        kind: "aura_card",
        debugSource: "cached",
        aura: { look: { lookTitle: "Cached legacy" } } as never,
      }),
    ).toBe("cached");
    expect(
      getAuraAgentRenderSource({
        type: "assistant",
        kind: "aura_text",
      }),
    ).toBe("text-only");
  });

  it("shows dev source badges only for outfit payload messages", () => {
    expect(
      shouldShowAuraAgentSourceBadge({
        type: "assistant",
        kind: "aura_agent",
        agentResponse: { message: "agent" } as never,
      }),
    ).toBe(true);
    expect(
      shouldShowAuraAgentSourceBadge({
        type: "assistant",
        kind: "aura_card",
        aura: { lookOptions: [{ lookTitle: "Legacy" }] } as never,
      }),
    ).toBe(true);
    expect(
      shouldShowAuraAgentSourceBadge({
        type: "assistant",
        kind: "aura_text",
      }),
    ).toBe(false);
  });
});
