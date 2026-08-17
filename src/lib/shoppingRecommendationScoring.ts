import type { ClothingItem } from "../types/ClothingItem";
import type {
  BudgetPreference,
  UserProfilePreferences,
} from "../types/UserProfilePreferences";
import type {
  ShoppingFeedbackRecord,
  ShoppingProduct,
  ShoppingRecommendationCandidate,
  ShoppingRecommendationContext,
  ShoppingRecommendationDebugBreakdown,
  ShoppingRecommendationPurpose,
  ShoppingRecommendationReason,
  WardrobeGap,
} from "../types/shoppingRecommendations";

export type GenerateShoppingRecommendationsInput = {
  wardrobeItems?: Partial<ClothingItem>[] | null;
  profilePreferences?: Partial<UserProfilePreferences> | null;
  shoppingProducts?: ShoppingProduct[] | null;
  feedback?: ShoppingFeedbackRecord[] | null;
  context?: ShoppingRecommendationContext | null;
  wardrobeGaps?: WardrobeGap[] | null;
  includeDebug?: boolean;
};

export type ShoppingScoreDetail = {
  score: number;
  reasons: ShoppingRecommendationReason[];
};

export type PreferenceScoreDetail = ShoppingScoreDetail & {
  brandScore: number;
  materialScore: number;
  styleScore: number;
};

export type FeedbackScoreDetail = ShoppingScoreDetail & {
  exclude: boolean;
};

const BASE_SCORE = 50;
const BUDGET_TIER_ORDER: BudgetPreference[] = ["budget", "mid", "premium"];
const BUDGET_PRICE_CEILINGS: Record<BudgetPreference, number> = {
  budget: 75,
  mid: 200,
  premium: Number.POSITIVE_INFINITY,
};
const NEUTRAL_COLOURS = [
  "black",
  "white",
  "grey",
  "gray",
  "navy",
  "cream",
  "beige",
  "tan",
  "brown",
  "olive",
  "charcoal",
  "denim",
];

export function normalizeTextToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[_/-]+/g, " ")
    .replace(/[^a-z0-9\s.]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTokenList(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,|]/)
      : [];
  const seen = new Set<string>();
  const tokens: string[] = [];

  rawValues.forEach((entry) => {
    const token = normalizeTextToken(entry);
    if (!token || token === "unknown" || token === "other" || seen.has(token)) {
      return;
    }
    seen.add(token);
    tokens.push(token);
  });

  return tokens;
}

export function hasTokenOverlap(left: unknown, right: unknown) {
  const leftTokens = normalizeTokenList(left);
  const rightTokens = normalizeTokenList(right);
  return leftTokens.some((leftToken) =>
    rightTokens.some(
      (rightToken) =>
        leftToken === rightToken ||
        (leftToken.length > 2 && rightToken.includes(leftToken)) ||
        (rightToken.length > 2 && leftToken.includes(rightToken))
    )
  );
}

