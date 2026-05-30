export const SHOPPING_RECOMMENDATION_PURPOSES = [
  "completes_existing_outfit",
  "fills_detected_gap",
  "replaces_worn_favourite",
  "matches_style_profile",
  "supports_upcoming_event",
  "improves_capsule_balance",
  "style_this_item",
] as const;

export type ShoppingRecommendationPurpose =
  (typeof SHOPPING_RECOMMENDATION_PURPOSES)[number];

export const SHOPPING_RECOMMENDATION_REASONS = [
  "completes_outfit",
  "fills_wardrobe_gap",
  "matches_colour_palette",
  "similar_to_most_worn",
  "within_budget",
  "available_in_size",
  "preferred_brand",
  "preferred_style",
  "seasonally_relevant",
  "avoids_duplicate",
  "matches_occasion",
  "matches_saved_preference",
] as const;

export type ShoppingRecommendationReason =
  (typeof SHOPPING_RECOMMENDATION_REASONS)[number];

export const SHOPPING_RECOMMENDATION_FEEDBACK_ACTIONS = [
  "viewed",
  "clicked",
  "saved",
  "dismissed",
  "purchased",
] as const;

export type ShoppingRecommendationFeedbackAction =
  (typeof SHOPPING_RECOMMENDATION_FEEDBACK_ACTIONS)[number];

export const SHOPPING_RECOMMENDATION_FEEDBACK_REASONS = [
  "too_expensive",
  "not_my_style",
  "wrong_size",
  "already_own_similar",
  "wrong_colour",
  "wrong_brand",
  "not_relevant",
  "other",
] as const;

export type ShoppingRecommendationFeedbackReason =
  (typeof SHOPPING_RECOMMENDATION_FEEDBACK_REASONS)[number];

export const SHOPPING_RECOMMENDATION_SOURCE_SURFACES = [
  "home",
  "insights",
  "aura",
  "outfit",
  "item",
  "profile",
] as const;

export type ShoppingRecommendationSourceSurface =
  (typeof SHOPPING_RECOMMENDATION_SOURCE_SURFACES)[number];

export type ShoppingProduct = {
  id: string;
  providerProductId?: string;
  retailer?: string;
  title: string;
  url: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  brand?: string;
  category: string;
  subcategory?: string;
  colours: string[];
  sizesAvailable: string[];
  material?: string;
  styleTags: string[];
  seasonTags: string[];
  occasionTags: string[];
  inStock?: boolean;
  source?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ShoppingRecommendationContext = {
  sourceSurface: ShoppingRecommendationSourceSurface;
  outfitId?: string;
  itemId?: string;
  occasion?: string;
  season?: string;
  limit?: number;
};

export type ShoppingRecommendationDebugBreakdown = {
  budgetScore?: number;
  sizeScore?: number;
  colourScore?: number;
  styleScore?: number;
  brandScore?: number;
  materialScore?: number;
  wardrobeGapScore?: number;
  duplicatePenalty?: number;
  feedbackScore?: number;
  outfitContextScore?: number;
  finalScore?: number;
};

export type ShoppingRecommendationCandidate = {
  id?: string;
  product: ShoppingProduct;
  score: number;
  normalizedScore?: number;
  purpose: ShoppingRecommendationPurpose;
  reasons: ShoppingRecommendationReason[];
  explanation: string;
  context?: ShoppingRecommendationContext;
  debug?: ShoppingRecommendationDebugBreakdown;
};

export type ShoppingFeedbackRecord = {
  id?: string;
  userId: string;
  productId: string;
  recommendationId?: string;
  action: ShoppingRecommendationFeedbackAction;
  reason?: ShoppingRecommendationFeedbackReason;
  sourceSurface?: ShoppingRecommendationSourceSurface;
  productSnapshot?: Partial<ShoppingProduct>;
  createdAt?: unknown;
};

export type WardrobeGap = {
  id: string;
  type: string;
  category?: string;
  priorityScore: number;
  explanation: string;
  suggestedCategories: string[];
  suggestedColours?: string[];
  suggestedStyleTags?: string[];
  source: string;
};

export function isShoppingRecommendationFeedbackAction(
  value: unknown
): value is ShoppingRecommendationFeedbackAction {
  return (SHOPPING_RECOMMENDATION_FEEDBACK_ACTIONS as readonly unknown[]).includes(
    value
  );
}

export function isShoppingRecommendationFeedbackReason(
  value: unknown
): value is ShoppingRecommendationFeedbackReason {
  return (SHOPPING_RECOMMENDATION_FEEDBACK_REASONS as readonly unknown[]).includes(
    value
  );
}
