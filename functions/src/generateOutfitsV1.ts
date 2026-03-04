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

if (!getApps().length) {
  initializeApp();
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
    const generated = generateOutfitCandidates(allItems, parsedIntent, {numOutfits});

    logger.info("generateOutfitsV1 slot counts", {
      uid,
      total: allItems.length,
      eligible: generated.eligibleCount,
      ...generated.slotCounts,
    });

    const outfits = await persistGeneratedOutfits({
      db,
      uid,
      intentText,
      intent: generated.intent,
      outfits: generated.outfits,
    });

    logger.info("generateOutfitsV1 selected outfits", {
      uid,
      requestedNumOutfits,
      numOutfits,
      outfits: outfits.map((outfit) => ({
        id: outfit.id,
        score: outfit.score,
        itemIds: outfit.picks.map((pick) => pick.itemId),
      })),
    });

    return {outfits};
  }
);
