import { router } from "expo-router";
import { getFunctions, httpsCallable } from "firebase/functions";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { app } from "@/src/lib/firebase";
import { getItemImageUrl } from "@/src/lib/itemImage";
import { listenToItems } from "@/src/lib/items";
import { clearLatestChatCache, loadLatestChatCache, saveLatestChatCache } from "@/src/lib/localChatCache";
import { savePlannedOutfit } from "@/src/utils/dailyOutfits";
import { toDateKey } from "@/src/lib/outfits";
import { ClothingItem } from "@/src/types/ClothingItem";
import { dockSpace } from "@/src/constants/dock";

type ChatOutfit = {
  id: string;
  picks: {slot: string; itemId: string}[];
  score: number;
  reason: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  outfits?: ChatOutfit[];
};

type OutfitChatResponse = {
  threadId: string;
  assistantMessage: {text: string};
  outfits?: ChatOutfit[];
};

function displayName(item: ClothingItem) {
  return item.name || `${item.primaryColor ?? ""} ${item.category}`.trim();
}

function buildItemsByCategory(outfit: ChatOutfit) {
  const outerwear = outfit.picks.find((pick) => pick.slot === "outerwear")?.itemId;
  const top = outfit.picks.find((pick) => pick.slot === "top")?.itemId;
  const bottom = outfit.picks.find((pick) => pick.slot === "bottom")?.itemId;
  const shoes = outfit.picks.find((pick) => pick.slot === "footwear")?.itemId;

  return {
    ...(outerwear ? { outerwear } : {}),
    ...(top ? { top } : {}),
    ...(bottom ? { bottom } : {}),
    ...(shoes ? { shoes } : {}),
  };
}

