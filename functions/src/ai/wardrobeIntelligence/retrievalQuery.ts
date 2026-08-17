import type { NormalizedWardrobeRetrievalInput, WardrobeRetrievalFormality } from "./retrievalTypes";

const MAX_RETRIEVAL_QUERY_TEXT_LENGTH = 1000;

const CATEGORY_SYNONYMS: Record<string, string[]> = {
  top: ["tops", "shirts", "tees", "knits", "polos"],
  bottom: ["bottoms", "trousers", "pants", "jeans", "shorts", "skirts"],
  footwear: ["shoes", "sneakers", "loafers", "boots", "sandals"],
  shoes: ["footwear", "sneakers", "loafers", "boots", "sandals"],
  outerwear: ["jackets", "coats", "blazers", "overshirts", "layers"],
  accessory: ["accessories", "bags", "belts", "watches", "hats"],
  one_piece: ["dresses", "jumpsuits", "rompers", "matching sets"],
};

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayFormality(value: WardrobeRetrievalFormality): string {
  return value === "smart_casual" ? "smart casual" : value;
}

function pushUnique(target: string[], values: string[]) {
  for (const value of values) {
    const text = cleanText(value).toLowerCase();
    if (text && !target.includes(text)) target.push(text);
  }
}

function clampText(text: string): string {
  if (text.length <= MAX_RETRIEVAL_QUERY_TEXT_LENGTH) return text;
  const sliced = text.slice(0, MAX_RETRIEVAL_QUERY_TEXT_LENGTH - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, lastSpace > 800 ? lastSpace : sliced.length).trim()}.`;
}

export function buildWardrobeRetrievalQueryText(input: NormalizedWardrobeRetrievalInput): string {
  const query = cleanText(input.query);
  const occasion = cleanText(input.occasion);
  const weather = cleanText(input.weather);
  const categories = input.categories.map(cleanText).filter(Boolean);
  const colors = input.colors.map(cleanText).filter(Boolean);
  const styleTags = input.styleTags.map(cleanText).filter(Boolean);
  const searchableText = [
    query,
    occasion,
    weather,
    input.formality,
    categories.join(" "),
    colors.join(" "),
    styleTags.join(" "),
  ].join(" ").toLowerCase();
  const expansions: string[] = [];

  if (/\b(office|work|professional|business|meeting|presentation|smart casual|smart_casual)\b/.test(searchableText)) {
    pushUnique(expansions, [
      "clean",
      "polished",
      "professional",
      "smart casual",
      "trousers",
      "loafers",
      "button shirts",
      "polos",
      "overshirts",
      "minimal sneakers",
    ]);
  }
  if (/\b(summer|beach|hot|warm|vacation|resort|pool|coastal)\b/.test(searchableText)) {
    pushUnique(expansions, [
      "breathable",
      "light",
      "linen",
      "cotton",
      "relaxed",
      "sandals",
      "resort shirts",
      "shorts",
      "vacation",
    ]);
  }
  if (/\b(rain|rainy|storm|wet|drizzle)\b/.test(searchableText)) {
    pushUnique(expansions, [
      "water resistant",
      "boots",
      "outerwear",
      "jacket",
      "layers",
      "practical",
    ]);
  }
  if (/\b(date|dinner|night out|evening|restaurant)\b/.test(searchableText)) {
    pushUnique(expansions, [
      "elevated",
      "polished",
      "dark denim",
      "loafers",
      "jacket",
      "statement accessories",
    ]);
  }
  if (/\b(streetwear|street|sneaker|sneakers|hoodie|cargo|graphic)\b/.test(searchableText)) {
    pushUnique(expansions, [
      "hoodie",
      "graphic tee",
      "cargos",
      "sneakers",
      "oversized",
      "layered",
      "casual",
    ]);
  }
  if (/\b(black).*\b(shoe|shoes|footwear|sneaker|sneakers|loafer|loafers|boot|boots)\b/.test(searchableText) ||
      /\b(shoe|shoes|footwear|sneaker|sneakers|loafer|loafers|boot|boots).*\bblack\b/.test(searchableText)) {
    pushUnique(expansions, [
      "black",
      "leather",
      "loafers",
      "boots",
      "sneakers",
      "footwear",
    ]);
  }

  if (input.formality === "formal") {
    pushUnique(expansions, ["dress shirt", "blazer", "trousers", "leather shoes", "polished"]);
  }
  if (input.formality === "casual") {
    pushUnique(expansions, ["tee", "denim", "sneakers", "relaxed", "easy"]);
  }

  for (const category of categories) {
    pushUnique(expansions, CATEGORY_SYNONYMS[category.toLowerCase()] ?? []);
  }

  const parts = [`Request: ${query}.`];
  if (occasion) parts.push(`Occasion: ${occasion}.`);
  if (input.formality !== "any") parts.push(`Formality: ${displayFormality(input.formality)}.`);
  if (weather) parts.push(`Weather: ${weather}.`);
  if (categories.length) parts.push(`Categories: ${categories.join(", ")}.`);
  if (colors.length) parts.push(`Colors: ${colors.join(", ")}.`);
  if (styleTags.length) parts.push(`Requested style tags: ${styleTags.join(", ")}.`);
  if (expansions.length) parts.push(`Style: ${expansions.join(", ")}.`);

  return clampText(parts.join(" "));
}
