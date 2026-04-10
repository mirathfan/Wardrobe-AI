import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import OpenAI from "openai";

import { AURA_INSTRUCTIONS, AURA_STREAM_INSTRUCTIONS } from "./shared/auraPrompt";
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
      logger.info("AURA stream footwear mismatch", {
        eligibleFootwear,
        selectedSuggestedFootwear,
        selectedPieces: response.look.pieces,
      });
    }
  }
  return response;
}

function writeEvent(
  res: {
    write: (chunk: string) => void;
    flush?: () => void;
  },
  payload: Record<string, unknown>
) {
  res.write(`${JSON.stringify(payload)}\n`);
  res.flush?.();
}

function fallbackAuraResponse(reply: string): AuraResponse {
  return {
    presentation: "chat",
    title: "AURA",
    reply,
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    chips: [],
    look: null,
  };
}

export const askAuraStream = onRequest(
  { cors: true, secrets: ["OPENAI_API_KEY"] },
  async (req, res) => {
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.flushHeaders?.();

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const authHeader = String(req.headers.authorization ?? "");
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

    if (!idToken) {
      res.status(401).json({ error: "Missing auth token" });
      return;
    }

    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      const userMessage = String(req.body?.message ?? "").trim();
      const history = Array.isArray(req.body?.history)
        ? req.body.history
            .map((entry: unknown) => {
              if (!entry || typeof entry !== "object") return null;
              const candidate = entry as Record<string, unknown>;
              const role =
                candidate.role === "assistant"
                  ? "assistant"
                  : candidate.role === "user"
                    ? "user"
                    : null;
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

      if (!userMessage) {
        res.status(400).json({ error: "Message is required." });
        return;
      }

      const itemsSnap = await db.collection("users").doc(uid).collection("items").get();
      const items = itemsSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as (Record<string, unknown> & { id: string })[];

      const auraContext = buildAuraContext({
        items,
        weather: req.body?.weather || null,
        occasion: req.body?.occasion || null,
        selectedDate: req.body?.selectedDate || null,
      });
      logger.info("AURA stream closet context", {
        counts: auraContext.counts,
        footwearAvailable: auraContext.wardrobeDebug?.footwearAvailable ?? [],
        excludedFootwear: auraContext.wardrobeDebug?.excludedFootwear ?? [],
      });
      const userProfile = await loadAuraUserProfile(uid);

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const requestText =
        `User profile:\n${JSON.stringify(userProfile, null, 2)}\n\n` +
        `Aura context:\n${JSON.stringify(auraContext, null, 2)}\n\n` +
        `Recent conversation:\n${JSON.stringify(history, null, 2)}\n\n` +
        `User request:\n${userMessage}`;

      writeEvent(res, { type: "status", status: "responding" });

      let streamedText = "";
      const stream = client.responses.stream({
        model: "gpt-5.4",
        input: [
          {
            role: "developer",
            content: AURA_STREAM_INSTRUCTIONS,
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: requestText,
              },
            ],
          },
        ],
      });

      for await (const event of stream) {
        if (event.type === "response.output_text.delta" && event.delta) {
          streamedText += event.delta;
          writeEvent(res, { type: "delta", delta: event.delta });
        }
      }

      const finalReply = streamedText.trim();

      const structured = await client.responses.create({
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
                  `${requestText}\n\n` +
                  `Draft assistant reply already shown to the user:\n${finalReply}\n\n` +
                  "Use that draft reply as the final reply unless a tiny cleanup is needed. Do not materially rewrite the response.",
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
                presentation: { type: "string", enum: ["chat", "card"] },
                title: { type: "string" },
                reply: { type: "string" },
                reason: { type: "string" },
                outfitItems: { type: "array", items: { type: "string" } },
                ownedPieces: { type: "array", items: { type: "string" } },
                recommendedAdditions: { type: "array", items: { type: "string" } },
                swapSuggestion: { type: "string" },
                chips: { type: "array", items: { type: "string" } },
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

      let parsed = fallbackAuraResponse(finalReply);
      try {
        parsed = JSON.parse(String(structured.output_text || "{}")) as AuraResponse;
      } catch {
        parsed = fallbackAuraResponse(finalReply);
      }

      parsed.reply = parsed.reply?.trim() ? parsed.reply.trim() : finalReply;
      if (!parsed.reply) parsed.reply = finalReply;
      parsed = normalizeAuraResponse(parsed, auraContext);

      writeEvent(res, { type: "final", data: parsed });
      res.end();
    } catch (error) {
      logger.error("askAuraStream failed", error);
      writeEvent(res, {
        type: "error",
        error: "AURA could not respond right now.",
      });
      res.end();
    }
  }
);
