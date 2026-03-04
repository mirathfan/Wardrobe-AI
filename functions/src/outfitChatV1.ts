import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  clampNumOutfits,
  inferRequestedOutfitCount,
  MODEL,
  OutfitChatConstraints,
  OutfitIntentV1,
  OutfitResult,
  Slot,
  fetchWardrobeItems,
  generateOutfitCandidates,
  normalizeColorList,
  normalizeParsedIntent,
  persistGeneratedOutfits,
  safeJsonExtract,
  swapOutfitSlot,
} from "./shared/outfitEngine";

if (!getApps().length) {
  initializeApp();
}

type ChatAction = "none" | "generate_outfits" | "swap_item" | "ask_clarify";

type ChatResponseShape = {
  assistantText?: string;
  action?: ChatAction;
  intentText?: string;
  numOutfits?: number | null;
  constraints?: OutfitChatConstraints;
  swap?: {
    outfitId?: string | null;
    slot?: Slot | null;
  };
};

type ChatMessageDoc = {
  role: "user" | "assistant";
  text: string;
  createdAt?: Timestamp | {toMillis?: () => number} | null;
};

function toMillis(value: ChatMessageDoc["createdAt"]): number {
  if (!value) return 0;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return 0;
}

function normalizeAction(value: unknown): ChatAction {
  const raw = String(value ?? "").trim().toLowerCase();
  if (
    raw === "none" ||
    raw === "generate_outfits" ||
    raw === "swap_item" ||
    raw === "ask_clarify"
  ) {
    return raw;
  }
  return "none";
}

function normalizeSlot(value: unknown): Slot | null {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "top" || raw === "bottom" || raw === "footwear" || raw === "outerwear"
    ? raw
    : null;
}

function buildProfileSummary(profile: Record<string, unknown> | null | undefined): string {
  if (!profile) {
    return "User prefers black often, leans casual to smart-casual, and is based in Chicago.";
  }

  const parts: string[] = [];
  const location = String(profile.location ?? "").trim();
  const style = String(profile.stylePreference ?? profile.style ?? "").trim();
  const colors = Array.isArray(profile.favoriteColors)
    ? profile.favoriteColors.map((value) => String(value).trim()).filter(Boolean).slice(0, 3)
    : [];

  if (style) parts.push(`Style: ${style}.`);
  if (colors.length > 0) parts.push(`Favorite colors: ${colors.join(", ")}.`);
  if (location) parts.push(`Location: ${location}.`);

  if (parts.length === 0) {
    return "User prefers black often, leans casual to smart-casual, and is based in Chicago.";
  }
  return parts.join(" ");
}

function buildAssistantTextForEmptyWardrobe(base: string): string {
  const trimmed = String(base ?? "").trim();
  if (trimmed) return trimmed;
  return "I need a few fully analyzed wardrobe items before I can build outfits. Add tops, bottoms, and shoes first.";
}

async function parseChatAction(params: {
  profileSummary: string;
  messages: ChatMessageDoc[];
  latestUserMessage: string;
}): Promise<
  Required<Omit<ChatResponseShape, "intentText" | "numOutfits">> & {
    intentText: string | null;
    numOutfits: number | null;
    requestedNumOutfits: number;
    clampedNumOutfits: number;
  }
