import type { ClothingItem } from "@/src/types/ClothingItem";
import { toCanonicalCategory, type CanonicalCategory } from "@/src/lib/items";

export type MinimumClosetCategory =
  | "tops"
  | "bottoms"
  | "footwear"
  | "outerwear"
  | "accessories";

export type MinimumClosetCategoryProgress = {
  key: MinimumClosetCategory;
  label: string;
  count: number;
  target: number;
  complete: boolean;
};

export type MinimumClosetProgress = {
  itemCount: number;
  current: number;
  target: number;
  targetTotal: number;
  percent: number;
  estimatedOutfits: number;
  categories: MinimumClosetCategoryProgress[];
  missingCategories: MinimumClosetCategory[];
  suggestedNextCategory: MinimumClosetCategory | null;
  isUnlocked: boolean;
};

export const MINIMUM_CLOSET_UNLOCK_ITEM_COUNT = 10;

export const MINIMUM_CLOSET_TARGETS: Record<MinimumClosetCategory, number> = {
  tops: 4,
  bottoms: 3,
  footwear: 2,
  outerwear: 1,
  accessories: 1,
};

export const MINIMUM_CLOSET_LABELS: Record<MinimumClosetCategory, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  footwear: "Shoes",
  outerwear: "Outerwear",
  accessories: "Accessories",
};

const CATEGORY_ORDER: MinimumClosetCategory[] = [
  "tops",
  "bottoms",
  "footwear",
  "outerwear",
  "accessories",
];
const UNLOCK_CATEGORY_ORDER: MinimumClosetCategory[] = [
  "tops",
  "bottoms",
  "footwear",
  "outerwear",
];

