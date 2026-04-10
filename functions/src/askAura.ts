import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import OpenAI from "openai";
import { getFirestore } from "firebase-admin/firestore";

import { AURA_INSTRUCTIONS } from "./shared/auraPrompt";
import { buildAuraContext } from "./shared/buildAuraContext";
import { loadAuraUserProfile } from "./shared/loadAuraUserProfile";

const db = getFirestore();

type AuraResponse = {
  presentation: "chat" | "card";
  title: string;
  reply: string;
  reason: string;
  outfitItems: string[];
  ownedPieces: string[];
  recommendedAdditions: string[];
  swapSuggestion: string;
  chips: string[];
  look: {
    lookTitle: string;
    vibe: string;
    shortExplanation: string;
    stylingNote: string;
    pieces: {
      role: "top" | "bottom" | "shoes" | "outerwear" | "accessory";
      itemName: string;
      source: "closet" | "suggested";
      itemId: string | null;
      imageUrl: string | null;
    }[];
    fromCloset: string[];
    addToComplete: string[];
    alternates: string[];
    actions: (
      "saveLook" | "planForToday" | "showMoreLikeThis" | "shopMissingPieces" | "useOnlyMyCloset" | "makeItDressier"
    )[];
  } | null;
};

function fallbackAuraResponse(raw: string): AuraResponse {
  return {
    presentation: "chat",
    title: "AURA",
    reply: raw,
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    chips: [],
    look: null,
  };
}

function shortenLookReply(text: string) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.length <= 120) return trimmed;
  const sentence = trimmed.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  if (sentence && sentence.length <= 120) return sentence;
  return `${trimmed.slice(0, 117).trimEnd()}...`;
}

function normalizeAuraResponse(
  response: AuraResponse,
  auraContext?: {
    wardrobe?: {
      footwear?: Record<string, string>[];
    };
  }
) {
  if (response.look) {
    response.reply = shortenLookReply(response.reply);
    response.reason = "";
    if (response.look.stylingNote) {
      response.look.stylingNote = shortenLookReply(response.look.stylingNote);
    }

    const ownedPieces = response.look.pieces
      .filter((piece) => piece.source === "closet")
      .map((piece) => piece.itemName)
      .filter(Boolean);
    const suggestedPieces = response.look.pieces
      .filter((piece) => piece.source === "suggested")
      .map((piece) => piece.itemName)
      .filter(Boolean);

    response.ownedPieces = Array.from(new Set(ownedPieces));
    response.recommendedAdditions = Array.from(
      new Set(suggestedPieces.filter((piece) => !response.ownedPieces.includes(piece)))
    );
    response.look.fromCloset = response.ownedPieces;
    response.look.addToComplete = response.recommendedAdditions;

    const eligibleFootwear = auraContext?.wardrobe?.footwear ?? [];
    const selectedOwnedFootwear = response.look.pieces.filter(
      (piece) => piece.role === "shoes" && piece.source === "closet"
    );
    const selectedSuggestedFootwear = response.look.pieces.filter(
      (piece) => piece.role === "shoes" && piece.source === "suggested"
    );

    if (eligibleFootwear.length > 0 && selectedOwnedFootwear.length === 0) {
      logger.info("AURA footwear mismatch", {
        eligibleFootwear,
        selectedSuggestedFootwear,
        selectedPieces: response.look.pieces,
      });
    }
  }
  return response;
}

