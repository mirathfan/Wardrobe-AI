import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState, Image, Keyboard, KeyboardEvent, Platform, Share, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AuraHeader from "@/src/components/ai/AuraHeader";
import AuraChatDrawer from "@/src/components/ai/AuraChatDrawer";
import AuraQuickChips from "@/src/components/ai/AuraQuickChips";
import ChatList from "@/src/components/ai/ChatList";
import InputBar from "@/src/components/ai/InputBar";
import AuraGlowBackground from "@/src/components/aura/AuraGlowBackground";
import AnimatedAuraRing from "@/src/components/aura/AnimatedAuraRing";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { AURA_TRAINING_ROUTE } from "@/src/constants/routes";
import { DOCK_HEIGHT, FLOATING_CONTROL_GAP } from "@/src/constants/dock";
import type {
  AIMessage,
  ChatImageAttachment,
  ChatOutfit,
} from "@/src/components/ai/chatTypes";
import { useAuth } from "@/src/hooks/useAuth";
import { useAuraChatHydration } from "@/src/hooks/aura/useAuraChatHydration";
import { useAuraComposerState } from "@/src/hooks/aura/useAuraComposerState";
import { useAuraStreamingState } from "@/src/hooks/aura/useAuraStreamingState";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { askAuraStream, isAuraStreamAbortError } from "@/src/lib/aura";
import { handleSharedAuraLookAction } from "@/src/lib/auraActions";
import {
  appendUniqueSystemMessage,
  type AuraChatIntent,
  type AuraOutfitDiversityContext,
  buildAuraOutfitDiversityContext,
  buildChatSeedText,
  buildShareTranscript,
  buildStructuredOutfitBatchPrompt,
  classifyAuraChatIntent,
  createStreamingAssistantMessage,
  createSystemMessage,
  createMessageId,
  createUserMessageWithAttachments,
  latestAuraLook,
  latestAuraLookCount,
  nextLocalMessageSequence,
  resolveStructuredBatchLookCount,
  updateMessageById,
  wantsStructuredOutfitBatch,
  wantsStructuredOutfitRequest,
} from "@/src/lib/auraChatHelpers";
import { updateAuraSessionContextFromPrompt } from "@/src/lib/auraMemory";
import {
  type AuraCandidateLocalPhoto,
  createAuraItemDraftsFromCandidates,
  createAuraItemDraftsFromDetectedOutfit,
  uploadAuraAttachments,
} from "@/src/lib/auraAttachments";
import { classifyAuraImageIntent } from "@/src/lib/auraIntent";
import { generateAuraSwipeBatch } from "@/src/lib/auraSwipe";
import { runHaptic } from "@/src/lib/haptics";
import { getItemImageUrl } from "@/src/lib/itemImage";
import { listenToItems, updateLaundryStatus } from "@/src/lib/items";
import { buildMinimumClosetSummary } from "@/src/lib/minimumCloset";
import { Toast } from "@/src/lib/toast";
import { Colors } from "@/constants/theme";
import {
  appendMessageToChat,
  createChatThread,
  deleteChatThread,
  loadChatMessages,
  renameChatThread,
  setChatArchived,
  setChatPinned,
  summarizeChatTitle,
  type AIChatThread,
  updateChatThread,
} from "@/src/lib/aiChats";
import {
  clearLatestChatCache,
  isAuraChatSessionFresh,
  loadAuraChatSessionMeta,
  saveAuraChatSessionMeta,
  saveLatestChatCache,
} from "@/src/lib/localChatCache";
import { messageOrderMillis, orderChatMessages } from "@/src/lib/chatMessageOrder";
import {
  clearCachedRecentMessages,
  getCachedRecentMessages,
} from "@/src/lib/localCache";
import type { AuraCandidateAction, AuraCandidateItem, AuraLaundryConfirmationAction, AuraLookAction, AuraLookOptionMeta, AuraResponse } from "@/src/types/aura";
import type { ClothingItem } from "@/src/types/ClothingItem";
import { markAnalyzedOutfitWorn } from "@/src/utils/dailyOutfits";

const TRAIN_AURA_CHIP_LABEL = "Train AURA faster";
const AURA_TOP_CHIPS = [
  TRAIN_AURA_CHIP_LABEL,
  "Top priorities",
  "Shopping list",
  "Dressier options",
  "Warm-weather",
];
const DEFAULT_CHIPS = AURA_TOP_CHIPS.filter((chip) => chip !== TRAIN_AURA_CHIP_LABEL);
const AURA_LOGO_SOURCE = require("../../assets/images/aura-tab-mark.png");

