import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import { ClosetItemCard } from "@/src/components/closet/ClosetItemCard";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  detectOutfitLayoutType,
  resolveOutfitLayout,
  type BoardPiece,
} from "@/src/lib/auraLookLayouts";
import { auraLookToPlannedOutfit, saveAuraLook } from "@/src/lib/auraLooks";
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
const IRIDESCENT_PURPLE = "#C084FC";

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
  return (
    item.photos?.normalizedUrl ??
    item.cleanedImageUrl ??
    item.photos?.cleanedUrl ??
    item.photos?.cleanedPhotoUrl ??
    item.originalImageUrl ??
    item.photoUrl ??
    null
  );
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

export default function StudioScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const uid = user?.uid ?? null;
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<StudioFilter>("all");
  const [selection, setSelection] = useState<ClothingItem[]>([]);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!uid) {
      router.replace("/(auth)/welcome");
      return;
    }
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
  const todayKey = toDayKey(new Date());
  void resolvedStudioLayout;

  function toggleItem(item: ClothingItem) {
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
  }

  async function handleSaveLook() {
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
  }

  async function handlePlanLook() {
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
  }

  function handleAskAura() {
    if (!hasSelection) return;
    router.push({
      pathname: "/(tabs)/ai",
      params: {
        prompt: buildAuraPrompt(selection),
        promptKey: `studio-${Date.now()}`,
      },
    });
  }

  function clearSelection() {
    if (!selection.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelection([]);
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator color={colors.text} />
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Opening Studio…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: Math.max(insets.top + 10, layout.topContentInset),
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: layout.bottomDockPadding + 112,
          gap: 18,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ color: colors.iridescentStart, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 }}>
              AURA STUDIO
            </Text>
            <Text style={{ color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: "900" }}>
              Build Outfit
            </Text>
          </View>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              borderRadius: layout.pillRadius,
              paddingHorizontal: 12,
              paddingVertical: 7,
              backgroundColor: "rgba(192,132,252,0.15)",
              borderWidth: 0.5,
              borderColor: IRIDESCENT_PURPLE,
            }}
          >
            <Text style={{ color: IRIDESCENT_PURPLE, fontSize: 12, fontWeight: "900" }}>
              {selection.length} item{selection.length === 1 ? "" : "s"} selected
            </Text>
          </View>
          {hasSelection ? (
            <Pressable
              onPress={clearSelection}
              hitSlop={10}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: "800" }}>
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
              borderRadius: layout.mediumRadius,
              paddingVertical: 13,
              paddingHorizontal: 12,
              alignItems: "center",
              backgroundColor: hasSelection ? colors.iridescentStart : colors.surface2,
              opacity: !hasSelection || saving ? 0.48 : pressed ? 0.84 : 1,
            })}
          >
            <Text
              numberOfLines={2}
              style={{
                color: hasSelection ? colors.background : colors.textSecondary,
                fontSize: 13,
                fontWeight: "900",
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
              borderRadius: layout.mediumRadius,
              paddingVertical: 13,
              paddingHorizontal: 12,
              alignItems: "center",
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: hasSelection ? colors.iridescentStart : "rgba(255,255,255,0.06)",
              opacity: !hasSelection || saving ? 0.48 : pressed ? 0.82 : 1,
            })}
          >
            <Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, fontWeight: "900", textAlign: "center" }}>
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
                      backgroundColor: active ? IRIDESCENT_PURPLE : "rgba(255,255,255,0.06)",
                      opacity: pressed ? 0.82 : 1,
                    })}
                  >
                    <Text
                      style={{
                        color: active ? "#000000" : "rgba(255,255,255,0.5)",
                        fontSize: 12.5,
                        fontWeight: "900",
                      }}
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
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>
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
                  borderRadius: layout.pillRadius,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  backgroundColor: colors.surface2,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  opacity: saving ? 0.5 : pressed ? 0.82 : 1,
                })}
              >
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: "900" }}>Save as look</Text>
              </Pressable>
            ) : null}
          </View>

          {filteredItems.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: gridGap }}>
              {filteredItems.map((item, index) => {
                const selected = selectedIds.has(item.id);
                return (
                  <View key={item.id} style={{ width: cardWidth }}>
                    <ClosetItemCard
                      item={item}
                      width={cardWidth}
                      selected={false}
                      animateIndex={index}
                      onPress={() => toggleItem(item)}
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
                          borderColor: IRIDESCENT_PURPLE,
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
                            backgroundColor: IRIDESCENT_PURPLE,
                          }}
                        >
                          <Ionicons name="checkmark" size={15} color="#FFFFFF" />
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View
              style={{
                borderRadius: layout.mediumRadius,
                padding: layout.cardPadding,
                backgroundColor: colors.surface2,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.07)",
                gap: 6,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>Nothing here yet</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
                Add or recategorize closet items to make them available for this role.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
