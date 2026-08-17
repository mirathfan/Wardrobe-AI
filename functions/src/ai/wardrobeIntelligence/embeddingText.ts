import type { ClosetItemDocument, NormalizedClosetItemMetadata } from "./types";

const MAX_EMBEDDING_TEXT_LENGTH = 1000;

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstUsefulString(item: ClosetItemDocument, keys: readonly string[]): string {
  for (const key of keys) {
    const text = cleanText(item[key]);
    if (text) return text;
  }
  return "";
}

function sentence(label: string, value: unknown): string | null {
  if (Array.isArray(value)) {
    const compact = value.map(cleanText).filter(Boolean).join(", ");
    return compact ? `${label}: ${compact}.` : null;
  }
  const text = cleanText(value);
  return text ? `${label}: ${text}.` : null;
}

function clampText(text: string): string {
  if (text.length <= MAX_EMBEDDING_TEXT_LENGTH) return text;
  const sliced = text.slice(0, MAX_EMBEDDING_TEXT_LENGTH - 1);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, lastSpace > 800 ? lastSpace : sliced.length).trim()}.`;
}

export function buildClosetItemEmbeddingText(
  item: ClosetItemDocument,
  aiMetadata: NormalizedClosetItemMetadata,
): string {
  const name = firstUsefulString(item, ["name", "title"]);
  const notes = firstUsefulString(item, ["notes", "productDescription"]);
  const parts = [
    sentence("Category", aiMetadata.category),
    sentence("Subcategory", aiMetadata.subcategory),
    sentence("Name", name),
    sentence("Brand", aiMetadata.brand),
    sentence("Colors", aiMetadata.colors),
    sentence("Fit", aiMetadata.fit !== "unknown" ? aiMetadata.fit : ""),
    sentence("Material", aiMetadata.material),
    sentence("Style", aiMetadata.styleTags),
    sentence("Occasions", aiMetadata.occasionTags),
    sentence("Seasons", aiMetadata.seasonTags),
    sentence("Weather", aiMetadata.weatherTags),
    `Formality: ${aiMetadata.formality}/5.`,
    `Warmth: ${aiMetadata.warmth}/5.`,
    sentence("Aliases", aiMetadata.searchAliases.slice(0, 8)),
    sentence("Notes", notes),
  ].filter((part): part is string => Boolean(part));

  return clampText(parts.join(" "));
}
