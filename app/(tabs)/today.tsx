import { router } from "expo-router";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Image, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../src/hooks/useAuth";
import { db } from "../../src/lib/firebase";
import { getItemImageUrl } from "../../src/lib/itemImage";
import { MAX_WEARS_BEFORE_WASH, toCanonicalCategory } from "../../src/lib/items";
import { toDateKey } from "../../src/lib/outfits";
import { ClothingItem } from "../../src/types/ClothingItem";
import { dockSpace } from "../constants/dock";

type OutfitDoc = {
  dateKey: string;
  itemIds: string[];
  planned: boolean;
  updatedAt?: any;
  createdAt?: any;
};

function itemDisplayName(item: ClothingItem) {
  return item.name || `${item.primaryColor ?? ""} ${item.category}`.trim();
}

function valueToDate(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as any).toDate === "function") {
    const d = (value as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return null;
}

function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function TodayScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const insets = useSafeAreaInsets();
  const floatingTabSpace = dockSpace(insets.bottom) + 18;

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [outfit, setOutfit] = useState<OutfitDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingMode, setAddingMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const dateKey = useMemo(() => toDateKey(new Date()), []);

  useEffect(() => {
    let unsubItems: undefined | (() => void);
    let unsubOutfit: undefined | (() => void);

    if (!uid) {
      setItems([]);
      setOutfit(null);
      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    const itemsRef = collection(db, "users", uid, "items");
    const qItems = query(itemsRef, orderBy("createdAt", "desc"));
    unsubItems = onSnapshot(
      qItems,
      (snap) => {
        const next: ClothingItem[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setItems(next);
      },
      (err) => {
        console.log(err);
        Alert.alert("Firestore error", err.message);
      }
    );

    const outfitRef = doc(db, "users", uid, "outfits", dateKey);
    unsubOutfit = onSnapshot(
      outfitRef,
      (snap) => {
        if (!snap.exists()) {
          setOutfit(null);
        } else {
          setOutfit(snap.data() as OutfitDoc);
        }
        setLoading(false);
      },
      (err) => {
        console.log(err);
        Alert.alert("Firestore error", err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubItems?.();
      unsubOutfit?.();
    };
  }, [dateKey, uid]);

  useEffect(() => {
    if (!addingMode) return;
    setSelectedIds(outfit?.itemIds ?? []);
  }, [addingMode, outfit?.itemIds]);

  const itemsById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  const outfitItems = useMemo(() => {
    const ids = outfit?.itemIds ?? [];
    return ids.map((id) => itemsById.get(id)).filter(Boolean) as ClothingItem[];
  }, [itemsById, outfit?.itemIds]);

  const hasOutfit = (outfit?.itemIds?.length ?? 0) > 0;

  function toggleSelected(itemId: string) {
    setSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }

  function validateOutfit(ids: string[]) {
    const selected = ids
      .map((id) => itemsById.get(id))
      .filter(Boolean) as ClothingItem[];

    const categories = new Set(selected.map((i) => toCanonicalCategory(i.category)));

    if (!categories.has("top")) {
      return "Select at least one top.";
    }
    if (!categories.has("bottom")) {
      return "Select at least one bottom.";
    }
    if (!categories.has("shoes")) {
      return "Select at least one shoes item.";
    }

    return null;
  }

  async function savePlannedOutfit() {
    if (!uid) {
      router.replace("/(auth)/login");
      return;
    }

    const validationError = validateOutfit(selectedIds);
    if (validationError) {
      Alert.alert("Incomplete outfit", validationError);
      return;
    }

    try {
      setSaving(true);
      const ref = doc(db, "users", uid, "outfits", dateKey);
      await setDoc(
        ref,
        {
          dateKey,
          itemIds: selectedIds,
          planned: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setAddingMode(false);
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to save outfit");
    } finally {
      setSaving(false);
    }
  }

  async function markOutfitWorn() {
    if (!uid) {
      router.replace("/(auth)/login");
      return;
    }

    const itemIds = outfit?.itemIds ?? [];
    if (itemIds.length === 0) {
      Alert.alert("No outfit", "Plan an outfit first.");
      return;
    }

    for (const itemId of itemIds) {
      const item = itemsById.get(itemId);
      if (!item) {
        Alert.alert("Outfit issue", "One of the selected items was not found.");
        return;
      }

      if (item.status === "IN_LAUNDRY") {
        Alert.alert("Cannot mark outfit worn", `${itemDisplayName(item)} is in laundry.`);
        return;
      }

      if ((item.wearCountSinceWash ?? 0) >= MAX_WEARS_BEFORE_WASH) {
        Alert.alert(
          "Wash required",
          `${itemDisplayName(item)} reached the wear limit. Wash it before wearing again.`
        );
        return;
      }

      const lastWorn = valueToDate(item.lastWornDate);
      if (lastWorn && isSameLocalDate(lastWorn, new Date())) {
        Alert.alert("Already worn", `${itemDisplayName(item)} is already marked worn today.`);
        return;
      }
    }

    try {
      setSaving(true);
      const batch = writeBatch(db);

      const outfitRef = doc(db, "users", uid, "outfits", dateKey);
      batch.set(
        outfitRef,
        {
          dateKey,
          planned: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      for (const itemId of itemIds) {
        const itemRef = doc(db, "users", uid, "items", itemId);
        batch.update(itemRef, {
          status: "WORN",
          wearCountSinceWash: increment(1),
          lastWornDate: serverTimestamp(),
        });
      }

      await batch.commit();
      Alert.alert("Saved", "Outfit marked as worn.");
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to mark outfit worn");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "800" }}>Today</Text>
      <Text style={{ marginTop: 4, color: "#666" }}>{dateKey}</Text>

      <View style={{ height: 14 }} />

      <View style={card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 16, fontWeight: "800" }}>
            {hasOutfit ? (outfit?.planned ? "Planned outfit" : "Worn outfit") : "No outfit planned"}
          </Text>

          <Pressable
            onPress={() => setAddingMode((v) => !v)}
            style={pillBtn}
            disabled={saving}
          >
            <Text style={pillBtnText}>{addingMode ? "Done" : "Plan Outfit"}</Text>
          </Pressable>
        </View>

        <View style={{ height: 10 }} />

        {loading ? (
          <Text>Loading…</Text>
        ) : !hasOutfit ? (
          <View style={{ gap: 10 }}>
            <Text style={{ color: "#666" }}>No items planned for today.</Text>
            <Pressable onPress={() => setAddingMode(true)} style={primaryBtn}>
              <Text style={primaryBtnText}>Plan Outfit</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {outfitItems.map((it) => {
              const uri = getItemImageUrl(it, { variant: "thumb" });
              return (
                <View key={it.id} style={miniCard}>
                  <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                    {uri ? (
                      <Image
                        source={{ uri }}
                        style={{ width: 52, height: 52, borderRadius: 10 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 10,
                          backgroundColor: "#f3f3f3",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: "#777", fontSize: 11 }}>No photo</Text>
                      </View>
                    )}

                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontWeight: "800" }}>{itemDisplayName(it)}</Text>
                      <Text style={{ color: "#666" }}>{it.brand} • {it.category}</Text>
                    </View>
                  </View>
                </View>
              );
            })}

            <Pressable onPress={markOutfitWorn} style={[primaryBtn, saving ? { opacity: 0.6 } : null]} disabled={saving}>
              <Text style={primaryBtnText}>Mark Outfit Worn</Text>
            </Pressable>
          </View>
        )}
      </View>

      {addingMode && (
        <>
          <View style={{ height: 14 }} />
          <Text style={{ fontSize: 16, fontWeight: "800", marginBottom: 10 }}>Pick outfit items</Text>

          <FlatList
            data={items}
            keyExtractor={(x) => x.id}
            contentContainerStyle={{ paddingBottom: floatingTabSpace + 16 }}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              return (
                <Pressable
                  onPress={() => toggleSelected(item.id)}
                  style={[
                    card,
                    {
                      borderColor: selected ? "#111" : "#ddd",
                      backgroundColor: selected ? "#111" : "#fff",
                    },
                  ]}
                >
                  <Text style={{ fontSize: 16, fontWeight: "800", color: selected ? "#fff" : "#111" }}>
                    {itemDisplayName(item)}
                  </Text>
                  <Text style={{ color: selected ? "#fff" : "#111" }}>
                    {item.brand} • {item.category}
                  </Text>
                  <Text style={{ color: selected ? "#ddd" : "#666", marginTop: 6 }}>
                    {selected ? "Selected ✓" : "Tap to select"}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text>No wardrobe items found.</Text>}
            ListFooterComponent={
              <View style={{ marginTop: 12, gap: 8 }}>
                <Pressable
                  onPress={savePlannedOutfit}
                  style={[primaryBtn, saving ? { opacity: 0.6 } : null]}
                  disabled={saving}
                >
                  <Text style={primaryBtnText}>Save Planned Outfit</Text>
                </Pressable>
                <Text style={{ color: "#666", fontSize: 12 }}>
                  Minimum required: one top, one bottom, one shoes.
                </Text>
              </View>
            }
          />
        </>
      )}

      <View style={{ height: floatingTabSpace + 16 }} />
    </View>
  );
}

const card = {
  padding: 12,
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 14,
  backgroundColor: "#fff",
} as const;

const miniCard = {
  padding: 10,
  borderWidth: 1,
  borderColor: "#eee",
  borderRadius: 12,
  backgroundColor: "#fafafa",
} as const;

const pillBtn = {
  paddingVertical: 8,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "#111",
} as const;

const pillBtnText = {
  fontWeight: "900",
} as const;

const primaryBtn = {
  paddingVertical: 12,
  borderRadius: 14,
  backgroundColor: "#111",
  alignItems: "center",
} as const;

const primaryBtnText = {
  color: "#fff",
  fontWeight: "900",
  fontSize: 15,
} as const;
