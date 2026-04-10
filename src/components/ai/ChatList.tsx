import React, { useEffect, useRef } from "react";
import { Animated, FlatList, NativeScrollEvent, NativeSyntheticEvent, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import type { ClothingItem } from "@/src/types/ClothingItem";

import ChatMessage from "./ChatMessage";
import type { AIMessage } from "./chatTypes";
import type { AuraLookAction } from "@/src/types/aura";

function TypingBubble({ colors }: { colors: AppColors }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ alignItems: "flex-start" }}>
      <View
        style={{
          borderRadius: 22,
          paddingHorizontal: 16,
          paddingVertical: 14,
          backgroundColor: "rgba(255,255,255,0.034)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
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
  emptyState,
  onSaveOutfit,
  onMoreLikeThis,
  onSwapOutfit,
  onAuraAction,
}: {
  colors: AppColors;
  messages: AIMessage[];
  itemsById: Map<string, ClothingItem>;
  savingId: string | null;
  loading: boolean;
  memoryHint?: string | null;
  contentBottomPadding: number;
  emptyState?: React.ReactElement;
  onSaveOutfit: (outfitId: string) => void;
  onMoreLikeThis: (outfit: import("./chatTypes").ChatOutfit) => void;
  onSwapOutfit: (outfit: import("./chatTypes").ChatOutfit) => void;
  onAuraAction?: (action: AuraLookAction, message: AIMessage) => void;
}) {
  const listRef = useRef<FlatList<AIMessage>>(null);
  const previousCountRef = useRef(messages.length);
  const hasStreamingMessage = messages.some((message) => message.streaming);
  const shouldPinToBottomRef = useRef(true);
  const lastMessage = messages[messages.length - 1];
  const showTypingBubble =
    loading &&
    !hasStreamingMessage &&
    !!lastMessage &&
    lastMessage.type === "user";

  function scrollToLatest(animated: boolean) {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - (contentOffset.y + layoutMeasurement.height);
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

  return (
    <FlatList
      ref={listRef}
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
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "flex-end",
        paddingTop: 22,
        paddingHorizontal: 2,
        paddingBottom: Math.max(20, contentBottomPadding + 8),
        gap: 18,
      }}
      contentInset={{ bottom: Math.max(8, contentBottomPadding * 0.35) }}
      scrollIndicatorInsets={{ bottom: contentBottomPadding + 12 }}
      ListEmptyComponent={emptyState ?? null}
      renderItem={({ item }) => (
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
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 18 }} />}
      ListFooterComponent={
        showTypingBubble ? (
          <View style={{ marginTop: 18, marginLeft: 10, gap: 12 }}>
            <TypingBubble colors={colors} />
            <View style={{ height: Math.max(28, contentBottomPadding + 6) }} />
          </View>
        ) : (
          <View style={{ height: Math.max(28, contentBottomPadding + 10) }} />
        )
      }
      showsVerticalScrollIndicator={false}
    />
  );
}
