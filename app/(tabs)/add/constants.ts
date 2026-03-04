import { Category } from "../../../src/shared/wardrobeTaxonomy";

export const CATEGORIES: Category[] = Object.values(Category);

export const DEFAULT_COLORS = [
  "Black",
  "White",
  "Blue",
  "Grey",
  "Brown",
  "Green",
  "Red",
  "Gold",
  "Beige",
  "Cream",
  "Silver",
];

export const OCCASION_OPTIONS = [
  "work",
  "gym",
  "party",
  "date",
  "travel",
  "lounge",
  "formal_event",
  "streetwear",
] as const;

export const SEASON_OPTIONS = ["summer", "winter", "spring_fall", "all_season"] as const;

export const FIT_OPTIONS = ["slim", "regular", "oversized", "relaxed", "unknown"] as const;
export const RISE_OPTIONS = ["low", "mid", "high", "unknown"] as const;
export const LEG_SHAPE_OPTIONS = [
  "skinny",
  "tapered",
  "straight",
  "wide",
  "flare",
  "unknown",
] as const;

export const SIZE_OPTIONS = ["XXS", "XS", "S", "M", "L", "XL", "XXL"] as const;

export const MATERIAL_OPTIONS = [
  "cotton",
  "denim",
  "polyester",
  "wool",
  "leather",
  "linen",
  "nylon",
  "silk",
  "rayon",
  "fleece",
  "unknown",
] as const;

export const PATTERN_OPTIONS = [
  "solid",
  "striped",
  "plaid",
  "checked",
  "graphic",
  "logo",
  "text",
  "floral",
  "dots",
  "camouflage",
  "textured",
  "other",
  "unknown",
] as const;

export const DEFAULT_REFINE_VALUE = 1 / 3;
export const CURRENCIES = ["USD", "INR", "EUR", "GBP", "CAD", "AUD"] as const;
