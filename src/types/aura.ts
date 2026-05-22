import type { WardrobeSuggestion } from "@/src/lib/wardrobeSuggestions";
import type { StylingIntelligenceSummary } from "@/src/types/StylingIntelligence";

export type AuraLookPiece = {
  role: "top" | "bottom" | "shoes" | "outerwear" | "accessory";
  itemName: string;
  source: "closet" | "suggested";
  itemId?: string | null;
  imageUrl?: string | null;
};

export type AuraDetectedOutfitPiece = {
  role: "top" | "bottom" | "footwear" | "outerwear" | "accessory";
  label: string;
  color?: string | null;
  confidence?: number | null;
  notes?: string | null;
  visible?: boolean | null;
};

export type AuraOutfitPhotoAnalysis = {
  detectedPieces: AuraDetectedOutfitPiece[];
  outfitVibe?: string | null;
  stylingNotes?: string[];
  missingToComplete?: string[];
  sourceImageUrl?: string | null;
};

export type AuraOutfitPhotoAction =
  | { type: "save_worn_outfit" }
  | { type: "add_pieces_to_closet" }
  | { type: "improve_outfit" };

export type AuraLaundryStatus = "clean" | "needs_wash" | "in_laundry";

export type AuraLaundryAction = {
  targetStatus: AuraLaundryStatus;
  matches: {
    itemId: string;
    label: string;
    subtitle?: string | null;
  }[];
};

export type AuraLaundryConfirmationAction = {
  type: "confirm_laundry_status";
  itemId: string;
  targetStatus: AuraLaundryStatus;
};

export type AuraLookAction =
  | "saveLook"
  | "planForToday"
  | "wearToday"
  | "likeLook"
  | "notMyVibe"
  | "showMoreLikeThis"
  | "lessLikeThis"
  | "shopMissingPieces"
  | "useOnlyMyCloset"
  | "makeItDressier";

export type AuraSuggestionItem = {
  label: string;
  searchQuery?: string | null;
};

export type AuraCandidateItem = {
  candidateId: string;
  imageUrls: string[];
  primaryImageUrl?: string | null;
  secondaryImageUrls?: string[];
  title?: string | null;
  category?: string | null;
  subCategory?: string | null;
  color?: string | null;
  displayColor?: string | null;
  displayColors?: string[] | null;
  brand?: string | null;
  material?: string | null;
  materials?: string[];
  fit?: string | null;
  sleeveLength?: string | null;
  collar?: string | null;
  length?: string | null;
  pattern?: string | null;
  confidence?: number | null;
  retailPrice?: number | null;
  purchasePrice?: number | null;
  estimatedValue?: number | null;
  currency?: string | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  originalCurrency?: string | null;
  priceSource?: "product_link" | "manual" | "estimated" | null;
  priceDisplay?: string | null;
  price?: number | null;
  productUrl?: string | null;
  sizeOptions?: string[];
  availableSizes?: string[];
  careInstructions?: string[];
  productDescription?: string | null;
  graphicText?: string | null;
  motif?: string | null;
  collaborationName?: string | null;
  sourceType: "image" | "link" | "batch";
  sourceUrl?: string | null;
  imageSourceReason?: string | null;
  status: "awaiting_confirmation" | "needs_review" | "added" | "cancelled" | "failed";
};

export type AuraCandidateAction =
  | { type: "add_candidate"; candidateId: string }
  | { type: "edit_candidate"; candidateId: string }
  | { type: "cancel_candidate"; candidateId: string }
  | { type: "add_all_candidates" };

export type AuraLook = {
  id?: string | null;
  lookTitle: string;
  vibe: string;
  shortExplanation: string;
  stylingNote?: string;
  personalizationLabel?: string;
  personalizationNote?: string;
  stylingIntelligence?: StylingIntelligenceSummary | null;
  pieces: AuraLookPiece[];
  fromCloset: string[];
  addToComplete: string[];
  alternates: string[];
  actions: AuraLookAction[];
};

export type AuraLookOptionMeta = {
  optionIndex: number;
  optionLabel?: string | null;
  optionId?: string | null;
};

export type AuraResponse = {
  presentation?: "chat" | "card" | "candidate_preview" | "outfit_analysis" | "laundry_confirmation";
  title: string;
  reply: string;
  reason: string;
  outfitItems: string[];
  ownedPieces?: string[];
  recommendedAdditions?: string[];
  swapSuggestion: string;
  missingPieces?: string[];
  upgradeSuggestions?: string[];
  upgradeSuggestionItems?: AuraSuggestionItem[];
  wardrobeSuggestions?: WardrobeSuggestion[];
  chips: string[];
  look?: AuraLook | null;
  lookOptions?: AuraLook[];
  stylingIntelligence?: StylingIntelligenceSummary | null;
  candidates?: AuraCandidateItem[];
  candidateItems?: AuraCandidateItem[];
  outfitAnalysis?: AuraOutfitPhotoAnalysis | null;
  laundryAction?: AuraLaundryAction | null;
};
