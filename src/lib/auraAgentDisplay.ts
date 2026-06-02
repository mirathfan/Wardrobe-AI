import type { AuraAgentOutfit, AuraAgentResponse } from "@/src/types/auraAgent";

const FILLER_PHRASES = [
  "kind of",
  "a bit",
  "slightly",
  "very",
  "really",
  "pretty",
  "somewhat",
];
const TOKEN_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "base",
  "for",
  "leaning",
  "the",
  "with",
]);

function compactText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeLabelToken(value: string) {
  let token = compactText(value)
    .replace(/_/g, " ")
    .replace(/\bdirection\b/gi, "")
    .replace(/\blook\b/gi, "");
  for (const phrase of FILLER_PHRASES) {
    token = token.replace(new RegExp(`\\b${phrase}\\b`, "gi"), "");
  }
  return compactText(token.replace(/^[^\w]+|[^\w]+$/g, ""));
}

function titleFallbackToken(value: unknown) {
  return normalizeLabelToken(compactText(value))
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractVibeTokens(value: unknown) {
  const normalized = normalizeLabelToken(compactText(value));
  if (!normalized) return [];

  const explicitParts = normalized
    .split(/[,./]+/g)
    .map(normalizeLabelToken)
    .filter(Boolean);
  if (explicitParts.length > 1) return explicitParts;

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [normalized];
  return words.filter((word) => word.length > 2 && !TOKEN_STOP_WORDS.has(word.toLowerCase()));
}

export function formatAuraVibeLabel(
  outfit: Pick<AuraAgentOutfit, "vibe" | "occasion" | "formality">,
) {
  const tokens = extractVibeTokens(outfit.vibe);
  const fallbackTokens = [
    titleFallbackToken(outfit.occasion),
    titleFallbackToken(outfit.formality),
  ].filter(Boolean);
  const uniqueTokens: string[] = [];

  for (const token of [...tokens, ...(!tokens.length ? fallbackTokens : [])]) {
    const normalized = normalizeLabelToken(token);
    if (!normalized) continue;
    const upper = normalized.toUpperCase();
    if (uniqueTokens.includes(upper)) continue;
    uniqueTokens.push(upper);
    if (uniqueTokens.length >= 3) break;
  }

  return uniqueTokens.join(" · ");
}

export function getAgentDisplayMessage(agentResponse?: AuraAgentResponse | null) {
  const outfits = agentResponse?.outfits ?? [];
  const returnedCount = outfits.length;
  const requestedCount = Number(agentResponse?.requestedCount);
  const firstTitle = compactText(outfits[0]?.title);

  if (!returnedCount) {
    return compactText(agentResponse?.message) || "I couldn't find a complete outfit yet.";
  }

  if (
    Number.isFinite(requestedCount) &&
    requestedCount > returnedCount &&
    returnedCount === 1
  ) {
    return "I found 1 closet-based option from your current wardrobe.";
  }

  if (firstTitle) {
    return returnedCount > 1
      ? `I found ${returnedCount} closet-based options. First up: ${firstTitle}.`
      : `I found one closet-based option: ${firstTitle}.`;
  }

  return returnedCount === 1
    ? "I found one closet-based option."
    : `I found ${returnedCount} closet-based options.`;
}
