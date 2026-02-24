import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { doc, increment, serverTimestamp, updateDoc } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../src/hooks/useAuth";
import {
  CategoryFilter,
  ClosetItem,
  ItemSort,
  StatusFilter,
  isInCategory,
  listenToItems,
  toCanonicalCategory,
} from "../../src/lib/items";
import { db } from "../../src/lib/firebase";
import { addItemToOutfit, toDateKey } from "../../src/lib/outfits";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AVAILABLE", label: "Available" },
  { key: "WORN", label: "Worn" },
  { key: "IN_LAUNDRY", label: "Laundry" },
];

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "TOP", label: "Top" },
  { key: "BOTTOM", label: "Bottom" },
  { key: "SHOES", label: "Shoes" },
  { key: "OUTERWEAR", label: "Outerwear" },
  { key: "ACCESSORY", label: "Accessory" },
];

const SORT_OPTIONS: { key: ItemSort; label: string }[] = [
  { key: "NEWEST", label: "Newest" },
  { key: "MOST_WORN", label: "Most worn" },
];

const SECTIONS = [
  { key: "TOP", title: "Top" },
  { key: "BOTTOM", title: "Bottom" },
  { key: "SHOES", title: "Shoes" },
  { key: "OUTERWEAR", title: "Outerwear" },
  { key: "ACCESSORY", title: "Accessory" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function sectionForItem(item: ClosetItem): SectionKey {
  const c = toCanonicalCategory(item.category);
  if (c === "top") return "TOP";
  if (c === "bottom") return "BOTTOM";
  if (c === "shoes") return "SHOES";
  if (c === "outerwear") return "OUTERWEAR";
  return "ACCESSORY";
}

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
  item: ClosetItem;
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
      <Text style={{ color: active ? "#fff" : "#111", fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}

export default function WardrobeScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [items, setItems] = useState<ClosetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [sortMode, setSortMode] = useState<ItemSort>("NEWEST");

  async function markWorn(itemId: string) {
    try {
      if (!uid) return router.replace("/(auth)/login");

      const dateKey = toDateKey(new Date());
      await addItemToOutfit(dateKey, itemId, false);

      const ref = doc(db, "users", uid, "items", itemId);
      await updateDoc(ref, {
        status: "WORN",
        wearCountSinceWash: increment(1),
        lastWornDate: serverTimestamp(),
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
        lastWashedDate: serverTimestamp(),
      });
    } catch (err: any) {
      console.log(err);
      Alert.alert("Error", err?.message ?? "Failed to mark washed");
    }
  }

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    setLoading(true);
    const unsub = listenToItems(uid, (next) => {
      setItems(next);
      setLoading(false);
    }, {
      status: statusFilter,
      sort: sortMode,
      onError: (message) => {
        Alert.alert("Firestore error", message);
        setLoading(false);
      },
    });

    return () => unsub();
  }, [uid, statusFilter, sortMode]);

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    let next = items;

    if (statusFilter !== "ALL") {
      next = next.filter((i) => i.status === statusFilter);
    }

    if (categoryFilter !== "ALL") {
      next = next.filter((i) => isInCategory(i, categoryFilter));
    }

    if (normalizedSearch) {
      next = next.filter((i) => {
        const name = (i.name || "").toLowerCase();
        const brand = (i.brand || "").toLowerCase();
        return name.includes(normalizedSearch) || brand.includes(normalizedSearch);
      });
    }

    return next;
  }, [items, statusFilter, categoryFilter, normalizedSearch]);

  const sectionData = useMemo(() => {
    const buckets: Record<SectionKey, ClosetItem[]> = {
      TOP: [],
      BOTTOM: [],
      SHOES: [],
      OUTERWEAR: [],
      ACCESSORY: [],
    };

    for (const it of filteredItems) {
      buckets[sectionForItem(it)].push(it);
    }

    const visible =
      categoryFilter === "ALL"
        ? SECTIONS
        : SECTIONS.filter((s) => s.key === categoryFilter);

    return visible.map((s) => ({ key: s.key, title: s.title, items: buckets[s.key] }));
  }, [filteredItems, categoryFilter]);

  const hasResults = filteredItems.length > 0;
  const isDefaultFilter =
    !normalizedSearch && statusFilter === "ALL" && categoryFilter === "ALL";

  return (
    <View style={{ flex: 1, paddingHorizontal: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 10 }}>Wardrobe</Text>

      <TextInput
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search by name or brand"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          marginBottom: 10,
        }}
      />

      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontWeight: "800", marginBottom: 6 }}>Status</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((f) => (
            <Pill
              key={f.key}
              label={f.label}
              active={statusFilter === f.key}
              onPress={() => setStatusFilter(f.key)}
            />
          ))}
        </View>
      </View>

      <View style={{ marginBottom: 8 }}>
        <Text style={{ fontWeight: "800", marginBottom: 6 }}>Category</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {CATEGORY_FILTERS.map((f) => (
            <Pill
              key={f.key}
              label={f.label}
              active={categoryFilter === f.key}
              onPress={() => setCategoryFilter(f.key)}
            />
          ))}
        </View>
      </View>

      <View style={{ marginBottom: 12 }}>
        <Text style={{ fontWeight: "800", marginBottom: 6 }}>Sort</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {SORT_OPTIONS.map((f) => (
            <Pill
              key={f.key}
              label={f.label}
              active={sortMode === f.key}
              onPress={() => setSortMode(f.key)}
            />
          ))}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ textAlign: "center", marginTop: 10, opacity: 0.7 }}>Loading…</Text>
        </View>
      ) : !hasResults ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800" }}>
            {isDefaultFilter ? "No items yet" : "No results match filters"}
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/add")}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 10,
              backgroundColor: "#111",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "900" }}>Add your first item</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sectionData}
          keyExtractor={(s) => s.key}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
                  ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                  renderItem={({ item }) => (
                    <Pressable onPress={() => router.push(`/(tabs)/item/${item.id}`)}>
                      <ItemPhotoCard
                        item={item}
                        onWoreToday={() => markWorn(item.id)}
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
