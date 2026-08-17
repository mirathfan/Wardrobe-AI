export type WardrobeCategoryCounts = {
  tops: number;
  bottoms: number;
  footwear: number;
  outerwear: number;
  accessories: number;
};

export type WardrobeGapSuggestion = {
  label: string;
  reason: string;
  searchQuery?: string;
};

export type WardrobeGap = {
  key: string;
  label: string;
  reason: string;
  severity: "critical" | "notice" | "soft";
  searchQuery?: string;
};

export type WardrobeGapDetection = {
  missingCore: WardrobeGap[];
  weakAreas: WardrobeGap[];
  suggestions: WardrobeGapSuggestion[];
};

function dedupeSuggestions(suggestions: WardrobeGapSuggestion[]) {
  const seen = new Set<string>();
  return suggestions.filter((suggestion) => {
    const key = suggestion.label.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function detectWardrobeGaps(
  categoryCounts: WardrobeCategoryCounts
): WardrobeGapDetection {
  const missingCore: WardrobeGap[] = [];
  const weakAreas: WardrobeGap[] = [];
  const suggestions: WardrobeGapSuggestion[] = [];

  if (categoryCounts.tops === 0) {
    missingCore.push({
      key: "tops",
      label: "Tops",
      reason: "No tops means AURA has almost nothing to build around.",
      severity: "critical",
      searchQuery: "men's essential tops",
    });
  } else if (categoryCounts.tops === 1) {
    weakAreas.push({
      key: "top-variety",
      label: "Top variety",
      reason: "Only one top keeps outfit variation tight.",
      severity: "notice",
      searchQuery: "men's versatile tops",
    });
  }

  if (categoryCounts.bottoms === 0) {
    missingCore.push({
      key: "bottoms",
      label: "Bottoms",
      reason: "No bottoms is a hard wardrobe gap for outfit generation.",
      severity: "critical",
      searchQuery: "men's versatile pants",
    });
  } else if (categoryCounts.bottoms === 1) {
    weakAreas.push({
      key: "bottom-variety",
      label: "Bottom variety",
      reason: "One bottom limits how many distinct outfits AURA can build.",
      severity: "notice",
      searchQuery: "men's everyday pants",
    });
  }

  if (categoryCounts.outerwear === 0) {
    missingCore.push({
      key: "outerwear",
      label: "Outerwear",
      reason: "A layer adds polish and makes simple outfits feel more intentional.",
      severity: "notice",
      searchQuery: "lightweight denim jacket or overshirt",
    });
    suggestions.push({
      label: "Lightweight jacket",
      reason: "A lightweight jacket would instantly level up your outfits.",
      searchQuery: "lightweight denim jacket or overshirt",
    });
  }

  if (categoryCounts.footwear === 0) {
    missingCore.push({
      key: "footwear",
      label: "Shoes",
      reason: "Without shoes in the closet, every outfit has to lean on a suggestion.",
      severity: "critical",
      searchQuery: "versatile men's sneakers",
    });
  } else if (categoryCounts.footwear === 1) {
    missingCore.push({
      key: "footwear-variety",
      label: "Second pair of shoes",
      reason: "A second pair opens up far more outfit range.",
      severity: "notice",
      searchQuery: "white sneakers versatile men's shoes",
    });
    suggestions.push({
      label: "Second pair of shoes",
      reason: "Adding a second pair of shoes would give you more versatility.",
      searchQuery: "white sneakers versatile men's shoes",
    });
  }

  if (categoryCounts.accessories === 0) {
    weakAreas.push({
      key: "accessories",
      label: "Accessories",
      reason: "No accessories makes it harder to finish a look cleanly.",
      severity: "soft",
      searchQuery: "minimal men's watch",
    });
    suggestions.push({
      label: "Minimal watch",
      reason: "A watch or simple accessory would make your outfits feel more complete.",
      searchQuery: "minimal men's watch",
    });
  }

  return {
    missingCore,
    weakAreas,
    suggestions: dedupeSuggestions(suggestions).slice(0, 3),
  };
}