function uniqueTokens(values: unknown[], max = 24) {
  return normalizeTokenList(values.flatMap((value) => (Array.isArray(value) ? value : [value]))).slice(
    0,
    max
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readStringList(record: Record<string, unknown>, key: string) {
  return normalizeTokenList(record[key]);
}

function normalizeCategory(value: unknown) {
  const token = normalizeTextToken(value);
  if (/\b(top|tops|shirt|tee|t shirt|sweater|hoodie|blouse|polo)\b/.test(token)) {
    return "tops";
  }
  if (/\b(bottom|bottoms|pant|pants|trouser|jean|short|skirt)\b/.test(token)) {
    return "bottoms";
  }
  if (/\b(shoe|shoes|footwear|sneaker|boot|loafer|sandal|heel)\b/.test(token)) {
    return "footwear";
  }
  if (/\b(outerwear|jacket|coat|blazer|overshirt|cardigan|layer)\b/.test(token)) {
    return "outerwear";
  }
  if (/\b(accessory|accessories|belt|bag|watch|hat|cap|scarf|jewelry|jewellery)\b/.test(token)) {
    return "accessories";
  }
  if (/\b(dress|jumpsuit|romper|one piece)\b/.test(token)) {
    return "one_piece";
  }
  return token;
}

function getProductCategory(product: Partial<ShoppingProduct>) {
  return normalizeCategory([product.category, product.subcategory, product.title].filter(Boolean).join(" "));
}

function getItemCategory(item: Partial<ClothingItem>) {
  return normalizeCategory([item.category, item.subCategory, item.type, item.name].filter(Boolean).join(" "));
}

function getProductStyleTokens(product: Partial<ShoppingProduct>) {
  return uniqueTokens([
    product.category,
    product.subcategory,
    product.styleTags,
    product.occasionTags,
    product.seasonTags,
  ]);
}

function getItemStyleTokens(item: Partial<ClothingItem>) {
  return uniqueTokens([
    item.style,
    item.fit,
    item.pattern,
    item.formality,
    item.subCategory,
    item.type,
    item.aestheticTags,
    item.detailTags,
    item.occasionTags,
    item.seasonTags,
  ]);
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

export function getProductColours(product: Partial<ShoppingProduct>) {
  const explicitColours = normalizeTokenList(product.colours);
  const title = normalizeTextToken(product.title);
  const inferredColours = NEUTRAL_COLOURS.filter((colour) =>
    new RegExp(`\\b${colour}\\b`).test(title)
  );
  return uniqueTokens([explicitColours, inferredColours]);
}

export function getWardrobeCommonColours(
  wardrobeItems?: Partial<ClothingItem>[] | null,
  maxColours = 6
) {
  const counts = new Map<string, number>();
  (wardrobeItems ?? []).forEach((item) => {
    getItemColours(item).forEach((colour) => {
      counts.set(colour, (counts.get(colour) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([colour]) => colour)
    .slice(0, maxColours);
}

function getBudgetPreference(
  profilePreferences?: Partial<UserProfilePreferences> | null
): BudgetPreference | null {
  const value = profilePreferences?.budgetPreference;
  return value === "budget" || value === "mid" || value === "premium" ? value : null;
}

function inferPriceTier(price: unknown): BudgetPreference | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price < 0) return null;
  if (price <= BUDGET_PRICE_CEILINGS.budget) return "budget";
  if (price <= BUDGET_PRICE_CEILINGS.mid) return "mid";
  return "premium";
}

export function scoreBudgetFit(
  product: Partial<ShoppingProduct>,
  profilePreferences?: Partial<UserProfilePreferences> | null
): ShoppingScoreDetail {
  const preferredTier = getBudgetPreference(profilePreferences);
  const productTier = inferPriceTier(product.price);
  if (!preferredTier || !productTier) return { score: 0, reasons: [] };

  const preferredIndex = BUDGET_TIER_ORDER.indexOf(preferredTier);
  const productIndex = BUDGET_TIER_ORDER.indexOf(productTier);
  const tierDelta = productIndex - preferredIndex;
  if (tierDelta <= 0) {
    return { score: 10, reasons: ["within_budget"] };
  }
  if (tierDelta === 1) return { score: -8, reasons: [] };
  return { score: -16, reasons: [] };
}

function normalizeSizeToken(value: unknown) {
  const token = normalizeTextToken(value)
    .replace(/\bextra small\b/g, "xs")
    .replace(/\bsmall\b/g, "s")
    .replace(/\bmedium\b/g, "m")
    .replace(/\blarge\b/g, "l")
    .replace(/\bextra large\b/g, "xl")
    .replace(/\s+/g, "");
  return token;
}

function getProfileSizesForCategory(
  profilePreferences: Partial<UserProfilePreferences> | null | undefined,
  category: string
) {
  const defaultSizes = profilePreferences?.defaultSizes ?? {};
  if (category === "tops") {
    return uniqueTokens([
      defaultSizes.tops,
      defaultSizes.top,
      defaultSizes.formalShirt,
      defaultSizes.hoodie,
    ]).map(normalizeSizeToken);
  }
  if (category === "outerwear") {
    return uniqueTokens([defaultSizes.outerwear, defaultSizes.hoodie, defaultSizes.tops]).map(
      normalizeSizeToken
    );
  }
  if (category === "bottoms") {
    return uniqueTokens([
      defaultSizes.bottoms,
      defaultSizes.bottomWaist,
      defaultSizes.bottomsWaist,
      defaultSizes.jeans,
    ]).map(normalizeSizeToken);
  }
  if (category === "footwear") {
    return uniqueTokens([defaultSizes.shoes]).map(normalizeSizeToken);
  }
  if (category === "one_piece") {
    return uniqueTokens([defaultSizes.dresses, defaultSizes.skirts, defaultSizes.tops]).map(
      normalizeSizeToken
    );
  }
  return [];
}

export function scoreSizeFit(
  product: Partial<ShoppingProduct>,
  profilePreferences?: Partial<UserProfilePreferences> | null
): ShoppingScoreDetail {
  const category = getProductCategory(product);
  const preferredSizes = getProfileSizesForCategory(profilePreferences, category).filter(Boolean);
  const availableSizes = normalizeTokenList(product.sizesAvailable).map(normalizeSizeToken);
  if (!preferredSizes.length || !availableSizes.length) return { score: 0, reasons: [] };

  const matches = preferredSizes.some((preferredSize) =>
    availableSizes.some(
      (availableSize) =>
        preferredSize === availableSize ||
        availableSize.includes(preferredSize) ||
        preferredSize.includes(availableSize)
    )
  );
  return matches
    ? { score: 8, reasons: ["available_in_size"] }
    : { score: -5, reasons: [] };
}

export function scoreColourFit(
  product: Partial<ShoppingProduct>,
  profilePreferences?: Partial<UserProfilePreferences> | null,
  wardrobeItems?: Partial<ClothingItem>[] | null
): ShoppingScoreDetail {
  const productColours = getProductColours(product);
  if (!productColours.length) return { score: 0, reasons: [] };

  const profileStylePreferences = profilePreferences?.stylePreferences ?? {};
  const preferredColours = uniqueTokens([
    profilePreferences?.favoriteColors,
    profileStylePreferences.favoriteColors,
  ]);
  const avoidedColours = uniqueTokens([
    profilePreferences?.avoidedColors,
    profileStylePreferences.avoidedColors,
  ]);
  const commonWardrobeColours = getWardrobeCommonColours(wardrobeItems);

  let score = 0;
  const reasons = new Set<ShoppingRecommendationReason>();
  if (hasTokenOverlap(productColours, preferredColours)) {
    score += 8;
    reasons.add("matches_colour_palette");
  }
  if (hasTokenOverlap(productColours, commonWardrobeColours)) {
    score += 4;
    reasons.add("matches_colour_palette");
  }
  if (hasTokenOverlap(productColours, avoidedColours)) {
    score -= 16;
  }

  return { score, reasons: Array.from(reasons) };
}

function getExtendedPreferenceLists(profilePreferences?: Partial<UserProfilePreferences> | null) {
  const root = readRecord(profilePreferences);
  const stylePreferences = readRecord(profilePreferences?.stylePreferences);
  const materialPreferences = readRecord(root.materialPreferences);

  return {
    preferredBrands: uniqueTokens([
      profilePreferences?.stylePreferences?.preferredBrands,
      readStringList(root, "preferredBrands"),
    ]),
    avoidedBrands: uniqueTokens([
      readStringList(root, "avoidedBrands"),
      readStringList(stylePreferences, "avoidedBrands"),
    ]),
    preferredStyles: uniqueTokens([
      profilePreferences?.styleAesthetics,
      profilePreferences?.stylePreferences?.preferredStyles,
      profilePreferences?.accessoryPreferences,
      readStringList(root, "preferredStyles"),
      readStringList(root, "shoppingGoals"),
      readStringList(root, "goals"),
    ]),
    avoidedStyles: uniqueTokens([
      readStringList(root, "avoidedStyles"),
      readStringList(stylePreferences, "avoidedStyles"),
    ]),
    preferredMaterials: uniqueTokens([
      readStringList(root, "preferredMaterials"),
      readStringList(materialPreferences, "preferred"),
    ]),
    avoidedMaterials: uniqueTokens([
      readStringList(root, "avoidedMaterials"),
      readStringList(materialPreferences, "avoided"),
    ]),
    sustainabilityPreference:
      root.sustainabilityPreference === "new" ||
      root.sustainabilityPreference === "secondhand" ||
      root.sustainabilityPreference === "either"
        ? root.sustainabilityPreference
        : null,
  };
}

function productLooksSecondhand(product: Partial<ShoppingProduct>) {
  const text = normalizeTextToken([
    product.title,
    product.source,
    product.styleTags,
    product.occasionTags,
    product.seasonTags,
  ].flat().filter(Boolean).join(" "));
  return /\b(secondhand|second hand|preowned|pre owned|resale|vintage|thrift|used)\b/.test(text);
}

export function scorePreferenceFit(
  product: Partial<ShoppingProduct>,
  profilePreferences?: Partial<UserProfilePreferences> | null
): PreferenceScoreDetail {
  const preferences = getExtendedPreferenceLists(profilePreferences);
  const productBrand = normalizeTextToken(product.brand);
  const productMaterial = normalizeTextToken(product.material);
  const productStyleTokens = getProductStyleTokens(product);
  const isSecondhand = productLooksSecondhand(product);

  let brandScore = 0;
  let materialScore = 0;
  let styleScore = 0;
  const reasons = new Set<ShoppingRecommendationReason>();

  if (productBrand && preferences.preferredBrands.includes(productBrand)) {
    brandScore += 7;
    reasons.add("preferred_brand");
  }
  if (productBrand && preferences.avoidedBrands.includes(productBrand)) {
    brandScore -= 12;
  }
  if (productMaterial && hasTokenOverlap([productMaterial], preferences.preferredMaterials)) {
    materialScore += 4;
  }
  if (productMaterial && hasTokenOverlap([productMaterial], preferences.avoidedMaterials)) {
    materialScore -= 8;
  }
  if (hasTokenOverlap(productStyleTokens, preferences.preferredStyles)) {
    styleScore += 8;
    reasons.add("preferred_style");
  }
  if (hasTokenOverlap(productStyleTokens, preferences.avoidedStyles)) {
    styleScore -= 12;
  }
  if (preferences.sustainabilityPreference === "secondhand" && isSecondhand) {
    styleScore += 4;
  }
  if (preferences.sustainabilityPreference === "new" && isSecondhand) {
    styleScore -= 4;
  }

  return {
    score: brandScore + materialScore + styleScore,
    brandScore,
    materialScore,
    styleScore,
    reasons: Array.from(reasons),
  };
}

export function scoreWardrobeGapFit(
  product: Partial<ShoppingProduct>,
  wardrobeGaps?: WardrobeGap[] | null
): ShoppingScoreDetail {
  const productCategory = getProductCategory(product);
  const productColours = getProductColours(product);
  const productStyleTokens = getProductStyleTokens(product);
  let bestScore = 0;

  (wardrobeGaps ?? []).forEach((gap) => {
    const gapCategories = uniqueTokens([gap.category, gap.suggestedCategories]).map(normalizeCategory);
    const categoryMatch = gapCategories.includes(productCategory);
    const colourMatch = hasTokenOverlap(productColours, gap.suggestedColours ?? []);
    const styleMatch = hasTokenOverlap(productStyleTokens, gap.suggestedStyleTags ?? []);
    if (!categoryMatch && !colourMatch && !styleMatch) return;

    const priority = Number.isFinite(gap.priorityScore) ? gap.priorityScore : 0;
    const score =
      (categoryMatch ? Math.min(18, 6 + priority * 0.15) : 0) +
      (colourMatch ? 3 : 0) +
      (styleMatch ? 4 : 0);
    bestScore = Math.max(bestScore, score);
  });

  return {
    score: bestScore,
    reasons: bestScore > 0 ? ["fills_wardrobe_gap"] : [],
  };
}

export function scoreDuplicatePenalty(
  product: Partial<ShoppingProduct>,
  wardrobeItems?: Partial<ClothingItem>[] | null
): ShoppingScoreDetail {
  const productCategory = getProductCategory(product);
  const productColours = getProductColours(product);
  const productStyles = getProductStyleTokens(product);
  let strongestPenalty = 0;

  (wardrobeItems ?? []).forEach((item) => {
    const sameCategory = productCategory && productCategory === getItemCategory(item);
    if (!sameCategory) return;

    const colourMatch = hasTokenOverlap(productColours, getItemColours(item));
    const styleMatch = hasTokenOverlap(productStyles, getItemStyleTokens(item));
    let penalty = -3;
    if (colourMatch && styleMatch) penalty = -14;
    else if (colourMatch) penalty = -10;
    else if (styleMatch) penalty = -8;
    strongestPenalty = Math.min(strongestPenalty, penalty);
  });

  return { score: strongestPenalty, reasons: [] };
}

function timestampValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const timestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
    if (typeof timestamp.seconds === "number") {
      return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds ?? 0) / 1000000);
    }
  }
  return 0;
}

function productSimilarityScore(
  product: Partial<ShoppingProduct>,
  snapshot?: Partial<ShoppingProduct> | null
) {
  if (!snapshot) return 0;
  let score = 0;
  if (getProductCategory(product) && getProductCategory(product) === getProductCategory(snapshot)) {
    score += 0.35;
  }
  if (hasTokenOverlap(getProductColours(product), getProductColours(snapshot))) score += 0.25;
  if (hasTokenOverlap(getProductStyleTokens(product), getProductStyleTokens(snapshot))) score += 0.25;
  const productBrand = normalizeTextToken(product.brand);
  const snapshotBrand = normalizeTextToken(snapshot.brand);
  if (productBrand && productBrand === snapshotBrand) score += 0.15;
  return Math.min(1, score);
}

function latestFeedbackByProduct(feedback: ShoppingFeedbackRecord[]) {
  const sorted = feedback
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const timeDelta =
        timestampValue(right.record.createdAt) - timestampValue(left.record.createdAt);
      return timeDelta || left.index - right.index;
    });
  const latest = new Map<string, ShoppingFeedbackRecord>();
  sorted.forEach(({ record }) => {
    const productId = normalizeTextToken(record.productId);
    if (productId && !latest.has(productId)) latest.set(productId, record);
  });
  return latest;
}

