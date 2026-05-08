import {
  generateOutfitCandidates,
  normalizeParsedIntent,
  type Slot,
  type WardrobeItem,
} from "./outfitEngine";
import {
  itemText,
  roleForStylingItem,
  type StylingItem,
} from "./styling/types";

type AuraLookPieceRole = "top" | "bottom" | "shoes" | "outerwear" | "accessory";

type AuraLookPiece = {
  role: AuraLookPieceRole;
  itemName: string;
  source: "closet" | "suggested";
  itemId: string | null;
  imageUrl: string | null;
};

type AuraConcreteLook = {
  id?: string | null;
  lookTitle: string;
  vibe: string;
  shortExplanation: string;
  stylingNote: string;
  personalizationLabel?: string;
  personalizationNote?: string;
  pieces: AuraLookPiece[];
  fromCloset: string[];
  addToComplete: string[];
  alternates: string[];
  actions: (
    "saveLook" | "planForToday" | "likeLook" | "notMyVibe" | "showMoreLikeThis" | "lessLikeThis" | "shopMissingPieces" | "useOnlyMyCloset" | "makeItDressier"
  )[];
};

type AuraConcreteResponse = {
  reply?: string;
  outfitItems?: string[];
  ownedPieces?: string[];
  recommendedAdditions?: string[];
  missingPieces?: string[];
  upgradeSuggestions?: string[];
  swapSuggestion?: string;
};

type ClosetRecord = StylingItem & WardrobeItem & {
  id: string;
  photoUrl?: string | null;
  images?: {
    originalUrl?: string | null;
    cleanedUrl?: string | null;
    isPrimary?: boolean;
  }[] | null;
  photos?: {
    cleanedPhotoUrl?: string | null;
    cleanedUrl?: string | null;
    primaryUrl?: string | null;
    thumbUrl?: string | null;
    cleanedThumbUrl?: string | null;
    croppedUrl?: string | null;
    urls?: string[];
  } | null;
  createdAt?: number | { toMillis?: () => number } | null;
  updatedAt?: number | { toMillis?: () => number } | null;
};

const CONCRETE_OUTFIT_INTENT_RE =
  /\b(suggest|recommend|build|make|create|pull|put together|plan|style|dress)\b[\s\S]{0,80}\b(outfit|look|fit)\b|\bwhat should i wear\b|\boutfit for\b|\bfit for\b|\bstyle this\b|\bstyle it\b|\bmake it (?:dressier|more casual|better|warmer|cooler|sharper)\b|\bhow (?:do|should|would|can) i style\b/i;

const LIST_HEADER_RE =
  /^(quick take|why it works|how to wear it|swap|swap \/ add|styling note|keep|what works|what weakens it|fix|score|best option|outfit|top priorities|next move|avoid|best with|outfit ideas)\s*:?$/i;

const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "the",
  "this",
  "that",
  "with",
  "your",
  "from",
  "closet",
  "wardrobe",
  "wear",
  "pair",
  "keep",
  "add",
]);

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueStrings(values: (string | null | undefined)[], max = 16) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = clean(value);
    const key = normalized(next);
    if (!next || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(next);
    if (out.length >= max) break;
  }
  return out;
}

function tokenList(value: unknown) {
  return normalized(value)
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_TOKENS.has(token));
}

function mapRole(role: ReturnType<typeof roleForStylingItem>): AuraLookPieceRole | null {
  if (role === "top" || role === "one_piece") return "top";
  if (role === "bottom") return "bottom";
  if (role === "footwear") return "shoes";
  if (role === "outerwear") return "outerwear";
  if (role === "accessory") return "accessory";
  return null;
}

function slotForItem(item: ClosetRecord): Slot | null {
  const role = roleForStylingItem(item);
  if (role === "footwear") return "footwear";
  if (role === "top" || role === "bottom" || role === "outerwear" || role === "accessory") return role;
  return null;
}

function itemLabel(item: ClosetRecord) {
  return (
    clean(item.name) ||
    clean(item.subCategory) ||
    clean(item.type) ||
    clean(item.category) ||
    "Wardrobe piece"
  );
}

function itemImageUrl(item: ClosetRecord) {
  return (
    clean(item.images?.find((image) => image?.isPrimary)?.cleanedUrl) ||
    clean(item.images?.find((image) => image?.isPrimary)?.originalUrl) ||
    clean(item.images?.[0]?.cleanedUrl) ||
    clean(item.images?.[0]?.originalUrl) ||
    clean(item.photos?.cleanedPhotoUrl) ||
    clean(item.photos?.cleanedUrl) ||
    clean(item.photos?.primaryUrl) ||
    clean(item.photos?.cleanedThumbUrl) ||
    clean(item.photos?.thumbUrl) ||
    clean(item.photos?.croppedUrl) ||
    clean(item.photos?.urls?.[0]) ||
    clean(item.photoUrl) ||
    null
  );
}