> {
  const {profileSummary, messages, latestUserMessage} = params;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const requestedNumOutfits = inferRequestedOutfitCount(latestUserMessage) ?? 3;
    return {
      assistantText: "Tell me what you need and I’ll put together outfit options from your wardrobe.",
      action: "generate_outfits",
      intentText: latestUserMessage,
      numOutfits: inferRequestedOutfitCount(latestUserMessage),
      requestedNumOutfits,
      clampedNumOutfits: clampNumOutfits(requestedNumOutfits, 3),
      constraints: {},
      swap: {outfitId: null, slot: null},
    };
  }

  const history = messages
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
    .slice(-12)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");

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
            "You are Athfan's personal wardrobe assistant.",
            "Be concise, helpful, and practical.",
            "Return strict JSON only with keys: assistantText, action, intentText, numOutfits, constraints, swap.",
            "action must be one of: none, generate_outfits, swap_item, ask_clarify.",
            "If the user asks for a count of outfits, set numOutfits to that number. Otherwise set numOutfits to null.",
            "constraints keys only: occasion, formalityTarget, warmthTarget, colorsWanted, colorsAvoid, includeItemIds, excludeItemIds, avoidLogos, notes.",
            "swap keys only: outfitId, slot.",
            "If the user asks to make an outfit, use generate_outfits.",
            "If the user asks to replace one part of an existing outfit, use swap_item and set swap.slot.",
            "If the request is unclear, use ask_clarify.",
            "Profile summary:",
            profileSummary,
            "Conversation so far:",
            history || "No previous messages.",
          ].join(" "),
        },
        {
          role: "user",
          content: latestUserMessage,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{message?: {content?: string}}>;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = safeJsonExtract<ChatResponseShape>(content) ?? {};
  const requestedNumOutfits =
    parsed.numOutfits == null
      ? inferRequestedOutfitCount(latestUserMessage) ?? 3
      : Number(parsed.numOutfits);
  const clampedNumOutfits = clampNumOutfits(requestedNumOutfits, 3);

  return {
    assistantText:
      String(parsed.assistantText ?? "").trim() ||
      "I can help you plan an outfit from what you already own.",
    action: normalizeAction(parsed.action),
    intentText: String(parsed.intentText ?? "").trim() || null,
    numOutfits: parsed.numOutfits == null ? null : Number(parsed.numOutfits),
    requestedNumOutfits,
    clampedNumOutfits,
    constraints: parsed.constraints ?? {},
    swap: {
      outfitId: String(parsed.swap?.outfitId ?? "").trim() || null,
      slot: normalizeSlot(parsed.swap?.slot),
    },
  };
}

