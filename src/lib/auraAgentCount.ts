const COUNT_WORDS: Record<string, number> = {
  one: 1,
  single: 1,
  two: 2,
  couple: 2,
  three: 3,
  few: 3,
  four: 4,
  five: 5,
};

const COUNT_TARGET_RE = "(?:outfits?|looks?|options?|fits?)";
const BETWEEN_WORDS_RE = "(?:\\s+[a-z]+){0,3}";
const NUMBER_COUNT_RE = new RegExp(`\\b(\\d{1,2})${BETWEEN_WORDS_RE}\\s+${COUNT_TARGET_RE}\\b`, "i");
const WORD_COUNT_RE = new RegExp(
  `\\b(?:a\\s+)?(${Object.keys(COUNT_WORDS).join("|")})${BETWEEN_WORDS_RE}\\s+${COUNT_TARGET_RE}\\b`,
  "i",
);

function clampRequestedCount(count: number) {
  return Math.max(1, Math.min(5, Math.round(count)));
}

export function extractRequestedOutfitCount(query: string): number | undefined {
  const text = String(query ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return undefined;

  const numeric = text.match(NUMBER_COUNT_RE);
  if (numeric?.[1]) {
    const count = Number.parseInt(numeric[1], 10);
    return Number.isFinite(count) ? clampRequestedCount(count) : undefined;
  }

  const word = text.match(WORD_COUNT_RE)?.[1];
  if (!word) return undefined;
  return clampRequestedCount(COUNT_WORDS[word] ?? 1);
}
