import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  applyFollowupToIntent,
  clampNumOutfits,
  inferRequestedOutfitCount,
  MODEL,
  OutfitChatConstraints,
  OutfitFollowup,
  OutfitIntentV1,
  OutfitResult,
  Slot,
  WardrobeItem,
  fetchWardrobeItems,
  generateOutfitCandidates,
  normalizeColorList,
  normalizeParsedIntent,
  persistGeneratedOutfits,
  resolveItemHints,
  safeJsonExtract,
  swapOutfitSlot,
} from "./shared/outfitEngine";
import {
  buildCompactMemorySummary,
  loadAssistantProfile,
  loadBehaviorProfile,
} from "./shared/assistantMemory";
import { loadCompactAuraMemoryContext } from "./shared/auraMemory";
import { getOrRefreshWardrobeSummary } from "./shared/wardrobeSummary";

if (!getApps().length) {
  initializeApp();
}

type ChatAction = "none" | "generate_outfits" | "swap_item" | "tweak" | "ask_clarify";

type ChatResponseShape = {
  assistantText?: string;
  action?: ChatAction;
  intentText?: string | null;
  outfitCount?: number | null;
  constraints?: OutfitChatConstraints;
  references?: {
    outfitId?: string | null;
    slot?: Slot | null;
  };
  followup?: OutfitFollowup;
};

type ChatMessageDoc = {
  role: "user" | "assistant";
  text: string;
  createdAt?: Timestamp | {toMillis?: () => number} | null;
  outfits?: OutfitResult[];
  action?: string;
  debug?: Record<string, unknown> | null;
};

type UserProfile = {
  heightCm?: number;
  weightKg?: number;
  genderPresentation?: "masc" | "fem" | "neutral" | null;
  styleVibe?: string[];
  fitPref?: "slim" | "regular" | "oversized" | null;
  colorWanted?: string[];
  colorAvoid?: string[];
  brandLiked?: string[];
  brandAvoid?: string[];
  climatePref?: "runs_cold" | "neutral" | "runs_hot" | null;
  dressCode?: string[];
  shoeSize?: string | null;
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
    raw === "tweak" ||
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

function normalizeFollowup(value: unknown): OutfitFollowup {
  const raw = String((value as {type?: unknown})?.type ?? "").trim().toLowerCase();
  if (
    raw === "warmer" ||
    raw === "cooler" ||
    raw === "more_formal" ||
    raw === "more_casual" ||
    raw === "more_colorful" ||
    raw === "more_minimal"
  ) {
    return {type: raw};
  }
  return {};
}

function normalizeProfile(profile: unknown): UserProfile | null {
  if (!profile || typeof profile !== "object") return null;
  const value = profile as Record<string, unknown>;
  return {
    heightCm: typeof value.heightCm === "number" ? value.heightCm : undefined,
    weightKg: typeof value.weightKg === "number" ? value.weightKg : undefined,
    genderPresentation:
      value.genderPresentation === "masc" ||
      value.genderPresentation === "fem" ||
      value.genderPresentation === "neutral"
        ? value.genderPresentation
        : null,
    styleVibe: Array.isArray(value.styleVibe)
      ? value.styleVibe.map((item) => String(item).trim()).filter(Boolean).slice(0, 4)
      : [],
    fitPref:
      value.fitPref === "slim" || value.fitPref === "regular" || value.fitPref === "oversized"
        ? value.fitPref
        : null,
    colorWanted: Array.isArray(value.colorWanted)
      ? value.colorWanted.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    colorAvoid: Array.isArray(value.colorAvoid)
      ? value.colorAvoid.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    brandLiked: Array.isArray(value.brandLiked)
      ? value.brandLiked.map((item) => String(item).trim()).filter(Boolean).slice(0, 4)
      : [],
    brandAvoid: Array.isArray(value.brandAvoid)
      ? value.brandAvoid.map((item) => String(item).trim()).filter(Boolean).slice(0, 4)
      : [],
    climatePref:
      value.climatePref === "runs_cold" ||
      value.climatePref === "neutral" ||
      value.climatePref === "runs_hot"
        ? value.climatePref
        : null,
    dressCode: Array.isArray(value.dressCode)
      ? value.dressCode.map((item) => String(item).trim()).filter(Boolean).slice(0, 4)
      : [],
    shoeSize: value.shoeSize == null ? null : String(value.shoeSize),
  };
}

function countSlots(items: WardrobeItem[]): Record<Slot, number> {
  const counts: Record<Slot, number> = {top: 0, bottom: 0, footwear: 0, outerwear: 0};
  for (const item of items) {
    const category = String(item.category ?? "").trim().toLowerCase();
    if (category === "top" || category === "one_piece") counts.top += 1;
    else if (category === "bottom") counts.bottom += 1;
    else if (category === "footwear" || category === "shoes") counts.footwear += 1;
    else if (category === "outerwear") counts.outerwear += 1;
  }
  return counts;
}

function recentHistory(messages: ChatMessageDoc[]): string {
  return messages
    .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt))
    .slice(-10)
    .map((message) => `${message.role}: ${message.text}`)
    .join("\n");
}

