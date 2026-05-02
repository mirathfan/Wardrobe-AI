import type { ChatAttachment, ChatAttachmentGroupRole } from "@/src/components/ai/chatTypes";

export type AuraImageIntent =
  | "general_chat"
  | "style_advice"
  | "analyze_image"
  | "outfit_analysis"
  | "worn_outfit_photo"
  | "identify_item"
  | "add_item"
  | "add_items_batch"
  | "analyze_link"
  | "add_from_link"
  | "add_from_links_batch"
  | "compare_items"
  | "build_outfit";

export type ExtractedAuraUrl = {
  raw: string;
  normalized: string;
};

const ADD_RE = /\b(add|save|store|put|upload|log)\b.*\b(closet|wardrobe|item|items|these|this)\b|\b(add|save)\s+(this|these|all)\b/i;
const BATCH_RE = /\b(these|all|each|separate|multiple|items)\b/i;
const COMPARE_RE = /\b(compare|which one|better|pick between|versus|vs\.?)\b/i;
const OUTFIT_RE = /\b(outfit|look|style me|wear|fit|build)\b/i;
const WORN_OUTFIT_PHOTO_RE =
  /\b(outfit photo|mirror|selfie|wearing|worn outfit|my outfit|this outfit|this fit|fit check|what am i wearing|what are you seeing|analy[sz]e this outfit|how does this look|how do i look|what should i improve|what can i improve|improve this outfit|fix this outfit|rate this outfit)\b/i;
const IDENTIFY_RE = /\b(what is this|identify|brand|material|what item|what are these)\b/i;
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const TRAILING_PUNCTUATION_RE = /[.,!?;:]+$/;

export function extractUrlsFromText(text: string): ExtractedAuraUrl[] {
  const matches = String(text ?? "").match(URL_RE) ?? [];
  const seen = new Set<string>();
  const urls: ExtractedAuraUrl[] = [];

  for (const match of matches) {
    const raw = match.replace(TRAILING_PUNCTUATION_RE, "");
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      parsed.hash = "";
      const normalized = parsed.toString();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push({ raw, normalized });
    } catch {
      // Ignore malformed URL-like text; server validation is authoritative.
    }
  }

  return urls;
}

export function classifyAuraImageIntent(
  text: string,
  attachments: ChatAttachment[],
): AuraImageIntent {
  const prompt = text.trim();
  const urls = extractUrlsFromText(prompt);
  if (urls.length > 0 && ADD_RE.test(prompt)) {
    return urls.length > 1 || BATCH_RE.test(prompt)
      ? "add_from_links_batch"
      : "add_from_link";
  }
  if (urls.length > 0) return "analyze_link";

  const imageAttachments = attachments.filter((attachment) => attachment.type === "image");
  if (!imageAttachments.length) return OUTFIT_RE.test(prompt) ? "build_outfit" : "general_chat";

  const grouping = imageAttachments[0]?.role;
  if (ADD_RE.test(prompt)) {
    if (
      imageAttachments.length > 1 &&
      (grouping === "separate_items" || BATCH_RE.test(prompt))
    ) {
      return "add_items_batch";
    }
    return "add_item";
  }

  if (COMPARE_RE.test(prompt) && imageAttachments.length > 1) return "compare_items";
  if (!prompt) return "worn_outfit_photo";
  if (WORN_OUTFIT_PHOTO_RE.test(prompt)) return "outfit_analysis";
  if (OUTFIT_RE.test(prompt)) return "style_advice";
  if (IDENTIFY_RE.test(prompt)) return "identify_item";
  return "analyze_image";
}

export function getAttachmentGroupingLabel(role?: ChatAttachmentGroupRole | null) {
  if (role === "same_item") return "Same item";
  if (role === "separate_items") return "Separate items";
  return "Reference";
}
