export enum Category {
  TOP = "top",
  BOTTOM = "bottom",
  OUTERWEAR = "outerwear",
  FOOTWEAR = "footwear",
  ONE_PIECE = "one_piece",
  ACCESSORY = "accessory",
}

export const ALLOWED_COLORS = [
  "black",
  "white",
  "grey",
  "navy",
  "blue",
  "green",
  "olive",
  "red",
  "brown",
  "beige",
  "tan",
  "khaki",
  "cream",
  "gold",
  "silver",
  "yellow",
  "orange",
  "pink",
  "purple",
] as const;
export type AllowedColor = (typeof ALLOWED_COLORS)[number];

export const ALLOWED_FORMALITY = [
  "casual",
  "smart_casual",
  "formal",
  "athletic",
  "lounge",
  "party",
  "streetwear",
] as const;
export type AllowedFormality = (typeof ALLOWED_FORMALITY)[number];

export const ALLOWED_WARMTH = ["light", "medium", "heavy"] as const;
export type AllowedWarmth = (typeof ALLOWED_WARMTH)[number];

export const ALLOWED_LAYER_ROLES = ["base", "mid", "outer"] as const;
export type AllowedLayerRole = (typeof ALLOWED_LAYER_ROLES)[number];

export const ALLOWED_VISUAL_WEIGHT = ["minimal", "balanced", "bold"] as const;
export type AllowedVisualWeight = (typeof ALLOWED_VISUAL_WEIGHT)[number];

export const ALLOWED_AESTHETIC_TAGS = [
  "luxury",
  "streetwear",
  "statement",
  "minimal",
  "classic",
  "sporty",
  "workwear",
  "preppy",
  "edgy",
  "vintage",
  "logo_heavy",
  "monogram",
  "utility",
] as const;
export type AllowedAestheticTag = (typeof ALLOWED_AESTHETIC_TAGS)[number];

export const SUB_CATEGORIES = {
  [Category.TOP]: [
    "tshirt",
    "shirt",
    "blouse",
    "crop_top",
    "polo",
    "sweatshirt",
    "hoodie",
    "sweater",
    "tank",
    "kurta",
  ],
  [Category.BOTTOM]: [
    "jeans",
    "chinos",
    "trousers",
    "joggers",
    "shorts",
    "skirt",
    "cargo",
    "trackpants",
  ],
  [Category.OUTERWEAR]: ["jacket", "coat", "overshirt", "blazer"],
  [Category.FOOTWEAR]: [
    "sneaker",
    "formal_shoe",
    "boot",
    "heel",
    "slide",
    "sandal",
    "loafer",
  ],
  [Category.ONE_PIECE]: ["dress", "jumpsuit", "romper", "set", "matching_set"],
  [Category.ACCESSORY]: [
    "watch",
    "sunglasses",
    "glasses",
    "necklace",
    "bracelet",
    "earrings",
    "belt",
    "cap",
    "bag",
    "handbag",
    "socks",
    "perfume",
  ],
} as const;

export type SubCategoryMap = typeof SUB_CATEGORIES;
export type SubCategory = SubCategoryMap[keyof SubCategoryMap][number];

export function isValidCategorySubCategory(
  category?: string | null,
  subCategory?: string | null
): boolean {
  if (!category || !subCategory) return false;
  const options = SUB_CATEGORIES[category as Category];
  if (!options) return false;
  return (options as readonly string[]).includes(subCategory);
}

export function wearSlot(category?: string | null): "core" | "accessory" {
  return category === Category.ACCESSORY ? "accessory" : "core";
}

export function isCoreWearable(item: {
  category?: string | null;
  wearSlot?: "core" | "accessory" | null;
}): boolean {
  if (item.wearSlot) return item.wearSlot === "core";
  return wearSlot(item.category) === "core";
}
