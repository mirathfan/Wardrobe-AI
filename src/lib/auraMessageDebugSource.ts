import type { AIMessage } from "@/src/components/ai/chatTypes";

export function markAuraMessagesDebugSource(
  messages: AIMessage[],
  debugSource: NonNullable<AIMessage["debugSource"]>,
) {
  if (!__DEV__) return messages;
  return messages.map((message) => ({ ...message, debugSource }));
}
