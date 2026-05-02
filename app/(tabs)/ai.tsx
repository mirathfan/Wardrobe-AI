import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Alert, Keyboard, KeyboardEvent, Platform, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AuraHeader from "@/src/components/ai/AuraHeader";
import AuraChatDrawer from "@/src/components/ai/AuraChatDrawer";
import AuraQuickChips from "@/src/components/ai/AuraQuickChips";
import ChatList from "@/src/components/ai/ChatList";
import InputBar from "@/src/components/ai/InputBar";
import { auraTheme } from "@/src/components/ai/aiTheme";
import AuraGlowBackground from "@/src/components/aura/AuraGlowBackground";
import AnimatedAuraRing from "@/src/components/aura/AnimatedAuraRing";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { AURA_TRAINING_ROUTE } from "@/src/constants/routes";
import type {
  AIMessage,
  ChatAttachment,
  ChatAttachmentGroupRole,
  ChatOutfit,
  ChatImageAttachment,
} from "@/src/components/ai/chatTypes";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { askAuraStream, isAuraStreamAbortError, transcribeAuraAudio } from "@/src/lib/aura";
import { logAuraLookStyleEvent, updateAuraSessionContextFromPrompt } from "@/src/lib/auraMemory";
import {
  type AuraCandidateLocalPhoto,
  createAuraItemDraftsFromCandidates,
  createAuraItemDraftsFromDetectedOutfit,
  uploadAuraAttachments,
  uploadAuraTranscriptionAudio,
} from "@/src/lib/auraAttachments";
import { classifyAuraImageIntent } from "@/src/lib/auraIntent";
import { auraLookToPlannedOutfit, saveAuraLook } from "@/src/lib/auraLooks";
import { saveAuraOutfitFeedback } from "@/src/lib/auraOutfitFeedback";
import { generateAuraSwipeBatch } from "@/src/lib/auraSwipe";
import { runHaptic } from "@/src/lib/haptics";
import { getItemImageUrl } from "@/src/lib/itemImage";
import { listenToItems, updateLaundryStatus } from "@/src/lib/items";
import { buildMinimumClosetSummary } from "@/src/lib/minimumCloset";
import { Toast } from "@/src/lib/toast";
import {
  appendMessageToChat,
  createChatThread,
  deleteChatThread,
  loadChatMessages,
  loadLatestChatThread,
  loadRecentChatThreads,
  renameChatThread,
  setChatArchived,
  setChatPinned,
  summarizeChatTitle,
  type AIChatThread,
  updateChatThread,
} from "@/src/lib/aiChats";
import { clearLatestChatCache, loadLatestChatCache, saveLatestChatCache } from "@/src/lib/localChatCache";
import { messageOrderMillis, orderChatMessages } from "@/src/lib/chatMessageOrder";
import {
  clearCachedRecentMessages,
  getCachedChatList,
  getCachedRecentMessages,
  setCachedRecentMessages,
} from "@/src/lib/localCache";
import type { AuraCandidateAction, AuraCandidateItem, AuraLaundryConfirmationAction, AuraLookAction, AuraLookOptionMeta, AuraResponse } from "@/src/types/aura";
import type { ClothingItem } from "@/src/types/ClothingItem";
import { markAnalyzedOutfitWorn, savePlannedRecord } from "@/src/utils/dailyOutfits";

const TRAIN_AURA_CHIP_LABEL = "Train AURA faster";
const AURA_TOP_CHIPS = [
  TRAIN_AURA_CHIP_LABEL,
  "Top priorities",
  "Shopping list",
  "Dressier options",
  "Warm-weather",
];
const DEFAULT_CHIPS = AURA_TOP_CHIPS.filter((chip) => chip !== TRAIN_AURA_CHIP_LABEL);

const DEFAULT_COMPOSER_HEIGHT = 56;
const STREAM_FLUSH_INTERVAL_MS = 24;
const AURA_REPLY_START_HAPTIC = "light" as const;
const AURA_REPLY_FINISH_HAPTIC = "selection" as const;
const AURA_OFFLINE_MESSAGE = "AURA is having trouble connecting right now. Try again in a moment.";
const AURA_DRAFT_FAILURE_MESSAGE = "I couldn't create that wardrobe draft. Please try again.";
const AURA_ATTACHMENT_FAILURE_MESSAGE = "I couldn't upload that attachment. Please try again.";
const RECENT_CHAT_LIMIT = 24;
const DEBUG_AURA_CLIENT =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const MULTI_OUTFIT_REQUEST_RE =
  /\b((?:2|3|4|two|three|four)\s+(?:outfits?|looks?|options?|directions?)|multiple\s+(?:outfits?|looks?|options?)|few\s+outfits?)\b/i;
const OUTERWEAR_REQUEST_RE =
  /\b(with jacket|with jackets|jackets?|outerwear|coat|blazer|hoodie|cardigan|overshirt|layered|layers)\b/i;
const AURA_EMPTY_STATE_CHIPS = [
  "Style me today",
  "Build from my closet",
  "Help me pick an outfit",
  "What should I wear tonight?",
];
const AURA_CHAT_BACKGROUND_COLORS = ["#050507", "#07070B", "#0B0B12"] as const;
const AURA_CHAT_BOTTOM_GLOW_COLORS = ["rgba(124,92,255,0.035)", "rgba(167,139,250,0.012)", "transparent"] as const;

type OptionalAudioRecorder = {
  uri: string | null;
  prepareToRecordAsync: () => Promise<void>;
  record: () => void;
  stop: () => Promise<void>;
};

function createMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let localMessageSequence = 0;

function nextLocalMessageSequence() {
  localMessageSequence += 1;
  return localMessageSequence;
}

function logAuraChatState(event: string, payload?: Record<string, unknown>) {
  if (!DEBUG_AURA_CLIENT) return;
  console.log("[AURA_CHAT_STATE]", event, payload ?? {});
}

function createStreamingAssistantMessage(
  id: string,
  createdAt: number,
  replyToMessageId: string,
  localSequence: number,
): AIMessage {
  return {
    id,
    type: "assistant",
    kind: "aura_text",
    text: "",
    streaming: true,
    createdAt,
    clientCreatedAt: createdAt,
    localSequence,
    replyToMessageId,
  };
}

function updateMessageById(
  messages: AIMessage[],
  messageId: string,
  updater: (message: AIMessage) => AIMessage
) {
  const index = messages.findIndex((entry) => entry.id === messageId);
  if (index < 0) return messages;
  const updatedMessage = updater(messages[index]);
  if (updatedMessage === messages[index]) return messages;
  const next = messages.slice();
  next[index] = updatedMessage;
  return next;
}

function AuraChatEmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View
      style={{
        marginHorizontal: Math.max(12, layout.horizontalPadding - 4),
        marginBottom: 10,
        borderRadius: 28,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "rgba(12,15,22,0.76)",
        padding: layout.screenSize === "compact" ? 18 : 22,
        gap: 18,
      }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(167,139,250,0.18)", "rgba(243,190,221,0.06)", "rgba(255,255,255,0.018)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", inset: 0 }}
      />
      <View style={{ alignItems: "center", gap: 14 }}>
        <View style={{ width: 104, height: 104, alignItems: "center", justifyContent: "center" }}>
          <AnimatedAuraRing size={96} stroke={2} rotationDuration={5200} />
          <Text
            pointerEvents="none"
            style={{
              position: "absolute",
              color: colors.text,
              fontSize: 16,
              fontWeight: "900",
              letterSpacing: 1.4,
            }}
          >
            AURA
          </Text>
        </View>
        <View style={{ gap: 7, alignItems: "center" }}>
          <Text
            style={{
              color: colors.text,
              fontSize: layout.screenSize === "compact" ? 23 : 25,
              lineHeight: layout.screenSize === "compact" ? 29 : 31,
              fontWeight: "900",
              textAlign: "center",
            }}
          >
            What are we styling today?
          </Text>
          <Text
            style={{
              color: auraTheme.textMuted,
              fontSize: 14,
              lineHeight: 21,
              fontWeight: "600",
              textAlign: "center",
              maxWidth: 300,
            }}
          >
            AURA can style outfits from your closet, plan around the day, and keep the result grounded in pieces you actually own.
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
        {AURA_EMPTY_STATE_CHIPS.map((chip) => (
          <AuraPressable
            key={chip}
            onPress={() => onPrompt(chip)}
            haptic="selection"
            hapticTrigger="press"
            pressedScale={0.96}
            pressedOpacity={0.88}
            style={{
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 9,
              backgroundColor: "rgba(255,255,255,0.055)",
              borderWidth: 1,
              borderColor: auraTheme.borderSoft,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "800" }}>{chip}</Text>
          </AuraPressable>
        ))}
      </View>
    </View>
  );
}

function AuraChatLoadingState() {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  return (
    <View
      style={{
        marginHorizontal: Math.max(12, layout.horizontalPadding - 4),
        marginBottom: 12,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.09)",
        backgroundColor: "rgba(12,15,22,0.68)",
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      }}
    >
      <AnimatedAuraRing size={44} stroke={2} rotationDuration={4200} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>AURA is getting ready</Text>
        <Text style={{ color: auraTheme.textMuted, fontSize: 12.5, lineHeight: 18 }}>
          Pulling in your latest closet context.
        </Text>
      </View>
    </View>
  );
}

function createUserMessage(text: string): AIMessage {
  const createdAt = Date.now();
  return {
    id: createMessageId(),
    type: "user",
    kind: "user_text",
    text,
    createdAt,
    clientCreatedAt: createdAt,
    localSequence: nextLocalMessageSequence(),
  };
}

function createUserMessageWithAttachments(text: string, attachments: ChatAttachment[]): AIMessage {
  return {
    ...createUserMessage(text),
    attachments,
  };
}

function buildChatSeedText(prompt: string, attachments: ChatAttachment[]) {
  if (prompt.trim()) return prompt.trim();
  if (attachments.some((attachment) => attachment.type === "image")) {
    return "Analyze this outfit photo";
  }
  if (attachments.some((attachment) => attachment.type === "audio")) {
    return "Voice styling request";
  }
  return "New stylist chat";
}

