import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image as RNImage,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type DimensionValue,
  type GestureResponderEvent,
} from "react-native";
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Fonts, type AppColors } from "@/constants/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import AuraAgentMessage from "@/src/components/aura/AuraAgentMessage";
import AuraPressable from "@/src/components/aura/AuraPressable";
import AppImage from "@/src/components/common/AppImage";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getAgentDisplayMessage } from "@/src/lib/auraAgentDisplay";
import { formatOutfitAnalysisSentence } from "@/src/lib/auraOutfitAnalysisDisplay";
import { formatUserBubbleText } from "@/src/lib/chatUserMessageText";
import { formatUrlForDisplay, isUrlOnlyMessage } from "@/src/lib/formatChatText";
import { sanitizeDisplayText, sanitizeMultilineDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraCandidateAction, AuraLaundryConfirmationAction, AuraLook, AuraLookAction, AuraLookOptionMeta, AuraOutfitPhotoAction } from "@/src/types/aura";
import type { AuraAgentOutfit, AuraAgentSuggestedAction } from "@/src/types/auraAgent";

import AuraReplyCard from "./AuraReplyCard";
import OutfitMessage from "./OutfitMessage";
import type { AIMessage, ChatAttachment, ChatImageAttachment, ChatMessageActionAnchor } from "./chatTypes";
import {
  AGENT_MESSAGE_HORIZONTAL_PADDING,
  getAuraAgentRenderSource,
  shouldUseFullWidthAgentMessage,
  shouldShowAuraAgentSourceBadge,
} from "./chatMessageLayout";
import { auraShadow } from "./aiTheme";

const USER_SINGLE_IMAGE_MIN_WIDTH = 180;
const USER_SINGLE_IMAGE_MAX_WIDTH = 240;
const USER_IMAGE_GRID_GAP = 7;
const USER_MULTI_IMAGE_MAX_GRID_WIDTH = 248;
const USER_MULTI_IMAGE_MIN_GRID_WIDTH = 196;
const USER_IMAGE_RADIUS = 20;
const STREAM_TAIL_REVEAL_MS = 130;
const USER_BUBBLE_MAX_WIDTH = "84%";
const USER_URL_BUBBLE_MAX_WIDTH = "68%";

function actionAnchorFromEvent(event: GestureResponderEvent): ChatMessageActionAnchor {
  return {
    pageX: event.nativeEvent.pageX,
    pageY: event.nativeEvent.pageY,
  };
}

function measuredAnchorFromRect(
  x: number,
  y: number,
  width: number,
  height: number,
  fallback: ChatMessageActionAnchor,
): ChatMessageActionAnchor {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return fallback;
  }
  return { pageX: x, pageY: y, width, height };
}

function measureActionAnchor(
  ref: React.RefObject<React.ComponentRef<typeof View> | null>,
  event: GestureResponderEvent,
  onAnchor: (anchor: ChatMessageActionAnchor) => void,
) {
  const fallback = actionAnchorFromEvent(event);
  const node = ref.current;
  if (!node?.measureInWindow) {
    onAnchor(fallback);
    return;
  }
  node.measureInWindow((x, y, width, height) => {
    onAnchor(measuredAnchorFromRect(x, y, width, height, fallback));
  });
}

function TypingDots({ colors, pulse }: { colors: AppColors; pulse: Animated.Value }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, minHeight: 24 }}>
      {[0, 1, 2].map((index) => (
        <Animated.View
          key={index}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: colors.textSecondary,
            opacity:
              index === 0
                ? pulse
                : index === 1
                  ? pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.65, 0.42] })
                  : pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.42, 0.75] }),
          }}
        />
      ))}
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getImageAspectRatio(attachment: ChatImageAttachment) {
  const width = Number(attachment.width ?? 0);
  const height = Number(attachment.height ?? 0);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 0.78;
  }
  return clamp(width / height, 0.68, 1.45);
}

function getSingleImageWidth(layoutWidth: number, screenSize: string) {
  const maxWidth = screenSize === "compact" ? 220 : USER_SINGLE_IMAGE_MAX_WIDTH;
  return clamp(layoutWidth * 0.58, USER_SINGLE_IMAGE_MIN_WIDTH, maxWidth);
}

function getMultiImageGridWidth(layoutWidth: number, screenSize: string) {
  const maxWidth = screenSize === "compact" ? 224 : USER_MULTI_IMAGE_MAX_GRID_WIDTH;
  return clamp(layoutWidth * 0.62, USER_MULTI_IMAGE_MIN_GRID_WIDTH, maxWidth);
}

function cleanIntroText(value?: string | null) {
  return sanitizeMultilineDisplayText(value) ?? "";
}

