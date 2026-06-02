import type { AIMessage } from "./chatTypes";

export const AGENT_MESSAGE_HORIZONTAL_PADDING = 6;

export function shouldUseFullWidthAgentMessage(
  message: Pick<AIMessage, "kind"> & { agentResponse?: unknown },
) {
  return message.kind === "aura_agent" && !!message.agentResponse;
}
