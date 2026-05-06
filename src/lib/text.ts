const SAFE_TRAILING_WORDS = new Set([
  "look",
  "today",
  "tonight",
  "weekend",
  "casual",
  "formal",
  "smart",
  "warm",
  "cool",
  "more",
  "less",
]);

export function sanitizeDisplayText(value: string | null | undefined) {
  const original = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!original) return "";

  let text = original.replace(/[>*_`#-]+$/g, "").trim();
  if (!text) return original;

  if (!/[.!?…"')\]]$/.test(text)) {
    text = text.replace(/[,:;/\-–—]+$/g, "").trim();
    const words = text.split(" ").filter(Boolean);
    const last = words[words.length - 1]?.toLowerCase() ?? "";
    if (
      words.length >= 4 &&
      last &&
      !SAFE_TRAILING_WORDS.has(last) &&
      (/^[a-z]$/.test(last) || /^[a-z]{2}$/.test(last) || /^[a-z]{3,4}$/.test(last))
    ) {
      words.pop();
      const next = words.join(" ").trim();
      if (next) text = next;
    }
  }

  return text || original;
}

function sanitizeDisplayLine(value: string) {
  const compact = String(value ?? "").replace(/[ \t]+/g, " ").trim();
  if (!compact) return "";

  // Section headers such as "Quick take:" and field prompts such as "- Top:"
  // are part of AURA's structured styling format, so keep the trailing colon.
  if (compact.endsWith(":") && compact.length <= 80) {
    return compact;
  }

  return sanitizeDisplayText(compact);
}

export function sanitizeMultilineDisplayText(value: string | null | undefined) {
  const original = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!original.trim()) return "";

  return original
    .split("\n")
    .map(sanitizeDisplayLine)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
