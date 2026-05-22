import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { AuraSkeletonLine } from "@/src/components/ui/AuraSkeleton";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraCandidateAction, AuraLaundryConfirmationAction, AuraLookAction, AuraLookOptionMeta, AuraOutfitPhotoAction } from "@/src/types/aura";

import ChatMessage from "./ChatMessage";
import type { AIMessage } from "./chatTypes";

const FOLLOW_DISTANCE_THRESHOLD = 96;
const FOCUS_MESSAGE_VIEW_POSITION = 0;
const FOCUS_MESSAGE_VIEW_OFFSET = 8;
const FOCUS_ANCHOR_SPACER_RATIO = 1.12;
const FOCUS_ANCHOR_MIN_SPACER = 560;
const FOCUS_ANCHOR_LOCK_MS = 680;

const ChatItemSeparator = React.memo(function ChatItemSeparator() {
  return <View style={{ height: 16 }} />;
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
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
            {"Couldn't render this message."}
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
    <View style={{ alignItems: "flex-start", paddingHorizontal: 10 }}>
      <View
        style={{
          borderRadius: 20,
          paddingHorizontal: 14,
          paddingVertical: 11,
          backgroundColor: colors.surfaceMuted,
          borderWidth: 0.75,
          borderColor: colors.borderSoft,
          gap: 9,
          width: 178,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {[0, 1, 2].map((index) => (
            <Animated.View
              key={index}
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                backgroundColor: colors.textSecondary,
                opacity: pulse.interpolate({
                  inputRange: [0.45, 1],
                  outputRange: [0.3 + index * 0.12, 0.82 - index * 0.1],
                }),
              }}
            />
          ))}
        </View>
        <AuraSkeletonLine width="72%" height={8} />
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
  refreshing = false,
  onRefresh,
  onSaveOutfit,
  onMoreLikeThis,
  onSwapOutfit,
  onAuraAction,
  onAuraCandidateAction,
  onAuraOutfitPhotoAction,
  onAuraLaundryAction,
  onRetryAuraResponse,
  onMessageLongPress,
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
  refreshing?: boolean;
  onRefresh?: () => void;
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
  onRetryAuraResponse?: (message: AIMessage) => void;
  onMessageLongPress?: (message: AIMessage) => void;
}) {
  const listRef = useRef<FlatList<AIMessage>>(null);
  const previousCountRef = useRef(messages.length);
  const hasStreamingMessage = useMemo(() => messages.some((message) => message.streaming), [messages]);
  const shouldFollowRef = useRef(true);
  const focusAnchorActiveRef = useRef(false);
  const userInteractingRef = useRef(false);
  const streamingScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToIndexRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusAnchorReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoScrollKeyRef = useRef<string | null>(null);
  const lastInsetScrollKeyRef = useRef<string | null>(null);
  const dismissedFocusMessageIdRef = useRef<string | null>(null);
  const loadingRef = useRef(loading);
  const messagesRef = useRef(messages);
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
  const hasFocusedMessage = !!focusMessageId && focusedMessageIndex >= 0;
  const isFocusAnchoring =
    hasFocusedMessage &&
    loading &&
    dismissedFocusMessageIdRef.current !== focusMessageId;
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

  const scrollToFocusedMessage = useCallback((messageId: string | null | undefined, animated: boolean) => {
    if (!messageId) return;
    requestAnimationFrame(() => {
      const currentMessages = messagesRef.current;
      const index = currentMessages.findIndex((message) => message.id === messageId);
      if (index < 0 || index >= currentMessages.length) return;
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
    dismissedFocusMessageIdRef.current = focusMessageId ?? activeFocusAnchorId;
    if (focusAnchorReleaseTimerRef.current) {
      clearTimeout(focusAnchorReleaseTimerRef.current);
      focusAnchorReleaseTimerRef.current = null;
    }
    setActiveFocusAnchorId(null);
  }, [activeFocusAnchorId, focusMessageId]);

  const handleScrollEndDrag = useCallback(() => {
    userInteractingRef.current = false;
  }, []);

  const handleMomentumScrollBegin = useCallback(() => {
    userInteractingRef.current = true;
    focusAnchorActiveRef.current = false;
    dismissedFocusMessageIdRef.current = focusMessageId ?? activeFocusAnchorId;
    if (focusAnchorReleaseTimerRef.current) {
      clearTimeout(focusAnchorReleaseTimerRef.current);
      focusAnchorReleaseTimerRef.current = null;
    }
    setActiveFocusAnchorId(null);
  }, [activeFocusAnchorId, focusMessageId]);

  const handleMomentumScrollEnd = useCallback(() => {
    userInteractingRef.current = false;
  }, []);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (streamingScrollTimerRef.current) {
        clearTimeout(streamingScrollTimerRef.current);
      }
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
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
      const timer = setTimeout(() => scrollToFocusedMessage(focusMessageId, false), 30);
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
    dismissedFocusMessageIdRef.current = null;
    focusAnchorActiveRef.current = true;
    shouldFollowRef.current = false;
    setActiveFocusAnchorId(focusMessageId);
    if (focusAnchorReleaseTimerRef.current) {
      clearTimeout(focusAnchorReleaseTimerRef.current);
    }
    const focusTimer = setTimeout(() => scrollToFocusedMessage(focusMessageId, true), 50);
    focusAnchorReleaseTimerRef.current = setTimeout(() => {
      if (loadingRef.current) return;
      focusAnchorActiveRef.current = false;
      focusAnchorReleaseTimerRef.current = null;
      if (!userInteractingRef.current) {
        shouldFollowRef.current = true;
        setActiveFocusAnchorId(null);
        scrollToBottom(false);
      }
    }, FOCUS_ANCHOR_LOCK_MS);
    return () => clearTimeout(focusTimer);
  }, [focusMessageId, focusedMessageIndex, scrollToBottom, scrollToFocusedMessage]);

  useEffect(() => {
    if (loading || !activeFocusAnchorId) return;
    focusAnchorActiveRef.current = false;
    if (focusAnchorReleaseTimerRef.current) {
      clearTimeout(focusAnchorReleaseTimerRef.current);
      focusAnchorReleaseTimerRef.current = null;
    }
    shouldFollowRef.current = true;
    setActiveFocusAnchorId(null);
    const timer = setTimeout(() => {
      if (!userInteractingRef.current) scrollToBottom(false);
    }, 80);
    return () => clearTimeout(timer);
  }, [activeFocusAnchorId, loading, scrollToBottom]);

  useEffect(() => {
    if (!autoScrollSignal || !messageCount || !lastMessageId || !listViewportHeight) return;
    if (isFocusAnchoring) return;
    const autoScrollKey = [
      autoScrollSignal,
      lastMessageId,
      messageCount,
      Math.round(contentBottomPadding),
      Math.round(listViewportHeight),
    ].join(":");
    if (lastAutoScrollKeyRef.current === autoScrollKey) return;
    lastAutoScrollKeyRef.current = autoScrollKey;
    if (autoScrollTimerRef.current) {
      clearTimeout(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
    const frame = requestAnimationFrame(() => {
      autoScrollTimerRef.current = setTimeout(() => {
        autoScrollTimerRef.current = null;
        if (userInteractingRef.current) return;
        shouldFollowRef.current = true;
        scrollToBottom(false);
      }, 80);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (autoScrollTimerRef.current) {
        clearTimeout(autoScrollTimerRef.current);
        autoScrollTimerRef.current = null;
      }
    };
  }, [
    autoScrollSignal,
    contentBottomPadding,
    isFocusAnchoring,
    lastMessageId,
    listViewportHeight,
    messageCount,
    scrollToBottom,
  ]);

  useEffect(() => {
    if (!messageCount || !lastMessageId || !listViewportHeight) return;
    if (isFocusAnchoring || userInteractingRef.current || !shouldFollowRef.current) return;
    const insetScrollKey = [
      lastMessageId,
      messageCount,
      Math.round(contentBottomPadding),
      Math.round(listViewportHeight),
    ].join(":");
    if (lastInsetScrollKeyRef.current === insetScrollKey) return;
    lastInsetScrollKeyRef.current = insetScrollKey;
    const timer = setTimeout(() => {
      if (userInteractingRef.current || !shouldFollowRef.current) return;
      scrollToBottom(false);
    }, 90);
    return () => clearTimeout(timer);
  }, [
    contentBottomPadding,
    isFocusAnchoring,
    lastMessageId,
    listViewportHeight,
    messageCount,
    scrollToBottom,
  ]);

  const contentContainerStyle = useMemo(
    () => ({
      flexGrow: 1,
      justifyContent: messageCount ? ("flex-start" as const) : ("flex-end" as const),
      paddingTop: messageCount ? 14 : 0,
      paddingHorizontal: 6,
      paddingBottom: Math.max(18, contentBottomPadding),
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
      const currentMessages = messagesRef.current;
      if (info.index < 0 || info.index >= currentMessages.length) {
        scrollToIndexRetryRef.current = null;
        scrollToBottomIfFollowing(false);
        return;
      }
      const retryMessageId = currentMessages[info.index]?.id;
      if (!retryMessageId) return;
      const offset = Math.max(0, info.averageItemLength * info.index - FOCUS_MESSAGE_VIEW_OFFSET);
      listRef.current?.scrollToOffset({ offset, animated: true });
      scrollToIndexRetryRef.current = setTimeout(() => {
        scrollToIndexRetryRef.current = null;
        scrollToFocusedMessage(retryMessageId, true);
      }, 120);
    },
    [scrollToBottomIfFollowing, scrollToFocusedMessage],
  );

  const keyExtractor = useCallback((item: AIMessage) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: AIMessage }) => {
      return (
        <ChatErrorBoundary colors={colors} resetKey={`${item.id}:${item.createdAt ?? ""}:${item.streaming ? "streaming" : "done"}`}>
          <Pressable
            delayLongPress={260}
            onLongPress={() => onMessageLongPress?.(item)}
            disabled={!onMessageLongPress}
          >
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
              onRetryAuraResponse={onRetryAuraResponse}
            />
          </Pressable>
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
      onRetryAuraResponse,
      onMessageLongPress,
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
            <View style={{ marginTop: 12, marginBottom: 10 }}>
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
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.ctaCream}
            colors={[colors.ctaCream]}
            progressBackgroundColor={colors.background}
          />
        ) : undefined
      }
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
