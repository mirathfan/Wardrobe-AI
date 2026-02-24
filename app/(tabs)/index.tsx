import { router } from "expo-router";
import {
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "../../src/hooks/useAuth";
import { db } from "../../src/lib/firebase";
import { addItemToOutfit, toDateKey } from "../../src/lib/outfits";
import { ClothingItem, ClothingStatus } from "../../src/types/ClothingItem";

type StatusFilter = "ALL" | ClothingStatus;

// ✅ Home sections
const SECTIONS = [
  { key: "TOPS", title: "Tops", includes: ["tshirt", "shirt", "hoodie", "jacket"] },
  { key: "BOTTOMS", title: "Bottoms", includes: ["jeans", "pants", "trousers", "shorts"] },
  { key: "SHOES", title: "Shoes", includes: ["shoes"] },
  {
    key: "ACCESSORIES",
    title: "Accessories",
    includes: ["cap", "caps", "sunglasses", "watch", "watches", "accessory", "accessories"],
  },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function normalizeCategory(cat: string) {
  return (cat || "").trim().toLowerCase();
}

function sectionForItem(item: ClothingItem): SectionKey {
  const c = normalizeCategory(item.category);
  for (const s of SECTIONS) {
    if (s.includes.includes(c)) return s.key;
  }
  return "ACCESSORIES";
}

/* ---------- Status styling (dot + border tint) ---------- */
function statusStyle(status: "AVAILABLE" | "WORN" | "IN_LAUNDRY") {
  switch (status) {
    case "AVAILABLE":
      return { dot: "#22c55e", border: "#b7f7c8", label: "Available" };
    case "WORN":
      return { dot: "#f59e0b", border: "#ffe0b2", label: "Worn" };
    case "IN_LAUNDRY":
      return { dot: "#ef4444", border: "#ffd1d1", label: "Laundry" };
    default:
      return { dot: "#9ca3af", border: "#e5e7eb", label: "—" };
  }
}

/* ---------- Small UI components ---------- */
function ActionChip({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: "#F3F4F6",
        borderWidth: 1,
        borderColor: "#E5E7EB",
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <MaterialCommunityIcons name={icon} size={16} color="#111" />
      <Text style={{ fontWeight: "800", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

function ItemPhotoCard({
  item,
  onWoreToday,
  onToLaundry,
  onWashed,
}: {
  item: ClothingItem;
  onWoreToday: () => void;
  onToLaundry: () => void;
  onWashed: () => void;
}) {
  const s = statusStyle(item.status);
  const itemImageUri = item.photoUrl || item.photoUri;

  return (
    <View
      style={{
        width: 170,
        borderWidth: 1.5,
        borderColor: s.border,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: "#fff",
      }}
    >
      {itemImageUri ? (
        <Image
          source={{ uri: itemImageUri }}
          style={{ width: "100%", height: 140 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: "100%",
            height: 140,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f3f3f3",
          }}
        >
          <Text style={{ color: "#777", fontWeight: "800" }}>No photo</Text>
        </View>
      )}

      <View style={{ padding: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 99,
              backgroundColor: s.dot,
            }}
          />
          <Text style={{ fontSize: 14, fontWeight: "900", flex: 1 }} numberOfLines={1}>
            {item.name ? item.name : `${item.primaryColor} ${item.category}`}
          </Text>
        </View>

        <Text style={{ opacity: 0.7, marginTop: 4, fontSize: 12 }} numberOfLines={1}>
          {item.brand || "—"} • {s.label}
        </Text>

        <Text style={{ opacity: 0.7, marginTop: 4, fontSize: 12 }} numberOfLines={1}>
          Wears: {item.wearCountSinceWash ?? 0}
        </Text>

        {item.wearCountSinceWash >= 2 && item.status !== "IN_LAUNDRY" && (
          <Text style={{ marginTop: 6, color: "#ef4444", fontWeight: "800", fontSize: 12 }}>
            Suggest wash soon
          </Text>
        )}

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {item.status === "AVAILABLE" && (
            <>
              <ActionChip icon="check" label="Wore" onPress={onWoreToday} />
              <ActionChip icon="washing-machine" label="Laundry" onPress={onToLaundry} />
            </>
          )}

          {item.status === "WORN" && (
            <>
              <ActionChip icon="washing-machine" label="Laundry" onPress={onToLaundry} />
              <ActionChip icon="check" label="Wore" onPress={onWoreToday} />
            </>
          )}

          {item.status === "IN_LAUNDRY" && (
            <ActionChip icon="tshirt-crew" label="Washed" onPress={onWashed} />
          )}
        </View>
      </View>
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "#111" : "#ddd",
        backgroundColor: active ? "#111" : "transparent",
      }}
    >
      <Text style={{ color: active ? "#fff" : "#111" }}>{label}</Text>
    </Pressable>
  );
}

/* ---------- Screen ---------- */
export default function WardrobeScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  async function markWorn(itemId: string) {
    try {
      if (!uid) return router.replace("/(auth)/login");

      const dateKey = toDateKey(new Date());
      await addItemToOutfit(dateKey, itemId, false);

      const ref = doc(db, "users", uid, "items", itemId);
      await updateDoc(ref, {
        status: "WORN",
        wearCountSinceWash: increment(1),
        lastWornDate: Date.now(),
      });
    } catch (err: any) {
      console.log(err);
      Alert.alert("Error", err?.message ?? "Failed to mark worn");
    }
  }

  async function moveToLaundry(itemId: string) {
    try {
      if (!uid) return router.replace("/(auth)/login");

      await updateDoc(doc(db, "users", uid, "items", itemId), {
        status: "IN_LAUNDRY",
      });
    } catch (err: any) {
      console.log(err);
      Alert.alert("Error", err?.message ?? "Failed to move to laundry");
    }
  }

  async function markWashed(itemId: string) {
    try {
      if (!uid) return router.replace("/(auth)/login");

      await updateDoc(doc(db, "users", uid, "items", itemId), {
        status: "AVAILABLE",
        wearCountSinceWash: 0,
        lastWashedDate: Date.now(),
      });
    } catch (err: any) {
      console.log(err);
      Alert.alert("Error", err?.message ?? "Failed to mark washed");
    }
  }

  useEffect(() => {
    let unsub: undefined | (() => void);

    if (!uid) {
      setItems([]);
      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    const itemsRef = collection(db, "users", uid, "items");
    const q = query(itemsRef, orderBy("createdAt", "desc"));

    unsub = onSnapshot(
      q,
      (snap) => {
        const next: ClothingItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setItems(next);
        setLoading(false);
      },
      (err) => {
        console.log(err);
        Alert.alert("Firestore error", err.message);
        setLoading(false);
      }
    );

    return () => unsub?.();
  }, [uid]);

  // Status counts (for pills)
  const totalCount = items.length;
  const availableCount = items.filter((i) => i.status === "AVAILABLE").length;
  const wornCount = items.filter((i) => i.status === "WORN").length;
  const laundryCount = items.filter((i) => i.status === "IN_LAUNDRY").length;

  // Apply status filter once
  const filteredByStatus = useMemo(() => {
    return statusFilter === "ALL" ? items : items.filter((i) => i.status === statusFilter);
  }, [items, statusFilter]);

  // Build section data
  const sectionData = useMemo(() => {
    const buckets: Record<SectionKey, ClothingItem[]> = {
      TOPS: [],
      BOTTOMS: [],
      SHOES: [],
      ACCESSORIES: [],
    };

    for (const it of filteredByStatus) {
      buckets[sectionForItem(it)].push(it);
    }

    return SECTIONS.map((s) => ({
      key: s.key,
      title: s.title,
      items: buckets[s.key as SectionKey],
    }));
  }, [filteredByStatus]);

  return (
    <View style={{ flex: 1, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 10 }}>
        Wardrobe
      </Text>

      {/* ✅ Status pills */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <Pill label={`All (${totalCount})`} active={statusFilter === "ALL"} onPress={() => setStatusFilter("ALL")} />
        <Pill
          label={`Available (${availableCount})`}
          active={statusFilter === "AVAILABLE"}
          onPress={() => setStatusFilter("AVAILABLE")}
        />
        <Pill label={`Worn (${wornCount})`} active={statusFilter === "WORN"} onPress={() => setStatusFilter("WORN")} />
        <Pill
          label={`Laundry (${laundryCount})`}
          active={statusFilter === "IN_LAUNDRY"}
          onPress={() => setStatusFilter("IN_LAUNDRY")}
        />
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ textAlign: "center", marginTop: 10, opacity: 0.7 }}>
            Loading…
          </Text>
        </View>
      ) : (
        <FlatList
          data={sectionData}
          keyExtractor={(s) => s.key}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}  // ⬅️ smaller spacing
          renderItem={({ item: section }) => (
            <View>
              <Text style={{ fontSize: 16, fontWeight: "900", marginBottom: 6 }}>
                {section.title} ({section.items.length})
              </Text>

              {section.items.length === 0 ? (
                <Text style={{ color: "#666" }}>No items.</Text>
              ) : (
                <FlatList
                  data={section.items}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(it) => it.id}
                  ItemSeparatorComponent={() => <View style={{ width: 10 }} />} // ⬅️ tighter
                  renderItem={({ item }) => (
                    <Pressable onPress={() => router.push(`/(tabs)/item/${item.id}`)}>
                      <ItemPhotoCard
                        item={item}
                        onWoreToday={() => markWorn(item.id)}      // ✅ fixed (was markWoreToday)
                        onToLaundry={() => moveToLaundry(item.id)}
                        onWashed={() => markWashed(item.id)}
                      />
                    </Pressable>
                  )}
                />
              )}
            </View>
          )}
        />
      )}

      {/* ✅ Floating "+" */}
      <Pressable
        onPress={() => router.push("/(tabs)/add")}
        style={{
          position: "absolute",
          right: 18,
          bottom: 24,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "#111",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 28, lineHeight: 28 }}>+</Text>
      </Pressable>
    </View>
  );
}
