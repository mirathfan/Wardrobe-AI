import { getFunctions, httpsCallable } from "firebase/functions";

import { app } from "@/src/lib/firebase";
import { getItemImageUrl } from "@/src/lib/itemImage";
import { generateOutfits } from "@/src/lib/outfitGenerator";
import { toCanonicalCategory } from "@/src/lib/items";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook } from "@/src/types/aura";
import type { StylingIntelligenceSummary } from "@/src/types/StylingIntelligence";

const DEBUG_AURA_SWIPE =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";

export type AuraSwipeDirectionLabel = "left" | "right" | "up";
export type AuraSwipeFeedbackType =
  | "outfit_liked"
  | "outfit_disliked"
  | "outfit_favorited"
  | "outfit_skipped";

export type AuraSwipeBatchLook = {
  id: string;
  position: number;
  score: number;
  reason: string;
  stylingScore?: number;
  stylingIntelligence?: StylingIntelligenceSummary | null;
  directionLabel: "safe" | "balanced" | "bold" | null;
  itemIds: string[];
  look: AuraLook;
};

type GenerateAuraSwipeBatchArgs = {
  intentText?: string;
  numOutfits?: number;
  anchorItemIds?: string[];
  excludeItemIds?: string[];
  recentItemIds?: string[];
  previousLookItemIds?: string[];
  previousLookSignatures?: string[];
  maxOverlap?: number;
};

type OutfitResult = {
  id?: string;
  picks?: { slot: "top" | "bottom" | "footwear" | "outerwear" | "accessory"; itemId: string }[];
  score?: number;
  reason?: string;
  stylingScore?: number;
  stylingIntelligence?: StylingIntelligenceSummary | null;
};

type SwipeBackendResponse = {
  batchId?: string;
  intentText?: string;
  lookOptions?: AuraSwipeBatchLook[];
  looks?: AuraSwipeBatchLook[];
  primaryLook?: AuraSwipeBatchLook | AuraLook | null;
  outfits?: OutfitResult[];
};

