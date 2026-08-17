const INTERNAL_USER_PROMPT_LINE_RE =
  /^\s*(?:(closet item id|required anchor item|selected item ids?)\s*:|do not substitute another closet item)/i;

export function prepareUserMessageText(value: unknown) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

export function prepareVisibleUserMessageText(value: unknown) {
  const rawPrompt = prepareUserMessageText(value);
  const text = rawPrompt
    .split("\n")
    .filter((line) => !INTERNAL_USER_PROMPT_LINE_RE.test(line))
    .join("\n")
    .replace(/\s*\((?:closet item id|item id):\s*[^)]+\)/gi, "")
    .replace(/\bcloset item id:\s*[^\n.;]+[.;]?/gi, "")
    .replace(/\brequired anchor item:\s*[^\n]+/gi, "")
    .replace(/\bselected item ids?:\s*[^\n]+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || (rawPrompt ? "Style this item with AURA." : "");
}

export function formatUserBubbleText(value?: string | null) {
  const rawText = prepareUserMessageText(value);
  if (/^Style this closet item for me:/i.test(rawText) && /\bcloset item id:/i.test(rawText)) {
    return "Style this item with AURA.";
  }

  const visibleText = prepareVisibleUserMessageText(rawText);
  if (!visibleText) return "";

  return visibleText
    .split(/\n+/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
