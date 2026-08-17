import {
  roleForStylingItem,
  type StylingItem,
} from "./styling/types";

type ManualLookPieceRole = "top" | "bottom" | "shoes" | "outerwear" | "accessory";

type ManualLookPiece = {
  role: ManualLookPieceRole;
  itemName: string;
  source: "closet" | "suggested";
  itemId: string | null;
  imageUrl: string | null;
};

type ManualLook = {
  id?: string | null;
  lookTitle: string;
  vibe: string;
  shortExplanation: string;
  stylingNote: string;
  personalizationLabel?: string;
  personalizationNote?: string;
  pieces: ManualLookPiece[];
  fromCloset: string[];
  addToComplete: string[];
  alternates: string[];
  actions: (
    "saveLook" | "planForToday" | "likeLook" | "notMyVibe" | "showMoreLikeThis" | "lessLikeThis" | "shopMissingPieces" | "useOnlyMyCloset" | "makeItDressier"
  )[];
};

type ManualLookItem = StylingItem & {
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
};

type ManualLookSourceResponse = {
  reply?: string;
  recommendedAdditions?: string[];
  missingPieces?: string[];
  upgradeSuggestions?: string[];
  swapSuggestion?: string;
};

const MANUAL_OUTFIT_RE =
  /\b(improve|refine|fix|polish|style)\b[\s\S]{0,80}\b(manually built outfit|selected pieces|selected closet|from my closet)\b/i;

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueStrings(values: (string | null | undefined)[], max = 12) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const next = clean(value);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    if (out.length >= max) break;
  }
  return out;
}

function inferRoleFromPromptLine(prompt: string, itemId: string): ManualLookPieceRole | null {
  const escapedId = itemId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = prompt
    .split(/\r?\n/g)
    .find((entry) => new RegExp(`closet item id:\\s*${escapedId}\\b`, "i").test(entry));
  const role = normalized(line?.split(":")[0] ?? "");
  if (role === "top") return "top";
  if (role === "bottom") return "bottom";
  if (role === "footwear" || role === "shoe" || role === "shoes") return "shoes";
  if (role === "outerwear" || role === "layer") return "outerwear";
  if (role === "accessory" || role === "accessories") return "accessory";
  return null;
}

function roleForItem(item: ManualLookItem, prompt: string): ManualLookPieceRole {
  const promptRole = inferRoleFromPromptLine(prompt, item.id);
  if (promptRole) return promptRole;
  const role = roleForStylingItem(item);
  if (role === "bottom") return "bottom";
  if (role === "footwear") return "shoes";
  if (role === "outerwear") return "outerwear";
  if (role === "accessory") return "accessory";
  return "top";
}

function itemLabel(item: ManualLookItem) {
  return (
    clean(item.name) ||
    clean(item.subCategory) ||
    clean(item.type) ||
    clean(item.category) ||
    "Wardrobe piece"
  );
}

function itemImageUrl(item: ManualLookItem) {
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

function selectedItemIdsFromPrompt(prompt: string) {
  const ids: string[] = [];
  for (const match of prompt.matchAll(/closet item id:\s*([^)\\\n;]+)/gi)) {
    ids.push(clean(match[1]).replace(/[),.;]+$/g, ""));
  }
  const selectedIdsLine = prompt.match(/selected item ids?:\s*([^\n]+)/i)?.[1] ?? "";
  ids.push(
    ...selectedIdsLine
      .split(/[,|]/g)
      .map((value) => clean(value).replace(/[.;]+$/g, ""))
      .filter(Boolean),
  );
  return uniqueStrings(ids, 12);
}

function matchesLabel(item: ManualLookItem, label: string) {
  const target = normalized(label);
  if (target.length < 3) return false;
  const candidates = [
    item.name,
    item.subCategory,
    item.type,
    item.category,
    item.brand,
  ]
    .map(normalized)
    .filter((value) => value.length >= 3);
  return candidates.some((candidate) => candidate === target || candidate.includes(target) || target.includes(candidate));
}

