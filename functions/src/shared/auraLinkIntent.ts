export type AuraLinkIntent =
  | "none"
  | "analyze_link"
  | "add_from_link"
  | "add_from_links_batch";

export type ExtractedUrl = {
  raw: string;
  normalized: string;
};

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const TRAILING_PUNCTUATION_RE = /[.,!?;:]+$/;
const ADD_RE =
  /\b(add|save|store|put|upload|log)\b[\s\S]{0,80}\b(closet|wardrobe|item|items|these|this|links?|all)\b|\b(add|save)\s+(this|these|all|item|items|links?)\b|\bput\s+(this|these|all|item|items|links?)\s+in\s+(my\s+)?(closet|wardrobe)\b/i;

export function extractUrlsFromText(text: string): ExtractedUrl[] {
  const matches = String(text ?? "").match(URL_RE) ?? [];
  const seen = new Set<string>();
  const urls: ExtractedUrl[] = [];

  for (const match of matches) {
    const raw = match.replace(TRAILING_PUNCTUATION_RE, "");
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        continue;
      }
      parsed.hash = "";
      const normalized = parsed.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push({ raw, normalized });
    } catch {
      continue;
    }
  }

  return urls;
}

export function classifyAuraLinkIntent(text: string): AuraLinkIntent {
  const urls = extractUrlsFromText(text);
  if (!urls.length) return "none";
  if (ADD_RE.test(text)) {
    return urls.length > 1 ? "add_from_links_batch" : "add_from_link";
  }
  return "analyze_link";
}