function latestAssistantWithOutfits(messages: ChatMessageDoc[]): ChatMessageDoc | null {
  return [...messages]
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .find((message) => message.role === "assistant" && Array.isArray(message.outfits) && message.outfits.length > 0) ?? null;
}

function buildRecentOutfitRefs(messages: ChatMessageDoc[]): string {
  const latest = latestAssistantWithOutfits(messages);
  if (!latest?.outfits?.length) return "none";
  return latest.outfits
    .slice(0, 6)
    .map((outfit, index) => `${index + 1}:${outfit.id}`)
    .join(", ");
}

function inferRelativeOutfitCount(
  latestUserMessage: string,
  messages: ChatMessageDoc[]
): number | null {
  const normalized = latestUserMessage.toLowerCase();
  const latest = latestAssistantWithOutfits(messages);
  const currentCount = latest?.outfits?.length ?? 0;
  if (!currentCount) return null;
  if (normalized.includes("less outfits") || normalized.includes("fewer outfits")) {
    return Math.max(1, currentCount - 1);
  }
  if (normalized.includes("more outfits")) {
    return Math.min(8, currentCount + 1);
  }
  return null;
}

function buildAssistantTextForEmptyWardrobe(base: string): string {
  const trimmed = String(base ?? "").trim();
  if (trimmed) return trimmed;
  return "I need a few fully analyzed wardrobe items before I can build outfits. Add tops, bottoms, and shoes first.";
}

function mergeProfileDefaults(
  constraints: OutfitChatConstraints,
  profile: UserProfile | null
): OutfitChatConstraints {
  if (!profile) return constraints;
  return {
    ...constraints,
    ...(constraints.colorsWanted?.length ? {} : {colorsWanted: profile.colorWanted ?? []}),
    ...(constraints.colorsAvoid?.length ? {} : {colorsAvoid: profile.colorAvoid ?? []}),
    avoidItems: [
      ...(Array.isArray(constraints.avoidItems) ? constraints.avoidItems : []),
      ...((profile.brandAvoid ?? []).map((itemHint) => ({itemHint}))),
    ],
  };
}

function resolveReferencedOutfitId(
  parsedOutfitId: string | null,
  latestUserMessage: string,
  messages: ChatMessageDoc[]
): string | null {
  if (parsedOutfitId) return parsedOutfitId;
  const latest = latestAssistantWithOutfits(messages);
  if (!latest?.outfits?.length) return null;
  const ordinalMatch = latestUserMessage.toLowerCase().match(/\boutfit\s+(\d)\b/);
  if (!ordinalMatch) return latest.outfits[0]?.id ?? null;
  const index = Number(ordinalMatch[1]) - 1;
  return latest.outfits[index]?.id ?? null;
}

function buildFollowupFromText(text: string): OutfitFollowup {
  const normalized = text.toLowerCase();
  if (normalized.includes("warmer")) return {type: "warmer"};
  if (normalized.includes("cooler")) return {type: "cooler"};
  if (normalized.includes("more formal")) return {type: "more_formal"};
  if (normalized.includes("more casual")) return {type: "more_casual"};
  if (normalized.includes("more colorful")) return {type: "more_colorful"};
  if (normalized.includes("more minimal")) return {type: "more_minimal"};
  return {};
}

