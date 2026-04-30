import { FieldValue, Firestore } from "firebase-admin/firestore";
import {
  ALLOWED_COLORS,
  AllowedColor,
  Category,
} from "./wardrobeTaxonomy";
import type {CompactAuraMemoryContext} from "../../../shared/auraMemory";

export const MODEL = "gpt-4.1-mini";
const ALLOWED_COLOR_SET = new Set<string>(ALLOWED_COLORS);
const NEUTRAL_COLORS = new Set<AllowedColor>([
  "black",
  "white",
  "grey",
  "navy",
  "beige",
  "cream",
]);
const FORMALITY_BY_OCCASION: Record<string, number> = {
  casual: 0.35,
  smart_casual: 0.55,
  formal: 0.9,
  gym: 0.1,
  date: 0.55,
  work: 0.65,
  party: 0.7,
  travel: 0.4,
  unknown: 0.5,
};
const WARMTH_HINTS: Array<{words: string[]; value: number}> = [
  {words: ["cold", "winter", "snow", "freezing", "chilly"], value: 0.85},
  {words: ["rain", "wind", "breeze"], value: 0.7},
  {words: ["summer", "hot", "humid", "beach"], value: 0.2},
  {words: ["spring", "fall", "autumn", "mild"], value: 0.5},
];

export type Slot = "top" | "bottom" | "footwear" | "outerwear";

export type OutfitIntentV1 = {
  occasion:
    | "casual"
    | "smart_casual"
    | "formal"
    | "gym"
    | "date"
    | "work"
    | "party"
    | "travel"
    | "unknown";
  formalityTarget: number;
  warmthTarget: number;
  needs: Array<"top" | "bottom" | "footwear">;
  niceToHave: Array<"outerwear" | "accessory">;
  colorsWanted: AllowedColor[];
  colorsAvoid: AllowedColor[];
  avoidLogos: boolean;
  excludeLaundry: boolean;
  requireOuterwear?: boolean;
};

export type OutfitChatConstraints = {
  occasion?: string | null;
  formalityTarget?: number | null;
  warmthTarget?: number | null;
  colorsWanted?: string[];
  colorsAvoid?: string[];
  includeItemIds?: string[];
  excludeItemIds?: string[];
  avoidLogos?: boolean;
  excludeLaundry?: boolean;
  mustInclude?: Array<{slot?: Slot | null; itemHint?: string | null}>;
  avoidItems?: Array<{itemHint?: string | null}>;
  notes?: string | null;
};

export type OutfitFollowup = {
  type?:
    | "warmer"
    | "cooler"
    | "more_formal"
    | "more_casual"
    | "more_colorful"
    | "more_minimal"
    | null;
};

const SOFT_COUNT_HINTS: Array<{words: string[]; count: number}> = [
  {words: ["one"], count: 1},
  {words: ["two", "couple"], count: 2},
  {words: ["few"], count: 3},
  {words: ["some"], count: 4},
  {words: ["many", "lots"], count: 6},
  {words: ["bunch"], count: 5},
];

export type WardrobeItem = {
  id: string;
  category?: string;
  subCategory?: string;
  fit?: string | null;
  rise?: string | null;
  legShape?: string | null;
  colors?: string[];
  primaryColor?: string;
  status?: string;
  laundryStatus?: string | null;
  isDraft?: boolean;
  draftState?: string | null;
  brand?: string | null;
  name?: string | null;
  colorLabel?: string | null;
  ingestion?: {status?: string};
  formalityScore?: number;
  warmthScore?: number;
  hasLogo?: boolean;
  occasionTags?: string[];
  seasonTags?: string[];
  lastWornDate?: number | {toMillis?: () => number} | null;
  photos?: {
    cleanedPhotoUrl?: string | null;
    cleanedUrl?: string | null;
    cleanedThumbUrl?: string | null;
    thumbUrl?: string | null;
    croppedUrl?: string | null;
    primaryUrl?: string | null;
    urls?: string[];
  };
  photoUrl?: string | null;
  updatedAt?: number | {toMillis?: () => number} | null;
};

export type OutfitResult = {
  id: string;
  picks: Array<{slot: Slot; itemId: string}>;
  score: number;
  reason: string;
};

type ScoredItem = {
  item: WardrobeItem;
  slot: Slot;
  score: number;
};

const getIngestionStatus = (item: WardrobeItem): string =>
  String(item.ingestion?.status ?? (item as any).ingestionStatus ?? "")
    .trim()
    .toLowerCase();

type OutfitCandidate = {
  picks: Array<{slot: Slot; itemId: string}>;
  score: number;
  reason: string;
  itemIds: string[];
};

type PreferenceBiasContext = {
  explicitFavoriteColors: AllowedColor[];
  explicitAvoidColors: AllowedColor[];
  learnedFavoriteColors: AllowedColor[];
  learnedAvoidColors: AllowedColor[];
  explicitFavoriteCategories: string[];
  explicitAvoidCategories: string[];
  learnedFavoriteCategories: string[];
  learnedAvoidCategories: string[];
  preferredFits: string[];
  learnedFits: string[];
  learnedConfidence: number;
  experimentationLevel: "low" | "medium" | "high";
};

function clamp01(value: unknown, fallback = 0.5): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function inferRequestedOutfitCount(text: string): number | null {
  const normalized = String(text ?? "").toLowerCase();
  const explicitMatch = normalized.match(
    /\b(\d{1,2})\b\s+(?:outfits?|looks?|options?)\b|\b(?:give|show|need|want)\s+me\s+(\d{1,2})\b/
  );
  if (explicitMatch) {
    const numeric = Number(explicitMatch[1] ?? explicitMatch[2]);
    return Number.isFinite(numeric) ? numeric : null;
  }

  for (const hint of SOFT_COUNT_HINTS) {
    if (hint.words.some((word) => normalized.includes(word))) {
      return hint.count;
    }
  }

  return null;
}

