import { Timestamp } from "firebase-admin/firestore";
import {
  type ClosetItemDocument,
  type ClosetItemIntelligenceCategory,
  type ClosetItemIntelligenceFit,
  type NormalizedClosetItemMetadata,
} from "./types";

const COLOR_ALIASES: Record<string, string> = {
  grey: "gray",
  charcoal: "gray",
  offwhite: "white",
  "off white": "white",
  ivory: "cream",
  ecru: "cream",
  oatmeal: "cream",
  camel: "tan",
  stone: "beige",
  "light wash": "blue",
  denim: "blue",
  burgundy: "red",
  maroon: "red",
};

const COLOR_NAMES = [
  "black",
  "white",
  "gray",
  "navy",
  "blue",
  "green",
  "olive",
  "red",
  "brown",
  "beige",
  "tan",
  "khaki",
  "cream",
  "gold",
  "silver",
  "yellow",
  "orange",
  "pink",
  "purple",
  "metallic",
  "multicolor",
] as const;

const GENERATED_TEXT_FIELDS = [
  "name",
  "title",
  "brand",
  "category",
  "subCategory",
  "subcategory",
  "type",
  "style",
  "pattern",
  "material",
  "fit",
  "graphicText",
  "motif",
  "collaborationName",
] as const;

const FOOTWEAR_PATTERN = /\b(shoes?|footwear|sneakers?|boots?|loafers?|penny loafers?|sandals?|slides?|heels?|oxford shoes?|derb(?:y|ies)|dress shoes?|formal shoes?|air force|air max|reactx|rejuven8|nike shoes|zara shoes)\b/;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseBrand(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => {
      if (part.includes(".") || part.includes("&")) return part;
      if (part.length <= 3 && part === part.toUpperCase()) return part;
      if (/[A-Z]/.test(part.slice(1))) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function stringValue(item: ClosetItemDocument, keys: readonly string[]): string {
  for (const key of keys) {
    const text = normalizeDisplayText(item[key]);
    if (text) return text;
  }
  return "";
}

function collectStrings(values: unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      out.push(...collectStrings(value));
      continue;
    }
    const text = normalizeText(value);
    if (text) out.push(text);
  }
  return out;
}

function uniqueSorted(values: unknown[], limit = 20): string[] {
  return [...new Set(collectStrings(values))]
    .filter((value) => value !== "unknown" && value !== "null" && value !== "undefined")
    .sort((left, right) => left.localeCompare(right))
    .slice(0, limit);
}

function toNumberRange(value: unknown, min: number, max: number): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeCategory(item: ClosetItemDocument): ClosetItemIntelligenceCategory {
  const text = normalizeText([
    item.category,
    item.subCategory,
    item.subcategory,
    item.type,
    item.name,
    item.title,
  ].filter(Boolean).join(" "));

  if (!text) return "unknown";
  if (FOOTWEAR_PATTERN.test(text)) return "shoes";
  if (/\b(jacket|coat|outerwear|blazer|cardigan|shacket|shirt jacket|shirt-jacket|trench|parka|bomber|racer jacket|puffer)\b/.test(text)) {
    return "outerwear";
  }
  if (/\b(oxford shirt|linen shirt|resort shirt|button shirt|button down|button-down|camp collar shirt|utility shirt|short sleeved utility shirt|short-sleeved utility shirt|polo|knit polo|football shirt|jersey|top|tee|t shirt|tshirt|shirt|sweater|sweatshirt|hoodie|blouse|tank|kurta)\b/.test(text)) {
    return "top";
  }
  if (/\b(pants|jeans|trousers|shorts|skirt|cargo|cargos|chinos|joggers|bottom|track pants|trackpants)\b/.test(text)) {
    return "bottom";
  }
  if (/\b(bag|handbag|tote|belt|watch|hat|cap|sunglasses|glasses|necklace|bracelet|ring|earrings|scarf|socks|perfume|accessory|accessories|jewelry|jewellery)\b/.test(text)) {
    return "accessory";
  }
  if (/\b(dress|jumpsuit|romper|one piece|one_piece|matching set|set)\b/.test(text)) return "one_piece";
  return "unknown";
}

