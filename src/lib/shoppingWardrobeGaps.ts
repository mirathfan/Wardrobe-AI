import type { ClothingItem } from "../types/ClothingItem";
import type { UserProfilePreferences } from "../types/UserProfilePreferences";
import type { WardrobeGap } from "../types/shoppingRecommendations";
import {
  hasTokenOverlap,
  normalizeTextToken,
  normalizeTokenList,
} from "./shoppingRecommendationScoring";

export type ShoppingWardrobeGapSignal = {
  occasion?: string | null;
  season?: string | null;
  styleTags?: string[] | null;
  itemIds?: string[] | null;
  missingPieces?: string[] | null;
  addToComplete?: string[] | null;
  upgradeSuggestions?: string[] | null;
};

export type DetectShoppingWardrobeGapsInput = {
  wardrobeItems?: Partial<ClothingItem>[] | null;
  profilePreferences?: Partial<UserProfilePreferences> | null;
  recentOutfits?: ShoppingWardrobeGapSignal[] | null;
  savedLooks?: ShoppingWardrobeGapSignal[] | null;
};

type ShoppingGapCategory =
  | "tops"
  | "bottoms"
  | "footwear"
  | "outerwear"
  | "accessories"
  | "one_piece";

type CategoryCounts = Record<ShoppingGapCategory, number>;

const GAP_SOURCE = "shopping_wardrobe_gap_detector";
const NEUTRAL_COLOURS = [
  "black",
  "white",
  "navy",
  "grey",
  "gray",
  "charcoal",
  "cream",
  "beige",
  "tan",
  "brown",
  "olive",
];
const SMART_STYLE_TOKENS = [
  "smart",
  "smart casual",
  "work",
  "office",
  "business",
  "formal",
  "tailored",
  "polished",
  "blazer",
  "loafer",
  "oxford",
  "trouser",
  "dressy",
];
const CASUAL_FOOTWEAR_TOKENS = [
  "sneaker",
  "trainer",
  "casual",
  "slide",
  "sandal",
  "skate",
  "canvas",
];
const LAYERING_TOKENS = [
  "outerwear",
  "jacket",
  "coat",
  "blazer",
  "cardigan",
  "overshirt",
  "hoodie",
  "layer",
  "fleece",
  "trench",
  "parka",
  "puffer",
];
const SUMMER_TOKENS = [
  "summer",
  "warm",
  "hot",
  "linen",
  "lightweight",
  "shorts",
  "tank",
  "sandal",
  "resort",
  "vacation",
];
const COLD_WEATHER_TOKENS = [
  "winter",
  "cold",
  "fall",
  "autumn",
  "wool",
  "fleece",
  "thermal",
  "knit",
  "sweater",
  "coat",
  "parka",
  "puffer",
];
const OCCASION_RULES = {
  workwear: {
    tokens: ["work", "workwear", "office", "business", "professional", "smart", "formal"],
    suggestedStyleTags: ["workwear", "smart casual", "polished"],
  },
  evening: {
    tokens: ["evening", "date", "night out", "dinner", "party", "dressy", "cocktail"],
    suggestedStyleTags: ["evening", "polished", "dressy"],
  },
  casual: {
    tokens: ["casual", "everyday", "weekend", "relaxed"],
    suggestedStyleTags: ["casual", "everyday", "versatile"],
  },
  travel: {
    tokens: ["travel", "holiday", "vacation", "trip", "resort", "packable"],
    suggestedStyleTags: ["travel", "packable", "versatile"],
  },
  active: {
    tokens: ["gym", "active", "athletic", "workout", "running", "training", "sport"],
    suggestedStyleTags: ["active", "gym", "technical"],
  },
} as const;

export function normalizeShoppingGapToken(value: unknown): string {
  return normalizeTextToken(value);
}

export function normalizeShoppingGapTokens(value: unknown): string[] {
  if (!Array.isArray(value)) return normalizeTokenList(value);
  return normalizeTokenList(
    value.flatMap((entry): unknown =>
      Array.isArray(entry) ? normalizeShoppingGapTokens(entry) : entry
    )
  );
}