export const outfitChatV1 = onCall(
  {secrets: ["OPENAI_API_KEY"]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const message = String(request.data?.message ?? "").trim();
    const incomingThreadId = String(request.data?.threadId ?? "").trim() || null;
    if (!message) {
      throw new HttpsError("invalid-argument", "message is required");
    }

    const db = getFirestore();
    const userRef = db.collection("users").doc(uid);
    const threadRef = incomingThreadId
      ? userRef.collection("threads").doc(incomingThreadId)
      : userRef.collection("threads").doc();
    const threadId = threadRef.id;

    if (!incomingThreadId) {
      await threadRef.set({
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        title: message.slice(0, 80),
      }, {merge: true});
    }

    const [recentMessagesSnap, userSnap, allItems] = await Promise.all([
      threadRef.collection("messages").orderBy("createdAt", "asc").limitToLast(12).get(),
      userRef.get(),
      fetchWardrobeItems(db, uid),
    ]);

    const recentMessages = recentMessagesSnap.docs.map((docSnap) => docSnap.data() as ChatMessageDoc);
    const profileSummary = buildProfileSummary(
      userSnap.exists ? ((userSnap.data() as {profile?: Record<string, unknown>}).profile ?? null) : null
    );

    const parsed = await parseChatAction({
      profileSummary,
      messages: recentMessages,
      latestUserMessage: message,
    });

    logger.info("outfitChatV1 parsed action", {
      uid,
      threadId,
      action: parsed.action,
      requestedNumOutfits: parsed.requestedNumOutfits,
      numOutfits: parsed.clampedNumOutfits,
      constraints: parsed.constraints,
      swap: parsed.swap,
    });

    const userMessageRef = threadRef.collection("messages").doc();
    const assistantMessageRef = threadRef.collection("messages").doc();

    await userMessageRef.set({
      role: "user",
      text: message,
      createdAt: FieldValue.serverTimestamp(),
      action: "none",
    });

    let assistantText = parsed.assistantText;
    let outfits: OutfitResult[] = [];

    const baseIntent = normalizeParsedIntent(
      {
        occasion: parsed.constraints.occasion as OutfitIntentV1["occasion"],
        formalityTarget: parsed.constraints.formalityTarget ?? undefined,
        warmthTarget: parsed.constraints.warmthTarget ?? undefined,
        colorsWanted: normalizeColorList(parsed.constraints.colorsWanted, 2),
        colorsAvoid: normalizeColorList(parsed.constraints.colorsAvoid, 2),
        avoidLogos: parsed.constraints.avoidLogos ?? false,
      },
      `${message} ${parsed.constraints.notes ?? ""}`.trim()
    );

    if (allItems.length === 0) {
      assistantText = buildAssistantTextForEmptyWardrobe(
        parsed.action === "ask_clarify" ? parsed.assistantText : ""
      );
    } else if (parsed.action === "generate_outfits") {
      const generated = generateOutfitCandidates(allItems, baseIntent, {
        numOutfits: parsed.clampedNumOutfits,
        constraints: parsed.constraints,
      });

      logger.info("outfitChatV1 slot counts", {
        uid,
        threadId,
        eligible: generated.eligibleCount,
        ...generated.slotCounts,
      });

      if (generated.outfits.length === 0) {
        assistantText =
          "I couldn't build a complete outfit from your available items yet. Add or wash a top, bottom, and footwear item first.";
      } else {
        outfits = await persistGeneratedOutfits({
          db,
          uid,
          intentText: message,
          intent: generated.intent,
          outfits: generated.outfits,
        });
      }
    } else if (parsed.action === "swap_item") {
      const slot = parsed.swap.slot;
      const outfitId = parsed.swap.outfitId;
      if (!slot || !outfitId) {
        assistantText = "Tell me which slot to swap and which outfit you want to change.";
      } else {
        const outfitSnap = await userRef.collection("outfits").doc(outfitId).get();
        const outfitData = outfitSnap.exists
          ? (outfitSnap.data() as {picks?: Array<{slot: Slot; itemId: string}>} | undefined)
          : null;

        const currentPicks = Array.isArray(outfitData?.picks)
          ? outfitData!.picks.filter((pick) => normalizeSlot(pick.slot))
          : [];

        if (currentPicks.length === 0) {
          assistantText = "I couldn't find that outfit to swap. Generate a new outfit first.";
        } else {
          const swapped = swapOutfitSlot(
            allItems,
            baseIntent,
            currentPicks,
            slot,
            parsed.constraints
          );
          if (!swapped) {
            assistantText = `I couldn't find a better ${slot} option right now.`;
          } else {
            outfits = await persistGeneratedOutfits({
              db,
              uid,
              intentText: `${message} (swap ${slot})`,
              intent: baseIntent,
              outfits: [swapped],
            });
          }
        }
      }
    } else if (parsed.action === "ask_clarify") {
      assistantText = parsed.assistantText;
    }

    await assistantMessageRef.set({
      role: "assistant",
      text: assistantText,
      createdAt: FieldValue.serverTimestamp(),
      action: parsed.action,
      ...(outfits.length > 0 ? {outfits} : {}),
      debug: {
        intentText: parsed.intentText,
        numOutfits: parsed.clampedNumOutfits,
        requestedNumOutfits: parsed.requestedNumOutfits,
        constraints: parsed.constraints,
        swap: parsed.swap,
      },
    });

    await threadRef.set({
      updatedAt: FieldValue.serverTimestamp(),
      ...(incomingThreadId ? {} : {createdAt: FieldValue.serverTimestamp()}),
      title: message.slice(0, 80),
    }, {merge: true});

    return {
      threadId,
      assistantMessage: {text: assistantText},
      ...(outfits.length > 0 ? {outfits} : {}),
    };
  }
);
