import { toCanonicalCategory } from "@/src/lib/items";
import {
  estimateOutfitCount,
  getMinimumClosetProgress,
  MINIMUM_CLOSET_LABELS,
  type MinimumClosetCategory,
} from "@/src/lib/minimumCloset";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { DailyOutfitRecord, OutfitItemsByCategory } from "@/src/utils/dailyOutfits";

export type WardrobeCategoryKey =
  | "top"
  | "bottom"
  | "one_piece"
  | "shoes"
  | "outerwear"
  | "accessory";

export type WardrobeCategoryInsight = {
  key: WardrobeCategoryKey;
  label: string;
  count: number;
  percentage: number;
};

export type DominantColorInsight = {
  label: string;
  count: number;
  percentage: number;
  hex: string;
};

export type MissingPieceInsight = {
  key: MinimumClosetCategory;
  label: string;
  count: number;
  target: number;
  missingCount: number;
};

export type WardrobeItemUseInsight = {
  item: ClothingItem;
  usageCount: number;
  plannedCount: number;
  wornCount: number;
  lastUsedAt: number | null;
};

export type InventoryValueInsight = {
  totalEstimatedValue: number;
  pricedItemCount: number;
  displayedPricedItemCount: number;
  otherCurrencyItemCount: number;
  unpricedItemCount: number;
  averageItemValue: number;
  currency: string;
  hasValue: boolean;
  hasMixedCurrencies: boolean;
};

export type WardrobeInsights = {
  totalItemCount: number;
  categoryCounts: Record<WardrobeCategoryKey, number>;
  categoryPercentages: Record<WardrobeCategoryKey, number>;
  categories: WardrobeCategoryInsight[];
  dominantColors: DominantColorInsight[];
  missingPieces: MissingPieceInsight[];
  closetHealthScore: number;
  closetHealthInsight: string;
  estimatedOutfitPotential: number;
  plannedOutfitCount: number;
  wornOutfitCount: number;
  plannedOrWornCount: number;
  usageAvailable: boolean;
  mostUsefulItems: WardrobeItemUseInsight[];
  underusedItems: WardrobeItemUseInsight[];
  wardrobeMixNote: string;
  colorIdentityText: string;
  inventoryValue: InventoryValueInsight;
};

type BuildWardrobeInsightsInput = {
  items: ClothingItem[];
  outfitRecords?: (DailyOutfitRecord | null | undefined)[];
};

type ValueAwareClothingItem = Partial<ClothingItem> & {
  purchasePrice?: number | string | null;
  retailPrice?: number | string | null;
  estimatedValue?: number | string | null;
  value?: number | string | null;
  currency?: string | null;
};

const CATEGORY_ORDER: WardrobeCategoryInsight[] = [
  { key: "top", label: "Tops", count: 0, percentage: 0 },
  { key: "bottom", label: "Bottoms", count: 0, percentage: 0 },
  { key: "one_piece", label: "One-pieces", count: 0, percentage: 0 },
  { key: "shoes", label: "Footwear", count: 0, percentage: 0 },
  { key: "outerwear", label: "Outerwear", count: 0, percentage: 0 },
  { key: "accessory", label: "Accessories", count: 0, percentage: 0 },
];

const COLOR_HEX: Record<string, string> = {
  black: "#151216",
  white: "#F8F3EC",
  grey: "#9CA3AF",
  gray: "#9CA3AF",
  navy: "#1F2A44",
  blue: "#426A9E",
  green: "#496C4A",
  olive: "#68724A",
  red: "#9B2F32",
  brown: "#6D4A34",
  beige: "#CDBB9D",
  tan: "#B89570",
  khaki: "#AAA27F",
  cream: "#F3E2C7",
  gold: "#C9A24F",
  silver: "#C8C9C7",
  yellow: "#D8B84E",
  orange: "#B96832",
  pink: "#D193A0",
  purple: "#7A5A8D",
};

function emptyCategoryCounts(): Record<WardrobeCategoryKey, number> {
  return {
    top: 0,
    bottom: 0,
    one_piece: 0,
    shoes: 0,
    outerwear: 0,
    accessory: 0,
  };
}

