import {
  MINIMUM_CLOSET_TARGETS,
  toMinimumClosetCategory,
  type MinimumClosetCategory,
} from "@/src/lib/minimumCloset";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";

export type WardrobeSuggestion = {
  id: string;
  itemType: string;
  category: "tops" | "bottoms" | "footwear" | "outerwear" | "accessories";
  reason: string;
  priority: "high" | "medium" | "low";
  impactScore: number;
  outfitsUnlockedEstimate: number;
  styleTags: string[];
  preferredColors: string[];
  priceTiers: ("budget" | "mid" | "premium")[];
};

export type WardrobeSuggestionLookSignal = {
  addToComplete?: string[] | null;
  missingPieces?: string[] | null;
  upgradeSuggestions?: string[] | null;
};

export type BuildWardrobeSuggestionsInput = {
  items?: Partial<ClothingItem>[] | null;
  profilePreferences?: Partial<UserProfilePreferences> | null;
  savedLooks?: WardrobeSuggestionLookSignal[] | null;
};

type SuggestionCategory = WardrobeSuggestion["category"];

type CategoryCounts = Record<SuggestionCategory, number>;

type SuggestionDraft = {
  itemType: string;
  category: SuggestionCategory;
  styleTags: string[];
  preferredColors: string[];
  priceTiers?: WardrobeSuggestion["priceTiers"];
};

const CATEGORY_ORDER: SuggestionCategory[] = [
  "tops",
  "bottoms",
  "footwear",
  "outerwear",
  "accessories",
];

const CORE_CATEGORIES = new Set<SuggestionCategory>(["tops", "bottoms", "footwear"]);

const NEUTRAL_COLORS = [
  "black",
  "white",
  "navy",
  "grey",
  "gray",
  "beige",
  "cream",
  "tan",
  "brown",
  "olive",
];

const STYLE_TAGS = {
  smart: ["smart", "smart casual", "office", "work", "business", "formal", "classic", "tailored"],
  street: ["street", "streetwear", "skate", "sneaker", "cargo", "oversized"],
  casual: ["casual", "everyday", "weekend", "minimal", "clean", "basics"],
  feminine: ["feminine", "dress", "romantic", "soft"],
  athletic: ["athletic", "gym", "sport", "active", "athleisure"],
};

