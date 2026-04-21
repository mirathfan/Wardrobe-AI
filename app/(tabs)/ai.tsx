import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Alert,
  Keyboard,
  KeyboardEvent,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Fonts } from "@/constants/theme";
import AuraQuickChips from "@/src/components/ai/AuraQuickChips";
import ChatList from "@/src/components/ai/ChatList";
import InputBar from "@/src/components/ai/InputBar";
import type { AIMessage } from "@/src/components/ai/chatTypes";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { askAuraStream } from "@/src/lib/aura";
import { auraLookToPlannedOutfit, saveAuraLook } from "@/src/lib/auraLooks";
import { listenToItems } from "@/src/lib/items";
import {
  appendMessageToChat,
  createChatThread,
  loadChatMessages,
  loadLatestChatThread,
  loadRecentChatThreads,
  type AIChatThread,
} from "@/src/lib/aiChats";
import { clearLatestChatCache, loadLatestChatCache, saveLatestChatCache } from "@/src/lib/localChatCache";
import type { AuraResponse } from "@/src/types/aura";
import type { ClothingItem } from "@/src/types/ClothingItem";
import { savePlannedRecord } from "@/src/utils/dailyOutfits";

const DEFAULT_CHIPS = [
  "Build a casual look",
  "What should I buy first?",
  "Help me style this",
  "Give me style advice",
];

const STARTER_CARDS = [
  {
    title: "Build a casual look",
    subtitle: "Start from scratch or use what I already own",
    prompt: "Build a casual look",
  },
  {
    title: "What should I buy first?",
    subtitle: "Build a wardrobe that gets smarter fast",
    prompt: "What should I buy first to build a stronger wardrobe?",
  },
  {
    title: "Plan an outfit for tonight",
    subtitle: "Give me a sharp direction for tonight",
    prompt: "Plan an outfit for tonight",
  },
  {
    title: "Find gaps in my closet",
    subtitle: "Use what I own and show me what is missing",
    prompt: "Find gaps in my closet",
  },
];

const consumedPromptTokens = new Set<string>();
const consumedChatTokens = new Set<string>();
const DEFAULT_COMPOSER_HEIGHT = 70;

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