function normalizeString(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function toCategoryKey(item: Partial<ClothingItem>): WardrobeCategoryKey {
  const raw = item.category ?? item.subCategory ?? item.type ?? "";
  return toCanonicalCategory(raw) as WardrobeCategoryKey;
}

function getItemColorSignals(item: Partial<ClothingItem>) {
  const signals = [
    item.primaryColor,
    item.displayColor,
    item.colorLabel,
    ...(Array.isArray(item.colors) ? item.colors : []),
    ...(Array.isArray(item.displayColors) ? item.displayColors : []),
    ...(Array.isArray(item.aiColors) ? item.aiColors : []),
    ...(Array.isArray(item.pixelColors) ? item.pixelColors : []),
    item.pixelColorHex,
  ];

  const unique = new Set<string>();
  signals.forEach((signal) => {
    const normalized = normalizeString(signal);
    if (!normalized || normalized === "unknown" || normalized === "other") return;
    unique.add(normalized);
  });
  return [...unique];
}

function titleCase(value: string) {
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value.toUpperCase();
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function hexForColor(label: string) {
  const normalized = normalizeString(label);
  if (/^#[0-9a-f]{3,8}$/i.test(normalized)) return normalized.toUpperCase();
  const direct = COLOR_HEX[normalized];
  if (direct) return direct;
  const matchedKey = Object.keys(COLOR_HEX).find((key) => normalized.includes(key));
  return matchedKey ? COLOR_HEX[matchedKey] : "#C9A24F";
}

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === "object") {
    const maybeTimestamp = value as {
      toMillis?: () => number;
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof maybeTimestamp.toMillis === "function") {
      const ms = maybeTimestamp.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof maybeTimestamp.toDate === "function") {
      const ms = maybeTimestamp.toDate().getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1000000);
    }
  }
  return null;
}