function clean(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slug(value: string) {
  return clean(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueStrings(values: (string | null | undefined)[], max = 8) {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const next = clean(value);
    if (!next || seen.has(next) || next === "unknown" || next === "other") return;
    seen.add(next);
    out.push(next);
  });
  return out.slice(0, max);
}

function getCounts(items: Partial<ClothingItem>[]): CategoryCounts {
  return items.reduce<CategoryCounts>(
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

export function groupWardrobeSuggestionItems(items?: Partial<ClothingItem>[] | null) {
  const safeItems = Array.isArray(items) ? items : [];
  return safeItems.reduce<Record<SuggestionCategory, Partial<ClothingItem>[]>>(
    (groups, item) => {
      groups[toMinimumClosetCategory(item)].push(item);
      return groups;
    },
    {
      tops: [],
      bottoms: [],
      footwear: [],
      outerwear: [],
      accessories: [],
    },
  );
}

function itemColorSignals(item: Partial<ClothingItem>) {
  return uniqueStrings([
    item.primaryColor,
    item.displayColor,
    item.colorLabel,
    ...(Array.isArray(item.colors) ? item.colors : []),
    ...(Array.isArray(item.displayColors) ? item.displayColors : []),
    ...(Array.isArray(item.aiColors) ? item.aiColors : []),
  ]);
}

function dominantWardrobeColors(items: Partial<ClothingItem>[]) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    itemColorSignals(item).forEach((color) => {
      counts.set(color, (counts.get(color) ?? 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
}

function profileStyleSignals(profile?: Partial<UserProfilePreferences> | null) {
  return uniqueStrings(
    [
      profile?.wardrobeMode,
      ...(profile?.styleAesthetics ?? []),
      ...(profile?.goals ?? []),
      ...(profile?.occasionPriority ?? []),
      ...(profile?.accessoryPreferences ?? []),
      ...(profile?.stylePreferences?.preferredStyles ?? []),
    ],
    16,
  );
}

function profileFavoriteColors(profile?: Partial<UserProfilePreferences> | null) {
  const avoided = new Set(
    uniqueStrings([
      ...(profile?.avoidedColors ?? []),
      ...(profile?.stylePreferences?.avoidedColors ?? []),
    ]),
  );
  return uniqueStrings([
    ...(profile?.favoriteColors ?? []),
    ...(profile?.stylePreferences?.favoriteColors ?? []),
  ]).filter((color) => !avoided.has(color));
}

function hasStyle(styles: string[], styleKey: keyof typeof STYLE_TAGS) {
  const text = styles.join(" ");
  return STYLE_TAGS[styleKey].some((tag) => text.includes(tag));
}

function hasColor(colors: string[], color: string) {
  const target = clean(color);
  return colors.some((value) => value.includes(target));
}

function selectPreferredColors(params: {
  itemType: string;
  category: SuggestionCategory;
  favoriteColors: string[];
  wardrobeColors: string[];
}) {
  const item = clean(params.itemType);
  const explicit = NEUTRAL_COLORS.filter((color) => item.includes(color));
  const favoriteNeutrals = params.favoriteColors.filter((color) =>
    NEUTRAL_COLORS.some((neutral) => color.includes(neutral)),
  );
  const wardrobeNeutrals = params.wardrobeColors.filter((color) =>
    NEUTRAL_COLORS.some((neutral) => color.includes(neutral)),
  );

  const categoryDefaults: Record<SuggestionCategory, string[]> = {
    tops: ["white", "light blue", "cream"],
    bottoms: ["charcoal", "navy", "black"],
    footwear: ["white", "black", "brown"],
    outerwear: ["black", "navy", "olive"],
    accessories: ["black", "brown", "silver"],
  };

  return uniqueStrings([
    ...explicit,
    ...favoriteNeutrals,
    ...wardrobeNeutrals,
    ...params.favoriteColors,
    ...categoryDefaults[params.category],
  ], 3).map(titleCase);
}

function lookSignals(savedLooks?: WardrobeSuggestionLookSignal[] | null) {
  return uniqueStrings(
    (savedLooks ?? []).flatMap((look) => [
      ...(look.addToComplete ?? []),
      ...(look.missingPieces ?? []),
      ...(look.upgradeSuggestions ?? []),
    ]),
    20,
  );
}

function inferDraftForGap(params: {
  category: SuggestionCategory;
  styleSignals: string[];
  wardrobeColors: string[];
  favoriteColors: string[];
  savedLookSignals: string[];
}): SuggestionDraft {
  const { category, styleSignals, wardrobeColors, favoriteColors, savedLookSignals } = params;
  const wantsSmart = hasStyle(styleSignals, "smart") || savedLookSignals.some((value) => /\b(blazer|loafer|trouser|oxford|office)\b/.test(value));
  const wantsStreet = hasStyle(styleSignals, "street") || savedLookSignals.some((value) => /\b(bomber|sneaker|cargo|street)\b/.test(value));
  const wantsCasual = hasStyle(styleSignals, "casual");
  const wantsFeminine = hasStyle(styleSignals, "feminine");
  const wantsAthletic = hasStyle(styleSignals, "athletic");
  const hasDarkBase = hasColor(wardrobeColors, "black") || hasColor(wardrobeColors, "navy");

  let itemType: string;
  let styleTags: string[];

  if (category === "footwear") {
    itemType = wantsSmart && !wantsStreet ? "black loafers" : "white sneakers";
    if (wantsAthletic) itemType = "clean everyday sneakers";
    styleTags = ["versatile", wantsSmart ? "smart casual" : "everyday"];
  } else if (category === "outerwear") {
    itemType = wantsSmart ? "versatile blazer" : hasDarkBase || wantsStreet ? "black bomber jacket" : "lightweight overshirt";
    styleTags = ["layering", wantsSmart ? "tailored" : wantsStreet ? "streetwear" : "everyday"];
  } else if (category === "bottoms") {
    itemType = wantsStreet ? "straight-leg dark denim" : wantsFeminine ? "neutral skirt or trousers" : "neutral trousers";
    styleTags = ["outfit anchor", wantsSmart ? "tailored" : wantsCasual ? "everyday" : "versatile"];
  } else if (category === "accessories") {
    itemType = wantsFeminine ? "structured everyday bag" : wantsSmart ? "minimal leather belt" : "everyday belt";
    styleTags = ["finishing piece", wantsSmart ? "polished" : "everyday"];
  } else {
    itemType = wantsSmart ? "oxford shirt" : wantsStreet ? "clean heavyweight tee" : "oxford shirt";
    styleTags = ["wardrobe base", wantsSmart ? "smart casual" : "everyday"];
  }

  return {
    itemType,
    category,
    styleTags: uniqueStrings([...styleTags, ...styleSignals], 5).map(titleCase),
    preferredColors: selectPreferredColors({
      itemType,
      category,
      favoriteColors,
      wardrobeColors,
    }),
    priceTiers: ["budget", "mid", "premium"],
  };
}

function outfitBase(counts: CategoryCounts) {
  return counts.tops * counts.bottoms * counts.footwear;
}

function outfitsUnlockedByCategory(counts: CategoryCounts, category: SuggestionCategory) {
  const currentBase = outfitBase(counts);
  if (CORE_CATEGORIES.has(category)) {
    const next = { ...counts };
    next[category] += 1;
    const marginal = outfitBase(next) - currentBase;
    if (marginal > 0) return marginal;
    const pairedCategories = CATEGORY_ORDER.filter(
      (key) => CORE_CATEGORIES.has(key) && key !== category,
    );
    return Math.max(1, ...pairedCategories.map((key) => counts[key]));
  }
  if (category === "outerwear") {
    return currentBase > 0 ? Math.max(1, Math.ceil(currentBase * 0.5)) : Math.max(1, counts.tops + counts.bottoms);
  }
  return currentBase > 0 ? Math.max(1, Math.ceil(currentBase * 0.25)) : 1;
}

function priorityForGap(params: {
  category: SuggestionCategory;
  count: number;
  target: number;
  outfitsUnlockedEstimate: number;
}): WardrobeSuggestion["priority"] {
  const deficit = Math.max(0, params.target - params.count);
  if (params.count === 0 && CORE_CATEGORIES.has(params.category)) return "high";
  if (deficit >= 2 || params.outfitsUnlockedEstimate >= 6) return "high";
  if (deficit >= 1 || params.outfitsUnlockedEstimate >= 2) return "medium";
  return "low";
}

function reasonForSuggestion(params: {
  draft: SuggestionDraft;
  count: number;
  target: number;
  outfitsUnlockedEstimate: number;
  baseOutfits: number;
}) {
  const estimate = Math.max(0, Math.round(params.outfitsUnlockedEstimate));
  const impact =
    estimate > 0
      ? ` Estimated impact: +${estimate} outfit combination${estimate === 1 ? "" : "s"}.`
      : "";
  if (params.baseOutfits === 0 && CORE_CATEGORIES.has(params.draft.category)) {
    return `Your closet has useful pieces, but it is missing a reliable ${params.draft.category === "footwear" ? "shoe" : params.draft.category.slice(0, -1)} anchor. A ${params.draft.itemType} gives AURA a stronger base to build complete outfits from.${impact}`;
  }
  if (params.draft.category === "outerwear") {
    return `Your core outfits are forming; the gap is the finishing layer. A ${params.draft.itemType} adds shape and polish without pulling the closet away from what you already wear.${impact}`;
  }
  if (params.draft.category === "accessories") {
    return `Your basics can already do the work. A ${params.draft.itemType} gives simple looks a more finished edge and makes repeated outfits feel more intentional.${impact}`;
  }
  return `Your wardrobe has a workable foundation, but this category is still thin. A ${params.draft.itemType} gives AURA a versatile anchor it can reuse across the outfits you already own.${impact}`;
}

function categoryWeight(category: SuggestionCategory) {
  if (category === "tops") return 6;
  if (category === "bottoms") return 5;
  if (category === "footwear") return 5;
  if (category === "outerwear") return 3;
  return 1;
}

export function buildWardrobeSuggestions(input: BuildWardrobeSuggestionsInput): WardrobeSuggestion[] {
  const items = Array.isArray(input.items) ? input.items : [];
  const counts = getCounts(items);
  const wardrobeColors = dominantWardrobeColors(items);
  const favoriteColors = profileFavoriteColors(input.profilePreferences);
  const styleSignals = profileStyleSignals(input.profilePreferences);
  const savedLookSignals = lookSignals(input.savedLooks);
  const baseOutfits = outfitBase(counts);

  const suggestions = CATEGORY_ORDER.flatMap((category) => {
    const target = MINIMUM_CLOSET_TARGETS[category as MinimumClosetCategory];
    const count = counts[category];
    if (count >= target) return [];

    const draft = inferDraftForGap({
      category,
      styleSignals,
      wardrobeColors,
      favoriteColors,
      savedLookSignals,
    });
    const outfitsUnlockedEstimate = outfitsUnlockedByCategory(counts, category);
    const priority = priorityForGap({
      category,
      count,
      target,
      outfitsUnlockedEstimate,
    });
    const deficit = Math.max(0, target - count);
    const impactScore =
      outfitsUnlockedEstimate * 10 +
      deficit * 8 +
      categoryWeight(category) +
      (priority === "high" ? 12 : priority === "medium" ? 6 : 0);

    return [
      {
        id: `${category}-${slug(draft.itemType)}`,
        itemType: draft.itemType,
        category,
        reason: reasonForSuggestion({
          draft,
          count,
          target,
          outfitsUnlockedEstimate,
          baseOutfits,
        }),
        priority,
        impactScore,
        outfitsUnlockedEstimate,
        styleTags: draft.styleTags,
        preferredColors: draft.preferredColors,
        priceTiers: draft.priceTiers ?? ["budget", "mid", "premium"],
      },
    ];
  });

  return suggestions
    .sort((a, b) => b.impactScore - a.impactScore || a.itemType.localeCompare(b.itemType))
    .slice(0, 3);
}

export function inferSuggestionCategoryFromText(value: string): SuggestionCategory {
  const text = clean(value);
  if (/\b(shoe|sneaker|boot|loafer|heel|sandal)\b/.test(text)) return "footwear";
  if (/\b(jacket|coat|blazer|bomber|outerwear|overshirt|hoodie|layer)\b/.test(text)) return "outerwear";
  if (/\b(belt|watch|bag|hat|cap|sunglasses|jewelry|scarf)\b/.test(text)) return "accessories";
  if (/\b(pant|trouser|jean|short|skirt|bottom)\b/.test(text)) return "bottoms";
  return "tops";
}

export function buildAdHocWardrobeSuggestion(itemType: string): WardrobeSuggestion {
  const cleanItemType =
    clean(itemType)
      .replace(/^add to complete\s*:?\s*/i, "")
      .replace(/^(an?|the)\s+/i, "")
      .trim() || "versatile piece";
  const category = inferSuggestionCategoryFromText(cleanItemType);
  return {
    id: `${category}-${slug(cleanItemType) || "missing-piece"}`,
    itemType: cleanItemType,
    category,
    reason: `This is the cleanest gap to fill first. It helps complete the look without adding clutter or pushing your wardrobe in a random direction.`,
    priority: CORE_CATEGORIES.has(category) ? "medium" : "low",
    impactScore: CORE_CATEGORIES.has(category) ? 32 : 18,
    outfitsUnlockedEstimate: CORE_CATEGORIES.has(category) ? 2 : 1,
    styleTags: ["Versatile"],
    preferredColors: selectPreferredColors({
      itemType: cleanItemType,
      category,
      favoriteColors: [],
      wardrobeColors: [],
    }),
    priceTiers: ["budget", "mid", "premium"],
  };
}
