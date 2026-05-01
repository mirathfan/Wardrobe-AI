import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, Text, View } from "react-native";
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Fonts, type AppColors } from "@/constants/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { formatUrlForDisplay, isUrlOnlyMessage } from "@/src/lib/formatChatText";
import { runHaptic } from "@/src/lib/haptics";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraCandidateAction, AuraLaundryConfirmationAction, AuraLook, AuraLookAction, AuraLookOptionMeta, AuraOutfitPhotoAction } from "@/src/types/aura";

import AuraReplyCard from "./AuraReplyCard";
import OutfitMessage from "./OutfitMessage";
import type { AIMessage } from "./chatTypes";
import { auraShadow, auraTheme } from "./aiTheme";

function cleanIntroText(value?: string | null) {
  return sanitizeDisplayText(value)?.replace(/\s+/g, " ").trim() ?? "";
}

function fallbackStructuredIntro(message: AIMessage) {
  const candidateItems = message.aura?.candidateItems ?? message.aura?.candidates ?? [];
  if (candidateItems.length) {
    return "I found this item. Review it before I add it to your wardrobe.";
  }
  if (message.aura?.outfitAnalysis) {
    return "I found this outfit. Review the pieces before saving or adding them.";
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
  const isStructuredCard = (message.kind === "aura_card" && !!message.aura) || (message.type === "outfit" && !!message.outfits?.length);
  const structuredIntroText = cleanIntroText(message.assistantIntroText ?? message.text) || fallbackStructuredIntro(message);
  const isUser = message.kind === "user_text" || message.type === "user";
  const isAuraText = message.kind === "aura_text";
  const displayText = isUser ? message.text : sanitizeDisplayText(message.text);
  const isStreamingPlaceholder = !isUser && !!message.streaming && !displayText;
  const isUserUrlOnly = isUser && isUrlOnlyMessage(displayText);
  const formattedUserText = isUserUrlOnly ? formatUrlForDisplay(String(displayText ?? "")) : displayText;

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
      <View style={{ gap: 6 }}>
        <Animated.View style={{ opacity: introFade, transform: [{ translateY: rise }, { scale }] }}>
          <StructuredAuraIntro colors={colors} text={structuredIntroText} compact />
        </Animated.View>
        <OutfitCardEntry>
          <Animated.View style={{ opacity: cardFade, transform: [{ translateY: cardRise }, { scale: cardScale }], gap: 10 }}>
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
    );
  }

  if (message.kind === "aura_card" && message.aura) {
    const isLookSurface = !!message.aura.look || !!message.aura.lookOptions?.length;
    return (
      <View
        style={{
          alignItems: "stretch",
          marginLeft: 0,
          marginRight: isLookSurface ? 0 : 8,
          gap: 6,
        }}
      >
        <Animated.View style={{ opacity: introFade, transform: [{ translateY: rise }, { scale }] }}>
          <StructuredAuraIntro colors={colors} text={structuredIntroText} compact={isLookSurface} />
        </Animated.View>
        <OutfitCardEntry>
          <Animated.View style={{ opacity: cardFade, transform: [{ translateY: cardRise }, { scale: cardScale }] }}>
            <View style={{ maxWidth: "100%", marginLeft: 0 }}>
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
    );
  }

  if (message.type === "system/action") {
    const displayText = sanitizeDisplayText(message.text);
    const isSuggestion =
      (displayText ?? "").startsWith("Try this today:") ||
      (displayText ?? "").startsWith("Stylist note:");
    const isError = /\b(trouble|couldn'?t|could not|failed|unavailable|unable|try again)\b/i.test(displayText ?? "");
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
            borderRadius: isSuggestion || isError ? 20 : 999,
            paddingHorizontal: isSuggestion || isError ? 16 : 14,
            paddingVertical: isSuggestion || isError ? 14 : 8,
            backgroundColor: isError
              ? "rgba(241,153,153,0.08)"
              : isSuggestion
                ? auraTheme.surface
                : auraTheme.surfaceSoft,
            borderWidth: isSuggestion || isError ? 1 : 0,
            borderColor: isError ? "rgba(241,153,153,0.22)" : isSuggestion ? auraTheme.borderSoft : "transparent",
            marginLeft: isSuggestion || isError ? 0 : 10,
            maxWidth: isSuggestion || isError ? "100%" : "74%",
          }}
        >
          {isSuggestion || isError ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: isError ? "#F1A4A4" : auraTheme.textFaint, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }}>
                {isError ? "AURA PAUSED" : "AURA NOTE"}
              </Text>
              <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: "600" }}>
                {displayText}
              </Text>
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>{displayText}</Text>
          )}
        </View>
      </Animated.View>
    );
  }

  if (isAuraText) {
    return (
      <Animated.View
        style={{
          opacity: fade,
          transform: [{ translateY: rise }, { scale }],
          alignItems: "stretch",
          marginRight: 10,
          marginLeft: 0,
          gap: 4,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginLeft: 2,
          }}
        >
          <Animated.View
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              backgroundColor: colors.auraLavender,
              shadowColor: colors.auraLavender,
              shadowOpacity: 0.24,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 0 },
              opacity: isStreamingPlaceholder ? pulse : 1,
            }}
          />
          <Text
            style={{
              color: auraTheme.textFaint,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 0.75,
              fontFamily: Fonts.sans,
            }}
          >
            AURA
          </Text>
        </View>

        {isStreamingPlaceholder ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginLeft: 2, minHeight: 24 }}>
            {[0, 1, 2].map((index) => (
              <Animated.View
                key={index}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.52)",
                  opacity:
                    index === 0
                      ? pulse
                      : index === 1
                        ? pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.7, 0.45] })
                        : pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.45, 0.8] }),
                }}
              />
            ))}
          </View>
        ) : displayText ? (
          <Text
            style={{
              color: colors.text,
              fontSize: 14.5,
              lineHeight: 21,
              fontWeight: "500",
              fontFamily: Fonts.sans,
              marginLeft: 2,
              maxWidth: "92%",
            }}
          >
            {displayText}
          </Text>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={{ opacity: fade, transform: [{ translateY: rise }, { scale }], alignItems: isUser ? "flex-end" : "flex-start" }}
    >
      {!isUser ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
            marginLeft: 10,
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              backgroundColor: auraTheme.accent,
              shadowColor: auraTheme.accent,
              shadowOpacity: 0.24,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
          <Text
            style={{
              color: auraTheme.textFaint,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 0.75,
              fontFamily: Fonts.sans,
            }}
          >
            AURA
          </Text>
        </View>
      ) : null}

      <View
          style={{
            maxWidth: isUserUrlOnly ? "68%" : isUser ? "74%" : isAuraText ? "76%" : "78%",
            borderRadius: 22,
            paddingHorizontal: isUser ? 13 : 15,
            paddingVertical: isUserUrlOnly ? 7 : isUser ? 8 : 10,
            backgroundColor: isUser ? "rgba(245,232,216,0.12)" : "rgba(17,20,26,0.86)",
            borderWidth: 1,
            borderColor: isUser ? "rgba(243,223,195,0.16)" : auraTheme.borderSoft,
            marginLeft: isUser ? 74 : layout.screenSize === "compact" ? 6 : 8,
            marginRight: isUser ? 6 : 28,
            ...auraShadow(isUser ? 0.18 : 0.14),
          }}
      >
        {isStreamingPlaceholder ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            {[0, 1, 2].map((index) => (
              <Animated.View
                key={index}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: "rgba(255,255,255,0.52)",
                  opacity: fade,
                }}
              />
            ))}
          </View>
        ) : (
          <>
            {message.attachments?.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: displayText ? 8 : 0 }}>
                {message.attachments.map((attachment) => (
                  <View
                    key={attachment.id}
                    style={{
                      width: 92,
                      height: 92,
                      borderRadius: 16,
                      overflow: "hidden",
                      backgroundColor: isUser ? "rgba(12,20,30,0.16)" : "rgba(255,255,255,0.06)",
                    }}
                  >
                    {attachment.type === "image" ? (
                      <Image
                        source={{ uri: attachment.localUri ?? attachment.uri }}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: isUser ? colors.text : colors.text, fontWeight: "800" }}>
                          Voice note
                        </Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : null}
            {formattedUserText ? (
              <Text
                numberOfLines={isUserUrlOnly ? 2 : undefined}
                ellipsizeMode={isUserUrlOnly ? "tail" : undefined}
                style={{
                  color: isUser ? colors.text : colors.text,
                  fontSize: 14.5,
                  lineHeight: 21,
                  fontWeight: isUser ? "700" : "500",
                  fontFamily: Fonts.sans,
                }}
              >
                {formattedUserText}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Animated.View>
  );
}

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
    prev.onAuraLaundryAction === next.onAuraLaundryAction,
);

function OutfitCardEntry({
  children,
}: {
  children: React.ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 16);

  useEffect(() => {
    void runHaptic("light");
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

  return <Reanimated.View style={entryStyle}>{children}</Reanimated.View>;
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
          marginLeft: compact ? 2 : 10,
        }}
      >
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 999,
            backgroundColor: colors.auraLavender,
            shadowColor: colors.auraLavender,
            shadowOpacity: 0.24,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
        <Text
          style={{
            color: auraTheme.textFaint,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 0.75,
            fontFamily: Fonts.sans,
          }}
        >
          AURA
        </Text>
      </View>

      <Text
        style={{
          color: colors.text,
          fontSize: 14.5,
          lineHeight: 21,
          fontWeight: "500",
          fontFamily: Fonts.sans,
          marginLeft: compact ? 2 : 8,
          marginRight: 20,
          maxWidth: compact ? "96%" : "84%",
        }}
      >
        {text}
      </Text>
    </View>
  );
}
