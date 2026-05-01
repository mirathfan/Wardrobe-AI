import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  clampNumOutfits,
  MODEL,
  OutfitIntentV1,
  fetchWardrobeItems,
  generateOutfitCandidates,
  inferRequestedOutfitCount,
  normalizeParsedIntent,
  persistGeneratedOutfits,
  safeJsonExtract,
} from "./shared/outfitEngine";
import { loadCompactAuraMemoryContext } from "./shared/auraMemory";

if (!getApps().length) {
  initializeApp();
}

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isOuterwearItem(item: { category?: string | null; subCategory?: string | null; type?: string | null; name?: string | null }) {
  const category = String(item.category ?? "").trim().toLowerCase();
  const tokens = normalizedText(
    [item.category, item.subCategory, item.type, item.name].filter(Boolean).join(" "),
  );
  return (
    category === "outerwear" ||
    /\b(jacket|coat|outerwear|overshirt|blazer|hoodie|cardigan|shacket|trench|parka|bomber|denim jacket)\b/.test(
      tokens,
    )
  );
}

function enforceOuterwearOnOutfits(params: {
  outfits: Array<{
    picks: Array<{ slot: "top" | "bottom" | "footwear" | "outerwear" | "accessory"; itemId: string }>;
    score: number;
    reason: string;
    itemIds: string[];
  }>;
  allItems: Array<{ id: string; category?: string; subCategory?: string; type?: string | null; name?: string | null }>;
  requireOuterwear: boolean;
}) {
  const { outfits, allItems, requireOuterwear } = params;
  const outerwearPool = allItems.filter(isOuterwearItem);
  if (!requireOuterwear || outerwearPool.length === 0) {
    return {
      outfits,
      availableOuterwearCount: outerwearPool.length,
      repairedCount: 0,
    };
  }

  const usedOuterwearIds = new Set<string>();
  let repairedCount = 0;
  const repaired = outfits.map((outfit) => {
    if (outfit.picks.some((pick) => pick.slot === "outerwear")) {
      const currentOuterwearId = outfit.picks.find((pick) => pick.slot === "outerwear")?.itemId;
      if (currentOuterwearId) usedOuterwearIds.add(currentOuterwearId);
      return {
        ...outfit,
        itemIds: outfit.itemIds,
      };
    }

    const existingIds = new Set(outfit.picks.map((pick) => pick.itemId));
    const candidate =
      outerwearPool.find((item) => !existingIds.has(item.id) && !usedOuterwearIds.has(item.id)) ??
      outerwearPool.find((item) => !existingIds.has(item.id)) ??
      outerwearPool[0];

    if (!candidate) {
      return outfit;
    }

    usedOuterwearIds.add(candidate.id);
    repairedCount += 1;
    return {
      ...outfit,
      picks: [{ slot: "outerwear" as const, itemId: candidate.id }, ...outfit.picks],
      itemIds: [candidate.id, ...outfit.itemIds],
      reason: outfit.reason.includes("outerwear")
        ? outfit.reason
        : `${outfit.reason.replace(/\.\s*$/, "")}, layered with ${candidate.name ?? "outerwear"}.`,
    };
  });

  return {
    outfits: repaired.filter((outfit) => outfit.picks.some((pick) => pick.slot === "outerwear")),
    availableOuterwearCount: outerwearPool.length,
    repairedCount,
  };
}

async function parseOutfitIntent(
  intentText: string
): Promise<{intent: OutfitIntentV1; numOutfits: number | null}> {
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
        response_format: {type: "json_object"},
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
          {role: "user", content: intentText},
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
      choices?: Array<{message?: {content?: string}}>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = safeJsonExtract<Partial<OutfitIntentV1> & {numOutfits?: number | null}>(content);
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

export const generateOutfitsV1 = onCall(
  {secrets: ["OPENAI_API_KEY"]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const intentText = String(request.data?.intentText ?? "").trim();
    if (!intentText) {
      throw new HttpsError("invalid-argument", "intentText is required");
    }

    const parsed = await parseOutfitIntent(intentText);
    const requestedNumOutfits =
      request.data?.numOutfits ?? parsed.numOutfits ?? inferRequestedOutfitCount(intentText) ?? 3;
    const numOutfits = clampNumOutfits(requestedNumOutfits, 3);
    const parsedIntent = parsed.intent;
    logger.info("generateOutfitsV1 parsed intent", {
      uid,
      parsedIntent,
      requestedNumOutfits,
      numOutfits,
    });

    const db = getFirestore();
    const allItems = await fetchWardrobeItems(db, uid);
    const memory = await loadCompactAuraMemoryContext(db, uid, null);
    const generated = generateOutfitCandidates(allItems, parsedIntent, {
      numOutfits,
      memory,
    });
    const outerwearAvailable = allItems.filter((item) =>
      isOuterwearItem({
        category: item.category,
        subCategory: item.subCategory,
        type: (item as { type?: string | null }).type ?? null,
        name: item.name ?? null,
      }),
    ).length;

    logger.info("generateOutfitsV1 slot counts", {
      uid,
      total: allItems.length,
      eligible: generated.eligibleCount,
      ...generated.slotCounts,
      fallbackMode: generated.fallbackMode ?? "strict",
      requiresOuterwear: parsedIntent.requireOuterwear === true,
      availableOuterwearCount: outerwearAvailable,
    });

    const enforced = enforceOuterwearOnOutfits({
      outfits: generated.outfits,
      allItems: allItems.map((item) => ({
        id: item.id,
        category: item.category,
        subCategory: item.subCategory,
        type: (item as { type?: string | null }).type ?? null,
        name: item.name ?? null,
      })),
      requireOuterwear: parsedIntent.requireOuterwear === true,
    });
    const enforcedOutfits = enforced.outfits;

    logger.info("generateOutfitsV1 outerwear enforcement", {
      uid,
      requiresOuterwear: parsedIntent.requireOuterwear === true,
      availableOuterwearCount: enforced.availableOuterwearCount,
      generatedCount: generated.outfits.length,
      enforcedCount: enforcedOutfits.length,
      repairedCount: enforced.repairedCount,
      outerwearCountPerLook: enforcedOutfits.map(
        (outfit) => outfit.picks.filter((pick) => pick.slot === "outerwear").length,
      ),
    });

    const outfits = await persistGeneratedOutfits({
      db,
      uid,
      intentText,
      intent: generated.intent,
      outfits: enforcedOutfits,
    });

    logger.info("generateOutfitsV1 selected outfits", {
      uid,
      requestedNumOutfits,
      numOutfits,
      fallbackMode: generated.fallbackMode ?? "strict",
      outfits: outfits.map((outfit) => ({
        id: outfit.id,
        score: outfit.score,
        itemIds: outfit.picks.map((pick) => pick.itemId),
        outerwearCount: outfit.picks.filter((pick) => pick.slot === "outerwear").length,
      })),
    });

    return {outfits};
  }
);
