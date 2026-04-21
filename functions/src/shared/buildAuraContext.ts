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
};

type AuraCategory =
  | "tops"
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

function pickColor(item: WardrobeItem): string {
  return (
    String(item.aiColorLabel ?? "").trim() ||
    String(item.aiColors?.[0] ?? "").trim() ||
    String(item.colors?.[0] ?? "").trim() ||
    String(item.color ?? "").trim()
  );
}

export function mapCategory(raw?: string | null): AuraCategory {
  const value = normalizeToken(raw);

  if (
    [
      "top",
      "tops",
      "tshirt",
      "t-shirt",
      "tee",
      "shirt",
      "hoodie",
      "sweater",
      "polo",
      "sweatshirt",
      "tank",
      "overshirt",
      "kurta",
    ].includes(value)
  ) {
    return "tops";
  }

  if (["outerwear", "jacket", "coat", "blazer", "overshirt"].includes(value)) {
    return "outerwear";
  }

  if (
    [
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
    ].includes(value)
  ) {
    return "bottoms";
  }

  if (
    [
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
      "formal shoe",
      "formal shoes",
      "derby",
      "derbies",
      "oxford",
      "oxfords",
      "chelsea boot",
      "chelsea boots",
    ].includes(value)
  ) {
    return "footwear";
  }

  if (
    [
      "accessories",
      "accessory",
      "watch",
      "bag",
      "belt",
      "perfume",
      "jewellery",
      "jewelry",
      "cap",
      "hat",
      "sunglasses",
    ].includes(value)
  ) {
    return "accessories";
  }

  return "other";
}

export function buildAuraContext({
  items,
  weather,
  occasion,
  selectedDate,
}: AuraContextArgs) {
  const excluded = {
    drafts: [] as Record<string, string>[],
    laundry: [] as Record<string, string>[],
    uncategorized: [] as Record<string, string>[],
  };
  const wardrobe = {
    tops: [] as Record<string, string>[],
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

  return {
    selectedDate: selectedDate ?? null,
    occasion: occasion ?? null,
    weather: {
      tempF: weather?.tempF ?? null,
      condition: weather?.condition ?? null,
    },
    wardrobe,
    counts: {
      tops: wardrobe.tops.length,
      outerwear: wardrobe.outerwear.length,
      bottoms: wardrobe.bottoms.length,
      footwear: wardrobe.footwear.length,
      accessories: wardrobe.accessories.length,
    },
    inventory: {
      total:
        wardrobe.tops.length +
        wardrobe.outerwear.length +
        wardrobe.bottoms.length +
        wardrobe.footwear.length +
        wardrobe.accessories.length,
      hasAnyItems:
        wardrobe.tops.length +
          wardrobe.outerwear.length +
          wardrobe.bottoms.length +
          wardrobe.footwear.length +
          wardrobe.accessories.length >
        0,
      missingCoreCategories: [
        ...(wardrobe.tops.length ? [] : ["tops"]),
        ...(wardrobe.bottoms.length ? [] : ["bottoms"]),
        ...(wardrobe.footwear.length ? [] : ["footwear"]),
      ],
    },
    wardrobeDebug: {
      footwearAvailable: wardrobe.footwear,
      bottomsAvailable: wardrobe.bottoms,
      accessoriesAvailable: wardrobe.accessories,
      excludedFootwear: [...excluded.drafts, ...excluded.laundry, ...excluded.uncategorized].filter(
        (item) => mapCategory(item.subCategory || item.category || item.type) === "footwear"
      ),
    },
    stylingPolicy: {
      preferOwnedClosetItems: true,
      preferOwnedFootwear: true,
      preferOwnedBottoms: true,
      suggestMissingPiecesOnlyWhenNoReasonableOwnedOptionExists: true,
    },
  };
}
