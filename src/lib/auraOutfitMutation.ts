import { getItemImageUrl } from "@/src/lib/itemImage";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook, AuraResponse } from "@/src/types/aura";
import {
  canonicalAuraOccasion,
  classifyAuraStylingIntent,
  countMeaningfulItemChanges,
  isItemIncompatibleWithOccasion,
  normalizeAuraClosetItem,
  normalizeAuraLookCardMetadata,
  scoreAuraItemForIntent,
  type AuraIntentResult,
} from "@/shared/auraStylingIntelligence";

type AuraLookPiece = AuraLook["pieces"][number];
type AuraLookRole = AuraLookPiece["role"];

const ROLE_ORDER: AuraLookRole[] = ["outerwear", "top", "bottom", "shoes", "accessory"];

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalized(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function roleForItem(item: ClothingItem): AuraLookRole | null {
  const normalizedItem = normalizeAuraClosetItem(item);
  const category = normalizedItem.category;
  const text = normalizedItem.text;
  const rawCategory = normalized(item.category);

  if (category === "outerwear" || rawCategory === "outerwear") return "outerwear";
  if (category === "footwear" || category === "sneaker" || category === "boot" || category === "formal_shoe" || category === "slides" || rawCategory === "shoes") {
    return "shoes";
  }
  if (category === "denim" || category === "cargo" || category === "shorts" || category === "gym_shorts" || rawCategory === "bottom") {
    return "bottom";
  }
  if (category === "sports_jersey" || category === "tee" || category === "hoodie" || category === "tailoring" || rawCategory === "top" || rawCategory === "one_piece") {
    return "top";
  }
  if (rawCategory === "accessory" || /\b(watch|chain|necklace|bag|cap|hat|glasses|sunglasses)\b/.test(text)) {
    return "accessory";
  }
  return null;
}

function pieceFromItem(item: ClothingItem): AuraLookPiece | null {
  const role = roleForItem(item);
  if (!role) return null;
  return {
    role,
    itemName:
      clean(item.name) ||
      clean(item.subCategory) ||
      clean(item.type) ||
      clean(item.category) ||
      "Wardrobe piece",
    source: "closet",
    itemId: item.id,
    imageUrl: getItemImageUrl(item, { variant: "thumb", surface: "ai_outfit" }),
  };
}

function pieceKey(piece: AuraLookPiece) {
  return clean(piece.itemId) || normalized([piece.role, piece.itemName].join(":"));
}

function lookItemIds(look: AuraLook) {
  return new Set(
    (look.pieces ?? [])
      .filter((piece) => piece.source === "closet")
      .map((piece) => clean(piece.itemId))
      .filter(Boolean),
  );
}

function itemForPiece(piece: AuraLookPiece, itemsById: Map<string, ClothingItem>) {
  const id = clean(piece.itemId);
  return id ? itemsById.get(id) ?? null : null;
}

function pieceMatchesExclusion(piece: AuraLookPiece, item: ClothingItem | null, intent: AuraIntentResult) {
  const text = normalized([
    piece.itemName,
    item?.name,
    item?.brand,
    item?.category,
    item?.subCategory,
    item?.type,
    item?.primaryColor,
    item?.colorLabel,
    item?.displayColor,
    ...(item?.colors ?? []),
  ].join(" "));
  if (intent.excludedColors.some((color) => new RegExp(`\\b${normalized(color)}\\b`).test(text))) return true;
  return intent.excludedCategories.some((category) => text.includes(normalized(category)));
}

function itemHasDarkPalette(item: ClothingItem) {
  const text = normalized([
    item.primaryColor,
    item.colorLabel,
    item.displayColor,
    ...(item.colors ?? []),
    item.name,
  ].join(" "));
  return /\b(black|charcoal|grey|gray|navy|dark|brown)\b/.test(text);
}

function itemIsLoud(item: ClothingItem) {
  const normalizedItem = normalizeAuraClosetItem(item);
  return normalizedItem.graphicIntensity >= 0.7 || normalizedItem.sportiness >= 0.78;
}

function shouldReplaceForVibeOrOccasion(
  piece: AuraLookPiece,
  item: ClothingItem | null,
  intent: AuraIntentResult,
) {
  if (!item) return false;
  const occasion = intent.occasion ? canonicalAuraOccasion(intent.occasion) : undefined;
  if (occasion && isItemIncompatibleWithOccasion(item, occasion, intent.explicitSportsContext)) return true;
  const vibe = normalized(intent.vibe);
  const normalizedItem = normalizeAuraClosetItem(item);
  if (vibe.includes("clean") || vibe.includes("classy") || vibe.includes("luxury") || vibe.includes("aura")) {
    return normalizedItem.sportiness >= 0.7 || normalizedItem.graphicIntensity >= 0.75 || normalizedItem.formality < 0.25;
  }
  if (vibe.includes("dark")) return !itemHasDarkPalette(item);
  if (vibe.includes("minimal")) return itemIsLoud(item);
  return pieceMatchesExclusion(piece, item, intent);
}

function categoryForTarget(target?: string) {
  if (target === "footwear") return "shoes";
  if (target === "bottom") return "bottom";
  if (target === "top") return "top";
  if (target === "outerwear") return "outerwear";
  if (target === "accessory") return "accessory";
  return null;
}

function replacementRolesForIntent(
  previousLook: AuraLook,
  itemsById: Map<string, ClothingItem>,
  intent: AuraIntentResult,
) {
  const roles = new Set<AuraLookRole>();
  const targetRole = categoryForTarget(intent.targetItemCategory);
  if (targetRole) roles.add(targetRole);

  for (const piece of previousLook.pieces ?? []) {
    const item = itemForPiece(piece, itemsById);
    if (pieceMatchesExclusion(piece, item, intent) || shouldReplaceForVibeOrOccasion(piece, item, intent)) {
      roles.add(piece.role);
    }
  }

  if (intent.intent === "outfit_iteration") {
    roles.add("top");
    roles.add("bottom");
    roles.add("shoes");
  } else if (intent.intent === "outfit_feedback") {
    roles.add("top");
    roles.add("shoes");
  } else if (intent.intent === "occasion_change" || intent.intent === "improve_fit") {
    roles.add("top");
    roles.add("shoes");
    if (normalized(intent.vibe).includes("classy") || intent.occasion) roles.add("bottom");
  } else if (intent.intent === "vibe_shift" && !roles.size) {
    roles.add("top");
    roles.add("shoes");
  }

  return Array.from(roles).filter((role) => previousLook.pieces?.some((piece) => piece.role === role) || role !== "accessory");
}

function candidateScore(
  item: ClothingItem,
  role: AuraLookRole,
  intent: AuraIntentResult,
  usedIds: Set<string>,
) {
  if (usedIds.has(item.id)) return -999;
  if (roleForItem(item) !== role) return -999;
  const scored = scoreAuraItemForIntent(item, {
    occasion: intent.occasion,
    vibe: intent.vibe,
    excludedColors: intent.excludedColors,
    excludedCategories: intent.excludedCategories,
    explicitSportsContext: intent.explicitSportsContext,
  });
  let score = scored.score;
  const text = normalizeAuraClosetItem(item).text;
  const vibe = normalized(intent.vibe);
  if (vibe.includes("dark") && itemHasDarkPalette(item)) score += 1.2;
  if ((vibe.includes("clean") || vibe.includes("classy") || vibe.includes("aura")) && /\b(knit|overshirt|button|trouser|loafer|boot|leather|suede|dark denim|blazer)\b/.test(text)) {
    score += 1.1;
  }
  if (vibe.includes("streetwear") && /\b(sneaker|cargo|oversized|hoodie|jacket|denim)\b/.test(text)) {
    score += 0.7;
  }
  return score;
}

function chooseReplacement(params: {
  role: AuraLookRole;
  items: ClothingItem[];
  intent: AuraIntentResult;
  usedIds: Set<string>;
  previousPiece?: AuraLookPiece | null;
}) {
  const previousId = clean(params.previousPiece?.itemId);
  const candidates = params.items
    .filter((item) => item.id !== previousId)
    .map((item) => ({
      item,
      score: candidateScore(item, params.role, params.intent, params.usedIds),
    }))
    .filter((entry) => entry.score > -50)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.item ?? null;
}

function titleForMutation(previous: AuraLook, intent: AuraIntentResult) {
  if (intent.occasion) return `${intent.occasion.replace(/_/g, " ")} edit`;
  if (intent.vibe) return `${intent.vibe} edit`;
  if (intent.intent === "outfit_iteration") return `New ${previous.lookTitle || "outfit"} version`;
  if (intent.targetItemCategory) return `Updated ${intent.targetItemCategory}`;
  return `Refined ${previous.lookTitle || "look"}`;
}

function compactSummaryLine(role: AuraLookRole, previous?: AuraLookPiece, next?: AuraLookPiece) {
  if (!next || pieceKey(previous ?? next) === pieceKey(next)) return "";
  const roleLabel = role === "shoes" ? "shoes" : role;
  return previous?.itemName
    ? `Swapped ${roleLabel}: ${previous.itemName} -> ${next.itemName}.`
    : `Added ${roleLabel}: ${next.itemName}.`;
}

export function buildAuraOutfitMutationResponse(params: {
  prompt: string;
  previousLook: AuraLook | null;
  items: ClothingItem[];
  intent?: AuraIntentResult;
}): AuraResponse | null {
  const previousLook = params.previousLook;
  if (!previousLook?.pieces?.length) return null;

  const intent =
    params.intent ??
    classifyAuraStylingIntent(params.prompt, {
      hasPreviousOutfit: true,
      previousOccasion: previousLook.occasion,
      previousVibe: previousLook.vibe,
    });
  if (!intent.shouldGenerateOutfit) return null;
  const effectiveIntent: AuraIntentResult = {
    ...intent,
    occasion: intent.occasion ?? canonicalAuraOccasion(previousLook.occasion),
    vibe: intent.vibe || previousLook.vibe || undefined,
  };

  const itemsById = new Map(params.items.map((item) => [item.id, item]));
  const usedIds = lookItemIds(previousLook);
  const rolesToReplace = replacementRolesForIntent(previousLook, itemsById, effectiveIntent);
  const nextPieces = (previousLook.pieces ?? []).map((piece) => ({ ...piece }));
  const warnings: string[] = [];
  const mutationSummary: string[] = [];

  for (const role of rolesToReplace) {
    const index = nextPieces.findIndex((piece) => piece.role === role);
    if (index < 0) continue;
    const previousPiece = nextPieces[index];
    const previousId = clean(previousPiece.itemId);
    if (previousId) usedIds.delete(previousId);
    const replacement = chooseReplacement({
      role,
      items: params.items,
      intent: effectiveIntent,
      usedIds,
      previousPiece,
    });
    if (previousId) usedIds.add(previousId);
    const replacementPiece = replacement ? pieceFromItem(replacement) : null;
    if (!replacementPiece) {
      warnings.push(`I could not find a better ${role === "shoes" ? "shoe" : role} replacement in your closet.`);
      continue;
    }
    nextPieces[index] = replacementPiece;
    usedIds.add(replacementPiece.itemId ?? "");
    const summary = compactSummaryLine(role, previousPiece, replacementPiece);
    if (summary) mutationSummary.push(summary);
  }

  if (effectiveIntent.intent === "outfit_iteration") {
    const changedCount = countMeaningfulItemChanges(previousLook.pieces ?? [], nextPieces);
    if (changedCount < 2) {
      for (const role of ["top", "bottom", "shoes", "outerwear"] as AuraLookRole[]) {
        if (countMeaningfulItemChanges(previousLook.pieces ?? [], nextPieces) >= 2) break;
        if (rolesToReplace.includes(role)) continue;
        const index = nextPieces.findIndex((piece) => piece.role === role);
        if (index < 0) continue;
        const previousPiece = nextPieces[index];
        const replacement = chooseReplacement({
          role,
          items: params.items,
          intent: effectiveIntent,
          usedIds,
          previousPiece,
        });
        const replacementPiece = replacement ? pieceFromItem(replacement) : null;
        if (!replacementPiece) continue;
        nextPieces[index] = replacementPiece;
        usedIds.add(replacementPiece.itemId ?? "");
        const summary = compactSummaryLine(role, previousPiece, replacementPiece);
        if (summary) mutationSummary.push(summary);
      }
    }
  }

  const orderedPieces = ROLE_ORDER.flatMap((role) => nextPieces.filter((piece) => piece.role === role));
  const changedCount = countMeaningfulItemChanges(previousLook.pieces ?? [], orderedPieces);
  if (changedCount === 0) return null;

  const occasion = effectiveIntent.occasion ?? previousLook.occasion ?? null;
  const vibe = effectiveIntent.vibe || previousLook.vibe || "refined closet edit";
  const fromCloset = orderedPieces
    .filter((piece) => piece.source === "closet")
    .map((piece) => piece.itemName)
    .filter(Boolean);
  const look: AuraLook = normalizeAuraLookCardMetadata({
    ...previousLook,
    id: `aura_mutation_${Date.now()}_${orderedPieces.map(pieceKey).join("_").slice(0, 80)}`,
    lookTitle: titleForMutation(previousLook, effectiveIntent),
    occasion,
    vibe,
    shortExplanation:
      effectiveIntent.intent === "outfit_iteration"
        ? "AURA kept the same direction but changed the anchor pieces so it reads like a new outfit."
        : "AURA reworked the outfit around the requested change.",
    stylingNote:
      mutationSummary[0] ??
      (warnings.length ? warnings[0] : "This version keeps the outfit intentional while respecting the new constraint."),
    confidence: Math.min(0.96, 0.72 + changedCount * 0.08),
    warnings,
    replacedFromOutfitId: previousLook.id ?? null,
    mutationSummary,
    stylingIntelligence: null,
    pieces: orderedPieces,
    fromCloset,
    addToComplete: (previousLook.addToComplete ?? []).filter(Boolean),
    alternates: [],
    actions: previousLook.actions?.length
      ? previousLook.actions
      : ["likeLook", "notMyVibe", "showMoreLikeThis", "lessLikeThis", "useOnlyMyCloset", "makeItDressier"],
  }, { prompt: params.prompt, occasion, vibe });

  const warningCopy = warnings.length ? ` ${warnings[0]}` : "";
  return {
    title: "Updated Look",
    presentation: "card",
    reply:
      mutationSummary.length > 0
        ? `${mutationSummary.slice(0, 2).join(" ")}${warningCopy}`.trim()
        : `I changed the outfit into a cleaner version.${warningCopy}`.trim(),
    reason: "",
    outfitItems: fromCloset,
    ownedPieces: fromCloset,
    recommendedAdditions: look.addToComplete,
    swapSuggestion: mutationSummary[0] ?? "",
    missingPieces: warnings.length ? warnings : [],
    upgradeSuggestions: [],
    upgradeSuggestionItems: [],
    chips: ["Give me another version", "Make it darker", "More classy", "Switch the shoes"],
    look,
    lookOptions: [],
  };
}