type GenerateAuraSwipeBatchResponse = {
  batchId: string;
  intentText: string;
  lookOptions: AuraSwipeBatchLook[];
  primaryLook: AuraSwipeBatchLook | null;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function buildDirectionLabel(index: number, total: number): "safe" | "balanced" | "bold" | null {
  if (total < 3) return null;
  if (index === 0) return "safe";
  if (index === total - 1) return "bold";
  return "balanced";
}

function itemLabel(item?: ClothingItem | null) {
  return (
    cleanString(item?.name) ||
    cleanString(item?.subCategory) ||
    cleanString(item?.category) ||
    "Wardrobe piece"
  );
}

function buildLookFromOutfitResult(
  outfit: OutfitResult,
  itemsById: Map<string, ClothingItem>,
  index: number,
  total: number,
): AuraSwipeBatchLook {
  const pieces = (outfit.picks ?? []).flatMap((pick) => {
    const item = itemsById.get(pick.itemId);
    if (!item) return [];
    return [{
      role: (pick.slot === "footwear" ? "shoes" : pick.slot) as "top" | "bottom" | "shoes" | "outerwear" | "accessory",
      itemName: itemLabel(item),
      source: "closet" as const,
      itemId: pick.itemId,
      imageUrl: getItemImageUrl(item, { variant: "hero" }) ?? getItemImageUrl(item, { variant: "thumb" }) ?? null,
    }];
  });
  const outerwearPiece = pieces.find((piece) => piece.role === "outerwear");
  const topPiece = pieces.find((piece) => piece.role === "top");
  const secondaryPiece = pieces.find(
    (piece) => piece.role !== "outerwear" && piece.role !== "top",
  );
  const directionLabel = buildDirectionLabel(index, total);
  return {
    id: cleanString(outfit.id) || `swipe_${index + 1}`,
    position: index,
    score: typeof outfit.score === "number" ? outfit.score : 0,
    reason: cleanString(outfit.reason),
    stylingScore: outfit.stylingScore,
    stylingIntelligence: outfit.stylingIntelligence ?? null,
    directionLabel,
    itemIds: pieces.map((piece) => piece.itemId),
    look: {
      id: `swipe_${index + 1}_${pieces.map((piece) => piece.itemId).join("_").slice(0, 80)}`,
      lookTitle:
        outerwearPiece && topPiece
          ? `${outerwearPiece.itemName} + ${topPiece.itemName}`
          : topPiece && secondaryPiece
            ? `${topPiece.itemName} + ${secondaryPiece.itemName}`
            : pieces.length >= 2
              ? `${pieces[0].itemName} + ${pieces[1].itemName}`
              : `Aura edit ${index + 1}`,
      vibe: directionLabel ? `${directionLabel} direction` : "wardrobe direction",
      shortExplanation: cleanString(outfit.reason) || "AURA built this from your wardrobe.",
      stylingNote:
        outfit.stylingIntelligence?.stylingNotes?.[0] ??
        (pieces.length > 0
          ? `Lean into ${pieces.slice(0, 3).map((piece) => piece.itemName.toLowerCase()).join(", ")} for a clean, wearable finish.`
          : "Keep the proportions clean and let the outfit breathe."),
      personalizationLabel: directionLabel ? directionLabel.toUpperCase() : undefined,
      personalizationNote: undefined,
      stylingIntelligence: outfit.stylingIntelligence ?? null,
      pieces,
      fromCloset: pieces.map((piece) => piece.itemName),
      addToComplete: [],
      alternates: [],
      actions: [],
    },
  };
}

function normalizeLookOptions(
  response: SwipeBackendResponse,
  itemsById: Map<string, ClothingItem>,
): AuraSwipeBatchLook[] {
  if (Array.isArray(response.lookOptions) && response.lookOptions.length > 0) {
    return response.lookOptions;
  }
  if (Array.isArray(response.looks) && response.looks.length > 0) {
    return response.looks;
  }
  if (response.primaryLook && "look" in response.primaryLook) {
    return [response.primaryLook as AuraSwipeBatchLook];
  }
  if (Array.isArray(response.outfits) && response.outfits.length > 0) {
    return response.outfits.map((outfit, index, list) =>
      buildLookFromOutfitResult(outfit, itemsById, index, list.length),
    );
  }
  return [];
}

function roleForItem(item: ClothingItem): "top" | "bottom" | "shoes" | "outerwear" | "accessory" {
  const category = toCanonicalCategory(item.category);
  if (category === "bottom") return "bottom";
  if (category === "shoes") return "shoes";
  if (category === "outerwear") return "outerwear";
  if (category === "accessory") return "accessory";
  return "top";
}

function hasCoreOutfitCategories(items: ClothingItem[]) {
  const categories = new Set(items.map((item) => toCanonicalCategory(item.category)));
  return categories.has("top") && categories.has("bottom") && categories.has("shoes");
}

function localSwipeBatchFromCloset(
  args: Required<GenerateAuraSwipeBatchArgs> & { items: ClothingItem[] },
): GenerateAuraSwipeBatchResponse | null {
  const itemsById = new Map(args.items.map((item) => [item.id, item]));
  const suggestions = generateOutfits(args.items, {
    vibe: args.intentText,
    includeOuterwear: true,
    includeAccessory: true,
    allowRewearToday: true,
    allowOverWearLimit: true,
    excludeItemIds: args.excludeItemIds,
    recentItemIds: args.recentItemIds,
    previousLookItemIds: args.previousLookItemIds,
    previousLookSignatures: args.previousLookSignatures,
    maxOverlap: args.maxOverlap,
    numOutfits: args.numOutfits,
  }).slice(0, args.numOutfits);

  if (!suggestions.length) return null;

  const lookOptions = suggestions.map<AuraSwipeBatchLook>((suggestion, index, list) => {
    const pieces = suggestion.itemIds.flatMap((itemId) => {
      const item = itemsById.get(itemId);
      if (!item) return [];
      return [{
        role: roleForItem(item),
        itemName: itemLabel(item),
        source: "closet" as const,
        itemId,
        imageUrl: getItemImageUrl(item, { variant: "hero" }) ?? getItemImageUrl(item, { variant: "thumb" }) ?? null,
      }];
    });
    const directionLabel = buildDirectionLabel(index, list.length);
    const firstPiece = pieces[0]?.itemName ?? "Closet";
    const secondPiece = pieces[1]?.itemName ?? "base";
    const addToComplete = suggestion.missingSuggestions ?? [];

    return {
      id: `local_swipe_${index + 1}`,
      position: index,
      score: Math.max(0, pieces.length * 10 - addToComplete.length * 2),
      reason: suggestion.reason,
      directionLabel,
      itemIds: pieces.flatMap((piece) => (piece.itemId ? [piece.itemId] : [])),
      look: {
        id: `local_swipe_${index + 1}_${pieces.map((piece) => piece.itemId).join("_").slice(0, 80)}`,
        lookTitle: pieces.length >= 2 ? `${firstPiece} + ${secondPiece}` : suggestion.title,
        vibe: directionLabel ? `${directionLabel} closet direction` : "closet-first direction",
        shortExplanation: suggestion.reason,
        stylingNote:
          addToComplete.length > 0
            ? "This uses only pieces already in your closet. Missing pieces are listed separately under Add to complete."
            : "Built from category-complete pieces in your closet.",
        personalizationLabel: directionLabel ? directionLabel.toUpperCase() : undefined,
        personalizationNote: "Closet-first fallback from available items.",
        pieces,
        fromCloset: pieces.map((piece) => piece.itemName),
        addToComplete,
        alternates: [],
        actions: [],
      },
    };
  });

  return {
    batchId: `local_swipe_${Date.now()}`,
    intentText: args.intentText,
    lookOptions,
    primaryLook: lookOptions[0] ?? null,
  };
}

async function callGenerateAuraSwipeBatch(args: GenerateAuraSwipeBatchArgs) {
  const functions = getFunctions(app);
  const callable = httpsCallable<GenerateAuraSwipeBatchArgs, SwipeBackendResponse>(
    functions,
    "generateAuraSwipeBatch",
  );
  return callable(args);
}

async function callGenerateOutfitsV1(args: GenerateAuraSwipeBatchArgs) {
  const functions = getFunctions(app);
  const callable = httpsCallable<GenerateAuraSwipeBatchArgs, SwipeBackendResponse>(
    functions,
    "generateOutfitsV1",
  );
  return callable(args);
}

export async function generateAuraSwipeBatch(
  args?: GenerateAuraSwipeBatchArgs & { items?: ClothingItem[] },
): Promise<GenerateAuraSwipeBatchResponse> {
  const request = {
    intentText:
      args?.intentText ??
      "Build a varied batch of outfit directions from my wardrobe. Keep them polished, wearable, and distinct.",
    numOutfits: args?.numOutfits ?? 8,
    anchorItemIds: args?.anchorItemIds ?? [],
    excludeItemIds: args?.excludeItemIds ?? [],
    recentItemIds: args?.recentItemIds ?? [],
    previousLookItemIds: args?.previousLookItemIds ?? [],
    previousLookSignatures: args?.previousLookSignatures ?? [],
    maxOverlap: args?.maxOverlap ?? 2,
  };
  const itemsById = new Map((args?.items ?? []).map((item) => [item.id, item]));
  const localItems = args?.items ?? [];
  const isMissingCoreCategory =
    localItems.length > 0 && !hasCoreOutfitCategories(localItems);
  if (isMissingCoreCategory) {
    const localBatch =
      localSwipeBatchFromCloset({ ...request, items: localItems }) ??
      localSwipeBatchFromCloset({ ...request, excludeItemIds: [], items: localItems });
    if (localBatch) return localBatch;
  }

  try {
    const result = await callGenerateAuraSwipeBatch(request);
    if (DEBUG_AURA_SWIPE) {
      console.log("[AURA_SWIPE]", "callable generateAuraSwipeBatch response", result.data);
    }
    const lookOptions = normalizeLookOptions(result.data ?? {}, itemsById);
    if (lookOptions.length > 0) {
      return {
        batchId: cleanString(result.data?.batchId) || `swipe_${Date.now()}`,
        intentText: cleanString(result.data?.intentText) || request.intentText,
        lookOptions,
        primaryLook: lookOptions[0] ?? null,
      };
    }
    if (DEBUG_AURA_SWIPE) {
      console.log("[AURA_SWIPE]", "generateAuraSwipeBatch returned empty lookOptions", result.data);
    }
  } catch (error) {
    const code = cleanString((error as { code?: unknown })?.code);
    if (DEBUG_AURA_SWIPE) {
      if (code.includes("not-found")) {
        console.log("[AURA_SWIPE] generateAuraSwipeBatch not deployed; using generateOutfitsV1 fallback");
      } else {
        console.log("[AURA_SWIPE] generateAuraSwipeBatch failed; using fallback");
      }
    }
    if (code && !code.includes("not-found")) {
      const localBatch =
        localSwipeBatchFromCloset({ ...request, items: localItems }) ??
        localSwipeBatchFromCloset({ ...request, excludeItemIds: [], items: localItems });
      if (localBatch) return localBatch;
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  const fallback = await callGenerateOutfitsV1(request);
  if (DEBUG_AURA_SWIPE) {
    console.log("[AURA_SWIPE]", "fallback generateOutfitsV1 response", fallback.data);
  }
  const lookOptions = normalizeLookOptions(fallback.data ?? {}, itemsById);
  if (lookOptions.length === 0) {
    const localBatch =
      localSwipeBatchFromCloset({ ...request, items: localItems }) ??
      localSwipeBatchFromCloset({ ...request, excludeItemIds: [], items: localItems });
    if (localBatch) return localBatch;
    if (DEBUG_AURA_SWIPE) {
      console.log("[AURA_SWIPE] no lookOptions after fallback");
    }
    throw new Error("Unable to load swipe looks – empty lookOptions");
  }
  return {
    batchId: cleanString(fallback.data?.batchId) || `swipe_${Date.now()}`,
    intentText: cleanString(fallback.data?.intentText) || request.intentText,
    lookOptions,
    primaryLook: lookOptions[0] ?? null,
  };
}

export function feedbackTypeForSwipe(direction: AuraSwipeDirectionLabel): AuraSwipeFeedbackType {
  if (direction === "left") return "outfit_disliked";
  if (direction === "up") return "outfit_favorited";
  return "outfit_liked";
}