function dateKeyToMillis(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  if (!year || !month || !day) return null;
  const ms = new Date(year, month - 1, day).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function outfitItemIds(itemsByCategory?: OutfitItemsByCategory | null) {
  if (!itemsByCategory) return [];
  return [
    itemsByCategory.outerwear,
    itemsByCategory.top,
    itemsByCategory.bottom,
    itemsByCategory.shoes,
  ].filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function parseMoneyValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    const match = text.match(/\d(?:[\d,.]*\d)?/);
    if (!match) return null;
    const remainder = `${text.slice(0, match.index)}${text.slice((match.index ?? 0) + match[0].length)}`;
    const unsupportedRemainder = remainder
      .replace(/\b(?:USD|INR|EUR|GBP|CAD|AUD|AED)\b/gi, "")
      .replace(/US\$|CA\$|C\$|AU\$|A\$|\$|₹|€|£|د\.إ/gi, "")
      .replace(/[\s()/-]/g, "");
    if (unsupportedRemainder) return null;

    const numeric = match[0];
    const lastComma = numeric.lastIndexOf(",");
    const lastDot = numeric.lastIndexOf(".");
    let normalized = numeric;
    if (lastComma >= 0 && lastDot >= 0) {
      normalized =
        lastComma > lastDot
          ? numeric.replace(/\./g, "").replace(",", ".")
          : numeric.replace(/,/g, "");
    } else if (lastComma >= 0) {
      const decimalDigits = numeric.length - lastComma - 1;
      normalized = decimalDigits === 2 ? numeric.replace(",", ".") : numeric.replace(/,/g, "");
    }
    normalized = normalized.replace(/[^0-9.]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1_000_000
      ? Math.round(parsed * 100) / 100
      : null;
  }
  return null;
}

function getItemValue(item: ValueAwareClothingItem) {
  return (
    parseMoneyValue(item.estimatedValue) ??
    parseMoneyValue(item.purchasePrice) ??
    parseMoneyValue(item.price) ??
    parseMoneyValue(item.priceAmount) ??
    parseMoneyValue(item.retailPrice) ??
    parseMoneyValue(item.value)
  );
}

function getItemCurrency(item: ValueAwareClothingItem) {
  return String(item.currency ?? item.priceCurrency ?? "USD").trim().toUpperCase() || "USD";
}

function buildInventoryValue(items: ClothingItem[]): InventoryValueInsight {
  const currencyGroups = new Map<string, { count: number; total: number }>();
  let totalPricedItemCount = 0;

  items.forEach((rawItem) => {
    const item = rawItem as ValueAwareClothingItem;
    const value = getItemValue(item);
    if (value == null) return;
    totalPricedItemCount += 1;
    const currency = getItemCurrency(item);
    const current = currencyGroups.get(currency) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += value;
    currencyGroups.set(currency, current);
  });

  const [currency, selectedGroup] =
    [...currencyGroups.entries()].sort((a, b) => {
      const countDelta = b[1].count - a[1].count;
      if (countDelta !== 0) return countDelta;
      return b[1].total - a[1].total;
    })[0] ?? ["USD", { count: 0, total: 0 }];
  const averageItemValue =
    selectedGroup.count > 0 ? selectedGroup.total / selectedGroup.count : 0;

  return {
    totalEstimatedValue: selectedGroup.total,
    pricedItemCount: totalPricedItemCount,
    displayedPricedItemCount: selectedGroup.count,
    otherCurrencyItemCount: Math.max(0, totalPricedItemCount - selectedGroup.count),
    unpricedItemCount: Math.max(0, items.length - totalPricedItemCount),
    averageItemValue,
    currency,
    hasValue: totalPricedItemCount > 0,
    hasMixedCurrencies: currencyGroups.size > 1,
  };
}

function collectUsage(records: (DailyOutfitRecord | null | undefined)[]) {
  const usage = new Map<
    string,
    { plannedCount: number; wornCount: number; lastUsedAt: number | null }
  >();
  let plannedOutfitCount = 0;
  let wornOutfitCount = 0;

  function recordItem(id: string, key: "plannedCount" | "wornCount", usedAt: number | null) {
    const current = usage.get(id) ?? {
      plannedCount: 0,
      wornCount: 0,
      lastUsedAt: null,
    };
    current[key] += 1;
    if (usedAt != null) {
      current.lastUsedAt = Math.max(current.lastUsedAt ?? 0, usedAt);
    }
    usage.set(id, current);
  }

  records.forEach((record) => {
    if (!record) return;
    const fallbackMs = dateKeyToMillis(record.dateKey);
    if (record.plannedOutfit) {
      plannedOutfitCount += 1;
      const usedAt = toMillis(record.plannedOutfit.createdAt) ?? fallbackMs;
      outfitItemIds(record.plannedOutfit.itemsByCategory).forEach((id) => {
        recordItem(id, "plannedCount", usedAt);
      });
    }
    if (record.wornOutfit) {
      wornOutfitCount += 1;
      const usedAt = toMillis(record.wornOutfit.wornAt) ?? fallbackMs;
      outfitItemIds(record.wornOutfit.itemsByCategory).forEach((id) => {
        recordItem(id, "wornCount", usedAt);
      });
    }
  });

  return {
    usage,
    plannedOutfitCount,
    wornOutfitCount,
    plannedOrWornCount: plannedOutfitCount + wornOutfitCount,
  };
}

function itemLastWornAt(item: ClothingItem) {
  return toMillis(item.lastWornAt) ?? toMillis(item.lastWornDate);
}

function normalizeVersatilityScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value <= 1) return Math.round(value * 100);
  return Math.max(0, Math.min(100, value));
}

function closetUtilityScore(item: ClothingItem) {
  const category = toCategoryKey(item);
  const categoryWeight =
    category === "top" || category === "bottom" || category === "shoes"
      ? 24
      : category === "outerwear" || category === "one_piece"
        ? 18
        : 10;
  const colorWeight = getItemColorSignals(item).length ? 8 : 0;
  const favoriteWeight = item.isFavorite ? 16 : 0;
  const versatilityWeight = normalizeVersatilityScore(item.versatilityScore) * 0.42;
  const wornWeight = itemLastWornAt(item) ? 8 : 0;

  return categoryWeight + colorWeight + favoriteWeight + versatilityWeight + wornWeight;
}

function usageInsightForItem(
  item: ClothingItem,
  usage: Map<string, { plannedCount: number; wornCount: number; lastUsedAt: number | null }>
): WardrobeItemUseInsight {
  const itemUsage = usage.get(item.id);
  const plannedCount = itemUsage?.plannedCount ?? 0;
  const wornCount = itemUsage?.wornCount ?? 0;

  return {
    item,
    plannedCount,
    wornCount,
    usageCount: plannedCount + wornCount,
    lastUsedAt: itemUsage?.lastUsedAt ?? itemLastWornAt(item),
  };
}

