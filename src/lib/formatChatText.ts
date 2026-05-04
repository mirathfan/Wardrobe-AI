function trimCommonPrefix(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/^www\d*\./i, "");
}

function normalizeUrlInput(url: string) {
  const value = String(url ?? "").trim();
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function isUrlOnlyMessage(text?: string | null) {
  const value = String(text ?? "").trim();
  if (!value) return false;
  return /^(?:https?:\/\/|www\d*\.)\S+$/i.test(value);
}

export function formatUrlForDisplay(url: string) {
  try {
    const parsed = new URL(normalizeUrlInput(url));
    const host = trimCommonPrefix(parsed.host.toLowerCase());
    const firstPathSegment = parsed.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .find((part) => /[a-z]/i.test(part) && !/^dp$/i.test(part) && !/^[A-Z0-9]{6,}$/i.test(part));

    const title =
      parsed.searchParams.get("title") ||
      parsed.searchParams.get("product") ||
      parsed.searchParams.get("name") ||
      (firstPathSegment ? humanizeSlug(decodeURIComponent(firstPathSegment)) : "");

    if (title) {
      return `${host} • ${title}`;
    }
    return host;
  } catch {
    return url;
  }
}
