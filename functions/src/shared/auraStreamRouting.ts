import type { AuraUserProfile } from "./loadAuraUserProfile";
import type { AuraAttachment } from "./auraStreamAttachments";

const MULTI_LOOK_REQUEST_RE =
  /\b((?:2|3|4|two|three|four)\s+(?:outfits?|looks?|options?|directions?)|multiple\s+(?:outfits?|looks?|options?|directions?)|safe,\s*balanced,\s*(?:and\s*)?bold|safe\s+balanced\s+bold|different\s+directions|few\s+outfits?)\b/i;
const SIMPLE_CHAT_NEEDS_STRUCTURED_RE =
  /\b(add|accessor(?:y|ies)|analy[sz]e|buy|card|closet|complete|date|dinner|dressier|event|fit|formal|image|improve|item|jacket|laundry|link|look|missing|outfit|photo|picture|plan|planner|product|rate|recommend|save|shop|shopping|smart\s+buys?|style|swap|tonight|tomorrow|trip|use\s+only|wardrobe|wear|wearing|weather|wedding|work)\b/i;

export function parseRequestedLookCount(message: string) {
  const text = String(message ?? "").toLowerCase();
  if (/\b(4|four)\s+(?:outfits?|looks?|options?|directions?)\b/.test(text)) return 4;
  if (/\b(3|three)\s+(?:outfits?|looks?|options?|directions?)\b/.test(text)) return 3;
  if (/\b(2|two)\s+(?:outfits?|looks?|options?|directions?)\b/.test(text)) return 2;
  if (/\bsafe,\s*balanced,\s*(?:and\s*)?bold\b|\bsafe\s+balanced\s+bold\b/.test(text)) return 3;
  if (/\bmultiple\s+(?:outfits?|looks?|options?|directions?)\b|\bdifferent\s+directions\b|\bfew\s+outfits?\b/.test(text)) return 3;
  return 1;
}

export function wantsMultipleLooks(message: string) {
  return MULTI_LOOK_REQUEST_RE.test(String(message ?? ""));
}

export function buildMultiLookRequestNote(userMessage: string) {
  if (!wantsMultipleLooks(userMessage)) return "";
  const count = Math.min(3, Math.max(2, parseRequestedLookCount(userMessage)));
  return (
    "\n\nMulti-look requirement:\n" +
    "The user is explicitly asking for multiple outfit options.\n" +
    `Return presentation "card" and provide ${count} structured looks in lookOptions whenever you can do so safely.\n` +
    "Do not answer this with only prose, outfitItems, ownedPieces, or recommendedAdditions if structured looks are possible.\n" +
    "If only one structured look is possible, still return that one structured look and leave a concise reply."
  );
}

function isGeneralChatIntent(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return !normalized || normalized === "general_chat";
}

export function shouldUseSimpleChatPath(args: {
  userMessage: string;
  attachments: AuraAttachment[];
  detectedUrls: { normalized: string }[];
  clientIntent: string | null;
  effectiveClientIntent: string | null;
  linkIntent: string;
}) {
  if (!args.userMessage.trim()) return false;
  if (args.attachments.length > 0) return false;
  if (args.detectedUrls.length > 0) return false;
  if (args.linkIntent !== "none") return false;
  if (!isGeneralChatIntent(args.clientIntent)) return false;
  if (!isGeneralChatIntent(args.effectiveClientIntent)) return false;
  if (wantsMultipleLooks(args.userMessage)) return false;
  return !SIMPLE_CHAT_NEEDS_STRUCTURED_RE.test(args.userMessage);
}

function compactText(value: unknown, maxLength = 160) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function uniqueTrimmed(values: string[] | undefined, max = 3) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  ).slice(0, max);
}

function compactAuraUserProfile(userProfile: AuraUserProfile) {
  return {
    firstName: compactText(userProfile.firstName),
    region: compactText(userProfile.region),
    wardrobeMode: compactText(userProfile.wardrobeMode),
    selectedCategories: uniqueTrimmed(userProfile.selectedCategories, 6),
    styleAesthetics: uniqueTrimmed(userProfile.styleAesthetics, 6),
    favoriteColors: uniqueTrimmed(userProfile.favoriteColors, 6),
    avoidedColors: uniqueTrimmed(userProfile.avoidedColors, 6),
    accessoryPreferences: uniqueTrimmed(userProfile.accessoryPreferences, 6),
    occasionPriority: uniqueTrimmed(userProfile.occasionPriority, 6),
    goals: uniqueTrimmed(userProfile.goals, 6),
    preferredFit: compactText(userProfile.preferredFit),
    preferredBrands: uniqueTrimmed(userProfile.stylePreferences?.preferredBrands, 6),
    closetPreferences: userProfile.closetPreferences
      ? {
          prioritizeUnderused: userProfile.closetPreferences.prioritizeUnderused === true,
          hideLaundryByDefault: userProfile.closetPreferences.hideLaundryByDefault === true,
          defaultSort: compactText(userProfile.closetPreferences.defaultSort),
        }
      : null,
  };
}

function compactMinimumClosetFromClientContext(value: unknown) {
  const requestContext = value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
  const minimumCloset = requestContext.minimumCloset && typeof requestContext.minimumCloset === "object"
    ? (requestContext.minimumCloset as Record<string, unknown>)
    : null;
  if (!minimumCloset) return null;

  const itemCount = Number(minimumCloset.itemCount ?? 0);
  const outfitRange = Number(minimumCloset.outfitRange ?? 0);
  const nextBestAdd = compactText(minimumCloset.nextBestAdd, 120);

  return {
    itemCount: Number.isFinite(itemCount) ? itemCount : 0,
    styleCoreProgress: compactText(minimumCloset.styleCoreProgress, 120),
    nextBestAdd,
    missingCategoryHints: nextBestAdd ? [nextBestAdd] : [],
    outfitRange: Number.isFinite(outfitRange) ? outfitRange : 0,
    tone: compactText(minimumCloset.tone, 80),
  };
}

export function buildCompactAuraContextForSimpleChat(args: {
  memory: unknown;
  userProfile: AuraUserProfile;
  clientContext: unknown;
  styleCoreNote: string;
}) {
  return {
    mode: "compact_simple_chat",
    contextPolicy: "Full closet item list and image URLs omitted for simple chat.",
    closetSummary: compactMinimumClosetFromClientContext(args.clientContext),
    userProfile: compactAuraUserProfile(args.userProfile),
    preferenceContext: args.memory,
    styleCoreNote: args.styleCoreNote || null,
  };
}