export function scoreFeedbackFit(
  product: Partial<ShoppingProduct>,
  feedback?: ShoppingFeedbackRecord[] | null,
  profilePreferences?: Partial<UserProfilePreferences> | null
): FeedbackScoreDetail {
  const productId = normalizeTextToken(product.id);
  const safeFeedback = feedback ?? [];
  if (
    productId &&
    safeFeedback.some(
      (record) =>
        record.action === "purchased" && normalizeTextToken(record.productId) === productId
    )
  ) {
    return { score: 0, reasons: [], exclude: true };
  }

  const latest = productId ? latestFeedbackByProduct(safeFeedback).get(productId) : null;
  let score = 0;
  const reasons = new Set<ShoppingRecommendationReason>();

  if (latest?.action === "dismissed") score -= 45;
  if (latest?.action === "saved") {
    score += 12;
    reasons.add("matches_saved_preference");
  }
  if (latest?.action === "clicked") score += 3;

  const sizeFit = scoreSizeFit(product, profilePreferences);
  safeFeedback.forEach((record) => {
    const similarity = productSimilarityScore(product, record.productSnapshot);
    if (record.action === "dismissed" && similarity > 0.5) {
      score -= similarity * 14;
      if (record.reason === "too_expensive" && typeof product.price === "number") {
        const dismissedPrice = record.productSnapshot?.price;
        if (typeof dismissedPrice === "number" && product.price >= dismissedPrice * 0.9) {
          score -= 8;
        } else if (!dismissedPrice && inferPriceTier(product.price) === "premium") {
          score -= 5;
        }
      }
      if (record.reason === "wrong_size" && sizeFit.score <= 0) score -= 6;
      if (record.reason === "already_own_similar") score -= 4;
      if (record.reason === "not_my_style") score -= 4;
    }
    if ((record.action === "saved" || record.action === "clicked") && similarity > 0.5) {
      score += similarity * (record.action === "saved" ? 8 : 3);
      reasons.add("matches_saved_preference");
    }
  });

  return {
    score: Math.max(-60, Math.min(20, score)),
    reasons: Array.from(reasons),
    exclude: false,
  };
}

