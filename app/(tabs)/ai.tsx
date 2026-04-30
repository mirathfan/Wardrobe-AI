import { LinearGradient } from "expo-linear-gradient";
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
import AuraTrainingCard from "@/src/components/aura/AuraTrainingCard";
import type {
  AIMessage,
  ChatAttachment,
  ChatAttachmentGroupRole,
  ChatImageAttachment,
} from "@/src/components/ai/chatTypes";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { askAuraStream, transcribeAuraAudio } from "@/src/lib/aura";
import { logAuraLookStyleEvent, updateAuraSessionContextFromPrompt } from "@/src/lib/auraMemory";
import {
  type AuraCandidateLocalPhoto,
  createAuraItemDraftsFromCandidates,
  createAuraItemDraftsFromDetectedOutfit,
  uploadAuraAttachment,
  uploadAuraAttachments,
} from "@/src/lib/auraAttachments";
import { classifyAuraImageIntent } from "@/src/lib/auraIntent";
import { auraLookToPlannedOutfit, saveAuraLook } from "@/src/lib/auraLooks";
import { saveAuraOutfitFeedback } from "@/src/lib/auraOutfitFeedback";
import { generateAuraSwipeBatch } from "@/src/lib/auraSwipe";
import { notificationSuccess } from "@/src/lib/haptics";
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
import type { AuraCandidateAction, AuraCandidateItem, AuraLaundryConfirmationAction, AuraLookAction, AuraLookOptionMeta, AuraResponse } from "@/src/types/aura";
import type { ClothingItem } from "@/src/types/ClothingItem";
import { markAnalyzedOutfitWorn, savePlannedRecord } from "@/src/utils/dailyOutfits";

const DEFAULT_CHIPS = [
  "Style me today",
  "Show safe, balanced, and bold options",
  "Build a casual look",
  "Fix this outfit",
  "What am I missing?",
  "Use only my closet",
  "What should I buy first?",
  "Plan a cleaner outfit",
];

const consumedPromptTokens = new Set<string>();
const consumedChatTokens = new Set<string>();
const DEFAULT_COMPOSER_HEIGHT = 56;
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

type OptionalAudioRecorder = {
  uri: string | null;
  prepareToRecordAsync: () => Promise<void>;
  record: () => void;
  stop: () => Promise<void>;
};

