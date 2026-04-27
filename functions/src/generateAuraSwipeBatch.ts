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
  type WardrobeItem,
} from "./shared/outfitEngine";
import { loadCompactAuraMemoryContext } from "./shared/auraMemory";

if (!getApps().length) {
  initializeApp();
}

type SwipeLookPayload = {
  id: string;
  position: number;
  score: number;
  reason: string;
  directionLabel: "safe" | "balanced" | "bold" | null;
  itemIds: string[];
  look: {
    lookTitle: string;
    vibe: string;
    shortExplanation: string;
    stylingNote: string;
    personalizationLabel?: string;
    personalizationNote?: string;
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
      role: (pick.slot === "footwear" ? "shoes" : pick.slot) as "top" | "bottom" | "shoes" | "outerwear",
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
    directionLabel,
    itemIds: outfit.picks.map((pick) => pick.itemId),
    look: {
      lookTitle: buildLookTitle(outfit, itemsById, index),
      vibe: directionLabel ? `${directionLabel} direction` : "wardrobe direction",
      shortExplanation: cleanString(outfit.reason) || "AURA built this from your wardrobe.",
      stylingNote: buildStylingNote(outfit, itemsById),
      personalizationLabel: directionLabel ? directionLabel.toUpperCase() : undefined,
      personalizationNote: learnedSummary || undefined,
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

    const intentText = cleanString(request.data?.intentText) ||
      "Build a varied batch of outfit directions from my wardrobe. Keep them polished, wearable, and distinct.";
    const parsed = await parseSwipeIntent(intentText);
    const requestedNumOutfits =
      request.data?.numOutfits ?? parsed.numOutfits ?? inferRequestedOutfitCount(intentText) ?? 8;
    const numOutfits = clampNumOutfits(requestedNumOutfits, 8);

    const db = getFirestore();
    const allItems = await fetchWardrobeItems(db, uid);
    const memory = await loadCompactAuraMemoryContext(db, uid, null);
    const generated = generateOutfitCandidates(allItems, parsed.intent, {
      numOutfits,
      memory,
    });

    logger.info("generateAuraSwipeBatch built batch", {
      uid,
      requestedNumOutfits,
      numOutfits,
      eligibleCount: generated.eligibleCount,
      slotCounts: generated.slotCounts,
      returned: generated.outfits.length,
      fallbackMode: generated.fallbackMode ?? "strict",
    });

    const itemsById = new Map(allItems.map((item) => [item.id, item]));
    const lookOptions = generated.outfits.map((outfit, index) =>
      toSwipeLook(outfit, itemsById, index, generated.outfits.length, memory.learnedProfile?.summaryShort ?? null),
    );

    logger.info("generateAuraSwipeBatch response payload", {
      uid,
      lookCount: lookOptions.length,
      lookTitles: lookOptions.map((entry) => entry.look.lookTitle),
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