function shoeSubcategory(text: string): string | undefined {
  if (/\b(penny loafers?|loafers?)\b/.test(text)) return "loafer";
  if (/\b(air force|air max|sneakers?)\b/.test(text)) return "sneaker";
  if (/\b(reactx|rejuven8|sandals?|slides?)\b/.test(text)) return "sandal";
  if (/\b(boots?)\b/.test(text)) return "boot";
  if (/\b(oxfords?)\b/.test(text)) return "oxford";
  if (/\b(derb(?:y|ies))\b/.test(text)) return "derby";
  if (/\b(dress shoes?|formal shoes?)\b/.test(text)) return "formal_shoe";
  return undefined;
}

function inferSubcategory(item: ClosetItemDocument, category: ClosetItemIntelligenceCategory): string | undefined {
  const explicit = normalizeText(item.subCategory ?? item.subcategory ?? item.type);
  const text = normalizeText([item.name, item.title, item.category, item.type, item.subCategory, item.subcategory].filter(Boolean).join(" "));
  if (category === "shoes") {
    return shoeSubcategory(`${explicit} ${text}`) ?? (explicit && explicit !== "shoes" && explicit !== "footwear" ? explicit : undefined);
  }
  if (explicit && explicit !== category && explicit !== "footwear") return explicit;

  const candidates: Record<ClosetItemIntelligenceCategory, string[]> = {
    top: ["hoodie", "oxford shirt", "linen shirt", "resort shirt", "camp collar shirt", "utility shirt", "football shirt", "jersey", "shirt", "tshirt", "tee", "polo", "sweater", "sweatshirt", "blouse", "tank"],
    bottom: ["jeans", "trousers", "pants", "shorts", "skirt", "cargo", "chinos", "joggers"],
    shoes: ["loafer", "sneaker", "boot", "sandal", "slide", "heel", "oxford", "derby", "formal shoe"],
    outerwear: ["jacket", "coat", "blazer", "cardigan", "overshirt", "trench", "parka", "bomber"],
    accessory: ["watch", "belt", "bag", "hat", "cap", "sunglasses", "necklace", "bracelet", "scarf", "socks"],
    one_piece: ["dress", "jumpsuit", "romper", "matching set", "set"],
    unknown: [],
  };

  const match = candidates[category].find((candidate) => text.includes(candidate));
  return match ? match.replace(/\s+/g, "_") : undefined;
}

function normalizeColor(value: string): string | null {
  const cleaned = normalizeText(value).replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.startsWith("#")) return null;
  const alias = COLOR_ALIASES[cleaned] ?? cleaned;
  if ((COLOR_NAMES as readonly string[]).includes(alias)) return alias;
  const found = COLOR_NAMES.find((color) => alias.split(" ").includes(color) || alias.includes(color));
  return found ?? null;
}

function normalizeColors(item: ClosetItemDocument): string[] {
  const raw = collectStrings([
    item.primaryColor,
    item.displayColor,
    item.colorLabel,
    item.aiColorLabel,
    item.colors,
    item.displayColors,
    item.aiColors,
    item.pixelColors,
  ]);
  const fromText = normalizeText([item.name, item.title].filter(Boolean).join(" "))
    .split(" ")
    .map((token) => normalizeColor(token))
    .filter((value): value is string => Boolean(value));
  return [...new Set([...raw.map(normalizeColor), ...fromText].filter((value): value is string => Boolean(value)))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 6);
}

function normalizeFit(value: unknown, text: string): ClosetItemIntelligenceFit {
  const fit = normalizeText(value);
  const source = `${fit} ${text}`;
  if (/\b(oversized|boxy)\b/.test(source)) return "oversized";
  if (/\b(relaxed|loose|wide)\b/.test(source)) return "relaxed";
  if (/\b(slim|skinny|tailored|fitted)\b/.test(source)) return "slim";
  if (/\b(regular|straight|classic)\b/.test(source)) return "regular";
  return "unknown";
}

