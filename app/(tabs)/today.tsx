import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";
import FlatLayCanvas from "@/src/components/outfit/FlatLayCanvas";
import { SafeScreen } from "@/src/components/SafeScreen";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { listenToItems, type ClosetItem } from "@/src/lib/items";
import { sanitizeDisplayText } from "@/src/lib/text";
import { subscribeOutfitByDate, type DailyOutfitRecord } from "@/src/utils/dailyOutfits";
import { formatHeaderDate, toDayKey } from "@/src/utils/date";

type SlotKey = "outerwear" | "top" | "bottom" | "shoes";

const SLOT_LABELS: Record<SlotKey, string> = {
  outerwear: "Outerwear",
  top: "Top",
  bottom: "Bottom",
  shoes: "Shoes",
};

function itemLabel(item: ClosetItem | null, fallback: string) {
  if (!item) return fallback;
  return (
    sanitizeDisplayText(item.name) ||
    sanitizeDisplayText(item.subCategory) ||
    sanitizeDisplayText(item.category) ||
    fallback
  );
}

export default function TodayScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  const uid = user?.uid ?? null;
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDayKey(today), [today]);
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [record, setRecord] = useState<DailyOutfitRecord | null>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [loadingOutfit, setLoadingOutfit] = useState(true);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoadingItems(false);
      router.replace("/(auth)/login");
      return;
    }

    setLoadingItems(true);
    return listenToItems(
      uid,
      (next) => {
        setItems(next);
        setLoadingItems(false);
      },
      {
        status: "ALL",
        sort: "NEWEST",
        onError: () => setLoadingItems(false),
      },
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setRecord(null);
      setLoadingOutfit(false);
      return;
    }

    setLoadingOutfit(true);
    return subscribeOutfitByDate(
      uid,
      todayKey,
      (next) => {
        setRecord(next);
        setLoadingOutfit(false);
      },
      () => {
        setRecord(null);
        setLoadingOutfit(false);
      },
    );
  }, [todayKey, uid]);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const planned = record?.plannedOutfit ?? null;
  const plannedItems = useMemo(
    () => ({
      outerwear: planned?.itemsByCategory.outerwear ? itemsById.get(planned.itemsByCategory.outerwear) ?? null : null,
      top: planned?.itemsByCategory.top ? itemsById.get(planned.itemsByCategory.top) ?? null : null,
      bottom: planned?.itemsByCategory.bottom ? itemsById.get(planned.itemsByCategory.bottom) ?? null : null,
      shoes: planned?.itemsByCategory.shoes ? itemsById.get(planned.itemsByCategory.shoes) ?? null : null,
    }),
    [itemsById, planned],
  );
  const hasPlannedOutfit = Boolean(planned);
  const loading = loadingItems || loadingOutfit;

  return (
    <SafeScreen backgroundColor={colors.background} contentStyle={styles.safeContent}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Today</Text>
          <Text style={styles.title}>{formatHeaderDate(today)}</Text>
          <Text style={styles.subtitle}>A focused view of what is planned for right now.</Text>
        </View>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.ctaCream} />
            <Text style={styles.muted}>Loading today...</Text>
          </View>
        ) : hasPlannedOutfit ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.cardEyebrow}>Planned outfit</Text>
                <Text style={styles.cardTitle}>Ready for today</Text>
              </View>
              {typeof planned?.score === "number" ? (
                <View style={styles.scorePill}>
                  <Text style={styles.scoreText}>{planned.score}%</Text>
                </View>
              ) : null}
            </View>

            <FlatLayCanvas items={plannedItems} />

            <View style={styles.slotList}>
              {(Object.keys(SLOT_LABELS) as SlotKey[]).map((slot) => (
                <View key={slot} style={styles.slotRow}>
                  <Text style={styles.slotName}>{SLOT_LABELS[slot]}</Text>
                  <Text style={styles.slotValue} numberOfLines={1}>
                    {itemLabel(plannedItems[slot], "Not planned")}
                  </Text>
                </View>
              ))}
            </View>

            {planned?.reasons?.length ? (
              <View style={styles.reasonBlock}>
                {planned.reasons.slice(0, 2).map((reason) => (
                  <Text key={reason} style={styles.reasonText}>
                    {reason}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.emptyIcon}>
              <Ionicons name="calendar-outline" size={22} color={colors.lightPurple} />
            </View>
            <Text style={styles.cardTitle}>No outfit planned yet</Text>
            <Text style={styles.muted}>Plan one from Calendar, or ask AURA to help you pull something together.</Text>
          </View>
        )}

        <View style={styles.actions}>
          <TodayAction
            icon="calendar-outline"
            label="Open Calendar"
            onPress={() => router.push("/(tabs)/calendar")}
          />
          <TodayAction
            icon="sparkles-outline"
            label="Ask AURA"
            primary
            onPress={() => router.push("/(tabs)/ai")}
          />
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function TodayAction({
  icon,
  label,
  primary,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.97}
      pressedOpacity={0.86}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 52,
        borderRadius: 16,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: primary ? colors.ctaCream : colors.surfaceSoft,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
        paddingHorizontal: 12,
      }}
    >
      <Ionicons name={icon} size={17} color={primary ? colors.ctaText : colors.text} />
      <Text style={{ color: primary ? colors.ctaText : colors.text, fontSize: 13, fontWeight: "900" }} numberOfLines={1}>
        {label}
      </Text>
    </AuraPressable>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>["colors"],
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    safeContent: {
      paddingHorizontal: layout.horizontalPadding,
    },
    content: {
      gap: 16,
      paddingBottom: 24,
    },
    header: {
      gap: 5,
      paddingTop: 4,
    },
    kicker: {
      color: colors.lightPurple,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    title: {
      color: colors.text,
      fontSize: 30 * layout.titleScale,
      lineHeight: 36 * layout.titleScale,
      fontWeight: "900",
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
    },
    card: {
      gap: 14,
      borderRadius: layout.largeRadius,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceGlass,
      padding: layout.cardPadding,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    cardEyebrow: {
      color: colors.lightPurple,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    cardTitle: {
      color: colors.text,
      fontSize: 20,
      lineHeight: 25,
      fontWeight: "900",
    },
    scorePill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.purpleBorder,
      backgroundColor: colors.purpleSurface,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    scoreText: {
      color: colors.lightPurple,
      fontSize: 12,
      fontWeight: "900",
    },
    slotList: {
      gap: 8,
    },
    slotRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    slotName: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: "800",
    },
    slotValue: {
      flex: 1,
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
      textAlign: "right",
    },
    reasonBlock: {
      gap: 6,
    },
    reasonText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600",
    },
    muted: {
      color: colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    emptyIcon: {
      width: 42,
      height: 42,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.purpleSurface,
      borderWidth: 1,
      borderColor: colors.purpleBorder,
    },
    actions: {
      flexDirection: "row",
      gap: 10,
    },
  });
}
