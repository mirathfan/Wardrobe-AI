import React, { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";

import { Fonts, type AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";

import AuraReplyCard from "./AuraReplyCard";
import OutfitMessage from "./OutfitMessage";
import type { AIMessage } from "./chatTypes";
import type { AuraLookAction } from "@/src/types/aura";

export default function ChatMessage({
  colors,
  message,
  itemsById,
  savingId,
  memoryHint,
  onSaveOutfit,
  onMoreLikeThis,
  onSwapOutfit,
  onAuraAction,
}: {
  colors: AppColors;
  message: AIMessage;
  itemsById: Map<string, ClothingItem>;
  savingId: string | null;
  memoryHint?: string | null;
  onSaveOutfit: (outfitId: string) => void;
  onMoreLikeThis: (outfit: import("./chatTypes").ChatOutfit) => void;
  onSwapOutfit: (outfit: import("./chatTypes").ChatOutfit) => void;
  onAuraAction?: (action: AuraLookAction, message: AIMessage) => void;
}) {
  const layout = useResponsiveLayout();
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, rise]);

  if (message.type === "outfit" && message.outfits?.length) {
    return (
      <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }], gap: 14 }}>
        {message.outfits.map((outfit, index) => (
          <OutfitMessage
            key={`${message.id}-${outfit.id}-${index}`}
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
    );
  }

  if (message.kind === "aura_card" && message.aura) {
    const isLookSurface = !!message.aura.look;
    return (
      <Animated.View
        style={{
          opacity: fade,
          transform: [{ translateY: rise }],
          alignItems: "stretch",
          marginLeft: isLookSurface ? 4 : 8,
          marginRight: isLookSurface ? 4 : 24,
        }}
      >
        <View style={{ maxWidth: isLookSurface ? "100%" : "82%", marginLeft: isLookSurface ? 0 : 8 }}>
          <AuraReplyCard
            data={message.aura}
            itemsById={itemsById}
            onAction={onAuraAction ? (action) => onAuraAction(action, message) : undefined}
          />
        </View>
      </Animated.View>
    );
  }

  if (message.type === "system/action") {
    const displayText = sanitizeDisplayText(message.text);
    const isSuggestion =
      (displayText ?? "").startsWith("Try this today:") ||
      (displayText ?? "").startsWith("Stylist note:");
    return (
      <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }], alignItems: isSuggestion ? "stretch" : "center" }}>
        <View
          style={{
            borderRadius: isSuggestion ? 18 : 999,
            paddingHorizontal: isSuggestion ? 16 : 14,
            paddingVertical: isSuggestion ? 14 : 8,
            backgroundColor: isSuggestion ? "rgba(255,255,255,0.045)" : "rgba(255,255,255,0.06)",
            borderWidth: isSuggestion ? 1 : 0,
            borderColor: isSuggestion ? "rgba(255,255,255,0.06)" : "transparent",
          }}
        >
          {isSuggestion ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: "rgba(255,255,255,0.54)", fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }}>
                AURA NOTE
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

  const isUser = message.kind === "user_text" || message.type === "user";
  const isAuraText = message.kind === "aura_text";
  const displayText = isUser ? message.text : sanitizeDisplayText(message.text);
  const isStreamingPlaceholder = !isUser && !!message.streaming && !displayText;

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }], alignItems: isUser ? "flex-end" : "flex-start" }}>
      {!isUser ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 8,
            marginLeft: 10,
          }}
        >
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 999,
              backgroundColor: colors.aiAccent,
              shadowColor: colors.aiAccent,
              shadowOpacity: 0.45,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 0 },
            }}
          />
          <Text
            style={{
              color: "rgba(255,255,255,0.38)",
              fontSize: 10.5,
              fontWeight: "700",
              letterSpacing: 0.9,
              fontFamily: Fonts.sans,
            }}
          >
            AURA
          </Text>
        </View>
      ) : null}
      <View
        style={{
          maxWidth: isUser ? "76%" : isAuraText ? "74%" : "78%",
          borderRadius: isUser ? 24 : 22,
          paddingHorizontal: isUser ? 16 : 15,
          paddingVertical: isUser ? 12 : 12,
          backgroundColor: isUser ? colors.aiAccent : "rgba(255,255,255,0.032)",
          borderWidth: isUser ? 0 : 1,
          borderColor: isUser ? "transparent" : "rgba(255,255,255,0.05)",
          marginLeft: isUser ? 52 : layout.screenSize === "compact" ? 8 : 10,
          marginRight: isUser ? 6 : 30,
          shadowColor: "#000",
          shadowOpacity: isUser ? 0.18 : 0.1,
          shadowRadius: isUser ? 12 : 10,
          shadowOffset: { width: 0, height: 8 },
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
          <Text
            style={{
              color: isUser ? "#0f1420" : colors.text,
              fontSize: isAuraText ? 15.5 : 15.5,
              lineHeight: isAuraText ? 23 : 23,
              fontWeight: isUser ? "700" : "500",
              fontFamily: Fonts.sans,
            }}
          >
            {displayText}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}
