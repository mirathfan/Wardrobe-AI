import {
  clampScore,
  itemText,
  normalizedText,
  uniqueList,
  type ColorEngineResult,
  type StylingColorFamily,
  type StylingItem,
} from "./types";

const NEUTRAL_FAMILIES = new Set<StylingColorFamily>([
  "black",
  "white",
  "gray",
  "navy",
  "brown",
  "beige",
  "cream",
]);

const SATURATED_FAMILIES = new Set<StylingColorFamily>([
  "blue",
  "green",
  "red",
  "pink",
  "purple",
  "yellow",
  "orange",
]);

const COMPLEMENTARY_PAIRS: Array<[StylingColorFamily, StylingColorFamily]> = [
  ["blue", "orange"],
  ["navy", "orange"],
  ["red", "green"],
  ["purple", "yellow"],
];

function colorFamilyFromText(value: unknown): StylingColorFamily {
  const text = normalizedText(value);
  if (!text) return "unknown";

  if (/\b(multicolor|multi color|rainbow|colorblock|color block|assorted)\b/.test(text)) {
    return "multicolor";
  }
  if (/\b(metallic|silver|gold|chrome|bronze|gunmetal|rose gold)\b/.test(text)) {
    return "metallic";
  }
  if (/\b(black|charcoal|onyx|jet)\b/.test(text)) return "black";
  if (/\b(white|ivory|optic|snow)\b/.test(text)) return "white";
  if (/\b(grey|gray|heather|ash|slate)\b/.test(text)) return "gray";
  if (/\b(navy|midnight)\b/.test(text)) return "navy";
  if (/\b(blue|denim|indigo|cobalt|azure|teal)\b/.test(text)) return "blue";
  if (/\b(brown|chocolate|tan|camel|taupe|espresso|mocha|walnut)\b/.test(text)) {
    return "brown";
  }
  if (/\b(beige|khaki|sand|stone|oat|oatmeal)\b/.test(text)) return "beige";
  if (/\b(cream|ecru|natural)\b/.test(text)) return "cream";
  if (/\b(green|olive|sage|mint|forest|emerald)\b/.test(text)) return "green";
  if (/\b(red|burgundy|maroon|crimson|wine)\b/.test(text)) return "red";
  if (/\b(pink|rose|blush|fuchsia|magenta)\b/.test(text)) return "pink";
  if (/\b(purple|violet|lavender|plum)\b/.test(text)) return "purple";
  if (/\b(yellow|mustard|lemon)\b/.test(text)) return "yellow";
  if (/\b(orange|coral|rust|terracotta)\b/.test(text)) return "orange";

  return "unknown";
}

function rawColorValues(item: StylingItem): unknown[] {
  return [
    item.displayColor,
    ...(item.displayColors ?? []),
    item.primaryColor,
    item.colorLabel,
    item.aiColorLabel,
    ...(item.colors ?? []),
    ...(item.aiColors ?? []),
  ];
}

export function normalizeColorFamily(value: unknown): StylingColorFamily {
  return colorFamilyFromText(value);
}

export function colorFamiliesForItem(item: StylingItem): StylingColorFamily[] {
  const families = rawColorValues(item)
    .map(colorFamilyFromText)
    .filter((family) => family !== "unknown");
  return uniqueList(families);
}

function hasConfusingDisplayColors(item: StylingItem): boolean {
  const rawDisplayColors = [
    item.displayColor,
    ...(item.displayColors ?? []),
  ]
    .map((value) => normalizedText(value))
    .filter(Boolean);
  if (rawDisplayColors.length <= 1) return false;
  const rawUnique = new Set(rawDisplayColors);
  const familyUnique = new Set(rawDisplayColors.map(colorFamilyFromText));
  return rawUnique.size !== rawDisplayColors.length || familyUnique.size > 3;
}

