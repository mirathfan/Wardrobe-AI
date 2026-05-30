import { ClothingItem } from "../types/ClothingItem";
import { isVisibleWardrobeItem, MAX_WEARS_BEFORE_WASH, normalizeLaundryStatus, toCanonicalCategory } from "./items";
import {
  ACCESSORY_SLOT_ORDER,
  getAccessorySlot,
  type AccessorySlot,
} from "@/shared/accessorySlots";
import {
  classifyAuraStylingIntent,
  isItemIncompatibleWithOccasion,
  scoreAuraOutfitQuality,
  scoreAuraItemForIntent,
} from "@/shared/auraStylingIntelligence";
import {
  isCapOrHat,
  isCleanBaseLayer,
  isLoungeBottom,
  isOfficeFootwear,
  isStructuredLayer,
  isTankOrSleeveless,
  scoreOutfitForOccasion,
} from "@/shared/auraOutfitCritic";

export type OutfitIntent = {
  occasion?: string;
  vibe?: string;
  colorPreference?: string[];
  excludedCategories?: string[];
  includeOuterwear?: boolean;
  includeAccessory?: boolean;
  allowRewearToday?: boolean;
  allowOverWearLimit?: boolean;
  excludeItemIds?: string[];
  recentItemIds?: string[];
  previousLookItemIds?: string[];
  previousLookSignatures?: string[];
  maxOverlap?: number;
  numOutfits?: number;
};

export type OutfitSuggestion = {
  itemIds: string[];
  title: string;
  reason: string;
  missingSuggestions?: string[];
};

type DatedValue = { toDate?: () => Date } | number | Date | null | undefined;

type ScoredOutfit = {
  itemIds: string[];
  score: number;
  reason: string;
  title: string;
};

const NEUTRAL_COLORS = new Set([
  "black",
  "white",
  "grey",
  "gray",
  "beige",
  "cream",
  "navy",
]);

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function toDate(value: DatedValue): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function wasWornToday(item: ClothingItem, today: Date) {
  const lastWorn = toDate(item.lastWornDate as DatedValue);
  return !!lastWorn && isSameLocalDay(lastWorn, today);
}

function colorList(item: ClothingItem) {
  const values = [
    ...(item.colors ?? []),
    item.primaryColor ?? "",
  ]
    .map((c) => norm(c))
    .filter(Boolean);
  return Array.from(new Set(values));
}

function overlapScore(a: string[], b: string[]) {
  const setB = new Set(b);
  let score = 0;
  for (const c of a) {
    if (setB.has(c)) score += 3;
    if (NEUTRAL_COLORS.has(c)) score += 1;
  }
  return score;
}

function comboColorScore(items: ClothingItem[]) {
  const colors = items.map(colorList);
  let score = 0;
  for (let i = 0; i < colors.length; i += 1) {
    for (let j = i + 1; j < colors.length; j += 1) {
      score += overlapScore(colors[i], colors[j]);
    }
  }
  return score;
}

function brandContinuityScore(items: ClothingItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const b = norm(item.brand);
    if (!b) continue;
    counts[b] = (counts[b] ?? 0) + 1;
  }
  return Object.values(counts).reduce((acc, n) => (n >= 2 ? acc + 2 : acc), 0);
}

function wearPenalty(items: ClothingItem[]) {
  let penalty = 0;
  for (const item of items) {
    const wears = Number(item.wearCountSinceWash ?? 0);
    if (wears >= MAX_WEARS_BEFORE_WASH - 1) penalty += 2;
  }
  return penalty;
}

function itemSignature(itemIds: string[]) {
  return Array.from(new Set(itemIds.map((id) => String(id).trim()).filter(Boolean))).sort().join("|");
}

function requestedOutfitCount(intent: OutfitIntent, fallback = 3) {
  const n = Number(intent.numOutfits);
  const numeric = Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(1, Math.min(8, numeric));
}

function overlapCount(itemIds: string[], otherIds?: string[]) {
  const other = new Set((otherIds ?? []).map((id) => String(id).trim()).filter(Boolean));
  if (!other.size) return 0;
  return itemIds.filter((id) => other.has(id)).length;
}

