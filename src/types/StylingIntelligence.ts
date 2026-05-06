export type StylingColorFamily =
  | "black"
  | "white"
  | "gray"
  | "navy"
  | "blue"
  | "brown"
  | "beige"
  | "cream"
  | "green"
  | "red"
  | "pink"
  | "purple"
  | "yellow"
  | "orange"
  | "metallic"
  | "multicolor"
  | "unknown";

export type StyleIdentityLabel =
  | "clean_luxury"
  | "streetwear"
  | "smart_casual"
  | "minimal"
  | "sporty"
  | "formal"
  | "date_night"
  | "vacation"
  | "rave_techno"
  | "college_casual"
  | "casual"
  | "mixed";

export type StylingIntelligenceSummary = {
  overallScore: number;
  fitScore: number;
  colorScore: number;
  styleScore: number;
  occasionFit?: number;
  scoreLabel: string;
  bestUseCase?: string;
  stylingNotes?: string[];
  warnings?: string[];
  styleIdentity: StyleIdentityLabel;
  paletteLabel: string;
  silhouetteLabel: string;
};