export function clampNumOutfits(value: unknown, fallback = 3): number {
  const n = Number(value);
  const numeric = Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(1, Math.min(8, numeric));
}

export function normalizeColor(value: unknown): AllowedColor | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "_");
  if (ALLOWED_COLOR_SET.has(normalized)) {
    return normalized as AllowedColor;
  }
  if (normalized === "gray") return "grey";
  return null;
}

export function normalizeColorList(values: unknown, maxLength: number): AllowedColor[] {
  if (!Array.isArray(values)) return [];
  const out: AllowedColor[] = [];
  for (const value of values) {
    const normalized = normalizeColor(value);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= maxLength) break;
  }
  return out;
}

export function safeJsonExtract<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export function inferWarmth(prompt: string): number {
  const normalized = prompt.toLowerCase();
  for (const hint of WARMTH_HINTS) {
    if (hint.words.some((word) => normalized.includes(word))) {
      return hint.value;
    }
  }
  return 0.5;
}

function wantsOuterwear(prompt: string): boolean {
  const normalized = normalizedText(prompt);
  if (!normalized) return false;
  const outerwearHints = [
    "with jacket",
    "with jackets",
    "jacket look",
    "jacket looks",
    "outerwear",
    "with outerwear",
    "layered",
    "layers",
    "layer up",
    "hoodie",
    "blazer",
    "coat",
    "coats",
    "cardigan",
    "cardigans",
    "overshirt",
    "overshirts",
    "shacket",
    "shackets",
    "parka",
    "parkas",
    "bomber",
    "bombers",
  ];
  return outerwearHints.some((hint) => normalized.includes(hint));
}

export function fallbackIntent(prompt: string): OutfitIntentV1 {
  const normalized = prompt.toLowerCase();
  const occasion = (
    ["casual", "formal", "gym", "date", "work", "party", "travel"] as const
  ).find((value) => normalized.includes(value)) ?? "unknown";
  const warmthTarget = inferWarmth(prompt);
  const needsOuterwear = wantsOuterwear(prompt);

  return {
    occasion,
    formalityTarget: FORMALITY_BY_OCCASION[occasion] ?? 0.5,
    warmthTarget,
    needs: ["top", "bottom", "footwear"],
    niceToHave:
      warmthTarget > 0.65 || needsOuterwear ? ["outerwear"] : [],
    colorsWanted: normalizeColorList(
      ALLOWED_COLORS.filter((color) => normalized.includes(color)),
      2
    ),
    colorsAvoid: [],
    avoidLogos: normalized.includes("no logo") || normalized.includes("avoid logo"),
    excludeLaundry: true,
    requireOuterwear: needsOuterwear,
  };
}

export function normalizeParsedIntent(
  parsed: Partial<OutfitIntentV1> | null | undefined,
  sourceText: string
): OutfitIntentV1 {
  if (!parsed) return fallbackIntent(sourceText);

  const occasion = (
    [
      "casual",
      "smart_casual",
      "formal",
      "gym",
      "date",
      "work",
      "party",
      "travel",
      "unknown",
    ] as const
  ).includes((parsed.occasion ?? "unknown") as OutfitIntentV1["occasion"])
    ? (parsed.occasion as OutfitIntentV1["occasion"])
    : "unknown";

  const needs = Array.isArray(parsed.needs)
    ? parsed.needs.filter((value): value is "top" | "bottom" | "footwear" =>
        value === "top" || value === "bottom" || value === "footwear"
      )
    : [];
  const niceToHave = Array.isArray(parsed.niceToHave)
    ? parsed.niceToHave.filter((value): value is "outerwear" | "accessory" =>
        value === "outerwear" || value === "accessory"
      )
    : [];
  const needsOuterwear = wantsOuterwear(sourceText);
  const enrichedNiceToHave: Array<"outerwear" | "accessory"> =
    needsOuterwear && !niceToHave.includes("outerwear")
      ? [...niceToHave, "outerwear"]
      : niceToHave;

  return {
    occasion,
    formalityTarget: clamp01(
      parsed.formalityTarget,
      FORMALITY_BY_OCCASION[occasion] ?? 0.5
    ),
    warmthTarget: clamp01(parsed.warmthTarget, inferWarmth(sourceText)),
    needs: needs.length > 0 ? needs : ["top", "bottom", "footwear"],
    niceToHave: enrichedNiceToHave,
    colorsWanted: normalizeColorList(parsed.colorsWanted, 2),
    colorsAvoid: normalizeColorList(parsed.colorsAvoid, 2),
    avoidLogos: !!parsed.avoidLogos,
    excludeLaundry: parsed.excludeLaundry !== false,
    requireOuterwear: needsOuterwear,
  };
}

function toMillis(value: WardrobeItem["lastWornDate"]): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return null;
}

function normalizeItemColors(item: WardrobeItem): AllowedColor[] {
  const values = [
    ...(Array.isArray(item.colors) ? item.colors : []),
    item.primaryColor ?? "",
    item.colorLabel ?? "",
  ];
  const out: AllowedColor[] = [];
  for (const value of values) {
    const normalized = normalizeColor(value);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

function normalizeCategoryToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeTokenList(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const token = normalizeCategoryToken(value);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    next.push(token);
    if (next.length >= limit) break;
  }
  return next;
}

function bucketForItem(item: WardrobeItem): Slot | null {
  const category = String(item.category ?? "").trim().toLowerCase();
  const joined = normalizedText(
    [
      item.category,
      item.subCategory,
      (item as { type?: string | null }).type,
      item.name,
    ]
      .filter(Boolean)
      .join(" "),
  );
  if (
    category === Category.OUTERWEAR ||
    /\b(jacket|coat|outerwear|overshirt|blazer|trench|parka|bomber|shacket|cardigan)\b/.test(joined)
  ) {
    return "outerwear";
  }
  if (category === Category.TOP || category === Category.ONE_PIECE) return "top";
  if (category === Category.BOTTOM) return "bottom";
  if (category === Category.FOOTWEAR || category === "shoes") return "footwear";
  return null;
}

export function getSlotForItem(item: WardrobeItem): Slot | null {
  return bucketForItem(item);
}

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizedText(value).split(" ").filter(Boolean);
}