function inferFormality(item: ClosetItemDocument, category: ClosetItemIntelligenceCategory, text: string): number {
  const numeric =
    toNumberRange(item.formalityScore, 1, 5) ??
    toNumberRange(item.formality, 1, 5);
  if (numeric) return numeric;

  const formality = normalizeText(item.formality);
  if (formality === "formal") return 5;
  if (formality === "smart casual" || formality === "smart_casual" || formality === "party") return 3;
  if (formality === "athletic" || formality === "lounge" || formality === "streetwear" || formality === "casual") return 1;

  if (/\b(tuxedo|suit)\b/.test(text)) return 5;
  if (/\b(blazer|formal jacket)\b/.test(text)) return 4;
  if (category === "shoes" && /\b(loafer|loafers|penny loafer|derby|derbies|oxford|oxfords|dress shoe|dress shoes|formal shoe|formal shoes)\b/.test(text)) {
    return 4;
  }
  if (/\b(button shirt|button down|button-down|oxford shirt|dress shirt|polo|knit polo)\b/.test(text)) return 3;
  if (/\b(straight trousers|tailored pants|tailored trousers|trousers|chinos)\b/.test(text)) return 3;
  if (category === "shoes" && /\b(clean|minimal|plain|leather)\b/.test(text) && /\b(sneaker|sneakers)\b/.test(text)) return 3;
  if (category === "shoes" && /\b(running|gym|athletic|training)\b/.test(text) && /\b(sneaker|sneakers|shoes?)\b/.test(text)) return 1;
  if (/\b(graphic tee|graphic t shirt|graphic tshirt|tank|tank top|vest top|sleeveless)\b/.test(text)) return 1;
  if (category === "shoes" && /\b(sandal|sandals|slide|slides)\b/.test(text)) return 1;
  if (category === "shoes" && /\b(sneaker|sneakers|air force|air max|reactx|rejuven8)\b/.test(text)) return 2;
  if (/\b(dark clean jeans|dark denim|clean dark jeans|smart casual jeans)\b/.test(text)) return 2;
  if (/\b(jeans|denim|tee|tshirt|t shirt|hoodie|sweatshirt|jogger|cargo)\b/.test(text)) return 1;
  if (/\b(shirt|boot|boots)\b/.test(text)) return 2;
  return category === "accessory" ? 2 : 2;
}

function inferWarmth(item: ClosetItemDocument, category: ClosetItemIntelligenceCategory, text: string): number {
  const numeric =
    toNumberRange(item.warmthScore, 1, 5) ??
    toNumberRange(item.warmthPreference, 1, 5);
  if (numeric) return numeric;

  const warmth = normalizeText(item.warmth);
  if (warmth === "heavy") return 5;
  if (warmth === "medium") return 3;
  if (warmth === "light") return 1;

  if (/\b(parka|puffer|wool coat|down|fleece|heavyweight)\b/.test(text)) return 5;
  if (/\b(hoodie|sweater|sweatshirt|cardigan|jacket|coat|flannel)\b/.test(text)) return 4;
  if (/\b(oxford|shirt|denim|jeans|trousers|chinos|leather|loafer|loafers|boot|boots)\b/.test(text)) return 2;
  if (/\b(shorts|linen|tank|sandal|slide|slides)\b/.test(text)) return 1;
  return category === "outerwear" ? 4 : 2;
}

function inferStyleTags(item: ClosetItemDocument, category: ClosetItemIntelligenceCategory, text: string): string[] {
  const tags = uniqueSorted([
    item.style,
    item.aestheticTags,
    item.detailTags,
    item.pattern,
  ], 12);
  if (/\b(hoodie|sneaker|sneakers|cargo|graphic|logo)\b/.test(text)) tags.push("streetwear", "casual");
  if (/\b(oxford|button down|button-down|loafer|loafers|blazer|chinos)\b/.test(text)) tags.push("smart casual", "classic");
  if (/\b(black|white|plain|solid|minimal)\b/.test(text)) tags.push("minimal");
  if (category === "shoes" && /\b(leather|loafer|loafers|derby|oxford)\b/.test(text)) tags.push("formal");
  return uniqueSorted(tags, 12);
}

