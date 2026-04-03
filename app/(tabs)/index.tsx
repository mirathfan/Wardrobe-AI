import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dockSpace } from "@/src/constants/dock";
import { deleteDoc, doc } from "firebase/firestore";

import { AI_LABEL } from "@/src/components/AiAccent";
import { AiInsightCard } from "@/src/components/AiInsightCard";
import { AiWardrobeSections } from "@/src/components/AiWardrobeSections";
import { WardrobeFilterSheet } from "@/src/components/WardrobeFilterSheet";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { db } from "@/src/lib/firebase";
import { getItemImageUrl } from "@/src/lib/itemImage";
import {
  CategoryFilter,
  ClosetItem,
  ItemSort,
  StatusFilter,
  isInCategory,
  listenToItems,
  markWashed,
  safeMarkWorn,
  sendToLaundry,
  toCanonicalCategory,
} from "@/src/lib/items";

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

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    const ms = date?.getTime?.();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function lastWornLabel(item: ClosetItem) {
  const ms = toMillis(item.lastWornDate);
  if (!ms) return "Last worn: —";
  const days = Math.max(0, Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Last worn: today";
  if (days === 1) return "Last worn: yesterday";
  return `Last worn: ${days}d ago`;
}

const ActionChip = React.memo(function ActionChip({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
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
        backgroundColor: colors.muted,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <MaterialCommunityIcons name={icon} size={16} color={colors.text} />
      <Text style={{ fontWeight: "800", fontSize: 12, color: colors.text }}>{label}</Text>
    </Pressable>
  );
});

const ItemPhotoCard = React.memo(function ItemPhotoCard({
  item,
  onWoreToday,
  onToLaundry,
  onWashed,
  aiTag,
  matchCount,
  compact,
  selectMode = false,
  selected = false,
}: {
  item: ClosetItem;
  onWoreToday: () => void;
  onToLaundry: () => void;
  onWashed: () => void;
  aiTag?: "AI Pick" | "Underused" | "Recently Worn" | null;
  matchCount?: number;
  compact?: boolean;
  selectMode?: boolean;
  selected?: boolean;
}) {
  const { colors } = useAppTheme();
  const s = statusStyle(item.status);
  const itemImageUri = getItemImageUrl(item, { variant: compact ? "thumb" : "hero" });

  return (
    <View
      style={{
        width: compact ? 154 : 172,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.border,
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: selected ? colors.accentSoft : colors.card,
      }}
    >
      {selectMode ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            zIndex: 2,
            width: 24,
            height: 24,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: selected ? colors.accent : "rgba(255,255,255,0.9)",
            backgroundColor: selected ? colors.accent : "rgba(15,23,42,0.28)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected ? (
            <MaterialCommunityIcons name="check" size={14} color="#fff" />
          ) : null}
        </View>
      ) : null}
      {itemImageUri ? (
        <View style={{ width: "100%", height: compact ? 116 : 140, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
          <Image
            source={{ uri: itemImageUri }}
            style={{ width: "100%", height: compact ? 116 : 140 }}
            resizeMode="contain"
          />
          {aiTag ? (
            <View
              style={{
                position: "absolute",
                right: 8,
                top: 8,
                borderRadius: 999,
                backgroundColor: "rgba(15,23,42,0.92)",
                paddingHorizontal: 7,
                paddingVertical: 3,
              }}
            >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>✨ {aiTag}</Text>
          </View>
        ) : null}
      </View>
      ) : (
        <View
          style={{
            width: "100%",
            height: compact ? 116 : 140,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.muted,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontWeight: "800" }}>No photo</Text>
        </View>
      )}

      <View style={{ paddingHorizontal: 10, paddingTop: 9, paddingBottom: compact ? 9 : 10, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 99,
              backgroundColor: s.dot,
            }}
          />
          <Text style={{ fontSize: 14, fontWeight: "900", flex: 1, color: colors.text }} numberOfLines={1}>
            {item.name
              ? item.name
              : `${item.primaryColor ?? ""} ${item.subCategory ?? item.category ?? ""}`.trim()}
          </Text>
        </View>

        <Text style={{ opacity: 0.7, fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
          {item.brand || "—"} • {s.label}
        </Text>
        <Text style={{ opacity: 0.72, fontSize: 12, color: colors.textSecondary }} numberOfLines={1}>
          {matchCount ? `Pairs well with ${matchCount}` : lastWornLabel(item)}
        </Text>

        {!compact && !selectMode ? (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
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
        ) : null}
      </View>
    </View>
  );
});

export default function WardrobeScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const uid = user?.uid ?? null;
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<ClosetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [sortMode, setSortMode] = useState<ItemSort>("NEWEST");
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBarHeight, setBulkBarHeight] = useState(0);

  async function onMarkWorn(itemId: string) {
    try {
      if (!uid) return router.replace("/(auth)/login");
      await safeMarkWorn(uid, itemId);
    } catch (err: any) {
      console.log(err);
      Alert.alert("Error", err?.message ?? "Failed to mark worn");
    }
  }

  async function moveToLaundry(itemId: string) {
    try {
      if (!uid) return router.replace("/(auth)/login");
      await sendToLaundry(uid, itemId);
    } catch (err: any) {
      console.log(err);
      Alert.alert("Error", err?.message ?? "Failed to move to laundry");
    }
  }

  async function onMarkWashed(itemId: string) {
    try {
      if (!uid) return router.replace("/(auth)/login");
      await markWashed(uid, itemId);
    } catch (err: any) {
      console.log(err);
      Alert.alert("Error", err?.message ?? "Failed to mark washed");
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds([]);
  }

  function enterSelectModeWithItem(itemId: string) {
    setSelectMode(true);
    setSelectedIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
  }

  function toggleSelected(itemId: string) {
    setSelectedIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  }

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    setLoading(true);
    const unsub = listenToItems(
      uid,
      (next) => {
        setItems(next);
        setLoading(false);
      },
      {
        status: statusFilter,
        sort: sortMode,
        onError: (message) => {
          Alert.alert("Firestore error", message);
          setLoading(false);
        },
      }
    );

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

  const visibleItemIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const selectedVisibleIds = useMemo(
    () => selectedIds.filter((id) => visibleItemIds.includes(id)),
    [selectedIds, visibleItemIds]
  );

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => visibleItemIds.includes(id)));
  }, [visibleItemIds]);

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

  const colorToItemCount = useMemo(() => {
    // TODO(wardrobe-ai): replace with embedding-based compatibility score when ready.
    const counts = new Map<string, number>();
    filteredItems.forEach((item) => {
      const colors = (item.colors ?? []).map((c) => String(c).toLowerCase()).filter(Boolean);
      if (colors.length === 0 && item.primaryColor) {
        colors.push(String(item.primaryColor).toLowerCase());
      }
      const unique = Array.from(new Set(colors));
      unique.forEach((color) => counts.set(color, (counts.get(color) ?? 0) + 1));
    });
    return counts;
  }, [filteredItems]);

  const matchCountByItemId = useMemo(() => {
    const map = new Map<string, number>();
    filteredItems.forEach((item) => {
      const colors = (item.colors ?? []).map((c) => String(c).toLowerCase()).filter(Boolean);
      if (colors.length === 0 && item.primaryColor) {
        colors.push(String(item.primaryColor).toLowerCase());
      }
      const score = colors.reduce((acc, color) => acc + (colorToItemCount.get(color) ?? 0), 0);
      map.set(item.id, Math.max(0, score - 1));
    });
    return map;
  }, [colorToItemCount, filteredItems]);

  const hasResults = filteredItems.length > 0;
  const isDefaultFilter = !normalizedSearch && statusFilter === "ALL" && categoryFilter === "ALL";
  const sortLabel = SORT_OPTIONS.find((opt) => opt.key === sortMode)?.label ?? "Newest";
  const isAllVisibleSelected =
    visibleItemIds.length > 0 && selectedVisibleIds.length === visibleItemIds.length;

  const filterSummary = useMemo(() => {
    const parts = [
      STATUS_FILTERS.find((f) => f.key === statusFilter)?.label ?? "All",
      CATEGORY_FILTERS.find((f) => f.key === categoryFilter)?.label ?? "All",
    ];
    return parts.join(" • ");
  }, [categoryFilter, statusFilter]);

  async function runBulkAction(
    label: string,
    action: (itemId: string) => Promise<void>,
    options?: { successPastTense?: string }
  ) {
    if (!uid) return router.replace("/(auth)/login");
    if (selectedVisibleIds.length === 0) return;
    const results = await Promise.allSettled(selectedVisibleIds.map((itemId) => action(itemId)));
    const successCount = results.filter((result) => result.status === "fulfilled").length;
    const failureCount = results.length - successCount;
    if (failureCount > 0) {
      Alert.alert(
        `${label} complete`,
        `${successCount} updated${failureCount ? `, ${failureCount} skipped` : ""}.`
      );
    }
    if (successCount > 0) {
      exitSelectMode();
    }
    void options;
  }

  async function onBulkShare() {
    if (selectedVisibleIds.length === 0) return;
    const selectedItems = filteredItems.filter((item) => selectedVisibleIds.includes(item.id));
    const message = selectedItems
      .map((item) => {
        const name =
          item.name ||
          `${item.primaryColor ?? ""} ${item.subCategory ?? item.category ?? ""}`.trim() ||
          "Wardrobe item";
        return [name, item.brand].filter(Boolean).join(" • ");
      })
      .join("\n");
    try {
      await Share.share({
        title: "Wardrobe items",
        message,
      });
      exitSelectMode();
    } catch (err: any) {
      if (err?.message && !String(err.message).includes("User did not share")) {
        Alert.alert("Share failed", err.message);
      }
    }
  }

  function onBulkDelete() {
    if (!uid) return router.replace("/(auth)/login");
    if (selectedVisibleIds.length === 0) return;
    Alert.alert(
      `Delete ${selectedVisibleIds.length} item${selectedVisibleIds.length === 1 ? "" : "s"}?`,
      "This will remove the selected items from your wardrobe.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await runBulkAction("Delete", async (itemId) => {
              await deleteDoc(doc(db, "users", uid, "items", itemId));
            });
          },
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, backgroundColor: colors.background }}>
      <View style={{ gap: 14, paddingTop: Math.max(2, insets.top * 0.25), paddingBottom: 10 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {selectMode ? (
            <>
              <Pressable
                onPress={exitSelectMode}
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontWeight: "800", color: colors.text }}>Cancel</Text>
              </Pressable>
              <Text style={{ fontSize: 20, fontWeight: "900", color: colors.text }}>
                {selectedVisibleIds.length} selected
              </Text>
              <Pressable
                onPress={() =>
                  isAllVisibleSelected ? setSelectedIds([]) : setSelectedIds(visibleItemIds)
                }
                style={{
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontWeight: "800", color: colors.text }}>
                  {isAllVisibleSelected ? "Clear All" : "Select All"}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={{ gap: 1 }}>
                <Text style={{ fontSize: 24, fontWeight: "900", color: colors.text }}>{AI_LABEL}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
                  Your personal closet assistant
                </Text>
              </View>
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/ai", params: { intent: "build_outfit" } })}
                style={{
                  borderRadius: 999,
                  backgroundColor: colors.accent,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ fontWeight: "800", color: "#fff" }}>Ask AI</Text>
              </Pressable>
            </>
          )}
        </View>

        <TextInput
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search by name or brand"
          placeholderTextColor={colors.textSecondary}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            color: colors.text,
            backgroundColor: colors.input,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        />

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={() => setShowFilterSheet(true)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: colors.surface,
            }}
          >
            <MaterialCommunityIcons name="tune-variant" size={16} color={colors.text} />
            <Text style={{ fontWeight: "800", color: colors.text }}>Filters</Text>
          </Pressable>

          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: colors.surface,
            }}
          >
            <Text style={{ fontWeight: "700", color: colors.text }} numberOfLines={1}>
              {filterSummary} • Sort: {sortLabel}
            </Text>
          </View>
          {!selectMode ? (
            <Pressable
              onPress={() => setSelectMode(true)}
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontWeight: "800", color: colors.text }}>Select</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={hasResults ? sectionData : []}
        keyExtractor={(s) => s.key}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom:
            selectMode && selectedVisibleIds.length > 0
              ? bulkBarHeight > 0
                ? bulkBarHeight + dockSpace(insets.bottom) + 12
                : dockSpace(insets.bottom) + 160
              : dockSpace(insets.bottom) + 18,
          paddingTop: 4,
          gap: 12,
        }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 2 }}>
            {!selectMode ? (
              <View
                style={{
                  gap: 12,
                  backgroundColor: colors.accentSoft,
                  borderRadius: 18,
                  padding: 10,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: "900", color: colors.text }}>
                    ✨ Smart Wardrobe
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    Personalized picks and insights
                  </Text>
                </View>

                <AiInsightCard
                  items={filteredItems}
                  onPressBuildOutfit={() =>
                    router.push({ pathname: "/(tabs)/ai", params: { intent: "build_outfit" } })
                  }
                />

                {loading ? (
                  <View
                    style={{
                      borderRadius: 14,
                      backgroundColor: colors.accentSoft,
                      paddingVertical: 14,
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <ActivityIndicator />
                    <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
                      AI organizing your wardrobe…
                    </Text>
                  </View>
                ) : (
                <AiWardrobeSections
                  items={filteredItems}
                  onPressItem={(item) => router.push(`/(tabs)/item/${item.id}`)}
                  onLongPressItem={(item) => enterSelectModeWithItem(item.id)}
                  renderItemCardCompact={({ item, aiTag }) => (
                    <ItemPhotoCard
                      item={item}
                        compact
                        aiTag={aiTag as "AI Pick" | "Underused" | "Recently Worn"}
                        matchCount={matchCountByItemId.get(item.id) ?? 0}
                        onWoreToday={() => onMarkWorn(item.id)}
                        onToLaundry={() => moveToLaundry(item.id)}
                        onWashed={() => onMarkWashed(item.id)}
                      />
                    )}
                  />
                )}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={{ justifyContent: "center", alignItems: "center", gap: 10, paddingTop: 28 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
                {isDefaultFilter ? "No items yet" : "No results match filters"}
              </Text>
              <Pressable
                onPress={() => router.push("/(tabs)/add")}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: colors.accent,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900" }}>Add your first item</Text>
              </Pressable>
            </View>
          )
        }
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item: section }) => (
          <View style={{ gap: 7 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: colors.text }}>
                {section.title} ({section.items.length})
              </Text>
            </View>

            {section.items.length === 0 ? (
              <Text style={{ color: colors.textSecondary }}>No items.</Text>
            ) : (
              <FlatList
                data={section.items}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(it) => it.id}
                initialNumToRender={6}
                windowSize={5}
                ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() =>
                      selectMode ? toggleSelected(item.id) : router.push(`/(tabs)/item/${item.id}`)
                    }
                    onLongPress={() => enterSelectModeWithItem(item.id)}
                    delayLongPress={220}
                  >
                    <ItemPhotoCard
                      item={item}
                      matchCount={matchCountByItemId.get(item.id) ?? 0}
                      onWoreToday={() => onMarkWorn(item.id)}
                      onToLaundry={() => moveToLaundry(item.id)}
                      onWashed={() => onMarkWashed(item.id)}
                      selectMode={selectMode}
                      selected={selectedVisibleIds.includes(item.id)}
                    />
                  </Pressable>
                )}
              />
            )}
          </View>
        )}
      />

      {!selectMode ? (
        <Pressable
          onPress={() => router.push("/(tabs)/add")}
          style={{
            position: "absolute",
            right: 18,
            bottom: dockSpace(insets.bottom) + 12,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.accent,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: colors.accent,
            shadowOpacity: 0.22,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 28, lineHeight: 28 }}>+</Text>
        </Pressable>
      ) : null}

      {selectMode && selectedVisibleIds.length > 0 ? (
        <View
          onLayout={(event) => {
            const nextHeight = Math.round(event.nativeEvent.layout.height);
            if (nextHeight !== bulkBarHeight) {
              setBulkBarHeight(nextHeight);
            }
          }}
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: dockSpace(insets.bottom) + 10,
            borderRadius: 22,
            backgroundColor: "rgba(15,23,42,0.96)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            padding: 12,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable
              onPress={() => void runBulkAction("Mark as worn", (itemId) => safeMarkWorn(uid!, itemId))}
              style={bulkPrimaryButton}
            >
              <Text style={bulkPrimaryButtonText}>Mark as Worn</Text>
            </Pressable>
            <Pressable
              onPress={() => void runBulkAction("Send to laundry", (itemId) => sendToLaundry(uid!, itemId))}
              style={bulkSecondaryButton}
            >
              <Text style={bulkSecondaryButtonText}>Send to Laundry</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Pressable
              onPress={() => void runBulkAction("Mark as washed", (itemId) => markWashed(uid!, itemId))}
              style={bulkSecondaryButton}
            >
              <Text style={bulkSecondaryButtonText}>Mark as Washed</Text>
            </Pressable>
            <Pressable onPress={() => void onBulkShare()} style={bulkSecondaryButton}>
              <Text style={bulkSecondaryButtonText}>Share</Text>
            </Pressable>
            <Pressable
              onPress={onBulkDelete}
              style={[bulkSecondaryButton, { borderColor: "rgba(239,68,68,0.45)", backgroundColor: "rgba(127,29,29,0.28)" }]}
            >
              <Text style={[bulkSecondaryButtonText, { color: "#fecaca" }]}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <WardrobeFilterSheet
        visible={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        sortMode={sortMode}
        statusOptions={STATUS_FILTERS}
        categoryOptions={CATEGORY_FILTERS}
        sortOptions={SORT_OPTIONS}
        onChangeStatus={setStatusFilter}
        onChangeCategory={setCategoryFilter}
        onChangeSort={setSortMode}
        onClear={() => {
          setStatusFilter("ALL");
          setCategoryFilter("ALL");
          setSortMode("NEWEST");
          setSearchText("");
        }}
      />
    </View>
  );
}

const bulkPrimaryButton = {
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 999,
  backgroundColor: "#fff",
} as const;

const bulkPrimaryButtonText = {
  color: "#111",
  fontWeight: "900",
  fontSize: 13,
} as const;

const bulkSecondaryButton = {
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
  backgroundColor: "rgba(255,255,255,0.04)",
} as const;

const bulkSecondaryButtonText = {
  color: "#fff",
  fontWeight: "800",
  fontSize: 13,
} as const;