function itemHintScore(item: WardrobeItem, hint: string): number {
  const normalizedHint = normalizedText(hint);
  if (!normalizedHint) return 0;

  const haystacks = [
    item.name,
    item.brand,
    item.subCategory,
    item.category,
    item.primaryColor,
    item.colorLabel,
    ...(Array.isArray(item.colors) ? item.colors : []),
  ]
    .map((value) => normalizedText(value))
    .filter(Boolean);

  let score = 0;
  for (const haystack of haystacks) {
    if (haystack === normalizedHint) score = Math.max(score, 1);
    else if (haystack.includes(normalizedHint)) score = Math.max(score, 0.9);
    else {
      const hintTokens = tokenize(normalizedHint);
      const matched = hintTokens.filter((token) => haystack.includes(token)).length;
      if (matched > 0) {
        score = Math.max(score, Math.min(0.8, matched / Math.max(1, hintTokens.length)));
      }
    }
  }

  return score;
}

function buildPreferenceBiasContext(
  memory?: CompactAuraMemoryContext | null
): PreferenceBiasContext {
  const explicit = memory?.explicitProfile;
  const learned = memory?.learnedProfile;

  return {
    explicitFavoriteColors: normalizeColorList(explicit?.favoriteColors ?? [], 3),
    explicitAvoidColors: normalizeColorList(explicit?.avoidColors ?? [], 3),
    learnedFavoriteColors:
      (learned?.confidence ?? 0) >= 0.35
        ? normalizeColorList(learned?.inferredFavoriteColors ?? [], 3)
        : [],
    learnedAvoidColors:
      (learned?.confidence ?? 0) >= 0.35
        ? normalizeColorList(learned?.inferredAvoidColors ?? [], 2)
        : [],
    explicitFavoriteCategories: normalizeTokenList(explicit?.favoriteCategories ?? [], 4),
    explicitAvoidCategories: normalizeTokenList(explicit?.avoidCategories ?? [], 3),
    learnedFavoriteCategories:
      (learned?.confidence ?? 0) >= 0.45
        ? normalizeTokenList(learned?.inferredFavoriteCategories ?? [], 4)
        : [],
    learnedAvoidCategories:
      (learned?.confidence ?? 0) >= 0.45
        ? normalizeTokenList(learned?.inferredAvoidCategories ?? [], 3)
        : [],
    preferredFits: normalizeTokenList(explicit?.preferredFits ?? [], 3),
    learnedFits:
      (learned?.confidence ?? 0) >= 0.45
        ? normalizeTokenList(learned?.inferredFits ?? [], 3)
        : [],
    learnedConfidence: clamp01(learned?.confidence, 0),
    experimentationLevel: explicit?.experimentationLevel ?? "medium",
  };
}

function itemCategoryTokens(item: WardrobeItem): string[] {
  return [
    normalizeCategoryToken(item.category),
    normalizeCategoryToken(item.subCategory),
    normalizeCategoryToken(bucketForItem(item)),
  ].filter(Boolean);
}

function categoryPreferenceScore(
  item: WardrobeItem,
  preferenceBias: PreferenceBiasContext
): number {
  const tokens = itemCategoryTokens(item);
  const learnedWeight = 0.04 + 0.05 * preferenceBias.learnedConfidence;
  let score = 0;
  if (tokens.some((token) => preferenceBias.explicitFavoriteCategories.includes(token))) score += 0.12;
  if (tokens.some((token) => preferenceBias.learnedFavoriteCategories.includes(token))) score += learnedWeight;
  if (tokens.some((token) => preferenceBias.explicitAvoidCategories.includes(token))) score -= 0.14;
  if (tokens.some((token) => preferenceBias.learnedAvoidCategories.includes(token))) score -= learnedWeight;
  return score;
}

function fitPreferenceScore(
  item: WardrobeItem,
  preferenceBias: PreferenceBiasContext
): number {
  const tokens = [
    normalizeCategoryToken(item.fit),
    normalizeCategoryToken(item.rise),
    normalizeCategoryToken(item.legShape),
  ].filter(Boolean);
  let score = 0;
  if (tokens.some((token) => preferenceBias.preferredFits.includes(token))) score += 0.09;
  if (tokens.some((token) => preferenceBias.learnedFits.includes(token))) {
    score += 0.03 + 0.04 * preferenceBias.learnedConfidence;
  }
  return score;
}

function experimentationBias(
  item: WardrobeItem,
  preferenceBias: PreferenceBiasContext
): number {
  const colors = normalizeItemColors(item);
  const nonNeutralCount = colors.filter((color) => !NEUTRAL_COLORS.has(color)).length;
  if (preferenceBias.experimentationLevel === "low") {
    return nonNeutralCount > 1 ? -0.08 : 0.03;
  }
  if (preferenceBias.experimentationLevel === "high") {
    return nonNeutralCount > 1 ? 0.06 : nonNeutralCount > 0 ? 0.03 : 0;
  }
  return nonNeutralCount > 1 ? -0.01 : 0.01;
}