function buildThreadMemorySummary(messages: ChatMessageDoc[]): string {
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map((message) => message.text.toLowerCase());
  const parts: string[] = [];
  if (userTexts.some((text) => text.includes("black"))) parts.push("often asks for black looks");
  if (userTexts.some((text) => text.includes("cold") || text.includes("warmer"))) {
    parts.push("frequently prioritizes warmth");
  }
  if (userTexts.some((text) => text.includes("formal"))) parts.push("sometimes shifts formal");
  return parts.length > 0 ? `User ${parts.join(", ")}.` : "User prefers concise outfit recommendations.";
}

async function parseChatAction(params: {
  profile: UserProfile | null;
  assistantMemorySummary: string;
  wardrobeSummary: {summaryText: string; stats: Record<string, unknown>};
  slotCounts: Record<Slot, number>;
  messages: ChatMessageDoc[];
  latestUserMessage: string;
}): Promise<{
  assistantText: string;
  action: ChatAction;
  intentText: string | null;
  rawOutfitCount: number | null;
  requestedOutfitCount: number;
  clampedOutfitCount: number;
  constraints: OutfitChatConstraints;
  references: {outfitId: string | null; slot: Slot | null};
  followup: OutfitFollowup;
}> {
  const {profile, assistantMemorySummary, wardrobeSummary, slotCounts, messages, latestUserMessage} = params;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const requestedOutfitCount =
      inferRequestedOutfitCount(latestUserMessage) ??
      inferRelativeOutfitCount(latestUserMessage, messages) ??
      3;
    return {
      assistantText: "Tell me what you need and I’ll plan from your wardrobe.",
      action: "generate_outfits",
      intentText: latestUserMessage,
      rawOutfitCount: inferRequestedOutfitCount(latestUserMessage),
      requestedOutfitCount,
      clampedOutfitCount: clampNumOutfits(requestedOutfitCount, 3),
      constraints: {},
      references: {outfitId: null, slot: null},
      followup: buildFollowupFromText(latestUserMessage),
    };
  }

  const contextPacket = {
    profile: profile ?? {
      styleVibe: ["minimal", "smart-casual"],
      colorWanted: ["black"],
      climatePref: "neutral",
      location: "Chicago",
    },
    wardrobeSummary,
    slotCounts,
    recentOutfitRefs: buildRecentOutfitRefs(messages),
    lastMessages: recentHistory(messages) || "none",
    assistantMemorySummary,
  };

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
            "You are a wardrobe assistant. Output strict JSON only. Do not invent items.",
            "Use one of these actions: generate_outfits, swap_item, tweak, ask_clarify, none.",
            "Return JSON keys only: assistantText, action, intentText, outfitCount, constraints, references, followup.",
            "constraints keys only: occasion, formalityTarget, warmthTarget, colorsWanted, colorsAvoid, avoidLogos, excludeLaundry, mustInclude, avoidItems, notes.",
            "mustInclude entries may contain slot and itemHint. avoidItems entries may contain itemHint.",
            "references keys only: outfitId, slot.",
            "followup keys only: type.",
            "Determine outfitCount from the request: 'give me 2 outfits' => 2, 'just one' => 1, 'a bunch' => 5, 'less outfits' should lower the count.",
            "If the user says 'make it warmer', use action=tweak and followup.type=warmer.",
            "If the user says 'swap shoes in outfit 2', use action=swap_item, references.slot=footwear, and references.outfitId from recentOutfitRefs if possible.",
            "Ask clarifying questions if a request is ambiguous or impossible.",
            "Treat assistantMemorySummary as a soft preference signal only. Use it to personalize when the request is open-ended, but do not force it when the wardrobe or explicit user request points elsewhere.",
            "Context packet:",
            JSON.stringify(contextPacket),
          ].join(" "),
        },
        {role: "user", content: latestUserMessage},
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
  const requestedOutfitCount =
    parsed.outfitCount == null
      ? inferRequestedOutfitCount(latestUserMessage) ??
        inferRelativeOutfitCount(latestUserMessage, messages) ??
        3
      : Number(parsed.outfitCount);

  return {
    assistantText:
      String(parsed.assistantText ?? "").trim() ||
      "I can help you plan an outfit from what you already own.",
    action: normalizeAction(parsed.action),
    intentText: String(parsed.intentText ?? "").trim() || null,
    rawOutfitCount: parsed.outfitCount == null ? null : Number(parsed.outfitCount),
    requestedOutfitCount,
    clampedOutfitCount: clampNumOutfits(requestedOutfitCount, 3),
    constraints: parsed.constraints ?? {},
    references: {
      outfitId: String(parsed.references?.outfitId ?? "").trim() || null,
      slot: normalizeSlot(parsed.references?.slot),
    },
    followup: normalizeFollowup(parsed.followup),
  };
}

