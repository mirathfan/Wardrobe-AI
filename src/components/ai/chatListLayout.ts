import type { AIMessage } from "./chatTypes";

export const AURA_CHAT_CARD_BOTTOM_PADDING = 320;

export function getAuraChatBottomPadding(contentBottomPadding: number) {
  const measured = Number.isFinite(contentBottomPadding) ? contentBottomPadding : 0;
  return Math.max(18, measured, AURA_CHAT_CARD_BOTTOM_PADDING);
}

export function shouldShowAuraTypingBubble({
  loading,
  hasStreamingMessage,
  lastMessage,
}: {
  loading: boolean;
  hasStreamingMessage: boolean;
  lastMessage?: Pick<AIMessage, "type" | "kind"> | null;
}) {
  return loading && !hasStreamingMessage && !!lastMessage && lastMessage.type === "user";
}