export function resolveItemHints(
  items: WardrobeItem[],
  hints: Array<{slot?: Slot | null; itemHint?: string | null}> | undefined
): {
  resolved: Array<{slot: Slot; itemId: string; item: WardrobeItem}>;
  ambiguous: Array<{hint: string; candidates: WardrobeItem[]}>;
  unmatched: string[];
} {
  const resolved: Array<{slot: Slot; itemId: string; item: WardrobeItem}> = [];
  const ambiguous: Array<{hint: string; candidates: WardrobeItem[]}> = [];
  const unmatched: string[] = [];

  for (const hintDef of hints ?? []) {
    const hint = String(hintDef?.itemHint ?? "").trim();
    if (!hint) continue;
    const preferredSlot = hintDef?.slot ?? null;
    const scored = items
      .map((item) => ({
        item,
        slot: bucketForItem(item),
        score: itemHintScore(item, hint),
      }))
      .filter((value) => value.slot && (!preferredSlot || value.slot === preferredSlot) && value.score >= 0.45)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      unmatched.push(hint);
      continue;
    }

    const top = scored[0];
    const nearMatches = scored.filter((value) => value.score >= top.score - 0.1).slice(0, 3);
    if (nearMatches.length > 1 && top.score < 0.95) {
      ambiguous.push({
        hint,
        candidates: nearMatches.map((value) => value.item),
      });
      continue;
    }

    resolved.push({
      slot: top.slot as Slot,
      itemId: top.item.id,
      item: top.item,
    });
  }

  return {resolved, ambiguous, unmatched};
}

export function applyFollowupToIntent(
  intent: OutfitIntentV1,
  followup?: OutfitFollowup | null
): OutfitIntentV1 {
  const type = followup?.type ?? null;
  if (!type) return intent;

  const next = {...intent};
  if (type === "warmer") {
    next.warmthTarget = clamp01(next.warmthTarget + 0.15, next.warmthTarget);
    if (!next.niceToHave.includes("outerwear")) next.niceToHave = [...next.niceToHave, "outerwear"];
  } else if (type === "cooler") {
    next.warmthTarget = clamp01(next.warmthTarget - 0.15, next.warmthTarget);
  } else if (type === "more_formal") {
    next.formalityTarget = clamp01(next.formalityTarget + 0.15, next.formalityTarget);
  } else if (type === "more_casual") {
    next.formalityTarget = clamp01(next.formalityTarget - 0.15, next.formalityTarget);
  } else if (type === "more_colorful") {
    next.avoidLogos = false;
  } else if (type === "more_minimal") {
    next.avoidLogos = true;
  }
  return next;
}

function closeness(a: number, b: number): number {
  return 1 - Math.min(1, Math.abs(a - b));
}

function colorMatchScore(
  itemColors: AllowedColor[],
  wanted: AllowedColor[],
  avoid: AllowedColor[]
): number {
  const colorSet = new Set(itemColors);
  let score = 0;
  if (wanted.some((color) => colorSet.has(color))) score += 0.3;
  if (avoid.some((color) => colorSet.has(color))) score -= 0.5;
  return score;
}

function tagMatchScore(item: WardrobeItem, intent: OutfitIntentV1): number {
  const occasionTags = Array.isArray(item.occasionTags)
    ? item.occasionTags.map((value) => String(value).trim().toLowerCase())
    : [];
  const seasonTags = Array.isArray(item.seasonTags)
    ? item.seasonTags.map((value) => String(value).trim().toLowerCase())
    : [];

  let score = 0;
  if (occasionTags.includes(intent.occasion)) score += 1;
  if (intent.warmthTarget > 0.65 && seasonTags.some((tag) => tag === "winter")) score += 1;
  if (intent.warmthTarget < 0.35 && seasonTags.some((tag) => tag === "summer")) score += 1;
  if (seasonTags.includes("all_season")) score += 0.5;
  return Math.min(1, score);
}

function recencyPenalty(item: WardrobeItem): number {
  const lastWornMs = toMillis(item.lastWornDate);
  if (!lastWornMs) return 0;
  const ageMs = Date.now() - lastWornMs;
  const days = ageMs / (24 * 60 * 60 * 1000);
  if (days < 1) return 1;
  if (days < 3) return 0.6;
  if (days < 7) return 0.3;
  return 0;
}

function scoreItem(
  item: WardrobeItem,
  intent: OutfitIntentV1,
  preferenceBias: PreferenceBiasContext
): number {
  const formalityScore = clamp01(item.formalityScore, 0.5);
  const warmthScore = clamp01(item.warmthScore, 0.5);
  const itemColors = normalizeItemColors(item);
  const logoPenalty = intent.avoidLogos && item.hasLogo ? 0.5 : 0;
  const missingPenalty =
    item.formalityScore == null || item.warmthScore == null ? 0.05 : 0;
  const explicitColorBias = colorMatchScore(
    itemColors,
    preferenceBias.explicitFavoriteColors,
    preferenceBias.explicitAvoidColors
  );
  const learnedColorBias = colorMatchScore(
    itemColors,
    preferenceBias.learnedFavoriteColors,
    preferenceBias.learnedAvoidColors
  );
  const categoryBias = categoryPreferenceScore(item, preferenceBias);
  const fitBias = fitPreferenceScore(item, preferenceBias);
  const experimentationScore = experimentationBias(item, preferenceBias);

  const score =
    0.35 * closeness(formalityScore, intent.formalityTarget) +
    0.35 * closeness(warmthScore, intent.warmthTarget) +
    0.15 * colorMatchScore(itemColors, intent.colorsWanted, intent.colorsAvoid) +
    0.1 * tagMatchScore(item, intent) -
    0.05 * recencyPenalty(item) -
    logoPenalty -
    missingPenalty +
    0.18 * explicitColorBias +
    0.12 * learnedColorBias +
    categoryBias +
    fitBias +
    experimentationScore;

  return score;
}