function fallbackStructuredIntro(message: AIMessage) {
  if (message.agentResponse) {
    return getAgentDisplayMessage(message.agentResponse);
  }
  const candidateItems = message.aura?.candidateItems ?? message.aura?.candidates ?? [];
  if (candidateItems.length) {
    return "I found this item. Review it before I add it to your wardrobe.";
  }
  if (message.aura?.outfitAnalysis) {
    return `${formatOutfitAnalysisSentence(message.aura.outfitAnalysis)} Review the pieces below before saving or adding them.`;
  }
  if (message.aura?.presentation === "laundry_confirmation") {
    return message.aura.reply || "Which item did you mean?";
  }
  if (message.aura?.look || message.aura?.lookOptions?.length) {
    if ((message.aura?.lookOptions?.length ?? 0) > 1) {
      return "Got you — I built a few looks from your closet that match that direction.";
    }
    return "Got you — I pulled a look together that stays close to that direction.";
  }
  if (message.outfits?.length) {
    return "Got you — I built a few looks from your closet that match that direction.";
  }
  return "Got you — here’s what I’d do.";
}

function DevAuraAgentSourceBadge({
  colors,
  source,
}: {
  colors: AppColors;
  source: string;
}) {
  if (!__DEV__) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        alignSelf: "flex-start",
        borderColor: colors.borderSoft,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        marginBottom: 6,
        opacity: 0.72,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          color: colors.textMuted,
          fontFamily: Fonts.sans,
          fontSize: 10,
          letterSpacing: 0,
        }}
      >
        source: {source}
      </Text>
    </View>
  );
}