const DEFAULT_COMPOSER_HEIGHT = 50;
const CHAT_COMPOSER_TAB_GAP = 6;
const CHAT_BOTTOM_BREATHING_ROOM = 26;
const STREAM_FLUSH_INTERVAL_MS = 32;
const AURA_REPLY_START_HAPTIC = "light" as const;
const AURA_REPLY_FINISH_HAPTIC = "selection" as const;
const AURA_OFFLINE_MESSAGE = "AURA couldn't finish that. Check your connection and try again.";
const AURA_DRAFT_FAILURE_MESSAGE = "I couldn't create that wardrobe draft. Please try again.";
const AURA_ATTACHMENT_FAILURE_MESSAGE = "I couldn't upload that attachment. Please try again.";
const RECENT_CHAT_LIMIT = 24;
const DEBUG_AURA_CLIENT =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const OUTERWEAR_REQUEST_RE =
  /\b(with jacket|with jackets|jackets?|outerwear|coat|blazer|hoodie|cardigan|overshirt|layered|layers)\b/i;
const AURA_EMPTY_STATE_CHIPS = [
  "Style me today",
  "Build from my closet",
  "Polish this outfit",
  "What should I wear tonight?",
];
type AskAuraOptions = {
  retryUserMessage?: AIMessage;
  removeMessageId?: string;
  forceOutfitDiversity?: boolean;
  diversityMessages?: AIMessage[];
};

function logAuraChatState(event: string, payload?: Record<string, unknown>) {
  if (!DEBUG_AURA_CLIENT) return;
  console.log("[AURA_CHAT_STATE]", event, payload ?? {});
}

function AuraChatEmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View
      style={{
        marginHorizontal: Math.max(12, layout.horizontalPadding - 4),
        marginBottom: 10,
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 0.75,
        borderColor: colors.border,
        backgroundColor: colors.surfaceGlass,
        padding: layout.screenSize === "compact" ? 14 : 16,
        gap: 13,
      }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[colors.purpleSurface, "rgba(251,228,216,0.022)", "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: "absolute", inset: 0 }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
          <Image
            source={AURA_LOGO_SOURCE}
            resizeMode="contain"
            style={{ width: 40, height: 40, opacity: 0.92 }}
          />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: layout.screenSize === "compact" ? 17 : 18,
              lineHeight: layout.screenSize === "compact" ? 22 : 23,
              fontWeight: "900",
              letterSpacing: 0,
            }}
          >
            Ask your stylist
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 12.5,
              lineHeight: 18,
              fontWeight: "600",
            }}
          >
            Start with a plan, a photo, or a closet question.
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
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
              paddingHorizontal: 10,
              paddingVertical: 7,
              backgroundColor: colors.chipBackground,
              borderWidth: 0.75,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: "800" }}>{chip}</Text>
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
        borderColor: colors.border,
        backgroundColor: colors.surfaceGlass,
        padding: 18,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      }}
    >
      <AnimatedAuraRing size={44} stroke={2} rotationDuration={4200} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>AURA is getting ready</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
          Pulling in your latest closet context.
        </Text>
      </View>
    </View>
  );
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

function auraLookItemIds(look?: AuraResponse["look"] | null) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const piece of look?.pieces ?? []) {
    const itemId = String(piece.itemId ?? "").trim();
    if (piece.source !== "closet" || !itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    ids.push(itemId);
  }
  return ids;
}

function auraLookSignature(look?: AuraResponse["look"] | null) {
  return auraLookItemIds(look).sort().join("|");
}

function auraLookPreviousOverlap(
  look: NonNullable<AuraResponse["look"]>,
  diversity: AuraOutfitDiversityContext
) {
  const previousIds = new Set(diversity.previousLookItemIds);
  return auraLookItemIds(look).filter((itemId) => previousIds.has(itemId)).length;
}

