import { scoreOutfitStyling } from "./stylingScore";
import type { StylingItem, StylingScoreResult } from "./types";

type StylingFixture = {
  name: string;
  intent: string;
  items: StylingItem[];
  expected: {
    minOverall?: number;
    maxOverall?: number;
    styleIdentity?: StylingScoreResult["styleIdentity"];
    paletteLabelIncludes?: string;
    warningIncludes?: string;
  };
};

function item(input: StylingItem): StylingItem {
  return {
    source: "closet",
    ...input,
  };
}

export const STYLING_ENGINE_FIXTURES: StylingFixture[] = [
  {
    name: "black tee + blue jeans + white sneakers",
    intent: "casual everyday outfit",
    items: [
      item({id: "tee", role: "top", name: "Black tee", category: "top", colors: ["black"], fit: "regular", pattern: "solid"}),
      item({id: "jeans", role: "bottom", name: "Blue jeans", category: "bottom", colors: ["blue"], fit: "straight", material: "denim"}),
      item({id: "sneakers", role: "footwear", name: "White sneakers", category: "shoes", colors: ["white"], fit: "regular"}),
    ],
    expected: {minOverall: 76, styleIdentity: "casual"},
  },
  {
    name: "oversized hoodie + slim jeans + sneakers",
    intent: "streetwear campus outfit",
    items: [
      item({id: "hoodie", role: "top", name: "Oversized hoodie", category: "top", colors: ["gray"], fit: "oversized"}),
      item({id: "jeans", role: "bottom", name: "Slim jeans", category: "bottom", colors: ["blue"], fit: "slim", material: "denim"}),
      item({id: "sneakers", role: "footwear", name: "Sneakers", category: "shoes", colors: ["white"]}),
    ],
    expected: {minOverall: 78, styleIdentity: "streetwear"},
  },
  {
    name: "blazer + shirt + trousers + loafers",
    intent: "smart casual work dinner",
    items: [
      item({id: "blazer", role: "outerwear", name: "Navy blazer", category: "outerwear", colors: ["navy"], fit: "regular", material: "wool"}),
      item({id: "shirt", role: "top", name: "White shirt", category: "top", colors: ["white"], fit: "slim"}),
      item({id: "trousers", role: "bottom", name: "Gray trousers", category: "bottom", colors: ["gray"], fit: "straight"}),
      item({id: "loafers", role: "footwear", name: "Brown loafers", category: "shoes", colors: ["brown"], material: "leather"}),
    ],
    expected: {minOverall: 82, styleIdentity: "smart_casual"},
  },
  {
    name: "red hoodie + green pants + blue shoes",
    intent: "casual outfit",
    items: [
      item({id: "hoodie", role: "top", name: "Red hoodie", category: "top", colors: ["red"], fit: "regular"}),
      item({id: "pants", role: "bottom", name: "Green pants", category: "bottom", colors: ["green"], fit: "regular"}),
      item({id: "shoes", role: "footwear", name: "Blue shoes", category: "shoes", colors: ["blue"]}),
    ],
    expected: {maxOverall: 70, warningIncludes: "saturated colors"},
  },
  {
    name: "hoodie + blazer + running shoes",
    intent: "smart casual dinner",
    items: [
      item({id: "hoodie", role: "top", name: "Heavy hoodie", category: "top", colors: ["gray"], fit: "oversized", material: "fleece"}),
      item({id: "blazer", role: "outerwear", name: "Slim blazer", category: "outerwear", colors: ["navy"], fit: "slim"}),
      item({id: "pants", role: "bottom", name: "Black trousers", category: "bottom", colors: ["black"], fit: "straight"}),
      item({id: "shoes", role: "footwear", name: "Running shoes", category: "shoes", colors: ["white"], style: "athletic running"}),
    ],
    expected: {maxOverall: 76, warningIncludes: "formality"},
  },
];

export function runStylingFixtureChecks(): StylingScoreResult[] {
  return STYLING_ENGINE_FIXTURES.map((fixture) => {
    const result = scoreOutfitStyling(fixture.items, fixture.intent);
    const {expected} = fixture;
    if (expected.minOverall != null && result.overallScore < expected.minOverall) {
      throw new Error(`${fixture.name} scored below ${expected.minOverall}: ${result.overallScore}`);
    }
    if (expected.maxOverall != null && result.overallScore > expected.maxOverall) {
      throw new Error(`${fixture.name} scored above ${expected.maxOverall}: ${result.overallScore}`);
    }
    if (expected.styleIdentity && result.styleIdentity !== expected.styleIdentity) {
      throw new Error(`${fixture.name} style was ${result.styleIdentity}, expected ${expected.styleIdentity}`);
    }
    if (
      expected.paletteLabelIncludes &&
      !result.paletteLabel.toLowerCase().includes(expected.paletteLabelIncludes.toLowerCase())
    ) {
      throw new Error(`${fixture.name} palette was ${result.paletteLabel}`);
    }
    if (
      expected.warningIncludes &&
      !result.warnings.join(" ").toLowerCase().includes(expected.warningIncludes.toLowerCase())
    ) {
      throw new Error(`${fixture.name} warnings were ${result.warnings.join("; ")}`);
    }
    return result;
  });
}
