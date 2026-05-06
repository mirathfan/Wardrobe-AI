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
import { saveAuraLook } from "@/src/lib/auraLooks";
import { getItemImageUrl } from "@/src/lib/itemImage";
import { listenToItems, normalizeLaundryStatus, toCanonicalCategory } from "@/src/lib/items";
import { Toast } from "@/src/lib/toast";
import { planOutfitForToday } from "@/src/lib/wearOutfit";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook, AuraLookPiece } from "@/src/types/aura";
import { toDayKey } from "@/src/utils/date";

type StudioCategory = "top" | "bottom" | "footwear" | "outerwear" | "accessory" | "one_piece";
type StudioFilter = "all" | StudioCategory;
type StudioIssue = {
  key: string;
  label: string;
  severity: "info" | "warning";
};

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

function isCleanItem(item: ClothingItem) {
  return normalizeLaundryStatus(item) === "clean";
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

function getStudioIssues(selection: ClothingItem[]): StudioIssue[] {
  if (!selection.length) {
    return [{ key: "empty", label: "Choose at least one closet item to start.", severity: "info" }];
  }

  const counts = selection.reduce<Record<StudioCategory, number>>(
    (acc, item) => {
      acc[categoryForItem(item)] += 1;
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
  );
  const issues: StudioIssue[] = [];
  const hasOnePiece = counts.one_piece > 0;
  if (!hasOnePiece && counts.top === 0) {
    issues.push({ key: "top", label: "Add a top or one-piece.", severity: "warning" });
  }
  if (!hasOnePiece && counts.bottom === 0) {
    issues.push({ key: "bottom", label: "Add a bottom or one-piece.", severity: "warning" });
  }
  if (counts.footwear === 0) {
    issues.push({ key: "footwear", label: "Add shoes before planning.", severity: "warning" });
  }
  const unavailableCount = selection.filter((item) => !isCleanItem(item)).length;
  if (unavailableCount > 0) {
    issues.push({
      key: "laundry",
      label: `${unavailableCount} selected piece${unavailableCount === 1 ? " is" : "s are"} not clean.`,
      severity: "warning",
    });
  }
  if (!issues.length) {
    issues.push({ key: "ready", label: "Complete outfit: ready to save, refine, or plan.", severity: "info" });
  }
  return issues;
}

function buildAuraPrompt(selection: ClothingItem[], issues: StudioIssue[]) {
  const lines = selection.map((item) => {
    const label = categoryLabel(categoryForItem(item));
    return `${label}: ${itemDescriptor(item)}; availability=${normalizeLaundryStatus(item)} (closet item id: ${item.id})`;
  });
  const issueLines = issues
    .filter((issue) => issue.key !== "ready")
    .map((issue) => `- ${issue.label}`);

  return [
    "Improve this manually built outfit from my closet.",
    "Return a concrete refinement with: what to keep, what to swap or add, and one styling note.",
    "Keep the selected pieces as the starting point unless a piece is unavailable or the outfit is incomplete.",
    issueLines.length ? "Current Studio checklist:" : "",
    ...issueLines,
    "",
    "Selected pieces:",
    ...lines,
  ].join("\n");
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
  const [cleanOnly, setCleanOnly] = useState(true);
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
  const studioIssues = useMemo(() => getStudioIssues(selection), [selection]);
  const blockingIssues = useMemo(
    () => studioIssues.filter((issue) => issue.severity === "warning"),
    [studioIssues],
  );
  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        const category = categoryForItem(item);
        if (hasOnePieceSelected && (category === "top" || category === "bottom")) {
          return false;
        }
        if (cleanOnly && !isCleanItem(item)) return false;
        return activeFilter === "all" || category === activeFilter;
      }),
    [activeFilter, cleanOnly, hasOnePieceSelected, items],
  );
  const gridGap = 12;
  const availableWidth = layout.width - layout.horizontalPadding * 2;
  const columns = layout.screenSize === "large" ? 4 : 2;
  const cardWidth = Math.floor((availableWidth - gridGap * (columns - 1)) / columns);
  const todayKey = useMemo(() => toDayKey(new Date()), []);

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

  const confirmIncompleteOutfit = React.useCallback(
    (actionLabel: string) =>
      new Promise<boolean>((resolve) => {
        if (!blockingIssues.length) {
          resolve(true);
          return;
        }
        Alert.alert(
          "Review this outfit?",
          `${blockingIssues.map((issue) => `• ${issue.label}`).join("\n")}\n\nYou can still ${actionLabel.toLowerCase()}, but AURA may need to refine it first.`,
          [
            { text: "Keep editing", style: "cancel", onPress: () => resolve(false) },
            { text: actionLabel, onPress: () => resolve(true) },
          ],
        );
      }),
    [blockingIssues],
  );

  const handleSaveLook = React.useCallback(async () => {
    if (!uid || !hasSelection || saving) return;
    const shouldContinue = await confirmIncompleteOutfit("Save anyway");
    if (!shouldContinue) return;
    setSaving(true);
    try {
      await saveAuraLook(uid, look, { title: "Studio Build" });
      Toast.saved();
      Alert.alert("Look saved", "Studio Build is in My Looks.", [
        { text: "Keep building", style: "cancel" },
        { text: "View My Looks", onPress: () => router.push("/profile/my-looks") },
      ]);
    } catch (error: any) {
      if (__DEV__) {
        console.error("SAVE LOOK UI ERROR:", error);
      }
      Toast.error("Save failed", "Couldn’t save this look. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [confirmIncompleteOutfit, hasSelection, look, saving, uid]);

  const handlePlanLook = React.useCallback(async () => {
    if (!uid || !hasSelection || saving) return;
    const shouldContinue = await confirmIncompleteOutfit("Plan anyway");
    if (!shouldContinue) return;
    setSaving(true);
    try {
      await planOutfitForToday({
        uid,
        source: "studio",
        title: "Studio Build",
        look,
        date: new Date(`${todayKey}T12:00:00`),
      });
      Toast.success("Planned", "This outfit is now attached to today.");
      Alert.alert("Planned for today", "This Studio build is on your calendar.", [
        { text: "Keep building", style: "cancel" },
        { text: "Open Calendar", onPress: () => router.push("/(tabs)/calendar") },
      ]);
    } catch (error: any) {
      Toast.error("Plan failed", error?.message ?? "Unable to plan this outfit.");
    } finally {
      setSaving(false);
    }
  }, [confirmIncompleteOutfit, hasSelection, look, saving, todayKey, uid]);

  const handleAskAura = React.useCallback(() => {
    if (!hasSelection) return;
    router.push({
      pathname: "/(tabs)/ai",
      params: {
        prompt: buildAuraPrompt(selection, studioIssues),
        promptKey: `studio-${Date.now()}`,
      },
    });
  }, [hasSelection, selection, studioIssues]);

  const clearSelection = React.useCallback(() => {
    if (!selection.length) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelection([]);
  }, [selection.length]);

  const removeSelectedItem = React.useCallback((itemId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelection((prev) => prev.filter((entry) => entry.id !== itemId));
  }, []);

  const swapSelectedItem = React.useCallback((item: ClothingItem) => {
    const category = categoryForItem(item);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelection((prev) => prev.filter((entry) => entry.id !== item.id));
    setActiveFilter(category);
    Toast.success("Choose a swap", `Showing ${categoryLabel(category)} options.`);
  }, []);

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

            {hasSelection ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 8 }}
              >
                {selection.map((item) => {
                  const status = normalizeLaundryStatus(item);
                  const unavailable = status !== "clean";
                  return (
                    <View
                      key={`selected-${item.id}`}
                      style={{
                        minWidth: 178,
                        maxWidth: 230,
                        borderRadius: 18,
                        padding: 11,
                        gap: 8,
                        ...auraSurfaceTiers.surfaceBase,
                        borderColor: unavailable ? colors.warning : colors.border,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 999,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.purpleSurface,
                          }}
                        >
                          <Ionicons
                            name={unavailable ? "warning-outline" : "checkmark"}
                            size={15}
                            color={unavailable ? colors.warning : colors.lightPurple}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900" }} numberOfLines={1}>
                            {itemTitle(item)}
                          </Text>
                          <Text style={{ color: unavailable ? colors.warning : colors.textMuted, fontSize: 11.5 }} numberOfLines={1}>
                            {categoryLabel(categoryForItem(item))} · {status === "clean" ? "ready" : status.replace("_", " ")}
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => swapSelectedItem(item)}
                          style={({ pressed }) => ({
                            flex: 1,
                            ...auraButtonStyle(colors, "tertiary", false),
                            minHeight: 34,
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            opacity: pressed ? 0.78 : 1,
                          })}
                        >
                          <Text style={[auraButtonTextStyle(colors, "tertiary", false), { fontSize: 12 }]}>Swap</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => removeSelectedItem(item.id)}
                          hitSlop={8}
                          style={({ pressed }) => ({
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.chipBackground,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <Ionicons name="close" size={16} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}

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

            <View
              style={{
                borderRadius: layout.mediumRadius,
                padding: 14,
                gap: 10,
                ...auraSurfaceTiers.surfaceBase,
                borderColor: blockingIssues.length ? colors.warning : colors.purpleBorder,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons
                  name={blockingIssues.length ? "alert-circle-outline" : "sparkles-outline"}
                  size={18}
                  color={blockingIssues.length ? colors.warning : colors.lightPurple}
                />
                <Text style={[auraTypography.chipLabel, { color: colors.text }]}>
                  Studio checklist
                </Text>
              </View>
              <View style={{ gap: 7 }}>
                {studioIssues.map((issue) => (
                  <View key={issue.key} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
                    <Ionicons
                      name={issue.severity === "warning" ? "ellipse-outline" : "checkmark-circle-outline"}
                      size={15}
                      color={issue.severity === "warning" ? colors.warning : colors.lightPurple}
                      style={{ marginTop: 1 }}
                    />
                    <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                      {issue.label}
                    </Text>
                  </View>
                ))}
              </View>
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
                  <Pressable
                    onPress={() => setCleanOnly((value) => !value)}
                    style={({ pressed }) => ({
                      borderRadius: layout.pillRadius,
                      paddingHorizontal: 13,
                      paddingVertical: 9,
                      backgroundColor: cleanOnly ? colors.purpleSurface : colors.chipBackground,
                      borderWidth: 1,
                      borderColor: cleanOnly ? colors.purpleBorder : colors.border,
                      opacity: pressed ? 0.82 : 1,
                    })}
                  >
                    <Text
                      style={[auraTypography.chipLabel, { color: cleanOnly ? colors.ctaCream : colors.textSecondary }]}
                    >
                      Clean only
                    </Text>
                  </Pressable>
                </ScrollView>
              </View>

              <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[auraTypography.cardTitle, { color: colors.text }]}>
                    Choose wardrobe items
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>
                    {filteredItems.length
                      ? `${filteredItems.length} closet items${cleanOnly ? " ready" : ""}`
                      : items.length
                        ? "No matching ready items"
                        : "No closet items yet"}
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
              {items.length
                ? cleanOnly
                  ? "Turn off Clean only or mark pieces washed in Laundry."
                  : "Add or recategorize closet items to make them available for this role."
                : "Add your first closet items, then return to Studio to build a look."}
            </Text>
            {items.length ? (
              <Pressable
                onPress={() => {
                  setCleanOnly(false);
                  setActiveFilter("all");
                }}
                style={({ pressed }) => ({
                  ...auraButtonStyle(colors, "secondary", false),
                  alignSelf: "flex-start",
                  borderRadius: layout.pillRadius,
                  paddingHorizontal: 13,
                  paddingVertical: 9,
                  opacity: pressed ? 0.82 : 1,
                })}
              >
                <Text style={[auraButtonTextStyle(colors, "secondary", false), { fontSize: 12 }]}>
                  Show all items
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => router.push({ pathname: "/(tabs)/add", params: { addSession: String(Date.now()) } })}
                style={({ pressed }) => ({
                  ...auraButtonStyle(colors, "primary", false),
                  alignSelf: "flex-start",
                  borderRadius: layout.pillRadius,
                  paddingHorizontal: 13,
                  paddingVertical: 9,
                  opacity: pressed ? 0.82 : 1,
                })}
              >
                <Text style={[auraButtonTextStyle(colors, "primary", false), { fontSize: 12 }]}>
                  Add item
                </Text>
              </Pressable>
            )}
          </View>
        }
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        extraData={`${Array.from(selectedIds).join(",")}:${cleanOnly}:${activeFilter}`}
        contentContainerStyle={{
          paddingTop: 12,
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: layout.bottomDockPadding + 112,
        }}
      />
    </View>
  );
}
