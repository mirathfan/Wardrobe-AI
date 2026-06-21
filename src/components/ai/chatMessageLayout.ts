import type { AIMessage } from "./chatTypes";

export const AGENT_MESSAGE_HORIZONTAL_PADDING = 6;

export function shouldUseFullWidthAgentMessage(
  message: Pick<AIMessage, "kind"> & { agentResponse?: unknown },
) {
  return message.kind === "aura_agent" && !!message.agentResponse;
}

export type AuraAgentRenderSource = "agent" | "legacy" | "cached" | "text-only";

export function getAuraAgentRenderSource(
  message: Pick<AIMessage, "agentResponse" | "aura" | "debugSource" | "kind" | "outfits" | "type">,
): AuraAgentRenderSource {
  const hasOutfitPayload =
    !!message.agentResponse ||
    !!message.aura?.look ||
    !!message.aura?.lookOptions?.length ||
    !!message.outfits?.length;
  if (message.debugSource === "cached" && hasOutfitPayload) return "cached";
  if (message.agentResponse) return "agent";
  if (message.aura?.look || message.aura?.lookOptions?.length || message.outfits?.length) return "legacy";
  return "text-only";
}

export function shouldShowAuraAgentSourceBadge(
  message: Pick<AIMessage, "agentResponse" | "aura" | "debugSource" | "kind" | "outfits" | "type">,
) {
  const source = getAuraAgentRenderSource(message);
  return source === "agent" || source === "legacy" || source === "cached";
}