function diversityPenalty(itemIds: string[], intent: OutfitIntent) {
  const previousOverlap = overlapCount(itemIds, intent.previousLookItemIds);
  const recentOverlap = overlapCount(itemIds, intent.recentItemIds);
  const signature = itemSignature(itemIds);
  const previousSignatures = new Set(intent.previousLookSignatures ?? []);
  const maxOverlap = Math.max(0, Number(intent.maxOverlap ?? 2));
  let penalty = 0;
  if (previousSignatures.has(signature)) penalty += 999;
  if (previousOverlap > maxOverlap) penalty += (previousOverlap - maxOverlap) * 8;
  penalty += previousOverlap * 2.4;
  penalty += Math.max(0, recentOverlap - previousOverlap) * 0.8;
  return penalty;
}

function colorPreferenceBonus(items: ClothingItem[], intent: OutfitIntent) {
  const pref = (intent.colorPreference ?? []).map(norm).filter(Boolean);
  if (!pref.length) return 0;
  const prefSet = new Set(pref);
  let bonus = 0;
  for (const item of items) {
    for (const c of colorList(item)) {
      if (prefSet.has(c)) bonus += 1.5;
    }
  }
  return bonus;
}

function uniqueNormalizedStrings(values: (string | null | undefined)[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = norm(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function auraIntentContext(intent: OutfitIntent) {
  const classified = classifyAuraStylingIntent(
    [intent.occasion, intent.vibe].filter(Boolean).join(" "),
  );
  return {
    occasion: classified.occasion ?? intent.occasion,
    vibe: classified.vibe ?? intent.vibe,
    excludedColors: classified.excludedColors,
    excludedCategories: uniqueNormalizedStrings([
      ...(intent.excludedCategories ?? []),
      ...classified.excludedCategories,
    ]),
    explicitSportsContext: classified.explicitSportsContext,
  };
}

function auraCompatibilityScore(items: ClothingItem[], intent: OutfitIntent) {
  const context = auraIntentContext(intent);
  return items.reduce((sum, item) => {
    const scored = scoreAuraItemForIntent(item, context);
    return sum + scored.score * 3.5 - scored.penalties.length * 2.5;
  }, 0);
}

const DEBUG_AURA_ACCESSORIES =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const DEBUG_AURA_CRITIC =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const accessoryDiscardDebugKeys = new Set<string>();

type AccessoryMood = "safe" | "balanced" | "bold";

function itemStyleText(item: ClothingItem) {
  const extended = item as ClothingItem & {
    visualWeight?: string | null;
  };
  return [
    item.category,
    item.subCategory,
    item.type,
    item.name,
    item.brand,
    item.style,
    item.formality,
    item.pattern,
    item.material,
    extended.visualWeight,
    ...(item.aestheticTags ?? []),
    ...(item.occasionTags ?? []),
    ...(item.seasonTags ?? []),
    ...(item.detailTags ?? []),
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

function intentText(intent: OutfitIntent) {
  return `${intent.vibe ?? ""} ${intent.occasion ?? ""}`.toLowerCase();
}

function inferAccessoryMood(intent: OutfitIntent): AccessoryMood {
  const text = intentText(intent);
  if (/\b(safe|minimal|clean|simple|quiet|classic|work|office|formal|interview)\b/.test(text)) {
    return "safe";
  }
  if (/\b(bold|statement|party|night|tonight|date|edgy|colorful|standout)\b/.test(text)) {
    return "bold";
  }
  return "balanced";
}

function isFormalIntent(intent: OutfitIntent) {
  return /\b(formal|office|work|business|interview|wedding|black tie|smart)\b/.test(intentText(intent));
}

function isStreetwearIntent(intent: OutfitIntent) {
  return /\b(street|streetwear|skate|sneaker|casual|hoodie|cargo)\b/.test(intentText(intent));
}

function isColdIntent(intent: OutfitIntent) {
  return /\b(cold|winter|snow|freezing|chilly)\b/.test(intentText(intent));
}

function isWarmSunnyIntent(intent: OutfitIntent) {
  return /\b(hot|summer|sun|sunny|beach|humid|warm)\b/.test(intentText(intent));
}

function accessoryLabel(item: ClothingItem) {
  return item.name || item.subCategory || item.type || item.category || "Accessory";
}

function debugAccessoryDiscard(
  slot: AccessorySlot,
  discarded: ClothingItem,
  winner: ClothingItem
) {
  if (!DEBUG_AURA_ACCESSORIES) return;
  const key = `${slot}:${discarded.id}:${winner.id}`;
  if (accessoryDiscardDebugKeys.has(key) || accessoryDiscardDebugKeys.size > 80) return;
  accessoryDiscardDebugKeys.add(key);
  console.log(
    `[AURA_ACCESSORY_SLOT] Discarded accessory "${accessoryLabel(discarded)}" because ${slot} slot already has "${accessoryLabel(winner)}" with better color/vibe score.`
  );
}

function accessoryScoreForOutfit(
  accessory: ClothingItem,
  baseItems: ClothingItem[],
  intent: OutfitIntent
) {
  const slot = getAccessorySlot(accessory);
  const mood = inferAccessoryMood(intent);
  const text = itemStyleText(accessory);
  const accessoryColors = colorList(accessory);
  const baseColors = baseItems.flatMap(colorList);
  const uniqueBaseColors = new Set(baseColors);
  const hasNeutral = accessoryColors.some((color) => NEUTRAL_COLORS.has(color));
  const hasNonNeutral = accessoryColors.some((color) => !NEUTRAL_COLORS.has(color));
  const sharesBaseColor = accessoryColors.some((color) => uniqueBaseColors.has(color));
  const isMinimal = /\b(minimal|simple|classic|clean|plain|solid|thin|slim|subtle)\b/.test(text);
  const isStatement = /\b(statement|bold|chunky|logo|graphic|bright|colorful|oversized|monogram)\b/.test(text);
  const isSporty = /\b(cap|baseball|snapback|beanie|sport|athletic|gym|backpack)\b/.test(text);
  const streetwear = isStreetwearIntent(intent) || /\b(streetwear|skate|sneaker)\b/.test(text);

  let score =
    comboColorScore([...baseItems, accessory]) -
    comboColorScore(baseItems) +
    brandContinuityScore([...baseItems, accessory]) -
    brandContinuityScore(baseItems) +
    colorPreferenceBonus([accessory], intent) -
    wearPenalty([accessory]) * 0.5;

  if (accessory.isFavorite) score += 2;
  if (sharesBaseColor) score += 1.2;
  if (hasNeutral) score += 0.8;

  if (mood === "safe") {
    if (isMinimal || hasNeutral) score += 1.6;
    if (isStatement || (hasNonNeutral && !sharesBaseColor)) score -= 1.6;
  } else if (mood === "balanced") {
    if (sharesBaseColor || hasNeutral) score += 1;
    if (hasNonNeutral && uniqueBaseColors.size <= 3) score += 0.6;
    if (isStatement) score -= 0.25;
  } else {
    if (isStatement || hasNonNeutral) score += 1.3;
    if (hasNeutral) score += 0.25;
  }

  if (isFormalIntent(intent)) {
    if (slot === "wrist" || slot === "neck") score += 1.1;
    if (slot === "bag" && /\b(handbag)\b/.test(text)) score += 0.7;
    if (isSporty && !streetwear) score -= 2.4;
  }

  if (streetwear) {
    if (slot === "headwear") score += 1.4;
    if (slot === "neck" || slot === "bag") score += 0.45;
  }

  if (isColdIntent(intent)) {
    if (/\bbeanie\b/.test(text)) score += 1.3;
    if (slot === "eyewear") score -= 0.6;
  }

  if (isWarmSunnyIntent(intent)) {
    if (slot === "eyewear") score += 1.2;
    if (/\bbeanie\b/.test(text)) score -= 1.2;
  }

  if (/\b(travel|commute|errand|airport)\b/.test(intentText(intent)) && slot === "bag") {
    score += 1;
  }

  if (uniqueBaseColors.size >= 4 && hasNonNeutral && !sharesBaseColor) {
    score -= 1.25;
  }

  return score;
}

function sortAccessoriesForOutfit(
  items: ClothingItem[],
  baseItems: ClothingItem[],
  intent: OutfitIntent
) {
  return items
    .map((item, index) => ({
      item,
      index,
      score: accessoryScoreForOutfit(item, baseItems, intent),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

function dedupeAccessorySelection(
  items: ClothingItem[],
  baseItems: ClothingItem[],
  intent: OutfitIntent
) {
  const grouped: Partial<Record<AccessorySlot, ClothingItem[]>> = {};
  const passthrough: ClothingItem[] = [];

  for (const item of items) {
    const slot = getAccessorySlot(item);
    if (!slot) {
      passthrough.push(item);
      continue;
    }
    grouped[slot] = [...(grouped[slot] ?? []), item];
  }

  const winners: ClothingItem[] = [];
  for (const slot of ACCESSORY_SLOT_ORDER) {
    const group = grouped[slot] ?? [];
    if (!group.length) continue;
    const ranked = sortAccessoriesForOutfit(group, baseItems, intent);
    const winner = ranked[0]?.item;
    if (!winner) continue;
    winners.push(winner);
    for (const discarded of ranked.slice(1)) {
      debugAccessoryDiscard(slot, discarded.item, winner);
    }
  }

  const seen = new Set<string>();
  return [...winners, ...passthrough].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function suggestionTitle(intent: OutfitIntent, index: number) {
  const vibe = norm(intent.vibe);
  const occasion = norm(intent.occasion);
  if (vibe && occasion) return `${capitalize(vibe)} ${capitalize(occasion)} Look ${index + 1}`;
  if (vibe) return `${capitalize(vibe)} Look ${index + 1}`;
  if (occasion) return `${capitalize(occasion)} Outfit ${index + 1}`;
  return `Smart Outfit ${index + 1}`;
}

function capitalize(v: string) {
  if (!v) return v;
  return `${v[0].toUpperCase()}${v.slice(1)}`;
}

function reasonText(items: ClothingItem[], intent: OutfitIntent) {
  const context = auraIntentContext(intent);
  const quality = scoreAuraOutfitQuality(items, context);
  const critic = scoreOutfitForOccasion({
    userPrompt: intentText(intent),
    occasion: context.occasion ?? intent.occasion,
    vibe: context.vibe ?? intent.vibe,
    items,
  });
  const occasion = norm(context.occasion);
  if (occasion === "business_casual" || /\b(office|work|business casual|smart casual)\b/.test(intentText(intent))) {
    return critic.positiveSignals.length
      ? `Office-ready because it has ${critic.positiveSignals.slice(0, 2).join(" and ")}.`
      : "A smart casual office base from the closet pieces available.";
  }
  if (occasion.includes("date")) {
    return quality.signals.length
      ? `Date-ready because it adds ${quality.signals.slice(0, 2).join(" and ")}.`
      : "A clean date base from the closet pieces available.";
  }
  if (norm(context.vibe).includes("clean") || norm(context.vibe).includes("minimal")) {
    return quality.signals.length
      ? `Cleaner because it leans on ${quality.signals.slice(0, 2).join(" and ")}.`
      : "A cleaner casual base from your closet.";
  }
  const base = ["Pulled together from your closet"];

  if ((intent.colorPreference ?? []).length > 0) {
    base.push("matches your color preference");
  }

  const brands = Array.from(new Set(items.map((i) => norm(i.brand)).filter(Boolean)));
  if (brands.length === 1 && brands[0]) {
    base.push(`consistent ${brands[0]} brand tone`);
  }
  if (quality.signals.length) {
    base.push(quality.signals.slice(0, 2).join(" and "));
  }

  return `${base.join(", ")}.`;
}

function criticFeedbackForItems(
  items: ClothingItem[],
  intent: OutfitIntent,
  context = auraIntentContext(intent),
) {
  return scoreOutfitForOccasion({
    userPrompt: intentText(intent),
    occasion: context.occasion ?? intent.occasion,
    vibe: context.vibe ?? intent.vibe,
    items,
  });
}

function criticScoreAdjustment(feedback: ReturnType<typeof scoreOutfitForOccasion>) {
  return (
    (feedback.score - 72) * 0.18 -
    feedback.blockingIssues.length * 12 -
    feedback.warnings.length * 2.5
  );
}

function debugAuraCritic(
  label: string,
  items: ClothingItem[],
  feedback: ReturnType<typeof scoreOutfitForOccasion>,
  extra: Record<string, unknown> = {},
) {
  if (!DEBUG_AURA_CRITIC) return;
  console.log("[AURA_CRITIC]", label, {
    score: feedback.score,
    shouldRegenerate: feedback.shouldRegenerate,
    blockingIssues: feedback.blockingIssues.map((issue) => issue.code),
    warnings: feedback.warnings.map((issue) => issue.code),
    itemIds: items.map((item) => item.id),
    ...extra,
  });
}

function itemRole(item: ClothingItem): "top" | "bottom" | "shoes" | "outerwear" | "accessory" {
  const category = toCanonicalCategory(item.category);
  return category === "one_piece" ? "top" : category;
}

function officeReplacementScore(
  item: ClothingItem,
  role: ReturnType<typeof itemRole>,
  usedIds: Set<string>,
  intent: OutfitIntent,
  context: ReturnType<typeof auraIntentContext>,
) {
  if (usedIds.has(item.id)) return -999;
  if (itemRole(item) !== role) return -999;
  if (isItemIncompatibleWithOccasion(item, context.occasion, context.explicitSportsContext)) return -999;
  const scored = scoreAuraItemForIntent(item, context);
  if (scored.penalties.some((penalty) => penalty.startsWith("excluded_"))) return -999;
  let score = scored.score;
  if (role === "top") {
    if (isTankOrSleeveless(item)) return -999;
    if (isCleanBaseLayer(item)) score += 3.5;
    if (/\b(button|polo|knit|sweater|collared|dress shirt|oxford)\b/.test(itemStyleText(item))) score += 3.5;
  }
  if (role === "bottom") {
    if (isLoungeBottom(item)) return -999;
    if (/\b(trouser|chino|slack|tailored|dark denim|clean denim)\b/.test(itemStyleText(item))) score += 4;
  }
  if (role === "shoes") {
    if (!isOfficeFootwear(item)) score -= 2.5;
    else score += 4;
  }
  if (role === "outerwear") {
    if (isStructuredLayer(item)) score += 4;
  }
  if (role === "accessory" && isCapOrHat(item)) return -999;
  score += colorPreferenceBonus([item], intent);
  return score;
}

function chooseOfficeReplacement(
  pool: ClothingItem[],
  role: ReturnType<typeof itemRole>,
  usedIds: Set<string>,
  intent: OutfitIntent,
  context: ReturnType<typeof auraIntentContext>,
) {
  return pool
    .map((item) => ({
      item,
      score: officeReplacementScore(item, role, usedIds, intent, context),
    }))
    .filter((entry) => entry.score > -50)
    .sort((a, b) => b.score - a.score)[0]?.item ?? null;
}

function repairCandidateWithCritic(params: {
  candidate: ScoredOutfit;
  itemsById: Map<string, ClothingItem>;
  tops: ClothingItem[];
  bottoms: ClothingItem[];
  shoes: ClothingItem[];
  outerwear: ClothingItem[];
  accessories: ClothingItem[];
  intent: OutfitIntent;
  context: ReturnType<typeof auraIntentContext>;
}) {
  const currentItems = params.candidate.itemIds
    .map((itemId) => params.itemsById.get(itemId))
    .filter((item): item is ClothingItem => !!item);
  const feedback = criticFeedbackForItems(currentItems, params.intent, params.context);
  if (!feedback.shouldRegenerate) return params.candidate;

  const nextIds = params.candidate.itemIds.slice();
  const usedIds = new Set(nextIds);
  let repaired = false;

  const replaceRole = (role: ReturnType<typeof itemRole>, pool: ClothingItem[], predicate: (item: ClothingItem) => boolean) => {
    const index = nextIds.findIndex((itemId) => {
      const item = params.itemsById.get(itemId);
      return !!item && itemRole(item) === role && predicate(item);
    });
    if (index < 0) return;
    const previousId = nextIds[index];
    usedIds.delete(previousId);
    const replacement = chooseOfficeReplacement(pool, role, usedIds, params.intent, params.context);
    if (!replacement) {
      usedIds.add(previousId);
      return;
    }
    nextIds[index] = replacement.id;
    usedIds.add(replacement.id);
    repaired = true;
  };

  replaceRole("top", params.tops, (item) => isTankOrSleeveless(item) || (!isCleanBaseLayer(item) && !/\b(button|polo|knit|sweater|collared|dress shirt|oxford)\b/.test(itemStyleText(item))));
  replaceRole("bottom", params.bottoms, (item) => isLoungeBottom(item) || /\b(gym|athletic|shorts|sweatpants|joggers|drawstring)\b/.test(itemStyleText(item)));
  replaceRole("shoes", params.shoes, (item) => !isOfficeFootwear(item));

  const accessoryIndex = nextIds.findIndex((itemId) => {
    const item = params.itemsById.get(itemId);
    return !!item && itemRole(item) === "accessory" && isCapOrHat(item);
  });
  if (accessoryIndex >= 0) {
    const previousId = nextIds[accessoryIndex];
    usedIds.delete(previousId);
    const replacement = chooseOfficeReplacement(params.accessories, "accessory", usedIds, params.intent, params.context);
    if (replacement) {
      nextIds[accessoryIndex] = replacement.id;
      usedIds.add(replacement.id);
    } else {
      nextIds.splice(accessoryIndex, 1);
    }
    repaired = true;
  }

  const hasOuterwear = nextIds.some((itemId) => {
    const item = params.itemsById.get(itemId);
    return !!item && itemRole(item) === "outerwear";
  });
  const hasTee = nextIds.some((itemId) => {
    const item = params.itemsById.get(itemId);
    return !!item && itemRole(item) === "top" && isCleanBaseLayer(item) && /\b(tee|t shirt|tshirt)\b/.test(itemStyleText(item));
  });
  if (!hasOuterwear && hasTee) {
    const layer = chooseOfficeReplacement(params.outerwear.filter(isStructuredLayer), "outerwear", usedIds, params.intent, params.context);
    if (layer) {
      nextIds.push(layer.id);
      repaired = true;
    }
  }

  if (!repaired) return params.candidate;
  const nextItems = nextIds
    .map((itemId) => params.itemsById.get(itemId))
    .filter((item): item is ClothingItem => !!item);
  const nextFeedback = criticFeedbackForItems(nextItems, params.intent, params.context);
  debugAuraCritic("repaired_candidate", nextItems, nextFeedback, {
    previousScore: feedback.score,
    previousIssues: feedback.blockingIssues.map((issue) => issue.code),
  });
  return {
    ...params.candidate,
    itemIds: nextIds,
    score:
      params.candidate.score -
      criticScoreAdjustment(feedback) +
      criticScoreAdjustment(nextFeedback) +
      (nextFeedback.shouldRegenerate ? 0 : 4),
    reason: nextFeedback.shouldRegenerate
      ? params.candidate.reason
      : "AURA tightened this for office so it reads smart casual instead of weekend casual.",
  };
}

function buildAccessoryOptions(
  items: ClothingItem[],
  includeAccessory: boolean,
  baseItems: ClothingItem[],
  intent: OutfitIntent
) {
  if (!includeAccessory || items.length === 0) return [[] as ClothingItem[]];

  const mood = inferAccessoryMood(intent);
  const top = sortAccessoriesForOutfit(items, baseItems, intent)
    .slice(0, mood === "safe" || isFormalIntent(intent) ? 5 : 8)
    .map((entry) => entry.item);
  const out: ClothingItem[][] = [[]];
  const seen = new Set<string>([""]);

  const addOption = (selection: ClothingItem[]) => {
    const deduped = dedupeAccessorySelection(selection, baseItems, intent);
    if (!deduped.length) return;
    const key = deduped.map((item) => item.id).sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(deduped);
  };

  for (let i = 0; i < top.length; i += 1) {
    addOption([top[i]]);
  }

  const maxOptions = mood === "safe" || isFormalIntent(intent) ? 10 : 18;
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      addOption([top[i], top[j]]);
      if (out.length >= maxOptions) return out;
    }
  }

  return out;
}

function missingCoreSuggestions({
  tops,
  bottoms,
  shoes,
}: {
  tops: ClothingItem[];
  bottoms: ClothingItem[];
  shoes: ClothingItem[];
}) {
  return [
    tops.length === 0 ? "Add to complete: a versatile top" : "",
    bottoms.length === 0 ? "Add to complete: an easy bottom" : "",
    shoes.length === 0 ? "Add to complete: a pair of shoes" : "",
  ].filter(Boolean);
}

function generateSparseOutfits({
  tops,
  bottoms,
  shoes,
  outerwear,
  accessories,
  intent,
}: {
  tops: ClothingItem[];
  bottoms: ClothingItem[];
  shoes: ClothingItem[];
  outerwear: ClothingItem[];
  accessories: ClothingItem[];
  intent: OutfitIntent;
}): OutfitSuggestion[] {
  const accessoryPool = intent.includeAccessory
    ? sortAccessoriesForOutfit(accessories, [], intent).slice(0, 3).map((entry) => entry.item)
    : [];
  const pools = [
    tops.slice(0, 6),
    bottoms.slice(0, 6),
    shoes.slice(0, 6),
    intent.includeOuterwear ? outerwear.slice(0, 4) : [],
    accessoryPool,
  ].filter((pool) => pool.length > 0);

  if (pools.length === 0) return [];

  const missingSuggestions = missingCoreSuggestions({ tops, bottoms, shoes });
  const candidates: ScoredOutfit[] = [];
  const maxRows = Math.max(...pools.map((pool) => pool.length));

  for (let index = 0; index < maxRows; index += 1) {
    const comboItems = pools
      .map((pool) => pool[index % pool.length])
      .filter((item, itemIndex, list) => list.findIndex((entry) => entry.id === item.id) === itemIndex);
    if (!comboItems.length) continue;
    const critic = criticFeedbackForItems(comboItems, intent);
    candidates.push({
      itemIds: comboItems.map((item) => item.id),
      score:
        comboItems.length * 5 +
        comboColorScore(comboItems) +
        brandContinuityScore(comboItems) +
        colorPreferenceBonus(comboItems, intent) -
        wearPenalty(comboItems) -
        diversityPenalty(comboItems.map((item) => item.id), intent) +
        auraCompatibilityScore(comboItems, intent) +
        scoreAuraOutfitQuality(comboItems, auraIntentContext(intent)).qualityScore * 0.85 +
        criticScoreAdjustment(critic),
      title: "",
      reason:
        missingSuggestions.length > 0
          ? `Built only from available closet pieces. ${missingSuggestions.join("; ")}.`
          : reasonText(comboItems, intent),
    });
  }

  const itemsById = new Map(
    [...tops, ...bottoms, ...shoes, ...outerwear, ...accessories].map((item) => [item.id, item]),
  );
  const auraContext = auraIntentContext(intent);
  const reviewedCandidates = candidates.map((candidate) =>
    repairCandidateWithCritic({
      candidate,
      itemsById,
      tops,
      bottoms,
      shoes,
      outerwear,
      accessories,
      intent,
      context: auraContext,
    }),
  );

  reviewedCandidates.sort((a, b) => b.score - a.score || b.itemIds.length - a.itemIds.length);

  return reviewedCandidates.slice(0, requestedOutfitCount(intent)).map((candidate, index) => ({
    itemIds: candidate.itemIds,
    title: `Closest Closet Look ${index + 1}`,
    reason: candidate.reason,
    missingSuggestions,
  }));
}

export function generateOutfits(items: ClothingItem[], intent: OutfitIntent): OutfitSuggestion[] {
  const today = new Date();
  const allowWornStatus = !!intent.allowRewearToday || !!intent.allowOverWearLimit;
  const excludeSet = new Set((intent.excludeItemIds ?? []).map((id) => String(id).trim()).filter(Boolean));
  const auraContext = auraIntentContext(intent);

  const filtered = items.filter((item) => {
    if (!item?.id) return false;
    if (!isVisibleWardrobeItem(item)) return false;
    if (excludeSet.has(item.id)) return false;
    const auraCompatibility = scoreAuraItemForIntent(item, auraContext);
    if (auraCompatibility.penalties.some((penalty) => penalty.startsWith("excluded_"))) {
      return false;
    }
    if (isItemIncompatibleWithOccasion(item, auraContext.occasion, auraContext.explicitSportsContext)) {
      return false;
    }
    const laundryStatus = normalizeLaundryStatus(item);
    if (laundryStatus === "in_laundry") return false;
    if (!allowWornStatus && laundryStatus !== "clean") return false;
    if (!intent.allowRewearToday && wasWornToday(item, today)) return false;
    if (!intent.allowOverWearLimit && Number(item.wearCountSinceWash ?? 0) >= MAX_WEARS_BEFORE_WASH) {
      return false;
    }
    return true;
  });

  const tops = filtered.filter((i) => toCanonicalCategory(i.category) === "top");
  const bottoms = filtered.filter((i) => toCanonicalCategory(i.category) === "bottom");
  const shoes = filtered.filter((i) => toCanonicalCategory(i.category) === "shoes");
  const outerwear = filtered.filter((i) => toCanonicalCategory(i.category) === "outerwear");
  const accessories = filtered.filter((i) => toCanonicalCategory(i.category) === "accessory");

  if (tops.length === 0 || bottoms.length === 0 || shoes.length === 0) {
    return generateSparseOutfits({
      tops,
      bottoms,
      shoes,
      outerwear,
      accessories,
      intent,
    });
  }

  const outerOptions = intent.includeOuterwear ? [null, ...outerwear.slice(0, 8)] : [null];
  const candidates: ScoredOutfit[] = [];
  const itemsById = new Map(filtered.map((item) => [item.id, item]));
  let created = 0;

  for (const top of tops.slice(0, 16)) {
    for (const bottom of bottoms.slice(0, 16)) {
      for (const shoe of shoes.slice(0, 16)) {
        for (const outer of outerOptions) {
          const baseItems = [top, bottom, shoe, ...(outer ? [outer] : [])];
          const accessoryOptions = buildAccessoryOptions(
            accessories,
            !!intent.includeAccessory,
            baseItems,
            intent
          );
          for (const acc of accessoryOptions) {
            const comboItems = [
              ...baseItems,
              ...dedupeAccessorySelection(acc, baseItems, intent),
            ];
            const critic = criticFeedbackForItems(comboItems, intent, auraContext);

            const score =
              comboColorScore(comboItems) +
              brandContinuityScore(comboItems) +
              colorPreferenceBonus(comboItems, intent) -
              wearPenalty(comboItems) -
              diversityPenalty(comboItems.map((x) => x.id), intent) +
              auraCompatibilityScore(comboItems, intent) +
              scoreAuraOutfitQuality(comboItems, auraContext).qualityScore * 0.85 +
              criticScoreAdjustment(critic);

            candidates.push({
              itemIds: comboItems.map((x) => x.id),
              score,
              title: "",
              reason: reasonText(comboItems, intent),
            });

            created += 1;
            if (created >= 2000) break;
          }
          if (created >= 2000) break;
        }
        if (created >= 2000) break;
      }
      if (created >= 2000) break;
    }
    if (created >= 2000) break;
  }

  const reviewedCandidates = candidates.map((candidate) =>
    repairCandidateWithCritic({
      candidate,
      itemsById,
      tops,
      bottoms,
      shoes,
      outerwear,
      accessories,
      intent,
      context: auraContext,
    }),
  );

  reviewedCandidates.sort((a, b) => b.score - a.score || a.itemIds.join("|").localeCompare(b.itemIds.join("|")));

  const unique: OutfitSuggestion[] = [];
  const seen = new Set<string>();
  const targetCount = requestedOutfitCount(intent);

  for (const c of reviewedCandidates) {
    const key = [...c.itemIds].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const selectedItems = c.itemIds
      .map((itemId) => itemsById.get(itemId))
      .filter((item): item is ClothingItem => !!item);
    debugAuraCritic("selected_candidate", selectedItems, criticFeedbackForItems(selectedItems, intent, auraContext), {
      selectedIndex: unique.length,
      candidateScore: c.score,
    });
    unique.push({
      itemIds: c.itemIds,
      reason: c.reason,
      title: suggestionTitle(intent, unique.length),
    });
    if (unique.length >= targetCount) break;
  }

  return unique;
}