function scoreOutfitContextFit(
  product: Partial<ShoppingProduct>,
  wardrobeItems: Partial<ClothingItem>[],
  context?: ShoppingRecommendationContext | null
): ShoppingScoreDetail {
  if (!context) return { score: 0, reasons: [] };
  const reasons = new Set<ShoppingRecommendationReason>();
  let score = 0;
  const productCategory = getProductCategory(product);
  const productStyles = getProductStyleTokens(product);
  const productColours = getProductColours(product);
  const productOccasions = normalizeTokenList(product.occasionTags);
  const productSeasons = normalizeTokenList(product.seasonTags);
  const targetItem = context.itemId
    ? wardrobeItems.find((item) => normalizeTextToken(item.id) === normalizeTextToken(context.itemId))
    : null;

  if (targetItem) {
    const itemCategory = getItemCategory(targetItem);
    const complementaryCategories: Record<string, string[]> = {
      tops: ["bottoms", "footwear", "outerwear", "accessories"],
      bottoms: ["tops", "footwear", "outerwear", "accessories"],
      footwear: ["tops", "bottoms", "outerwear", "accessories"],
      outerwear: ["tops", "bottoms", "footwear"],
      accessories: ["tops", "bottoms", "footwear", "outerwear"],
      one_piece: ["footwear", "outerwear", "accessories"],
    };
    if (complementaryCategories[itemCategory]?.includes(productCategory)) {
      score += 7;
      reasons.add("completes_outfit");
    }
    if (hasTokenOverlap(productStyles, getItemStyleTokens(targetItem))) {
      score += 3;
      reasons.add("completes_outfit");
    }
    if (hasTokenOverlap(productColours, NEUTRAL_COLOURS)) {
      score += 2;
    }
  } else if (context.outfitId) {
    score += 3;
    reasons.add("completes_outfit");
  }

  if (context.occasion && hasTokenOverlap(productOccasions.concat(productStyles), [context.occasion])) {
    score += 7;
    reasons.add("matches_occasion");
  }
  if (context.season && hasTokenOverlap(productSeasons, [context.season])) {
    score += 4;
    reasons.add("seasonally_relevant");
  }

  return { score, reasons: Array.from(reasons) };
}