function compatibilityBonus(
  items: WardrobeItem[],
  preferenceBias: PreferenceBiasContext
): number {
  const colors = items.flatMap((item) => normalizeItemColors(item));
  if (colors.length === 0) return 0;
  const unique = new Set(colors);
  const neutralCount = colors.filter((color) => NEUTRAL_COLORS.has(color)).length;
  if (preferenceBias.experimentationLevel === "low") {
    if (neutralCount >= 2) return 0.07;
    if (unique.size >= 4) return -0.08;
    return 0;
  }
  if (preferenceBias.experimentationLevel === "high") {
    if (unique.size >= 3) return 0.04;
    if (neutralCount >= 2) return 0.03;
    return 0;
  }
  if (neutralCount >= 2) return 0.05;
  if (unique.size >= 4) return -0.05;
  return 0;
}

function buildReason(
  intent: OutfitIntentV1,
  picks: Array<{slot: Slot; item: WardrobeItem}>
): string {
  const reasons: string[] = [];
  const hasOuterwear = picks.some((pick) => pick.slot === "outerwear");
  if (intent.warmthTarget > 0.65) {
    reasons.push("Warm enough for colder weather");
  } else if (intent.warmthTarget < 0.35) {
    reasons.push("Light enough for warmer weather");
  }
  if ((intent.requireOuterwear || intent.niceToHave.includes("outerwear")) && hasOuterwear) {
    reasons.push("layered with outerwear");
  }

  const occasionLabel =
    intent.occasion === "unknown"
      ? `${Math.round(intent.formalityTarget * 100)}% formality`
      : intent.occasion.replace(/_/g, " ");
  reasons.push(`${occasionLabel} vibe`);

  if (intent.colorsWanted.length > 0) {
    reasons.push(`matches your ${intent.colorsWanted.join("/")} preference`);
  } else {
    const colors = new Set(
      picks.flatMap((pick) => normalizeItemColors(pick.item)).filter((color) =>
        NEUTRAL_COLORS.has(color)
      )
    );
    if (colors.size > 0) {
      reasons.push(`balanced around ${Array.from(colors).slice(0, 2).join("/")} neutrals`);
    }
  }

  return `${reasons.join(", ")}.`;
}