function deriveAssistantChatTitle(prompt: string, message: AIMessage) {
  return summarizeChatTitle({
    userText: prompt,
    assistantText:
      message.aura?.title ??
      message.aura?.reply ??
      message.assistantIntroText ??
      message.text,
  });
}

function createLocalAttachmentId() {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function candidateImageSet(candidate: AuraCandidateItem) {
  return new Set(
    [
      candidate.primaryImageUrl,
      ...(candidate.imageUrls ?? []),
      ...(candidate.secondaryImageUrls ?? []),
    ]
      .map((url) => String(url ?? "").trim())
      .filter(Boolean)
  );
}

function cleanIntroText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildAssistantCardIntro(data: AuraResponse, userRequest?: string) {
  const request = cleanIntroText(userRequest).toLowerCase();
  const reply = cleanIntroText(data.reply);
  if (reply) return reply;

  const candidateItems = data.candidateItems ?? data.candidates ?? [];
  const hasCandidates = candidateItems.length > 0;
  const hasLooks = !!data.look || !!data.lookOptions?.length;
  const lookCount = data.lookOptions?.length ?? (data.look ? 1 : 0);

  if (hasCandidates) {
    if (/\b(add|save|store|closet|wardrobe|item)\b/.test(request)) {
      return "I found this item. Review it before I add it to your wardrobe.";
    }
    return "I found this item. Give it a quick review and I can take the next step.";
  }

  if (data.outfitAnalysis) {
    return "I found this outfit. Review the pieces before saving or adding them.";
  }

  if (hasLooks) {
    if (/\bjacket|jackets|coat|coats|blazer|blazers|outerwear\b/.test(request)) {
      return "Got you — I kept jackets as the main layer and built the outfits around them.";
    }
    if (/\bformal|cleaner|dressier|more formal|tailored|polished\b/.test(request)) {
      return "Done — I pushed these cleaner and more formal while keeping them wearable.";
    }
    if (/\bstreetwear|street\b/.test(request)) {
      return "Done — I made these lean more streetwear without losing balance.";
    }
    if (/\bsafe\b/.test(request) && /\bbalanced\b/.test(request) && /\bbold\b/.test(request)) {
      return "Got you — I built a few directions so you can compare the safer, balanced, and bolder takes side by side.";
    }
    if (lookCount > 1) {
      return "Got you — I built a few looks from your closet that match that direction.";
    }
    return "Got you — I pulled a look together that stays close to that direction.";
  }

  if (data.presentation === "candidate_preview") {
    return "I found this item. Review it before I add it to your wardrobe.";
  }

  if (data.presentation === "laundry_confirmation") {
    return reply || "Which item did you mean?";
  }

  if (/\bswipe|training|taste|learn\b/.test(request)) {
    return "Here are a few quick outfit edits. Swipe through them so I can learn your taste.";
  }

  return "Got you — here’s what I’d do.";
}

function buildAuraLookFeedbackPrompt(action: AuraLookAction, promptBase: string) {
  if (action === "notMyVibe") {
    return `Take this in a different direction from ${promptBase}. Keep it polished, but shift the palette, silhouette, or overall attitude so it feels more like me.`;
  }
  if (action === "showMoreLikeThis") {
    return `Show me 3 more looks in the same lane as ${promptBase}, but vary the styling so they do not feel repetitive.`;
  }
  if (action === "lessLikeThis") {
    return `Pull away from ${promptBase}. Keep the same level of polish, but give me a noticeably different palette, silhouette, or vibe.`;
  }
  return "";
}

function buildShareTranscript(thread: AIChatThread, messages: AIMessage[]) {
  const lines = messages
    .filter((entry) => entry.type === "user" || entry.type === "assistant")
    .slice(-12)
    .map((entry) => {
      const speaker = entry.type === "user" ? "You" : "AURA";
      const body =
        String(entry.assistantIntroText ?? entry.text ?? "").trim() ||
        (entry.aura?.lookOptions?.length
          ? `${entry.aura.lookOptions.length} outfit options`
          : entry.aura?.look
            ? entry.aura.look.lookTitle
            : entry.outfits?.length
              ? `${entry.outfits.length} outfit suggestions`
              : "");
      return body ? `${speaker}: ${body}` : null;
    })
    .filter(Boolean);

  return [`${summarizeChatTitle({ userText: thread.title, assistantText: thread.lastMessagePreview })}`, "", ...lines].join("\n");
}

function resolveLocalPhotosForAuraCandidates(
  messages: AIMessage[],
  sourceMessage: AIMessage,
  candidates: AuraCandidateItem[]
): Record<string, AuraCandidateLocalPhoto | undefined> {
  const previousUserMessages = messages
    .filter(
      (message) =>
        message.type === "user" &&
        message.createdAt <= sourceMessage.createdAt &&
        message.attachments?.some((attachment) => attachment.type === "image")
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  const imageAttachments = previousUserMessages.flatMap((message) =>
    (message.attachments ?? []).filter(
      (attachment): attachment is ChatImageAttachment => attachment.type === "image"
    )
  );
  const localByCandidateId: Record<string, AuraCandidateLocalPhoto | undefined> = {};

  for (const candidate of candidates) {
    const urls = candidateImageSet(candidate);
    const matchedAttachment =
      imageAttachments.find((attachment) => urls.has(String(attachment.uri ?? "").trim())) ??
      (candidates.length === 1 && imageAttachments.length === 1 ? imageAttachments[0] : undefined);
    if (!matchedAttachment?.localUri) continue;
    localByCandidateId[candidate.candidateId] = {
      localUri: matchedAttachment.localUri,
      attachmentUri: matchedAttachment.uri,
      width: matchedAttachment.width ?? null,
      height: matchedAttachment.height ?? null,
    };
  }

  return localByCandidateId;
}

function resolveOutfitSourcePhoto(messages: AIMessage[], sourceMessage: AIMessage) {
  const previousUserMessages = messages
    .filter(
      (message) =>
        message.type === "user" &&
        message.createdAt <= sourceMessage.createdAt &&
        message.attachments?.some((attachment) => attachment.type === "image")
    )
    .sort((a, b) => b.createdAt - a.createdAt);
  return previousUserMessages
    .flatMap((message) => message.attachments ?? [])
    .find((attachment): attachment is ChatImageAttachment => attachment.type === "image");
}

function createAssistantMessage(
  data: AuraResponse,
  overrides?: Partial<AIMessage>,
  options?: { userRequest?: string }
): AIMessage {
  const candidateItems = data.candidateItems ?? data.candidates ?? [];
  const normalizedData = candidateItems.length
    ? {
        ...data,
        presentation: "candidate_preview" as const,
        candidateItems,
        candidates: candidateItems,
      }
    : data;
  const shouldUseCard =
    normalizedData.presentation === "card" ||
    normalizedData.presentation === "candidate_preview" ||
    normalizedData.presentation === "laundry_confirmation" ||
    normalizedData.presentation === "outfit_analysis" ||
    !!normalizedData.outfitAnalysis ||
    !!normalizedData.look ||
    !!normalizedData.lookOptions?.length ||
    !!candidateItems.length ||
    ((!!normalizedData.outfitItems?.length ||
      !!normalizedData.ownedPieces?.length ||
      !!normalizedData.recommendedAdditions?.length) &&
      (!!normalizedData.reason?.trim() || !!normalizedData.swapSuggestion?.trim()));
  if (DEBUG_AURA_CLIENT) {
    console.log("[AURA_FRONTEND_PAYLOAD]", "createAssistantMessage payload", {
      messageId: overrides?.id ?? null,
      presentation: normalizedData.presentation,
      hasLook: !!normalizedData.look,
      lookOptionsCount: normalizedData.lookOptions?.length ?? 0,
      candidateItemsCount: candidateItems.length,
      shouldUseCard,
      replyPreview: String(normalizedData.reply ?? "").slice(0, 120),
    });
  }
  if (DEBUG_AURA_CLIENT && candidateItems.length) {
    console.log("[AURA_PARSE]", "creating assistant candidate message", {
      candidateCount: candidateItems.length,
      kind: shouldUseCard ? "aura_card" : "aura_text",
      presentation: normalizedData.presentation,
      rawKeys: Object.keys(data),
    });
  }
  const assistantIntroText = shouldUseCard
    ? buildAssistantCardIntro(normalizedData, options?.userRequest)
    : cleanIntroText(normalizedData.reply);
  const createdAt = overrides?.createdAt ?? Date.now();
  return {
    id: overrides?.id ?? createMessageId(),
    type: "assistant",
    kind: shouldUseCard ? "aura_card" : "aura_text",
    text: assistantIntroText || normalizedData.reply,
    assistantIntroText: assistantIntroText || undefined,
    streaming: overrides?.streaming,
    aura: shouldUseCard ? normalizedData : undefined,
    createdAt,
    clientCreatedAt:
      overrides?.clientCreatedAt ??
      createdAt,
    localSequence: overrides?.localSequence,
    replyToMessageId: overrides?.replyToMessageId ?? null,
  };
}

function requestedOutfitCount(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (/\b(4|four)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 4;
  if (/\b(3|three)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 3;
  if (/\b(2|two)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 2;
  return 3;
}

function explicitRequestedOutfitCount(prompt: string) {
  const normalized = String(prompt ?? "").toLowerCase();
  if (/\b(4|four)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 4;
  if (/\b(3|three)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 3;
  if (/\b(2|two)\s+(?:outfits?|looks?|options?|directions?)\b/.test(normalized)) return 2;
  if (/\bmultiple\s+(?:outfits?|looks?|options?)\b/.test(normalized)) return 3;
  if (/\bmore\s+options\b/.test(normalized)) return 3;
  if (/\bfew\s+outfits?\b/.test(normalized)) return 3;
  return null;
}

const OUTFIT_REFINEMENT_RE =
  /\b(with|without|more|less|make|push|safer|balanced|bold|dressier|casual|formal|streetwear|jackets?|outerwear|bags?|glasses|watch|accessor(?:y|ies)|heels?|boots?|sneakers?|loafers?)\b/i;

function latestAuraLookCount(messages: AIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const count = message.aura?.lookOptions?.length ?? (message.aura?.look ? 1 : 0);
    if (count > 0) return count;
  }
  return 0;
}

function previousUserPrompt(messages: AIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.type !== "user") continue;
    const text = String(message.text ?? "").trim();
    if (text) return text;
  }
  return "";
}

function buildStructuredOutfitBatchPrompt(prompt: string, messages: AIMessage[]) {
  const current = String(prompt ?? "").trim();
  if (!current) return current;
  if (MULTI_OUTFIT_REQUEST_RE.test(current)) return current;
  if (!OUTFIT_REFINEMENT_RE.test(current)) return current;
  const prior = previousUserPrompt(messages);
  if (!prior || prior === current) {
    return `Give me ${requestedOutfitCount(current)} outfits. ${current}`;
  }
  return `${prior}. Refine those outfit options: ${current}`;
}

function wantsStructuredOutfitBatch(
  prompt: string,
  attachmentCount: number,
  messages: AIMessage[],
) {
  if (attachmentCount !== 0) return false;
  if (MULTI_OUTFIT_REQUEST_RE.test(prompt)) return true;
  return latestAuraLookCount(messages) > 0 && OUTFIT_REFINEMENT_RE.test(prompt);
}

function resolveStructuredBatchLookCount(
  prompt: string,
  structuredBatchPrompt: string,
  messages: AIMessage[],
) {
  const explicitCurrentCount = explicitRequestedOutfitCount(prompt);
  if (explicitCurrentCount) return explicitCurrentCount;

  const explicitStructuredCount = explicitRequestedOutfitCount(structuredBatchPrompt);
  if (explicitStructuredCount) return explicitStructuredCount;

  const latestLookCount = latestAuraLookCount(messages);
  if (latestLookCount > 0) return latestLookCount;

  return requestedOutfitCount(structuredBatchPrompt || prompt);
}

function promptRequestsOuterwear(prompt: string) {
  return OUTERWEAR_REQUEST_RE.test(String(prompt ?? ""));
}

function lookHasOuterwear(look?: AuraResponse["look"] | null) {
  return Boolean(
    look?.pieces?.some((piece) => {
      const tokens = `${String(piece.role ?? "")} ${String(piece.itemName ?? "")}`.toLowerCase();
      return (
        piece.role === "outerwear" ||
        /\b(jacket|coat|outerwear|overshirt|blazer|hoodie|cardigan|shacket|trench|parka|bomber)\b/.test(tokens)
      );
    }),
  );
}

function closetHasOuterwear(items: ClothingItem[]) {
  return items.some((item) => {
    const tokens = [
      String(item.category ?? ""),
      String(item.subCategory ?? ""),
      String(item.type ?? ""),
      String(item.name ?? ""),
    ]
      .join(" ")
      .toLowerCase();

    return (
      String(item.category ?? "").trim().toLowerCase() === "outerwear" ||
      /\b(jacket|coat|outerwear|overshirt|blazer|hoodie|cardigan|shacket|trench|parka|bomber)\b/.test(tokens)
    );
  });
}

function countClosetOuterwear(items: ClothingItem[]) {
  return items.filter((item) => {
    const tokens = [
      String(item.category ?? ""),
      String(item.subCategory ?? ""),
      String(item.type ?? ""),
      String(item.name ?? ""),
    ]
      .join(" ")
      .toLowerCase();

    return (
      String(item.category ?? "").trim().toLowerCase() === "outerwear" ||
      /\b(jacket|coat|outerwear|overshirt|blazer|hoodie|cardigan|shacket|trench|parka|bomber)\b/.test(tokens)
    );
  }).length;
}

function listClosetOuterwear(items: ClothingItem[]) {
  return items.filter((item) => {
    const tokens = [
      String(item.category ?? ""),
      String(item.subCategory ?? ""),
      String(item.type ?? ""),
      String(item.name ?? ""),
    ]
      .join(" ")
      .toLowerCase();

    return (
      String(item.category ?? "").trim().toLowerCase() === "outerwear" ||
      /\b(jacket|coat|outerwear|overshirt|blazer|hoodie|cardigan|shacket|trench|parka|bomber|denim jacket)\b/.test(tokens)
    );
  });
}

function buildOuterwearPiece(item: ClothingItem) {
  const imageUrl = getItemImageUrl(item, { variant: "thumb" });

  return {
    role: "outerwear" as const,
    itemName:
      String(item.name ?? "").trim() ||
      String(item.subCategory ?? "").trim() ||
      String(item.type ?? "").trim() ||
      "Outerwear piece",
    source: "closet" as const,
    itemId: item.id,
    imageUrl,
  };
}

function repairLookForOuterwearRequirement(
  look: NonNullable<AuraResponse["look"]>,
  outerwearPool: ClothingItem[],
  usedOuterwearIds: Set<string>,
) {
  if (lookHasOuterwear(look) || outerwearPool.length === 0) return look;

  const chosen =
    outerwearPool.find((item) => !usedOuterwearIds.has(item.id)) ??
    outerwearPool[0];
  if (!chosen) return look;
  usedOuterwearIds.add(chosen.id);
  const outerwearPiece = buildOuterwearPiece(chosen);
  const fromCloset = Array.from(
    new Set([outerwearPiece.itemName, ...(look.fromCloset ?? [])].filter(Boolean)),
  );
  const lookTitle = String(look.lookTitle ?? "").trim();
  const nextTitle = lookTitle.toLowerCase().includes(outerwearPiece.itemName.toLowerCase())
    ? lookTitle
    : `${outerwearPiece.itemName} + ${lookTitle || "Layered outfit"}`;

  return {
    ...look,
    lookTitle: nextTitle,
    stylingNote: look.stylingNote
      ? `${look.stylingNote} Layer in ${outerwearPiece.itemName.toLowerCase()} to complete the silhouette.`
      : `Layer in ${outerwearPiece.itemName.toLowerCase()} to complete the silhouette.`,
    pieces: [outerwearPiece, ...(look.pieces ?? [])],
    fromCloset,
  };
}

function ensureOuterwearLooks(
  lookOptions: NonNullable<AuraResponse["lookOptions"]>,
  items: ClothingItem[],
) {
  const outerwearPool = listClosetOuterwear(items);
  const usedOuterwearIds = new Set<string>();
  return lookOptions.map((look) =>
    repairLookForOuterwearRequirement(look, outerwearPool, usedOuterwearIds),
  );
}

function buildAuraResponseFromSwipeBatch(
  batch: Awaited<ReturnType<typeof generateAuraSwipeBatch>>,
  options?: { prompt?: string; items?: ClothingItem[] },
): AuraResponse {
  const wantsOuterwear = promptRequestsOuterwear(options?.prompt ?? "");
  const availableOuterwearCount = countClosetOuterwear(options?.items ?? []);
  const repairedLookOptions =
    wantsOuterwear && availableOuterwearCount > 0
      ? ensureOuterwearLooks(batch.lookOptions.map((entry) => entry.look), options?.items ?? [])
      : batch.lookOptions.map((entry) => entry.look);
  const lookOptions = repairedLookOptions;
  const primaryLook = lookOptions[0] ?? null;
  const count = lookOptions.length;
  const hasOuterwearLooks = lookOptions.some((look) => lookHasOuterwear(look));
  const hasOuterwearInCloset = closetHasOuterwear(options?.items ?? []);
  if (__DEV__) {
    console.log("[AURA_OUTERWEAR]", "frontend structured batch summary", {
      prompt: options?.prompt ?? "",
      requiresOuterwear: wantsOuterwear,
      availableOuterwearCount,
      finalLookIds: batch.lookOptions.map((entry) => entry.id),
      lookOuterwearCounts: lookOptions.map((look, index) => ({
        index,
        count: look.pieces?.filter((piece) => piece.role === "outerwear").length ?? 0,
        title: look.lookTitle,
      })),
    });
  }
  return {
    presentation: "card",
    title:
      wantsOuterwear && hasOuterwearLooks
        ? count > 1
          ? `${count} Jacket Options`
          : "Jacket Option"
        : count > 1
          ? `${count} Outfit Options`
          : "Outfit Option",
    reply:
      wantsOuterwear && !hasOuterwearLooks && !hasOuterwearInCloset
        ? "A jacket or layer would open this up. I’ll keep the current looks to pieces you already own."
        : wantsOuterwear && !hasOuterwearLooks
          ? "I couldn't build reliable jacket looks from the current generator, so I repaired the closest structured options with outerwear from your closet."
          : count > 1
        ? `I pulled ${count} structured outfit options from your closet so you can compare them side by side.`
        : "I pulled one structured outfit option from your closet.",
    reason: "",
    outfitItems: primaryLook?.fromCloset ?? [],
    ownedPieces: primaryLook?.fromCloset ?? [],
    recommendedAdditions: primaryLook?.addToComplete ?? [],
    swapSuggestion: "",
    chips: [
      "Show me 3 more",
      "Make them more formal",
      "Push it more streetwear",
      "Use only basics",
    ],
    look: primaryLook,
    lookOptions,
  };
}

function buildAuraHistory(messages: AIMessage[]) {
  return messages
    .filter((message) => message.type === "user" || message.type === "assistant")
    .map((message) => {
      const text =
        message.type === "assistant"
          ? String(message.aura?.reply ?? message.text ?? "").trim()
          : String(message.text ?? "").trim();
      if (!text) return null;
      return {
        role: message.type === "assistant" ? "assistant" : "user",
        text,
      } as const;
    })
    .filter((entry): entry is { role: "user" | "assistant"; text: string } => !!entry)
    .slice(-8);
}

function createSystemMessage(text: string): AIMessage {
  const createdAt = Date.now();
  return {
    id: createMessageId(),
    type: "system/action",
    kind: "system",
    text,
    createdAt,
    clientCreatedAt: createdAt,
    localSequence: nextLocalMessageSequence(),
  };
}

function appendUniqueSystemMessage(
  messages: AIMessage[],
  text: string,
  removeMessageId?: string
) {
  const withoutRemoved = removeMessageId
    ? messages.filter((entry) => entry.id !== removeMessageId)
    : messages;
  const alreadyShown = withoutRemoved.some(
    (entry) => entry.type === "system/action" && entry.text === text
  );
  return alreadyShown ? withoutRemoved : [...withoutRemoved, createSystemMessage(text)];
}

function userFacingAuraError(error: unknown) {
  const messageText =
    error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? "");
  const lower = messageText.toLowerCase();
  if (lower.includes("permission") || lower.includes("denied")) {
    return "I couldn't save that item because permission was denied.";
  }
  if (lower.includes("upload") || lower.includes("storage")) {
    return AURA_ATTACHMENT_FAILURE_MESSAGE;
  }
  if (lower.includes("draft") || lower.includes("firestore") || lower.includes("item")) {
    return AURA_DRAFT_FAILURE_MESSAGE;
  }
  if (lower.includes("parse") || lower.includes("json")) {
    return "I couldn't parse AURA's response. Please try again.";
  }
  if (lower.includes("network") || lower.includes("request failed") || lower.includes("timed out")) {
    return "I couldn't reach AURA right now. Please try again in a moment.";
  }
  return AURA_OFFLINE_MESSAGE;
}

export default function AIScreen() {
  const params = useLocalSearchParams<{
    prompt?: string | string[];
    promptKey?: string | string[];
    chatId?: string | string[];
    chatKey?: string | string[];
  }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [, setQuickChips] = useState<string[]>(DEFAULT_CHIPS);
  const [recentThreads, setRecentThreads] = useState<AIChatThread[]>([]);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentRole, setAttachmentRole] = useState<ChatAttachmentGroupRole>("reference");
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [focusScrollSignal, setFocusScrollSignal] = useState(0);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const latestMessagesRef = useRef<AIMessage[]>([]);
  const lastHydratedUidRef = useRef<string | null>(null);
  const audioRecorderRef = useRef<OptionalAudioRecorder | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const streamAbortControllerRef = useRef<AbortController | null>(null);
  const stopStreamingRequestedRef = useRef(false);
  const consumedPromptTokens = useRef(new Set<string>());
  const consumedChatTokens = useRef(new Set<string>());
  const auraPulse = useRef(new Animated.Value(0)).current;
  const auraThinking = useRef(new Animated.Value(0)).current;
  const uid = user?.uid ?? null;
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const minimumClosetSummary = useMemo(() => buildMinimumClosetSummary(items), [items]);
  const orderedMessages = useMemo(() => orderChatMessages(messages), [messages]);
  const hasStreamingMessage = useMemo(() => orderedMessages.some((entry) => entry.streaming), [orderedMessages]);

  useFocusEffect(
    React.useCallback(() => {
      setFocusScrollSignal((value) => value + 1);
    }, [])
  );

  const routePrompt = useMemo(() => {
    const raw = Array.isArray(params.prompt) ? params.prompt[0] : params.prompt;
    return typeof raw === "string" ? raw.trim() : "";
  }, [params.prompt]);

  const routePromptKey = useMemo(() => {
    const raw = Array.isArray(params.promptKey) ? params.promptKey[0] : params.promptKey;
    return typeof raw === "string" && raw.trim() ? raw.trim() : routePrompt;
  }, [params.promptKey, routePrompt]);

  const routeChatId = useMemo(() => {
    const raw = Array.isArray(params.chatId) ? params.chatId[0] : params.chatId;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "";
  }, [params.chatId]);

  const routeChatKey = useMemo(() => {
    const raw = Array.isArray(params.chatKey) ? params.chatKey[0] : params.chatKey;
    return typeof raw === "string" && raw.trim() ? raw.trim() : routeChatId;
  }, [params.chatKey, routeChatId]);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      return;
    }
    setItems([]);
    const unsub = listenToItems(uid, (next) => setItems(next as ClothingItem[]), {
      status: "ALL",
      sort: "NEWEST",
    });
    return () => {
      unsub();
    };
  }, [uid]);

  useEffect(() => {
    latestMessagesRef.current = orderedMessages;
  }, [orderedMessages]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(auraPulse, {
          toValue: 1,
          duration: 2600,
          useNativeDriver: true,
        }),
        Animated.timing(auraPulse, {
          toValue: 0,
          duration: 2600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [auraPulse]);

  const triggerThinkingPulse = React.useCallback(() => {
    Animated.sequence([
      Animated.timing(auraThinking, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(auraThinking, {
        toValue: 0,
        duration: 420,
        useNativeDriver: true,
      }),
    ]).start();
  }, [auraThinking]);

  const addImageAssets = React.useCallback(
    (assets: ImagePicker.ImagePickerAsset[]) => {
      const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next: ChatImageAttachment[] = assets
        .filter((asset) => !!asset.uri)
        .map((asset) => ({
          id: createLocalAttachmentId(),
          type: "image",
          uri: asset.uri,
          localUri: asset.uri,
          mimeType: asset.mimeType ?? null,
          groupId,
          role: attachmentRole,
          width: asset.width ?? null,
          height: asset.height ?? null,
        }));
      if (!next.length) return;
      setPendingAttachments((prev) => [...prev, ...next].slice(0, 8));
    },
    [attachmentRole],
  );

  const handlePickImages = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photos", "Please allow photo access to attach images.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      quality: 0.9,
      exif: false,
    });
    if (result.canceled) return;
    addImageAssets(result.assets ?? []);
  }, [addImageAssets]);

  const handleTakePhoto = React.useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera", "Please allow camera access to attach a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
      exif: false,
    });
    if (result.canceled) return;
    addImageAssets(result.assets ?? []);
  }, [addImageAssets]);

  const handleMicPress = React.useCallback(async () => {
    if (!uid) return;
    try {
      if (recordingAudio && audioRecorderRef.current) {
        const recorder = audioRecorderRef.current;
        await recorder.stop();
        const uri = recorder.uri;
        const startedAt = recordingStartedAtRef.current;
        audioRecorderRef.current = null;
        recordingStartedAtRef.current = null;
        setRecordingAudio(false);
        if (!uri) return;
        const durationMs = startedAt ? Date.now() - startedAt : null;
        try {
          const uploaded = await uploadAuraTranscriptionAudio(uid, {
            id: createLocalAttachmentId(),
            uri,
            localUri: uri,
            mimeType: "audio/mp4",
            durationMs,
          });
          const transcript = await transcribeAuraAudio(uploaded);
          if (transcript) {
            setMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
          } else {
            Alert.alert("Voice", "I couldn't hear any words in that recording.");
          }
        } finally {
          void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        }
        return;
      }

      const audio = await import("expo-audio").catch(() => null);
      if (!audio) {
        Alert.alert("Voice", "Voice input needs the latest native build. Image and text chat still work.");
        return;
      }

      const permission = await audio.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Voice", "Please allow microphone access to dictate a message.");
        return;
      }
      const recorder = new audio.AudioRecorder(audio.RecordingPresets.LOW_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      audioRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingAudio(true);
    } catch (error: any) {
      audioRecorderRef.current = null;
      recordingStartedAtRef.current = null;
      setRecordingAudio(false);
      const messageText = String(error?.message ?? "");
      Alert.alert(
        "Voice",
        messageText.includes("ExpoAudio")
          ? "Voice input needs the latest native build. Image and text chat still work."
          : messageText || "Unable to transcribe right now."
      );
    }
  }, [recordingAudio, uid]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!uid) {
        setMessages([]);
        setActiveChatId(null);
        setRecentThreads([]);
        lastHydratedUidRef.current = null;
        setIsBooting(false);
        return;
      }

      if (lastHydratedUidRef.current !== uid) {
        setMessages([]);
        setActiveChatId(null);
        setRecentThreads([]);
        lastHydratedUidRef.current = uid;
      }
      setIsBooting(true);

      const cachedThreads = await getCachedChatList(uid);
      if (!cancelled && cachedThreads?.data?.length) {
        setRecentThreads(cachedThreads.data);
      }

      const cachedActiveChatId = routeChatId || cachedThreads?.data?.find((thread) => !thread.archived)?.chatId || "";
      if (cachedActiveChatId) {
        const cachedMessages = await getCachedRecentMessages(uid, cachedActiveChatId);
        if (!cancelled && cachedMessages?.data?.length) {
          setMessages(orderChatMessages(cachedMessages.data));
          setActiveChatId(cachedActiveChatId);
        }
      } else {
        const cached = await loadLatestChatCache<AIMessage>(uid);
        if (!cancelled && cached?.messages?.length) {
          setMessages(orderChatMessages(cached.messages));
          setActiveChatId(cached.chatId ?? null);
        }
      }

      try {
        const shouldLoadSpecificChat =
          !!routeChatId && !consumedChatTokens.current.has(`${routeChatKey}:${routeChatId}`);
        if (shouldLoadSpecificChat) {
          consumedChatTokens.current.add(`${routeChatKey}:${routeChatId}`);
          const threadMessages = await loadChatMessages(uid, routeChatId);
          const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
          if (!cancelled) {
            setMessages(orderChatMessages(threadMessages));
            setActiveChatId(routeChatId);
            setQuickChips(DEFAULT_CHIPS);
            setRecentThreads(recent);
            await saveLatestChatCache(uid, routeChatId, null, threadMessages);
          }
          return;
        }

        const latestThread = await loadLatestChatThread(uid);
        const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
        if (!cancelled && latestThread?.chatId) {
          const threadMessages = await loadChatMessages(uid, latestThread.chatId);
          setMessages(orderChatMessages(threadMessages));
          setActiveChatId(latestThread.chatId);
          setRecentThreads(recent);
          await saveLatestChatCache(uid, latestThread.chatId, latestThread.threadId, threadMessages);
        } else if (!cancelled) {
          setRecentThreads(recent);
        }
      } catch (error) {
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA] hydrate failed", error);
        }
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [routeChatId, routeChatKey, uid]);

  useEffect(() => {
    if (isBooting) return;
    if (!uid) return;
    if (hasStreamingMessage) return;
    if (activeChatId) {
      void setCachedRecentMessages(uid, activeChatId, orderedMessages);
    }
    void saveLatestChatCache(uid, activeChatId, null, orderedMessages);
  }, [activeChatId, hasStreamingMessage, isBooting, orderedMessages, uid]);

  const refreshRecentThreads = React.useCallback(async () => {
    if (!uid) return [];
    const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
    setRecentThreads(recent);
    return recent;
  }, [uid]);

  const handleShareChatThread = React.useCallback(
    async (thread: AIChatThread) => {
      if (!uid) return;
      const threadMessages = await loadChatMessages(uid, thread.chatId);
      const message = buildShareTranscript(thread, threadMessages);
      await Share.share({
        title: summarizeChatTitle({
          userText: thread.title,
          assistantText: thread.lastMessagePreview,
        }),
        message,
      });
    },
    [uid],
  );

  const handleAddThreadToProject = React.useCallback(async () => {
    Alert.alert("Projects", "Projects are coming soon.");
  }, []);

  const handleTogglePinnedThread = React.useCallback(
    async (thread: AIChatThread) => {
      if (!uid) return;
      await setChatPinned(uid, thread.chatId, !thread.pinned);
      await refreshRecentThreads();
    },
    [refreshRecentThreads, uid],
  );

  const handleRenameThread = React.useCallback(
    async (thread: AIChatThread, title: string) => {
      if (!uid) return;
      await renameChatThread(uid, thread.chatId, title);
      setRecentThreads((prev) =>
        prev.map((entry) =>
          entry.chatId === thread.chatId
            ? { ...entry, title, titleEdited: true, updatedAt: Date.now() }
            : entry,
        ),
      );
      if (activeChatId === thread.chatId) {
        await saveLatestChatCache(uid, thread.chatId, null, latestMessagesRef.current);
      }
      await refreshRecentThreads();
    },
    [activeChatId, refreshRecentThreads, uid],
  );

  const handleArchiveThread = React.useCallback(
    async (thread: AIChatThread) => {
      if (!uid) return;
      await setChatArchived(uid, thread.chatId, true);
      setRecentThreads((prev) => prev.filter((entry) => entry.chatId !== thread.chatId));
      if (activeChatId === thread.chatId) {
        await clearCachedRecentMessages(uid, thread.chatId);
        setActiveChatId(null);
        setMessages([]);
        await clearLatestChatCache(uid);
      }
      await refreshRecentThreads();
    },
    [activeChatId, refreshRecentThreads, uid],
  );

  const handleDeleteThread = React.useCallback(
    async (thread: AIChatThread) => {
      if (!uid) return;
      await deleteChatThread(uid, thread.chatId);
      setRecentThreads((prev) => prev.filter((entry) => entry.chatId !== thread.chatId));
      if (activeChatId === thread.chatId) {
        await clearCachedRecentMessages(uid, thread.chatId);
        setActiveChatId(null);
        setMessages([]);
        await clearLatestChatCache(uid);
      }
      await refreshRecentThreads();
    },
    [activeChatId, refreshRecentThreads, uid],
  );

  useEffect(() => {
    const setLiveKeyboardHeight = (height: number) => {
      const nextHeight = Math.max(0, Math.round(height));
      setKeyboardHeight((current) => (Math.abs(current - nextHeight) <= 1 ? current : nextHeight));
    };

    const updateKeyboardHeight = (event: KeyboardEvent) => {
      const screenY = Number(event.endCoordinates.screenY);
      const nextHeight =
        event.endCoordinates.height <= 0 || !Number.isFinite(screenY) || screenY >= layout.height - 1
          ? 0
          : Math.max(0, layout.height - screenY);
      setLiveKeyboardHeight(nextHeight);
    };

    const resetKeyboardHeight = () => {
      setKeyboardHeight(0);
    };

    const changeEvent = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";

    const changeSubscription = Keyboard.addListener(changeEvent, updateKeyboardHeight);
    const willShowSubscription =
      Platform.OS === "ios" ? Keyboard.addListener("keyboardWillShow", updateKeyboardHeight) : null;
    const willHideSubscription =
      Platform.OS === "ios" ? Keyboard.addListener("keyboardWillHide", resetKeyboardHeight) : null;
    const didHideSubscription = Keyboard.addListener("keyboardDidHide", resetKeyboardHeight);

    return () => {
      changeSubscription.remove();
      willShowSubscription?.remove();
      willHideSubscription?.remove();
      didHideSubscription.remove();
    };
  }, [layout.height]);

  const handleAsk = React.useCallback(
    async (override?: string) => {
      if (!uid) {
        Alert.alert("AURA", "Please sign in to chat with AURA.");
        return;
      }

      const prompt = String(override ?? message).trim();
      const outgoingAttachments = override ? [] : pendingAttachments;
      if ((!prompt && outgoingAttachments.length === 0) || loading) return;
      stopStreamingRequestedRef.current = false;

      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_SEND]", "sending message", {
          uid,
          hasPrompt: !!prompt,
          attachmentCount: outgoingAttachments.length,
          attachmentTypes: outgoingAttachments.map((attachment) => attachment.type),
          attachments: outgoingAttachments.map((attachment) => ({
            id: attachment.id,
            type: attachment.type,
            mimeType: attachment.mimeType ?? null,
            hasLocalUri: !!attachment.localUri,
            hasRemoteUri: /^https?:\/\//i.test(String(attachment.uri ?? "")),
            role: attachment.type === "image" ? attachment.role ?? null : null,
            width: attachment.type === "image" ? attachment.width ?? null : null,
            height: attachment.type === "image" ? attachment.height ?? null : null,
          })),
        });
      }
      setLoading(true);
      let uploadedAttachments = outgoingAttachments;
      try {
        uploadedAttachments = outgoingAttachments.length
          ? await uploadAuraAttachments(uid, outgoingAttachments)
          : [];
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_UPLOAD]", "attachment batch ready for send", {
            uid,
            count: uploadedAttachments.length,
            attachments: uploadedAttachments.map((attachment) => ({
              id: attachment.id,
              type: attachment.type,
              mimeType: attachment.mimeType ?? null,
              storagePath: attachment.storagePath ?? null,
              uriHost: (() => {
                try {
                  return new URL(attachment.uri).hostname;
                } catch {
                  return null;
                }
              })(),
              role: attachment.type === "image" ? attachment.role ?? null : null,
              groupId: attachment.type === "image" ? attachment.groupId ?? null : null,
              width: attachment.type === "image" ? attachment.width ?? null : null,
              height: attachment.type === "image" ? attachment.height ?? null : null,
            })),
          });
        }
      } catch (error: any) {
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_ERROR]", "attachment upload failed", error);
        }
        setLoading(false);
        setMessages((prev) => orderChatMessages(appendUniqueSystemMessage(prev, AURA_ATTACHMENT_FAILURE_MESSAGE)));
        Alert.alert("Attachments", error?.message ?? AURA_ATTACHMENT_FAILURE_MESSAGE);
        return;
      }

      const userMessage = createUserMessageWithAttachments(prompt, uploadedAttachments);
      logAuraChatState("message_created", {
        messageId: userMessage.id,
        type: userMessage.type,
        kind: userMessage.kind,
        attachmentCount: uploadedAttachments.length,
      });
      const chatSeedText = buildChatSeedText(prompt, uploadedAttachments);
      const nextLocalMessages = orderChatMessages([...latestMessagesRef.current, userMessage]);
      const structuredBatchPrompt = buildStructuredOutfitBatchPrompt(prompt, latestMessagesRef.current);
      const shouldForceStructuredBatch = wantsStructuredOutfitBatch(
        prompt,
        uploadedAttachments.length,
        latestMessagesRef.current,
      );
      setMessages(nextLocalMessages);
      setFocusMessageId(userMessage.id);
      if (!override) {
        setMessage("");
        setPendingAttachments([]);
      }
      triggerThinkingPulse();
      const streamingMessageId = createMessageId();
      const streamingMessageCreatedAt = Math.max(Date.now(), messageOrderMillis(userMessage) + 1);
      const streamingMessageLocalSequence = nextLocalMessageSequence();
      logAuraChatState("streaming_message_reserved", {
        messageId: streamingMessageId,
        createdAt: streamingMessageCreatedAt,
        replyToMessageId: userMessage.id,
      });

      let chatId = activeChatId;
      const startedAt = Date.now();
      let cancelStreamingFlush: (() => void) | null = null;
      let flushStreamingTextNow: (() => void) | null = null;
      let activeStreamController: AbortController | null = null;
      let streamedTextSoFar = "";
      let streamFinalized = false;

      try {
        if (!chatId) {
          const chat = await createChatThread(uid, chatSeedText);
          chatId = chat.chatId;
          setActiveChatId(chat.chatId);
        }

        void updateAuraSessionContextFromPrompt(uid, chatId, prompt);
        await appendMessageToChat(uid, chatId, userMessage, { titleFromUserText: chatSeedText });

        const imageIntent = classifyAuraImageIntent(prompt, uploadedAttachments);
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_INTENT]", "classified image intent", {
            uid,
            prompt,
            imageIntent,
            attachmentCount: uploadedAttachments.length,
            attachmentRoles: uploadedAttachments.map((attachment) =>
              attachment.type === "image" ? attachment.role ?? null : attachment.type
            ),
          });
        }

        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_STREAM_REQUEST]", "ai screen request args", {
            prompt,
            clientIntent: imageIntent,
            attachmentCount: uploadedAttachments.length,
            attachments: uploadedAttachments.map((attachment) => ({
              type: attachment.type,
              mimeType: attachment.mimeType ?? null,
              storagePath: attachment.storagePath ?? null,
              uriHost: (() => {
                try {
                  return new URL(attachment.uri).hostname;
                } catch {
                  return null;
                }
              })(),
              role: attachment.type === "image" ? attachment.role ?? null : null,
              groupId: attachment.type === "image" ? attachment.groupId ?? null : null,
              width: attachment.type === "image" ? attachment.width ?? null : null,
              height: attachment.type === "image" ? attachment.height ?? null : null,
            })),
          });
        }

        if (shouldForceStructuredBatch) {
          const desiredLookCount = resolveStructuredBatchLookCount(
            prompt,
            structuredBatchPrompt,
            latestMessagesRef.current,
          );
          if (DEBUG_AURA_CLIENT) {
            console.log("[AURA_MULTI]", "frontend structured batch request", {
              prompt,
              structuredBatchPrompt,
              desiredLookCount,
              latestLookCount: latestAuraLookCount(latestMessagesRef.current),
            });
          }
          if (promptRequestsOuterwear(structuredBatchPrompt) && !closetHasOuterwear(items)) {
            const noOuterwearResponse: AuraResponse = {
              title: "No outerwear found",
              reply:
                "A jacket or layer would open this up. Add one jacket, blazer, hoodie, coat, or overshirt and I can build layered looks without inventing pieces you do not own.",
              reason: "",
              outfitItems: [],
              ownedPieces: [],
              recommendedAdditions: [],
              swapSuggestion: "",
              chips: DEFAULT_CHIPS,
            };
            const assistantMessage = createAssistantMessage(noOuterwearResponse, {
              id: streamingMessageId,
              createdAt: streamingMessageCreatedAt,
              clientCreatedAt: streamingMessageCreatedAt,
              localSequence: streamingMessageLocalSequence,
              replyToMessageId: userMessage.id,
              streaming: false,
            }, {
              userRequest: prompt,
            });
            logAuraChatState("message_created", {
              messageId: assistantMessage.id,
              type: assistantMessage.type,
              kind: assistantMessage.kind,
              source: "structured_batch_no_outerwear",
            });
            setMessages(orderChatMessages([...nextLocalMessages, assistantMessage]));
            await appendMessageToChat(uid, chatId, assistantMessage);
            await updateChatThread(uid, chatId, {
              title: deriveAssistantChatTitle(chatSeedText, assistantMessage),
            });
            const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
            setRecentThreads(recent);
            return;
          }
          const outfitBatch = await generateAuraSwipeBatch({
            intentText: structuredBatchPrompt,
            numOutfits: desiredLookCount,
            items,
          });
          const batchResponse = buildAuraResponseFromSwipeBatch(outfitBatch, {
            prompt: structuredBatchPrompt,
            items,
          });
          if (DEBUG_AURA_CLIENT) {
            console.log("[AURA_MULTI]", "frontend batch fallback response", {
              prompt,
              structuredBatchPrompt,
              lookOptionsCount: batchResponse.lookOptions?.length ?? 0,
              lookTitles: batchResponse.lookOptions?.map((look) => look.lookTitle) ?? [],
            });
          }
          const assistantMessage = createAssistantMessage(batchResponse, {
            id: streamingMessageId,
            createdAt: streamingMessageCreatedAt,
            clientCreatedAt: streamingMessageCreatedAt,
            localSequence: streamingMessageLocalSequence,
            replyToMessageId: userMessage.id,
            streaming: false,
          }, {
            userRequest: structuredBatchPrompt,
          });
          logAuraChatState("message_created", {
            messageId: assistantMessage.id,
            type: assistantMessage.type,
            kind: assistantMessage.kind,
            source: "structured_batch",
            lookOptionsCount: batchResponse.lookOptions?.length ?? 0,
          });
          setMessages(orderChatMessages([...nextLocalMessages, assistantMessage]));
          setQuickChips(batchResponse.chips?.length ? batchResponse.chips : DEFAULT_CHIPS);
          await appendMessageToChat(uid, chatId, assistantMessage);
          await updateChatThread(uid, chatId, {
            title: deriveAssistantChatTitle(chatSeedText, assistantMessage),
          });
          const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
          setRecentThreads(recent);
          return;
        }

        let pendingStreamText = "";
        let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
        const flushStreamingText = () => {
          if (streamFlushTimer) {
            clearTimeout(streamFlushTimer);
            streamFlushTimer = null;
          }
          const nextText = pendingStreamText;
          pendingStreamText = "";
          if (!nextText) return;
          if (streamFinalized) return;
          streamedTextSoFar += nextText;
          logAuraChatState("stream_delta_flush", {
            messageId: streamingMessageId,
            length: nextText.length,
          });
          setMessages((prev) => {
            const next = updateMessageById(prev, streamingMessageId, (entry) => ({
              ...entry,
              text: `${entry.text ?? ""}${nextText}`,
              streaming: true,
            }));
            if (next === prev) {
              logAuraChatState("stream_delta_missing_message", {
                messageId: streamingMessageId,
                length: nextText.length,
              });
            }
            return orderChatMessages(next);
          });
        };
        const queueStreamingDelta = (delta: string) => {
          if (streamFinalized) return;
          pendingStreamText += delta;
          if (streamFlushTimer) return;
          streamFlushTimer = setTimeout(flushStreamingText, STREAM_FLUSH_INTERVAL_MS);
        };
        cancelStreamingFlush = () => {
          if (streamFlushTimer) {
            clearTimeout(streamFlushTimer);
            streamFlushTimer = null;
          }
          pendingStreamText = "";
        };
        flushStreamingTextNow = flushStreamingText;

        const streamingMessage = createStreamingAssistantMessage(
          streamingMessageId,
          streamingMessageCreatedAt,
          userMessage.id,
          streamingMessageLocalSequence,
        );
        logAuraChatState("stream_started", {
          messageId: streamingMessage.id,
          chatId,
        });
        void runHaptic(AURA_REPLY_START_HAPTIC);
        const streamAbortController = new AbortController();
        activeStreamController = streamAbortController;
        streamAbortControllerRef.current = streamAbortController;
        setMessages(orderChatMessages([...nextLocalMessages, streamingMessage]));

        const result = await askAuraStream(
          {
            message: prompt,
            chatId,
            attachments: uploadedAttachments,
            history: buildAuraHistory(nextLocalMessages),
            clientIntent: imageIntent,
            clientContext: {
              minimumCloset: minimumClosetSummary,
            },
          },
          {
            signal: streamAbortController.signal,
            onStatus: () => {
              if (DEBUG_AURA_CLIENT) {
                console.log("[AURA_STREAM]", "stream status received", { uid, chatId });
              }
            },
            onDelta: (delta) => {
              queueStreamingDelta(delta);
            },
            onFinal: (finalData) => {
              flushStreamingText();
              if (DEBUG_AURA_CLIENT) {
                console.log("[AURA_STREAM_FINAL]", "frontend final received", {
                  uid,
                  chatId,
                  hasLook: !!finalData.look,
                  candidateItemsCount: finalData.candidateItems?.length ?? 0,
                  candidatesCount: finalData.candidates?.length ?? 0,
                  presentation: finalData.presentation,
                });
              }
            },
          }
        );
        flushStreamingText();
        let finalResult = result;
        if (
          shouldForceStructuredBatch &&
          !result.look &&
          !(result.lookOptions?.length)
        ) {
          const desiredLookCount = resolveStructuredBatchLookCount(
            prompt,
            structuredBatchPrompt,
            nextLocalMessages,
          );
          if (DEBUG_AURA_CLIENT) {
            console.log("[AURA_MULTI]", "stream returned no structured looks; using frontend batch fallback", {
              prompt,
              structuredBatchPrompt,
              desiredLookCount,
              presentation: result.presentation,
              outfitItemsCount: result.outfitItems?.length ?? 0,
              ownedPiecesCount: result.ownedPieces?.length ?? 0,
            });
          }
          const outfitBatch = await generateAuraSwipeBatch({
            intentText: structuredBatchPrompt,
            numOutfits: desiredLookCount,
            items,
          });
          finalResult = buildAuraResponseFromSwipeBatch(outfitBatch, {
            prompt: structuredBatchPrompt,
            items,
          });
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed < 300) {
          await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
        }
        const assistantMessage = createAssistantMessage(finalResult, {
          id: streamingMessageId,
          createdAt: streamingMessageCreatedAt,
          clientCreatedAt: streamingMessageCreatedAt,
          localSequence: streamingMessageLocalSequence,
          replyToMessageId: userMessage.id,
          streaming: false,
        }, {
          userRequest: structuredBatchPrompt || prompt,
        });
        streamFinalized = true;
        logAuraChatState("stream_finalized", {
          messageId: assistantMessage.id,
          kind: assistantMessage.kind,
          hasAura: !!assistantMessage.aura,
          lookOptionsCount: assistantMessage.aura?.lookOptions?.length ?? 0,
          candidateItemsCount:
            assistantMessage.aura?.candidateItems?.length ??
            assistantMessage.aura?.candidates?.length ??
            0,
        });
        setMessages((prev) => {
          const next = updateMessageById(prev, streamingMessageId, () => assistantMessage);
          if (next === prev) {
            logAuraChatState("stream_finalize_missing_message", {
              messageId: streamingMessageId,
            });
          }
          return orderChatMessages(next);
        });
        void runHaptic(AURA_REPLY_FINISH_HAPTIC);
        setQuickChips(finalResult.chips?.length ? finalResult.chips : DEFAULT_CHIPS);
        await appendMessageToChat(uid, chatId, assistantMessage);
        await updateChatThread(uid, chatId, {
          title: deriveAssistantChatTitle(chatSeedText, assistantMessage),
        });
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_STREAM]", "stream flow complete", { uid, chatId });
        }
        const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
        setRecentThreads(recent);
      } catch (error) {
        const wasStopped = stopStreamingRequestedRef.current || isAuraStreamAbortError(error);
        if (wasStopped) {
          flushStreamingTextNow?.();
          streamFinalized = true;
          cancelStreamingFlush?.();
          const partialText = streamedTextSoFar.trim();
          const stoppedAssistantMessage: AIMessage | null = partialText
            ? {
                id: streamingMessageId,
                type: "assistant",
                kind: "aura_text",
                text: partialText,
                streaming: false,
                createdAt: streamingMessageCreatedAt,
                clientCreatedAt: streamingMessageCreatedAt,
                localSequence: streamingMessageLocalSequence,
                replyToMessageId: userMessage.id,
              }
            : null;
          setMessages((prev) => {
            if (!stoppedAssistantMessage) {
              return orderChatMessages(prev.filter((entry) => entry.id !== streamingMessageId));
            }
            return orderChatMessages(updateMessageById(prev, streamingMessageId, () => stoppedAssistantMessage));
          });
          if (stoppedAssistantMessage && chatId) {
            await appendMessageToChat(uid, chatId, stoppedAssistantMessage);
            await updateChatThread(uid, chatId, {
              title: deriveAssistantChatTitle(chatSeedText, stoppedAssistantMessage),
            });
            const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
            setRecentThreads(recent);
          }
          if (DEBUG_AURA_CLIENT) {
            console.log("[AURA_STREAM]", "stream stopped by user", {
              uid,
              chatId,
              messageId: streamingMessageId,
              partialLength: partialText.length,
            });
          }
          return;
        }
        streamFinalized = true;
        cancelStreamingFlush?.();
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_ERROR]", "ask failed", {
            uid,
            chatId,
            prompt,
            attachmentCount: uploadedAttachments.length,
            error,
          });
        }
        const fallback = userFacingAuraError(error);
        setMessages((prev) => orderChatMessages(appendUniqueSystemMessage(prev, fallback, streamingMessageId)));
        Toast.error("AURA paused", fallback);
      } finally {
        cancelStreamingFlush?.();
        if (activeStreamController && streamAbortControllerRef.current === activeStreamController) {
          streamAbortControllerRef.current = null;
        }
        stopStreamingRequestedRef.current = false;
        setLoading(false);
      }
    },
    [activeChatId, items, loading, message, minimumClosetSummary, pendingAttachments, triggerThinkingPulse, uid]
  );

  const handleStopGenerating = React.useCallback(() => {
    stopStreamingRequestedRef.current = true;
    streamAbortControllerRef.current?.abort();
    void runHaptic("selection");
  }, []);

  const handleAuraLookAction = React.useCallback(
    async (
      action: AuraLookAction,
      sourceMessage: AIMessage,
      selectedLook?: import("@/src/types/aura").AuraLook,
      lookOption?: AuraLookOptionMeta,
    ) => {
      const look = selectedLook ?? sourceMessage.aura?.look;
      const promptBase = look?.lookTitle || sourceMessage.aura?.title || "this look";
      if (!look || !uid) return;
      if (loading) return;
      if (action === "saveLook") {
        try {
          await saveAuraLook(uid, look, { title: sourceMessage.aura?.title });
          void runHaptic("light");
          Toast.saved();
        } catch (error: any) {
          Toast.error("Save failed", error?.message ?? "Unable to save this look.");
        }
        return;
      }
      if (action === "planForToday") {
        try {
          await savePlannedRecord(uid, new Date(), auraLookToPlannedOutfit(look));
          void runHaptic("light");
          Toast.success("Planned", "This look is now attached to today.");
        } catch (error: any) {
          Toast.error("Plan failed", error?.message ?? "Unable to plan this look for today.");
        }
        return;
      }
      if (action === "likeLook") {
        await logAuraLookStyleEvent(uid, "outfit_liked", look, { source: "aura" });
        await saveAuraOutfitFeedback(uid, {
          feedbackType: "outfit_liked",
          look,
          chatId: activeChatId,
          messageId: sourceMessage.id,
          option: lookOption,
          source: "aura",
        });
        Alert.alert("Noted", "AURA will keep more of this energy in rotation.");
        return;
      }
      if (action === "notMyVibe") {
        await logAuraLookStyleEvent(uid, "outfit_disliked", look, { source: "aura" });
        await saveAuraOutfitFeedback(uid, {
          feedbackType: "outfit_disliked",
          look,
          chatId: activeChatId,
          messageId: sourceMessage.id,
          option: lookOption,
          source: "aura",
        });
        void handleAsk(buildAuraLookFeedbackPrompt(action, promptBase));
        return;
      }
      if (action === "showMoreLikeThis") {
        void logAuraLookStyleEvent(uid, "more_like_this", look, { source: "aura" });
        void handleAsk(buildAuraLookFeedbackPrompt(action, promptBase));
        return;
      }
      if (action === "lessLikeThis") {
        await logAuraLookStyleEvent(uid, "less_like_this", look, { source: "aura" });
        void handleAsk(buildAuraLookFeedbackPrompt(action, promptBase));
        return;
      }
      if (action === "shopMissingPieces") {
        const missingPieces = look.addToComplete.filter(Boolean);
        Alert.alert(
          "Missing pieces",
          missingPieces.length
            ? missingPieces.join("\n")
            : "AURA does not see any missing pieces in this look yet.",
          missingPieces.length
            ? [
                { text: "Close", style: "cancel" },
                {
                  text: "Create shopping brief",
                  onPress: () =>
                    void handleAsk(
                      `Turn ${promptBase} into a concise shopping brief. Tell me what is actually missing from my wardrobe, what matters most to buy first, and what can wait.`
                    ),
                },
              ]
            : [{ text: "Close", style: "cancel" }]
        );
        return;
      }
      if (action === "useOnlyMyCloset") {
        void handleAsk(`Fix ${promptBase} using only my closet. Keep the same overall intent, but make it feel more resolved with pieces I already own.`);
        return;
      }
      if (action === "makeItDressier") {
        void handleAsk(`Fix ${promptBase} and make it dressier. Keep it polished, tasteful, and still like me.`);
      }
    },
    [activeChatId, handleAsk, loading, uid]
  );

  const updateCandidateStatuses = React.useCallback(
    (sourceMessage: AIMessage, candidateIds: string[], status: AuraCandidateItem["status"]) => {
      const ids = new Set(candidateIds);
      const nextAura = sourceMessage.aura
        ? {
            ...sourceMessage.aura,
            candidateItems: (sourceMessage.aura.candidateItems ?? sourceMessage.aura.candidates)?.map((candidate) =>
              ids.has(candidate.candidateId) ? { ...candidate, status } : candidate
            ),
            candidates: (sourceMessage.aura.candidateItems ?? sourceMessage.aura.candidates)?.map((candidate) =>
              ids.has(candidate.candidateId) ? { ...candidate, status } : candidate
            ),
          }
        : null;
      if (!nextAura) return;
      setMessages((prev) =>
        prev.map((entry) =>
          entry.id === sourceMessage.id
            ? {
                ...entry,
                aura: nextAura,
                text: nextAura.reply,
              }
            : entry
        )
      );
    },
    []
  );

  const handleAuraCandidateAction = React.useCallback(
    async (action: AuraCandidateAction, sourceMessage: AIMessage) => {
      if (!uid) {
        Alert.alert("AURA", "Please sign in to add items.");
        return;
      }
      const candidates = sourceMessage.aura?.candidates ?? [];
      const candidateItems = sourceMessage.aura?.candidateItems ?? candidates;
      const targetCandidates =
        action.type === "add_all_candidates"
          ? candidateItems.filter((candidate) => candidate.status === "awaiting_confirmation")
          : candidateItems.filter((candidate) => candidate.candidateId === action.candidateId);
      if (!targetCandidates.length) return;

      if (action.type === "cancel_candidate") {
        updateCandidateStatuses(sourceMessage, targetCandidates.map((candidate) => candidate.candidateId), "cancelled");
        return;
      }

      try {
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_CONFIRM]", "candidate confirm started", {
            uid,
            action,
            candidateIds: targetCandidates.map((candidate) => candidate.candidateId),
            candidateCount: targetCandidates.length,
          });
        }
        const localPhotosByCandidateId = resolveLocalPhotosForAuraCandidates(
          latestMessagesRef.current,
          sourceMessage,
          targetCandidates
        );
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_CONFIRM]", "candidate local photo resolution", {
            uid,
            candidateIds: targetCandidates.map((candidate) => candidate.candidateId),
            localPhotoCandidateIds: Object.keys(localPhotosByCandidateId).filter(
              (candidateId) => !!localPhotosByCandidateId[candidateId]?.localUri
            ),
          });
        }
        const created = await createAuraItemDraftsFromCandidates({
          uid,
          candidates: targetCandidates,
          prompt: sourceMessage.text ?? sourceMessage.aura?.reply ?? "",
          mode: action.type === "edit_candidate" ? "awaiting_confirmation" : "pending",
          localPhotosByCandidateId,
        });
        if (action.type === "edit_candidate") {
          const first = created[0];
          if (first?.itemId) {
            router.push({
              pathname: "/(tabs)/add",
              params: { editId: first.itemId },
            });
          }
          return;
        }
        updateCandidateStatuses(sourceMessage, targetCandidates.map((candidate) => candidate.candidateId), "added");
        const systemMessage = createSystemMessage(
          created.length === 1
            ? "Added to your wardrobe. Processing it now."
            : `Added ${created.length} items to your wardrobe. Processing them now.`
        );
        setMessages((prev) => orderChatMessages(appendUniqueSystemMessage(prev, systemMessage.text ?? "")));
        if (activeChatId) {
          await appendMessageToChat(uid, activeChatId, systemMessage);
          const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
          setRecentThreads(recent);
        }
      } catch (error) {
        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_CONFIRM_ERROR]", "candidate action failed", {
            uid,
            action,
            errorCode: (error as { code?: unknown })?.code ?? null,
            errorMessage: error instanceof Error ? error.message : String(error),
            error,
          });
        }
        updateCandidateStatuses(sourceMessage, targetCandidates.map((candidate) => candidate.candidateId), "failed");
      }
    },
    [activeChatId, uid, updateCandidateStatuses]
  );

  const handleAuraOutfitPhotoAction = React.useCallback(
    async (action: import("@/src/types/aura").AuraOutfitPhotoAction, sourceMessage: AIMessage) => {
      if (!uid) {
        Alert.alert("AURA", "Please sign in to save this outfit.");
        return;
      }
      const analysis = sourceMessage.aura?.outfitAnalysis;
      if (!analysis) return;
      const sourcePhoto = resolveOutfitSourcePhoto(latestMessagesRef.current, sourceMessage);
      const sourceImageUrl = analysis.sourceImageUrl || sourcePhoto?.uri || null;

      if (action.type === "improve_outfit") {
        const pieces = analysis.detectedPieces
          .map((piece) => [piece.color, piece.label].filter(Boolean).join(" "))
          .filter(Boolean)
          .join(", ");
        void handleAsk(`How do I improve this outfit? Visible pieces: ${pieces || "use the uploaded outfit photo context"}.`);
        return;
      }

      if (action.type === "add_pieces_to_closet") {
        try {
          const created = await createAuraItemDraftsFromDetectedOutfit({
            uid,
            pieces: analysis.detectedPieces,
            sourceImageUrl,
            prompt: sourceMessage.text ?? sourceMessage.aura?.reply ?? "Outfit photo analysis",
          });
          Toast.success(
            "Drafts created",
            created.length === 1
              ? "Added one outfit piece draft using the original photo as reference."
              : `Added ${created.length} outfit piece drafts using the original photo as reference.`
          );
        } catch (error: any) {
          Toast.error("Drafts failed", error?.message ?? "Unable to create outfit piece drafts.");
        }
        return;
      }

      if (action.type === "save_worn_outfit") {
        try {
          await markAnalyzedOutfitWorn(uid, new Date(), {
            detectedPieces: analysis.detectedPieces,
            outfitVibe: analysis.outfitVibe ?? null,
            stylingNotes: analysis.stylingNotes ?? [],
            missingToComplete: analysis.missingToComplete ?? [],
            sourceImageUrl,
            wornAt: Date.now(),
          });
          void runHaptic("light");
          Toast.success("Saved", "This outfit is saved as worn today.");
        } catch (error: any) {
          Toast.error("Save failed", error?.message ?? "Unable to save this worn outfit.");
        }
      }
    },
    [handleAsk, uid]
  );

  const handleAuraLaundryAction = React.useCallback(
    async (action: AuraLaundryConfirmationAction) => {
      if (!uid) {
        Alert.alert("AURA", "Please sign in to update laundry.");
        return;
      }
      try {
        await updateLaundryStatus(uid, action.itemId, action.targetStatus);
        const item = itemsById.get(action.itemId);
        const label = item?.name || item?.subCategory || item?.category || "that item";
        const statusLabel =
          action.targetStatus === "clean"
            ? "clean"
            : action.targetStatus === "in_laundry"
              ? "in laundry"
              : "needs wash";
        const systemMessage = createSystemMessage(`Done — marked ${label} as ${statusLabel}.`);
        setMessages((prev) => orderChatMessages(appendUniqueSystemMessage(prev, systemMessage.text ?? "")));
        void runHaptic("light");
        Toast.laundryUpdated(`${label} is ${statusLabel}.`);
        if (activeChatId) {
          await appendMessageToChat(uid, activeChatId, systemMessage);
        }
      } catch (error: any) {
        Toast.error("Laundry update failed", error?.message ?? "Could not update that item.");
      }
    },
    [activeChatId, itemsById, uid]
  );

  useEffect(() => {
    if (!routePrompt || isBooting || !uid) return;
    const token = `${routePromptKey}:${routePrompt}`;
    if (consumedPromptTokens.current.has(token)) return;
    consumedPromptTokens.current.add(token);
    void handleAsk(routePrompt);
  }, [handleAsk, isBooting, routePrompt, routePromptKey, uid]);

  const orbScale = auraPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.035],
  });
  const orbGlow = auraPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.08, 0.18],
  });
  const activityGlow = auraThinking.interpolate({
    inputRange: [0, 1],
    outputRange: [0.02, 0.12],
  });
  const restingComposerBottom = layout.composerOffset;
  const isComposerActive = isComposerFocused || keyboardHeight > 0;
  const keyboardComposerBottom =
    keyboardHeight > 0
      ? Math.max(12, keyboardHeight + (Platform.OS === "ios" ? 8 : 4))
      : 0;
  const composerBottom = keyboardHeight > 0 ? keyboardComposerBottom : restingComposerBottom;
  const chatBottomReservation = composerBottom + composerHeight + 24;
  const showEmptyState = orderedMessages.length === 0 && !loading && !isBooting && !message.trim();
  const showKeyboardWatermark = keyboardHeight > 0 && orderedMessages.length < 2;
  const visibleHeroChips = AURA_TOP_CHIPS;
  const emptyChatState = useMemo(
    () =>
      isBooting ? (
        <AuraChatLoadingState />
      ) : showEmptyState ? (
        <AuraChatEmptyState onPrompt={(prompt) => void handleAsk(prompt)} />
      ) : (
        <View style={{ height: 2 }} />
      ),
    [handleAsk, isBooting, showEmptyState],
  );
  const handleSaveOutfitFromLegacyMessage = React.useCallback((_outfitId: string) => {}, []);
  const handleMoreLikeThisFromLegacyMessage = React.useCallback(
    (outfit: ChatOutfit) => {
      if (outfit.reason) void handleAsk(`Refine this direction: ${outfit.reason}`);
    },
    [handleAsk],
  );
  const handleSwapFromLegacyMessage = React.useCallback(
    (outfit: ChatOutfit) => {
      if (outfit.reason) void handleAsk(`Keep the mood, but swap one piece: ${outfit.reason}`);
    },
    [handleAsk],
  );
  const handleTrainingPress = React.useCallback(() => router.push(AURA_TRAINING_ROUTE), []);

  return (
    <AuraGlowBackground>
      <LinearGradient
        colors={AURA_CHAT_BACKGROUND_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, paddingTop: Math.max(insets.top + 4, layout.topContentInset - 12) }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={AURA_CHAT_BOTTOM_GLOW_COLORS}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 180,
        }}
      />
        <AuraHeader
        colors={colors}
        recentThreadsCount={recentThreads.length}
        orbScale={orbScale}
        orbGlow={orbGlow}
        activityGlow={activityGlow}
        streaming={loading}
        onOpenRecent={() => setChatDrawerOpen(true)}
        onReset={() => {
          setMessage("");
          setMessages([]);
          if (uid && activeChatId) {
            void clearCachedRecentMessages(uid, activeChatId);
          }
          setActiveChatId(null);
          setQuickChips(DEFAULT_CHIPS);
          if (uid) {
            void clearLatestChatCache(uid);
          }
        }}
      />

        <View style={{ paddingTop: 10, paddingBottom: 0 }}>
          <AuraQuickChips
            variant="pills"
            chips={visibleHeroChips}
            onPress={(chip) => {
              if (chip === TRAIN_AURA_CHIP_LABEL) {
                handleTrainingPress();
                return;
              }
              void handleAsk(chip);
            }}
          />
        </View>

        <View style={{ flex: 1, marginTop: 2, minHeight: 0 }}>
          <ChatList
          colors={colors}
          messages={orderedMessages}
          itemsById={itemsById}
          savingId={null}
          loading={loading}
          contentBottomPadding={chatBottomReservation}
          autoScrollSignal={focusScrollSignal}
          focusMessageId={focusMessageId}
          emptyState={emptyChatState}
          onSaveOutfit={handleSaveOutfitFromLegacyMessage}
          onMoreLikeThis={handleMoreLikeThisFromLegacyMessage}
          onSwapOutfit={handleSwapFromLegacyMessage}
          onAuraAction={handleAuraLookAction}
          onAuraCandidateAction={handleAuraCandidateAction}
          onAuraOutfitPhotoAction={handleAuraOutfitPhotoAction}
          onAuraLaundryAction={handleAuraLaundryAction}
          />
          {showKeyboardWatermark ? (
            <Text
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: chatBottomReservation + 20,
                textAlign: "center",
                color: colors.text,
                opacity: 0.06,
                fontSize: 24,
                letterSpacing: 8,
                fontWeight: "900",
              }}
            >
              AURA
            </Text>
          ) : null}
        </View>

        <InputBar
        colors={colors}
        value={message}
        loading={loading}
        active={isComposerActive}
        bottom={composerBottom}
        restingBottom={restingComposerBottom}
        placeholder="Ask AURA about a look, piece, or plan."
        onChangeText={setMessage}
        onFocusChange={setIsComposerFocused}
        onHeightChange={setComposerHeight}
        onSend={() => void handleAsk()}
        onStop={hasStreamingMessage ? handleStopGenerating : undefined}
        onPickImages={() => void handlePickImages()}
        onTakePhoto={() => void handleTakePhoto()}
        attachments={pendingAttachments}
        attachmentRole={attachmentRole}
        onAttachmentRoleChange={(role) => {
          setAttachmentRole(role);
          setPendingAttachments((prev) =>
            prev.map((attachment) =>
              attachment.type === "image" ? { ...attachment, role } : attachment
            )
          );
        }}
        onRemoveAttachment={(id) =>
          setPendingAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
        }
        onMicPress={() => void handleMicPress()}
        recording={recordingAudio}
        />
        <AuraChatDrawer
        visible={chatDrawerOpen}
        colors={colors}
        activeChatId={activeChatId}
        threads={recentThreads}
        onClose={() => setChatDrawerOpen(false)}
        onShareChat={handleShareChatThread}
        onAddToProject={handleAddThreadToProject}
        onTogglePin={handleTogglePinnedThread}
        onRenameChat={handleRenameThread}
        onArchiveChat={handleArchiveThread}
        onDeleteChat={handleDeleteThread}
        onSelectChat={async (thread) => {
          if (!uid) return;
          const cachedMessages = await getCachedRecentMessages(uid, thread.chatId);
          if (cachedMessages?.data?.length) {
            setMessages(orderChatMessages(cachedMessages.data));
            setActiveChatId(thread.chatId);
          }
          const threadMessages = await loadChatMessages(uid, thread.chatId);
          const orderedThreadMessages = orderChatMessages(threadMessages);
          setMessages(orderedThreadMessages);
          setActiveChatId(thread.chatId);
          await saveLatestChatCache(uid, thread.chatId, thread.threadId, orderedThreadMessages);
          setChatDrawerOpen(false);
        }}
        />
      </LinearGradient>
    </AuraGlowBackground>
  );
}
