import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
import { auraButtonStyle, auraButtonTextStyle, auraSurfaceTiers, auraTypography } from "@/src/components/ui/auraStylePrimitives";
import AppImage from "@/src/components/common/AppImage";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { runHaptic } from "@/src/lib/haptics";
import { getBestThumbnailImageSource } from "@/src/lib/itemImage";
import {
  listenToItems,
  normalizeLaundryStatus,
  updateLaundryStatuses,
  updateLaundryStatus,
} from "@/src/lib/items";
import { sanitizeDisplayText } from "@/src/lib/text";
import { Toast } from "@/src/lib/toast";
import type { ClosetItem, LaundryStatus } from "@/src/lib/items";

type LaundryTab = LaundryStatus;

const TABS: { key: LaundryTab; label: string; helper: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "needs_wash", label: "Needs wash", helper: "Ready for care", icon: "alert-circle-outline" },
  { key: "in_laundry", label: "In laundry", helper: "Out of rotation", icon: "shirt-outline" },
  { key: "clean", label: "Clean", helper: "Ready to wear", icon: "checkmark-circle-outline" },
];

function itemTitle(item: ClosetItem) {
  return (
    sanitizeDisplayText(item.name) ||
    [sanitizeDisplayText(item.primaryColor), sanitizeDisplayText(item.subCategory || item.category)].filter(Boolean).join(" ") ||
    "Wardrobe item"
  );
}