function createMessageId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createUserMessage(text: string): AIMessage {
  return {
    id: createMessageId(),
    type: "user",
    kind: "user_text",
    text,
    createdAt: Date.now(),
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
  return {
    id: overrides?.id ?? createMessageId(),
    type: "assistant",
    kind: shouldUseCard ? "aura_card" : "aura_text",
    text: assistantIntroText || normalizedData.reply,
    assistantIntroText: assistantIntroText || undefined,
    streaming: overrides?.streaming,
    aura: shouldUseCard ? normalizedData : undefined,
    createdAt: overrides?.createdAt ?? Date.now(),
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
  const imageUrl =
    item.photos?.normalizedUrl ??
    item.cleanedImageUrl ??
    item.photos?.cleanedUrl ??
    item.photos?.cleanedPhotoUrl ??
    item.originalImageUrl ??
    item.photoUrl ??
    null;

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
  return {
    id: createMessageId(),
    type: "system/action",
    kind: "system",
    text,
    createdAt: Date.now(),
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
  const [quickChips, setQuickChips] = useState<string[]>(DEFAULT_CHIPS);
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
  const latestMessagesRef = useRef<AIMessage[]>([]);
  const audioRecorderRef = useRef<OptionalAudioRecorder | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const auraPulse = useRef(new Animated.Value(0)).current;
  const auraThinking = useRef(new Animated.Value(0)).current;
  const uid = user?.uid ?? null;
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const minimumClosetSummary = useMemo(() => buildMinimumClosetSummary(items), [items]);

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
    const unsub = listenToItems(uid, (next) => setItems(next as ClothingItem[]), {
      status: "ALL",
      sort: "NEWEST",
    });
    return () => {
      unsub();
    };
  }, [uid]);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

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
        const localAudio: ChatAttachment = {
          id: createLocalAttachmentId(),
          type: "audio",
          uri,
          localUri: uri,
          durationMs: startedAt ? Date.now() - startedAt : null,
        };
        const uploaded = await uploadAuraAttachment(uid, localAudio);
        const transcript = await transcribeAuraAudio(uploaded.uri);
        const withTranscript = { ...uploaded, transcript };
        setPendingAttachments((prev) => [...prev, withTranscript].slice(0, 8));
        if (transcript) {
          setMessage((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
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
        Alert.alert("Voice", "Please allow microphone access to record a message.");
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
          : messageText || "Unable to record right now."
      );
    }
  }, [recordingAudio, uid]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!uid) {
        setMessages([]);
        setActiveChatId(null);
        setIsBooting(false);
        return;
      }

      setIsBooting(true);

      const cached = await loadLatestChatCache<AIMessage>(uid);
      if (!cancelled && cached?.messages?.length) {
        setMessages(cached.messages);
        setActiveChatId(cached.chatId ?? null);
      }

      try {
        const shouldLoadSpecificChat =
          !!routeChatId && !consumedChatTokens.has(`${routeChatKey}:${routeChatId}`);
        if (shouldLoadSpecificChat) {
          consumedChatTokens.add(`${routeChatKey}:${routeChatId}`);
          const threadMessages = await loadChatMessages(uid, routeChatId);
          const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
          if (!cancelled) {
            setMessages(threadMessages);
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
          setMessages(threadMessages);
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
    void saveLatestChatCache(uid, activeChatId, null, messages);
  }, [activeChatId, isBooting, messages, uid]);

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
        setActiveChatId(null);
        setMessages([]);
        await clearLatestChatCache(uid);
      }
      await refreshRecentThreads();
    },
    [activeChatId, refreshRecentThreads, uid],
  );

  useEffect(() => {
    const updateKeyboardHeight = (event: KeyboardEvent) => {
      const nextHeight = Math.max(0, layout.height - event.endCoordinates.screenY);
      setKeyboardHeight(nextHeight);
    };

    const resetKeyboardHeight = () => setKeyboardHeight(0);

    const changeEvent = Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const changeSubscription = Keyboard.addListener(changeEvent, updateKeyboardHeight);
    const hideSubscription = Keyboard.addListener(hideEvent, resetKeyboardHeight);

    return () => {
      changeSubscription.remove();
      hideSubscription.remove();
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

      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_SEND]", "sending message", {
          uid,
          hasPrompt: !!prompt,
          attachmentCount: outgoingAttachments.length,
          attachmentTypes: outgoingAttachments.map((attachment) => attachment.type),
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
              uri: attachment.uri,
              role: attachment.type === "image" ? attachment.role ?? null : null,
              groupId: attachment.type === "image" ? attachment.groupId ?? null : null,
            })),
          });
        }
      } catch (error: any) {
        console.log("[AURA_ERROR]", "attachment upload failed", error);
        setLoading(false);
        setMessages((prev) => appendUniqueSystemMessage(prev, AURA_ATTACHMENT_FAILURE_MESSAGE));
        Alert.alert("Attachments", error?.message ?? AURA_ATTACHMENT_FAILURE_MESSAGE);
        return;
      }

      const userMessage = createUserMessageWithAttachments(prompt, uploadedAttachments);
      const chatSeedText = buildChatSeedText(prompt, uploadedAttachments);
      const nextLocalMessages = [...latestMessagesRef.current, userMessage];
      const structuredBatchPrompt = buildStructuredOutfitBatchPrompt(prompt, latestMessagesRef.current);
      const shouldForceStructuredBatch = wantsStructuredOutfitBatch(
        prompt,
        uploadedAttachments.length,
        latestMessagesRef.current,
      );
      setMessages(nextLocalMessages);
      if (!override) {
        setMessage("");
        setPendingAttachments([]);
      }
      triggerThinkingPulse();
      const streamingMessageId = createMessageId();
      const streamingMessageCreatedAt = Date.now();

      let chatId = activeChatId;
      const startedAt = Date.now();

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
              uri: attachment.uri,
              role: attachment.type === "image" ? attachment.role ?? null : null,
              groupId: attachment.type === "image" ? attachment.groupId ?? null : null,
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
              streaming: false,
            }, {
              userRequest: prompt,
            });
            setMessages([...nextLocalMessages, assistantMessage]);
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
            streaming: false,
          }, {
            userRequest: structuredBatchPrompt,
          });
          setMessages([...nextLocalMessages, assistantMessage]);
          setQuickChips(batchResponse.chips?.length ? batchResponse.chips : DEFAULT_CHIPS);
          await appendMessageToChat(uid, chatId, assistantMessage);
          await updateChatThread(uid, chatId, {
            title: deriveAssistantChatTitle(chatSeedText, assistantMessage),
          });
          const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
          setRecentThreads(recent);
          return;
        }

        setMessages([
          ...nextLocalMessages,
          {
            id: streamingMessageId,
            type: "assistant",
            kind: "aura_text",
            text: "",
            streaming: true,
            createdAt: streamingMessageCreatedAt,
          },
        ]);

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
            onStatus: () => {
              if (DEBUG_AURA_CLIENT) {
                console.log("[AURA_STREAM]", "stream status received", { uid, chatId });
              }
              setMessages((prev) => {
                const hasMessage = prev.some((entry) => entry.id === streamingMessageId);
                if (hasMessage) return prev;
                return [
                  ...prev,
                  {
                    id: streamingMessageId,
                    type: "assistant",
                    kind: "aura_text",
                    text: "",
                    streaming: true,
                    createdAt: streamingMessageCreatedAt,
                  },
                ];
              });
            },
            onDelta: (delta) => {
              setMessages((prev) =>
                prev.map((entry) =>
                  entry.id === streamingMessageId
                    ? {
                        ...entry,
                        text: `${entry.text ?? ""}${delta}`,
                        streaming: true,
                      }
                    : entry
                )
              );
            },
            onFinal: (finalData) => {
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
              setMessages((prev) =>
                prev.map((entry) =>
                  entry.id === streamingMessageId
                    ? createAssistantMessage(finalData, {
                        id: streamingMessageId,
                        createdAt: streamingMessageCreatedAt,
                        streaming: false,
                      }, {
                        userRequest: prompt,
                      })
                    : entry
                )
              );
            },
          }
        );
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
          streaming: false,
        }, {
          userRequest: structuredBatchPrompt || prompt,
        });
        setMessages((prev) =>
          prev.map((entry) => (entry.id === streamingMessageId ? assistantMessage : entry))
        );
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
        console.log("[AURA_ERROR]", "ask failed", {
          uid,
          chatId,
          prompt,
          attachmentCount: uploadedAttachments.length,
          error,
        });
        const fallback = userFacingAuraError(error);
        setMessages((prev) => appendUniqueSystemMessage(prev, fallback, streamingMessageId));
      } finally {
        setLoading(false);
      }
    },
    [activeChatId, items, loading, message, minimumClosetSummary, pendingAttachments, triggerThinkingPulse, uid]
  );

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
          void notificationSuccess();
          Toast.saved();
        } catch (error: any) {
          Toast.error("Save failed", error?.message ?? "Unable to save this look.");
        }
        return;
      }
      if (action === "planForToday") {
        try {
          await savePlannedRecord(uid, new Date(), auraLookToPlannedOutfit(look));
          void notificationSuccess();
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
        setMessages((prev) => appendUniqueSystemMessage(prev, systemMessage.text ?? ""));
        if (activeChatId) {
          await appendMessageToChat(uid, activeChatId, systemMessage);
          const recent = await loadRecentChatThreads(uid, RECENT_CHAT_LIMIT);
          setRecentThreads(recent);
        }
      } catch (error) {
        console.log("[AURA_CONFIRM_ERROR]", "candidate action failed", {
          uid,
          action,
          errorCode: (error as { code?: unknown })?.code ?? null,
          errorMessage: error instanceof Error ? error.message : String(error),
          error,
        });
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
        setMessages((prev) => appendUniqueSystemMessage(prev, systemMessage.text ?? ""));
        if (activeChatId) {
          await appendMessageToChat(uid, activeChatId, systemMessage);
        }
      } catch (error: any) {
        Alert.alert("Laundry", error?.message ?? "Could not update that item.");
      }
    },
    [activeChatId, itemsById, uid]
  );

  useEffect(() => {
    if (!routePrompt || isBooting || !uid) return;
    const token = `${routePromptKey}:${routePrompt}`;
    if (consumedPromptTokens.has(token)) return;
    consumedPromptTokens.add(token);
    void handleAsk(routePrompt);
  }, [handleAsk, isBooting, routePrompt, routePromptKey, uid]);

  const latestReply = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const current = messages[index];
      if (current.type === "assistant" && current.aura) return current.aura;
    }
    return null;
  }, [messages]);

  const heroChips = latestReply?.chips?.length ? latestReply.chips : quickChips;
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
  const composerContentPadding =
    composerBottom + composerHeight + Math.max(48, insets.bottom + 28);
  const showEmptyState = messages.length === 0 && !loading && !isBooting && !message.trim();
  const showKeyboardWatermark = keyboardHeight > 0 && messages.length < 2;

  return (
    <AuraGlowBackground>
      <LinearGradient
        colors={[auraTheme.backgroundTop, auraTheme.backgroundMid, auraTheme.backgroundBottom]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, paddingTop: Math.max(insets.top + 6, layout.topContentInset - 10) }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(243,190,221,0.06)", "rgba(216,200,255,0.02)", "transparent"]}
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
          setActiveChatId(null);
          setQuickChips(DEFAULT_CHIPS);
          if (uid) {
            void clearLatestChatCache(uid);
          }
        }}
      />

        <View style={{ paddingTop: 2, paddingBottom: 0 }}>
          <AuraQuickChips
            variant="pills"
            chips={heroChips.slice(0, 5)}
            onPress={(chip) => void handleAsk(chip)}
          />
        </View>

        <View
          style={{
            paddingHorizontal: layout.horizontalPadding,
            paddingTop: 2,
            paddingBottom: 0,
            marginTop: 2,
            marginBottom: 6,
          }}
        >
          <AuraTrainingCard
            colors={colors}
            variant="compact"
            onPress={() => router.push("/aura/swipe")}
          />
        </View>

        <View style={{ flex: 1, marginTop: 8, minHeight: 0 }}>
          <ChatList
          colors={colors}
          messages={messages}
          itemsById={itemsById}
          savingId={null}
          loading={loading}
          contentBottomPadding={Math.max(layout.bottomDockPadding + 150, composerContentPadding + 96)}
          autoScrollSignal={focusScrollSignal}
          emptyState={showEmptyState ? <View style={{ height: 24 }} /> : <View style={{ height: 2 }} />}
          onSaveOutfit={() => {}}
          onMoreLikeThis={(outfit) => {
            if (outfit.reason) void handleAsk(`Refine this direction: ${outfit.reason}`);
          }}
          onSwapOutfit={(outfit) => {
            if (outfit.reason) void handleAsk(`Keep the mood, but swap one piece: ${outfit.reason}`);
          }}
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
                bottom: composerContentPadding + 20,
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
        placeholder="Ask AURA about a look, piece, or plan."
        onChangeText={setMessage}
        onFocusChange={setIsComposerFocused}
        onHeightChange={setComposerHeight}
        onSend={() => void handleAsk()}
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
          const threadMessages = await loadChatMessages(uid, thread.chatId);
          setMessages(threadMessages);
          setActiveChatId(thread.chatId);
          await saveLatestChatCache(uid, thread.chatId, thread.threadId, threadMessages);
          setChatDrawerOpen(false);
        }}
        />
      </LinearGradient>
    </AuraGlowBackground>
  );
}
