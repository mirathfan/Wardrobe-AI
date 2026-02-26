import { router } from "expo-router";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../src/hooks/useAuth";
import { db } from "../../src/lib/firebase";
import { listenToItems } from "../../src/lib/items";
import {
  OutfitIntent,
  OutfitSuggestion,
  generateOutfits,
} from "../../src/lib/outfitGenerator";
import { toDateKey } from "../../src/lib/outfits";
import { ClothingItem } from "../../src/types/ClothingItem";

const INTENT_ENDPOINT = process.env.EXPO_PUBLIC_OUTFIT_INTENT_URL;
const KNOWN_COLORS = [
  "black",
  "white",
  "blue",
  "navy",
  "green",
  "red",
  "grey",
  "gray",
  "beige",
  "brown",
  "pink",
  "purple",
  "yellow",
  "orange",
];

function norm(v: string) {
  return v.toLowerCase().trim();
}

function fallbackIntent(prompt: string): OutfitIntent {
  const p = norm(prompt);
  const colors = KNOWN_COLORS.filter((c) => p.includes(c));

  return {
    occasion: p.includes("work")
      ? "work"
      : p.includes("gym")
        ? "gym"
        : p.includes("date")
          ? "date"
          : undefined,
    vibe:
      p.includes("party") || p.includes("date") || p.includes("club")
        ? "party"
        : undefined,
    colorPreference: colors,
    includeOuterwear:
      p.includes("jacket") ||
      p.includes("hoodie") ||
      p.includes("coat") ||
      p.includes("outerwear"),
    includeAccessory:
      p.includes("accessory") ||
      p.includes("hat") ||
      p.includes("watch") ||
      p.includes("belt"),
    allowRewearToday: p.includes("reuse") || p.includes("rewear"),
    allowOverWearLimit:
      p.includes("don't care about wash") ||
      p.includes("dont care about wash") ||
      p.includes("ignore wash"),
  };
}

async function parseIntent(prompt: string): Promise<OutfitIntent> {
  if (!INTENT_ENDPOINT) {
    return fallbackIntent(prompt);
  }

  try {
    const response = await fetch(INTENT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      return fallbackIntent(prompt);
    }

    const data = (await response.json()) as OutfitIntent;
    return {
      occasion: data.occasion,
      vibe: data.vibe,
      colorPreference: Array.isArray(data.colorPreference)
        ? data.colorPreference.map((v) => String(v).toLowerCase())
        : undefined,
      includeOuterwear: !!data.includeOuterwear,
      includeAccessory: !!data.includeAccessory,
      allowRewearToday: !!data.allowRewearToday,
      allowOverWearLimit: !!data.allowOverWearLimit,
    };
  } catch {
    return fallbackIntent(prompt);
  }
}

function displayName(item: ClothingItem) {
  return item.name || `${item.primaryColor ?? ""} ${item.category}`.trim();
}

export default function AIScreen() {
  const INTENT_ENDPOINT = process.env.EXPO_PUBLIC_OUTFIT_INTENT_URL;

  console.log("AI URL:", INTENT_ENDPOINT);
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<OutfitSuggestion[]>([]);

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
      },
    );

    return () => unsub();
  }, [uid]);

  const itemsById = useMemo(() => {
    return new Map(items.map((i) => [i.id, i]));
  }, [items]);

  async function onGenerate() {
    if (!uid) {
      router.replace("/(auth)/login");
      return;
    }

    if (!prompt.trim()) {
      Alert.alert("Add a prompt", "Tell AI what you're dressing for.");
      return;
    }

    try {
      setLoading(true);
      const intent = await parseIntent(prompt);
      const next = generateOutfits(items, intent);
      setSuggestions(next);

      if (next.length === 0) {
        Alert.alert(
          "No valid outfits",
          "Try a broader prompt or wash/refresh some items.",
        );
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to generate outfits");
    } finally {
      setLoading(false);
    }
  }

  async function onSaveToToday(suggestion: OutfitSuggestion) {
    if (!uid) {
      router.replace("/(auth)/login");
      return;
    }

    try {
      setSavingId(suggestion.itemIds.join("|"));
      const dateKey = toDateKey(new Date());
      await setDoc(
        doc(db, "users", uid, "outfits", dateKey),
        {
          dateKey,
          itemIds: suggestion.itemIds,
          planned: true,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      Alert.alert("Saved", "Outfit saved to Today.", [
        {
          text: "View Today",
          onPress: () => router.push("/(tabs)/today"),
        },
        { text: "OK" },
      ]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save outfit");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: "800" }}>AI Outfits</Text>

      <TextInput
        value={prompt}
        onChangeText={setPrompt}
        placeholder="What are you dressing for?"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      />

      <Pressable
        onPress={onGenerate}
        disabled={loading}
        style={{
          paddingVertical: 12,
          borderRadius: 12,
          backgroundColor: "#111",
          alignItems: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900" }}>
          {loading ? "Generating..." : "Generate outfits"}
        </Text>
      </Pressable>

      {suggestions.map((s, idx) => (
        <View
          key={`${s.itemIds.join("|")}-${idx}`}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 14,
            padding: 12,
            gap: 10,
          }}
        >
          <Text style={{ fontWeight: "900", fontSize: 16 }}>{s.title}</Text>
          <Text style={{ color: "#666" }}>{s.reason}</Text>

          <View style={{ gap: 8 }}>
            {s.itemIds.map((itemId) => {
              const item = itemsById.get(itemId);
              if (!item) return null;
              const uri =
                item.photos?.cleanedThumbUrl ||
                item.photos?.cleanedUrl ||
                item.photos?.thumbUrl ||
                item.photos?.croppedUrl ||
                item.photos?.primaryUrl ||
                item.photoUrl ||
                item.photos?.urls?.[0] ||
                null;
              return (
                <View
                  key={itemId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    borderWidth: 1,
                    borderColor: "#eee",
                    borderRadius: 10,
                    padding: 8,
                  }}
                >
                  {uri ? (
                    <Image
                      source={{ uri }}
                      style={{ width: 48, height: 48, borderRadius: 8 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 8,
                        backgroundColor: "#f3f3f3",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 10, color: "#888" }}>
                        No photo
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "800" }}>
                      {displayName(item)}
                    </Text>
                    <Text style={{ color: "#666" }}>
                      {item.brand || "Unknown brand"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          <Pressable
            onPress={() => onSaveToToday(s)}
            disabled={savingId === s.itemIds.join("|")}
            style={{
              marginTop: 2,
              paddingVertical: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#111",
              alignItems: "center",
              opacity: savingId === s.itemIds.join("|") ? 0.6 : 1,
            }}
          >
            <Text style={{ fontWeight: "900" }}>
              {savingId === s.itemIds.join("|") ? "Saving..." : "Save to Today"}
            </Text>
          </Pressable>
        </View>
      ))}

      {suggestions.length === 0 && !loading ? (
        <Text style={{ color: "#666" }}>
          No suggestions yet. Enter a prompt to start.
        </Text>
      ) : null}
    </ScrollView>
  );
}
