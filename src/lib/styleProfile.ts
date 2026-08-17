import type { UserProfilePreferences, WardrobeMode } from "@/src/types/UserProfilePreferences";

export type StyleProfileCategory =
  | "top"
  | "one_piece"
  | "outerwear"
  | "bottom"
  | "shoes"
  | "accessory";

export type StyleProfileConfig = {
  categoryOrder: StyleProfileCategory[];
  emphasizedSubcategories: string[];
  emphasizedAccessories: string[];
  prioritizedGoals: string[];
  recommendationEmphasis: string[];
  starterPromptPresets: string[];
};

const MASCULINE_ORDER: StyleProfileCategory[] = [
  "top",
  "outerwear",
  "bottom",
  "shoes",
  "accessory",
  "one_piece",
];

const FEMININE_ORDER: StyleProfileCategory[] = [
  "top",
  "one_piece",
  "outerwear",
  "bottom",
  "shoes",
  "accessory",
];

const BALANCED_ORDER: StyleProfileCategory[] = [
  "top",
  "one_piece",
  "outerwear",
  "bottom",
  "shoes",
  "accessory",
];

function unique(values: (string | null | undefined)[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
}

function modeSubcategories(mode: WardrobeMode) {
  if (mode === "masculine") {
    return ["shirt", "tshirt", "jacket", "jeans", "sneaker", "watch", "cap"];
  }
  if (mode === "feminine") {
    return ["dress", "skirt", "blouse", "crop_top", "heel", "handbag", "necklace"];
  }
  if (mode === "neutral") {
    return ["shirt", "blouse", "trousers", "sneaker", "loafer", "bag"];
  }
  return ["shirt", "blouse", "dress", "jeans", "sneaker", "heel", "bag"];
}

function modeAccessories(mode: WardrobeMode) {
  if (mode === "masculine") return ["watch", "cap", "belt", "sunglasses", "perfume"];
  if (mode === "feminine") return ["handbag", "necklace", "bracelet", "earrings", "sunglasses", "perfume"];
  if (mode === "neutral") return ["bag", "watch", "sunglasses", "scarf", "perfume"];
  return ["watch", "handbag", "necklace", "bracelet", "cap", "sunglasses"];
}

function orderForMode(mode: WardrobeMode) {
  if (mode === "masculine") return MASCULINE_ORDER;
  if (mode === "feminine") return FEMININE_ORDER;
  return BALANCED_ORDER;
}

function categoryBias(selectedCategories: string[]) {
  const has = (value: string) => selectedCategories.includes(value);
  return {
    dresses: has("dresses"),
    skirts: has("skirts"),
    heels: has("heels"),
    tops: selectedCategories.some((value) =>
      ["tshirts", "shirts", "polos", "blouses", "tanks", "crop_tops", "sweaters", "hoodies"].includes(value)
    ),
    casual: selectedCategories.some((value) =>
      ["tshirts", "hoodies", "sneakers", "shorts"].includes(value)
    ),
    tailoring: selectedCategories.some((value) =>
      ["shirts", "blazers", "trousers", "loafers"].includes(value)
    ),
  };
}

function orderForSelectedCategories(mode: WardrobeMode, selectedCategories: string[]) {
  if (!selectedCategories.length) return orderForMode(mode);
  const bias = categoryBias(selectedCategories);
  if (bias.dresses || bias.skirts || bias.heels) {
    return ["one_piece", "top", "bottom", "outerwear", "shoes", "accessory"] as StyleProfileCategory[];
  }
  if (bias.tailoring) {
    return ["outerwear", "bottom", "top", "shoes", "accessory", "one_piece"] as StyleProfileCategory[];
  }
  if (bias.casual) {
    return ["top", "shoes", "outerwear", "bottom", "accessory", "one_piece"] as StyleProfileCategory[];
  }
  if (bias.tops) {
    return ["top", "outerwear", "bottom", "shoes", "accessory", "one_piece"] as StyleProfileCategory[];
  }
  return orderForMode(mode);
}

function subcategoriesFromSelectedCategories(selectedCategories: string[]) {
  return selectedCategories.flatMap((category) => {
    switch (category) {
      case "tshirts":
        return ["tshirt", "tee"];
      case "shirts":
        return ["shirt"];
      case "polos":
        return ["polo"];
      case "blouses":
        return ["blouse"];
      case "tanks":
        return ["tank"];
      case "crop_tops":
        return ["crop_top"];
      case "sweaters":
        return ["sweater"];
      case "hoodies":
        return ["hoodie"];
      case "jackets":
        return ["jacket"];
      case "coats":
        return ["coat"];
      case "blazers":
        return ["blazer"];
      case "jeans":
        return ["jeans"];
      case "trousers":
        return ["trousers"];
      case "shorts":
        return ["shorts"];
      case "skirts":
        return ["skirt"];
      case "dresses":
        return ["dress"];
      case "sneakers":
        return ["sneaker"];
      case "loafers":
        return ["loafer"];
      case "boots":
        return ["boot"];
      case "heels":
        return ["heel"];
      case "sandals":
        return ["sandal"];
      default:
        return [];
    }
  });
}

function accessoriesFromSelectedCategories(selectedCategories: string[]) {
  const bias = categoryBias(selectedCategories);
  const next: string[] = [];
  if (bias.dresses || bias.heels || selectedCategories.includes("skirts")) {
    next.push("handbag", "necklace", "bracelet", "earrings");
  }
  if (bias.casual) {
    next.push("cap", "watch", "sunglasses");
  }
  if (bias.tailoring) {
    next.push("watch", "belt", "bag", "perfume");
  }
  return next;
}

function recommendationEmphasisFromSelectedCategories(selectedCategories: string[]) {
  const bias = categoryBias(selectedCategories);
  const next: string[] = [];
  if (bias.dresses || bias.heels) next.push("date_night", "going_out", "dress_styling");
  if (bias.casual) next.push("casual_everyday", "streetwear", "weekend");
  if (bias.tailoring) next.push("smart_casual", "office", "formal");
  if (!next.length && selectedCategories.length) next.push("everyday", "closet_first");
  return next;
}

function starterPromptPresetsFromSelectedCategories(selectedCategories: string[]) {
  const emphasis = recommendationEmphasisFromSelectedCategories(selectedCategories);
  if (emphasis.includes("date_night")) return ["date_night", "dress_up", "closet", "shopping", "today"];
  if (emphasis.includes("streetwear")) return ["streetwear", "casual", "closet", "weather", "today"];
  if (emphasis.includes("office")) return ["office", "smart_casual", "closet", "elevate", "today"];
  if (!selectedCategories.length) return [];
  return ["today", "closet", "weather", "unworn"];
}

export function getStyleProfileConfig(
  profile: UserProfilePreferences | null | undefined,
): StyleProfileConfig {
  const mode = profile?.wardrobeMode ?? "mixed";
  const aesthetics = profile?.styleAesthetics ?? [];
  const goals = profile?.goals ?? [];
  const accessories = profile?.accessoryPreferences ?? [];
  const selectedCategories = profile?.selectedCategories ?? [];
  const selectedSubcategories = subcategoriesFromSelectedCategories(selectedCategories);
  const selectedAccessories = accessoriesFromSelectedCategories(selectedCategories);
  const recommendationEmphasis = recommendationEmphasisFromSelectedCategories(selectedCategories);

  return {
    categoryOrder: orderForSelectedCategories(mode, selectedCategories),
    emphasizedSubcategories: unique([
      ...modeSubcategories(mode),
      ...selectedSubcategories,
      ...(aesthetics.includes("luxury") ? ["blazer", "loafer", "heel", "handbag"] : []),
      ...(aesthetics.includes("sporty") ? ["hoodie", "joggers", "sneaker", "cap"] : []),
      ...(aesthetics.includes("minimal") ? ["shirt", "trousers", "dress", "bag"] : []),
    ]),
    emphasizedAccessories: unique([
      ...modeAccessories(mode),
      ...selectedAccessories,
      ...accessories,
    ]),
    prioritizedGoals: goals,
    recommendationEmphasis: unique([
      ...recommendationEmphasis,
      ...(goals.includes("shopping_suggestions") ? ["shopping"] : []),
      ...(goals.includes("outfit_suggestions") ? ["outfit_first"] : []),
    ]),
    starterPromptPresets: unique([
      ...starterPromptPresetsFromSelectedCategories(selectedCategories),
      ...(goals.includes("packing_help") ? ["packing"] : []),
      ...(goals.includes("styling_confidence") ? ["confidence"] : []),
      ...(goals.includes("shopping_suggestions") ? ["shopping"] : []),
    ]),
  };
}
