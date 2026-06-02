export type AuraAgentMode =
  | "generate_outfit"
  | "refine_outfit"
  | "explain_outfit"
  | "feedback"
  | "unknown";

export type AuraAgentRequestMode = AuraAgentMode | "auto";

export type AuraAgentFeedbackType =
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

export type AuraAgentOutfitRole =
  | "top"
  | "bottom"
  | "footwear"
  | "outerwear"
  | "accessory"
  | "one_piece";

export type AuraAgentFormality =
  | "any"
  | "athletic"
  | "lounge"
  | "casual"
  | "smart_casual"
  | "business_casual"
  | "formal";

export type AuraAgentRequest = {
  query?: string;
  mode?: AuraAgentRequestMode;
  count?: number;
  occasion?: string;
  weather?: string;
  formality?: AuraAgentFormality;
  preferredColors?: string[];
  requiredColors?: string[];
  requiredCategories?: string[];
  useStyleMemory?: boolean;
  includeDiagnostics?: boolean;
  previousOutfit?: Record<string, unknown>;
  outfitId?: string;
  feedbackType?: AuraAgentFeedbackType;
  selectedItemIds?: string[];
  note?: string;
};

export type AuraAgentIntent = {
  mode: AuraAgentMode;
  query: string;
  normalizedQuery: string;
  confidence: number;
  reason: string;
  constraints: {
    occasion?: string;
    weather?: string;
    formality: AuraAgentFormality;
    preferredColors: string[];
    requiredColors: string[];
    requiredCategories: AuraAgentOutfitRole[];
    styleHints: string[];
    avoidItemIds: string[];
    avoidCategories: AuraAgentOutfitRole[];
    refinementInstruction?: string;
    feedbackType?: AuraAgentFeedbackType;
    selectedItemIds: string[];
  };
};

export type AuraAgentSuggestedAction = {
  id: string;
  label: string;
  type: "generate" | "refine" | "explain" | "feedback" | "debug";
  payload?: Record<string, unknown>;
  disabled?: boolean;
};

export type AuraAgentOutfitItem = {
  itemId: string;
  role: AuraAgentOutfitRole;
  reason: string;
  name: string;
  category: string;
  canonicalRole?: AuraAgentOutfitRole;
  allowedRole?: AuraAgentOutfitRole;
  sourceRole?: AuraAgentOutfitRole;
  sourceCategory?: string | null;
  sourceAiMetadataCategory?: string | null;
  subcategory?: string;
  brand?: string;
  colors: string[];
  imageUrl: string | null;
  aiMetadata?: Record<string, unknown>;
  effectiveFormality?: number;
};

export type AuraAgentOutfit = {
  outfitId: string;
  title: string;
  vibe: string;
  occasion: string;
  formality: Exclude<AuraAgentFormality, "any">;
  items: AuraAgentOutfitItem[];
  explanation: string;
  stylingTips: string[];
  missingItems: string[];
  confidence: number;
  scoreBreakdown?: Record<string, unknown>;
};

export type AuraAgentOutfitActionState = {
  saved?: boolean;
  worn?: boolean;
  planned?: boolean;
  moreLikeThis?: boolean;
  notMyVibe?: boolean;
  savedOutfitId?: string;
  wearEventId?: string;
  plannedEventId?: string;
  plannedDateKey?: string;
  updatedAt?: number;
};

export type AuraAgentStyleMemorySummary = {
  profileSummary: string;
  positiveMemoryCount: number;
  negativeMemoryCount: number;
  warnings: string[];
};

export type AuraAgentExplanation = {
  outfitId?: string;
  title?: string;
  itemRationales: {
    itemId: string;
    name: string;
    role: string;
    reason: string;
  }[];
  scoreBreakdown?: Record<string, unknown>;
};

export type AuraAgentFeedbackResult = {
  feedbackType?: AuraAgentFeedbackType;
  recorded: boolean;
  message: string;
};

export type AuraAgentResponse = {
  mode: AuraAgentMode;
  intent: AuraAgentIntent;
  message: string;
  suggestedActions: AuraAgentSuggestedAction[];
  requestedCount?: number;
  outfits?: AuraAgentOutfit[];
  styleMemorySummary?: AuraAgentStyleMemorySummary;
  explanation?: AuraAgentExplanation;
  feedback?: AuraAgentFeedbackResult;
  diagnostics?: Record<string, unknown>;
};
