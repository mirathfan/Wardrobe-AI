import type {CompactAuraMemoryContext} from "../../../shared/auraMemory";
import {
  detectWardrobeGaps,
  type WardrobeCategoryCounts,
} from "./detectWardrobeGaps";
import type {AuraUserProfile} from "./loadAuraUserProfile";

type WardrobeItem = {
  id: string;
  name?: string;
  brand?: string;
  category?: string;
  subCategory?: string;
  type?: string | null;
  color?: string;
  aiColorLabel?: string;
  colors?: string[];
  aiColors?: string[];
  primaryColor?: string | null;
  displayColor?: string | null;
  displayColors?: string[] | null;
  material?: string | null;
  materials?: string[] | null;
  pattern?: string | null;
  fit?: string | null;
  sleeveLength?: string | null;
  neckline?: string | null;
  collar?: string | null;
  closure?: string | null;
  length?: string | null;
  occasionTags?: string[] | null;
  seasonTags?: string[] | null;
  style?: string | null;
  status?: string;
  inLaundry?: boolean;
  isDraft?: boolean;
  photoUrl?: string | null;
  images?: {
    originalUrl?: string | null;
    cleanedUrl?: string | null;
    isPrimary?: boolean;
  }[] | null;
};

type AuraContextArgs = {
  items: WardrobeItem[];
  weather?: {
    tempF?: number | null;
    condition?: string | null;
  } | null;
  occasion?: string | null;
  selectedDate?: string | null;
  memory?: CompactAuraMemoryContext | null;
  userProfile?: AuraUserProfile | null;
};

type AuraCategory =
  | "tops"
  | "one_piece"
  | "outerwear"
  | "bottoms"
  | "footwear"
  | "accessories"
  | "other";

