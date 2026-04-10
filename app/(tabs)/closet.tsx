import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  Text,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ClosetCategorySection } from "@/src/components/closet/ClosetCategorySection";
import { ClosetControlsRow } from "@/src/components/closet/ClosetControlsRow";
import { ClosetFilterSheet } from "@/src/components/closet/ClosetFilterSheet";
import { ClosetHeader } from "@/src/components/closet/ClosetHeader";
import { ClosetSearchBar } from "@/src/components/closet/ClosetSearchBar";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  type CanonicalCategory,
  type ClosetItem,
  type ClothingStatus,
  listenToItems,
  toCanonicalCategory,
} from "@/src/lib/items";
import { sanitizeDisplayText } from "@/src/lib/text";

type SortMode = "RECENTLY_ADDED" | "RECENTLY_WORN" | "BRAND" | "MOST_WORN";
type CategoryKey = CanonicalCategory;

const CATEGORY_ORDER: CategoryKey[] = ["top", "outerwear", "bottom", "shoes", "accessory"];
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  top: "Tops",
  outerwear: "Outerwear",
  bottom: "Bottoms",
  shoes: "Footwear",
  accessory: "Accessories",
};

const SUBCATEGORY_GROUPS: Record<CategoryKey, Array<{ label: string; matches: string[] }>> = {
  top: [
    { label: "T-shirts", matches: ["t-shirt", "tshirt", "tee"] },
    { label: "Shirts", matches: ["shirt", "dress shirt"] },
    { label: "Polos", matches: ["polo"] },
    { label: "Sweaters", matches: ["sweater", "knit", "jumper"] },
    { label: "Hoodies", matches: ["hoodie", "sweatshirt"] },
  ],
  outerwear: [
    { label: "Jackets", matches: ["jacket"] },
    { label: "Coats", matches: ["coat", "parka", "trench"] },
    { label: "Overshirts", matches: ["overshirt", "shacket"] },
    { label: "Blazers", matches: ["blazer", "sport coat"] },
  ],
  bottom: [
    { label: "Jeans", matches: ["jeans", "denim"] },
    { label: "Trousers", matches: ["trousers", "pants", "slacks"] },
    { label: "Joggers", matches: ["joggers", "sweatpants"] },
    { label: "Shorts", matches: ["shorts"] },
  ],
  shoes: [
    { label: "Sneakers", matches: ["sneaker", "sneakers", "trainer"] },
    { label: "Loafers", matches: ["loafer", "loafers"] },
    { label: "Boots", matches: ["boot", "boots"] },
    { label: "Sandals", matches: ["sandal", "sandals", "slides"] },
  ],
  accessory: [
    { label: "Watches", matches: ["watch", "watches"] },
    { label: "Bags", matches: ["bag", "bags", "backpack", "tote"] },
    { label: "Perfumes", matches: ["perfume", "fragrance", "cologne"] },
    { label: "Jewelry", matches: ["jewelry", "jewellery", "necklace", "ring", "bracelet"] },
    { label: "Belts", matches: ["belt", "belts"] },
    { label: "Sunglasses", matches: ["sunglasses", "glasses"] },
    { label: "Caps", matches: ["cap", "caps", "hat", "beanie"] },
  ],
};

const SORT_OPTIONS: Array<{ key: SortMode; label: string }> = [
  { key: "RECENTLY_ADDED", label: "Recently added" },
  { key: "RECENTLY_WORN", label: "Recently worn" },
  { key: "BRAND", label: "Brand" },
  { key: "MOST_WORN", label: "Most worn" },
];

const STATUS_OPTIONS: Array<{ key: "ALL" | ClothingStatus; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "AVAILABLE", label: "Available" },
  { key: "WORN", label: "Worn" },
  { key: "IN_LAUNDRY", label: "In Laundry" },
];

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return date?.getTime?.() ?? 0;
  }
  return 0;
}

function itemSubcategory(item: ClosetItem) {
  return sanitizeDisplayText(item.subCategory) || sanitizeDisplayText(item.type) || "";
}

function subcategoryBucket(item: ClosetItem, category: CategoryKey) {
  const haystack = `${itemSubcategory(item)} ${sanitizeDisplayText(item.name)}`.toLowerCase();
  const group = SUBCATEGORY_GROUPS[category].find((option) =>
    option.matches.some((term) => haystack.includes(term))
  );
  return group?.label ?? "Other";
}

function searchMatches(item: ClosetItem, query: string) {
  if (!query) return true;
  const haystack = [
    item.name,
    item.brand,
    item.category,
    item.subCategory,
    item.type,
    item.primaryColor,
    ...(item.colors ?? []),
  ]
    .map((value) => normalizeText(value))
    .join(" ");
  return haystack.includes(query);
}

function sortItems(items: ClosetItem[], sortMode: SortMode) {
  const next = [...items];
  if (sortMode === "RECENTLY_WORN") {
    next.sort((a, b) => toMillis(b.lastWornDate) - toMillis(a.lastWornDate));
    return next;
  }
  if (sortMode === "BRAND") {
    next.sort((a, b) => normalizeText(a.brand).localeCompare(normalizeText(b.brand)));
    return next;
  }
  if (sortMode === "MOST_WORN") {
    next.sort((a, b) => Number(b.wearCountSinceWash ?? 0) - Number(a.wearCountSinceWash ?? 0));
    return next;
  }
  next.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  return next;
}

