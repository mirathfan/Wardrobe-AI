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
  "yellow",
  "orange",
  "pink",
  "purple",
] as const;
export type AllowedColor = (typeof ALLOWED_COLORS)[number];

export const SUB_CATEGORIES = {
  [Category.TOP]: [
    "tshirt",
    "shirt",
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
    "cargo",
    "trackpants",
  ],
  [Category.OUTERWEAR]: ["jacket", "coat", "overshirt", "blazer"],
  [Category.FOOTWEAR]: [
    "sneaker",
    "formal_shoe",
    "boot",
    "slide",
    "sandal",
    "loafer",
  ],
  [Category.ONE_PIECE]: ["jumpsuit", "set"],
  [Category.ACCESSORY]: [
    "watch",
    "sunglasses",
    "glasses",
    "belt",
    "cap",
    "bag",
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