export default function AIScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const uid = user?.uid ?? null;
  const insets = useSafeAreaInsets();
  const bottomDockSpace = dockSpace(insets.bottom);
  const composerBottom = bottomDockSpace + 10;
  const composerHeight = 142;
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const quickChips = useMemo(
    () => ["warmer", "more formal", "swap shoes", "2 outfits", "5 outfits"],
    []
  );

  React.useEffect(() => {
    if (!uid) {
      setItems([]);
      router.replace("/(auth)/login");
      return;
    }

    const unsub = listenToItems(
      uid,
      (next) => setItems(next as ClothingItem[]),
      {
        status: "ALL",
        sort: "NEWEST",
        onError: (message) => Alert.alert("Firestore error", message),
      }
    );

    return () => unsub();
  }, [uid]);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await loadLatestChatCache<ChatMessage>();
      if (!active || !cached) return;
      setThreadId(cached.threadId);
      setMessages(Array.isArray(cached.messages) ? cached.messages : []);
    })();

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    void saveLatestChatCache(threadId, messages);
  }, [threadId, messages]);

  const itemsById = useMemo(() => {
    return new Map(items.map((item) => [item.id, item]));
  }, [items]);

  function startNewChat() {
    setThreadId(null);
    setMessages([]);
    setInput("");
    requestIdRef.current += 1;
    void clearLatestChatCache();
  }

  async function onSend() {
    if (!uid) {
      router.replace("/(auth)/login");
      return;
    }

    const message = input.trim();
    if (!message) return;

    const pendingId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const token = requestIdRef.current + 1;
    requestIdRef.current = token;

    setMessages((prev) => [
      ...prev,
      {id: pendingId, role: "user", text: message},
    ]);
    setInput("");
    setLoading(true);

    try {
      const functions = getFunctions(app);
      const chat = httpsCallable<
        {threadId?: string; message: string},
        OutfitChatResponse
      >(functions, "outfitChatV1");
      const result = await chat({
        ...(threadId ? {threadId} : {}),
        message,
      });

      if (token !== requestIdRef.current) {
        return;
      }

      const nextThreadId = String(result.data?.threadId ?? "").trim() || null;
      if (nextThreadId) {
        setThreadId(nextThreadId);
      }
      const assistantText =
        String(result.data?.assistantMessage?.text ?? "").trim() ||
        "I’m ready for the next outfit request.";
      const outfits = Array.isArray(result.data?.outfits) ? result.data.outfits : undefined;
      setMessages((prev) => [
        ...prev,
        {
          id: `${pendingId}-assistant`,
          role: "assistant",
          text: assistantText,
          ...(outfits && outfits.length > 0 ? {outfits} : {}),
        },
      ]);
    } catch (e: any) {
      if (token === requestIdRef.current) {
        Alert.alert("Error", e?.message ?? "Failed to chat with Outfit AI");
      }
    } finally {
      if (token === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  function onChipPress(chip: string) {
    if (loading) return;
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${chip}` : chip));
  }

  async function onSaveToToday(outfit: ChatOutfit) {
    if (!uid) {
      router.replace("/(auth)/login");
      return;
    }

    try {
      setSavingId(outfit.id);
      const dateKey = toDateKey(new Date());
      const itemIds = outfit.picks.map((pick) => pick.itemId);
      await savePlannedOutfit(uid, dateKey, itemIds, {
        plannedOutfit: {
          itemsByCategory: buildItemsByCategory(outfit),
          score: outfit.score,
          reasons: [outfit.reason],
          createdAt: Date.now(),
        },
      });
      Alert.alert("Saved", "Outfit saved to Today.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save outfit");
    } finally {
      setSavingId(null);
    }
  }

  function renderOutfitCard(outfit: ChatOutfit, index: number) {
    const pickedItems = outfit.picks
      .map((pick) => ({
        slot: pick.slot,
        item: itemsById.get(pick.itemId),
      }))
      .filter((value): value is {slot: string; item: ClothingItem} => !!value.item);

    return (
      <View
        key={`${outfit.id}-${index}`}
        style={{
          marginTop: 10,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          padding: 12,
          gap: 10,
          backgroundColor: colors.card,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text style={{fontSize: 16, fontWeight: "800"}}>Outfit {index + 1}</Text>
          <Text style={{color: colors.textSecondary}}>Score {outfit.score.toFixed(2)}</Text>
        </View>

        <Text style={{color: colors.textSecondary}}>{outfit.reason}</Text>

        <View style={{gap: 10}}>
          {pickedItems.map(({slot, item}) => {
            const imageUri = getItemImageUrl(item, {variant: "thumb"});
            return (
              <View
                key={`${outfit.id}-${slot}-${item.id}`}
                style={{flexDirection: "row", gap: 10, alignItems: "center"}}
              >
                {imageUri ? (
                  <Image
                    source={{uri: imageUri}}
                    style={{width: 56, height: 56, borderRadius: 10}}
                  />
                ) : (
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      backgroundColor: colors.muted,
                    }}
                  />
                )}

                <View style={{flex: 1}}>
                  <Text style={{fontWeight: "700", color: colors.text}}>
                    {slot.replace(/_/g, " ")}
                  </Text>
                  <Text style={{ color: colors.text }}>{displayName(item)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => void onSaveToToday(outfit)}
          disabled={savingId === outfit.id}
          style={{
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.accent,
            alignItems: "center",
            opacity: savingId === outfit.id ? 0.6 : 1,
          }}
        >
          <Text style={{fontWeight: "800", color: colors.text}}>
            {savingId === outfit.id ? "Saving..." : "Save to Today"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1, gap: 12 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={bottomDockSpace}
      >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{fontSize: 22, fontWeight: "800", color: colors.text}}>Outfit Chat AI</Text>
        <Pressable onPress={startNewChat}>
          <Text style={{fontWeight: "800", color: colors.text}}>New chat</Text>
        </Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{gap: 12, paddingBottom: composerHeight + bottomDockSpace + 16}}
        renderItem={({item}) => (
          <View
            style={{
              alignSelf: item.role === "user" ? "flex-end" : "stretch",
              maxWidth: item.role === "user" ? "85%" : "100%",
            }}
          >
            <View
              style={{
                alignSelf: item.role === "user" ? "flex-end" : "stretch",
                backgroundColor: item.role === "user" ? colors.accent : colors.card,
                borderRadius: 16,
                padding: 12,
              }}
            >
              <Text style={{color: item.role === "user" ? "#fff" : colors.text}}>
                {item.text}
              </Text>
            </View>
            {item.role === "assistant"
              ? item.outfits?.map((outfit, index) => renderOutfitCard(outfit, index))
              : null}
          </View>
        )}
        ListEmptyComponent={
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 14,
              backgroundColor: colors.card,
            }}
          >
            <Text style={{color: colors.textSecondary}}>
              Ask for an outfit like “Give me 3 casual black looks for cold Chicago weather.”
            </Text>
          </View>
        }
      />

      {loading ? (
        <Text style={{color: colors.textSecondary, fontWeight: "700"}}>Thinking…</Text>
      ) : null}

      <View
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: composerBottom,
          borderRadius: 18,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 10,
          gap: 8,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        }}
      >
        <View style={{flexDirection: "row", flexWrap: "wrap", gap: 8}}>
          {quickChips.map((chip) => (
            <Pressable
              key={chip}
              onPress={() => onChipPress(chip)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.input,
              }}
            >
              <Text style={{fontWeight: "700", color: colors.text, fontSize: 12}}>{chip}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{flexDirection: "row", gap: 8, alignItems: "flex-end"}}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask for an outfit, a swap, or a tweak"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              color: colors.text,
              backgroundColor: colors.input,
              paddingHorizontal: 12,
              paddingVertical: 10,
              maxHeight: 120,
            }}
          />
          <Pressable
            onPress={() => void onSend()}
            disabled={loading || !input.trim()}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: colors.accent,
              opacity: loading || !input.trim() ? 0.6 : 1,
            }}
          >
            <Text style={{color: "#fff", fontWeight: "900"}}>Send</Text>
          </Pressable>
        </View>
      </View>
      </KeyboardAvoidingView>
    </View>
  );
}