export default function LaundryScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const uid = user?.uid ?? null;
  const [allItems, setAllItems] = useState<ClosetItem[]>([]);
  const [tab, setTab] = useState<LaundryTab>("in_laundry");
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setAllItems([]);
      setLoading(false);
      router.replace("/(auth)/login");
      return;
    }

    setAllItems([]);
    setLoading(true);
    return listenToItems(
      uid,
      (next) => {
        setAllItems(next);
        setLoading(false);
      },
      {
        status: "ALL",
        sort: "NEWEST",
        onError: () => setLoading(false),
      }
    );
  }, [uid]);

  const buckets = useMemo(() => {
    const next: Record<LaundryTab, ClosetItem[]> = {
      needs_wash: [],
      in_laundry: [],
      clean: [],
    };
    allItems.forEach((item) => {
      next[normalizeLaundryStatus(item)].push(item);
    });
    return next;
  }, [allItems]);

  const listItems = buckets[tab];
  const canMoveNeedsWash = buckets.needs_wash.length > 0;
  const canMarkLaundryClean = buckets.in_laundry.length > 0;

  const setItemLaundryStatus = useCallback(async (itemId: string, status: LaundryStatus) => {
    if (!uid) return router.replace("/(auth)/login");
    try {
      setSavingStatus(`${itemId}:${status}`);
      await updateLaundryStatus(uid, itemId, status);
      void runHaptic("light");
      Toast.laundryUpdated(
        status === "clean"
          ? "Piece is clean and ready."
          : status === "in_laundry"
            ? "Piece moved to laundry."
            : "Piece marked needs wash.",
      );
    } catch (error: any) {
      Toast.error("Laundry update failed", error?.message ?? "Could not update that item.");
    } finally {
      setSavingStatus(null);
    }
  }, [uid]);

  const bulkUpdate = useCallback(async (from: LaundryTab, to: LaundryStatus) => {
    if (!uid) return router.replace("/(auth)/login");
    const source = buckets[from];
    if (!source.length) return;
    try {
      setSavingStatus(`bulk:${from}:${to}`);
      await updateLaundryStatuses(uid, source.map((item) => item.id), to);
      if (to === "in_laundry") setTab("in_laundry");
      if (to === "clean") setTab("clean");
      void runHaptic("light");
      Toast.laundryUpdated(
        to === "clean" ? "Batch marked clean." : "Batch moved to laundry.",
      );
    } catch (error: any) {
      Toast.error("Laundry update failed", error?.message ?? "Could not update laundry.");
    } finally {
      setSavingStatus(null);
    }
  }, [buckets, uid]);

  const renderLaundryItem = useCallback(
    ({ item }: { item: ClosetItem }) => (
      <LaundryRow
        item={item}
        disabled={!!savingStatus}
        activeStatus={normalizeLaundryStatus(item)}
        onStatus={setItemLaundryStatus}
      />
    ),
    [savingStatus, setItemLaundryStatus],
  );

  const Header = useMemo(() => (
    <View style={{ gap: 16, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {TABS.map((status) => (
          <StatusCard
            key={status.key}
            active={tab === status.key}
            label={status.label}
            helper={status.helper}
            icon={status.icon}
            count={buckets[status.key].length}
            onPress={() => setTab(status.key)}
          />
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <ActionButton
            label="Move needs wash"
            icon="arrow-forward"
            disabled={!canMoveNeedsWash || !!savingStatus}
            onPress={() => bulkUpdate("needs_wash", "in_laundry")}
          />
          <ActionButton
            label="Mark laundry clean"
            icon="sparkles-outline"
            disabled={!canMarkLaundryClean || !!savingStatus}
            primary
            onPress={() => bulkUpdate("in_laundry", "clean")}
          />
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
          {!canMoveNeedsWash && !canMarkLaundryClean
            ? "No valid batch actions yet. Move pieces from Closet or tell AURA what you washed."
            : "Batch actions only apply when that status has items."}
        </Text>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={[auraTypography.cardTitle, { color: colors.text }]}>
          {TABS.find((entry) => entry.key === tab)?.label}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
          {listItems.length} item{listItems.length === 1 ? "" : "s"}
        </Text>
      </View>
    </View>
  ), [
    buckets,
    canMarkLaundryClean,
    canMoveNeedsWash,
    colors.text,
    colors.textSecondary,
    listItems.length,
    savingStatus,
    tab,
    bulkUpdate,
  ]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <AuraSubpageHeader
          title="Laundry"
          eyebrow="AURA LAUNDRY"
          fallbackRoute="/"
        />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
          <ActivityIndicator color={colors.ctaCream} />
          <Text style={{ color: colors.textSecondary }}>Loading laundry...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AuraSubpageHeader
        title="Laundry"
        eyebrow="AURA LAUNDRY"
        fallbackRoute="/"
      />
      <FlatList
        data={listItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 12,
          paddingBottom: layout.bottomDockPadding + 28,
          gap: 10,
        }}
        ListHeaderComponent={Header}
        ListEmptyComponent={<PremiumEmptyState />}
        renderItem={renderLaundryItem}
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={40}
        windowSize={7}
        extraData={savingStatus}
      />
    </View>
  );
}

function StatusCard(props: {
  active: boolean;
  label: string;
  helper: string;
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      onPress={props.onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.97}
      pressedOpacity={0.86}
      style={{
        flex: 1,
        minHeight: 118,
        borderRadius: 18,
        padding: 12,
        gap: 8,
        ...(props.active ? auraSurfaceTiers.surfaceInteractive : auraSurfaceTiers.surfaceBase),
        borderColor: props.active ? colors.purpleBorder : colors.border,
      }}
    >
      <View style={{ width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: props.active ? colors.purpleSurfaceStrong : colors.chipBackground }}>
        <Ionicons name={props.icon} size={17} color={props.active ? colors.lightPurple : colors.textSecondary} />
      </View>
      <Text style={[auraTypography.screenTitle, { color: colors.text, fontSize: 23, lineHeight: 28 }]}>{props.count}</Text>
      <View style={{ gap: 2 }}>
        <Text style={[auraTypography.chipLabel, { color: colors.text, fontWeight: "900" }]} numberOfLines={1}>
          {props.label}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 11, lineHeight: 15 }} numberOfLines={2}>
          {props.helper}
        </Text>
      </View>
    </AuraPressable>
  );
}

function ActionButton(props: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  primary?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      onPress={props.onPress}
      disabled={props.disabled}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.97}
      pressedOpacity={0.82}
      disabledOpacity={0.42}
      style={{
        ...auraButtonStyle(colors, props.primary ? "primary" : "secondary", props.disabled),
        flex: 1,
        flexDirection: "row",
        gap: 7,
        minHeight: 46,
        borderRadius: 14,
      }}
    >
      <Ionicons name={props.icon} size={16} color={props.primary ? colors.ctaText : colors.text} />
      <Text style={[auraButtonTextStyle(colors, props.primary ? "primary" : "secondary", props.disabled), { fontSize: 13, lineHeight: 17 }]} numberOfLines={1}>
        {props.label}
      </Text>
    </AuraPressable>
  );
}

