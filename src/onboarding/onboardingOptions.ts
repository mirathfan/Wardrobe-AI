import type { WardrobeMode } from "@/src/types/UserProfilePreferences";

export const WARDROBE_MODE_CARDS: {
  value: Exclude<WardrobeMode, "custom">;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    value: "masculine",
    icon: "M",
    label: "Masculine",
    description: "Menswear cuts and silhouettes",
  },
  {
    value: "feminine",
    icon: "F",
    label: "Feminine",
    description: "Womenswear cuts and silhouettes",
  },
  {
    value: "neutral",
    icon: "N",
    label: "Neutral",
    description: "Unisex and gender-neutral pieces",
  },
  {
    value: "mixed",
    icon: "A",
    label: "Mixed",
    description: "Across all categories freely",
  },
];

export const STYLE_OPTIONS = [
  "streetwear",
  "casual",
  "smart_casual",
  "formal",
  "minimal",
  "sporty",
  "luxury",
  "modest",
  "vintage",
  "edgy",
] as const;

export const OCCASION_OPTIONS = [
  "daily",
  "work",
  "college",
  "gym",
  "party",
  "date_night",
  "travel",
  "formal_events",
] as const;

export const FIT_OPTIONS = ["slim", "regular", "relaxed", "oversized"] as const;
export const BUDGET_OPTIONS = ["budget", "mid", "premium"] as const;
export const SHOE_SIZES_EU = Array.from({ length: 14 }, (_, index) => 35 + index);

export type StepKey = "wardrobeMode" | "style" | "categories" | "profile";

export type Step = {
  key: StepKey;
  title: string;
  subtitle: string;
};

export const STEPS: Step[] = [
  {
    key: "wardrobeMode",
    title: "How do you dress?",
    subtitle: "Choose the wardrobe language AURA should use for silhouettes and styling.",
  },
  {
    key: "style",
    title: "What's your style?",
    subtitle: "Pick up to three aesthetics, then add where you usually dress up.",
  },
  {
    key: "categories",
    title: "What's in your wardrobe?",
    subtitle: "AURA will only suggest items in these categories.",
  },
  {
    key: "profile",
    title: "Quick profile",
    subtitle: "A few fit basics so AURA can personalize recommendations without the long form.",
  },
];
