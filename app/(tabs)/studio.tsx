import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import { ClosetItemCard } from "@/src/components/closet/ClosetItemCard";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
import { auraButtonStyle, auraButtonTextStyle, auraSurfaceTiers, auraTypography } from "@/src/components/ui/auraStylePrimitives";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  detectOutfitLayoutType,
  resolveOutfitLayout,
  type BoardPiece,
} from "@/src/lib/auraLookLayouts";
import { auraLookToPlannedOutfit, saveAuraLook } from "@/src/lib/auraLooks";
import { getItemImageUrl } from "@/src/lib/itemImage";
import { listenToItems, toCanonicalCategory } from "@/src/lib/items";
import { Toast } from "@/src/lib/toast";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook, AuraLookPiece } from "@/src/types/aura";
import { toDayKey } from "@/src/utils/date";
import { savePlannedRecord } from "@/src/utils/dailyOutfits";

type StudioCategory = "top" | "bottom" | "footwear" | "outerwear" | "accessory" | "one_piece";
type StudioFilter = "all" | StudioCategory;

const CATEGORY_LIMITS: Record<StudioCategory, number> = {
  outerwear: 2,
  top: 2,
  bottom: 1,
  footwear: 1,
  one_piece: 1,
  accessory: 6,
};

const MAX_TOTAL_ITEMS = 8;

const FILTERS: {
  key: StudioFilter;
  label: string;
}[] = [
  { key: "all", label: "All" },
  { key: "top", label: "Tops" },
  { key: "bottom", label: "Bottoms" },
  { key: "outerwear", label: "Outerwear" },
  { key: "footwear", label: "Shoes" },
  { key: "accessory", label: "Accessories" },
  { key: "one_piece", label: "One Piece" },
];

function itemTitle(item?: ClothingItem | null) {
  return (
    item?.name ||
    item?.subCategory ||
    item?.type ||
    item?.category ||
    "Wardrobe item"
  ).trim();
}

function itemDescriptor(item: ClothingItem) {
  return [
    itemTitle(item),
    item.brand,
    item.category,
    item.subCategory,
    item.primaryColor || item.colorLabel || item.displayColor,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function categoryForItem(item: ClothingItem): StudioCategory {
  const category = toCanonicalCategory(item.category);
  if (category === "shoes") return "footwear";
  if (category === "outerwear") return "outerwear";
  if (category === "bottom") return "bottom";
  if (category === "accessory") return "accessory";
  if (category === "one_piece") return "one_piece";
  return "top";
}

function auraRoleForCategory(category: StudioCategory): AuraLookPiece["role"] {
  if (category === "footwear") return "shoes";
  if (category === "accessory") return "accessory";
  if (category === "one_piece") return "top";
  return category;
}

function categoryLabel(category: StudioCategory) {
  if (category === "one_piece") return "one piece";
  if (category === "footwear") return "footwear";
  return category;
}

function imageUrlForItem(item: ClothingItem) {
  return getItemImageUrl(item, { variant: "thumb" });
}

function buildManualLook(selection: ClothingItem[]): AuraLook {
  const pieces = selection.map((item) => {
    const category = categoryForItem(item);
    return {
      role: auraRoleForCategory(category),
      itemName: itemTitle(item),
      source: "closet" as const,
      itemId: item.id,
      imageUrl: imageUrlForItem(item),
    };
  });
  const names = pieces.map((piece) => piece.itemName).filter(Boolean);

  return {
    lookTitle: names.length ? "Studio Build" : "Manual Outfit",
    vibe: "closet-first studio build",
    shortExplanation: names.length
      ? "A manually built look from pieces you chose."
      : "Choose pieces below to preview an outfit.",
    stylingNote: names.length
      ? `Manual Studio selection: ${names.join(", ")}.`
      : "Start with any role and build from your closet.",
    personalizationLabel: "Studio",
    personalizationNote: "Built manually from closet items.",
    pieces,
    fromCloset: names,
    addToComplete: [],
    alternates: [],
    actions: ["saveLook", "planForToday"],
  };
}

function buildAuraPrompt(selection: ClothingItem[]) {
  const lines = selection.map((item) => {
    const label = categoryLabel(categoryForItem(item));
    return `${label}: ${itemDescriptor(item)} (closet item id: ${item.id})`;
  });

  return [
    "Improve this manually built outfit from my closet.",
    "Keep the selected pieces as the starting point, explain what works, and suggest the smallest swaps or styling additions if needed.",
    "",
    ...lines,
  ].join("\n");
}

function buildStudioBoardPieces(selection: ClothingItem[]): BoardPiece[] {
  return selection.map((item, index) => {
    const category = categoryForItem(item);
    const searchTokens = [
      category,
      itemTitle(item),
      item.brand,
      item.category,
      item.subCategory,
      item.type,
      item.style,
      item.fit,
    ]
      .map((part) => String(part ?? "").trim().toLowerCase())
      .filter(Boolean)
      .join(" ");

    return {
      key: `${item.id}-${category}-${index}`,
      itemId: item.id,
      role: category === "footwear" ? "footwear" : category,
      itemName: itemTitle(item),
      source: "closet",
      imageUrl: item.originalImageUrl ?? item.photoUrl ?? null,
      cleanedImageUrl: item.cleanedImageUrl ?? item.photos?.cleanedUrl ?? null,
      image: imageUrlForItem(item),
      brand: item.brand ?? null,
      category: item.category ?? null,
      subCategory: item.subCategory ?? null,
      type: item.type ?? null,
      style: item.style ?? null,
      fit: item.fit ?? null,
      size: item.size ?? null,
      status: item.status ?? null,
      colors: item.colors ?? item.displayColors ?? null,
      colorLabel: item.colorLabel ?? item.displayColor ?? null,
      primaryColor: item.primaryColor ?? null,
      lastWornDate: item.lastWornDate ?? null,
      layerRole: item.layerRole ?? null,
      visualNormalization: item.visualNormalization ?? null,
      searchTokens,
    };
  });
}

const StudioPickerItem = React.memo(function StudioPickerItem({
  item,
  selected,
  cardWidth,
  gridGap,
  index,
  onToggleItem,
}: {
  item: ClothingItem;
  selected: boolean;
  cardWidth: number;
  gridGap: number;
  index: number;
  onToggleItem: (item: ClothingItem) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ width: cardWidth, marginBottom: gridGap }}>
      <ClosetItemCard
        item={item}
        width={cardWidth}
        selected={false}
        animateIndex={index}
        onPressItem={onToggleItem}
      />
      {selected ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 20,
            borderWidth: 1.5,
            borderColor: colors.purpleBorder,
          }}
        >
          <View
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.ctaCream,
            }}
          >
            <Ionicons name="checkmark" size={15} color={colors.ctaText} />
          </View>
        </View>
      ) : null}
    </View>
  );
});

