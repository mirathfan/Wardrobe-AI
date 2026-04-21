import type {
  UserProfilePreferences,
  WardrobeMode,
} from "@/src/types/UserProfilePreferences";

export const ONBOARDING_CATEGORY_OPTIONS = [
  "tshirts",
  "shirts",
  "polos",
  "blouses",
  "tanks",
  "crop_tops",
  "sweaters",
  "hoodies",
  "jackets",
  "coats",
  "blazers",
  "jeans",
  "trousers",
  "shorts",
  "skirts",
  "dresses",
  "sneakers",
  "loafers",
  "boots",
  "heels",
  "sandals",
] as const;

export type OnboardingCategory = (typeof ONBOARDING_CATEGORY_OPTIONS)[number];

export type AdaptiveSizeFieldKey =
  | "tops"
  | "outerwear"
  | "bottoms"
  | "bottomsWaist"
  | "bottomsLength"
  | "dresses"
  | "skirts"
  | "shoes";

export type AdaptiveSizeField = {
  key: AdaptiveSizeFieldKey;
  label: string;
  placeholder: string;
  required: boolean;
  optional?: boolean;
};

const TOP_CORE = new Set<OnboardingCategory>([
  "tshirts",
  "shirts",
  "polos",
  "sweaters",
  "hoodies",
  "blouses",
  "tanks",
  "crop_tops",
]);

const OUTERWEAR_CORE = new Set<OnboardingCategory>(["jackets", "coats", "blazers"]);
const BOTTOMS_CORE = new Set<OnboardingCategory>(["jeans", "trousers", "shorts"]);
const FOOTWEAR_CORE = new Set<OnboardingCategory>([
  "heels",
  "sandals",
  "boots",
  "sneakers",
  "loafers",
]);
const BRA_RELEVANT = new Set<OnboardingCategory>([
  "dresses",
  "blouses",
  "tanks",
  "crop_tops",
]);

function hasAnyCategory(
  selectedCategories: string[],
  candidates: Set<OnboardingCategory>,
) {
  return selectedCategories.some((category) =>
    candidates.has(category as OnboardingCategory),
  );
}

export function shouldShowAdvancedBraSize(
  selectedCategories: string[],
  wardrobeMode: WardrobeMode,
) {
  if (
    wardrobeMode !== "feminine" &&
    wardrobeMode !== "mixed" &&
    wardrobeMode !== "custom"
  ) {
    return false;
  }
  return hasAnyCategory(selectedCategories, BRA_RELEVANT);
}