function pieceFromItem(item: ClosetRecord): AuraLookPiece | null {
  const role = mapRole(roleForStylingItem(item));
  if (!role) return null;
  return {
    role,
    itemName: itemLabel(item),
    source: "closet",
    itemId: item.id,
    imageUrl: itemImageUrl(item),
  };
}

function matchScore(item: ClosetRecord, label: string) {
  const target = normalized(label);
  if (target.length < 3) return 0;
  const name = normalized(item.name);
  const brandName = normalized([item.brand, item.name].filter(Boolean).join(" "));
  const displayName = normalized([
    item.displayColor,
    item.colorLabel,
    item.primaryColor,
    item.name,
  ].filter(Boolean).join(" "));
  const text = itemText(item);
  const candidates = [name, brandName, displayName, text].filter((value) => value.length >= 3);

  if (candidates.some((candidate) => candidate === target)) return 1;
  if (name && (target.includes(name) || name.includes(target))) return 0.96;
  if (brandName && (target.includes(brandName) || brandName.includes(target))) return 0.94;
  if (displayName && (target.includes(displayName) || displayName.includes(target))) return 0.9;
  if (text.includes(target)) return 0.78;

  const targetTokens = tokenList(target);
  if (targetTokens.length === 0) return 0;
  const itemTokens = new Set(tokenList([item.brand, item.name, item.displayColor, item.colorLabel, item.subCategory, item.type, item.category].join(" ")));
  const overlap = targetTokens.filter((token) => itemTokens.has(token)).length;
  const coverage = overlap / Math.max(1, Math.min(targetTokens.length, itemTokens.size));
  const targetCoverage = overlap / targetTokens.length;
  return Math.max(coverage, targetCoverage * 0.9);
}

function resolveClosetItem(label: string, items: ClosetRecord[], usedIds: Set<string>) {
  const scored = items
    .filter((item) => !usedIds.has(item.id))
    .map((item) => ({item, score: matchScore(item, label)}))
    .filter((entry) => entry.score >= 0.55)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.item ?? null;
}