function buildMostUsefulItems(
  items: ClothingItem[],
  usage: Map<string, { plannedCount: number; wornCount: number; lastUsedAt: number | null }>,
  usageAvailable: boolean
) {
  const entries = items.map((item) => usageInsightForItem(item, usage));

  if (usageAvailable) {
    return entries
      .sort((a, b) => {
        const usageDelta = b.usageCount - a.usageCount;
        if (usageDelta !== 0) return usageDelta;
        return closetUtilityScore(b.item) - closetUtilityScore(a.item);
      })
      .slice(0, 5);
  }

  return entries
    .sort((a, b) => closetUtilityScore(b.item) - closetUtilityScore(a.item))
    .slice(0, 5);
}

function buildUnderusedItems(
  items: ClothingItem[],
  usage: Map<string, { plannedCount: number; wornCount: number; lastUsedAt: number | null }>,
  usageAvailable: boolean,
  mostUsefulItems: WardrobeItemUseInsight[]
) {
  const mvpIds = new Set(mostUsefulItems.slice(0, 3).map((entry) => entry.item.id));
  const entries = items
    .map((item) => usageInsightForItem(item, usage))
    .filter((entry) => !mvpIds.has(entry.item.id));

  const sorted = usageAvailable
    ? entries.sort((a, b) => {
        const usageDelta = a.usageCount - b.usageCount;
        if (usageDelta !== 0) return usageDelta;
        return (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0);
      })
    : entries.sort((a, b) => {
        const aWorn = a.lastUsedAt ?? 0;
        const bWorn = b.lastUsedAt ?? 0;
        if (aWorn !== bWorn) return aWorn - bWorn;
        const aWearCount = Number(a.item.wearCountSinceWash ?? 0);
        const bWearCount = Number(b.item.wearCountSinceWash ?? 0);
        if (aWearCount !== bWearCount) return aWearCount - bWearCount;
        return (toMillis(a.item.createdAt) ?? 0) - (toMillis(b.item.createdAt) ?? 0);
      });

  return sorted.slice(0, 3);
}

function buildClosetHealthInsight(score: number, missingPieces: MissingPieceInsight[], totalItemCount: number) {
  if (totalItemCount === 0) {
    return "AURA needs a few anchor pieces before it can read your wardrobe with confidence.";
  }
  if (score >= 86) {
    return "AURA sees a strong wardrobe core with enough range to keep daily outfits intentional.";
  }
  if (score >= 68) {
    return "Your closet has a good base. A few precise additions would make the rotation feel more complete.";
  }
  if (missingPieces.length) {
    return `${missingPieces[0].label} would unlock more range before anything trend-led matters.`;
  }
  return "The foundation is forming. More color, category, and usage signals will sharpen AURA's reads.";
}

function buildWardrobeMixNote(categories: WardrobeCategoryInsight[], totalItemCount: number) {
  if (totalItemCount === 0) {
    return "Add a few core pieces and AURA will start reading your wardrobe balance.";
  }

  const strongest = [...categories].sort((a, b) => b.count - a.count)[0];
  const weakest = [...categories].sort((a, b) => a.count - b.count)[0];

  if (!strongest || !weakest) return "AURA is still learning your wardrobe balance.";
  if (strongest.key === weakest.key) {
    return `${strongest.label} are setting the tone, with room for more category depth.`;
  }
  return `${strongest.label} are your strongest lane; ${weakest.label.toLowerCase()} are the easiest unlock.`;
}

function isNeutralColor(label: string) {
  const value = normalizeString(label);
  return /\b(black|white|grey|gray|navy|brown|beige|tan|khaki|cream)\b/.test(value);
}

function buildColorIdentityText(colors: DominantColorInsight[]) {
  if (!colors.length) {
    return "AURA needs a little more color data before it can define your palette.";
  }

  const top = colors.slice(0, 3);
  const neutralCount = top.filter((color) => isNeutralColor(color.label)).length;
  if (neutralCount === top.length) {
    return `Your palette is refined and neutral-led, anchored by ${top.map((color) => color.label.toLowerCase()).join(", ")}.`;
  }
  if (neutralCount > 0) {
    const color = top.find((entry) => !isNeutralColor(entry.label));
    return `A neutral base is carrying the wardrobe, with ${color?.label.toLowerCase() ?? "color"} giving it direction.`;
  }
  return `${top[0].label} is doing the strongest visual work, with a more expressive color story emerging.`;
}