function scoreSimilarToWornFavourite(
  product: Partial<ShoppingProduct>,
  wardrobeItems: Partial<ClothingItem>[]
) {
  const productCategory = getProductCategory(product);
  const productStyles = getProductStyleTokens(product);
  const productColours = getProductColours(product);
  const match = wardrobeItems.some((item) => {
    const isFavouriteOrWorn = item.isFavorite || Number(item.wearCountSinceWash ?? 0) >= 2;
    return (
      isFavouriteOrWorn &&
      productCategory === getItemCategory(item) &&
      (hasTokenOverlap(productStyles, getItemStyleTokens(item)) ||
        hasTokenOverlap(productColours, getItemColours(item)))
    );
  });
  return match ? 4 : 0;
}

function determinePurpose(params: {
  context?: ShoppingRecommendationContext | null;
  gapScore: number;
  preferenceScore: number;
  similarToWornFavouriteScore: number;
}): ShoppingRecommendationPurpose {
  if (params.context?.itemId) return "style_this_item";
  if (params.context?.outfitId) return "completes_existing_outfit";
  if (params.gapScore > 0) return "fills_detected_gap";
  if (params.similarToWornFavouriteScore > 0) return "replaces_worn_favourite";
  if (params.context?.occasion) return "supports_upcoming_event";
  if (params.preferenceScore > 0) return "matches_style_profile";
  return "improves_capsule_balance";
}