function PremiumEmptyState() {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        marginTop: 4,
        borderRadius: 22,
        padding: 18,
        gap: 14,
        ...auraSurfaceTiers.surfaceBase,
      }}
    >
      <View style={{ gap: 6 }}>
        <Text style={[auraTypography.cardTitle, { color: colors.text }]}>No items in laundry</Text>
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          Tell AURA what you washed or move items from Closet.
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <ActionButton label="Ask AURA" icon="chatbubble-ellipses-outline" primary onPress={() => router.push("/(tabs)/ai")} />
        <ActionButton label="Browse Closet" icon="grid-outline" onPress={() => router.push("/(tabs)/closet")} />
      </View>
    </View>
  );
}

const LaundryRow = React.memo(function LaundryRow({
  item,
  activeStatus,
  disabled,
  onStatus,
}: {
  item: ClosetItem;
  activeStatus: LaundryStatus;
  disabled?: boolean;
  onStatus: (itemId: string, status: LaundryStatus) => void;
}) {
  const { colors } = useAppTheme();
  const imageSource = getBestThumbnailImageSource(item);
  const statusLabel = TABS.find((entry) => entry.key === activeStatus)?.label ?? "Clean";
  return (
    <View
      style={{
        borderRadius: 18,
        padding: 12,
        ...auraSurfaceTiers.surfaceBase,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: colors.boardLight,
            borderWidth: 1,
            borderColor: colors.borderWarm,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {imageSource ? (
            <AppImage source={imageSource} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
          ) : (
            <Ionicons name="shirt-outline" size={24} color={colors.textOnLightSecondary} />
          )}
        </View>
        <Pressable
          onPress={() => router.push({ pathname: "/(tabs)/item/[id]", params: { id: item.id, sourceTab: "laundry", sourceRoute: "/(tabs)/laundry" } })}
          style={{ flex: 1, gap: 3 }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }} numberOfLines={1}>
            {itemTitle(item)}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5 }} numberOfLines={1}>
            {[sanitizeDisplayText(item.brand), sanitizeDisplayText(item.primaryColor)].filter(Boolean).join(" · ") || "No brand"}
          </Text>
          <Text style={{ color: colors.lightPurple, fontSize: 11.5, fontWeight: "800" }}>{statusLabel}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <RowAction label="Needs wash" disabled={disabled || activeStatus === "needs_wash"} onPress={() => onStatus(item.id, "needs_wash")} />
        <RowAction label="Move to laundry" disabled={disabled || activeStatus === "in_laundry"} onPress={() => onStatus(item.id, "in_laundry")} />
        <RowAction label="Mark as washed" disabled={disabled || activeStatus === "clean"} primary onPress={() => onStatus(item.id, "clean")} />
      </View>
    </View>
  );
});

function RowAction({ label, disabled, primary, onPress }: { label: string; disabled?: boolean; primary?: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      onPress={onPress}
      disabled={disabled}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.96}
      pressedOpacity={0.76}
      disabledOpacity={0.42}
      style={{
        ...auraButtonStyle(colors, primary ? "primary" : "tertiary", disabled),
        minHeight: 36,
        borderRadius: 999,
        paddingHorizontal: 11,
        paddingVertical: 8,
      }}
    >
      <Text style={[auraButtonTextStyle(colors, primary ? "primary" : "tertiary", disabled), { fontSize: 12, lineHeight: 16 }]}>
        {label}
      </Text>
    </AuraPressable>
  );
}
