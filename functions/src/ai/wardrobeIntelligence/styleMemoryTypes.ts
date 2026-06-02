export type StyleMemoryType =
  | "positive_preference"
  | "negative_preference"
  | "avoidance"
  | "occasion_preference"
  | "color_preference"
  | "fit_preference"
  | "brand_preference"
  | "category_preference"
  | "formality_preference"
  | "item_affinity"
  | "manual_note";

export type StyleMemoryPolarity = "positive" | "negative" | "neutral";

export type StyleMemorySource =
  | "outfit_feedback"
  | "item_feedback"
  | "saved_outfit"
  | "worn_outfit"
  | "manual"
  | "debug";

export type FeedbackType =
  | "like"
  | "dislike"
  | "save"
  | "wear"
  | "not_my_vibe"
  | "more_like_this"
  | "less_like_this"
  | "too_formal"
  | "too_casual"
  | "more_formal"
  | "more_casual"
  | "more_streetwear"
  | "less_streetwear"
  | "more_color"
  | "less_color"
  | "prefer_item"
  | "avoid_item"
  | "manual_note";

export type StyleMemoryEntities = {
  itemIds: string[];
  itemNames?: string[];
  outfitId?: string;
  outfitFingerprint?: string;
  query?: string;
  occasion?: string;
  formality?: string;
  colors: string[];
  categories: string[];
  styleTags: string[];
  fits: string[];
  brands: string[];
  materials: string[];
  subcategories: string[];
};

export type StyleMemoryDraft = {
  type: StyleMemoryType;
  polarity: StyleMemoryPolarity;
  source: StyleMemorySource;
  text: string;
  normalizedText: string;
  strength: number;
  confidence: number;
  entities: StyleMemoryEntities;
};

export type StyleMemory = StyleMemoryDraft & {
  id: string;
  userId: string;
  fingerprint: string;
  reinforcementCount: number;
  embeddingText: string;
  embeddingHash: string;
  embeddingVector?: unknown;
  embeddingModel: string;
  embeddingDimensions: number;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastReinforcedAt?: unknown;
  deletedAt?: unknown;
};

export type WeightedStyleSignal = {
  value: string;
  weight: number;
  occasion?: string;
};

export type OccasionStyleProfile = {
  preferredColors: WeightedStyleSignal[];
  avoidedColors: WeightedStyleSignal[];
  preferredStyleTags: WeightedStyleSignal[];
  avoidedStyleTags: WeightedStyleSignal[];
  preferredCategories: WeightedStyleSignal[];
  avoidedCategories: WeightedStyleSignal[];
  avoidedItemIds: WeightedStyleSignal[];
  avoidedOutfitFingerprints: WeightedStyleSignal[];
  formalityAdjustment?: number;
  memoryCount: number;
};

export type StyleProfile = {
  userId: string;
  summary: string;
  preferredColors: WeightedStyleSignal[];
  avoidedColors: WeightedStyleSignal[];
  preferredStyleTags: WeightedStyleSignal[];
  avoidedStyleTags: WeightedStyleSignal[];
  preferredFits: WeightedStyleSignal[];
  avoidedFits: WeightedStyleSignal[];
  preferredBrands: WeightedStyleSignal[];
  avoidedBrands: WeightedStyleSignal[];
  preferredCategories: WeightedStyleSignal[];
  avoidedCategories: WeightedStyleSignal[];
  preferredMaterials: WeightedStyleSignal[];
  avoidedMaterials: WeightedStyleSignal[];
  itemAffinities: WeightedStyleSignal[];
  avoidedItemIds: WeightedStyleSignal[];
  avoidedOutfitFingerprints: WeightedStyleSignal[];
  occasionProfiles: Record<string, OccasionStyleProfile>;
  formalityBiasByOccasion: Record<string, number>;
  memoryCount: number;
  positiveMemoryCount: number;
  negativeMemoryCount: number;
  profileVersion: number;
  updatedAt?: unknown;
};

export type StyleMemoryClient = Omit<StyleMemory, "embeddingVector"> & {
  styleMemoryDistance?: number | null;
  semanticScore?: number;
  occasionCompatibility?: number;
  finalMemoryScore?: number;
};

export type StyleMemoryFeedbackItem = {
  itemId: string;
  feedbackType: FeedbackType;
  note?: string;
};

export type StyleMemoryFeedbackInput = {
  query?: string;
  occasion?: string;
  formality?: string;
  outfit?: Record<string, unknown>;
  outfitId?: string;
  feedbackType: FeedbackType;
  selectedItemIds?: string[];
  itemFeedback?: StyleMemoryFeedbackItem[];
  note?: string;
  polarity?: StyleMemoryPolarity;
};

export type StyleMemoryContextResponse = {
  query: string;
  memoryQueryText: string;
  positiveMemories: StyleMemoryClient[];
  negativeMemories: StyleMemoryClient[];
  profileSummary: string;
  profileSignals: StyleProfile;
  diagnostics?: Record<string, unknown>;
};