function enforceClientOutfitDiversity(
  response: AuraResponse,
  diversity: AuraOutfitDiversityContext
): AuraResponse {
  if (!diversity.shouldAvoidRepeats) return response;
  const originalLooks = [
    ...(response.lookOptions ?? []),
    ...(response.look && !(response.lookOptions ?? []).includes(response.look) ? [response.look] : []),
  ];
  if (!originalLooks.length) return response;

  const selected: NonNullable<AuraResponse["look"]>[] = [];
  const selectedSignatures = new Set<string>();
  const candidates = originalLooks.map((look) => {
    const itemIds = auraLookItemIds(look);
    const signature = itemIds.slice().sort().join("|");
    const previousOverlap = auraLookPreviousOverlap(look, diversity);
    const exactPrevious = !!signature && diversity.previousLookSignatures.includes(signature);
    const duplicateWithinResponse = !!signature && selectedSignatures.has(signature);
    const selectedOverlapTooHigh = selected.some((existing) => {
      const existingIds = new Set(auraLookItemIds(existing));
      const overlap = itemIds.filter((itemId) => existingIds.has(itemId)).length;
      return overlap > Math.max(1, diversity.maxOverlap);
    });
    const tooSimilar = exactPrevious || previousOverlap > diversity.maxOverlap;
    const rejected = tooSimilar || duplicateWithinResponse || selectedOverlapTooHigh;
    if (!rejected) {
      selected.push(look);
      if (signature) selectedSignatures.add(signature);
    }
    return {
      title: look.lookTitle,
      itemIds,
      signature,
      previousOverlap,
      exactPrevious,
      duplicateWithinResponse,
      selectedOverlapTooHigh,
      rejected,
    };
  });

  if (DEBUG_AURA_CLIENT) {
    console.log("[AURA_DIVERSITY]", "frontend final guard", {
      previousItemIds: diversity.previousLookItemIds,
      excludedItemIds: diversity.excludedItemIds,
      recentItemIds: diversity.recentItemIds,
      previousLookSignatures: diversity.previousLookSignatures,
      maxOverlap: diversity.maxOverlap,
      candidates,
      selected: selected.map((look) => ({
        title: look.lookTitle,
        itemIds: auraLookItemIds(look),
        signature: auraLookSignature(look),
        overlap: auraLookPreviousOverlap(look, diversity),
      })),
    });
  }

  if (!selected.length) {
    return {
      title: "More pieces needed",
      presentation: "chat",
      reply: "I need more usable pieces to make this meaningfully different.",
      reason: "AURA avoided repeating the previous outfit.",
      outfitItems: [],
      ownedPieces: [],
      recommendedAdditions: [],
      swapSuggestion: "",
      missingPieces: [],
      upgradeSuggestions: [],
      chips: response.chips?.length ? response.chips : DEFAULT_CHIPS,
      look: null,
      lookOptions: [],
    };
  }

  if (response.lookOptions?.length) {
    const lookOptions = selected.slice(0, response.lookOptions.length);
    return {
      ...response,
      look: lookOptions[0] ?? null,
      lookOptions,
    };
  }

  return {
    ...response,
    look: selected[0] ?? response.look ?? null,
  };
}

function labelForLookPiece(look: NonNullable<AuraResponse["look"]>, role: string) {
  return look.pieces.find((piece) => piece.role === role && piece.source === "closet")?.itemName ?? "";
}

function compactLookBase(look: NonNullable<AuraResponse["look"]>) {
  const top = labelForLookPiece(look, "top");
  const bottom = labelForLookPiece(look, "bottom");
  const shoes = labelForLookPiece(look, "shoes");
  const outerwear = labelForLookPiece(look, "outerwear");
  return [top, bottom, shoes, outerwear].filter(Boolean).join(", ");
}

function buildNoExistingOutfitResponse(): AuraResponse {
  return {
    title: "No outfit yet",
    presentation: "chat",
    reply: "I don’t have an outfit yet — want me to create one first?",
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    chips: ["Give me an outfit", "Style me today", "Build from my closet"],
  };
}

