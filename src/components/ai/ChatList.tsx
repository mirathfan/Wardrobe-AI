import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, FlatList, NativeScrollEvent, NativeSyntheticEvent, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraCandidateAction, AuraLaundryConfirmationAction, AuraLookAction, AuraLookOptionMeta, AuraOutfitPhotoAction } from "@/src/types/aura";

import ChatMessage from "./ChatMessage";
import type { AIMessage } from "./chatTypes";
import { auraTheme } from "./aiTheme";

const ChatItemSeparator = React.memo(function ChatItemSeparator() {
  return <View style={{ height: 12 }} />;
});

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
  onAuraOutfitPhotoAction,
  onAuraLaundryAction,
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
  onAuraOutfitPhotoAction?: (action: AuraOutfitPhotoAction, message: AIMessage) => void;
  onAuraLaundryAction?: (action: AuraLaundryConfirmationAction, message: AIMessage) => void;
}) {
  const listRef = useRef<FlatList<AIMessage>>(null);
  const previousCountRef = useRef(messages.length);
  const hasStreamingMessage = useMemo(() => messages.some((message) => message.streaming), [messages]);
  const shouldPinToBottomRef = useRef(true);
  const previousBottomPaddingRef = useRef(contentBottomPadding);
  const streamingScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageCount = messages.length;
  const lastMessage = messages[messages.length - 1];
  const lastMessageId = lastMessage?.id ?? null;
  const showTypingBubble = loading && !hasStreamingMessage && !!lastMessage && lastMessage.type === "user";

  const scrollToLatest = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    shouldPinToBottomRef.current = distanceFromBottom < 72;
  }, []);

  useEffect(() => {
    return () => {
      if (streamingScrollTimerRef.current) {
        clearTimeout(streamingScrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const shouldAnimate = messageCount >= previousCountRef.current;
    previousCountRef.current = messageCount;
    const timer = setTimeout(() => {
      if (shouldPinToBottomRef.current || hasStreamingMessage) {
        scrollToLatest(shouldAnimate && !hasStreamingMessage);
      }
    }, 30);
    return () => clearTimeout(timer);
  }, [hasStreamingMessage, lastMessageId, loading, messageCount, scrollToLatest]);

  useEffect(() => {
    const paddingDelta = Math.abs(contentBottomPadding - previousBottomPaddingRef.current);
    previousBottomPaddingRef.current = contentBottomPadding;
    if (!messageCount || paddingDelta < 8) return;

    shouldPinToBottomRef.current = true;
    const timer = setTimeout(() => scrollToLatest(false), 90);
    return () => clearTimeout(timer);
  }, [contentBottomPadding, messageCount, scrollToLatest]);

  useEffect(() => {
    if (!messageCount) return;
    shouldPinToBottomRef.current = true;
    const timers = [
      setTimeout(() => scrollToLatest(false), 140),
      setTimeout(() => scrollToLatest(false), 420),
    ];
    return () => timers.forEach(clearTimeout);
  }, [autoScrollSignal, messageCount, scrollToLatest]);

  const contentContainerStyle = useMemo(
    () => ({
      flexGrow: 1,
      justifyContent: messageCount ? ("flex-start" as const) : ("flex-end" as const),
      paddingTop: 0,
      paddingHorizontal: 4,
      paddingBottom: Math.max(12, contentBottomPadding),
    }),
    [contentBottomPadding, messageCount],
  );

  const contentInset = useMemo(
    () => ({ bottom: Math.max(4, contentBottomPadding * 0.18) }),
    [contentBottomPadding],
  );

  const scrollIndicatorInsets = useMemo(
    () => ({ bottom: contentBottomPadding + 6 }),
    [contentBottomPadding],
  );

  const handleContentSizeChange = useCallback(() => {
    if (shouldPinToBottomRef.current || hasStreamingMessage) {
      if (hasStreamingMessage) {
        if (streamingScrollTimerRef.current) return;
        streamingScrollTimerRef.current = setTimeout(() => {
          streamingScrollTimerRef.current = null;
          scrollToLatest(false);
        }, 80);
        return;
      }
      scrollToLatest(false);
    }
  }, [hasStreamingMessage, scrollToLatest]);

  const handleLayout = useCallback(() => {
    if (messageCount && (shouldPinToBottomRef.current || hasStreamingMessage)) {
      scrollToLatest(false);
    }
  }, [hasStreamingMessage, messageCount, scrollToLatest]);

  const keyExtractor = useCallback((item: AIMessage) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: { item: AIMessage; index: number }) => {
      const isLastMessage = index === messageCount - 1;
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
            onAuraOutfitPhotoAction={onAuraOutfitPhotoAction}
            onAuraLaundryAction={onAuraLaundryAction}
          />
        </View>
      );
    },
    [
      colors,
      contentBottomPadding,
      itemsById,
      memoryHint,
      messageCount,
      onAuraAction,
      onAuraCandidateAction,
      onAuraLaundryAction,
      onAuraOutfitPhotoAction,
      onMoreLikeThis,
      onSaveOutfit,
      onSwapOutfit,
      savingId,
    ],
  );

  const listFooter = useMemo(
    () =>
      showTypingBubble ? (
        <View style={{ marginTop: 10, marginLeft: 10, gap: 8 }}>
          <TypingBubble colors={colors} />
          <View style={{ height: Math.max(96, contentBottomPadding * 0.58) }} />
        </View>
      ) : (
        <View style={{ height: Math.max(112, contentBottomPadding * 0.5) }} />
      ),
    [colors, contentBottomPadding, showTypingBubble],
  );

  return (
    <FlatList
      ref={listRef}
      style={{ flex: 1 }}
      data={messages}
      keyExtractor={keyExtractor}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onContentSizeChange={handleContentSizeChange}
      onLayout={handleLayout}
      contentContainerStyle={contentContainerStyle}
      contentInset={contentInset}
      scrollIndicatorInsets={scrollIndicatorInsets}
      ListEmptyComponent={emptyState ?? null}
      renderItem={renderItem}
      ItemSeparatorComponent={ChatItemSeparator}
      ListFooterComponent={listFooter}
      removeClippedSubviews
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={40}
      windowSize={7}
      showsVerticalScrollIndicator={false}
    />
  );
}
