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

export type StylingItemRole =
  | "top"
  | "bottom"
  | "footwear"
  | "outerwear"
  | "accessory"
  | "one_piece"
  | "unknown";

export type StylingItem = {
  id?: string | null;
  role?: StylingItemRole | "shoes" | null;
  source?: "closet" | "suggested" | "unknown" | null;
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
  colors?: string[] | null;
  aiColors?: string[] | null;
  primaryColor?: string | null;
  displayColor?: string | null;
  displayColors?: string[] | null;
  colorLabel?: string | null;
  aiColorLabel?: string | null;
  material?: string | null;
  materials?: string[] | null;
  pattern?: string | null;
  fit?: string | null;
  rise?: string | null;
  legShape?: string | null;
  sleeveLength?: string | null;
  neckline?: string | null;
  collar?: string | null;
  closure?: string | null;
  length?: string | null;
  occasionTags?: string[] | null;
  seasonTags?: string[] | null;
  style?: string | null;
  aestheticTags?: string[] | null;
  detailTags?: string[] | null;
  formality?: string | null;
  formalityScore?: number | null;
  visualWeight?: string | null;
};

export type StylingIntent = {
  requestText?: string | null;
  occasion?: string | null;
  vibe?: string | null;
  formalityTarget?: number | null;
};

export type StylingIntentInput = string | StylingIntent | null | undefined;

export type FitEngineResult = {
  fitScore: number;
  fitNotes: string[];
  silhouetteLabel: string;
  warnings: string[];
};

export type ColorEngineResult = {
  colorScore: number;
  paletteLabel: string;
  colorNotes: string[];
  dominantColors: StylingColorFamily[];
  accentColors: StylingColorFamily[];
  warnings: string[];
};

export type StyleIdentityResult = {
  styleScore: number;
  styleIdentity: StyleIdentityLabel;
  styleNotes: string[];
  occasionFit: number;
  confidence: number;
};

export type StylingScoreResult = {
  overallScore: number;
  fitScore: number;
  colorScore: number;
  styleScore: number;
  occasionFit: number;
  scoreLabel: string;
  bestUseCase: string;
  stylingNotes: string[];
  warnings: string[];
  styleIdentity: StyleIdentityLabel;
  paletteLabel: string;
  silhouetteLabel: string;
  fit: FitEngineResult;
  color: ColorEngineResult;
  style: StyleIdentityResult;
};

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function normalizedText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueList<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

export function parseStylingIntent(intent?: StylingIntentInput): StylingIntent {
  if (typeof intent === "string") {
    return {requestText: intent};
  }
  if (!intent || typeof intent !== "object") {
    return {};
  }
  return intent;
}

export function roleForStylingItem(item: StylingItem): StylingItemRole {
  const explicit = normalizedText(item.role);
  if (explicit === "shoes") return "footwear";
  if (
    explicit === "top" ||
    explicit === "bottom" ||
    explicit === "footwear" ||
    explicit === "outerwear" ||
    explicit === "accessory" ||
    explicit === "one piece" ||
    explicit === "one_piece"
  ) {
    return explicit === "one piece" ? "one_piece" : (explicit as StylingItemRole);
  }

  const text = normalizedText([
    item.category,
    item.subCategory,
    item.type,
    item.name,
  ].filter(Boolean).join(" "));

  if (/\b(dress|jumpsuit|romper|one piece|matching set)\b/.test(text)) {
    return "one_piece";
  }
  if (/\b(jacket|coat|blazer|hoodie|cardigan|outerwear|overshirt|trench|parka|bomber)\b/.test(text)) {
    return "outerwear";
  }
  if (/\b(pants|jeans|trousers|shorts|skirt|cargo|chino|jogger|bottom)\b/.test(text)) {
    return "bottom";
  }
  if (/\b(shoe|sneaker|boot|loafer|heel|sandal|slide|oxford|derby|footwear)\b/.test(text)) {
    return "footwear";
  }
  if (/\b(bag|belt|watch|jewelry|jewellery|hat|cap|sunglasses|scarf|accessory)\b/.test(text)) {
    return "accessory";
  }
  if (/\b(tee|t shirt|shirt|top|sweater|sweatshirt|blouse|tank|polo)\b/.test(text)) {
    return "top";
  }
  return "unknown";
}

export function itemText(item: StylingItem): string {
  return normalizedText([
    item.name,
    item.brand,
    item.category,
    item.subCategory,
    item.type,
    item.material,
    ...(item.materials ?? []),
    item.pattern,
    item.fit,
    item.rise,
    item.legShape,
    item.sleeveLength,
    item.neckline,
    item.collar,
    item.closure,
    item.length,
    ...(item.occasionTags ?? []),
    ...(item.seasonTags ?? []),
    item.style,
    ...(item.aestheticTags ?? []),
    ...(item.detailTags ?? []),
    item.formality,
    item.visualWeight,
  ].filter(Boolean).join(" "));
}