function uniqueReasons(reasons: ShoppingRecommendationReason[]) {
  const seen = new Set<ShoppingRecommendationReason>();
  return reasons.filter((reason) => {
    if (seen.has(reason)) return false;
    seen.add(reason);
    return true;
  });
}

export function buildRecommendationExplanation(params: {
  product: Partial<ShoppingProduct>;
  reasons: ShoppingRecommendationReason[];
}) {
  const labelByReason: Record<ShoppingRecommendationReason, string> = {
    completes_outfit: "helps complete an outfit",
    fills_wardrobe_gap: "fills a wardrobe gap",
    matches_colour_palette: "matches your colour palette",
    similar_to_most_worn: "is close to pieces you wear often",
    within_budget: "fits your budget preference",
    available_in_size: "is available in your saved size",
    preferred_brand: "comes from a preferred brand",
    preferred_style: "matches your style preferences",
    seasonally_relevant: "fits the season",
    avoids_duplicate: "adds variety without duplicating your closet",
    matches_occasion: "fits the occasion",
    matches_saved_preference: "matches saved shopping signals",
  };
  const labels = params.reasons.slice(0, 3).map((reason) => labelByReason[reason]);
  if (!labels.length) {
    return `${params.product.title ?? "This product"} is ranked from your wardrobe and preference signals.`;
  }
  const finalLabel =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `Recommended because it ${finalLabel}.`;
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function generateShoppingRecommendations(
  input: GenerateShoppingRecommendationsInput
): ShoppingRecommendationCandidate[] {
  const wardrobeItems = input.wardrobeItems ?? [];
  const feedback = input.feedback ?? [];
  const products = input.shoppingProducts ?? [];
  const limit = input.context?.limit;

  const candidates = products.flatMap((product) => {
    if (product.inStock === false) return [];

    const budget = scoreBudgetFit(product, input.profilePreferences);
    const size = scoreSizeFit(product, input.profilePreferences);
    const colour = scoreColourFit(product, input.profilePreferences, wardrobeItems);
    const preference = scorePreferenceFit(product, input.profilePreferences);
    const gap = scoreWardrobeGapFit(product, input.wardrobeGaps);
    const duplicate = scoreDuplicatePenalty(product, wardrobeItems);
    const context = scoreOutfitContextFit(product, wardrobeItems, input.context);
    const feedbackFit = scoreFeedbackFit(product, feedback, input.profilePreferences);
    const similarToWornFavouriteScore = scoreSimilarToWornFavourite(product, wardrobeItems);

    if (feedbackFit.exclude) return [];

    const rawScore =
      BASE_SCORE +
      budget.score +
      size.score +
      colour.score +
      preference.score +
      gap.score +
      duplicate.score +
      context.score +
      feedbackFit.score +
      similarToWornFavouriteScore;
    const finalScore = roundScore(clampScore(rawScore));
    const reasons = uniqueReasons([
      ...gap.reasons,
      ...context.reasons,
      ...budget.reasons,
      ...size.reasons,
      ...colour.reasons,
      ...preference.reasons,
      ...feedbackFit.reasons,
      ...(similarToWornFavouriteScore > 0 ? ["similar_to_most_worn" as const] : []),
      ...(duplicate.score >= -4 && (gap.score > 0 || context.score > 0 || preference.score > 0)
        ? ["avoids_duplicate" as const]
        : []),
    ]);
    const debug: ShoppingRecommendationDebugBreakdown = {
      budgetScore: roundScore(budget.score),
      sizeScore: roundScore(size.score),
      colourScore: roundScore(colour.score),
      styleScore: roundScore(preference.styleScore),
      brandScore: roundScore(preference.brandScore),
      materialScore: roundScore(preference.materialScore),
      wardrobeGapScore: roundScore(gap.score),
      duplicatePenalty: roundScore(duplicate.score),
      feedbackScore: roundScore(feedbackFit.score),
      outfitContextScore: roundScore(context.score),
      finalScore,
    };
    const purpose = determinePurpose({
      context: input.context,
      gapScore: gap.score,
      preferenceScore: preference.score,
      similarToWornFavouriteScore,
    });

    return [
      {
        id: `${purpose}:${product.id}`,
        product,
        score: finalScore,
        normalizedScore: roundScore(finalScore / 100),
        purpose,
        reasons,
        explanation: buildRecommendationExplanation({ product, reasons }),
        context: input.context ?? undefined,
        ...(input.includeDebug ? { debug } : {}),
      } satisfies ShoppingRecommendationCandidate,
    ];
  });

  const sorted = candidates.sort(
    (left, right) =>
      right.score - left.score ||
      normalizeTextToken(left.product.title).localeCompare(normalizeTextToken(right.product.title)) ||
      normalizeTextToken(left.product.id).localeCompare(normalizeTextToken(right.product.id))
  );

  return typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? sorted.slice(0, Math.floor(limit))
    : sorted;
}
