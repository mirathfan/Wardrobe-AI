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
  | "showMoreLikeThis"
  | "shopMissingPieces"
  | "useOnlyMyCloset"
  | "makeItDressier";

export type AuraLook = {
  lookTitle: string;
  vibe: string;
  shortExplanation: string;
  stylingNote?: string;
  pieces: AuraLookPiece[];
  fromCloset: string[];
  addToComplete: string[];
  alternates: string[];
  actions: AuraLookAction[];
};

export type AuraResponse = {
  presentation?: "chat" | "card";
  title: string;
  reply: string;
  reason: string;
  outfitItems: string[];
  ownedPieces?: string[];
  recommendedAdditions?: string[];
  swapSuggestion: string;
  chips: string[];
  look?: AuraLook | null;
};
