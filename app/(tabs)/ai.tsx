import { router } from "expo-router";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../src/hooks/useAuth";
import { app, db } from "../../src/lib/firebase";
import { getItemImageUrl } from "../../src/lib/itemImage";
import { listenToItems } from "../../src/lib/items";
import { clearLatestChatCache, loadLatestChatCache, saveLatestChatCache } from "../../src/lib/localChatCache";
import { toDateKey } from "../../src/lib/outfits";
import { ClothingItem } from "../../src/types/ClothingItem";

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

export default function AIScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
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
      await setDoc(
        doc(db, "users", uid, "outfits", dateKey),
        {
          dateKey,
          itemIds,
          planned: true,
          updatedAt: serverTimestamp(),
        },
        {merge: true}
      );
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
          borderColor: "#ddd",
          borderRadius: 14,
          padding: 12,
          gap: 10,
          backgroundColor: "#fff",
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
          <Text style={{color: "#666"}}>Score {outfit.score.toFixed(2)}</Text>
        </View>

        <Text style={{color: "#666"}}>{outfit.reason}</Text>

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
                      backgroundColor: "#f2f2f2",
                    }}
                  />
                )}

                <View style={{flex: 1}}>
                  <Text style={{fontWeight: "700"}}>
                    {slot.replace(/_/g, " ")}
                  </Text>
                  <Text>{displayName(item)}</Text>
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
            borderColor: "#111",
            alignItems: "center",
            opacity: savingId === outfit.id ? 0.6 : 1,
          }}
        >
          <Text style={{fontWeight: "800", color: "#111"}}>
            {savingId === outfit.id ? "Saving..." : "Save to Today"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{flex: 1, padding: 16, gap: 12}}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={{fontSize: 22, fontWeight: "800"}}>Outfit Chat AI</Text>
        <Pressable onPress={startNewChat}>
          <Text style={{fontWeight: "800", color: "#111"}}>New chat</Text>
        </Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{gap: 12, paddingBottom: 12}}
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
                backgroundColor: item.role === "user" ? "#111" : "#f5f5f5",
                borderRadius: 16,
                padding: 12,
              }}
            >
              <Text style={{color: item.role === "user" ? "#fff" : "#111"}}>
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
              borderColor: "#e5e5e5",
              borderRadius: 16,
              padding: 14,
              backgroundColor: "#fafafa",
            }}
          >
            <Text style={{color: "#666"}}>
              Ask for an outfit like “Give me 3 casual black looks for cold Chicago weather.”
            </Text>
          </View>
        }
      />

      {loading ? (
        <Text style={{color: "#666", fontWeight: "700"}}>Thinking…</Text>
      ) : null}

      <View style={{flexDirection: "row", flexWrap: "wrap", gap: 8}}>
        {quickChips.map((chip) => (
          <Pressable
            key={chip}
            onPress={() => onChipPress(chip)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "#ddd",
              backgroundColor: "#fff",
            }}
          >
            <Text style={{fontWeight: "700", color: "#111"}}>{chip}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{flexDirection: "row", gap: 8, alignItems: "flex-end"}}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask for an outfit, a swap, or a tweak"
          multiline
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 14,
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
            backgroundColor: "#111",
            opacity: loading || !input.trim() ? 0.6 : 1,
          }}
        >
          <Text style={{color: "#fff", fontWeight: "900"}}>Send</Text>
        </Pressable>
      </View>
    </View>
  );
}