function SmoothStreamingText({
  text,
  colors,
}: {
  text: string;
  colors: AppColors;
}) {
  const reduceMotion = useReduceMotion();
  const latestTextRef = useRef(text);
  const previousTextRef = useRef(text);
  const tailOpacity = useRef(new Animated.Value(1)).current;
  const tailRise = useRef(new Animated.Value(0)).current;
  const [baseText, setBaseText] = useState(text);
  const [tailText, setTailText] = useState("");

  useEffect(() => {
    latestTextRef.current = text;
    const previousText = previousTextRef.current;
    previousTextRef.current = text;

    if (!text) {
      setBaseText("");
      setTailText("");
      return;
    }

    if (!previousText || !text.startsWith(previousText) || reduceMotion) {
      setBaseText(text);
      setTailText("");
      tailOpacity.setValue(1);
      tailRise.setValue(0);
      return;
    }

    const nextTail = text.slice(previousText.length);
    if (!nextTail) return;
    setBaseText(previousText);
    setTailText(nextTail);
    tailOpacity.setValue(0.24);
    tailRise.setValue(3);
    Animated.parallel([
      Animated.timing(tailOpacity, {
        toValue: 1,
        duration: STREAM_TAIL_REVEAL_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(tailRise, {
        toValue: 0,
        duration: STREAM_TAIL_REVEAL_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || latestTextRef.current !== text) return;
      setBaseText(text);
      setTailText("");
    });
  }, [reduceMotion, tailOpacity, tailRise, text]);

  return (
    <Text
      style={{
        color: colors.text,
        fontSize: 15,
        lineHeight: 23,
        fontWeight: "400",
        fontFamily: Fonts.sans,
        marginLeft: 0,
        maxWidth: "94%",
      }}
    >
      {baseText}
      {tailText ? (
        <Animated.Text
          style={{
            opacity: tailOpacity,
            transform: [{ translateY: tailRise }],
          }}
        >
          {tailText}
        </Animated.Text>
      ) : null}
    </Text>
  );
}

function FormattedAuraText({
  text,
  colors,
  marginLeft = 0,
  marginRight = 20,
  maxWidth = "94%",
}: {
  text: string;
  colors: AppColors;
  marginLeft?: number;
  marginRight?: number;
  maxWidth?: DimensionValue;
}) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return null;

  const selectableText = blocks
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");

  return (
    <TextInput
      value={selectableText}
      editable={false}
      multiline
      scrollEnabled={false}
      textAlignVertical="top"
      keyboardAppearance="dark"
      selectionColor={colors.aiAccent}
      style={{
        marginLeft,
        marginRight,
        width: maxWidth,
        color: colors.textSecondary,
        fontSize: 15,
        lineHeight: 23,
        fontWeight: "400",
        fontFamily: Fonts.sans,
        padding: 0,
        backgroundColor: "transparent",
      }}
    />
  );
}

type ChatMessageProps = {
  colors: AppColors;
  message: AIMessage;
  itemsById: Map<string, ClothingItem>;
  savingId: string | null;
  memoryHint?: string | null;
  onSaveOutfit: (outfitId: string) => void;
  onMoreLikeThis: (outfit: import("./chatTypes").ChatOutfit) => void;
  onSwapOutfit: (outfit: import("./chatTypes").ChatOutfit) => void;
  onAuraAction?: (action: AuraLookAction, message: AIMessage, look?: AuraLook, lookOption?: AuraLookOptionMeta) => void;
  onAuraCandidateAction?: (action: AuraCandidateAction, message: AIMessage) => void;
  onAuraOutfitPhotoAction?: (action: AuraOutfitPhotoAction, message: AIMessage) => void;
  onAuraLaundryAction?: (action: AuraLaundryConfirmationAction, message: AIMessage) => void;
  onAuraAgentAction?: (action: AuraAgentSuggestedAction, message: AIMessage, outfit?: AuraAgentOutfit | null) => void;
  onAuraAgentOutfitSelect?: (outfit: AuraAgentOutfit, message: AIMessage) => void;
  onRetryAuraResponse?: (message: AIMessage) => void;
  onMessageActionPress?: (message: AIMessage, anchor: ChatMessageActionAnchor) => void;
  selectedAgentOutfitId?: string | null;
  auraAgentActionsDisabled?: boolean;
  auraAgentLoadingActionId?: string | null;
  auraAgentLoadingMessageId?: string | null;
};

function ChatMessage({
  colors,
  message,
  itemsById,
  savingId,
  memoryHint,
  onSaveOutfit,
  onMoreLikeThis,
  onSwapOutfit,
  onAuraAction,
  onAuraCandidateAction,
  onAuraOutfitPhotoAction,
  onAuraLaundryAction,
  onAuraAgentAction,
  onAuraAgentOutfitSelect,
  onRetryAuraResponse,
  onMessageActionPress,
  selectedAgentOutfitId,
  auraAgentActionsDisabled = false,
  auraAgentLoadingActionId = null,
  auraAgentLoadingMessageId = null,
}: ChatMessageProps) {
  const layout = useResponsiveLayout();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(8)).current;
  const scale = useRef(new Animated.Value(0.98)).current;
  const introFade = useRef(new Animated.Value(0)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const cardRise = useRef(new Animated.Value(14)).current;
  const cardScale = useRef(new Animated.Value(0.98)).current;
  const pulse = useRef(new Animated.Value(0.45)).current;
  const isAgentCard = shouldUseFullWidthAgentMessage(message);
  const auraAgentRenderSource = getAuraAgentRenderSource(message);
  const showAuraAgentSourceBadge = shouldShowAuraAgentSourceBadge(message);
  const isStructuredCard =
    isAgentCard ||
    (message.kind === "aura_card" && !!message.aura) ||
    (message.type === "outfit" && !!message.outfits?.length);
  const structuredIntroText = isAgentCard
    ? getAgentDisplayMessage(message.agentResponse)
    : cleanIntroText(message.assistantIntroText ?? message.text) || fallbackStructuredIntro(message);
  const isUser = message.kind === "user_text" || message.type === "user";
  const isAuraText = message.kind === "aura_text";
  const displayText = isUser ? formatUserBubbleText(message.text) : sanitizeMultilineDisplayText(message.text);
  const isStreamingPlaceholder = !isUser && !!message.streaming && !displayText;
  const isUserUrlOnly = isUser && isUrlOnlyMessage(displayText);
  const formattedUserText = isUserUrlOnly ? formatUrlForDisplay(String(displayText ?? "")) : displayText;
  const messageAttachments = message.attachments ?? [];
  const labelTextColor = colors.textMuted;
  const assistantSurface = colors.surfaceMuted;
  const assistantBorder = colors.borderSoft;
  const userBubbleSurface = colors.surfaceElevated;
  const userBubbleBorder = colors.borderStrong;
  const imageAttachments = messageAttachments.filter(
    (attachment): attachment is ChatImageAttachment => attachment.type === "image",
  );
  const nonImageAttachments = messageAttachments.filter((attachment) => attachment.type !== "image");
  const hasUserImageAttachments = isUser && imageAttachments.length > 0;
  const userImageTextBubbleRef = useRef<React.ComponentRef<typeof View>>(null);
  const userBubbleRef = useRef<React.ComponentRef<typeof View>>(null);
  const [previewImage, setPreviewImage] = useState<ChatImageAttachment | null>(null);
  const openMessageActionsFromRef = React.useCallback(
    (event: GestureResponderEvent, anchorRef: React.RefObject<React.ComponentRef<typeof View> | null>) => {
      if (message.streaming) return;
      if (!onMessageActionPress) return;
      measureActionAnchor(anchorRef, event, (anchor) => onMessageActionPress(message, anchor));
    },
    [message, onMessageActionPress],
  );
  const imagePreviewModal = previewImage ? (
    <ImagePreviewModal
      attachment={previewImage}
      colors={colors}
      visible
      onClose={() => setPreviewImage(null)}
    />
  ) : null;

  useEffect(() => {
    if (!__DEV__) return;
    if (message.type !== "assistant" && message.type !== "outfit") return;
    const event =
      auraAgentRenderSource === "agent"
        ? "rendering agentResponse"
        : auraAgentRenderSource === "legacy"
          ? "rendering legacy look payload"
          : auraAgentRenderSource === "cached"
            ? "rendering cached outfit payload"
            : "rendering text-only message";
    console.log("[AURA_AGENT_RENDER]", event, {
      messageId: message.id,
      kind: message.kind ?? null,
      debugSource: message.debugSource ?? null,
      hasAgentResponse: !!message.agentResponse,
      hasLegacyAuraPayload: !!message.aura?.look || !!message.aura?.lookOptions?.length,
      outfitCount: message.agentResponse?.outfits?.length ?? message.outfits?.length ?? 0,
    });
  }, [
    auraAgentRenderSource,
    message.agentResponse,
    message.aura?.look,
    message.aura?.lookOptions?.length,
    message.debugSource,
    message.id,
    message.kind,
    message.outfits?.length,
    message.type,
  ]);

  useEffect(() => {
    if (isStructuredCard) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(introFade, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(rise, {
            toValue: 0,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(140),
        Animated.parallel([
          Animated.timing(cardFade, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(cardRise, {
            toValue: 0,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(cardScale, {
            toValue: 1,
            duration: 240,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: isUser ? 180 : 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: isUser ? 180 : 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: isUser ? 180 : 210,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardFade, cardRise, cardScale, fade, introFade, isStructuredCard, isUser, rise, scale]);

  useEffect(() => {
    if (!isStreamingPlaceholder) {
      pulse.stopAnimation();
      pulse.setValue(0.45);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 520,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isStreamingPlaceholder, pulse]);

  if (message.type === "outfit" && message.outfits?.length) {
    return (
      <>
        <View style={{ gap: 10 }}>
          <Animated.View style={{ opacity: introFade, transform: [{ translateY: rise }, { scale }] }}>
            <StructuredAuraIntro colors={colors} text={structuredIntroText} compact />
          </Animated.View>
          <AssistantActionButton colors={colors} message={message} onOpen={onMessageActionPress} />
          <OutfitCardEntry>
            <Animated.View style={{ opacity: cardFade, transform: [{ translateY: cardRise }, { scale: cardScale }], gap: 12 }}>
              {showAuraAgentSourceBadge ? (
                <DevAuraAgentSourceBadge colors={colors} source={auraAgentRenderSource} />
              ) : null}
              {message.outfits.map((outfit, index) => (
                <OutfitMessage
                  key={`${message.id}-${outfit.id}`}
                  colors={colors}
                  outfit={outfit}
                  itemsById={itemsById}
                  saving={savingId === outfit.id}
                  index={index}
                  memoryHint={memoryHint}
                  onSave={() => onSaveOutfit(outfit.id)}
                  onMoreLikeThis={onMoreLikeThis}
                  onSwap={onSwapOutfit}
                />
              ))}
            </Animated.View>
          </OutfitCardEntry>
        </View>
        {imagePreviewModal}
      </>
    );
  }

  if (message.kind === "aura_card" && message.aura) {
    const isLookSurface = !!message.aura.look || !!message.aura.lookOptions?.length;
    return (
      <>
        <View
          style={{
            alignItems: "stretch",
            marginLeft: 0,
            marginRight: isLookSurface ? 0 : 8,
            gap: 10,
          }}
        >
          <Animated.View style={{ opacity: introFade, transform: [{ translateY: rise }, { scale }] }}>
            <StructuredAuraIntro colors={colors} text={structuredIntroText} compact={isLookSurface} />
          </Animated.View>
          <AssistantActionButton colors={colors} message={message} onOpen={onMessageActionPress} />
          <OutfitCardEntry>
            <Animated.View style={{ opacity: cardFade, transform: [{ translateY: cardRise }, { scale: cardScale }] }}>
              <View style={{ maxWidth: "100%", marginLeft: 0, marginTop: 2 }}>
                {showAuraAgentSourceBadge ? (
                  <DevAuraAgentSourceBadge colors={colors} source={auraAgentRenderSource} />
                ) : null}
                <AuraReplyCard
                  data={message.aura}
                  itemsById={itemsById}
                  onAction={onAuraAction ? (action, look, lookOption) => onAuraAction(action, message, look, lookOption) : undefined}
                  onCandidateAction={
                    onAuraCandidateAction ? (action) => onAuraCandidateAction(action, message) : undefined
                  }
                  onOutfitPhotoAction={
                    onAuraOutfitPhotoAction ? (action) => onAuraOutfitPhotoAction(action, message) : undefined
                  }
                  onLaundryAction={
                    onAuraLaundryAction ? (action) => onAuraLaundryAction(action, message) : undefined
                  }
                />
              </View>
            </Animated.View>
          </OutfitCardEntry>
        </View>
        {imagePreviewModal}
      </>
    );
  }

  if (isAgentCard && message.agentResponse) {
    return (
      <>
        <View
          testID="aura-agent-message-container"
          style={chatMessageStyles.agentMessageContainer}
        >
          <Animated.View style={{ opacity: introFade, transform: [{ translateY: rise }, { scale }] }}>
            <StructuredAuraIntro colors={colors} text={structuredIntroText} compact />
          </Animated.View>
          <AssistantActionButton colors={colors} message={message} onOpen={onMessageActionPress} />
          <OutfitCardEntry fullWidth>
            <Animated.View
              style={[
                { opacity: cardFade, transform: [{ translateY: cardRise }, { scale: cardScale }] },
                chatMessageStyles.agentOutfitCard,
              ]}
            >
              {showAuraAgentSourceBadge ? (
                <DevAuraAgentSourceBadge colors={colors} source={auraAgentRenderSource} />
              ) : null}
              <AuraAgentMessage
                colors={colors}
                response={message.agentResponse}
                selectedOutfitId={selectedAgentOutfitId}
                disabled={message.streaming || auraAgentActionsDisabled}
                loadingActionId={
                  auraAgentLoadingMessageId === message.id ? auraAgentLoadingActionId : null
                }
                agentActionStates={message.agentActionStates}
                onSelectOutfit={
                  onAuraAgentOutfitSelect
                    ? (outfit) => onAuraAgentOutfitSelect(outfit, message)
                    : undefined
                }
                onAction={
                  onAuraAgentAction
                    ? (action, outfit) => onAuraAgentAction(action, message, outfit)
                    : undefined
                }
              />
            </Animated.View>
          </OutfitCardEntry>
        </View>
        {imagePreviewModal}
      </>
    );
  }

  if (message.type === "system/action") {
    const displayText = sanitizeDisplayText(message.text);
    const isSuggestion =
      (displayText ?? "").startsWith("Try this today:") ||
      (displayText ?? "").startsWith("Stylist note:");
    const isError = /\b(trouble|couldn'?t|could not|failed|unavailable|unable|try again)\b/i.test(displayText ?? "");
    const canRetry = isError && !!onRetryAuraResponse;
    return (
      <Animated.View
        style={{
          opacity: fade,
          transform: [{ translateY: rise }],
          alignItems: isSuggestion ? "stretch" : "flex-start",
        }}
      >
        <View
          style={{
            borderRadius: isSuggestion || isError ? 18 : 999,
            paddingHorizontal: isSuggestion || isError ? 13 : 14,
            paddingVertical: isSuggestion || isError ? 12 : 8,
            backgroundColor: isError
              ? colors.surfaceMuted
              : isSuggestion
                ? assistantSurface
                : colors.surfaceSoft,
            borderWidth: isSuggestion || isError ? 0.75 : 0,
            borderColor: isError ? colors.border : isSuggestion ? assistantBorder : "transparent",
            marginLeft: isSuggestion || isError ? 0 : 10,
            maxWidth: isSuggestion || isError ? "94%" : "74%",
          }}
        >
          {isSuggestion || isError ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: labelTextColor, fontSize: 10.5, fontWeight: "500", letterSpacing: 1.2, textTransform: "uppercase" }}>
                {isError ? "Couldn't finish" : "Stylist note"}
              </Text>
              <Text selectable={isError} style={{ color: isError ? colors.textSecondary : colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: "400" }}>
                {displayText}
              </Text>
              {canRetry ? (
                <AuraPressable
                  onPress={() => onRetryAuraResponse?.(message)}
                  haptic="selection"
                  hapticTrigger="press"
                  pressedScale={0.97}
                  pressedOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel="Retry AURA response"
                  style={{
                    alignSelf: "flex-start",
                    minHeight: 30,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 0,
                    backgroundColor: colors.chipBackground,
                    borderWidth: 0.75,
                    borderColor: colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Ionicons name="refresh-outline" size={13} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "600", fontFamily: Fonts.sans }}>
                    Retry
                  </Text>
                </AuraPressable>
              ) : null}
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500" }}>{displayText}</Text>
          )}
        </View>
      </Animated.View>
    );
  }

  if (isAuraText) {
    const isAssistantError = /\b(couldn'?t|could not|failed|unavailable|unable|try again|sign in again)\b/i.test(displayText ?? "");
    const canRetry = isAssistantError && !!onRetryAuraResponse && !message.streaming;
    return (
      <>
        <Animated.View
          style={{
            opacity: fade,
            transform: [{ translateY: rise }, { scale }],
            alignItems: "stretch",
            marginRight: 8,
            marginLeft: 0,
            gap: 6,
          }}
        >
          {isStreamingPlaceholder ? (
            <TypingDots colors={colors} pulse={pulse} />
          ) : displayText ? (
            message.streaming ? (
              <SmoothStreamingText text={displayText} colors={colors} />
            ) : (
              <FormattedAuraText text={displayText} colors={colors} />
            )
          ) : null}
          {canRetry ? (
            <AuraPressable
              onPress={() => onRetryAuraResponse?.(message)}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.97}
              pressedOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Retry AURA response"
              style={{
                alignSelf: "flex-start",
                minHeight: 32,
                borderRadius: 999,
                paddingHorizontal: 11,
                paddingVertical: 0,
                backgroundColor: colors.chipBackground,
                borderWidth: 0.75,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              <Ionicons name="refresh-outline" size={13} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: "600", fontFamily: Fonts.sans }}>
                Retry
              </Text>
            </AuraPressable>
          ) : null}
          <AssistantActionButton colors={colors} message={message} onOpen={onMessageActionPress} />
        </Animated.View>
        {imagePreviewModal}
      </>
    );
  }

  if (hasUserImageAttachments) {
    return (
      <Animated.View
        style={{
          opacity: fade,
          transform: [{ translateY: rise }, { scale }],
          alignItems: "flex-end",
          gap: 6,
        }}
      >
        <UserImageAttachmentMedia
          attachments={imageAttachments}
          layoutWidth={layout.width}
          screenSize={layout.screenSize}
          colors={colors}
          onImagePress={setPreviewImage}
        />
        {nonImageAttachments.length ? (
          <View
            style={{
              maxWidth: "74%",
              borderRadius: 22,
              paddingHorizontal: 13,
              paddingVertical: 8,
              backgroundColor: userBubbleSurface,
              borderWidth: 1,
              borderColor: userBubbleBorder,
              marginLeft: 74,
              marginRight: 6,
              ...auraShadow(0.06),
            }}
          >
            <AttachmentPreviews attachments={nonImageAttachments} colors={colors} isUser />
          </View>
        ) : null}
        {formattedUserText ? (
          <Pressable
            ref={userImageTextBubbleRef}
            delayLongPress={260}
            onLongPress={(event) => openMessageActionsFromRef(event, userImageTextBubbleRef)}
            accessibilityRole="button"
            accessibilityLabel="Open message actions"
            style={({ pressed }) => ({
              maxWidth: isUserUrlOnly ? USER_URL_BUBBLE_MAX_WIDTH : USER_BUBBLE_MAX_WIDTH,
              borderRadius: 22,
              paddingHorizontal: 13,
              paddingVertical: isUserUrlOnly ? 7 : 8,
              backgroundColor: userBubbleSurface,
              borderWidth: 1,
              borderColor: userBubbleBorder,
              marginLeft: 0,
              marginRight: 6,
              opacity: pressed ? 0.92 : 1,
              ...auraShadow(0.06),
            })}
          >
            <Text
              numberOfLines={isUserUrlOnly ? 2 : undefined}
              ellipsizeMode={isUserUrlOnly ? "tail" : undefined}
              style={{
                color: colors.text,
                fontSize: 14.5,
                lineHeight: 21,
                fontWeight: "400",
                fontFamily: Fonts.sans,
                flexShrink: 1,
                flexWrap: "wrap",
              }}
            >
              {formattedUserText}
            </Text>
          </Pressable>
        ) : null}
        {imagePreviewModal}
      </Animated.View>
    );
  }

  const fallbackBubbleStyle = {
    maxWidth: isUserUrlOnly ? USER_URL_BUBBLE_MAX_WIDTH : isUser ? USER_BUBBLE_MAX_WIDTH : isAuraText ? "76%" : "78%",
    borderRadius: 22,
    paddingHorizontal: isUser ? 13 : 15,
    paddingVertical: isUserUrlOnly ? 7 : isUser ? 8 : 10,
    backgroundColor: isUser ? userBubbleSurface : assistantSurface,
    borderWidth: 1,
    borderColor: isUser ? userBubbleBorder : assistantBorder,
    marginLeft: isUser ? 0 : layout.screenSize === "compact" ? 4 : 6,
    marginRight: isUser ? 6 : 28,
    alignSelf: isUser ? "flex-end" : "flex-start",
    ...auraShadow(isUser ? 0.06 : 0.04),
  } as const;
  const fallbackBubbleContent = isStreamingPlaceholder ? (
    <TypingDots colors={colors} pulse={pulse} />
  ) : (
    <>
      {messageAttachments.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: displayText ? 8 : 0 }}>
          <AttachmentPreviews
            attachments={messageAttachments}
            colors={colors}
            isUser={isUser}
            onImagePress={setPreviewImage}
          />
        </View>
      ) : null}
      {formattedUserText ? (
        <Text
          selectable={!isUser}
          numberOfLines={isUserUrlOnly ? 2 : undefined}
          ellipsizeMode={isUserUrlOnly ? "tail" : undefined}
          style={{
            color: colors.text,
            fontSize: 14.5,
            lineHeight: 21,
            fontWeight: "400",
            fontFamily: Fonts.sans,
            flexShrink: 1,
            flexWrap: "wrap",
          }}
        >
          {formattedUserText}
        </Text>
      ) : null}
    </>
  );

  return (
    <Animated.View
      style={{ opacity: fade, transform: [{ translateY: rise }, { scale }], alignItems: isUser ? "flex-end" : "flex-start" }}
    >
      {isUser ? (
        <Pressable
          ref={userBubbleRef}
          delayLongPress={260}
          onLongPress={(event) => openMessageActionsFromRef(event, userBubbleRef)}
          accessibilityRole="button"
          accessibilityLabel="Open message actions"
          style={({ pressed }) => [
            fallbackBubbleStyle,
            pressed ? { opacity: 0.92 } : null,
          ]}
        >
          {fallbackBubbleContent}
        </Pressable>
      ) : (
        <View style={fallbackBubbleStyle}>{fallbackBubbleContent}</View>
      )}
      {!isUser ? <AssistantActionButton colors={colors} message={message} onOpen={onMessageActionPress} /> : null}
      {imagePreviewModal}
    </Animated.View>
  );
}

function UserImageAttachmentMedia({
  attachments,
  layoutWidth,
  screenSize,
  colors,
  onImagePress,
}: {
  attachments: ChatImageAttachment[];
  layoutWidth: number;
  screenSize: string;
  colors: AppColors;
  onImagePress: (attachment: ChatImageAttachment) => void;
}) {
  if (attachments.length === 1) {
    const attachment = attachments[0];
    const width = getSingleImageWidth(layoutWidth, screenSize);
    return (
      <Pressable
        onPress={() => onImagePress(attachment)}
        accessibilityRole="button"
        accessibilityLabel="Open image preview"
        style={{
          width,
          aspectRatio: getImageAspectRatio(attachment),
          borderRadius: USER_IMAGE_RADIUS,
          overflow: "hidden",
          backgroundColor: colors.chipBackground,
          borderWidth: 1,
          borderColor: colors.border,
          marginRight: 6,
          ...auraShadow(0.2),
        }}
      >
        <AppImage
          source={{ uri: attachment.localUri ?? attachment.uri }}
          style={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        />
      </Pressable>
    );
  }

  const gridWidth = getMultiImageGridWidth(layoutWidth, screenSize);
  const tileSize = (gridWidth - USER_IMAGE_GRID_GAP) / 2;
  const visibleAttachments = attachments.slice(0, 4);
  const remainingCount = Math.max(0, attachments.length - visibleAttachments.length);

  return (
    <View
      style={{
        width: gridWidth,
        flexDirection: "row",
        flexWrap: "wrap",
        gap: USER_IMAGE_GRID_GAP,
        justifyContent: "flex-end",
        marginRight: 6,
      }}
    >
      {visibleAttachments.map((attachment, index) => {
        const showOverflow = index === visibleAttachments.length - 1 && remainingCount > 0;
        return (
          <Pressable
            key={attachment.id}
            onPress={() => onImagePress(attachment)}
            accessibilityRole="button"
            accessibilityLabel="Open image preview"
            style={{
              width: tileSize,
              height: tileSize,
              borderRadius: 18,
              overflow: "hidden",
              backgroundColor: colors.chipBackground,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <AppImage
              source={{ uri: attachment.localUri ?? attachment.uri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
            {showOverflow ? (
              <View
                style={{
                  position: "absolute",
                  inset: 0,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.overlay,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600", fontFamily: Fonts.sans }}>
                  +{remainingCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function AssistantActionButton({
  colors,
  message,
  onOpen,
}: {
  colors: AppColors;
  message: AIMessage;
  onOpen?: (message: AIMessage, anchor: ChatMessageActionAnchor) => void;
}) {
  const actionButtonRef = React.useRef<React.ComponentRef<typeof View>>(null);
  if (!onOpen || message.streaming) return null;

  const handleOpen = (event: GestureResponderEvent) => {
    measureActionAnchor(actionButtonRef, event, (anchor) => onOpen(message, anchor));
  };

  return (
    <Pressable
      ref={actionButtonRef}
      onPress={handleOpen}
      onLongPress={handleOpen}
      delayLongPress={220}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Open assistant message actions"
      style={({ pressed }) => ({
        alignSelf: "flex-start",
        minWidth: 34,
        height: 28,
        borderRadius: 999,
        marginLeft: 2,
        marginTop: 1,
        paddingHorizontal: 9,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? colors.surfaceElevated : "rgba(255,255,255,0.035)",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(251,228,216,0.12)",
      })}
    >
      <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

function AttachmentPreviews({
  attachments,
  colors,
  isUser,
  onImagePress,
}: {
  attachments: ChatAttachment[];
  colors: AppColors;
  isUser: boolean;
  onImagePress?: (attachment: ChatImageAttachment) => void;
}) {
  return (
    <>
      {attachments.map((attachment) => (
        <Pressable
          key={attachment.id}
          disabled={attachment.type !== "image" || !onImagePress}
          onPress={
            attachment.type === "image" && onImagePress
              ? () => onImagePress(attachment)
              : undefined
          }
          accessibilityRole={attachment.type === "image" ? "button" : undefined}
          accessibilityLabel={attachment.type === "image" ? "Open image preview" : undefined}
          style={{
            width: 92,
            height: 92,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: isUser ? colors.purpleSurface : colors.chipBackground,
          }}
        >
          {attachment.type === "image" ? (
            <AppImage
              source={{ uri: attachment.localUri ?? attachment.uri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>Voice note</Text>
            </View>
          )}
        </Pressable>
      ))}
    </>
  );
}

function ImagePreviewModal({
  attachment,
  colors,
  visible,
  onClose,
}: {
  attachment: ChatImageAttachment | null;
  colors: AppColors;
  visible: boolean;
  onClose: () => void;
}) {
  const layout = useResponsiveLayout();
  const uri = attachment?.localUri ?? attachment?.uri ?? "";
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoadError(false);
    setLoading(!!uri);
    setRetryKey(0);
  }, [uri]);

  if (!visible || !attachment) return null;

  const retry = () => {
    setLoadError(false);
    setLoading(!!uri);
    setRetryKey((value) => value + 1);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={imagePreviewStyles.backdrop}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close image preview"
          style={[
            imagePreviewStyles.closeButton,
            {
              top: Math.max(16, layout.topContentInset - 10),
              backgroundColor: "rgba(18,17,22,0.72)",
              borderColor: "rgba(251,228,216,0.16)",
            },
          ]}
        >
          <Ionicons name="close" size={20} color={colors.text} />
        </Pressable>

        {uri && !loadError ? (
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={[
              imagePreviewStyles.zoomContent,
              {
                minHeight: layout.height,
                minWidth: layout.width,
              },
            ]}
            centerContent
            maximumZoomScale={4}
            minimumZoomScale={1}
            bouncesZoom
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <RNImage
              key={`${uri}:${retryKey}`}
              source={{ uri }}
              resizeMode="contain"
              onLoadStart={() => {
                setLoading(true);
                setLoadError(false);
              }}
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setLoadError(true);
              }}
              style={{
                width: layout.width,
                height: layout.height,
              }}
            />
          </ScrollView>
        ) : (
          <View style={imagePreviewStyles.fallback}>
            <Ionicons name="image-outline" size={34} color={colors.textSecondary} />
            <Text style={[imagePreviewStyles.fallbackTitle, { color: colors.text }]}>
              {"Couldn't load image"}
            </Text>
            <Text style={[imagePreviewStyles.fallbackText, { color: colors.textSecondary }]}>
              The image may still be uploading or unavailable.
            </Text>
            <Pressable
              onPress={retry}
              accessibilityRole="button"
              accessibilityLabel="Retry loading image"
              style={({ pressed }) => [
                imagePreviewStyles.retryButton,
                {
                  opacity: pressed ? 0.82 : 1,
                  borderColor: "rgba(251,228,216,0.18)",
                  backgroundColor: colors.surfaceElevated,
                },
              ]}
            >
              <Text style={[imagePreviewStyles.retryText, { color: colors.text }]}>Retry</Text>
            </Pressable>
          </View>
        )}

        {loading ? (
          <View pointerEvents="none" style={imagePreviewStyles.loadingIndicator}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const imagePreviewStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },
  closeButton: {
    position: "absolute",
    right: 16,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  zoomContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  loadingIndicator: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 10,
  },
  fallbackTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Fonts.sans,
  },
  fallbackText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Fonts.sans,
  },
  retryButton: {
    marginTop: 8,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: Fonts.sans,
  },
});

const chatMessageStyles = StyleSheet.create({
  agentMessageContainer: {
    alignSelf: "stretch",
    gap: 10,
    marginLeft: 0,
    marginRight: 0,
    paddingHorizontal: AGENT_MESSAGE_HORIZONTAL_PADDING,
    width: "100%",
  },
  agentOutfitCard: {
    alignSelf: "stretch",
    width: "100%",
  },
  fullWidthOutfitEntry: {
    alignSelf: "stretch",
    width: "100%",
  },
});

export default React.memo(
  ChatMessage,
  (prev, next) =>
    prev.message === next.message &&
    prev.colors === next.colors &&
    prev.itemsById === next.itemsById &&
    prev.savingId === next.savingId &&
    prev.memoryHint === next.memoryHint &&
    prev.onSaveOutfit === next.onSaveOutfit &&
    prev.onMoreLikeThis === next.onMoreLikeThis &&
    prev.onSwapOutfit === next.onSwapOutfit &&
    prev.onAuraAction === next.onAuraAction &&
    prev.onAuraCandidateAction === next.onAuraCandidateAction &&
    prev.onAuraOutfitPhotoAction === next.onAuraOutfitPhotoAction &&
    prev.onAuraLaundryAction === next.onAuraLaundryAction &&
    prev.onAuraAgentAction === next.onAuraAgentAction &&
    prev.onAuraAgentOutfitSelect === next.onAuraAgentOutfitSelect &&
    prev.onMessageActionPress === next.onMessageActionPress &&
    prev.selectedAgentOutfitId === next.selectedAgentOutfitId &&
    prev.auraAgentActionsDisabled === next.auraAgentActionsDisabled &&
    prev.auraAgentLoadingActionId === next.auraAgentLoadingActionId &&
    prev.auraAgentLoadingMessageId === next.auraAgentLoadingMessageId
);

function OutfitCardEntry({
  children,
  fullWidth = false,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 16);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withTiming(1, {
      duration: 380,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
    translateY.value = withTiming(0, {
      duration: 380,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
  }, [opacity, reduceMotion, translateY]);

  const entryStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Reanimated.View
      style={[
        entryStyle,
        fullWidth ? chatMessageStyles.fullWidthOutfitEntry : null,
      ]}
    >
      {children}
    </Reanimated.View>
  );
}

function StructuredAuraIntro({
  colors,
  text,
  compact = false,
}: {
  colors: AppColors;
  text: string;
  compact?: boolean;
}) {
  return (
    <View style={{ alignItems: "flex-start" }}>
      <FormattedAuraText
        text={text}
        colors={colors}
        marginLeft={compact ? 0 : 6}
        marginRight={20}
        maxWidth={compact ? "96%" : "84%"}
      />
    </View>
  );
}
