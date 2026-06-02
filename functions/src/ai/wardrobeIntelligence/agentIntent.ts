import type { WardrobeRetrievalFormality } from "./retrievalTypes";
import type { OutfitRole } from "./outfitTypes";
import type { FeedbackType } from "./styleMemoryTypes";
import type {
  AuraStylingAgentIntent,
  AuraStylingAgentMode,
  AuraStylingAgentRequest,
  AuraStylingAgentRequestMode,
} from "./agentTypes";

const VALID_MODES = new Set<AuraStylingAgentMode>([
  "generate_outfit",
  "refine_outfit",
  "explain_outfit",
  "feedback",
  "unknown",
]);

const VALID_FEEDBACK_TYPES = new Set<FeedbackType>([
  "like",
  "dislike",
  "save",
  "wear",
  "not_my_vibe",
  "more_like_this",
  "less_like_this",
  "too_formal",
  "too_casual",
  "more_formal",
  "more_casual",
  "more_streetwear",
  "less_streetwear",
  "more_color",
  "less_color",
  "prefer_item",
  "avoid_item",
  "manual_note",
]);
const COUNT_WORDS: Record<string, number> = {
  one: 1,
  single: 1,
  two: 2,
  couple: 2,
  three: 3,
  few: 3,
  four: 4,
  five: 5,
};
const COUNT_TARGET_RE = "(?:outfits?|looks?|options?|fits?)";
const BETWEEN_WORDS_RE = "(?:\\s+[a-z]+){0,3}";
const NUMBER_COUNT_RE = new RegExp(`\\b(\\d{1,2})${BETWEEN_WORDS_RE}\\s+${COUNT_TARGET_RE}\\b`, "i");
const WORD_COUNT_RE = new RegExp(
  `\\b(?:a\\s+)?(${Object.keys(COUNT_WORDS).join("|")})${BETWEEN_WORDS_RE}\\s+${COUNT_TARGET_RE}\\b`,
  "i",
);

const COLOR_WORDS = [
  "black",
  "white",
  "blue",
  "navy",
  "gray",
  "grey",
  "brown",
  "tan",
  "beige",
  "cream",
  "green",
  "red",
  "orange",
  "yellow",
  "pink",
  "purple",
];