function selectTopCandidates(
  items: WardrobeItem[],
  slot: Slot,
  intent: OutfitIntentV1,
  limit: number,
  preferenceBias: PreferenceBiasContext
): ScoredItem[] {
  return items
    .map((item) => ({item, slot, score: scoreItem(item, intent, preferenceBias)}))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function assembleOutfits(
  topItems: ScoredItem[],
  bottomItems: ScoredItem[],
  footwearItems: ScoredItem[],
  outerwearItems: ScoredItem[],
  intent: OutfitIntentV1,
  preferenceBias: PreferenceBiasContext,
  count: number,
  lockedBySlot?: Partial<Record<Slot, WardrobeItem>>
): OutfitCandidate[] {
  const topCandidates = lockedBySlot?.top
    ? topItems.filter((item) => item.item.id === lockedBySlot.top?.id).slice(0, 1)
    : topItems.slice(0, 10);
  const bottomCandidates = lockedBySlot?.bottom
    ? bottomItems.filter((item) => item.item.id === lockedBySlot.bottom?.id).slice(0, 1)
    : bottomItems.slice(0, 10);
  const footwearCandidates = lockedBySlot?.footwear
    ? footwearItems.filter((item) => item.item.id === lockedBySlot.footwear?.id).slice(0, 1)
    : footwearItems.slice(0, 10);
  const outerwearCandidates = lockedBySlot?.outerwear
    ? outerwearItems.filter((item) => item.item.id === lockedBySlot.outerwear?.id).slice(0, 1)
    : outerwearItems.slice(0, 5);
  const shouldIncludeOuterwear =
    intent.warmthTarget > 0.65 || intent.niceToHave.includes("outerwear");
  const requiresOuterwear = intent.requireOuterwear === true;

  if (requiresOuterwear && outerwearCandidates.length === 0) {
    return [];
  }

  const combos: OutfitCandidate[] = [];
  for (const top of topCandidates) {
    for (const bottom of bottomCandidates) {
      for (const footwear of footwearCandidates) {
        const base = [top, bottom, footwear];
        const outfitOuterwearCandidates =
          (shouldIncludeOuterwear || requiresOuterwear) && outerwearCandidates.length > 0
            ? outerwearCandidates.filter(
                (candidate) =>
                  candidate.item.id !== top.item.id &&
                  candidate.item.id !== bottom.item.id &&
                  candidate.item.id !== footwear.item.id
              )
            : [];

        const variantChoices = outfitOuterwearCandidates.length
          ? outfitOuterwearCandidates.map((outerwear) => ({
              chosen: [...base, outerwear],
              bonus: intent.niceToHave.includes("outerwear") || requiresOuterwear ? 0.09 : 0.03,
            }))
          : requiresOuterwear
            ? []
            : [{chosen: base, bonus: 0}];

        for (const variant of variantChoices) {
          const itemScores = variant.chosen.map((value) => value.score);
          const outfitScore =
            itemScores.reduce((sum, value) => sum + value, 0) / itemScores.length +
            compatibilityBonus(
              variant.chosen.map((value) => value.item),
              preferenceBias
            ) +
            variant.bonus;
          const picks = variant.chosen.map((value) => ({
            slot: value.slot,
            itemId: value.item.id,
          }));
          combos.push({
            picks,
            score: outfitScore,
            reason: buildReason(
              intent,
              variant.chosen.map((value) => ({slot: value.slot, item: value.item}))
            ),
            itemIds: picks.map((pick) => pick.itemId),
          });
        }
      }
    }
  }

  const dedupedCombos = Array.from(
    new Map(combos.map((combo) => [combo.itemIds.slice().sort().join("|"), combo])).values()
  ).sort((a, b) => b.score - a.score);

  const selected: OutfitCandidate[] = [];
  const usedTops = new Set<string>();
  const usedBottoms = new Set<string>();
  const usedFootwear = new Set<string>();
  const usedOuterwear = new Set<string>();
  const usedSignatures = new Set<string>();

  const candidatePool = dedupedCombos
    .slice(0, Math.max(count * 6, 18))
    .map((combo) => ({
      combo,
      score: combo.score,
      randomSeed: Math.random(),
    }));

  while (selected.length < count && candidatePool.length > 0) {
    const rankedPool = [...candidatePool].sort((a, b) => {
      const aCombo = a.combo;
      const bCombo = b.combo;
      const aTopId = aCombo.picks.find((pick) => pick.slot === "top")?.itemId ?? "";
      const bTopId = bCombo.picks.find((pick) => pick.slot === "top")?.itemId ?? "";
      const aBottomId = aCombo.picks.find((pick) => pick.slot === "bottom")?.itemId ?? "";
      const bBottomId = bCombo.picks.find((pick) => pick.slot === "bottom")?.itemId ?? "";
      const aFootwearId = aCombo.picks.find((pick) => pick.slot === "footwear")?.itemId ?? "";
      const bFootwearId = bCombo.picks.find((pick) => pick.slot === "footwear")?.itemId ?? "";
      const aOuterwearId = aCombo.picks.find((pick) => pick.slot === "outerwear")?.itemId ?? "";
      const bOuterwearId = bCombo.picks.find((pick) => pick.slot === "outerwear")?.itemId ?? "";
      const aAdjusted =
        a.score +
        (!aTopId || !usedTops.has(aTopId) ? 0.07 : 0) +
        (!aBottomId || !usedBottoms.has(aBottomId) ? 0.06 : 0) +
        (!aFootwearId || !usedFootwear.has(aFootwearId) ? 0.04 : 0) +
        (!aOuterwearId || !usedOuterwear.has(aOuterwearId) ? 0.05 : 0) +
        a.randomSeed * 0.035;
      const bAdjusted =
        b.score +
        (!bTopId || !usedTops.has(bTopId) ? 0.07 : 0) +
        (!bBottomId || !usedBottoms.has(bBottomId) ? 0.06 : 0) +
        (!bFootwearId || !usedFootwear.has(bFootwearId) ? 0.04 : 0) +
        (!bOuterwearId || !usedOuterwear.has(bOuterwearId) ? 0.05 : 0) +
        b.randomSeed * 0.035;
      return bAdjusted - aAdjusted;
    });

    const choice = rankedPool[0];
    const combo = choice.combo;
    const signature = combo.itemIds.slice().sort().join("|");
    if (usedSignatures.has(signature)) continue;
    const topId = combo.picks.find((pick) => pick.slot === "top")?.itemId ?? "";
    const bottomId = combo.picks.find((pick) => pick.slot === "bottom")?.itemId ?? "";
    const footwearId = combo.picks.find((pick) => pick.slot === "footwear")?.itemId ?? "";
    const outerwearId = combo.picks.find((pick) => pick.slot === "outerwear")?.itemId ?? "";
    const canUseFresh =
      (!topId || !usedTops.has(topId) || selected.length >= dedupedCombos.length - 1) &&
      (!bottomId || !usedBottoms.has(bottomId) || selected.length >= dedupedCombos.length - 1) &&
      (!footwearId || !usedFootwear.has(footwearId) || selected.length >= dedupedCombos.length - 1) &&
      (!outerwearId || !usedOuterwear.has(outerwearId) || selected.length >= dedupedCombos.length - 1);
    if (!canUseFresh && selected.length < count - 1) {
      candidatePool.splice(
        candidatePool.findIndex((entry) => entry.combo === combo),
        1,
      );
      continue;
    }

    selected.push(combo);
    usedSignatures.add(signature);
    usedTops.add(topId);
    usedBottoms.add(bottomId);
    usedFootwear.add(footwearId);
    if (outerwearId) usedOuterwear.add(outerwearId);
    candidatePool.splice(
      candidatePool.findIndex((entry) => entry.combo === combo),
      1,
    );
  }

  if (selected.length < count) {
    for (const combo of dedupedCombos) {
      const signature = combo.itemIds.slice().sort().join("|");
      if (usedSignatures.has(signature)) {
        continue;
      }
      selected.push(combo);
      usedSignatures.add(signature);
      if (selected.length >= count) break;
    }
  }

  return selected;
}

function applyConstraints(
  items: WardrobeItem[],
  intent: OutfitIntentV1,
  constraints?: OutfitChatConstraints
): { items: WardrobeItem[]; intent: OutfitIntentV1 } {
  if (!constraints) {
    return {items, intent};
  }

  const includeSet = new Set(
    Array.isArray(constraints.includeItemIds)
      ? constraints.includeItemIds.map((value) => String(value).trim()).filter(Boolean)
      : []
  );
  const excludeSet = new Set(
    Array.isArray(constraints.excludeItemIds)
      ? constraints.excludeItemIds.map((value) => String(value).trim()).filter(Boolean)
      : []
  );

  const filteredItems = items.filter((item) => {
    if (excludeSet.has(item.id)) return false;
    if (includeSet.size > 0 && !includeSet.has(item.id)) {
      return bucketForItem(item) === null;
    }
    return true;
  });

  const nextIntent: OutfitIntentV1 = {
    ...intent,
    ...(constraints.occasion
      ? {occasion: normalizeParsedIntent({occasion: constraints.occasion as OutfitIntentV1["occasion"]}, "").occasion}
      : {}),
    ...(constraints.formalityTarget != null
      ? {formalityTarget: clamp01(constraints.formalityTarget, intent.formalityTarget)}
      : {}),
    ...(constraints.warmthTarget != null
      ? {warmthTarget: clamp01(constraints.warmthTarget, intent.warmthTarget)}
      : {}),
    ...(Array.isArray(constraints.colorsWanted)
      ? {colorsWanted: normalizeColorList(constraints.colorsWanted, 2)}
      : {}),
    ...(Array.isArray(constraints.colorsAvoid)
      ? {colorsAvoid: normalizeColorList(constraints.colorsAvoid, 2)}
      : {}),
    avoidLogos:
      typeof constraints.avoidLogos === "boolean"
        ? constraints.avoidLogos
        : intent.avoidLogos,
    excludeLaundry:
      typeof constraints.excludeLaundry === "boolean"
        ? constraints.excludeLaundry
        : intent.excludeLaundry,
  };

  return {items: filteredItems, intent: nextIntent};
}

export async function fetchWardrobeItems(db: Firestore, uid: string): Promise<WardrobeItem[]> {
  const snapshot = await db.collection(`users/${uid}/items`).get();
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<WardrobeItem, "id">),
  }));
}

