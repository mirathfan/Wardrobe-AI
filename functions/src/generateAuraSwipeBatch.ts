import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import {
  MODEL,
  clampNumOutfits,
  fetchWardrobeItems,
  generateOutfitCandidates,
  inferRequestedOutfitCount,
  normalizeParsedIntent,
  safeJsonExtract,
  type OutfitIntentV1,
  type Slot,
  type WardrobeItem,
} from "./shared/outfitEngine";
import { loadCompactAuraMemoryContext } from "./shared/auraMemory";
import {
  roleForStylingItem,
  type StylingItem,
  type StylingScoreResult,
} from "./shared/styling/types";
import {
  RATE_LIMITS,
  assertFunctionRateLimit,
  redactUid,
} from "./shared/rateLimit";

if (!getApps().length) {
  initializeApp();
}

type SwipeLookPayload = {
  id: string;
  position: number;
  score: number;
  reason: string;
  stylingScore?: number;
  stylingIntelligence?: StylingScoreResult;
  directionLabel: "safe" | "balanced" | "bold" | null;
  itemIds: string[];
  look: {
    id?: string | null;
    lookTitle: string;
    vibe: string;
    shortExplanation: string;
    stylingNote: string;
    personalizationLabel?: string;
    personalizationNote?: string;
    stylingIntelligence?: StylingScoreResult | null;
    pieces: Array<{
      role: "top" | "bottom" | "shoes" | "outerwear" | "accessory";
      itemName: string;
      source: "closet";
      itemId: string;
      imageUrl?: string | null;
    }>;
    fromCloset: string[];
    addToComplete: string[];
    alternates: string[];
    actions: [];
  };
};

type GeneratedSwipeCandidate = ReturnType<typeof generateOutfitCandidates>["outfits"][number];

async function parseSwipeIntent(
  intentText: string,
): Promise<{ intent: OutfitIntentV1; numOutfits: number | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      intent: normalizeParsedIntent(null, intentText),
      numOutfits: inferRequestedOutfitCount(intentText),
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Extract outfit intent from user text.",
              "Return JSON only with keys: occasion, formalityTarget, warmthTarget, needs, niceToHave, colorsWanted, colorsAvoid, avoidLogos, excludeLaundry, numOutfits.",
              "No markdown. No prose. No additional keys.",
              "occasion enum: casual, smart_casual, formal, gym, date, work, party, travel, unknown.",
              "needs defaults to [top,bottom,footwear]. niceToHave may include outerwear and accessory.",
              "excludeLaundry defaults true.",
              "If the user asks for a count of outfits, set numOutfits to that number. Otherwise set numOutfits to null.",
            ].join(" "),
          },
          { role: "user", content: intentText },
        ],
      }),
    });

    if (!response.ok) {
      return {
        intent: normalizeParsedIntent(null, intentText),
        numOutfits: inferRequestedOutfitCount(intentText),
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonExtract<Partial<OutfitIntentV1> & { numOutfits?: number | null }>(content);
    return {
      intent: normalizeParsedIntent(parsed, intentText),
      numOutfits:
        parsed?.numOutfits == null ? inferRequestedOutfitCount(intentText) : Number(parsed.numOutfits),
    };
  } catch {
    return {
      intent: normalizeParsedIntent(null, intentText),
      numOutfits: inferRequestedOutfitCount(intentText),
    };
  }
}

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function itemLabel(item?: WardrobeItem | null) {
  return (
    cleanString(item?.name) ||
    cleanString(item?.subCategory) ||
    cleanString(item?.category) ||
    "Wardrobe piece"
  );
}

function itemImageUrl(item?: WardrobeItem | null) {
  return (
    cleanString(item?.photos?.cleanedPhotoUrl) ||
    cleanString(item?.photos?.cleanedUrl) ||
    cleanString(item?.photos?.primaryUrl) ||
    cleanString(item?.photoUrl) ||
    cleanString(item?.photos?.thumbUrl) ||
    null
  );
}

function buildLookTitle(outfit: GeneratedSwipeCandidate, itemsById: Map<string, WardrobeItem>, index: number) {
  const top = outfit.picks.find((pick) => pick.slot === "top");
  const bottom = outfit.picks.find((pick) => pick.slot === "bottom");
  const topName = itemLabel(top ? itemsById.get(top.itemId) : null);
  const bottomName = itemLabel(bottom ? itemsById.get(bottom.itemId) : null);
  if (topName && bottomName) {
    return `${topName} + ${bottomName}`;
  }
  return `Aura edit ${index + 1}`;
}

function buildStylingNote(outfit: GeneratedSwipeCandidate, itemsById: Map<string, WardrobeItem>) {
  const categories = outfit.picks
    .map((pick) => itemLabel(itemsById.get(pick.itemId)))
    .filter(Boolean)
    .slice(0, 3);
  return categories.length
    ? `Lean into ${categories.join(", ").toLowerCase()} for a clean, wearable finish.`
    : "Keep the proportions clean and let the outfit breathe.";
}