function countFamilies(items: StylingItem[]): Map<StylingColorFamily, number> {
  const counts = new Map<StylingColorFamily, number>();
  for (const item of items) {
    const families = colorFamiliesForItem(item);
    if (!families.length) {
      counts.set("unknown", (counts.get("unknown") ?? 0) + 1);
      continue;
    }
    for (const family of families) {
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
  }
  return counts;
}

function containsAll(
  families: Set<StylingColorFamily>,
  values: StylingColorFamily[],
): boolean {
  return values.every((value) => families.has(value));
}

function inferPaletteLabel(
  families: Set<StylingColorFamily>,
  dominantColors: StylingColorFamily[],
  accentColors: StylingColorFamily[],
): string {
  if (!dominantColors.length) return "Unknown palette";
  if (containsAll(families, ["black", "white"])) return "Black and white";
  if (containsAll(families, ["navy", "beige"])) return "Navy and beige";
  if (containsAll(families, ["brown", "cream"])) return "Brown and cream";
  if (families.size <= 2 && dominantColors.length === 1) {
    return `Tonal ${dominantColors[0]}`;
  }
  if (accentColors.length === 1) return "Neutral with accent";
  if (dominantColors.every((family) => NEUTRAL_FAMILIES.has(family))) {
    return "Neutral palette";
  }
  return "Mixed palette";
}

export function scoreOutfitColors(items: StylingItem[]): ColorEngineResult {
  const warnings: string[] = [];
  const colorNotes: string[] = [];
  const familyCounts = countFamilies(items);
  const knownFamilies: StylingColorFamily[] = Array.from(familyCounts.keys()).filter(
    (family) => family !== "unknown",
  );
  const uniqueFamilies: Set<StylingColorFamily> = new Set(knownFamilies);
  const neutralCount = knownFamilies.filter((family) =>
    NEUTRAL_FAMILIES.has(family)
  ).length;
  const saturatedFamilies = uniqueList(
    knownFamilies.filter((family) => SATURATED_FAMILIES.has(family)),
  );
  const accentColors = saturatedFamilies.filter(
    (family) => !NEUTRAL_FAMILIES.has(family),
  );
  const unknownCount = familyCounts.get("unknown") ?? 0;
  const confusingDisplayCount = items.filter(hasConfusingDisplayColors).length;
  let score = 72;

  if (!items.length) {
    return {
      colorScore: 0,
      paletteLabel: "Unknown palette",
      colorNotes: ["No outfit items were available to score."],
      dominantColors: [],
      accentColors: [],
      warnings: ["Missing outfit items."],
    };
  }

  if (knownFamilies.length === 0) {
    // Unknown-heavy palettes are not a style failure, but they should not look
    // as confident as palettes with usable color metadata.
    score -= 18;
    warnings.push("Color metadata is missing for this outfit.");
  } else if (unknownCount / items.length > 0.5) {
    score -= 8;
    warnings.push("Several pieces have unknown color metadata.");
  }

  if (confusingDisplayCount > 0) {
    // Repeated or overly broad display colors make the UI and scoring less
    // trustworthy, so this is a small metadata-quality penalty.
    score -= Math.min(10, confusingDisplayCount * 4);
    warnings.push("Some pieces have confusing display color metadata.");
  }

  if (neutralCount >= 2 && accentColors.length <= 1) {
    // A neutral base with one controlled accent is the most reliable wearable
    // color structure across casual and polished outfits.
    score += 13;
    colorNotes.push("Neutral base with controlled accent energy.");
  }

  if (uniqueFamilies.size <= 2 && knownFamilies.length >= 2) {
    // Tonal looks usually read intentional even when the pieces are simple.
    score += 10;
    colorNotes.push("Tonal palette keeps the outfit cohesive.");
  }

  if (
    containsAll(uniqueFamilies, ["black", "white"]) ||
    containsAll(uniqueFamilies, ["navy", "beige"]) ||
    containsAll(uniqueFamilies, ["brown", "cream"]) ||
    containsAll(uniqueFamilies, ["blue", "white"])
  ) {
    // Classic combinations get a small lift because they tend to photograph
    // cleanly and are easy to wear without extra explanation.
    score += 8;
    colorNotes.push("Classic color pairing gives it a proven base.");
  }

  if (
    COMPLEMENTARY_PAIRS.some(([a, b]) => uniqueFamilies.has(a) && uniqueFamilies.has(b)) &&
    saturatedFamilies.length <= 2
  ) {
    // Complementary colors can work well when the palette stays edited.
    score += 4;
    colorNotes.push("Complementary color tension is controlled.");
  }

  if (saturatedFamilies.length >= 3 && neutralCount < 2) {
    // Three unrelated saturated families with no neutral anchor usually reads
    // noisy rather than expressive.
    score -= saturatedFamilies.length >= 4 ? 32 : 24;
    warnings.push("Too many unrelated saturated colors are competing.");
  } else if (saturatedFamilies.length >= 3) {
    score -= 10;
    warnings.push("The palette is colorful and needs careful styling.");
  }

  if (knownFamilies.includes("multicolor") && uniqueFamilies.size >= 4) {
    score -= 8;
    warnings.push("Multicolor pieces add extra palette complexity.");
  }

  const sortedColors = Array.from(familyCounts.entries())
    .filter(([family]) => family !== "unknown")
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([family]) => family);
  const dominantColors = sortedColors.slice(0, 3);
  const paletteLabel = inferPaletteLabel(
    uniqueFamilies,
    dominantColors,
    accentColors,
  );

  if (!colorNotes.length) {
    colorNotes.push(
      knownFamilies.length
        ? "Palette is wearable, with moderate cohesion."
        : "Palette confidence is low until colors are added.",
    );
  }

  const denimWhite =
    uniqueFamilies.has("white") &&
    items.some((item) => {
      const text = itemText(item);
      return /\b(denim|jean|jeans)\b/.test(text) &&
        colorFamiliesForItem(item).some((family) => family === "blue" || family === "navy");
    });
  if (denimWhite) {
    score += 5;
    colorNotes.push("Denim and white keeps it classic.");
  }

  return {
    colorScore: clampScore(score),
    paletteLabel,
    colorNotes: uniqueList(colorNotes).slice(0, 3),
    dominantColors,
    accentColors: accentColors.slice(0, 3),
    warnings: uniqueList(warnings),
  };
}