export function getAdaptiveSizeFields(
  selectedCategories: string[],
  wardrobeMode: WardrobeMode,
): AdaptiveSizeField[] {
  const fields: AdaptiveSizeField[] = [];
  const isMasculineMode = wardrobeMode === "masculine";
  const isFeminineMode = wardrobeMode === "feminine";

  if (hasAnyCategory(selectedCategories, TOP_CORE)) {
    fields.push({
      key: "tops",
      label: "Tops size",
      placeholder: isFeminineMode ? "e.g. S, M, 4, 6" : "e.g. M, L, 40",
      required: true,
    });
  }

  if (hasAnyCategory(selectedCategories, OUTERWEAR_CORE)) {
    fields.push({
      key: "outerwear",
      label: "Outerwear size",
      placeholder: "e.g. M, L, 40, 8",
      required: true,
    });
  }

  if (selectedCategories.includes("dresses")) {
    fields.push({
      key: "dresses",
      label: "Dress size",
      placeholder: "e.g. S, 4, 38",
      required: true,
    });
  }

  if (selectedCategories.includes("skirts")) {
    fields.push({
      key: "skirts",
      label: "Skirt size",
      placeholder: "e.g. S, 4, 28",
      required: true,
    });
  }

  if (hasAnyCategory(selectedCategories, BOTTOMS_CORE)) {
    if (isMasculineMode) {
      fields.push({
        key: "bottomsWaist",
        label: "Bottoms waist",
        placeholder: "e.g. 30, 32, 34",
        required: true,
      });
      fields.push({
        key: "bottomsLength",
        label: "Bottoms length",
        placeholder: "e.g. 30, 32, regular",
        required: false,
        optional: true,
      });
      fields.push({
        key: "bottoms",
        label: "Bottoms size",
        placeholder: "Optional fallback size",
        required: false,
        optional: true,
      });
    } else if (isFeminineMode) {
      fields.push({
        key: "bottoms",
        label: "Bottoms size",
        placeholder: "e.g. 4, 6, S, M",
        required: true,
      });
      fields.push({
        key: "bottomsWaist",
        label: "Bottoms waist",
        placeholder: "Optional waist measurement",
        required: false,
        optional: true,
      });
      fields.push({
        key: "bottomsLength",
        label: "Bottoms length",
        placeholder: "Optional length / inseam",
        required: false,
        optional: true,
      });
    } else {
      fields.push({
        key: "bottoms",
        label: "Bottoms size",
        placeholder: "e.g. S, M, 30, 32",
        required: true,
      });
      fields.push({
        key: "bottomsWaist",
        label: "Bottoms waist",
        placeholder: "Optional waist measurement",
        required: false,
        optional: true,
      });
      fields.push({
        key: "bottomsLength",
        label: "Bottoms length",
        placeholder: "Optional length / inseam",
        required: false,
        optional: true,
      });
    }
  }

  if (hasAnyCategory(selectedCategories, FOOTWEAR_CORE)) {
    fields.push({
      key: "shoes",
      label: "Shoe size",
      placeholder: "e.g. US 9, EU 40",
      required: true,
    });
  }

  return fields;
}

function stringOrNull(value: unknown) {
  const next = String(value ?? "").trim();
  return next || null;
}

export function normalizeProfileSizePayload(
  draft: UserProfilePreferences,
): UserProfilePreferences {
  const defaultSizes = {
    ...draft.defaultSizes,
    top: stringOrNull(draft.defaultSizes.top ?? draft.defaultSizes.tops),
    tops: stringOrNull(draft.defaultSizes.tops ?? draft.defaultSizes.top),
    outerwear: stringOrNull(draft.defaultSizes.outerwear),
    bottoms: stringOrNull(draft.defaultSizes.bottoms),
    bottomWaist: stringOrNull(
      draft.defaultSizes.bottomWaist ?? draft.defaultSizes.bottomsWaist,
    ),
    bottomsWaist: stringOrNull(
      draft.defaultSizes.bottomsWaist ?? draft.defaultSizes.bottomWaist,
    ),
    bottomLength: stringOrNull(
      draft.defaultSizes.bottomLength ?? draft.defaultSizes.bottomsLength,
    ),
    bottomsLength: stringOrNull(
      draft.defaultSizes.bottomsLength ?? draft.defaultSizes.bottomLength,
    ),
    dresses: stringOrNull(draft.defaultSizes.dresses),
    skirts: stringOrNull(draft.defaultSizes.skirts),
    shoes: stringOrNull(draft.defaultSizes.shoes),
  };

  const advancedFit = {
    bust: stringOrNull(draft.advancedFit.bust),
    waistMeasurement: stringOrNull(draft.advancedFit.waistMeasurement),
    hips: stringOrNull(draft.advancedFit.hips),
    inseam: stringOrNull(draft.advancedFit.inseam),
    shoulderWidth: stringOrNull(draft.advancedFit.shoulderWidth),
    sleeveLength: stringOrNull(draft.advancedFit.sleeveLength),
    braSize: shouldShowAdvancedBraSize(
      draft.selectedCategories,
      draft.wardrobeMode,
    )
      ? stringOrNull(draft.advancedFit.braSize)
      : null,
  };

  return {
    ...draft,
    defaultSizes,
    advancedFit,
  };
}