function createAssistantMessage(data: AuraResponse, overrides?: Partial<AIMessage>): AIMessage {
  const shouldUseCard =
    data.presentation === "card" ||
    !!data.look ||
    ((!!data.outfitItems?.length ||
      !!data.ownedPieces?.length ||
      !!data.recommendedAdditions?.length) &&
      (!!data.reason?.trim() || !!data.swapSuggestion?.trim()));
  return {
    id: overrides?.id ?? createMessageId(),
    type: "assistant",
    kind: shouldUseCard ? "aura_card" : "aura_text",
    text: data.reply,
    streaming: overrides?.streaming,
    aura: shouldUseCard ? data : undefined,
    createdAt: overrides?.createdAt ?? Date.now(),
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
  const latestMessagesRef = useRef<AIMessage[]>([]);
  const auraPulse = useRef(new Animated.Value(0)).current;
  const auraThinking = useRef(new Animated.Value(0)).current;
  const uid = user?.uid ?? null;
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

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
          const recent = await loadRecentChatThreads(uid, 6);
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
        const recent = await loadRecentChatThreads(uid, 6);
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
        console.log("[AURA] hydrate failed", error);
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
      if (!prompt || loading) return;

      const userMessage = createUserMessage(prompt);
      const nextLocalMessages = [...latestMessagesRef.current, userMessage];
      setMessages(nextLocalMessages);
      if (!override) setMessage("");
      setLoading(true);
      triggerThinkingPulse();
      const streamingMessageId = createMessageId();
      const streamingMessageCreatedAt = Date.now();

      let chatId = activeChatId;
      const startedAt = Date.now();

      try {
        if (!chatId) {
          const chat = await createChatThread(uid, prompt);
          chatId = chat.chatId;
          setActiveChatId(chat.chatId);
        }

        await appendMessageToChat(uid, chatId, userMessage, { titleFromUserText: prompt });

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
          history: buildAuraHistory(nextLocalMessages),
          },
          {
            onStatus: () => {
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
              setMessages((prev) =>
                prev.map((entry) =>
                  entry.id === streamingMessageId
                    ? createAssistantMessage(finalData, {
                        id: streamingMessageId,
                        createdAt: streamingMessageCreatedAt,
                        streaming: false,
                      })
                    : entry
                )
              );
            },
          }
        );
        const elapsed = Date.now() - startedAt;
        if (elapsed < 300) {
          await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
        }
        const assistantMessage = createAssistantMessage(result, {
          id: streamingMessageId,
          createdAt: streamingMessageCreatedAt,
          streaming: false,
        });
        setMessages((prev) =>
          prev.map((entry) => (entry.id === streamingMessageId ? assistantMessage : entry))
        );
        setQuickChips(result.chips?.length ? result.chips : DEFAULT_CHIPS);
        await appendMessageToChat(uid, chatId, assistantMessage);
        const recent = await loadRecentChatThreads(uid, 6);
        setRecentThreads(recent);
      } catch (error) {
        console.log("[AURA] ask failed", error);
        const fallback = createSystemMessage("AURA is offline right now.");
        setMessages((prev) => [
          ...prev.filter((entry) => entry.id !== streamingMessageId),
          fallback,
        ]);
        if (chatId) {
          await appendMessageToChat(uid, chatId, fallback);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeChatId, loading, message, triggerThinkingPulse, uid]
  );

  const handleAuraLookAction = React.useCallback(
    async (action: import("@/src/types/aura").AuraLookAction, sourceMessage: AIMessage) => {
      const look = sourceMessage.aura?.look;
      const promptBase = look?.lookTitle || sourceMessage.aura?.title || "this look";
      if (!look || !uid) return;
      if (action === "saveLook") {
        try {
          await saveAuraLook(uid, look, { title: sourceMessage.aura?.title });
          Alert.alert("Saved", "Look saved to your profile.");
        } catch (error: any) {
          Alert.alert("Save failed", error?.message ?? "Unable to save this look.");
        }
        return;
      }
      if (action === "planForToday") {
        try {
          await savePlannedRecord(uid, new Date(), auraLookToPlannedOutfit(look));
          Alert.alert("Planned", "This look is now attached to today.");
        } catch (error: any) {
          Alert.alert("Plan failed", error?.message ?? "Unable to plan this look for today.");
        }
        return;
      }
      if (action === "showMoreLikeThis") {
        void handleAsk(`Show me 3 more looks like ${promptBase}.`);
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
                  onPress: () => void handleAsk(`Turn ${promptBase} into a concise shopping brief for the missing pieces.`),
                },
              ]
            : [{ text: "Close", style: "cancel" }]
        );
        return;
      }
      if (action === "useOnlyMyCloset") {
        void handleAsk(`Rebuild ${promptBase} using only my closet.`);
        return;
      }
      if (action === "makeItDressier") {
        void handleAsk(`Make ${promptBase} dressier.`);
      }
    },
    [handleAsk, uid]
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
    outputRange: [1, 1.08],
  });
  const orbGlow = auraPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.34],
  });
  const thinkingScale = auraThinking.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const thinkingGlow = auraThinking.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.18],
  });
  const restingComposerBottom = Math.max(10, layout.composerOffset - 18);
  const isComposerActive = isComposerFocused || keyboardHeight > 0;
  const composerBottom = keyboardHeight > 0 ? keyboardHeight + 6 : restingComposerBottom;
  const composerContentPadding =
    composerBottom + composerHeight + Math.max(layout.bottomDockPadding * 0.48, insets.bottom + 34);
  const starterCardsPadding = composerBottom + composerHeight + 28 + Math.max(0, insets.bottom - 8);

  return (
    <LinearGradient
      colors={["#050607", "#0a0f14", "#070b10"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1, paddingTop: layout.topContentInset }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(143,216,255,0.12)", "rgba(143,216,255,0.03)", "transparent"]}
        start={{ x: 0.7, y: 0 }}
        end={{ x: 0.3, y: 0.6 }}
        style={{
          position: "absolute",
          top: -40,
          right: -20,
          width: 280,
          height: 220,
          borderRadius: 220,
        }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(111,191,255,0.08)", "transparent"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={{
          position: "absolute",
          bottom: 120,
          left: -40,
          width: 240,
          height: 180,
          borderRadius: 200,
        }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(143,216,255,0.08)", "rgba(14,18,24,0.02)", "transparent"]}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 280,
        }}
      />
      <View
        style={{
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: 10,
          gap: 12,
        }}
      >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              paddingVertical: 2,
            }}
          >
            <Pressable
              onPress={() => {
                if (!recentThreads.length || !uid) {
                  Alert.alert("AURA", "No recent chats yet.");
                  return;
                }
                Alert.alert(
                  "Recent chats",
                  undefined,
                  [
                    ...recentThreads.slice(0, 5).map((thread) => ({
                      text: thread.title || "AURA chat",
                      onPress: async () => {
                        const threadMessages = await loadChatMessages(uid, thread.chatId);
                        setMessages(threadMessages);
                        setActiveChatId(thread.chatId);
                        await saveLatestChatCache(uid, thread.chatId, thread.threadId, threadMessages);
                      },
                    })),
                    { text: "Cancel", style: "cancel" as const },
                  ]
                );
              }}
              style={({ pressed }) => ({
                width: 52,
                height: 52,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
                shadowColor: "#000",
                shadowOpacity: 0.16,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                opacity: pressed ? 0.84 : 1,
              })}
            >
              <Ionicons name="reorder-two-outline" size={24} color={colors.text} />
            </Pressable>

            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                height: 48,
                maxWidth: 236,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.055)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
                shadowColor: "#000",
                shadowOpacity: 0.14,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 5 },
                position: "relative",
              }}
            >
              <View
                style={{
                  position: "absolute",
                  left: 18,
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "visible",
                }}
              >
                <Animated.View
                  style={{
                    position: "absolute",
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: "rgba(111,191,255,0.68)",
                    opacity: orbGlow,
                    transform: [{ scale: orbScale }],
                  }}
                />
                <Animated.View
                  style={{
                    position: "absolute",
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    backgroundColor: "rgba(143,216,255,0.34)",
                    opacity: thinkingGlow,
                    transform: [{ scale: thinkingScale }],
                  }}
                />
                <Animated.View style={{ transform: [{ scale: orbScale }] }}>
                  <LinearGradient
                    colors={["rgba(209,241,255,0.98)", "rgba(143,216,255,0.44)"]}
                    start={{ x: 0.15, y: 0.1 }}
                    end={{ x: 0.85, y: 0.9 }}
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 999,
                    }}
                  />
                </Animated.View>
              </View>

              <Text
                style={{
                  color: colors.text,
                  fontSize: 16.5 * layout.titleScale,
                  fontWeight: "600",
                  letterSpacing: -0.25,
                  fontFamily: Fonts.sans,
                  textAlign: "center",
                }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                AURA
              </Text>
            </View>

            <Pressable
              onPress={() => {
                setMessage("");
                setMessages([]);
                setActiveChatId(null);
                setQuickChips(DEFAULT_CHIPS);
                if (uid) {
                  void clearLatestChatCache(uid);
                }
              }}
              style={({ pressed }) => ({
                width: 52,
                height: 52,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.06)",
                shadowColor: "#000",
                shadowOpacity: 0.16,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Ionicons name="create-outline" size={20} color={colors.text} />
            </Pressable>
          </View>

          {messages.length === 0 ? null : (
            <AuraQuickChips chips={heroChips.slice(0, 4)} onPress={(chip) => void handleAsk(chip)} />
          )}
      </View>

      {messages.length === 0 && !loading && !isBooting && !message.trim() ? (
        <View style={{ flex: 1, justifyContent: "flex-end", paddingBottom: starterCardsPadding }}>
          <View
            style={{
              paddingHorizontal: layout.horizontalPadding,
              marginBottom: 18,
              gap: 8,
            }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.44)",
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 1,
                fontFamily: Fonts.sans,
              }}
            >
              AURA
            </Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 28,
                lineHeight: 32,
                fontWeight: "700",
                letterSpacing: -0.8,
                fontFamily: Fonts.sans,
                maxWidth: 320,
              }}
            >
              Talk through a look, ask a style question, or just start chatting.
            </Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.56)",
                fontSize: 14.5,
                lineHeight: 21,
                fontFamily: Fonts.sans,
                maxWidth: 330,
              }}
            >
              AURA can build looks, help you shop smarter, style a piece, or use your closet when it has something to work with.
            </Text>
          </View>

          <AuraQuickChips
            variant="cards"
            items={STARTER_CARDS}
            onPress={(chip) => void handleAsk(chip)}
          />
        </View>
      ) : (
        <ChatList
          colors={colors}
          messages={messages}
          itemsById={itemsById}
          savingId={null}
          loading={loading}
          contentBottomPadding={Math.max(96, composerContentPadding)}
          emptyState={<View style={{ height: 4 }} />}
          onSaveOutfit={() => {}}
          onMoreLikeThis={(outfit) => {
            if (outfit.reason) void handleAsk(`Refine this direction: ${outfit.reason}`);
          }}
          onSwapOutfit={(outfit) => {
            if (outfit.reason) void handleAsk(`Keep the mood, but swap one piece: ${outfit.reason}`);
          }}
          onAuraAction={handleAuraLookAction}
        />
      )}

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
        onPlusPress={() => Alert.alert("AURA", "Image styling is coming soon.")}
      />
    </LinearGradient>
  );
}