export function filterEligibleItems(
  items: WardrobeItem[],
  intent: OutfitIntentV1
): WardrobeItem[] {
  return items.filter((item) => {
    const ingestionStatus = getIngestionStatus(item);
    const laundryStatus = String(item.laundryStatus ?? "").trim().toLowerCase();
    const status = String(item.status ?? "").trim().toUpperCase();
    const draftState = String(item.draftState ?? "").trim().toLowerCase();
    if (item.isDraft === true) return false;
    if (draftState && draftState !== "ready") return false;
    if (ingestionStatus !== "done") return false;
    if (intent.excludeLaundry) {
      return (laundryStatus ? laundryStatus === "clean" : status === "AVAILABLE");
    }
    return laundryStatus ? laundryStatus !== "in_laundry" : status !== "IN_LAUNDRY";
  });
}

function filterEligibleItemsRelaxed(items: WardrobeItem[]): WardrobeItem[] {
  return items.filter((item) => {
    const draftState = String(item.draftState ?? "").trim().toLowerCase();
    if (item.isDraft === true) return false;
    if (draftState === "cancelled" || draftState === "failed") return false;
    return !!bucketForItem(item);
  });
}

function slotCountsForItems(items: WardrobeItem[]) {
  return {
    top: items.filter((item) => bucketForItem(item) === "top").length,
    bottom: items.filter((item) => bucketForItem(item) === "bottom").length,
    footwear: items.filter((item) => bucketForItem(item) === "footwear").length,
    outerwear: items.filter((item) => bucketForItem(item) === "outerwear").length,
  };
}

function hasRequiredCoreSlots(slotCounts: Record<Slot, number>) {
  return slotCounts.top > 0 && slotCounts.bottom > 0 && slotCounts.footwear > 0;
}

function buildCandidatesFromPool(
  pool: WardrobeItem[],
  baseIntent: OutfitIntentV1,
  options: {
    constraints?: OutfitChatConstraints;
    excludeItemIds?: string[];
    memory?: CompactAuraMemoryContext | null;
    numOutfits: number;
    preferredSlot?: Slot | null;
    lockedItemsBySlot?: Partial<Record<Slot, WardrobeItem>>;
  },
) {
  const memory = options.memory ?? null;
  const memoryConstraints: OutfitChatConstraints = {
    ...(options.constraints ?? {}),
    ...(options.constraints?.occasion ? {} : memory?.session?.currentOccasion ? {occasion: memory.session.currentOccasion} : {}),
    ...(Array.isArray(options.constraints?.colorsWanted) && options.constraints?.colorsWanted.length
      ? {}
      : memory?.explicitProfile?.favoriteColors?.length
        ? {colorsWanted: memory.explicitProfile.favoriteColors.slice(0, 2)}
        : (memory?.learnedProfile?.confidence ?? 0) >= 0.62 && memory?.learnedProfile?.inferredFavoriteColors?.length
          ? {colorsWanted: memory.learnedProfile.inferredFavoriteColors.slice(0, 2)}
          : {}),
    ...(Array.isArray(options.constraints?.colorsAvoid) && options.constraints?.colorsAvoid.length
      ? {}
      : memory?.explicitProfile?.avoidColors?.length
        ? {colorsAvoid: memory.explicitProfile.avoidColors.slice(0, 2)}
        : (memory?.learnedProfile?.confidence ?? 0) >= 0.62 && memory?.learnedProfile?.inferredAvoidColors?.length
          ? {colorsAvoid: memory.learnedProfile.inferredAvoidColors.slice(0, 2)}
          : {}),
  };
  const constrained = applyConstraints(pool, baseIntent, memoryConstraints);
  const preferenceBias = buildPreferenceBiasContext(memory);
  const explicitExclude = new Set(options.excludeItemIds ?? []);
  const finalItems = constrained.items.filter((item) => !explicitExclude.has(item.id));
  const topBucket = finalItems.filter((item) => bucketForItem(item) === "top");
  const bottomBucket = finalItems.filter((item) => bucketForItem(item) === "bottom");
  const footwearBucket = finalItems.filter((item) => bucketForItem(item) === "footwear");
  const outerwearBucket = finalItems.filter((item) => bucketForItem(item) === "outerwear");
  const slotCounts = slotCountsForItems(finalItems);

  if (!hasRequiredCoreSlots(slotCounts)) {
    return {
      outfits: [] as OutfitCandidate[],
      slotCounts,
      eligibleCount: finalItems.length,
      intent: constrained.intent,
    };
  }

  const scoredTop = selectTopCandidates(topBucket, "top", constrained.intent, 25, preferenceBias);
  const scoredBottom = selectTopCandidates(bottomBucket, "bottom", constrained.intent, 25, preferenceBias);
  const scoredFootwear = selectTopCandidates(footwearBucket, "footwear", constrained.intent, 25, preferenceBias);
  const scoredOuterwear = selectTopCandidates(outerwearBucket, "outerwear", constrained.intent, 5, preferenceBias);

  let outfits = assembleOutfits(
    scoredTop,
    scoredBottom,
    scoredFootwear,
    scoredOuterwear,
    constrained.intent,
    preferenceBias,
    options.numOutfits,
    options.lockedItemsBySlot,
  );

  if (options.preferredSlot) {
    outfits = outfits.sort((a, b) => {
      const aHas = a.picks.some((pick) => pick.slot === options.preferredSlot);
      const bHas = b.picks.some((pick) => pick.slot === options.preferredSlot);
      if (aHas === bHas) return b.score - a.score;
      return aHas ? -1 : 1;
    });
  }

  return {
    outfits,
    slotCounts,
    eligibleCount: finalItems.length,
    intent: constrained.intent,
  };
}