function closetItemForSuggestion(
  label: string,
  items: ManualLookItem[],
  selectedIds: Set<string>,
) {
  if (!label || label.length > 90) return null;
  return items.find((item) => !selectedIds.has(item.id) && matchesLabel(item, label)) ?? null;
}

function suggestionLabels(response?: ManualLookSourceResponse | null) {
  return uniqueStrings([
    ...(response?.recommendedAdditions ?? []),
    ...(response?.missingPieces ?? []),
    ...(response?.upgradeSuggestions ?? []),
  ], 4);
}

export function isManualOutfitImprovementPrompt(prompt: string) {
  return MANUAL_OUTFIT_RE.test(prompt) && selectedItemIdsFromPrompt(prompt).length > 0;
}

export function buildManualOutfitLookFromPrompt(
  prompt: string,
  closetItems: ManualLookItem[],
  response?: ManualLookSourceResponse | null,
): ManualLook | null {
  if (!isManualOutfitImprovementPrompt(prompt)) return null;
  const selectedIds = selectedItemIdsFromPrompt(prompt);
  const itemsById = new Map(closetItems.map((item) => [item.id, item]));
  const selectedItems = selectedIds.flatMap((id) => {
    const item = itemsById.get(id);
    return item ? [item] : [];
  });
  if (!selectedItems.length) return null;

  const selectedPieces = selectedItems.map((item) => ({
    role: roleForItem(item, prompt),
    itemName: itemLabel(item),
    source: "closet" as const,
    itemId: item.id,
    imageUrl: itemImageUrl(item),
  }));
  const selectedRoles = new Set(selectedPieces.map((piece) => piece.role));
  if (!selectedRoles.has("top") || !selectedRoles.has("bottom") || !selectedRoles.has("shoes")) {
    return null;
  }

  const selectedIdSet = new Set(selectedItems.map((item) => item.id));
  const ownedSuggestions: ManualLookPiece[] = [];
  const missingSuggestions: string[] = [];
  for (const label of suggestionLabels(response)) {
    const closetMatch = closetItemForSuggestion(label, closetItems, selectedIdSet);
    if (closetMatch) {
      selectedIdSet.add(closetMatch.id);
      ownedSuggestions.push({
        role: roleForItem(closetMatch, prompt),
        itemName: itemLabel(closetMatch),
        source: "closet",
        itemId: closetMatch.id,
        imageUrl: itemImageUrl(closetMatch),
      });
    } else {
      missingSuggestions.push(label);
    }
  }

  const pieces = [...selectedPieces, ...ownedSuggestions];
  const fromCloset = uniqueStrings(pieces.filter((piece) => piece.source === "closet").map((piece) => piece.itemName));
  const addToComplete = uniqueStrings(missingSuggestions, 3);
  const top = selectedPieces.find((piece) => piece.role === "top")?.itemName;
  const bottom = selectedPieces.find((piece) => piece.role === "bottom")?.itemName;
  const shoes = selectedPieces.find((piece) => piece.role === "shoes")?.itemName;
  const titleBase = [top, bottom].filter(Boolean).join(" + ");
  const reply = clean(response?.reply);

  return {
    id: `manual_${selectedIds.join("_").slice(0, 80) || "selected"}`,
    lookTitle: titleBase || "Manual Outfit Edit",
    vibe: "Closet refinement",
    shortExplanation:
      reply ||
      "AURA kept your selected closet pieces as the base and refined the styling around them.",
    stylingNote:
      clean(response?.swapSuggestion) ||
      (shoes
        ? `Keep the core outfit intact and let ${shoes.toLowerCase()} finish the proportion.`
        : "Keep the core outfit intact and adjust only one styling detail."),
    personalizationLabel: "From your selection",
    personalizationNote: "Built from the closet pieces you selected in Studio.",
    pieces,
    fromCloset,
    addToComplete,
    alternates: clean(response?.swapSuggestion) ? [clean(response?.swapSuggestion)] : [],
    actions: [
      "saveLook",
      "planForToday",
      "likeLook",
      "notMyVibe",
      "showMoreLikeThis",
      "lessLikeThis",
      "shopMissingPieces",
      "makeItDressier",
    ],
  };
}