function labelFromReplyLine(line: string) {
  let text = clean(line)
    .replace(/^[-•]\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
  if (!text || LIST_HEADER_RE.test(text)) return "";

  const roleMatch = text.match(/^(?:top|bottom|footwear|shoes?|sneakers?|layer|outerwear|accessor(?:y|ies))\s*:\s*(.+)$/i);
  if (roleMatch?.[1]) text = roleMatch[1];

  text = text
    .replace(/\s+[–—-]\s+.*$/, "")
    .replace(/\s+\(.{8,}\)\s*$/, "")
    .replace(/[.;]+$/g, "")
    .trim();

  if (!text || text.length > 90 || LIST_HEADER_RE.test(text)) return "";
  return text;
}

function labelsFromResponse(response?: AuraConcreteResponse | null) {
  const explicit = uniqueStrings([
    ...(response?.outfitItems ?? []),
    ...(response?.ownedPieces ?? []),
  ], 10);
  const replyLabels = String(response?.reply ?? "")
    .split(/\r?\n/g)
    .map(labelFromReplyLine)
    .filter(Boolean);
  return uniqueStrings([...explicit, ...replyLabels], 10);
}

function hasCorePieces(pieces: AuraLookPiece[]) {
  const roles = new Set(pieces.map((piece) => piece.role));
  return roles.has("top") && roles.has("bottom") && roles.has("shoes");
}

function lookTitleForPieces(pieces: AuraLookPiece[]) {
  const top = pieces.find((piece) => piece.role === "top");
  const bottom = pieces.find((piece) => piece.role === "bottom");
  if (top && bottom) return `${top.itemName} + ${bottom.itemName}`;
  if (pieces.length >= 2) return `${pieces[0].itemName} + ${pieces[1].itemName}`;
  return "Closet outfit";
}

function lookIdForPieces(pieces: AuraLookPiece[], source: string) {
  const ids = pieces
    .map((piece) => clean(piece.itemId))
    .filter(Boolean)
    .join("_")
    .slice(0, 80);
  return ids ? `aura_${source}_${ids}` : `aura_${source}_unknown`;
}

function replyForLook(look: AuraConcreteLook) {
  const outerwear = look.pieces.find((piece) => piece.role === "outerwear");
  const shoes = look.pieces.find((piece) => piece.role === "shoes");
  return [
    "Quick take:",
    "This is a concrete outfit built from the closet pieces AURA picked.",
    "",
    "Why it works:",
    outerwear ? `- ${outerwear.itemName} adds the main layer and attitude.` : "- The base pieces keep the outfit easy to wear.",
    shoes ? `- ${shoes.itemName} grounds the outfit.` : "- The footwear slot stays simple and wearable.",
    "- The card below keeps the exact pieces together.",
    "",
    "Styling note:",
    look.stylingNote,
  ].join("\n");
}

function buildLookFromPieces(pieces: AuraLookPiece[], source: "resolved_text" | "generated") {
  const fromCloset = pieces
    .filter((piece) => piece.source === "closet")
    .map((piece) => piece.itemName);
  const look: AuraConcreteLook = {
    id: lookIdForPieces(pieces, source),
    lookTitle: lookTitleForPieces(pieces),
    vibe: source === "generated" ? "closet-built outfit" : "recommended outfit",
    shortExplanation:
      source === "generated"
        ? "AURA built this from your wardrobe instead of leaving the recommendation as plain text."
        : "AURA matched the recommended items to closet pieces.",
    stylingNote:
      source === "generated"
        ? "Use the card as the source of truth for the exact pieces."
        : "Let the proportions stay clean and keep the outfit edited.",
    pieces,
    fromCloset: Array.from(new Set(fromCloset)),
    addToComplete: [],
    alternates: [],
    actions: ["likeLook", "notMyVibe", "showMoreLikeThis", "lessLikeThis", "useOnlyMyCloset", "makeItDressier"],
  };
  return {
    look,
    reply: replyForLook(look),
  };
}

function lookFromResponseText(response: AuraConcreteResponse, closetItems: ClosetRecord[]) {
  const labels = labelsFromResponse(response);
  if (labels.length < 3) return null;

  const usedIds = new Set<string>();
  const pieces = labels.flatMap((label) => {
    const item = resolveClosetItem(label, closetItems, usedIds);
    if (!item) return [];
    const piece = pieceFromItem(item);
    if (!piece) return [];
    usedIds.add(item.id);
    return [piece];
  });

  if (!hasCorePieces(pieces)) return null;
  return buildLookFromPieces(pieces, "resolved_text");
}

function toMillis(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const maybeTimestamp = value as { toMillis?: () => number } | null | undefined;
  if (typeof maybeTimestamp?.toMillis === "function") {
    const millis = maybeTimestamp.toMillis();
    return Number.isFinite(millis) ? millis : 0;
  }
  return 0;
}

function newestRecentAnchor(items: ClosetRecord[], now = Date.now()) {
  const recentWindowMs = 6 * 60 * 60 * 1000;
  return items
    .map((item) => ({
      item,
      slot: slotForItem(item),
      timestamp: Math.max(toMillis(item.updatedAt), toMillis(item.createdAt)),
    }))
    .filter((entry) => entry.slot && entry.timestamp > 0 && now - entry.timestamp <= recentWindowMs)
    .sort((a, b) => b.timestamp - a.timestamp)[0] ?? null;
}

function lookFromOutfitEngine(userMessage: string, closetItems: ClosetRecord[]) {
  if (!isConcreteOutfitIntent(userMessage, false)) return null;
  const intent = normalizeParsedIntent(null, userMessage);
  const anchor = newestRecentAnchor(closetItems);
  const lockedItemsBySlot =
    anchor?.slot && anchor.item
      ? ({[anchor.slot]: anchor.item} as Partial<Record<Slot, WardrobeItem>>)
      : undefined;
  const generated = generateOutfitCandidates(closetItems, intent, {
    numOutfits: 1,
    lockedItemsBySlot,
  });
  const fallbackGenerated = generated.outfits.length || !lockedItemsBySlot
    ? generated
    : generateOutfitCandidates(closetItems, intent, {numOutfits: 1});
  const outfit = fallbackGenerated.outfits[0];
  if (!outfit) return null;
  const byId = new Map(closetItems.map((item) => [item.id, item]));
  const pieces = outfit.picks.flatMap((pick) => {
    const item = byId.get(pick.itemId);
    const piece = item ? pieceFromItem(item) : null;
    return piece ? [piece] : [];
  });
  if (!hasCorePieces(pieces)) return null;
  return buildLookFromPieces(pieces, "generated");
}

export function isConcreteOutfitIntent(message: string, hasContext = false) {
  const text = clean(message);
  if (!text) return false;
  if (CONCRETE_OUTFIT_INTENT_RE.test(text)) return true;
  return hasContext && /\b(make|style|wear|better|dressier|casual|warmer|cooler|sharper|shoes?)\b/i.test(text);
}

export function buildConcreteOutfitLook(params: {
  userMessage?: string | null;
  response?: AuraConcreteResponse | null;
  closetRecords?: (Record<string, unknown> & { id: string })[] | null;
}) {
  const closetItems = (params.closetRecords ?? []) as ClosetRecord[];
  if (!closetItems.length) return null;
  const textLook = params.response ? lookFromResponseText(params.response, closetItems) : null;
  if (textLook) return textLook;
  return lookFromOutfitEngine(params.userMessage ?? "", closetItems);
}