function buildDirectionLabel(index: number, total: number): "safe" | "balanced" | "bold" | null {
  if (total < 3) return null;
  if (index === 0) return "safe";
  if (index === total - 1) return "bold";
  return "balanced";
}

function slotForAnchorItem(item: WardrobeItem): Slot | null {
  const role = roleForStylingItem(item as StylingItem);
  if (role === "footwear") return "footwear";
  if (role === "top" || role === "bottom" || role === "outerwear" || role === "accessory") {
    return role;
  }
  return null;
}

function lockedItemsForAnchors(
  anchorItemIds: string[],
  itemsById: Map<string, WardrobeItem>,
): Partial<Record<Slot, WardrobeItem>> | undefined {
  const locked: Partial<Record<Slot, WardrobeItem>> = {};
  for (const itemId of anchorItemIds) {
    const item = itemsById.get(itemId);
    if (!item) continue;
    const slot = slotForAnchorItem(item);
    if (!slot || locked[slot]) continue;
    locked[slot] = item;
  }
  return Object.keys(locked).length ? locked : undefined;
}

function cleanItemIdList(value: unknown, max = 8) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of value) {
    const itemId = String(entry ?? "").trim();
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    ids.push(itemId);
    if (ids.length >= max) break;
  }
  return ids;
}

function requiredItemIdsFromRequest(data: unknown) {
  const raw = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return cleanItemIdList([
    ...cleanItemIdList(raw.requiredItemIds, 8),
    ...cleanItemIdList(raw.mustIncludeItemIds, 8),
  ], 8);
}

function filterOutfitsForRequiredItems<T extends { itemIds: string[] }>(
  outfits: T[],
  requiredItemIds: string[],
) {
  if (!requiredItemIds.length) return outfits;
  return outfits.filter((outfit) =>
    requiredItemIds.every((itemId) => outfit.itemIds.includes(itemId)),
  );
}

function toSwipeLook(
  outfit: GeneratedSwipeCandidate,
  itemsById: Map<string, WardrobeItem>,
  index: number,
  total: number,
  learnedSummary: string | null,
): SwipeLookPayload {
  const pieces = outfit.picks.flatMap((pick) => {
    const item = itemsById.get(pick.itemId);
    if (!item) return [];
    return [{
      role: (pick.slot === "footwear" ? "shoes" : pick.slot) as "top" | "bottom" | "shoes" | "outerwear" | "accessory",
      itemName: itemLabel(item),
      source: "closet" as const,
      itemId: pick.itemId,
      imageUrl: itemImageUrl(item),
    }];
  });

  const fromCloset = pieces.map((piece) => piece.itemName).filter(Boolean);
  const directionLabel = buildDirectionLabel(index, total);

  return {
    id: `swipe_${index + 1}`,
    position: index,
    score: Math.round(outfit.score * 100) / 100,
    reason: cleanString(outfit.reason),
    stylingScore: outfit.stylingScore,
    stylingIntelligence: outfit.stylingIntelligence,
    directionLabel,
    itemIds: outfit.picks.map((pick) => pick.itemId),
    look: {
      id: `swipe_${index + 1}_${outfit.picks.map((pick) => pick.itemId).join("_").slice(0, 80)}`,
      lookTitle: buildLookTitle(outfit, itemsById, index),
      vibe: directionLabel ? `${directionLabel} direction` : "wardrobe direction",
      shortExplanation: cleanString(outfit.reason) || "AURA built this from your wardrobe.",
      stylingNote: outfit.stylingIntelligence?.stylingNotes[0] ?? buildStylingNote(outfit, itemsById),
      personalizationLabel: directionLabel ? directionLabel.toUpperCase() : undefined,
      personalizationNote: learnedSummary || undefined,
      stylingIntelligence: outfit.stylingIntelligence ?? null,
      pieces,
      fromCloset,
      addToComplete: [],
      alternates: [],
      actions: [],
    },
  };
}

