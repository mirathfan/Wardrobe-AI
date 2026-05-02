import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraCandidateAction, AuraLaundryConfirmationAction, AuraLookAction, AuraLookOptionMeta, AuraOutfitPhotoAction } from "@/src/types/aura";

import ChatMessage from "./ChatMessage";
import type { AIMessage } from "./chatTypes";
import { auraTheme } from "./aiTheme";

const FOLLOW_DISTANCE_THRESHOLD = 96;
const FOCUS_MESSAGE_VIEW_POSITION = 0.05;
const FOCUS_MESSAGE_VIEW_OFFSET = 10;
const FOCUS_ANCHOR_SPACER_RATIO = 1.04;
const FOCUS_ANCHOR_MIN_SPACER = 520;
const FOCUS_ANCHOR_LOCK_MS = 520;

const ChatItemSeparator = React.memo(function ChatItemSeparator() {
  return <View style={{ height: 12 }} />;
});

class ChatErrorBoundary extends React.Component<
  { children: React.ReactNode; colors: AppColors; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const { colors } = this.props;
    return (
      <View style={{ alignItems: "flex-start", paddingHorizontal: 8 }}>
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceGlass,
            paddingHorizontal: 14,
            paddingVertical: 11,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>
            Couldn't render this message.
          </Text>
        </View>
      </View>
    );
  }
}

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
  focusMessageId,
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
  focusMessageId?: string | null;
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
  const shouldFollowRef = useRef(true);
  const focusAnchorActiveRef = useRef(false);
  const userInteractingRef = useRef(false);
  const streamingScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToIndexRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusAnchorReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listViewportHeight, setListViewportHeight] = React.useState(0);
  const [activeFocusAnchorId, setActiveFocusAnchorId] = React.useState<string | null>(null);
  const messageCount = messages.length;
  const lastMessage = messages[messages.length - 1];
  const lastMessageId = lastMessage?.id ?? null;
  const showTypingBubble = loading && !hasStreamingMessage && !!lastMessage && lastMessage.type === "user";
  const focusedMessageIndex = useMemo(
    () => (focusMessageId ? messages.findIndex((message) => message.id === focusMessageId) : -1),
    [focusMessageId, messages],
  );
  const isFocusAnchoring =
    !!focusMessageId &&
    activeFocusAnchorId === focusMessageId &&
    focusedMessageIndex >= 0 &&
    loading;
  const focusAnchorSpacer = isFocusAnchoring
    ? Math.max(contentBottomPadding, listViewportHeight * FOCUS_ANCHOR_SPACER_RATIO, FOCUS_ANCHOR_MIN_SPACER)
    : 0;

  const scrollToBottom = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const scrollToBottomIfFollowing = useCallback(
    (animated: boolean) => {
      if (!shouldFollowRef.current) return;
      scrollToBottom(animated);
    },
    [scrollToBottom],
  );

  const scrollToFocusedMessage = useCallback((index: number, animated: boolean) => {
    if (index < 0) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index,
        animated,
        viewPosition: FOCUS_MESSAGE_VIEW_POSITION,
        viewOffset: FOCUS_MESSAGE_VIEW_OFFSET,
      });
    });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    const nearBottom = distanceFromBottom < FOLLOW_DISTANCE_THRESHOLD;
    if (userInteractingRef.current || nearBottom) {
      shouldFollowRef.current = nearBottom;
    }
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    userInteractingRef.current = true;
    focusAnchorActiveRef.current = false;
    if (focusAnchorReleaseTimerRef.current) {
      clearTimeout(focusAnchorReleaseTimerRef.current);
      focusAnchorReleaseTimerRef.current = null;
    }
    setActiveFocusAnchorId(null);
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    userInteractingRef.current = false;
  }, []);

  const handleMomentumScrollBegin = useCallback(() => {
    userInteractingRef.current = true;
    focusAnchorActiveRef.current = false;
    if (focusAnchorReleaseTimerRef.current) {
      clearTimeout(focusAnchorReleaseTimerRef.current);
      focusAnchorReleaseTimerRef.current = null;
    }
    setActiveFocusAnchorId(null);
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    userInteractingRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (streamingScrollTimerRef.current) {
        clearTimeout(streamingScrollTimerRef.current);
      }
      if (scrollToIndexRetryRef.current) {
        clearTimeout(scrollToIndexRetryRef.current);
      }
      if (focusAnchorReleaseTimerRef.current) {
        clearTimeout(focusAnchorReleaseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const shouldAnimate = messageCount >= previousCountRef.current;
    previousCountRef.current = messageCount;
    if (isFocusAnchoring) {
      const timer = setTimeout(() => scrollToFocusedMessage(focusedMessageIndex, false), 30);
      return () => clearTimeout(timer);
    }
    if (focusMessageId && focusedMessageIndex >= 0 && lastMessageId === focusMessageId) {
      return;
    }
    const timer = setTimeout(() => {
      scrollToBottomIfFollowing(shouldAnimate && !hasStreamingMessage);
    }, 30);
    return () => clearTimeout(timer);
  }, [
    focusMessageId,
    focusedMessageIndex,
    hasStreamingMessage,
    isFocusAnchoring,
    lastMessageId,
    loading,
    messageCount,
    scrollToBottomIfFollowing,
    scrollToFocusedMessage,
  ]);

  useEffect(() => {
    if (!focusMessageId || focusedMessageIndex < 0) return;
    focusAnchorActiveRef.current = true;
    shouldFollowRef.current = false;
    setActiveFocusAnchorId(focusMessageId);
    if (focusAnchorReleaseTimerRef.current) {
      clearTimeout(focusAnchorReleaseTimerRef.current);
    }
    const focusTimer = setTimeout(() => scrollToFocusedMessage(focusedMessageIndex, true), 50);
    focusAnchorReleaseTimerRef.current = setTimeout(() => {
      focusAnchorActiveRef.current = false;
      focusAnchorReleaseTimerRef.current = null;
    }, FOCUS_ANCHOR_LOCK_MS);
    return () => clearTimeout(focusTimer);
  }, [focusMessageId, focusedMessageIndex, scrollToFocusedMessage]);

  useEffect(() => {
    if (loading || !activeFocusAnchorId) return;
    focusAnchorActiveRef.current = false;
    if (focusAnchorReleaseTimerRef.current) {
      clearTimeout(focusAnchorReleaseTimerRef.current);
      focusAnchorReleaseTimerRef.current = null;
    }
    shouldFollowRef.current = false;
    setActiveFocusAnchorId(null);
  }, [activeFocusAnchorId, loading]);

  useEffect(() => {
    if (!messageCount) return;
    const timer = setTimeout(() => scrollToBottomIfFollowing(false), 140);
    return () => clearTimeout(timer);
  }, [autoScrollSignal, messageCount, scrollToBottomIfFollowing]);

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

  const scrollIndicatorInsets = useMemo(
    () => ({ bottom: Math.max(8, contentBottomPadding - 8) }),
    [contentBottomPadding],
  );

  const handleContentSizeChange = useCallback(() => {
    if (isFocusAnchoring) {
      return;
    }
    if (shouldFollowRef.current) {
      if (hasStreamingMessage) {
        if (streamingScrollTimerRef.current) return;
        streamingScrollTimerRef.current = setTimeout(() => {
          streamingScrollTimerRef.current = null;
          scrollToBottomIfFollowing(false);
        }, 80);
        return;
      }
      scrollToBottomIfFollowing(false);
    }
  }, [hasStreamingMessage, isFocusAnchoring, scrollToBottomIfFollowing]);

  const handleListLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);
    setListViewportHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
  }, []);

  const handleScrollToIndexFailed = useCallback(
    (info: { averageItemLength: number; index: number }) => {
      if (scrollToIndexRetryRef.current) {
        clearTimeout(scrollToIndexRetryRef.current);
      }
      const offset = Math.max(0, info.averageItemLength * info.index - FOCUS_MESSAGE_VIEW_OFFSET);
      listRef.current?.scrollToOffset({ offset, animated: true });
      scrollToIndexRetryRef.current = setTimeout(() => {
        scrollToIndexRetryRef.current = null;
        scrollToFocusedMessage(info.index, true);
      }, 120);
    },
    [scrollToFocusedMessage],
  );

  const keyExtractor = useCallback((item: AIMessage) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: AIMessage }) => {
      return (
        <ChatErrorBoundary colors={colors} resetKey={`${item.id}:${item.createdAt ?? ""}:${item.streaming ? "streaming" : "done"}`}>
          <View>
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
        </ChatErrorBoundary>
      );
    },
    [
      colors,
      itemsById,
      memoryHint,
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
    () => {
      if (!showTypingBubble && !focusAnchorSpacer) return null;
      return (
        <View>
          {showTypingBubble ? (
            <View style={{ marginTop: 10, marginLeft: 10, marginBottom: 8 }}>
              <TypingBubble colors={colors} />
            </View>
          ) : null}
          {focusAnchorSpacer ? <View style={{ height: focusAnchorSpacer }} /> : null}
        </View>
      );
    },
    [colors, focusAnchorSpacer, showTypingBubble],
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
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onMomentumScrollBegin={handleMomentumScrollBegin}
      onMomentumScrollEnd={handleMomentumScrollEnd}
      scrollEventThrottle={16}
      onContentSizeChange={handleContentSizeChange}
      onLayout={handleListLayout}
      onScrollToIndexFailed={handleScrollToIndexFailed}
      contentContainerStyle={contentContainerStyle}
      scrollIndicatorInsets={scrollIndicatorInsets}
      ListEmptyComponent={emptyState ?? null}
      renderItem={renderItem}
      ItemSeparatorComponent={ChatItemSeparator}
      ListFooterComponent={listFooter}
      removeClippedSubviews={false}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      updateCellsBatchingPeriod={40}
      windowSize={7}
      showsVerticalScrollIndicator={false}
    />
  );
}