export default function StudioScreen() {
  const params = useLocalSearchParams<{
    itemId?: string | string[];
  }>();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const uid = user?.uid ?? null;
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<StudioFilter>("all");
  const [selection, setSelection] = useState<ClothingItem[]>([]);
  const [saving, setSaving] = useState(false);
  const consumedRouteItemRef = React.useRef<string | null>(null);
  const routeItemId = useMemo(() => {
    const raw = Array.isArray(params.itemId) ? params.itemId[0] : params.itemId;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "";
  }, [params.itemId]);

  React.useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      router.replace("/(auth)/welcome");
      return;
    }
    setItems([]);
    setLoading(true);
    const unsub = listenToItems(
      uid,
      (next) => {
        setItems(next as ClothingItem[]);
        setLoading(false);
      },
      {
        status: "ALL",
        sort: "NEWEST",
        onError: (message) => {
          setLoading(false);
          Alert.alert("Firestore error", message);
        },
      },
    );
    return () => unsub();
  }, [uid]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const look = useMemo(() => buildManualLook(selection), [selection]);
  const hasSelection = selection.length > 0;
  const selectedIds = useMemo(() => new Set(selection.map((item) => item.id)), [selection]);
  const hasOnePieceSelected = useMemo(
    () => selection.some((item) => categoryForItem(item) === "one_piece"),
    [selection],
  );
  const selectedCounts = useMemo(
    () =>
      selection.reduce<Record<StudioCategory, number>>(
        (acc, item) => {
          const category = categoryForItem(item);
          acc[category] += 1;
          return acc;
        },
        {
          top: 0,
          bottom: 0,
          footwear: 0,
          outerwear: 0,
          accessory: 0,
          one_piece: 0,
        },
      ),
    [selection],
  );
  const resolvedStudioLayout = useMemo(() => {
    const pieces = buildStudioBoardPieces(selection);
    if (!pieces.length) return [];
    return resolveOutfitLayout(pieces, detectOutfitLayoutType(pieces), "studio");
  }, [selection]);
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const category = categoryForItem(item);
        if (hasOnePieceSelected && (category === "top" || category === "bottom")) {
          return false;
        }
        return activeFilter === "all" || category === activeFilter;
      }),
    [activeFilter, hasOnePieceSelected, items],
  );
  const gridGap = 12;
  const availableWidth = layout.width - layout.horizontalPadding * 2;
  const columns = layout.screenSize === "large" ? 4 : 2;
  const cardWidth = Math.floor((availableWidth - gridGap * (columns - 1)) / columns);
  const todayKey = useMemo(() => toDayKey(new Date()), []);
  void resolvedStudioLayout;

  React.useEffect(() => {
    if (!routeItemId || loading || consumedRouteItemRef.current === routeItemId) return;
    const routeItem = items.find((entry) => entry.id === routeItemId);
    if (!routeItem) return;
    consumedRouteItemRef.current = routeItemId;
    setActiveFilter("all");
    setSelection((prev) =>
      prev.some((entry) => entry.id === routeItem.id) ? prev : [routeItem, ...prev],
    );
  }, [items, loading, routeItemId]);

  const toggleItem = React.useCallback((item: ClothingItem) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const category = categoryForItem(item);
    const isSelected = selectedIds.has(item.id);

    if (isSelected) {
      setSelection((prev) => prev.filter((entry) => entry.id !== item.id));
      return;
    }

    if (selection.length >= MAX_TOTAL_ITEMS) {
      Toast.error("Maximum 8 items per outfit");
      return;
    }

    if ((category === "top" || category === "bottom") && hasOnePieceSelected) {
      Toast.error("One piece selected — tops and bottoms are hidden");
      return;
    }

    if (
      category === "one_piece" &&
      (selectedCounts.top > 0 || selectedCounts.bottom > 0)
    ) {
      Toast.error("Remove top/bottom items first to add a one piece");
      return;
    }

    if (selectedCounts[category] >= CATEGORY_LIMITS[category]) {
      Toast.error(`Maximum ${CATEGORY_LIMITS[category]} ${categoryLabel(category)} item${CATEGORY_LIMITS[category] === 1 ? "" : "s"}`);
      return;
    }

    setSelection((prev) => [...prev, item]);
  }, [hasOnePieceSelected, selectedCounts, selectedIds, selection.length]);

  const handleSaveLook = React.useCallback(async () => {
    if (!uid || !hasSelection || saving) return;
    setSaving(true);
    try {
      await saveAuraLook(uid, look, { title: "Studio Build" });
      Toast.saved();
    } catch (error: any) {
      Toast.error("Save failed", error?.message ?? "Unable to save this look.");
    } finally {
      setSaving(false);
    }
  }, [hasSelection, look, saving, uid]);

  const handlePlanLook = React.useCallback(async () => {
    if (!uid || !hasSelection || saving) return;
    setSaving(true);
    try {
      await savePlannedRecord(uid, todayKey, auraLookToPlannedOutfit(look));
      Toast.success("Planned", "This outfit is now attached to today.");
    } catch (error: any) {
      Toast.error("Plan failed", error?.message ?? "Unable to plan this outfit.");
    } finally {
      setSaving(false);
    }
  }, [hasSelection, look, saving, todayKey, uid]);

  const handleAskAura = React.useCallback(() => {
    if (!hasSelection) return;
    router.push({
      pathname: "/(tabs)/ai",
      params: {
        prompt: buildAuraPrompt(selection),
        promptKey: `studio-${Date.now()}`,
      },
    });
  }, [hasSelection, selection]);

  const clearSelection = React.useCallback(() => {
    if (!selection.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelection([]);
  }, [selection.length]);

  const renderStudioItem = React.useCallback(
    ({ item, index }: { item: ClothingItem; index: number }) => (
      <StudioPickerItem
        item={item}
        selected={selectedIds.has(item.id)}
        cardWidth={cardWidth}
        gridGap={gridGap}
        index={index}
        onToggleItem={toggleItem}
      />
    ),
    [cardWidth, gridGap, selectedIds, toggleItem],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AuraSubpageHeader
          title="Build Outfit"
          eyebrow="AURA STUDIO"
          fallbackRoute="/"
        />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={colors.text} />
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Opening Studio…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AuraSubpageHeader
        title="Build Outfit"
        eyebrow="AURA STUDIO"
        fallbackRoute="/"
      />
      <FlatList
        data={filteredItems}
        key={`studio-grid-${columns}`}
        keyExtractor={(item) => item.id}
        renderItem={renderStudioItem}
        numColumns={columns}
        columnWrapperStyle={columns > 1 ? { gap: gridGap } : undefined}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  borderRadius: layout.pillRadius,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  backgroundColor: colors.purpleSurface,
                  borderWidth: 1,
                  borderColor: colors.purpleBorder,
                }}
              >
                <Text style={[auraTypography.chipLabel, { color: colors.ctaCream, fontSize: 12 }]}>
                  {selection.length} item{selection.length === 1 ? "" : "s"} selected
                </Text>
              </View>
              {hasSelection ? (
                <Pressable
                  onPress={clearSelection}
                  hitSlop={10}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "800" }}>
                    Clear all
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <AuraLookCard
              look={look}
              itemsById={itemsById}
              viewportWidth={layout.width - layout.horizontalPadding * 2}
              boardVariant="studio"
              onPressSave={handleSaveLook}
              onPressPlan={handlePlanLook}
              hideActions={!hasSelection}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                disabled={!hasSelection || saving}
                onPress={handleAskAura}
                style={({ pressed }) => ({
                  flex: 1,
                  ...auraButtonStyle(colors, "primary", !hasSelection || saving),
                  borderRadius: layout.mediumRadius,
                  paddingVertical: 13,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  opacity: !hasSelection || saving ? 0.48 : pressed ? 0.84 : 1,
                })}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    ...auraButtonTextStyle(colors, "primary", !hasSelection || saving),
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  Ask AURA to improve this
                </Text>
              </Pressable>
              <Pressable
                disabled={!hasSelection || saving}
                onPress={handlePlanLook}
                style={({ pressed }) => ({
                  flex: 1,
                  ...auraButtonStyle(colors, "secondary", !hasSelection || saving),
                  borderRadius: layout.mediumRadius,
                  paddingVertical: 13,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  opacity: !hasSelection || saving ? 0.48 : pressed ? 0.82 : 1,
                })}
              >
                <Text numberOfLines={2} style={[auraButtonTextStyle(colors, "secondary", !hasSelection || saving), { fontSize: 13, textAlign: "center" }]}>
                  Plan this outfit
                </Text>
              </Pressable>
            </View>

            <View style={{ gap: 12 }}>
              <View style={{ gap: 10 }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingRight: 8 }}
                >
                  {FILTERS.map((filter) => {
                    const active = activeFilter === filter.key;
                    return (
                      <Pressable
                        key={filter.key}
                        onPress={() => setActiveFilter(filter.key)}
                        style={({ pressed }) => ({
                          borderRadius: layout.pillRadius,
                          paddingHorizontal: 13,
                          paddingVertical: 9,
                          backgroundColor: active ? colors.purpleSurface : colors.chipBackground,
                          borderWidth: 1,
                          borderColor: active ? colors.purpleBorder : colors.border,
                          opacity: pressed ? 0.82 : 1,
                        })}
                      >
                        <Text
                          style={[auraTypography.chipLabel, { color: active ? colors.ctaCream : colors.textSecondary }]}
                        >
                          {filter.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[auraTypography.cardTitle, { color: colors.text }]}>
                    Choose wardrobe items
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>
                    {filteredItems.length ? `${filteredItems.length} closet items` : "No matching items yet"}
                  </Text>
                </View>
                {hasSelection ? (
                  <Pressable
                    onPress={handleSaveLook}
                    disabled={saving}
                    style={({ pressed }) => ({
                      ...auraButtonStyle(colors, "tertiary", saving),
                      borderRadius: layout.pillRadius,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      opacity: saving ? 0.5 : pressed ? 0.82 : 1,
                    })}
                  >
                    <Text style={[auraButtonTextStyle(colors, "tertiary", saving), { fontSize: 12, lineHeight: 16 }]}>Save as look</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View
            style={{
              borderRadius: layout.mediumRadius,
              padding: layout.cardPadding,
              ...auraSurfaceTiers.surfaceBase,
              gap: 6,
            }}
          >
            <Text style={[auraTypography.cardTitle, { color: colors.text, fontSize: 16, lineHeight: 21 }]}>Nothing here yet</Text>
            <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary, fontSize: 13, lineHeight: 20 }]}>
              Add or recategorize closet items to make them available for this role.
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        extraData={selectedIds}
        contentContainerStyle={{
          paddingTop: 12,
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: layout.bottomDockPadding + 112,
        }}
      />
    </View>
  );
}