function normalize(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeToken(value?: string | null): string {
  return normalize(value)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL_AURA_CATEGORY_ALIASES: Record<Exclude<AuraCategory, "other">, readonly string[]> = {
  // Keep this alias table in sync with src/lib/items.ts.
  one_piece: ["one piece", "dress", "jumpsuit", "romper", "set", "matching set"],
  tops: [
    "top",
    "tops",
    "tshirt",
    "t shirt",
    "t-shirt",
    "tee",
    "shirt",
    "polo",
    "sweater",
    "sweatshirt",
    "blouse",
    "crop top",
    "tank",
    "tank top",
    "kurta",
  ],
  outerwear: [
    "outerwear",
    "jacket",
    "jackets",
    "hoodie",
    "hoodies",
    "coat",
    "coats",
    "blazer",
    "blazers",
    "overshirt",
    "overshirts",
    "cardigan",
    "cardigans",
    "shacket",
    "trench",
    "parka",
    "bomber",
    "layer",
    "layers",
  ],
  bottoms: [
    "bottom",
    "bottoms",
    "pants",
    "jeans",
    "trousers",
    "shorts",
    "cargo",
    "cargos",
    "chinos",
    "joggers",
    "trackpants",
    "track pants",
  ],
  footwear: [
    "footwear",
    "shoes",
    "shoe",
    "sneaker",
    "sneakers",
    "boot",
    "boots",
    "sandal",
    "sandals",
    "slide",
    "slides",
    "loafer",
    "loafers",
    "heel",
    "heels",
    "formal shoe",
    "formal shoes",
    "derby",
    "derbies",
    "oxford",
    "oxfords",
    "chelsea boot",
    "chelsea boots",
  ],
  accessories: [
    "accessories",
    "accessory",
    "watch",
    "bag",
    "handbag",
    "tote",
    "tote bag",
    "crossbody",
    "belt",
    "perfume",
    "jewellery",
    "jewelry",
    "cap",
    "hat",
    "sunglasses",
    "glasses",
    "necklace",
    "bracelet",
    "ring",
    "earrings",
    "scarf",
    "socks",
  ],
};

function pickColor(item: WardrobeItem): string {
  return (
    String(item.aiColorLabel ?? "").trim() ||
    String(item.aiColors?.[0] ?? "").trim() ||
    String(item.colors?.[0] ?? "").trim() ||
    String(item.color ?? "").trim()
  );
}

function nonEmptyList(value?: string[]) {
  return Array.isArray(value) && value.length ? value : null;
}

function compactStringList(values?: string[] | null) {
  if (!Array.isArray(values)) return "";
  return values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");
}

function nonEmptyRecord<T extends object>(value?: T | null) {
  return value && Object.keys(value).length ? value : null;
}

function compactUserPreferences(userProfile?: AuraUserProfile | null) {
  if (!userProfile) return null;

  const userPreferences = {
    ...(userProfile.displayName ? {displayName: userProfile.displayName} : {}),
    ...(userProfile.name ? {name: userProfile.name} : {}),
    ...(userProfile.firstName ? {firstName: userProfile.firstName} : {}),
    ...(userProfile.wardrobeMode ? {wardrobeMode: userProfile.wardrobeMode} : {}),
    ...(nonEmptyList(userProfile.selectedCategories)
      ? {selectedCategories: userProfile.selectedCategories}
      : {}),
    ...(nonEmptyList(userProfile.styleAesthetics)
      ? {styleAesthetics: userProfile.styleAesthetics}
      : {}),
    ...(nonEmptyList(userProfile.favoriteColors)
      ? {favoriteColors: userProfile.favoriteColors}
      : {}),
    ...(nonEmptyList(userProfile.avoidedColors)
      ? {avoidedColors: userProfile.avoidedColors}
      : {}),
    ...(userProfile.preferredFit ? {preferredFit: userProfile.preferredFit} : {}),
    ...(userProfile.preferredFit ? {fitPreference: userProfile.preferredFit} : {}),
    ...(userProfile.budgetPreference ? {budgetPreference: userProfile.budgetPreference} : {}),
    ...(nonEmptyRecord(userProfile.fitPreferences)
      ? {fitPreferences: userProfile.fitPreferences}
      : {}),
    ...(nonEmptyRecord(userProfile.defaultSizes)
      ? {defaultSizes: userProfile.defaultSizes}
      : {}),
    ...(nonEmptyRecord(userProfile.stylePreferences)
      ? {stylePreferences: userProfile.stylePreferences}
      : {}),
    ...(nonEmptyList(userProfile.accessoryPreferences)
      ? {accessoryPreferences: userProfile.accessoryPreferences}
      : {}),
    ...(nonEmptyList(userProfile.occasionPriority)
      ? {occasionPriority: userProfile.occasionPriority}
      : {}),
    ...(nonEmptyList(userProfile.occasionPriority)
      ? {occasions: userProfile.occasionPriority}
      : {}),
    ...(nonEmptyList(userProfile.goals) ? {goals: userProfile.goals} : {}),
    ...(nonEmptyRecord(userProfile.closetPreferences)
      ? {closetPreferences: userProfile.closetPreferences}
      : {}),
  };

  return Object.keys(userPreferences).length ? userPreferences : null;
}

export function mapCategory(raw?: string | null): AuraCategory {
  const value = normalizeToken(raw);
  if (!value) return "other";
  for (const [category, aliases] of Object.entries(CANONICAL_AURA_CATEGORY_ALIASES) as [
    Exclude<AuraCategory, "other">,
    readonly string[],
  ][]) {
    if (aliases.includes(value)) return category;
  }
  return "other";
}

export function buildAuraContext({
  items,
  weather,
  occasion,
  selectedDate,
  memory,
  userProfile,
}: AuraContextArgs) {
  const DEBUG_AURA_SPARSE =
    process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production";
  const DEBUG_AURA_CONTEXT =
    process.env.DEBUG_AURA_CONTEXT === "1" || process.env.DEBUG_AURA_CONTEXT === "true";
  const excluded = {
    drafts: [] as Record<string, string>[],
    laundry: [] as Record<string, string>[],
    uncategorized: [] as Record<string, string>[],
  };
  const wardrobe = {
    tops: [] as Record<string, string>[],
    one_piece: [] as Record<string, string>[],
    outerwear: [] as Record<string, string>[],
    bottoms: [] as Record<string, string>[],
    footwear: [] as Record<string, string>[],
    accessories: [] as Record<string, string>[],
  };

  items.forEach((item) => {
    const summary = {
      id: item.id,
      name: String(item.name ?? "").trim(),
      brand: String(item.brand ?? "").trim(),
      category: String(item.category ?? "").trim(),
      subCategory: String(item.subCategory ?? "").trim(),
      type: String(item.type ?? "").trim(),
      color: pickColor(item),
      colors: compactStringList([
        ...(item.displayColors ?? []),
        ...(item.aiColors ?? []),
        ...(item.colors ?? []),
      ]),
      primaryColor: String(item.primaryColor ?? "").trim(),
      displayColor: String(item.displayColor ?? "").trim(),
      material:
        String(item.material ?? "").trim() || compactStringList(item.materials),
      pattern: String(item.pattern ?? "").trim(),
      fit: String(item.fit ?? "").trim(),
      sleeveLength: String(item.sleeveLength ?? "").trim(),
      neckline: String(item.neckline ?? item.collar ?? "").trim(),
      closure: String(item.closure ?? "").trim(),
      length: String(item.length ?? "").trim(),
      occasionTags: compactStringList(item.occasionTags),
      seasonTags: compactStringList(item.seasonTags),
      style: String(item.style ?? "").trim(),
      status: String(item.status ?? "").trim(),
      primaryImageUrl:
        String(
          item.images?.find((image) => image?.isPrimary)?.cleanedUrl ??
            item.images?.find((image) => image?.isPrimary)?.originalUrl ??
            item.images?.[0]?.cleanedUrl ??
            item.images?.[0]?.originalUrl ??
            item.photoUrl ??
            "",
        ).trim(),
      imageCount: String(Array.isArray(item.images) ? item.images.length : 0),
    };

    if (item.isDraft) {
      excluded.drafts.push(summary);
      return;
    }
    if (item.inLaundry || normalizeToken(item.status) === "in laundry") {
      excluded.laundry.push(summary);
      return;
    }

    const category =
      mapCategory(item.subCategory) !== "other"
        ? mapCategory(item.subCategory)
        : mapCategory(item.category) !== "other"
          ? mapCategory(item.category)
          : mapCategory(item.type);

    if (category === "other") {
      excluded.uncategorized.push(summary);
      return;
    }

    wardrobe[category].push(summary);
  });

  const categoryCounts: WardrobeCategoryCounts = {
    tops: wardrobe.tops.length,
    outerwear: wardrobe.outerwear.length,
    bottoms: wardrobe.bottoms.length,
    footwear: wardrobe.footwear.length,
    accessories: wardrobe.accessories.length,
  };
  const totalItemCount =
    categoryCounts.tops +
    wardrobe.one_piece.length +
    categoryCounts.outerwear +
    categoryCounts.bottoms +
    categoryCounts.footwear +
    categoryCounts.accessories;
  const isSparseWardrobe = totalItemCount < 15;
  const wardrobeGaps = detectWardrobeGaps(categoryCounts);

  if (DEBUG_AURA_SPARSE) {
    console.log("[AURA_SPARSE_CONTEXT]", {
      isSparseWardrobe,
      categoryCounts,
      detectedGaps: {
        missingCore: wardrobeGaps.missingCore.map((gap) => gap.label),
        weakAreas: wardrobeGaps.weakAreas.map((gap) => gap.label),
      },
      suggestions: wardrobeGaps.suggestions.map((suggestion) => suggestion.label),
    });
  }

  return {
    selectedDate: selectedDate ?? null,
    occasion: occasion ?? null,
    weather: {
      tempF: weather?.tempF ?? null,
      condition: weather?.condition ?? null,
    },
    wardrobe,
    counts: categoryCounts,
    categoryCounts,
    isSparseWardrobe,
    wardrobeGaps,
    inventory: {
      total: totalItemCount,
      totalItemCount,
      hasAnyItems: totalItemCount > 0,
      isSparseWardrobe,
      missingCoreCategories: [
        ...(wardrobe.tops.length ? [] : ["tops"]),
        ...(wardrobe.bottoms.length ? [] : ["bottoms"]),
        ...(wardrobe.footwear.length ? [] : ["footwear"]),
      ],
    },
    ...(DEBUG_AURA_CONTEXT
      ? {
          wardrobeDebug: {
            footwearAvailable: wardrobe.footwear,
            bottomsAvailable: wardrobe.bottoms,
            accessoriesAvailable: wardrobe.accessories,
            excludedFootwear: [...excluded.drafts, ...excluded.laundry, ...excluded.uncategorized].filter(
              (item) => mapCategory(item.subCategory || item.category || item.type) === "footwear"
            ),
          },
        }
      : {}),
    stylingPolicy: {
      preferOwnedClosetItems: true,
      preferOwnedFootwear: true,
      preferOwnedBottoms: true,
      suggestMissingPiecesOnlyWhenNoReasonableOwnedOptionExists: true,
    },
    stylingIntelligenceV1: {
      ruleBased: true,
      engines: ["fit", "color", "style_identity"],
      scoreRange: "0-100",
      guidance:
        "AURA may use wardrobe metadata for styling, but final deterministic styling scores are added after look selection.",
      supportedColorFamilies: [
        "black",
        "white",
        "gray",
        "navy",
        "blue",
        "brown",
        "beige",
        "cream",
        "green",
        "red",
        "pink",
        "purple",
        "yellow",
        "orange",
        "metallic",
        "multicolor",
        "unknown",
      ],
    },
    userPreferences: compactUserPreferences(userProfile),
    preferenceContext: memory ?? null,
    stylistBrief: memory?.stylistBrief ?? "",
  };
}
