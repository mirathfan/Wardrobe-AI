import { ClothingItem } from "../types/ClothingItem";
import { MAX_WEARS_BEFORE_WASH, normalizeLaundryStatus, toCanonicalCategory } from "./items";

export type OutfitIntent = {
  occasion?: string;
  vibe?: string;
  colorPreference?: string[];
  includeOuterwear?: boolean;
  includeAccessory?: boolean;
  allowRewearToday?: boolean;
  allowOverWearLimit?: boolean;
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
  const base = [
    "Balanced top, bottom, and shoes selection",
    "good color harmony",
  ];

  if ((intent.colorPreference ?? []).length > 0) {
    base.push("matches your color preference");
  }

  const brands = Array.from(new Set(items.map((i) => norm(i.brand)).filter(Boolean)));
  if (brands.length === 1 && brands[0]) {
    base.push(`consistent ${brands[0]} brand tone`);
  }

  return `${base.join(", ")}.`;
}

function buildAccessoryOptions(items: ClothingItem[], includeAccessory: boolean) {
  if (!includeAccessory || items.length === 0) return [[] as ClothingItem[]];

  const top = items.slice(0, 6);
  const out: ClothingItem[][] = [[]];

  for (let i = 0; i < top.length; i += 1) {
    out.push([top[i]]);
  }

  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      out.push([top[i], top[j]]);
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
  const pools = [
    tops.slice(0, 6),
    bottoms.slice(0, 6),
    shoes.slice(0, 6),
    intent.includeOuterwear ? outerwear.slice(0, 4) : [],
    intent.includeAccessory ? accessories.slice(0, 3) : [],
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
    candidates.push({
      itemIds: comboItems.map((item) => item.id),
      score:
        comboItems.length * 5 +
        comboColorScore(comboItems) +
        brandContinuityScore(comboItems) +
        colorPreferenceBonus(comboItems, intent) -
        wearPenalty(comboItems),
      title: "",
      reason:
        missingSuggestions.length > 0
          ? `Built only from available closet pieces. ${missingSuggestions.join("; ")}.`
          : reasonText(comboItems, intent),
    });
  }

  candidates.sort((a, b) => b.score - a.score || b.itemIds.length - a.itemIds.length);

  return candidates.slice(0, 3).map((candidate, index) => ({
    itemIds: candidate.itemIds,
    title: `Closest Closet Look ${index + 1}`,
    reason: candidate.reason,
    missingSuggestions,
  }));
}

export function generateOutfits(items: ClothingItem[], intent: OutfitIntent): OutfitSuggestion[] {
  const today = new Date();
  const allowWornStatus = !!intent.allowRewearToday || !!intent.allowOverWearLimit;

  const filtered = items.filter((item) => {
    if (!item?.id) return false;
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
  const accessoryOptions = buildAccessoryOptions(accessories, !!intent.includeAccessory);

  const candidates: ScoredOutfit[] = [];
  let created = 0;

  for (const top of tops.slice(0, 16)) {
    for (const bottom of bottoms.slice(0, 16)) {
      for (const shoe of shoes.slice(0, 16)) {
        for (const outer of outerOptions) {
          for (const acc of accessoryOptions) {
            const comboItems = [top, bottom, shoe, ...(outer ? [outer] : []), ...acc];

            const score =
              comboColorScore(comboItems) +
              brandContinuityScore(comboItems) +
              colorPreferenceBonus(comboItems, intent) -
              wearPenalty(comboItems);

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

  candidates.sort((a, b) => b.score - a.score || a.itemIds.join("|").localeCompare(b.itemIds.join("|")));

  const unique: OutfitSuggestion[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const key = [...c.itemIds].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      itemIds: c.itemIds,
      reason: c.reason,
      title: suggestionTitle(intent, unique.length),
    });
    if (unique.length >= 3) break;
  }

  return unique;
}