function inferOccasionTags(item: ClosetItemDocument, text: string, formality: number): string[] {
  const tags = uniqueSorted([item.occasionTags], 12);
  if (/\b(hoodie|sweatshirt|sneaker|sneakers|cargo|tee|tshirt)\b/.test(text)) {
    tags.push("casual", "class", "errands");
  }
  if (/\b(oxford|button down|button-down|loafer|loafers|blazer|trousers)\b/.test(text) || formality >= 3) {
    tags.push("smart casual", "office", "dinner");
  }
  if (formality >= 4) tags.push("formal");
  return uniqueSorted(tags, 12);
}

function inferSeasonTags(item: ClosetItemDocument, warmth: number): string[] {
  const tags = uniqueSorted([item.seasonTags], 8);
  if (warmth >= 4) tags.push("fall", "winter");
  if (warmth === 3) tags.push("spring", "fall");
  if (warmth <= 2) tags.push("spring", "summer");
  return uniqueSorted(tags, 8);
}

function inferWeatherTags(item: ClosetItemDocument, warmth: number): string[] {
  const tags = uniqueSorted([item.weatherTags], 8);
  if (warmth >= 4) tags.push("cool", "cold");
  if (warmth === 3) tags.push("mild", "cool");
  if (warmth <= 2) tags.push("warm", "mild");
  return uniqueSorted(tags, 8);
}

function confidenceFor(item: ClosetItemDocument, colors: string[], category: ClosetItemIntelligenceCategory): number {
  let score = 0.35;
  if (category !== "unknown") score += 0.15;
  if (colors.length) score += 0.1;
  if (stringValue(item, ["name", "title"])) score += 0.1;
  if (stringValue(item, ["brand"])) score += 0.08;
  if (stringValue(item, ["material"]) || Array.isArray(item.materials)) score += 0.08;
  if (Array.isArray(item.occasionTags) || Array.isArray(item.seasonTags) || Array.isArray(item.aestheticTags)) {
    score += 0.08;
  }
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function searchAliases(item: ClosetItemDocument, metadata: Omit<NormalizedClosetItemMetadata, "searchAliases" | "updatedAt">): string[] {
  const name = normalizeText(stringValue(item, ["name", "title"]));
  const brand = normalizeText(metadata.brand);
  const subcategory = normalizeText(metadata.subcategory);
  const aliases = [
    name,
    brand && subcategory ? `${brand} ${subcategory}` : "",
    metadata.colors.length && subcategory ? `${metadata.colors.join(" ")} ${subcategory}` : "",
    metadata.category,
    subcategory,
    ...metadata.styleTags,
    ...metadata.occasionTags,
  ];
  return uniqueSorted(aliases, 16);
}

export function normalizeClosetItemMetadata(item: ClosetItemDocument): NormalizedClosetItemMetadata {
  const text = normalizeText(GENERATED_TEXT_FIELDS.map((field) => item[field]).filter(Boolean).join(" "));
  const category = normalizeCategory(item);
  const colors = normalizeColors(item);
  const fit = normalizeFit(item.fit, text);
  const formality = inferFormality(item, category, text);
  const warmth = inferWarmth(item, category, text);
  const brand = stringValue(item, ["brand"]);
  const material =
    normalizeText(item.material) ||
    uniqueSorted([item.materials], 4).join(" ") ||
    undefined;

  const base = {
    category,
    subcategory: inferSubcategory(item, category),
    ...(brand ? { brand: titleCaseBrand(brand) } : {}),
    colors,
    ...(material ? { material } : {}),
    fit,
    formality,
    warmth,
    styleTags: inferStyleTags(item, category, text),
    occasionTags: inferOccasionTags(item, text, formality),
    seasonTags: inferSeasonTags(item, warmth),
    weatherTags: inferWeatherTags(item, warmth),
    confidence: confidenceFor(item, colors, category),
    source: "deterministic" as const,
  };

  return {
    ...base,
    searchAliases: searchAliases(item, base),
    updatedAt: Timestamp.now(),
  };
}
