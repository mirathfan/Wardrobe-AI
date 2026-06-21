import type { AuraChatIntent } from "@/src/lib/auraChatHelpers";

export const AURA_AGENT_ROUTE_LOG_PREFIX = "[AURA_AGENT_ROUTE]";

export type AuraAgentRouteName = "agent" | "fallback" | "agent_failed_fallback";

export type AuraAgentRouteDecisionInput = {
  enabled: boolean;
  flagValue?: string | null;
  shouldUseAgent: boolean;
  chatIntent: AuraChatIntent;
  attachmentCount: number;
  hasPreviousOutfit?: boolean;
};

export type AuraAgentRouteDecision = {
  route: AuraAgentRouteName;
  flagValue: string | null;
  enabled: boolean;
  chatIntent: AuraChatIntent;
  attachmentCount: number;
  hasPreviousOutfit: boolean;
  reason: string;
};

export function getAuraAgentEnabledFlagValue(
  value: string | null | undefined = process.env.EXPO_PUBLIC_AURA_AGENT_ENABLED,
) {
  return String(value ?? "").trim();
}

export function isAuraAgentEnabledFlag(value = process.env.EXPO_PUBLIC_AURA_AGENT_ENABLED) {
  const normalized = getAuraAgentEnabledFlagValue(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function describeAuraAgentRouteDecision(input: AuraAgentRouteDecisionInput): AuraAgentRouteDecision {
  const flagValue = getAuraAgentEnabledFlagValue(input.flagValue);
  let reason = "agent route selected";
  if (!input.enabled) reason = "feature flag disabled";
  else if (input.attachmentCount > 0) reason = "attachments use legacy image flow";
  else if (!input.shouldUseAgent) reason = "prompt did not match agent styling route";

  return {
    route: input.shouldUseAgent ? "agent" : "fallback",
    flagValue: flagValue || null,
    enabled: input.enabled,
    chatIntent: input.chatIntent,
    attachmentCount: input.attachmentCount,
    hasPreviousOutfit: input.hasPreviousOutfit === true,
    reason,
  };
}

export function logAuraAgentRoute(
  event: string,
  payload?: Record<string, unknown>,
  logger: Pick<typeof console, "info"> = console,
) {
  logger.info(AURA_AGENT_ROUTE_LOG_PREFIX, event, payload ?? {});
}
