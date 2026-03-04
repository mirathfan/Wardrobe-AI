import { FieldValue, Firestore } from "firebase-admin/firestore";
import {
  ALLOWED_COLORS,
  AllowedColor,
  Category,
} from "./wardrobeTaxonomy";

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
  notes?: string | null;
};

const SOFT_COUNT_HINTS: Array<{words: string[]; count: number}> = [
  {words: ["one"], count: 1},
  {words: ["two", "couple"], count: 2},
  {words: ["few"], count: 3},
  {words: ["some"], count: 4},
  {words: ["many", "lots"], count: 6},
];

export type WardrobeItem = {
  id: string;
  category?: string;
  subCategory?: string;
  colors?: string[];
  primaryColor?: string;
  status?: string;
  brand?: string | null;
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

type OutfitCandidate = {
  picks: Array<{slot: Slot; itemId: string}>;
  score: number;
  reason: string;
  itemIds: string[];
};

function clamp01(value: unknown, fallback = 0.5): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

export function inferRequestedOutfitCount(text: string): number | null {
  const normalized = String(text ?? "").toLowerCase();
  const explicitMatch = normalized.match(
    /\b(\d{1,2})\b\s+(?:outfits?|looks?|options?)\b/
  );
  if (explicitMatch) {
    const numeric = Number(explicitMatch[1]);
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

export function fallbackIntent(prompt: string): OutfitIntentV1 {
  const normalized = prompt.toLowerCase();
  const occasion = (
    ["casual", "formal", "gym", "date", "work", "party", "travel"] as const
  ).find((value) => normalized.includes(value)) ?? "unknown";
  const warmthTarget = inferWarmth(prompt);

  return {
    occasion,
    formalityTarget: FORMALITY_BY_OCCASION[occasion] ?? 0.5,
    warmthTarget,
    needs: ["top", "bottom", "footwear"],
    niceToHave: warmthTarget > 0.65 ? ["outerwear"] : [],
    colorsWanted: normalizeColorList(
      ALLOWED_COLORS.filter((color) => normalized.includes(color)),
      2
    ),
    colorsAvoid: [],
    avoidLogos: normalized.includes("no logo") || normalized.includes("avoid logo"),
    excludeLaundry: true,
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

  return {
    occasion,
    formalityTarget: clamp01(
      parsed.formalityTarget,
      FORMALITY_BY_OCCASION[occasion] ?? 0.5
    ),
    warmthTarget: clamp01(parsed.warmthTarget, inferWarmth(sourceText)),
    needs: needs.length > 0 ? needs : ["top", "bottom", "footwear"],
    niceToHave,
    colorsWanted: normalizeColorList(parsed.colorsWanted, 2),
    colorsAvoid: normalizeColorList(parsed.colorsAvoid, 2),
    avoidLogos: !!parsed.avoidLogos,
    excludeLaundry: parsed.excludeLaundry !== false,
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
  ];
  const out: AllowedColor[] = [];
  for (const value of values) {
    const normalized = normalizeColor(value);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
  }
  return out;
}

function bucketForItem(item: WardrobeItem): Slot | null {
  const category = String(item.category ?? "").trim().toLowerCase();
  if (category === Category.TOP || category === Category.ONE_PIECE) return "top";
  if (category === Category.BOTTOM) return "bottom";
  if (category === Category.FOOTWEAR || category === "shoes") return "footwear";
  if (category === Category.OUTERWEAR) return "outerwear";
  return null;
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

function scoreItem(item: WardrobeItem, intent: OutfitIntentV1): number {
  const formalityScore = clamp01(item.formalityScore, 0.5);
  const warmthScore = clamp01(item.warmthScore, 0.5);
  const itemColors = normalizeItemColors(item);
  const logoPenalty = intent.avoidLogos && item.hasLogo ? 0.35 : 0;
  const missingPenalty =
    item.formalityScore == null || item.warmthScore == null ? 0.05 : 0;

  const score =
    0.35 * closeness(formalityScore, intent.formalityTarget) +
    0.35 * closeness(warmthScore, intent.warmthTarget) +
    0.15 * colorMatchScore(itemColors, intent.colorsWanted, intent.colorsAvoid) +
    0.1 * tagMatchScore(item, intent) -
    0.05 * recencyPenalty(item) -
    logoPenalty -
    missingPenalty;

  return score;
}

function compatibilityBonus(items: WardrobeItem[]): number {
  const colors = items.flatMap((item) => normalizeItemColors(item));
  if (colors.length === 0) return 0;
  const unique = new Set(colors);
  const neutralCount = colors.filter((color) => NEUTRAL_COLORS.has(color)).length;
  if (neutralCount >= 2) return 0.05;
  if (unique.size >= 4) return -0.05;
  return 0;
}

function buildReason(
  intent: OutfitIntentV1,
  picks: Array<{slot: Slot; item: WardrobeItem}>
): string {
  const reasons: string[] = [];
  if (intent.warmthTarget > 0.65) {
    reasons.push("Warm enough for colder weather");
  } else if (intent.warmthTarget < 0.35) {
    reasons.push("Light enough for warmer weather");
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
  limit: number
): ScoredItem[] {
  return items
    .map((item) => ({item, slot, score: scoreItem(item, intent)}))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function assembleOutfits(
  topItems: ScoredItem[],
  bottomItems: ScoredItem[],
  footwearItems: ScoredItem[],
  outerwearItems: ScoredItem[],
  intent: OutfitIntentV1,
  count: number
): OutfitCandidate[] {
  const topCandidates = topItems.slice(0, 10);
  const bottomCandidates = bottomItems.slice(0, 10);
  const footwearCandidates = footwearItems.slice(0, 10);
  const outerwearCandidates = outerwearItems.slice(0, 5);

  const combos: OutfitCandidate[] = [];
  for (const top of topCandidates) {
    for (const bottom of bottomCandidates) {
      for (const footwear of footwearCandidates) {
        const base = [top, bottom, footwear];
        let chosen = base;
        let bonus = compatibilityBonus(base.map((value) => value.item));

        if (intent.warmthTarget > 0.65 && outerwearCandidates.length > 0) {
          const outerwear = outerwearCandidates.find(
            (candidate) =>
              candidate.item.id !== top.item.id &&
              candidate.item.id !== bottom.item.id &&
              candidate.item.id !== footwear.item.id
          );
          if (outerwear) {
            chosen = [...base, outerwear];
            bonus += 0.03;
          }
        }

        const itemScores = chosen.map((value) => value.score);
        const outfitScore =
          itemScores.reduce((sum, value) => sum + value, 0) / itemScores.length + bonus;
        const picks = chosen.map((value) => ({
          slot: value.slot,
          itemId: value.item.id,
        }));
        combos.push({
          picks,
          score: outfitScore,
          reason: buildReason(
            intent,
            chosen.map((value) => ({slot: value.slot, item: value.item}))
          ),
          itemIds: picks.map((pick) => pick.itemId),
        });
      }
    }
  }

  combos.sort((a, b) => b.score - a.score);

  const selected: OutfitCandidate[] = [];
  const usedTops = new Set<string>();
  const usedBottoms = new Set<string>();
  for (const combo of combos) {
    const topId = combo.picks.find((pick) => pick.slot === "top")?.itemId ?? "";
    const bottomId = combo.picks.find((pick) => pick.slot === "bottom")?.itemId ?? "";
    const canUseFresh =
      (!usedTops.has(topId) || selected.length >= combos.length - 1) &&
      (!usedBottoms.has(bottomId) || selected.length >= combos.length - 1);
    if (!canUseFresh && selected.length < count - 1) {
      continue;
    }

    selected.push(combo);
    usedTops.add(topId);
    usedBottoms.add(bottomId);
    if (selected.length >= count) break;
  }

  if (selected.length < count) {
    for (const combo of combos) {
      if (selected.find((value) => value.itemIds.join("|") === combo.itemIds.join("|"))) {
        continue;
      }
      selected.push(combo);
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
    const ingestionStatus = String(item.ingestion?.status ?? "").trim().toLowerCase();
    const status = String(item.status ?? "").trim().toUpperCase();
    if (ingestionStatus !== "done") return false;
    if (intent.excludeLaundry) {
      return status === "AVAILABLE";
    }
    return status !== "IN_LAUNDRY";
  });
}

export function generateOutfitCandidates(
  allItems: WardrobeItem[],
  baseIntent: OutfitIntentV1,
  options?: {
    numOutfits?: number;
    constraints?: OutfitChatConstraints;
    preferredSlot?: Slot | null;
    excludeItemIds?: string[];
  }
): {
  outfits: OutfitCandidate[];
  slotCounts: Record<Slot, number>;
  eligibleCount: number;
  intent: OutfitIntentV1;
} {
  const count = clampNumOutfits(options?.numOutfits ?? 3, 3);
  const eligible = filterEligibleItems(allItems, baseIntent);
  const constrained = applyConstraints(eligible, baseIntent, options?.constraints);
  const explicitExclude = new Set(options?.excludeItemIds ?? []);
  const finalItems = constrained.items.filter((item) => !explicitExclude.has(item.id));

  const topBucket = finalItems.filter((item) => bucketForItem(item) === "top");
  const bottomBucket = finalItems.filter((item) => bucketForItem(item) === "bottom");
  const footwearBucket = finalItems.filter((item) => bucketForItem(item) === "footwear");
  const outerwearBucket = finalItems.filter((item) => bucketForItem(item) === "outerwear");

  const slotCounts = {
    top: topBucket.length,
    bottom: bottomBucket.length,
    footwear: footwearBucket.length,
    outerwear: outerwearBucket.length,
  };

  if (topBucket.length === 0 || bottomBucket.length === 0 || footwearBucket.length === 0) {
    return {outfits: [], slotCounts, eligibleCount: finalItems.length, intent: constrained.intent};
  }

  const scoredTop = selectTopCandidates(topBucket, "top", constrained.intent, 25);
  const scoredBottom = selectTopCandidates(bottomBucket, "bottom", constrained.intent, 25);
  const scoredFootwear = selectTopCandidates(footwearBucket, "footwear", constrained.intent, 25);
  const scoredOuterwear = selectTopCandidates(outerwearBucket, "outerwear", constrained.intent, 5);

  let outfits = assembleOutfits(
    scoredTop,
    scoredBottom,
    scoredFootwear,
    scoredOuterwear,
    constrained.intent,
    count
  );

  if (options?.preferredSlot) {
    outfits = outfits.sort((a, b) => {
      const aHas = a.picks.some((pick) => pick.slot === options.preferredSlot);
      const bHas = b.picks.some((pick) => pick.slot === options.preferredSlot);
      if (aHas === bHas) return b.score - a.score;
      return aHas ? -1 : 1;
    });
  }

  return {outfits, slotCounts, eligibleCount: finalItems.length, intent: constrained.intent};
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