export function generateOutfitCandidates(
  allItems: WardrobeItem[],
  baseIntent: OutfitIntentV1,
  options?: {
    numOutfits?: number;
    constraints?: OutfitChatConstraints;
    preferredSlot?: Slot | null;
    excludeItemIds?: string[];
    lockedItemsBySlot?: Partial<Record<Slot, WardrobeItem>>;
    memory?: CompactAuraMemoryContext | null;
  }
): {
  outfits: OutfitCandidate[];
  slotCounts: Record<Slot, number>;
  eligibleCount: number;
  intent: OutfitIntentV1;
  fallbackMode?: "relaxed_filters" | "relaxed_filters_no_constraints";
} {
  const count = clampNumOutfits(options?.numOutfits ?? 3, 3);
  const eligible = filterEligibleItems(allItems, baseIntent);
  const strictResult = buildCandidatesFromPool(eligible, baseIntent, {
    constraints: options?.constraints,
    excludeItemIds: options?.excludeItemIds,
    memory: options?.memory,
    numOutfits: count,
    preferredSlot: options?.preferredSlot,
    lockedItemsBySlot: options?.lockedItemsBySlot,
  });
  if (strictResult.outfits.length > 0) {
    return strictResult;
  }

  const relaxedPool = filterEligibleItemsRelaxed(allItems);
  const relaxedResult = buildCandidatesFromPool(relaxedPool, baseIntent, {
    constraints: options?.constraints,
    excludeItemIds: options?.excludeItemIds,
    memory: options?.memory,
    numOutfits: count,
    preferredSlot: options?.preferredSlot,
    lockedItemsBySlot: options?.lockedItemsBySlot,
  });
  if (relaxedResult.outfits.length > 0) {
    return {
      ...relaxedResult,
      fallbackMode: "relaxed_filters",
    };
  }

  const unconstrainedRelaxedResult = buildCandidatesFromPool(relaxedPool, baseIntent, {
    constraints: undefined,
    excludeItemIds: options?.excludeItemIds,
    memory: options?.memory,
    numOutfits: count,
    preferredSlot: options?.preferredSlot,
    lockedItemsBySlot: options?.lockedItemsBySlot,
  });
  if (unconstrainedRelaxedResult.outfits.length > 0) {
    return {
      ...unconstrainedRelaxedResult,
      fallbackMode: "relaxed_filters_no_constraints",
    };
  }

  return strictResult;
}

export function swapOutfitSlot(
  allItems: WardrobeItem[],
  baseIntent: OutfitIntentV1,
  currentPicks: Array<{slot: Slot; itemId: string}>,
  swapSlot: Slot,
  constraints?: OutfitChatConstraints
): OutfitCandidate | null {
  const currentIds = currentPicks.map((pick) => pick.itemId);
  const currentBySlot = new Map(currentPicks.map((pick) => [pick.slot, pick.itemId]));
  const base = generateOutfitCandidates(allItems, baseIntent, {
    numOutfits: 6,
    constraints,
    preferredSlot: swapSlot,
    excludeItemIds: currentIds.filter((id) => id !== currentBySlot.get(swapSlot)),
  });

  const replacement = base.outfits.find((candidate) => {
    const sameOtherSlots = currentPicks.every((pick) => {
      if (pick.slot === swapSlot) return true;
      return candidate.picks.some(
        (candidatePick) =>
          candidatePick.slot === pick.slot && candidatePick.itemId === pick.itemId
      );
    });
    const swappedPick = candidate.picks.find((pick) => pick.slot === swapSlot);
    return sameOtherSlots && !!swappedPick && swappedPick.itemId !== currentBySlot.get(swapSlot);
  });

  if (replacement) return replacement;

  const fallback = base.outfits[0];
  return fallback ?? null;
}

export async function persistGeneratedOutfits(params: {
  db: Firestore;
  uid: string;
  intentText: string;
  intent: OutfitIntentV1;
  outfits: OutfitCandidate[];
}): Promise<OutfitResult[]> {
  const {db, uid, intentText, intent, outfits} = params;
  const batch = db.batch();
  const payload = outfits.map((outfit) => {
    const outfitRef = db.collection(`users/${uid}/outfits`).doc();
    batch.set(outfitRef, {
      createdAt: FieldValue.serverTimestamp(),
      intentText,
      intent,
      picks: outfit.picks,
      itemIds: outfit.itemIds,
      planned: true,
      score: outfit.score,
      reason: outfit.reason,
      version: "v1",
    });

    return {
      id: outfitRef.id,
      picks: outfit.picks,
      score: outfit.score,
      reason: outfit.reason,
    };
  });

  if (payload.length > 0) {
    await batch.commit();
  }

  return payload;
}