function buildIncompleteWardrobeMessage(slotCounts: Record<Slot, number>): string {
  const missing = (Object.keys(slotCounts) as Slot[])
    .filter((slot) => slot !== "outerwear" && slotCounts[slot] === 0)
    .map((slot) => slot.replace(/_/g, " "));
  if (missing.length === 0) {
    return "I can only build partial outfits right now. Add more analyzed items and try again.";
  }
  return `I need ${missing.join(", ")} items before I can make a full outfit. Add those pieces first.`;
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

    const startedAt = Date.now();
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

    const [recentMessagesSnap, userSnap, allItems, assistantProfile, behaviorProfile, memory] = await Promise.all([
      threadRef.collection("messages").orderBy("createdAt", "asc").limitToLast(12).get(),
      userRef.get(),
      fetchWardrobeItems(db, uid),
      loadAssistantProfile(db, uid),
      loadBehaviorProfile(db, uid),
      loadCompactAuraMemoryContext(db, uid, null),
    ]);

    const recentMessages = recentMessagesSnap.docs.map((docSnap) => docSnap.data() as ChatMessageDoc);
    const profile = normalizeProfile(userSnap.exists ? (userSnap.data() as {profile?: unknown}).profile : null);
    const slotCounts = countSlots(allItems);
    const wardrobeSummary = await getOrRefreshWardrobeSummary(db, uid, allItems);
    const assistantMemorySummary = buildCompactMemorySummary(
      assistantProfile,
      behaviorProfile
    );

    const parsed = await parseChatAction({
      profile,
      assistantMemorySummary,
      wardrobeSummary: {summaryText: wardrobeSummary.summaryText, stats: wardrobeSummary.stats},
      slotCounts,
      messages: recentMessages,
      latestUserMessage: message,
    });

    const mergedConstraints = mergeProfileDefaults(parsed.constraints, profile);
    const resolvedOutfitId = resolveReferencedOutfitId(
      parsed.references.outfitId,
      message,
      recentMessages
    );

    logger.info("outfitChatV1 parsed action", {
      uid,
      threadId,
      action: parsed.action,
      requestedOutfitCount: parsed.requestedOutfitCount,
      outfitCount: parsed.clampedOutfitCount,
      constraints: mergedConstraints,
      references: {...parsed.references, outfitId: resolvedOutfitId},
      followup: parsed.followup,
      slotCounts,
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

    let baseIntent = normalizeParsedIntent(
      {
        occasion: mergedConstraints.occasion as OutfitIntentV1["occasion"],
        formalityTarget: mergedConstraints.formalityTarget ?? undefined,
        warmthTarget: mergedConstraints.warmthTarget ?? undefined,
        colorsWanted: normalizeColorList(mergedConstraints.colorsWanted, 2),
        colorsAvoid: normalizeColorList(mergedConstraints.colorsAvoid, 2),
        avoidLogos: mergedConstraints.avoidLogos ?? false,
        excludeLaundry: mergedConstraints.excludeLaundry ?? true,
      },
      `${parsed.intentText ?? message} ${mergedConstraints.notes ?? ""}`.trim()
    );
    if (profile?.climatePref === "runs_cold") {
      baseIntent.warmthTarget = Math.min(1, baseIntent.warmthTarget + 0.05);
    } else if (profile?.climatePref === "runs_hot") {
      baseIntent.warmthTarget = Math.max(0, baseIntent.warmthTarget - 0.05);
    }
    baseIntent = applyFollowupToIntent(baseIntent, parsed.followup);

    const mustIncludeHints = Array.isArray(mergedConstraints.mustInclude)
      ? mergedConstraints.mustInclude
      : [];
    const mustIncludeResolution = resolveItemHints(allItems, mustIncludeHints);
    let blockedByClarify = false;
    if (mustIncludeResolution.ambiguous.length > 0) {
      const ambiguous = mustIncludeResolution.ambiguous[0];
      const options = ambiguous.candidates
        .map((item) => item.name || `${item.brand ?? ""} ${item.subCategory ?? item.category ?? item.id}`.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      assistantText = `I found multiple matches for "${ambiguous.hint}". Pick one of these: ${options}.`;
      blockedByClarify = true;
    } else if (mustIncludeResolution.unmatched.length > 0) {
      assistantText = `I couldn't find "${mustIncludeResolution.unmatched[0]}" in your wardrobe. Try a different item.`;
      blockedByClarify = true;
    }

    const avoidItemsResolved = resolveItemHints(
      allItems,
      Array.isArray(mergedConstraints.avoidItems)
        ? mergedConstraints.avoidItems.map((value) => ({itemHint: value.itemHint}))
        : []
    );
    const explicitExcludes = [
      ...(Array.isArray(mergedConstraints.excludeItemIds) ? mergedConstraints.excludeItemIds : []),
      ...avoidItemsResolved.resolved.map((value) => value.itemId),
    ];
    const lockedItemsBySlot = Object.fromEntries(
      mustIncludeResolution.resolved.map((value) => [value.slot, value.item])
    ) as Partial<Record<Slot, WardrobeItem>>;

    if (allItems.length === 0) {
      assistantText = buildAssistantTextForEmptyWardrobe(
        parsed.action === "ask_clarify" ? parsed.assistantText : ""
      );
    } else if (!blockedByClarify) {
      const action = parsed.action === "tweak" ? "generate_outfits" : parsed.action;
      if (action === "generate_outfits") {
        const generated = generateOutfitCandidates(allItems, baseIntent, {
          numOutfits: parsed.clampedOutfitCount,
          constraints: mergedConstraints,
          excludeItemIds: explicitExcludes,
          lockedItemsBySlot,
          memory,
        });

        logger.info("outfitChatV1 slot counts", {
          uid,
          threadId,
          eligible: generated.eligibleCount,
          ...generated.slotCounts,
        });

        if (generated.outfits.length === 0) {
          assistantText = buildIncompleteWardrobeMessage(generated.slotCounts);
        } else {
          outfits = await persistGeneratedOutfits({
            db,
            uid,
            intentText: parsed.intentText ?? message,
            intent: generated.intent,
            outfits: generated.outfits,
          });
        }
      } else if (parsed.action === "swap_item") {
        const slot = parsed.references.slot;
        if (!slot || !resolvedOutfitId) {
          assistantText = "Tell me which slot to swap and which outfit you want to change.";
        } else {
          const outfitSnap = await userRef.collection("outfits").doc(resolvedOutfitId).get();
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
              {
                ...mergedConstraints,
                excludeItemIds: explicitExcludes,
              }
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
    }

    const totalUserMessages = recentMessages.filter((entry) => entry.role === "user").length + 1;
    const lastAssistantSummary =
      totalUserMessages % 10 === 0
        ? buildThreadMemorySummary([...recentMessages, {role: "user", text: message}])
        : undefined;

    await assistantMessageRef.set({
      role: "assistant",
      text: assistantText,
      createdAt: FieldValue.serverTimestamp(),
      action: parsed.action,
      ...(outfits.length > 0 ? {outfits} : {}),
      debug: {
        intentText: parsed.intentText,
        rawOutfitCount: parsed.rawOutfitCount,
        requestedOutfitCount: parsed.requestedOutfitCount,
        outfitCount: parsed.clampedOutfitCount,
        constraints: mergedConstraints,
        references: {...parsed.references, outfitId: resolvedOutfitId},
        followup: parsed.followup,
      },
    });

    await threadRef.set({
      updatedAt: FieldValue.serverTimestamp(),
      ...(incomingThreadId ? {} : {createdAt: FieldValue.serverTimestamp()}),
      title: message.slice(0, 80),
      ...(lastAssistantSummary ? {lastAssistantSummary} : {}),
    }, {merge: true});

    logger.info("outfitChatV1 completed", {
      uid,
      threadId,
      action: parsed.action,
      outfitCount: outfits.length,
      elapsedMs: Date.now() - startedAt,
    });

    return {
      threadId,
      assistantMessage: {text: assistantText},
      ...(outfits.length > 0 ? {outfits} : {}),
    };
  }
);
