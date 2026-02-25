import { router, useLocalSearchParams } from "expo-router";
import { deleteDoc, deleteField, doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ALLOWED_COLORS } from "../../../src/shared/wardrobeTaxonomy";
import { useAuth } from "../../../src/hooks/useAuth";
import { db } from "../../../src/lib/firebase";
import {
  markWashed as markWashedItem,
  safeMarkWorn,
  sendToLaundry,
} from "../../../src/lib/items";
import { ClothingItem } from "../../../src/types/ClothingItem";

type ItemDetails = ClothingItem & {
  id: string;
};

function formatDate(value?: any | null) {
  if (!value) return "—";
  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleDateString();
  }
  if (typeof value === "number") {
    return new Date(value).toLocaleDateString();
  }
  return "—";
}

function ingestionStatusLabel(item: ItemDetails) {
  const status = item.ingestion?.status ?? "pending";
  if (status === "done") return "done";
  if (status === "failed") return "failed";
  if (status === "processing") return "processing";
  return "pending";
}

function toTitleCase(value: string) {
  if (!value) return value;
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

export default function ItemDetailsScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = useMemo(() => (Array.isArray(id) ? id[0] : id), [id]);

  const [item, setItem] = useState<ItemDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [colorSaving, setColorSaving] = useState(false);
  const [colorSavedAt, setColorSavedAt] = useState<number | null>(null);
  const itemImageUri = item?.photoUrl || item?.photoUri || null;

  useEffect(() => {
    if (!uid || !itemId) {
      if (!uid) router.replace("/(auth)/login");
      return;
    }

    const ref = doc(db, "users", uid, "items", itemId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setItem(null);
        } else {
          setItem({ id: snap.id, ...(snap.data() as any) });
        }
        setLoading(false);
      },
      (err) => {
        console.log(err);
        Alert.alert("Error", err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [itemId, uid]);

  async function onMarkWorn() {
    if (!uid || !itemId) return router.replace("/(auth)/login");
    if (item?.status === "IN_LAUNDRY") return;

    try {
      setActionLoading(true);
      await safeMarkWorn(uid, itemId);
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to mark item as worn");
    } finally {
      setActionLoading(false);
    }
  }

  async function onSendToLaundry() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    try {
      setActionLoading(true);
      await sendToLaundry(uid, itemId);
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to send item to laundry");
    } finally {
      setActionLoading(false);
    }
  }

  function onConfirmWashed() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    Alert.alert("Mark as washed?", "This will reset wear count and make item available.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark washed",
        onPress: async () => {
          try {
            setActionLoading(true);
            await markWashedItem(uid, itemId);
          } catch (e: any) {
            console.log(e);
            Alert.alert("Error", e?.message ?? "Failed to mark item as washed");
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }

  async function onDelete() {
    if (!uid || !itemId) return router.replace("/(auth)/login");

    Alert.alert(
      "Delete item?",
      "This will remove the item from your wardrobe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, "users", uid, "items", itemId));
              router.back();
            } catch (e: any) {
              console.log(e);
              Alert.alert("Error", e?.message ?? "Failed to delete");
            }
          },
        },
      ]
    );
  }

  function onEdit() {
    router.push({
      pathname: "/(tabs)/add",
      params: { editId: itemId },
    });
  }

  async function onSelectColor(color: string) {
    if (!uid || !itemId) return router.replace("/(auth)/login");
    try {
      setColorSaving(true);
      await updateDoc(doc(db, "users", uid, "items", itemId), {
        colors: [color],
        colorLabel: toTitleCase(color),
        primaryColor: toTitleCase(color),
        colorSource: "user",
        colorUpdatedAt: Date.now(),
      });
      setColorSavedAt(Date.now());
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to save color");
    } finally {
      setColorSaving(false);
    }
  }

  async function onResetToAI() {
    if (!uid || !itemId) return router.replace("/(auth)/login");
    try {
      setColorSaving(true);
      await updateDoc(doc(db, "users", uid, "items", itemId), {
        colorSource: "ai",
        colorUpdatedAt: Date.now(),
        "ingestion.status": "pending",
        "ingestion.lastProcessedPhotoHash": deleteField(),
      });
      setColorSavedAt(Date.now());
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to reset AI color");
    } finally {
      setColorSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pressable onPress={() => router.back()} style={pill}>
            <Text style={pillText}>Back</Text>
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: "900" }}>Item</Text>
          <View style={{ width: 56 }} />
        </View>

        {loading ? (
          <Text>Loading…</Text>
        ) : !item ? (
          <Text>Item not found.</Text>
        ) : (
          <>
            <View style={card}>
              {itemImageUri ? (
                <Image
                  source={{ uri: itemImageUri }}
                  style={{ width: "100%", height: 260, borderRadius: 14 }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ height: 260, borderRadius: 14, backgroundColor: "#f3f3f3", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#777", fontWeight: "800" }}>No photo</Text>
                </View>
              )}

              <View style={{ gap: 6, marginTop: 12 }}>
                <Text style={{ fontSize: 20, fontWeight: "900" }}>
                  {item.name || `${item.primaryColor ?? ""} ${item.category}`}
                </Text>
                <Text style={{ color: "#444", fontWeight: "700" }}>{item.brand}</Text>

                <Text style={{ color: "#666" }}>
                  Category: {item.category}
                </Text>
                {item.subCategory ? (
                  <Text style={{ color: "#666" }}>Sub-category: {item.subCategory}</Text>
                ) : null}

                {item.colorLabel || item.colors?.length ? (
                  <Text style={{ color: "#666" }}>
                    Colors: {item.colorLabel || item.colors?.join(" / ") || "—"}
                  </Text>
                ) : null}
                {(() => {
                  const ingestionStatus = ingestionStatusLabel(item);
                  if (ingestionStatus === "done") {
                    return (
                      <View style={{ marginTop: 4, gap: 2 }}>
                        <Text style={{ color: "#0a7", fontWeight: "800" }}>
                          Ingestion: Complete
                        </Text>
                        <Text style={{ color: "#666" }}>
                          Extracted: {item.category ?? "—"} / {item.subCategory ?? "—"}
                        </Text>
                        <Text style={{ color: "#666" }}>
                          Colors: {item.colorLabel || item.colors?.join(", ") || "—"}
                        </Text>
                        <Text style={{ color: "#666" }}>
                          Source: {item.colorSource || "ai"}
                        </Text>
                      </View>
                    );
                  }
                  if (ingestionStatus === "failed") {
                    return (
                      <Text style={{ color: "#d11", fontWeight: "700" }}>
                        Couldn&apos;t analyze, you can edit manually
                      </Text>
                    );
                  }
                  return (
                    <Text style={{ color: "#666", fontWeight: "700" }}>
                      Analyzing…
                    </Text>
                  );
                })()}

                {item.status ? <Text style={{ color: "#666" }}>Status: {item.status}</Text> : null}
                <Text style={{ color: "#666" }}>
                  Wears since wash: {item.wearCountSinceWash ?? 0}
                </Text>
                <Text style={{ color: "#666" }}>Last worn: {formatDate(item.lastWornDate)}</Text>
                <Text style={{ color: "#666" }}>Last washed: {formatDate(item.lastWashedDate)}</Text>

                {item.size ? <Text style={{ color: "#666" }}>Size: {item.size}</Text> : null}
                {typeof item.price === "number" ? <Text style={{ color: "#666" }}>Price: {item.price}</Text> : null}
                {item.purchaseDate ? <Text style={{ color: "#666" }}>Purchase date: {item.purchaseDate}</Text> : null}
                {item.notes ? <Text style={{ color: "#666" }}>Notes: {item.notes}</Text> : null}

                {ingestionStatusLabel(item) === "done" ? (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <Text style={{ color: "#222", fontWeight: "800" }}>
                      Correct color
                    </Text>
                    <Text style={{ color: "#666" }}>
                      Detected: {item.colorLabel || item.colors?.join(" / ") || "—"}. Tap to correct:
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      {ALLOWED_COLORS.map((color) => {
                        const isSelected = (item.colors?.[0] || "").toLowerCase() === color;
                        return (
                          <Pressable
                            key={color}
                            onPress={() => onSelectColor(color)}
                            disabled={colorSaving}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: isSelected ? "#111" : "#ddd",
                              backgroundColor: isSelected ? "#111" : "#fff",
                              opacity: colorSaving ? 0.65 : 1,
                            }}
                          >
                            <Text style={{ color: isSelected ? "#fff" : "#111", fontWeight: "700" }}>
                              {toTitleCase(color)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {item.colorSource === "user" ? (
                      <Pressable
                        onPress={onResetToAI}
                        disabled={colorSaving}
                        style={{
                          alignSelf: "flex-start",
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: "#aaa",
                          opacity: colorSaving ? 0.65 : 1,
                        }}
                      >
                        <Text style={{ color: "#333", fontWeight: "700" }}>Reset to AI</Text>
                      </Pressable>
                    ) : null}
                    {colorSavedAt ? (
                      <Text style={{ color: "#0a7", fontSize: 12, fontWeight: "700" }}>Saved</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={onMarkWorn}
                  disabled={actionLoading || item.status === "IN_LAUNDRY"}
                  style={[
                    btn,
                    { backgroundColor: "#111" },
                    actionLoading || item.status === "IN_LAUNDRY" ? { opacity: 0.5 } : null,
                  ]}
                >
                  <Text style={[btnText, { color: "#fff" }]}>Mark as Worn</Text>
                </Pressable>
                <Pressable
                  onPress={onSendToLaundry}
                  disabled={actionLoading}
                  style={[btn, { borderColor: "#111", borderWidth: 1 }, actionLoading ? { opacity: 0.6 } : null]}
                >
                  <Text style={[btnText, { color: "#111" }]}>Send to Laundry</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={onConfirmWashed}
                  disabled={actionLoading}
                  style={[btn, { borderColor: "#0a7", borderWidth: 1 }, actionLoading ? { opacity: 0.6 } : null]}
                >
                  <Text style={[btnText, { color: "#0a7" }]}>Mark as Washed</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable onPress={onEdit} style={[btn, { backgroundColor: "#111" }]}>
                  <Text style={[btnText, { color: "#fff" }]}>Edit</Text>
                </Pressable>
                <Pressable onPress={onDelete} style={[btn, { borderColor: "#d11", borderWidth: 1 }]}>
                  <Text style={[btnText, { color: "#d11" }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const card = {
  borderWidth: 1,
  borderColor: "#eee",
  borderRadius: 16,
  padding: 12,
  backgroundColor: "#fff",
} as const;

const btn = {
  flex: 1,
  paddingVertical: 14,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
} as const;

const btnText = {
  fontWeight: "900",
  fontSize: 16,
} as const;

const pill = {
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "#ddd",
} as const;

const pillText = {
  fontWeight: "900",
} as const;