const ROLE_WORDS: Record<OutfitRole, RegExp> = {
  top: /\b(top|shirt|tee|t-shirt|polo|blouse|sweater|hoodie)\b/,
  bottom: /\b(bottom|pants|trousers|jeans|shorts|skirt)\b/,
  footwear: /\b(shoe|shoes|sneaker|sneakers|loafer|loafers|boot|boots|footwear)\b/,
  outerwear: /\b(jacket|coat|outerwear|blazer|overshirt|layer)\b/,
  accessory: /\b(accessory|watch|belt|bag|cap|hat|jewelry)\b/,
  one_piece: /\b(dress|jumpsuit|one piece|one-piece|one_piece)\b/,
};

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedText(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampRequestedOutfitCount(count: number): number {
  return Math.max(1, Math.min(5, Math.round(count)));
}

export function extractRequestedOutfitCount(query: string): number | undefined {
  const text = normalizedText(String(query ?? "").replace(/[^a-z0-9\s_-]/gi, " "));
  if (!text) return undefined;
  const numeric = text.match(NUMBER_COUNT_RE);
  if (numeric?.[1]) {
    const count = Number.parseInt(numeric[1], 10);
    return Number.isFinite(count) ? clampRequestedOutfitCount(count) : undefined;
  }
  const word = text.match(WORD_COUNT_RE)?.[1];
  if (!word) return undefined;
  return clampRequestedOutfitCount(COUNT_WORDS[word] ?? 1);
}

export function resolveRequestedOutfitCount(request: AuraStylingAgentRequest): number | undefined {
  const explicit = Number(request.count);
  if (Number.isFinite(explicit) && explicit > 0) return clampRequestedOutfitCount(explicit);
  return extractRequestedOutfitCount(cleanText(request.query));
}

function unique(values: string[], limit = 12): string[] {
  return [...new Set(values.map(normalizedText).filter(Boolean))].slice(0, limit);
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (typeof value === "string") return value.split(",").map(cleanText).filter(Boolean);
  return [];
}

function normalizedMode(value: unknown): AuraStylingAgentRequestMode {
  const mode = cleanText(value).toLowerCase() as AuraStylingAgentRequestMode;
  if (mode === "auto") return "auto";
  return VALID_MODES.has(mode as AuraStylingAgentMode) ? mode : "auto";
}

function normalizedFormality(value: unknown, text: string): WardrobeRetrievalFormality {
  const explicit = normalizedText(value);
  if (explicit === "smart casual") return "smart_casual";
  if (explicit === "casual" || explicit === "smart_casual" || explicit === "formal" || explicit === "any") {
    return explicit;
  }
  if (/\b(black tie|wedding|gala|formal)\b/.test(text)) return "formal";
  if (/\b(office|work|interview|business|professional|meeting|corporate|date|dinner|night out)\b/.test(text)) {
    return "smart_casual";
  }
  if (/\b(casual|streetwear|street|summer|beach|vacation|resort|relaxed)\b/.test(text)) return "casual";
  return "any";
}

function inferOccasion(request: AuraStylingAgentRequest, text: string): string | undefined {
  const explicit = cleanText(request.occasion);
  if (explicit) return explicit;
  if (/\b(office|work|interview|business|professional|meeting|corporate|workwear)\b/.test(text)) return "office";
  if (/\b(date|date night|dinner|night out|evening|restaurant)\b/.test(text)) return "dinner";
  if (/\b(streetwear|street)\b/.test(text)) return "streetwear";
  if (/\b(summer|beach|vacation|resort|pool)\b/.test(text)) return "vacation";
  if (/\b(wedding|gala)\b/.test(text)) return "formal event";
  return undefined;
}

function inferWeather(request: AuraStylingAgentRequest, text: string): string | undefined {
  const explicit = cleanText(request.weather);
  if (explicit) return explicit;
  if (/\b(rain|rainy|storm|wet|drizzle)\b/.test(text)) return "rain";
  if (/\b(summer|hot|warm|beach|vacation|resort|pool)\b/.test(text)) return "hot";
  if (/\b(cold|winter|chilly|snow)\b/.test(text)) return "cold";
  return undefined;
}

function inferColors(request: AuraStylingAgentRequest, text: string): string[] {
  return unique([
    ...stringArray(request.preferredColors),
    ...stringArray(request.requiredColors),
    ...COLOR_WORDS.filter((color) => new RegExp(`\\b${color}\\b`).test(text)),
  ], 10).map((color) => color === "grey" ? "gray" : color);
}

function inferRequiredCategories(request: AuraStylingAgentRequest, text: string): OutfitRole[] {
  const requested = stringArray(request.requiredCategories).flatMap((entry) => {
    const normalized = normalizedText(entry);
    if (normalized === "shoes" || normalized === "shoe") return ["footwear" as OutfitRole];
    return (Object.keys(ROLE_WORDS) as OutfitRole[]).includes(normalized as OutfitRole)
      ? [normalized as OutfitRole]
      : [];
  });
  const fromText = (Object.entries(ROLE_WORDS) as [OutfitRole, RegExp][])
    .filter(([, pattern]) => pattern.test(text))
    .map(([role]) => role);
  return [...new Set([...requested, ...fromText])];
}

function styleHints(text: string): string[] {
  const hints: string[] = [];
  if (/\b(streetwear|street|sneaker|hoodie|cargo|graphic)\b/.test(text)) hints.push("streetwear");
  if (/\b(office|work|professional|meeting)\b/.test(text)) hints.push("polished", "professional");
  if (/\b(date|dinner|night out)\b/.test(text)) hints.push("elevated", "date night");
  if (/\b(minimal|clean|neutral)\b/.test(text)) hints.push("minimal", "clean");
  if (/\b(summer|beach|hot|warm)\b/.test(text)) hints.push("warm weather", "breathable");
  return [...new Set(hints)];
}

function inferFeedbackType(request: AuraStylingAgentRequest, text: string): FeedbackType | undefined {
  if (request.feedbackType && VALID_FEEDBACK_TYPES.has(request.feedbackType)) return request.feedbackType;
  if (/\b(not my vibe|dislike|hate)\b/.test(text)) return "not_my_vibe";
  if (/\b(save|saved)\b/.test(text)) return "save";
  if (/\b(wore|wearing|wear this)\b/.test(text)) return "wear";
  if (/\b(more like this|more of this)\b/.test(text)) return "more_like_this";
  if (/\b(less like this|fewer like this)\b/.test(text)) return "less_like_this";
  if (/\b(too formal)\b/.test(text)) return "too_formal";
  if (/\b(too casual)\b/.test(text)) return "too_casual";
  if (/\b(more streetwear)\b/.test(text)) return "more_streetwear";
  if (/\b(less streetwear)\b/.test(text)) return "less_streetwear";
  if (/\b(more color|more colorful)\b/.test(text)) return "more_color";
  if (/\b(less color|less colorful|more neutral)\b/.test(text)) return "less_color";
  if (/\b(like|love)\b/.test(text)) return "like";
  return undefined;
}

function previousItems(previousOutfit: unknown): Record<string, unknown>[] {
  if (!previousOutfit || typeof previousOutfit !== "object" || Array.isArray(previousOutfit)) return [];
  const items = (previousOutfit as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function avoidItemIdsForRefinement(request: AuraStylingAgentRequest, text: string): string[] {
  const items = previousItems(request.previousOutfit);
  if (!items.length) return [];
  const avoidRoles = (Object.entries(ROLE_WORDS) as [OutfitRole, RegExp][])
    .filter(([, pattern]) => pattern.test(text) && new RegExp("\\b(not those|different|swap|change|avoid)\\b").test(text))
    .map(([role]) => role);
  if (!avoidRoles.length && /\b(different|try another|try again|not that|not this|swap|change)\b/.test(text)) {
    return items.map((item) => cleanText(item.itemId)).filter(Boolean);
  }
  return items
    .filter((item) => avoidRoles.includes(normalizedText(item.role ?? item.allowedRole ?? item.category) as OutfitRole))
    .map((item) => cleanText(item.itemId))
    .filter(Boolean);
}

function classifyMode(request: AuraStylingAgentRequest, text: string): {
  mode: AuraStylingAgentMode;
  confidence: number;
  reason: string;
} {
  const explicit = normalizedMode(request.mode);
  if (explicit !== "auto" && explicit !== "unknown") {
    return { mode: explicit, confidence: 1, reason: "explicit mode" };
  }
  if (!text) return { mode: "unknown", confidence: 0.2, reason: "empty query" };
  if (inferFeedbackType(request, text) && /\b(feedback|remember|record|liked|disliked|not my vibe|save|wore)\b/.test(text)) {
    return { mode: "feedback", confidence: 0.86, reason: "feedback language" };
  }
  if (/\b(why|explain|rationale|break down|breakdown|score)\b/.test(text)) {
    return { mode: "explain_outfit", confidence: 0.86, reason: "explanation language" };
  }
  if (/\b(refine|less formal|more casual|more formal|too formal|too casual|more streetwear|less streetwear|more color|less color|different|try another|try again|swap|change|not those)\b/.test(text)) {
    return { mode: "refine_outfit", confidence: 0.9, reason: "refinement language" };
  }
  if (/\b(outfits?|wear|looks?|style|fits?|dress me)\b/.test(text)) {
    return { mode: "generate_outfit", confidence: 0.88, reason: "outfit generation language" };
  }
  return { mode: "unknown", confidence: 0.35, reason: "no supported styling intent matched" };
}

export function classifyAuraStylingAgentIntent(request: AuraStylingAgentRequest): AuraStylingAgentIntent {
  const query = cleanText(request.query);
  const text = normalizedText(query);
  const mode = classifyMode(request, text);
  const formality = normalizedFormality(request.formality, text);
  const occasion = inferOccasion(request, text);
  const weather = inferWeather(request, text);
  const colors = inferColors(request, text);
  const requiredCategories = inferRequiredCategories(request, text);
  const requiredColors = unique(stringArray(request.requiredColors), 10);
  const hasCategoryColorConstraint = requiredCategories.some((role) => ROLE_WORDS[role].test(text));
  const allRequiredColors = requiredColors.length ? requiredColors : hasCategoryColorConstraint ? colors : [];
  const feedbackType = inferFeedbackType(request, text);
  return {
    mode: mode.mode,
    query,
    normalizedQuery: text,
    confidence: mode.confidence,
    reason: mode.reason,
    constraints: {
      ...(occasion ? { occasion } : {}),
      ...(weather ? { weather } : {}),
      formality,
      preferredColors: colors,
      requiredColors: unique(allRequiredColors, 10),
      requiredCategories,
      styleHints: styleHints(text),
      avoidItemIds: mode.mode === "refine_outfit" ? avoidItemIdsForRefinement(request, text) : [],
      avoidCategories: [],
      ...(mode.mode === "refine_outfit" ? { refinementInstruction: query } : {}),
      ...(feedbackType ? { feedbackType } : {}),
      selectedItemIds: unique(stringArray(request.selectedItemIds), 20),
    },
  };
}
