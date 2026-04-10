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