function clean(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function categorySignals(item: Partial<ClothingItem>) {
  return [
    item.category,
    item.subCategory,
    item.type,
    item.wearSlot,
    ...(item.detailTags ?? []),
    ...(item.occasionTags ?? []),
  ]
    .map(clean)
    .filter(Boolean);
}

export function toMinimumClosetCategory(
  item: Partial<ClothingItem> | string | null | undefined,
): MinimumClosetCategory {
  if (typeof item === "string" || item == null) {
    return fromCanonicalCategory(toCanonicalCategory(item ?? undefined));
  }

  const signals = categorySignals(item);
  const combined = signals.join(" ");

  if (/\b(shoe|shoes|footwear|sneaker|sneakers|boot|boots|loafer|loafers|heel|heels|sandal|sandals|slide|slides)\b/.test(combined)) {
    return "footwear";
  }
  if (/\b(outerwear|jacket|coat|blazer|hoodie|cardigan|overshirt|shacket|parka|trench)\b/.test(combined)) {
    return "outerwear";
  }
  if (/\b(accessory|accessories|hat|cap|watch|belt|bag|handbag|scarf|sunglasses|jewelry|necklace|bracelet|ring|earrings)\b/.test(combined)) {
    return "accessories";
  }
  if (/\b(bottom|pants|trousers|jeans|shorts|joggers|skirt)\b/.test(combined)) {
    return "bottoms";
  }
  if (/\b(top|shirt|t shirt|tshirt|tee|polo|sweater|blouse|tank|knit|sweatshirt)\b/.test(combined)) {
    return "tops";
  }

  return fromCanonicalCategory(toCanonicalCategory(item.category));
}

function fromCanonicalCategory(category: CanonicalCategory): MinimumClosetCategory {
  if (category === "top" || category === "one_piece") return "tops";
  if (category === "bottom") return "bottoms";
  if (category === "shoes") return "footwear";
  if (category === "outerwear") return "outerwear";
  return "accessories";
}

export function getMinimumClosetCounts(items: Partial<ClothingItem>[]) {
  return items.reduce<Record<MinimumClosetCategory, number>>(
    (counts, item) => {
      counts[toMinimumClosetCategory(item)] += 1;
      return counts;
    },
    {
      tops: 0,
      bottoms: 0,
      footwear: 0,
      outerwear: 0,
      accessories: 0,
    },
  );
}

export function estimateOutfitCount(items: Partial<ClothingItem>[]): number {
  const counts = getMinimumClosetCounts(items);
  const base = counts.tops * counts.bottoms * counts.footwear;

  if (base <= 0) {
    const partialBases = Math.max(counts.tops, counts.bottoms, counts.footwear);
    return counts.outerwear > 0 || counts.accessories > 0 ? partialBases : 0;
  }

  const layeredVariants = counts.outerwear > 0
    ? Math.min(base * counts.outerwear, base * 2)
    : 0;
  const accessoryLift = counts.accessories > 0
    ? Math.ceil(base * Math.min(counts.accessories, 2) * 0.25)
    : 0;

  return Math.max(0, Math.floor(base + layeredVariants + accessoryLift));
}

export function getMissingMinimumClosetCategories(
  items: Partial<ClothingItem>[],
): MinimumClosetCategory[] {
  const counts = getMinimumClosetCounts(items);
  return UNLOCK_CATEGORY_ORDER.filter((key) => counts[key] < MINIMUM_CLOSET_TARGETS[key]);
}

export function getMinimumClosetProgress(
  items: Partial<ClothingItem>[],
): MinimumClosetProgress {
  const counts = getMinimumClosetCounts(items);
  const targetTotal = CATEGORY_ORDER.reduce(
    (sum, key) => sum + MINIMUM_CLOSET_TARGETS[key],
    0,
  );
  const creditedCount = UNLOCK_CATEGORY_ORDER.reduce(
    (sum, key) => sum + Math.min(counts[key], MINIMUM_CLOSET_TARGETS[key]),
    0,
  );
  const current = Math.min(creditedCount, MINIMUM_CLOSET_UNLOCK_ITEM_COUNT);
  const missingCategories = getMissingMinimumClosetCategories(items);
  const suggestedNextCategory = missingCategories[0] ?? null;

  return {
    itemCount: items.length,
    current,
    target: MINIMUM_CLOSET_UNLOCK_ITEM_COUNT,
    targetTotal,
    percent: Math.min(1, current / MINIMUM_CLOSET_UNLOCK_ITEM_COUNT),
    estimatedOutfits: estimateOutfitCount(items),
    categories: CATEGORY_ORDER.map((key) => ({
      key,
      label: MINIMUM_CLOSET_LABELS[key],
      count: counts[key],
      target: MINIMUM_CLOSET_TARGETS[key],
      complete: counts[key] >= MINIMUM_CLOSET_TARGETS[key],
    })),
    missingCategories,
    suggestedNextCategory,
    isUnlocked: current >= MINIMUM_CLOSET_UNLOCK_ITEM_COUNT,
  };
}

function labelForMissing(category: MinimumClosetCategory) {
  if (category === "footwear") return "pair of shoes";
  if (category === "outerwear") return "jacket or layer";
  if (category === "accessories") return "finishing accessory";
  if (category === "bottoms") return "bottom";
  return "top";
}

export function getClosetUnlockNudge(items: Partial<ClothingItem>[]): string {
  const progress = getMinimumClosetProgress(items);
  const next = progress.suggestedNextCategory;

  if (!next) {
    return "Your style core is set. Accessories can keep stretching the range.";
  }
  if (next === "footwear") {
    return "You’re close. One more pair of shoes would give me way more range.";
  }
  if (next === "outerwear") {
    return "One jacket or layer would open up a lot more outfit range.";
  }

  return `One more ${labelForMissing(next)} would give your closet a stronger base.`;
}

export function buildMinimumClosetSummary(items: Partial<ClothingItem>[]) {
  const progress = getMinimumClosetProgress(items);
  return {
    itemCount: progress.itemCount,
    styleCoreProgress: `${progress.current}/${progress.target}`,
    nextBestAdd: progress.suggestedNextCategory
      ? MINIMUM_CLOSET_LABELS[progress.suggestedNextCategory]
      : null,
    outfitRange: progress.estimatedOutfits,
    nudge: getClosetUnlockNudge(items),
    tone: "Use this naturally. Say style core, outfit range, or next best add; do not say minimum closet target, estimated combinations, or missing categories.",
  };
}

export function getSuggestedAddItemCategory(items: Partial<ClothingItem>[]) {
  const next = getMinimumClosetProgress(items).suggestedNextCategory;
  if (next === "tops") return "top";
  if (next === "bottoms") return "bottom";
  if (next === "footwear") return "footwear";
  if (next === "outerwear") return "outerwear";
  if (next === "accessories") return "accessory";
  return null;
}