function buildExistingOutfitStylingResponse(
  prompt: string,
  look: NonNullable<AuraResponse["look"]>,
  intent: AuraChatIntent,
): AuraResponse {
  const normalized = prompt.toLowerCase();
  const top = labelForLookPiece(look, "top");
  const bottom = labelForLookPiece(look, "bottom");
  const shoes = labelForLookPiece(look, "shoes");
  const base = compactLookBase(look);
  const anchor = top || bottom || look.lookTitle || "the strongest piece";
  const baseLine = base ? `Base: ${base}.` : `Base: ${look.lookTitle}.`;

  let title = "How to style it";
  let advice =
    `Wear ${anchor} as the anchor and keep the rest intentional: clean proportions, one clear focal point, and no extra clutter. ` +
    "If the fit feels flat, sharpen it with a small tuck, cleaner socks, or one refined accessory.";
  let swaps =
    "Optional swaps: change one thing only, like cleaner shoes for polish, a relaxed shoe for ease, or a simple layer if the weather needs it.";

  if (/\b(dressier|formal|sharper|office|work)\b/.test(normalized)) {
    title = "Make it dressier";
    advice =
      `Keep ${anchor} as the base, then make the silhouette cleaner: neater tuck, sharper hem break, and minimal accessories. ` +
      "The goal is refined, not overdressed.";
    swaps =
      `Optional swaps: ${shoes ? `trade ${shoes} for loafers, boots, or your cleanest low-profile shoes` : "use your cleanest low-profile shoes"}; add a watch or simple chain; layer a blazer or structured jacket if you own one.`;
  } else if (/\b(casual|relaxed|easy|everyday)\b/.test(normalized)) {
    title = "Make it more casual";
    advice =
      `Soften the outfit around ${anchor}: keep the lines relaxed, let one piece sit slightly loose, and avoid anything too shiny or formal.`;
    swaps =
      `Optional swaps: ${shoes ? `keep ${shoes} if they feel easy, or swap to a softer sneaker` : "use a softer sneaker"}; skip heavy accessories; add a light overshirt if it needs shape.`;
  } else if (/\b(streetwear|bold|bolder|statement|edge)\b/.test(normalized)) {
    title = "Push the styling";
    advice =
      `Let ${anchor} carry the attitude, then add contrast through proportion: a stronger layer, chunkier shoe, or one statement accessory.`;
    swaps =
      "Optional swaps: add headwear or a heavier shoe if it fits the vibe, but keep the color story tight so it does not get crowded.";
  } else if (intent === "MODIFY_OUTFIT") {
    title = "Refine this look";
    advice =
      `Keep the core outfit intact, especially ${anchor}. Tighten the styling by changing the mood around it rather than rebuilding from scratch.`;
    swaps =
      "Optional swaps: adjust one anchor-adjacent piece, like shoes, outerwear, or one accessory, then leave the rest alone.";
  }

  const pieceNote =
    top && bottom
      ? `Let ${top} and ${bottom} stay as the main relationship.`
      : "Keep the main pieces visually connected.";

  return {
    title,
    presentation: "chat",
    reply: `${baseLine} ${advice} ${pieceNote} ${swaps}`,
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    chips: ["Make it dressier", "Make it more casual", "Give me another one"],
  };
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
    return "AURA had trouble reading that response. Try once more.";
  }
  if (
    lower.includes("network") ||
    lower.includes("request failed") ||
    lower.includes("timed out") ||
    lower.includes("offline") ||
    lower.includes("unavailable")
  ) {
    return AURA_OFFLINE_MESSAGE;
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
  const uid = user?.uid ?? null;
  const {
    attachmentRole,
    handleAttachmentRoleChange,
    handleMicPress,
    handlePickImages,
    handleRemoveAttachment,
    handleTakePhoto,
    message,
    pendingAttachments,
    recordingAudio,
    setMessage,
    setPendingAttachments,
    stopVoiceInput,
  } = useAuraComposerState({ uid });
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(DEFAULT_COMPOSER_HEIGHT);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [focusScrollSignal, setFocusScrollSignal] = useState(0);
  const [focusMessageId, setFocusMessageId] = useState<string | null>(null);
  const [chatRefreshing, setChatRefreshing] = useState(false);
  const consumedPromptTokens = useRef(new Set<string>());
  const {
    handleStopGenerating,
    stopStreamingRequestedRef,
    streamAbortControllerRef,
  } = useAuraStreamingState();

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

  const {
    activeChatId,
    hasStreamingMessage,
    isBooting,
    latestMessagesRef,
    orderedMessages,
    recentThreads,
    refreshRecentThreads,
    setActiveChatId,
    setMessages,
    setQuickChips,
    setRecentThreads,
  } = useAuraChatHydration({
    uid,
    routeChatId,
    routeChatKey,
    recentChatLimit: RECENT_CHAT_LIMIT,
    defaultChips: DEFAULT_CHIPS,
    debug: DEBUG_AURA_CLIENT,
  });
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const minimumClosetSummary = useMemo(() => buildMinimumClosetSummary(items), [items]);

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
    [activeChatId, latestMessagesRef, refreshRecentThreads, setRecentThreads, uid],
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
        await saveAuraChatSessionMeta(uid, null);
      }
      await refreshRecentThreads();
    },
    [activeChatId, refreshRecentThreads, setActiveChatId, setMessages, setRecentThreads, uid],
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
        await saveAuraChatSessionMeta(uid, null);
      }
      await refreshRecentThreads();
    },
    [activeChatId, refreshRecentThreads, setActiveChatId, setMessages, setRecentThreads, uid],
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
    async (override?: string, options?: AskAuraOptions) => {
      if (!uid) {
        Alert.alert("AURA", "Please sign in to chat with AURA.");
        return;
      }

      const retryUserMessage = options?.retryUserMessage;
      const isRetry = !!retryUserMessage;
      const prompt = String(retryUserMessage?.text ?? override ?? message).trim();
      const outgoingAttachments = retryUserMessage
        ? retryUserMessage.attachments ?? []
        : override
          ? []
          : pendingAttachments;
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
        uploadedAttachments = isRetry
          ? outgoingAttachments
          : outgoingAttachments.length
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

      const userMessage = retryUserMessage ?? createUserMessageWithAttachments(prompt, uploadedAttachments);
      logAuraChatState("message_created", {
        messageId: userMessage.id,
        type: userMessage.type,
        kind: userMessage.kind,
        attachmentCount: uploadedAttachments.length,
        retry: isRetry,
      });
      const chatSeedText = buildChatSeedText(prompt, uploadedAttachments);
      const baselineMessages = latestMessagesRef.current.filter(
        (entry) => entry.id !== options?.removeMessageId,
      );
      const retryBaselineMessages =
        isRetry && !baselineMessages.some((entry) => entry.id === userMessage.id)
          ? [...baselineMessages, userMessage]
          : baselineMessages;
      const nextLocalMessages = orderChatMessages(
        isRetry ? retryBaselineMessages : [...retryBaselineMessages, userMessage],
      );
      const requestHistoryMessages = isRetry
        ? nextLocalMessages.filter(
            (entry) => !(entry.type === "assistant" && entry.replyToMessageId === userMessage.id),
          )
        : nextLocalMessages;
      const historyMessagesBeforeRequest = isRetry ? retryBaselineMessages : latestMessagesRef.current;
      const intentContextMessages = options?.diversityMessages ?? historyMessagesBeforeRequest;
      const lastLookForIntent = latestAuraLook(intentContextMessages);
      const chatIntent = classifyAuraChatIntent(prompt, {
        attachmentCount: uploadedAttachments.length,
        hasPreviousLook: !!lastLookForIntent,
      });
      const structuredBatchPrompt = buildStructuredOutfitBatchPrompt(prompt, historyMessagesBeforeRequest);
      const shouldForceStructuredBatch = wantsStructuredOutfitBatch(
        prompt,
        uploadedAttachments.length,
        historyMessagesBeforeRequest,
      );
      const shouldForceStructuredOutfit = wantsStructuredOutfitRequest(
        prompt,
        uploadedAttachments.length,
        historyMessagesBeforeRequest,
      );
      const shouldRouteToExistingLook =
        chatIntent === "STYLE_EXISTING" || chatIntent === "MODIFY_OUTFIT";
      const structuredOutfitPrompt = shouldForceStructuredBatch ? structuredBatchPrompt : prompt;
      const outfitDiversity = buildAuraOutfitDiversityContext(
        options?.forceOutfitDiversity ? "Try again" : prompt,
        intentContextMessages,
        {
          multiLook: shouldForceStructuredBatch,
        },
      );
      if (DEBUG_AURA_CLIENT) {
        console.log("[AURA_INTENT]", "chat intent route", {
          prompt,
          detectedIntent: chatIntent,
          hasPreviousLook: !!lastLookForIntent,
          routeChosen: shouldRouteToExistingLook
            ? lastLookForIntent
              ? "existing_outfit_styling"
              : "existing_outfit_missing_context"
            : shouldForceStructuredOutfit
              ? "outfit_generator"
              : "stream_stylist",
          outfitGeneratorWillRun: !shouldRouteToExistingLook && shouldForceStructuredOutfit,
        });
      }
      if (DEBUG_AURA_CLIENT && outfitDiversity.shouldAvoidRepeats) {
        console.log("[AURA_DIVERSITY]", "frontend outfit diversity context", {
          previousItemIds: outfitDiversity.previousLookItemIds,
          excludedItemIds: outfitDiversity.excludedItemIds,
          recentItemIds: outfitDiversity.recentItemIds,
          previousLookSignatures: outfitDiversity.previousLookSignatures,
          maxOverlap: outfitDiversity.maxOverlap,
          reason: outfitDiversity.reason,
        });
      }
      setMessages(nextLocalMessages);
      setFocusMessageId(userMessage.id);
      if (!override && !isRetry) {
        setMessage("");
        setPendingAttachments([]);
      }
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
          await saveAuraChatSessionMeta(uid, chat.chatId);
        }

        void updateAuraSessionContextFromPrompt(uid, chatId, prompt);
        if (!isRetry) {
          await appendMessageToChat(uid, chatId, userMessage, { titleFromUserText: chatSeedText });
        }

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

        if (shouldRouteToExistingLook) {
          const stylingResponse = lastLookForIntent
            ? buildExistingOutfitStylingResponse(prompt, lastLookForIntent, chatIntent)
            : buildNoExistingOutfitResponse();
          if (DEBUG_AURA_CLIENT) {
            console.log("[AURA_INTENT]", "existing outfit route selected", {
              detectedIntent: chatIntent,
              hasPreviousLook: !!lastLookForIntent,
              outfitGeneratorCalled: false,
              lookTitle: lastLookForIntent?.lookTitle ?? null,
            });
          }
          const assistantMessage = createAssistantMessage(stylingResponse, {
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
            source: lastLookForIntent ? "style_existing_outfit" : "style_existing_missing_context",
          });
          setMessages(orderChatMessages([...nextLocalMessages, assistantMessage]));
          setQuickChips(stylingResponse.chips?.length ? stylingResponse.chips : DEFAULT_CHIPS);
          await appendMessageToChat(uid, chatId, assistantMessage);
          await updateChatThread(uid, chatId, {
            title: deriveAssistantChatTitle(chatSeedText, assistantMessage),
          });
          await refreshRecentThreads();
          return;
        }

        if (shouldForceStructuredOutfit) {
          if (DEBUG_AURA_CLIENT) {
            console.log("[AURA_INTENT]", "outfit generator route selected", {
              detectedIntent: chatIntent,
              outfitGeneratorCalled: true,
              structuredBatch: shouldForceStructuredBatch,
            });
          }
          const desiredLookCount = shouldForceStructuredBatch
            ? resolveStructuredBatchLookCount(
                prompt,
                structuredBatchPrompt,
                latestMessagesRef.current,
              )
            : 1;
          if (DEBUG_AURA_CLIENT) {
            console.log("[AURA_MULTI]", "frontend structured batch request", {
              prompt,
              structuredBatchPrompt: structuredOutfitPrompt,
              desiredLookCount,
              latestLookCount: latestAuraLookCount(latestMessagesRef.current),
            });
          }
          if (promptRequestsOuterwear(structuredOutfitPrompt) && !closetHasOuterwear(items)) {
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
            await refreshRecentThreads();
            return;
          }
          const outfitBatch = await generateAuraSwipeBatch({
            intentText: structuredOutfitPrompt,
            numOutfits: desiredLookCount,
            items,
            excludeItemIds: outfitDiversity.excludedItemIds,
            recentItemIds: outfitDiversity.recentItemIds,
            previousLookItemIds: outfitDiversity.previousLookItemIds,
            previousLookSignatures: outfitDiversity.previousLookSignatures,
            maxOverlap: outfitDiversity.maxOverlap,
          });
          const batchResponse = enforceClientOutfitDiversity(buildAuraResponseFromSwipeBatch(outfitBatch, {
            prompt: structuredOutfitPrompt,
            items,
          }), outfitDiversity);
          if (DEBUG_AURA_CLIENT) {
            console.log("[AURA_MULTI]", "frontend batch fallback response", {
              prompt,
              structuredBatchPrompt: structuredOutfitPrompt,
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
            userRequest: structuredOutfitPrompt,
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
          await refreshRecentThreads();
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

        if (DEBUG_AURA_CLIENT) {
          console.log("[AURA_INTENT]", "stream stylist route selected", {
            detectedIntent: chatIntent,
            outfitGeneratorCalled: false,
          });
        }
        const result = await askAuraStream(
          {
            message: prompt,
            chatId,
            attachments: uploadedAttachments,
            history: buildAuraHistory(requestHistoryMessages),
            clientIntent: imageIntent,
            clientContext: {
              minimumCloset: minimumClosetSummary,
              outfitDiversity,
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
            excludeItemIds: outfitDiversity.excludedItemIds,
            recentItemIds: outfitDiversity.recentItemIds,
            previousLookItemIds: outfitDiversity.previousLookItemIds,
            previousLookSignatures: outfitDiversity.previousLookSignatures,
            maxOverlap: outfitDiversity.maxOverlap,
          });
          finalResult = buildAuraResponseFromSwipeBatch(outfitBatch, {
            prompt: structuredBatchPrompt,
            items,
          });
        }
        finalResult = enforceClientOutfitDiversity(finalResult, outfitDiversity);
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
        await refreshRecentThreads();
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
            await refreshRecentThreads();
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
        flushStreamingTextNow?.();
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
        const partialText = streamedTextSoFar.trim();
        const partialAssistantMessage: AIMessage | null = partialText
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
          const withPartial = partialAssistantMessage
            ? updateMessageById(prev, streamingMessageId, () => partialAssistantMessage)
            : prev;
          return orderChatMessages(
            appendUniqueSystemMessage(
              withPartial,
              fallback,
              partialAssistantMessage ? undefined : streamingMessageId,
            ),
          );
        });
        Toast.error("AURA couldn't finish", fallback);
      } finally {
        cancelStreamingFlush?.();
        if (activeStreamController && streamAbortControllerRef.current === activeStreamController) {
          streamAbortControllerRef.current = null;
        }
        stopStreamingRequestedRef.current = false;
        setLoading(false);
      }
    },
    [
      activeChatId,
      items,
      latestMessagesRef,
      loading,
      message,
      minimumClosetSummary,
      pendingAttachments,
      refreshRecentThreads,
      setActiveChatId,
      setMessage,
      setMessages,
      setPendingAttachments,
      setQuickChips,
      stopStreamingRequestedRef,
      streamAbortControllerRef,
      uid,
    ]
  );

  const handleComposerSend = React.useCallback(async () => {
    if (recordingAudio) {
      await stopVoiceInput({ discardTranscript: true });
    }
    await handleAsk();
  }, [handleAsk, recordingAudio, stopVoiceInput]);

  const handleRetryAuraResponse = React.useCallback(
    (sourceMessage: AIMessage) => {
      if (loading) return;
      const currentMessages = latestMessagesRef.current;
      const sourceIndex = currentMessages.findIndex((entry) => entry.id === sourceMessage.id);
      const startIndex = sourceIndex >= 0 ? sourceIndex - 1 : currentMessages.length - 1;
      let retryUserMessage: AIMessage | null = null;
      for (let index = startIndex; index >= 0; index -= 1) {
        const candidate = currentMessages[index];
        if (candidate?.type === "user") {
          retryUserMessage = candidate;
          break;
        }
      }
      if (!retryUserMessage) {
        Toast.error("Nothing to retry", "Send a new message and AURA will pick it up.");
        return;
      }
      void handleAsk(undefined, {
        retryUserMessage,
        removeMessageId: sourceMessage.id,
        forceOutfitDiversity: true,
        diversityMessages:
          sourceIndex >= 0
            ? currentMessages.slice(0, sourceIndex + 1)
            : currentMessages,
      });
    },
    [handleAsk, latestMessagesRef, loading],
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
      await handleSharedAuraLookAction({
        uid,
        action,
        look,
        promptBase,
        saveTitle: sourceMessage.aura?.title,
        feedbackContext: {
          chatId: activeChatId,
          messageId: sourceMessage.id,
          option: lookOption,
        },
        onPrompt: (prompt) => {
          void handleAsk(prompt);
        },
        onAlert: (title, message, buttons) => Alert.alert(title, message, buttons),
        onAfterSave: () => runHaptic("light"),
        onAfterPlan: () => runHaptic("light"),
      });
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
    [setMessages]
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
              params: { editId: first.itemId, sourceItemId: first.itemId, sourceRoute: "/(tabs)/ai" },
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
          await refreshRecentThreads();
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
    [activeChatId, latestMessagesRef, refreshRecentThreads, setMessages, uid, updateCandidateStatuses]
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
    [handleAsk, latestMessagesRef, uid]
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
    [activeChatId, itemsById, setMessages, uid]
  );

  useEffect(() => {
    if (!routePrompt || isBooting || !uid) return;
    const token = `${routePromptKey}:${routePrompt}`;
    if (consumedPromptTokens.current.has(token)) return;
    consumedPromptTokens.current.add(token);
    void handleAsk(routePrompt);
  }, [handleAsk, isBooting, routePrompt, routePromptKey, uid]);

  const chatBackgroundColors = useMemo(
    () => ["#120014", Colors.dark.backgroundDeep, Colors.dark.backgroundDark] as const,
    [],
  );
  const chatBottomGlowColors = useMemo(
    () => ["rgba(223,182,178,0.018)", "rgba(9,0,11,0.12)", "transparent"] as const,
    [],
  );
  const restingComposerBottom =
    layout.composerOffset - Math.max(0, FLOATING_CONTROL_GAP - CHAT_COMPOSER_TAB_GAP);
  const isComposerActive = isComposerFocused || keyboardHeight > 0;
  const keyboardComposerBottom =
    keyboardHeight > 0
      ? Math.max(12, keyboardHeight + (Platform.OS === "ios" ? 10 : 6))
      : 0;
  const composerBottom = keyboardHeight > 0 ? keyboardComposerBottom : restingComposerBottom;
  const closedDockStackInset =
    Math.max(insets.bottom, layout.floatingDockBottom) + DOCK_HEIGHT + CHAT_COMPOSER_TAB_GAP;
  const chatBottomInset = Math.max(
    composerBottom + composerHeight,
    closedDockStackInset + composerHeight,
  ) + CHAT_BOTTOM_BREATHING_ROOM;
  const lastMessageIdForFocus = orderedMessages[orderedMessages.length - 1]?.id ?? "empty";
  const focusScrollKey = `${activeChatId ?? "new"}:${lastMessageIdForFocus}:${orderedMessages.length}`;
  const chatAutoScrollReady = chatBottomInset > 0 && composerHeight > 0 && layout.height > 0;

  useEffect(() => {
    if (loading || !focusMessageId) return;
    const timer = setTimeout(() => setFocusMessageId(null), 240);
    return () => clearTimeout(timer);
  }, [focusMessageId, loading]);

  const enforceAuraSessionWindow = React.useCallback(async () => {
    if (!uid) return;
    const session = await loadAuraChatSessionMeta(uid);
    if (activeChatId) {
      if (session && !isAuraChatSessionFresh(session)) {
        setMessage("");
        setPendingAttachments([]);
        setMessages([]);
        setFocusMessageId(null);
        setActiveChatId(null);
        setQuickChips(DEFAULT_CHIPS);
        await saveAuraChatSessionMeta(uid, null);
        return;
      }
      await saveAuraChatSessionMeta(uid, activeChatId);
      return;
    }
    if (orderedMessages.length === 0) {
      await saveAuraChatSessionMeta(uid, null);
    }
  }, [
    activeChatId,
    orderedMessages.length,
    setActiveChatId,
    setMessage,
    setMessages,
    setPendingAttachments,
    setQuickChips,
    uid,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      void (async () => {
        await enforceAuraSessionWindow();
        if (cancelled) return;
      })();
      return () => {
        cancelled = true;
      };
    }, [enforceAuraSessionWindow]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void enforceAuraSessionWindow();
      }
    });
    return () => subscription.remove();
  }, [enforceAuraSessionWindow]);

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      const scheduleScroll = () => {
        if (cancelled || !chatAutoScrollReady) return;
        void focusScrollKey;
        requestAnimationFrame(() => {
          if (!cancelled) setFocusScrollSignal((value) => value + 1);
        });
      };
      const firstTimer = setTimeout(scheduleScroll, 90);
      const secondTimer = setTimeout(scheduleScroll, 220);
      const finalTimer = setTimeout(scheduleScroll, 520);
      return () => {
        cancelled = true;
        clearTimeout(firstTimer);
        clearTimeout(secondTimer);
        clearTimeout(finalTimer);
      };
    }, [chatAutoScrollReady, focusScrollKey])
  );

  const handleChatRefresh = React.useCallback(async () => {
    if (!uid || chatRefreshing) return;
    setChatRefreshing(true);
    const startedAt = Date.now();
    try {
      await refreshRecentThreads();
      if (activeChatId) {
        const threadMessages = await loadChatMessages(uid, activeChatId);
        setMessages(orderChatMessages(threadMessages));
        await saveLatestChatCache(uid, activeChatId, null, threadMessages);
        await saveAuraChatSessionMeta(uid, activeChatId);
      }
      setFocusScrollSignal((value) => value + 1);
    } catch {
      Toast.error("Refresh failed", "AURA could not refresh this chat just now.");
    } finally {
      const remaining = Math.max(0, 450 - (Date.now() - startedAt));
      setTimeout(() => setChatRefreshing(false), remaining);
    }
  }, [
    activeChatId,
    chatRefreshing,
    refreshRecentThreads,
    setMessages,
    uid,
  ]);
  const showEmptyState = orderedMessages.length === 0 && !loading && !isBooting && !message.trim();
  const showKeyboardWatermark = keyboardHeight > 0 && orderedMessages.length < 2 && !showEmptyState;
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
        colors={chatBackgroundColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flex: 1, paddingTop: Math.max(insets.top + 2, layout.topContentInset - 14) }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={chatBottomGlowColors}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 112,
        }}
      />
        <AuraHeader
        colors={colors}
        recentThreadsCount={recentThreads.length}
        streaming={loading}
        onOpenRecent={() => setChatDrawerOpen(true)}
        onReset={() => {
          setMessage("");
          setPendingAttachments([]);
          setMessages([]);
          setActiveChatId(null);
          setQuickChips(DEFAULT_CHIPS);
          if (uid) {
            void saveAuraChatSessionMeta(uid, null);
          }
        }}
      />

        <View style={{ paddingTop: 6, paddingBottom: 4 }}>
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
          contentBottomPadding={chatBottomInset}
          autoScrollSignal={focusScrollSignal}
          focusMessageId={focusMessageId}
          emptyState={emptyChatState}
          refreshing={chatRefreshing}
          onRefresh={handleChatRefresh}
          onSaveOutfit={handleSaveOutfitFromLegacyMessage}
          onMoreLikeThis={handleMoreLikeThisFromLegacyMessage}
          onSwapOutfit={handleSwapFromLegacyMessage}
          onAuraAction={handleAuraLookAction}
          onAuraCandidateAction={handleAuraCandidateAction}
          onAuraOutfitPhotoAction={handleAuraOutfitPhotoAction}
          onAuraLaundryAction={handleAuraLaundryAction}
          onRetryAuraResponse={handleRetryAuraResponse}
          />
          {showKeyboardWatermark ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                alignSelf: "center",
                bottom: chatBottomInset + 20,
                width: 58,
                height: 58,
                opacity: 0.055,
              }}
            >
              <Image
                source={AURA_LOGO_SOURCE}
                resizeMode="contain"
                style={{ width: "100%", height: "100%" }}
              />
            </View>
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
        onSend={() => void handleComposerSend()}
        onStop={hasStreamingMessage ? handleStopGenerating : undefined}
        onPickImages={() => void handlePickImages()}
        onTakePhoto={() => void handleTakePhoto()}
        attachments={pendingAttachments}
        attachmentRole={attachmentRole}
        onAttachmentRoleChange={handleAttachmentRoleChange}
        onRemoveAttachment={handleRemoveAttachment}
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
          await saveAuraChatSessionMeta(uid, thread.chatId);
          const threadMessages = await loadChatMessages(uid, thread.chatId);
          const orderedThreadMessages = orderChatMessages(threadMessages);
          setMessages(orderedThreadMessages);
          setActiveChatId(thread.chatId);
          await saveLatestChatCache(uid, thread.chatId, thread.threadId, orderedThreadMessages);
          await saveAuraChatSessionMeta(uid, thread.chatId);
          setChatDrawerOpen(false);
        }}
        />
      </LinearGradient>
    </AuraGlowBackground>
  );
}