function buildSections(items: ClosetItem[]) {
  return CATEGORY_ORDER.map((category) => {
    const inCategory = items.filter((item) => toCanonicalCategory(item.category) === category);
    const buckets = new Map<string, ClosetItem[]>();
    inCategory.forEach((item) => {
      const key = subcategoryBucket(item, category);
      const current = buckets.get(key) ?? [];
      current.push(item);
      buckets.set(key, current);
    });
    const subcategories = Array.from(buckets.entries())
      .map(([label, groupedItems]) => ({ label, items: groupedItems }))
      .sort((a, b) => {
        if (a.label === "Other") return 1;
        if (b.label === "Other") return -1;
        return a.label.localeCompare(b.label);
      });
    return {
      key: category,
      title: CATEGORY_LABELS[category],
      itemCount: inCategory.length,
      subcategories,
    };
  }).filter((section) => section.itemCount > 0);
}

export default function ClosetScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const uid = user?.uid ?? null;
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("RECENTLY_ADDED");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ClothingStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CategoryKey>("ALL");
  const [brandFilter, setBrandFilter] = useState<string>("ALL");
  const [colorFilter, setColorFilter] = useState<string>("ALL");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    top: true,
    outerwear: true,
    bottom: true,
    shoes: true,
    accessory: false,
  });

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }
    setLoading(true);
    const unsub = listenToItems(uid, (next) => {
      setItems(next);
      setLoading(false);
    }, {
      onError: (message) => {
        setLoading(false);
        Alert.alert("Closet", message || "Unable to load wardrobe.");
      },
    });
    return () => unsub();
  }, [uid]);

  const brandOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        items.map((item) => sanitizeDisplayText(item.brand)).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...values];
  }, [items]);

  const colorOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        items
          .flatMap((item) => [item.primaryColor, ...(item.colors ?? [])])
          .map((value) => sanitizeDisplayText(value))
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ["ALL", ...values];
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = normalizeText(search);
    return sortItems(
      items.filter((item) => {
        if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
        if (categoryFilter !== "ALL" && toCanonicalCategory(item.category) !== categoryFilter) return false;
        if (brandFilter !== "ALL" && sanitizeDisplayText(item.brand) !== brandFilter) return false;
        if (
          colorFilter !== "ALL" &&
          ![sanitizeDisplayText(item.primaryColor), ...(item.colors ?? []).map((value) => sanitizeDisplayText(value))].includes(colorFilter)
        ) {
          return false;
        }
        return searchMatches(item, query);
      }),
      sortMode
    );
  }, [brandFilter, categoryFilter, colorFilter, items, search, sortMode, statusFilter]);

  const sections = useMemo(() => buildSections(filteredItems), [filteredItems]);
  const visibleCount = filteredItems.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: layout.topContentInset,
          paddingBottom: layout.bottomDockPadding,
          gap: 12,
        }}
      >
        <ClosetHeader
          totalCount={items.length}
          visibleCount={visibleCount}
          statusFilter={statusFilter}
        />

        <View
          style={{
            backgroundColor: colors.background,
            paddingTop: 4,
            paddingBottom: 12,
            gap: 8,
          }}
        >
          <ClosetSearchBar value={search} onChangeText={setSearch} />

          <ClosetControlsRow
            sortLabel={SORT_OPTIONS.find((option) => option.key === sortMode)?.label ?? "Recently added"}
            statusLabel={STATUS_OPTIONS.find((option) => option.key === statusFilter)?.label ?? "All"}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        </View>

        {loading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : sections.length === 0 ? (
          <View
            style={{
              borderRadius: layout.mediumRadius,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              padding: layout.cardPadding,
              gap: 10,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>
              {items.length === 0 ? "Your closet is still empty" : "No pieces match these filters"}
            </Text>
            <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
              {items.length === 0
                ? "Add a few pieces and Closet becomes your clean, category-first browser."
                : "Try a broader search or clear one of the active filters."}
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <ClosetCategorySection
              key={section.key}
              title={section.title}
              count={section.itemCount}
              expanded={expandedSections[section.key] !== false}
              subcategories={section.subcategories}
              onToggle={() =>
                {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setExpandedSections((prev) => ({
                    ...prev,
                    [section.key]: !(prev[section.key] !== false),
                  }));
                }
              }
              onPressItem={(item) =>
                router.push({
                  pathname: "/(tabs)/item/[id]",
                  params: { id: item.id },
                })
              }
            />
          ))
        )}
      </ScrollView>

      <ClosetFilterSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        sortMode={sortMode}
        statusFilter={statusFilter}
        categoryFilter={categoryFilter}
        brandFilter={brandFilter}
        colorFilter={colorFilter}
        sortOptions={SORT_OPTIONS}
        statusOptions={STATUS_OPTIONS}
        categoryOptions={[{ key: "ALL", label: "All categories" }, ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABELS[key] }))]}
        brandOptions={brandOptions}
        colorOptions={colorOptions}
        onChangeSort={setSortMode}
        onChangeStatus={setStatusFilter}
        onChangeCategory={setCategoryFilter}
        onChangeBrand={setBrandFilter}
        onChangeColor={setColorFilter}
        onClear={() => {
          setSortMode("RECENTLY_ADDED");
          setStatusFilter("ALL");
          setCategoryFilter("ALL");
          setBrandFilter("ALL");
          setColorFilter("ALL");
        }}
      />

      <Pressable
        onPress={() => router.push("/(tabs)/add")}
        style={({ pressed }) => ({
          position: "absolute",
          right: layout.horizontalPadding,
          bottom: layout.composerOffset - 2,
          width: 58,
          height: 58,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(20,24,32,0.84)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
          shadowColor: "#000",
          shadowOpacity: 0.28,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 18,
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <View
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.04)",
          }}
        />
        <Ionicons name="add" size={26} color={colors.text} />
      </Pressable>
    </View>
  );
}