export const askAura = onCall(
  { secrets: ["OPENAI_API_KEY"] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "User must be signed in.");
    }

    const userMessage = String(request.data?.message || "").trim();
    const history = Array.isArray(request.data?.history)
      ? request.data.history
          .map((entry: unknown) => {
            if (!entry || typeof entry !== "object") return null;
            const candidate = entry as Record<string, unknown>;
            const role = candidate.role === "assistant" ? "assistant" : candidate.role === "user" ? "user" : null;
            const text = String(candidate.text ?? "").trim();
            if (!role || !text) return null;
            return { role, text };
          })
          .filter(
            (entry: { role: "user" | "assistant"; text: string } | null): entry is { role: "user" | "assistant"; text: string } =>
              !!entry
          )
          .slice(-8)
      : [];
    const selectedDate = request.data?.selectedDate || null;
    const occasion = request.data?.occasion || null;

    if (!userMessage) {
      throw new HttpsError("invalid-argument", "Message is required.");
    }

    const itemsSnap = await db.collection("users").doc(uid).collection("items").get();
    const items = itemsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as (Record<string, unknown> & { id: string })[];

    const auraContext = buildAuraContext({
      items,
      weather: request.data?.weather || null,
      occasion,
      selectedDate,
    });
    logger.info("AURA closet context", {
      counts: auraContext.counts,
      footwearAvailable: auraContext.wardrobeDebug?.footwearAvailable ?? [],
      excludedFootwear: auraContext.wardrobeDebug?.excludedFootwear ?? [],
    });
    const userProfile = await loadAuraUserProfile(uid);

    try {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      const response = await client.responses.create({
        model: "gpt-5.4",
        input: [
          {
            role: "developer",
            content: AURA_INSTRUCTIONS,
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `User profile:\n${JSON.stringify(userProfile, null, 2)}\n\n` +
                  `Aura context:\n${JSON.stringify(auraContext, null, 2)}\n\n` +
                  `Recent conversation:\n${JSON.stringify(history, null, 2)}\n\n` +
                  `User request:\n${userMessage}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "aura_response",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                presentation: {
                  type: "string",
                  enum: ["chat", "card"],
                  description: "Whether this reply should render as a normal assistant message or a structured assistant card.",
                },
                title: {
                  type: "string",
                  description: "Short punchy title when a card is useful. Keep minimal for chat.",
                },
                reply: {
                  type: "string",
                  description: "Main assistant reply. Conversational, polished, and concise.",
                },
                reason: {
                  type: "string",
                  description: "Short explanation only when it adds value. Leave empty for normal chat.",
                },
                outfitItems: {
                  type: "array",
                  description: "Concise wardrobe item labels only when a structured card is useful.",
                  items: { type: "string" },
                },
                ownedPieces: {
                  type: "array",
                  description: "Pieces from the user's actual wardrobe that are part of the recommendation.",
                  items: { type: "string" },
                },
                recommendedAdditions: {
                  type: "array",
                  description: "Pieces the user does not own but should add to complete the look.",
                  items: { type: "string" },
                },
                swapSuggestion: {
                  type: "string",
                  description: "One short direct swap suggestion. Leave empty if not needed.",
                },
                chips: {
                  type: "array",
                  description: "Useful next prompts for AURA, short and action-oriented.",
                  items: { type: "string" },
                },
                look: {
                  anyOf: [
                    { type: "null" },
                    {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        lookTitle: { type: "string" },
                        vibe: { type: "string" },
                        shortExplanation: { type: "string" },
                        stylingNote: { type: "string" },
                        pieces: {
                          type: "array",
                          items: {
                            type: "object",
                            additionalProperties: false,
                            properties: {
                              role: { type: "string", enum: ["top", "bottom", "shoes", "outerwear", "accessory"] },
                              itemName: { type: "string" },
                              source: { type: "string", enum: ["closet", "suggested"] },
                              itemId: { type: ["string", "null"] },
                              imageUrl: { type: ["string", "null"] },
                            },
                            required: ["role", "itemName", "source", "itemId", "imageUrl"],
                          },
                        },
                        fromCloset: { type: "array", items: { type: "string" } },
                        addToComplete: { type: "array", items: { type: "string" } },
                        alternates: { type: "array", items: { type: "string" } },
                        actions: {
                          type: "array",
                          items: {
                            type: "string",
                            enum: ["saveLook", "planForToday", "showMoreLikeThis", "shopMissingPieces", "useOnlyMyCloset", "makeItDressier"],
                          },
                        },
                      },
                      required: ["lookTitle", "vibe", "shortExplanation", "stylingNote", "pieces", "fromCloset", "addToComplete", "alternates", "actions"],
                    },
                  ],
                },
              },
              required: [
                "presentation",
                "title",
                "reply",
                "reason",
                "outfitItems",
                "ownedPieces",
                "recommendedAdditions",
                "swapSuggestion",
                "chips",
                "look",
              ],
            },
          },
        },
      });

      const raw = String(response.output_text || "{}");
      let parsed: AuraResponse;

      try {
        parsed = JSON.parse(raw) as AuraResponse;
      } catch {
        parsed = fallbackAuraResponse(raw);
      }

      return { ok: true, data: normalizeAuraResponse(parsed, auraContext) };
    } catch (error) {
      logger.error("askAura failed", {
        uid,
        message: userMessage,
        error,
      });
      throw new HttpsError("internal", "Aura could not respond right now.");
    }
  }
);
