export type AuraLookPiece = {
  role: "top" | "bottom" | "shoes" | "outerwear" | "accessory";
  itemName: string;
  source: "closet" | "suggested";
  itemId?: string | null;
  imageUrl?: string | null;
};

export type AuraLookAction =
  | "saveLook"
  | "planForToday"
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
  brand?: string | null;
  material?: string | null;
  fit?: string | null;
  pattern?: string | null;
  confidence?: number | null;
  sourceType: "image" | "link" | "batch";
  sourceUrl?: string | null;
  status: "awaiting_confirmation" | "needs_review" | "added" | "cancelled" | "failed";
};

export type AuraCandidateAction =
  | { type: "add_candidate"; candidateId: string }
  | { type: "edit_candidate"; candidateId: string }
  | { type: "cancel_candidate"; candidateId: string }
  | { type: "add_all_candidates" };

export type AuraLook = {
  lookTitle: string;
  vibe: string;
  shortExplanation: string;
  stylingNote?: string;
  personalizationLabel?: string;
  personalizationNote?: string;
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
  presentation?: "chat" | "card" | "candidate_preview";
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
  chips: string[];
  look?: AuraLook | null;
  lookOptions?: AuraLook[];
  candidates?: AuraCandidateItem[];
  candidateItems?: AuraCandidateItem[];
};