function buildHealthScore(input: {
  totalItemCount: number;
  minimumPercent: number;
  categoryCoveragePercent: number;
  estimatedOutfitPotential: number;
  usageAvailable: boolean;
  underusedCount: number;
}) {
  const {
    totalItemCount,
    minimumPercent,
    categoryCoveragePercent,
    estimatedOutfitPotential,
    usageAvailable,
    underusedCount,
  } = input;

  if (totalItemCount <= 0) return 0;

  const foundation = minimumPercent * 45;
  const categoryCoverage = categoryCoveragePercent * 20;
  const outfitRange = Math.min(1, estimatedOutfitPotential / 36) * 18;
  const rotation = usageAvailable
    ? Math.max(0, 1 - underusedCount / Math.max(1, totalItemCount)) * 17
    : Math.min(1, totalItemCount / 18) * 17;

  return Math.max(0, Math.min(100, Math.round(foundation + categoryCoverage + outfitRange + rotation)));
}

export function buildWardrobeInsights({
  items,
  outfitRecords = [],
}: BuildWardrobeInsightsInput): WardrobeInsights {
  const safeItems = Array.isArray(items) ? items : [];
  const totalItemCount = safeItems.length;
  const categoryCounts = emptyCategoryCounts();

  safeItems.forEach((item) => {
    categoryCounts[toCategoryKey(item)] += 1;
  });

  const categoryPercentages = emptyCategoryCounts();
  const categories = CATEGORY_ORDER.map((category) => {
    const count = categoryCounts[category.key];
    const percentage = totalItemCount > 0 ? Math.round((count / totalItemCount) * 100) : 0;
    categoryPercentages[category.key] = percentage;
    return {
      ...category,
      count,
      percentage,
    };
  });

  const colorCounts = new Map<string, number>();
  safeItems.forEach((item) => {
    getItemColorSignals(item).forEach((color) => {
      colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
    });
  });
  const dominantColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([color, count]) => ({
      label: titleCase(color),
      count,
      percentage: totalItemCount > 0 ? Math.round((count / totalItemCount) * 100) : 0,
      hex: hexForColor(color),
    }));

  const minimumProgress = getMinimumClosetProgress(safeItems);
  const missingPieces = minimumProgress.categories
    .filter((category) => category.count < category.target)
    .map((category) => ({
      key: category.key,
      label: MINIMUM_CLOSET_LABELS[category.key],
      count: category.count,
      target: category.target,
      missingCount: category.target - category.count,
    }));
  const estimatedOutfitPotential = estimateOutfitCount(safeItems);
  const usageSummary = collectUsage(outfitRecords);
  const usageAvailable = usageSummary.usage.size > 0;
  const mostUsefulItems = buildMostUsefulItems(safeItems, usageSummary.usage, usageAvailable);
  const underusedItems = buildUnderusedItems(
    safeItems,
    usageSummary.usage,
    usageAvailable,
    mostUsefulItems
  );
  const categoryCoveragePercent =
    categories.filter((category) => category.count > 0).length / CATEGORY_ORDER.length;
  const closetHealthScore = buildHealthScore({
    totalItemCount,
    minimumPercent: minimumProgress.percent,
    categoryCoveragePercent,
    estimatedOutfitPotential,
    usageAvailable,
    underusedCount: underusedItems.length,
  });

  return {
    totalItemCount,
    categoryCounts,
    categoryPercentages,
    categories,
    dominantColors,
    missingPieces,
    closetHealthScore,
    closetHealthInsight: buildClosetHealthInsight(closetHealthScore, missingPieces, totalItemCount),
    estimatedOutfitPotential,
    plannedOutfitCount: usageSummary.plannedOutfitCount,
    wornOutfitCount: usageSummary.wornOutfitCount,
    plannedOrWornCount: usageSummary.plannedOrWornCount,
    usageAvailable,
    mostUsefulItems,
    underusedItems,
    wardrobeMixNote: buildWardrobeMixNote(categories, totalItemCount),
    colorIdentityText: buildColorIdentityText(dominantColors),
    inventoryValue: buildInventoryValue(safeItems),
  };
}