export const generateAuraSwipeBatch = onCall(
  { secrets: ["OPENAI_API_KEY"] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }
    await assertFunctionRateLimit(uid, "outfitGeneration", RATE_LIMITS.outfitGeneration);
    const uidHash = redactUid(uid);

    const intentText = cleanString(request.data?.intentText) ||
      "Build a varied batch of outfit directions from my wardrobe. Keep them polished, wearable, and distinct.";
    const parsed = await parseSwipeIntent(intentText);
    const requestedNumOutfits =
      request.data?.numOutfits ?? parsed.numOutfits ?? inferRequestedOutfitCount(intentText) ?? 8;
    const numOutfits = clampNumOutfits(requestedNumOutfits, 8);
    const excludeItemIds = Array.isArray(request.data?.excludeItemIds)
      ? request.data.excludeItemIds.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 24)
      : [];
    const recentItemIds = Array.isArray(request.data?.recentItemIds)
      ? request.data.recentItemIds.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 36)
      : [];
    const requiredItemIds = requiredItemIdsFromRequest(request.data);
    const anchorItemIds = cleanItemIdList([
      ...requiredItemIds,
      ...(Array.isArray(request.data?.anchorItemIds) ? request.data.anchorItemIds : []),
    ], requiredItemIds.length ? 8 : 3);
    const previousLookItemIds = Array.isArray(request.data?.previousLookItemIds)
      ? request.data.previousLookItemIds.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 12)
      : [];
    const previousLookSignatures = Array.isArray(request.data?.previousLookSignatures)
      ? request.data.previousLookSignatures.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 12)
      : [];
    const maxOverlap = Number.isFinite(Number(request.data?.maxOverlap))
      ? Math.max(0, Math.min(3, Math.round(Number(request.data.maxOverlap))))
      : 2;

    const db = getFirestore();
    const allItems = await fetchWardrobeItems(db, uid);
    const memory = await loadCompactAuraMemoryContext(db, uid, null);
    const itemsById = new Map(allItems.map((item) => [item.id, item]));
    const missingRequiredItemIds = requiredItemIds.filter((itemId) => !itemsById.has(itemId));
    if (missingRequiredItemIds.length) {
      throw new HttpsError("failed-precondition", "Selected closet item is no longer available.");
    }
    const lockedItemsBySlot = lockedItemsForAnchors(anchorItemIds, itemsById);
    if (requiredItemIds.length && Object.keys(lockedItemsBySlot ?? {}).length < requiredItemIds.length) {
      throw new HttpsError("failed-precondition", "Selected closet item cannot be used as an outfit anchor.");
    }
    let generated = generateOutfitCandidates(allItems, parsed.intent, {
      numOutfits,
      memory,
      excludeItemIds,
      lockedItemsBySlot,
      diversity: {
        recentItemIds,
        previousLookItemIds,
        previousLookSignatures,
        maxOverlap,
      },
    });
    generated = {
      ...generated,
      outfits: filterOutfitsForRequiredItems(generated.outfits, requiredItemIds),
    };
    if (!generated.outfits.length && requiredItemIds.length) {
      throw new HttpsError("failed-precondition", "Could not build an outfit with the selected closet item.");
    }
    if (!generated.outfits.length && lockedItemsBySlot) {
      generated = generateOutfitCandidates(allItems, parsed.intent, {
        numOutfits,
        memory,
        excludeItemIds,
        diversity: {
          recentItemIds,
          previousLookItemIds,
          previousLookSignatures,
          maxOverlap,
        },
      });
    }
    generated = {
      ...generated,
      outfits: filterOutfitsForRequiredItems(generated.outfits, requiredItemIds),
    };
    if (!generated.outfits.length && requiredItemIds.length) {
      throw new HttpsError("failed-precondition", "Could not build an outfit with the selected closet item.");
    }
    if (!generated.outfits.length && excludeItemIds.length) {
      generated = generateOutfitCandidates(allItems, parsed.intent, {
        numOutfits,
        memory,
        excludeItemIds: [],
        diversity: {
          recentItemIds,
          previousLookItemIds,
          previousLookSignatures,
          maxOverlap,
        },
      });
    }
    generated = {
      ...generated,
      outfits: filterOutfitsForRequiredItems(generated.outfits, requiredItemIds),
    };
    if (!generated.outfits.length && requiredItemIds.length) {
      throw new HttpsError("failed-precondition", "Could not build an outfit with the selected closet item.");
    }

    logger.info("generateAuraSwipeBatch built batch", {
      uidHash,
      requestedNumOutfits,
      numOutfits,
      eligibleCount: generated.eligibleCount,
      slotCounts: generated.slotCounts,
      returned: generated.outfits.length,
      fallbackMode: generated.fallbackMode ?? "strict",
      diversity: {
        excludeItemCount: excludeItemIds.length,
        previousLookItemCount: previousLookItemIds.length,
        recentItemCount: recentItemIds.length,
        anchorItemCount: anchorItemIds.length,
        requiredItemCount: requiredItemIds.length,
        lockedAnchorSlots: Object.keys(lockedItemsBySlot ?? {}),
        previousLookSignatureCount: previousLookSignatures.length,
        maxOverlap,
      },
    });

    const lookOptions = generated.outfits.map((outfit, index) =>
      toSwipeLook(outfit, itemsById, index, generated.outfits.length, memory.learnedProfile?.summaryShort ?? null),
    );

    logger.info("generateAuraSwipeBatch response payload", {
      uidHash,
      lookCount: lookOptions.length,
      lookTitleCount: lookOptions.filter((entry) => !!entry.look.lookTitle).length,
      itemCounts: lookOptions.map((entry) => entry.look.pieces.length),
    });

    return {
      batchId: `swipe_${Date.now()}`,
      intentText,
      lookOptions,
      primaryLook: lookOptions[0] ?? null,
      looks: lookOptions,
    };
  },
);