function slug(value: unknown) {
  return normalizeShoppingGapToken(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function clampPriority(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueTokens(values: unknown[], max = 16) {
  return normalizeShoppingGapTokens(values).slice(0, max);
}

function getItemText(item: Partial<ClothingItem>) {
  return uniqueTokens(
    [
      item.category,
      item.subCategory,
      item.type,
      item.name,
      item.brand,
      item.material,
      item.materials,
      item.style,
      item.fit,
      item.pattern,
      item.formality,
      item.warmth,
      item.layerRole,
      item.aestheticTags,
      item.detailTags,
      item.occasionTags,
      item.seasonTags,
    ],
    40
  ).join(" ");
}

export function getShoppingGapItemCategory(
  item: Partial<ClothingItem>
): ShoppingGapCategory {
  const text = getItemText(item);
  if (/\b(dress|jumpsuit|romper|one piece|one_piece)\b/.test(text)) return "one_piece";
  if (/\b(shoe|shoes|footwear|sneaker|trainer|boot|loafer|sandal|heel)\b/.test(text)) {
    return "footwear";
  }
  if (/\b(outerwear|jacket|coat|blazer|cardigan|overshirt|layer|hoodie)\b/.test(text)) {
    return "outerwear";
  }
  if (/\b(accessory|accessories|belt|bag|watch|hat|cap|scarf|jewelry|jewellery)\b/.test(text)) {
    return "accessories";
  }
  if (/\b(bottom|bottoms|pant|pants|trouser|jean|short|skirt|cargo|chino)\b/.test(text)) {
    return "bottoms";
  }
  return "tops";
}

function getItemColours(item: Partial<ClothingItem>) {
  return uniqueTokens([
    item.primaryColor,
    item.displayColor,
    item.colorLabel,
    item.colors,
    item.displayColors,
    item.aiColorLabel,
    item.aiColors,
  ]);
}

function getProfileAvoidedColours(profile?: Partial<UserProfilePreferences> | null) {
  return uniqueTokens([
    profile?.avoidedColors,
    profile?.stylePreferences?.avoidedColors,
  ]);
}

function getProfilePreferredColours(profile?: Partial<UserProfilePreferences> | null): string[] {
  const avoided = new Set(getProfileAvoidedColours(profile));
  const preferred = uniqueTokens([
    profile?.favoriteColors,
    profile?.stylePreferences?.favoriteColors,
  ]);
  return preferred.filter((colour) => !avoided.has(colour));
}

function getProfileText(profile?: Partial<UserProfilePreferences> | null) {
  return uniqueTokens(
    [
      profile?.wardrobeMode,
      profile?.styleAesthetics,
      profile?.accessoryPreferences,
      profile?.occasionPriority,
      profile?.goals,
      profile?.stylePreferences?.preferredStyles,
      profile?.favoriteColors,
      profile?.stylePreferences?.favoriteColors,
    ],
    50
  );
}

function getSignalText(signals?: ShoppingWardrobeGapSignal[] | null) {
  return uniqueTokens(
    (signals ?? []).flatMap((signal) => [
      signal.occasion,
      signal.season,
      signal.styleTags,
      signal.missingPieces,
      signal.addToComplete,
      signal.upgradeSuggestions,
    ]),
    80
  );
}

function hasAnyToken(text: string | string[], tokens: readonly string[]) {
  return tokens.some((token) => hasTokenOverlap(Array.isArray(text) ? text : [text], [token]));
}

function itemHasAnyToken(item: Partial<ClothingItem>, tokens: readonly string[]) {
  return hasAnyToken(getItemText(item), tokens);
}

function itemMatchesOccasion(item: Partial<ClothingItem>, key: keyof typeof OCCASION_RULES) {
  return itemHasAnyToken(item, OCCASION_RULES[key].tokens);
}

function itemIsSmart(item: Partial<ClothingItem>) {
  return itemHasAnyToken(item, SMART_STYLE_TOKENS);
}

function itemIsLayering(item: Partial<ClothingItem>) {
  return getShoppingGapItemCategory(item) === "outerwear" || itemHasAnyToken(item, LAYERING_TOKENS);
}

function itemIsSummer(item: Partial<ClothingItem>) {
  return itemHasAnyToken(item, SUMMER_TOKENS);
}

function itemIsColdWeather(item: Partial<ClothingItem>) {
  return itemHasAnyToken(item, COLD_WEATHER_TOKENS) || itemIsLayering(item);
}

export function getShoppingWardrobeCategoryCounts(
  wardrobeItems?: Partial<ClothingItem>[] | null
): CategoryCounts {
  return (wardrobeItems ?? []).reduce<CategoryCounts>(
    (counts, item) => {
      counts[getShoppingGapItemCategory(item)] += 1;
      return counts;
    },
    {
      tops: 0,
      bottoms: 0,
      footwear: 0,
      outerwear: 0,
      accessories: 0,
      one_piece: 0,
    }
  );
}

function preferredNeutralColours(profile?: Partial<UserProfilePreferences> | null): string[] {
  const preferred = getProfilePreferredColours(profile);
  const profileText = getProfileText(profile);
  const wantsNeutrals =
    preferred.some((colour) => NEUTRAL_COLOURS.includes(colour)) ||
    hasAnyToken(profileText, ["neutral", "minimal", "classic", "capsule"]);
  return wantsNeutrals ? preferred.filter((colour) => NEUTRAL_COLOURS.includes(colour)) : [];
}

function suggestedColours(
  profile: Partial<UserProfilePreferences> | null | undefined,
  fallbackColours: string[],
  max = 3
) {
  const avoided = new Set(getProfileAvoidedColours(profile));
  const preferred = getProfilePreferredColours(profile);
  const colours = [...preferred, ...fallbackColours]
    .map(normalizeShoppingGapToken)
    .filter((colour) => colour && !avoided.has(colour));
  return Array.from(new Set(colours)).slice(0, max);
}

function complementaryCategoriesFor(category: ShoppingGapCategory, counts: CategoryCounts) {
  if (category === "tops") return counts.bottoms <= counts.footwear ? ["bottoms"] : ["footwear"];
  if (category === "bottoms") return counts.tops <= counts.footwear ? ["tops"] : ["footwear"];
  if (category === "footwear") return counts.tops <= counts.bottoms ? ["tops"] : ["bottoms"];
  return ["tops", "bottoms", "footwear"].filter((key) => counts[key as ShoppingGapCategory] <= 1);
}

function makeGap(input: {
  id: string;
  type: string;
  category?: string;
  priorityScore: number;
  explanation: string;
  suggestedCategories: string[];
  suggestedColours?: string[];
  suggestedStyleTags?: string[];
  source?: string;
}): WardrobeGap {
  return {
    id: slug(input.id),
    type: input.type,
    category: input.category,
    priorityScore: clampPriority(input.priorityScore),
    explanation: input.explanation,
    suggestedCategories: Array.from(new Set(input.suggestedCategories.map(normalizeShoppingGapToken))).filter(Boolean),
    suggestedColours: input.suggestedColours?.length
      ? Array.from(new Set(input.suggestedColours.map(normalizeShoppingGapToken))).filter(Boolean)
      : undefined,
    suggestedStyleTags: input.suggestedStyleTags?.length
      ? Array.from(new Set(input.suggestedStyleTags.map(normalizeShoppingGapToken))).filter(Boolean)
      : undefined,
    source: input.source ?? GAP_SOURCE,
  };
}

function addGap(gaps: Map<string, WardrobeGap>, gap: WardrobeGap) {
  const existing = gaps.get(gap.id);
  if (!existing || gap.priorityScore > existing.priorityScore) {
    gaps.set(gap.id, gap);
  }
}

function detectCategoryImbalance(params: {
  items: Partial<ClothingItem>[];
  counts: CategoryCounts;
  profile?: Partial<UserProfilePreferences> | null;
  smartDemand: boolean;
  gaps: Map<string, WardrobeGap>;
}) {
  const { counts, gaps, profile, smartDemand } = params;
  const coreCount = counts.tops + counts.bottoms + counts.footwear + counts.one_piece;
  if (counts.tops >= 4 && counts.bottoms <= 1) {
    addGap(
      gaps,
      makeGap({
        id: "category-imbalance-bottoms",
        type: "category_imbalance",
        category: "bottoms",
        priorityScore: 82,
        explanation: "Your closet has many tops but few bottom anchors, so new tops may not unlock many outfits.",
        suggestedCategories: ["bottoms"],
        suggestedColours: suggestedColours(profile, ["black", "navy", "charcoal"]),
        suggestedStyleTags: ["versatile", smartDemand ? "tailored" : "everyday"],
      })
    );
  }
  if (counts.bottoms >= 3 && counts.tops <= 1) {
    addGap(
      gaps,
      makeGap({
        id: "category-imbalance-tops",
        type: "category_imbalance",
        category: "tops",
        priorityScore: 78,
        explanation: "Your closet has bottom options but not enough tops to make them feel different.",
        suggestedCategories: ["tops"],
        suggestedColours: suggestedColours(profile, ["white", "cream", "black"]),
        suggestedStyleTags: ["versatile", smartDemand ? "smart casual" : "everyday"],
      })
    );
  }
  if (coreCount >= 3 && counts.footwear === 0) {
    addGap(
      gaps,
      makeGap({
        id: "category-imbalance-footwear",
        type: "category_imbalance",
        category: "footwear",
        priorityScore: 80,
        explanation: "You have outfit pieces but no footwear recorded, which blocks complete outfit recommendations.",
        suggestedCategories: ["footwear"],
        suggestedColours: suggestedColours(profile, ["white", "black", "brown"]),
        suggestedStyleTags: ["versatile"],
      })
    );
  }
  if (coreCount >= 3 && counts.outerwear === 0) {
    addGap(
      gaps,
      makeGap({
        id: "category-imbalance-outerwear-layering",
        type: "category_imbalance_layering",
        category: "outerwear",
        priorityScore: smartDemand ? 86 : 76,
        explanation: "Your closet has enough core pieces to build outfits, but no layering piece to finish or adapt them.",
        suggestedCategories: ["outerwear"],
        suggestedColours: suggestedColours(profile, ["black", "navy", "olive", "camel"]),
        suggestedStyleTags: ["layering", smartDemand ? "smart casual" : "versatile"],
      })
    );
  }
  const accessoriesModeled =
    (profile?.selectedCategories ?? []).some((category) =>
      hasTokenOverlap([category], ["accessory", "accessories"])
    ) || Boolean(profile?.accessoryPreferences?.length);
  if (accessoriesModeled && coreCount >= 4 && counts.accessories === 0) {
    addGap(
      gaps,
      makeGap({
        id: "category-imbalance-accessories",
        type: "category_imbalance",
        category: "accessories",
        priorityScore: 54,
        explanation: "Accessories are part of your preferences, but none are recorded yet.",
        suggestedCategories: ["accessories"],
        suggestedColours: suggestedColours(profile, ["black", "brown", "silver"]),
        suggestedStyleTags: ["finishing piece", "versatile"],
      })
    );
  }
}

function detectFootwearAndOccasionGaps(params: {
  items: Partial<ClothingItem>[];
  profile?: Partial<UserProfilePreferences> | null;
  signalText: string[];
  smartDemand: boolean;
  gaps: Map<string, WardrobeGap>;
}) {
  const { items, profile, signalText, smartDemand, gaps } = params;
  const footwear = items.filter((item) => getShoppingGapItemCategory(item) === "footwear");
  const smartFootwearCount = footwear.filter(itemIsSmart).length;
  const casualFootwearCount = footwear.filter((item) => itemHasAnyToken(item, CASUAL_FOOTWEAR_TOKENS)).length;
  if (footwear.length > 0 && smartFootwearCount === 0 && (casualFootwearCount > 0 || smartDemand)) {
    addGap(
      gaps,
      makeGap({
        id: "occasion-smart-footwear",
        type: "occasion_gap",
        category: "footwear",
        priorityScore: smartDemand ? 78 : 64,
        explanation: "Your footwear skews casual, so smarter outfits do not have a polished shoe option.",
        suggestedCategories: ["footwear"],
        suggestedColours: suggestedColours(profile, ["black", "brown", "dark brown"]),
        suggestedStyleTags: ["smart casual", "polished", "tailored"],
      })
    );
  }

  Object.entries(OCCASION_RULES).forEach(([key, rule]) => {
    const occasionKey = key as keyof typeof OCCASION_RULES;
    const requested = hasAnyToken(signalText, rule.tokens);
    if (!requested) return;

    const matchingCount = items.filter((item) => itemMatchesOccasion(item, occasionKey)).length;
    if (occasionKey === "workwear") {
      const smartOuterwearCount = items.filter(
        (item) => getShoppingGapItemCategory(item) === "outerwear" && itemIsSmart(item)
      ).length;
      if (smartOuterwearCount === 0) {
        addGap(
          gaps,
          makeGap({
            id: "occasion-workwear-outerwear",
            type: "occasion_gap",
            category: "outerwear",
            priorityScore: 76,
            explanation: "Workwear is a stated signal, but there is no smart layer to finish those outfits.",
            suggestedCategories: ["outerwear"],
            suggestedColours: suggestedColours(profile, ["black", "navy", "charcoal"]),
            suggestedStyleTags: [...rule.suggestedStyleTags, "layering"],
          })
        );
      }
      return;
    }

    if (matchingCount <= 1) {
      const category = occasionKey === "active" ? "tops" : occasionKey === "travel" ? "outerwear" : "footwear";
      addGap(
        gaps,
        makeGap({
          id: `occasion-${occasionKey}`,
          type: "occasion_gap",
          category,
          priorityScore: occasionKey === "casual" ? 48 : 62,
          explanation: `Your preferences mention ${occasionKey}, but the closet has limited metadata for that use case.`,
          suggestedCategories:
            occasionKey === "active"
              ? ["tops", "bottoms", "footwear"]
              : occasionKey === "travel"
                ? ["outerwear", "tops", "bottoms"]
                : ["footwear", "outerwear", "tops"],
          suggestedColours: suggestedColours(profile, ["black", "navy", "white"]),
          suggestedStyleTags: [...rule.suggestedStyleTags],
        })
      );
    }
  });
}

function detectSeasonGaps(params: {
  items: Partial<ClothingItem>[];
  counts: CategoryCounts;
  profile?: Partial<UserProfilePreferences> | null;
  signalText: string[];
  gaps: Map<string, WardrobeGap>;
}) {
  const { items, counts, profile, signalText, gaps } = params;
  const summerCount = items.filter(itemIsSummer).length;
  const coldWeatherCount = items.filter(itemIsColdWeather).length;
  const explicitColdNeed = hasAnyToken(signalText, ["winter", "cold", "fall", "autumn", "layer"]);
  if ((summerCount >= 3 || explicitColdNeed) && coldWeatherCount === 0 && counts.outerwear === 0) {
    addGap(
      gaps,
      makeGap({
        id: "seasonal-layering",
        type: "season_gap",
        category: "outerwear",
        priorityScore: summerCount >= 3 ? 82 : 68,
        explanation: "Your closet reads warm-weather heavy, but it lacks a layer for cooler days or changing plans.",
        suggestedCategories: ["outerwear"],
        suggestedColours: suggestedColours(profile, ["black", "navy", "olive", "grey"]),
        suggestedStyleTags: ["cold weather", "layering", "versatile"],
      })
    );
  }

  const explicitSummerNeed = hasAnyToken(signalText, ["summer", "warm weather", "holiday", "travel"]);
  if (explicitSummerNeed && summerCount <= 1 && counts.tops <= 2) {
    addGap(
      gaps,
      makeGap({
        id: "seasonal-summer-basics",
        type: "season_gap",
        category: "tops",
        priorityScore: 58,
        explanation: "Warm-weather use cases are present, but there are few breathable summer basics.",
        suggestedCategories: ["tops", "bottoms"],
        suggestedColours: suggestedColours(profile, ["white", "cream", "light blue"]),
        suggestedStyleTags: ["summer", "lightweight", "breathable"],
      })
    );
  }
}

function detectColourPaletteGaps(params: {
  items: Partial<ClothingItem>[];
  counts: CategoryCounts;
  profile?: Partial<UserProfilePreferences> | null;
  gaps: Map<string, WardrobeGap>;
}) {
  const { items, counts, profile, gaps } = params;
  const preferred = getProfilePreferredColours(profile);
  const preferredNeutrals = preferredNeutralColours(profile);
  const hasNeutralOuterwear = items.some(
    (item) =>
      getShoppingGapItemCategory(item) === "outerwear" &&
      hasTokenOverlap(getItemColours(item), NEUTRAL_COLOURS)
  );
  if (preferredNeutrals.length > 0 && counts.outerwear > 0 && !hasNeutralOuterwear) {
    addGap(
      gaps,
      makeGap({
        id: "colour-neutral-outerwear",
        type: "colour_palette_gap",
        category: "outerwear",
        priorityScore: 62,
        explanation: "Your preferences lean neutral, but your outerwear does not give outfits a neutral anchor.",
        suggestedCategories: ["outerwear"],
        suggestedColours: suggestedColours(profile, preferredNeutrals.length ? preferredNeutrals : NEUTRAL_COLOURS),
        suggestedStyleTags: ["neutral", "versatile", "layering"],
      })
    );
  }

  if (preferred.includes("black")) {
    const hasBlackFootwear = items.some(
      (item) =>
        getShoppingGapItemCategory(item) === "footwear" &&
        hasTokenOverlap(getItemColours(item), ["black"])
    );
    if (!hasBlackFootwear) {
      addGap(
        gaps,
        makeGap({
          id: "colour-black-footwear",
          type: "colour_palette_gap",
          category: "footwear",
          priorityScore: 66,
          explanation: "Black is a preferred colour, but there is no black footwear anchor in the closet.",
          suggestedCategories: ["footwear"],
          suggestedColours: suggestedColours(profile, ["black"]),
          suggestedStyleTags: ["versatile", "smart casual"],
        })
      );
    }
  }
}

function styleClusterForItem(item: Partial<ClothingItem>) {
  const text = getItemText(item);
  if (hasAnyToken(text, SMART_STYLE_TOKENS)) return "smart";
  if (hasAnyToken(text, OCCASION_RULES.active.tokens)) return "active";
  if (hasAnyToken(text, ["street", "streetwear", "skate", "cargo"])) return "street";
  if (hasAnyToken(text, ["minimal", "basic", "clean", "classic"])) return "minimal";
  if (hasAnyToken(text, ["casual", "everyday", "weekend"])) return "casual";
  return "general";
}

function detectDuplicateHeavyAreas(params: {
  items: Partial<ClothingItem>[];
  counts: CategoryCounts;
  profile?: Partial<UserProfilePreferences> | null;
  gaps: Map<string, WardrobeGap>;
}) {
  const { items, counts, profile, gaps } = params;
  const groups = new Map<string, { category: ShoppingGapCategory; colour: string; style: string; count: number }>();
  items.forEach((item) => {
    const category = getShoppingGapItemCategory(item);
    const colour = getItemColours(item)[0] ?? "unknown";
    const style = styleClusterForItem(item);
    const key = `${category}|${colour}|${style}`;
    const current = groups.get(key) ?? { category, colour, style, count: 0 };
    current.count += 1;
    groups.set(key, current);
  });

  groups.forEach((group) => {
    const categoryCount = counts[group.category];
    const ratio = categoryCount > 0 ? group.count / categoryCount : 0;
    if (group.count < 4 && !(group.count >= 3 && ratio >= 0.6)) return;
    const suggestedCategories = complementaryCategoriesFor(group.category, counts);
    const priority = 42 + group.count * 7 + ratio * 18;
    addGap(
      gaps,
      makeGap({
        id: `duplicate-heavy-${group.category}-${group.colour}-${group.style}`,
        type: "duplicate_heavy_area",
        category: group.category,
        priorityScore: priority,
        explanation: `The closet has several similar ${group.colour} ${group.style} ${group.category}, so the next purchase should add range instead of another near-duplicate.`,
        suggestedCategories: suggestedCategories.length ? suggestedCategories : [group.category],
        suggestedColours: suggestedColours(
          profile,
          NEUTRAL_COLOURS.filter((colour) => colour !== group.colour)
        ),
        suggestedStyleTags: ["versatile", "different texture", "outfit balance"],
      })
    );
  });
}

export function detectShoppingWardrobeGaps(
  input: DetectShoppingWardrobeGapsInput
): WardrobeGap[] {
  const items = Array.isArray(input.wardrobeItems) ? input.wardrobeItems : [];
  const profile = input.profilePreferences;
  const counts = getShoppingWardrobeCategoryCounts(items);
  const signalText = uniqueTokens(
    [
      getProfileText(profile),
      getSignalText(input.recentOutfits),
      getSignalText(input.savedLooks),
    ],
    120
  );
  const smartDemand =
    hasAnyToken(signalText, SMART_STYLE_TOKENS) ||
    items.some((item) => itemIsSmart(item) && getShoppingGapItemCategory(item) !== "footwear");
  const gaps = new Map<string, WardrobeGap>();

  detectCategoryImbalance({ items, counts, profile, smartDemand, gaps });
  detectFootwearAndOccasionGaps({ items, profile, signalText, smartDemand, gaps });
  detectSeasonGaps({ items, counts, profile, signalText, gaps });
  detectColourPaletteGaps({ items, counts, profile, gaps });
  detectDuplicateHeavyAreas({ items, counts, profile, gaps });

  return Array.from(gaps.values())
    .filter((gap) => gap.suggestedCategories.length > 0 && gap.priorityScore > 0)
    .sort(
      (left, right) =>
        right.priorityScore - left.priorityScore ||
        normalizeShoppingGapToken(left.type).localeCompare(normalizeShoppingGapToken(right.type)) ||
        left.id.localeCompare(right.id)
    );
}
