import React, { useEffect, useRef } from "react";
import { Animated, FlatList, NativeScrollEvent, NativeSyntheticEvent, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraCandidateAction, AuraLookAction, AuraLookOptionMeta } from "@/src/types/aura";

import ChatMessage from "./ChatMessage";
import type { AIMessage } from "./chatTypes";
import { auraTheme } from "./aiTheme";

function TypingBubble({ colors }: { colors: AppColors }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 560, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 560, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ alignItems: "flex-start" }}>
      <View
        style={{
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 11,
          backgroundColor: auraTheme.surface,
          borderWidth: 1,
          borderColor: auraTheme.borderSoft,
          flexDirection: "row",
          gap: 8,
        }}
      >
        {[0, 1, 2].map((index) => (
          <Animated.View
            key={index}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: colors.textSecondary,
              opacity: pulse,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export default function ChatList({
  colors,
  messages,
  itemsById,
  savingId,
  loading,
  memoryHint,
  contentBottomPadding,
  autoScrollSignal = 0,
  emptyState,
  onSaveOutfit,
  onMoreLikeThis,
  onSwapOutfit,
  onAuraAction,
  onAuraCandidateAction,
}: {
  colors: AppColors;
  messages: AIMessage[];
  itemsById: Map<string, ClothingItem>;
  savingId: string | null;
  loading: boolean;
  memoryHint?: string | null;
  contentBottomPadding: number;
  autoScrollSignal?: number;
  emptyState?: React.ReactElement;
  onSaveOutfit: (outfitId: string) => void;
  onMoreLikeThis: (outfit: import("./chatTypes").ChatOutfit) => void;
  onSwapOutfit: (outfit: import("./chatTypes").ChatOutfit) => void;
  onAuraAction?: (
    action: AuraLookAction,
    message: AIMessage,
    look?: import("@/src/types/aura").AuraLook,
    lookOption?: AuraLookOptionMeta,
  ) => void;
  onAuraCandidateAction?: (action: AuraCandidateAction, message: AIMessage) => void;
}) {
  const listRef = useRef<FlatList<AIMessage>>(null);
  const previousCountRef = useRef(messages.length);
  const hasStreamingMessage = messages.some((message) => message.streaming);
  const shouldPinToBottomRef = useRef(true);
  const previousBottomPaddingRef = useRef(contentBottomPadding);
  const lastMessage = messages[messages.length - 1];
  const showTypingBubble = loading && !hasStreamingMessage && !!lastMessage && lastMessage.type === "user";

  function scrollToLatest(animated: boolean) {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    shouldPinToBottomRef.current = distanceFromBottom < 72;
  }

  useEffect(() => {
    const shouldAnimate = messages.length >= previousCountRef.current;
    previousCountRef.current = messages.length;
    const timer = setTimeout(() => {
      if (shouldPinToBottomRef.current || hasStreamingMessage) {
        scrollToLatest(shouldAnimate && !hasStreamingMessage);
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [hasStreamingMessage, loading, messages]);

  useEffect(() => {
    const paddingDelta = Math.abs(contentBottomPadding - previousBottomPaddingRef.current);
    previousBottomPaddingRef.current = contentBottomPadding;
    if (!messages.length || paddingDelta < 8) return;

    shouldPinToBottomRef.current = true;
    const timer = setTimeout(() => scrollToLatest(false), 90);
    return () => clearTimeout(timer);
  }, [contentBottomPadding, messages.length]);

  useEffect(() => {
    if (!messages.length) return;
    shouldPinToBottomRef.current = true;
    const timers = [
      setTimeout(() => scrollToLatest(false), 140),
      setTimeout(() => scrollToLatest(false), 420),
    ];
    return () => timers.forEach(clearTimeout);
  }, [autoScrollSignal, messages.length]);

  return (
    <FlatList
      ref={listRef}
      style={{ flex: 1 }}
      data={messages}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onContentSizeChange={() => {
        if (shouldPinToBottomRef.current || hasStreamingMessage) {
          scrollToLatest(false);
        }
      }}
      onLayout={() => {
        if (messages.length && (shouldPinToBottomRef.current || hasStreamingMessage)) {
          scrollToLatest(false);
        }
      }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: messages.length ? "flex-start" : "flex-end",
        paddingTop: 0,
        paddingHorizontal: 4,
        paddingBottom: Math.max(12, contentBottomPadding),
        gap: 12,
      }}
      contentInset={{ bottom: Math.max(4, contentBottomPadding * 0.18) }}
      scrollIndicatorInsets={{ bottom: contentBottomPadding + 6 }}
      ListEmptyComponent={emptyState ?? null}
      renderItem={({ item, index }) => {
        const isLastMessage = index === messages.length - 1;
        const hasOutfitActions =
          (item.kind === "aura_card" && !!(item.aura?.look || item.aura?.lookOptions?.length)) ||
          (item.type === "outfit" && !!item.outfits?.length);
        const finalOutfitSpacer =
          isLastMessage && hasOutfitActions ? Math.max(148, contentBottomPadding * 0.5) : 0;

        return (
          <View style={{ paddingBottom: finalOutfitSpacer }}>
            <ChatMessage
              colors={colors}
              message={item}
              itemsById={itemsById}
              savingId={savingId}
              memoryHint={memoryHint}
              onSaveOutfit={onSaveOutfit}
              onMoreLikeThis={onMoreLikeThis}
              onSwapOutfit={onSwapOutfit}
              onAuraAction={onAuraAction}
              onAuraCandidateAction={onAuraCandidateAction}
            />
          </View>
        );
      }}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListFooterComponent={
        showTypingBubble ? (
          <View style={{ marginTop: 10, marginLeft: 10, gap: 8 }}>
            <TypingBubble colors={colors} />
            <View style={{ height: Math.max(96, contentBottomPadding * 0.58) }} />
          </View>
        ) : (
          <View style={{ height: Math.max(112, contentBottomPadding * 0.5) }} />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}
