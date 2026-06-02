import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import AuraAgentOutfitCard from "@/src/components/aura/AuraAgentOutfitCard";
import AppImage from "@/src/components/common/AppImage";
import { SafeScreen } from "@/src/components/SafeScreen";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
import { AuraSkeleton } from "@/src/components/ui/AuraSkeleton";
import {
  AuraTopSafeAreaScrim,
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getAuraPlanningWeatherContext } from "@/src/lib/auraPlanningWeather";
import {
  logAuraAgentOutfitWearClient,
  planAuraAgentOutfitClient,
} from "@/src/lib/auraStylingAgent";
import { runHaptic } from "@/src/lib/haptics";
import { formatCalendarDateLabel, toOutfitDateKey } from "@/src/lib/outfitDate";
import {
  deleteSavedOutfit,
  formatSavedOutfitDate,
  getSavedOutfit,
  savedOutfitItemCount,
  savedOutfitSubtitle,
  savedOutfitToAgentOutfit,
  type SavedOutfitItem,
  type SavedOutfitRecord,
} from "@/src/lib/savedOutfits";
import { Toast } from "@/src/lib/toast";

type BusyAction = "wear" | "plan-today" | "plan-tomorrow" | "plan-friday" | "delete" | null;

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function nextWeekday(from: Date, weekday: number) {
  const next = new Date(from);
  const delta = (weekday - next.getDay() + 7) % 7 || 7;
  next.setDate(next.getDate() + delta);
  return next;
}

function ActionButton({
  label,
  icon,
  variant = "secondary",
  busy = false,
  disabled = false,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "secondary" | "tertiary" | "danger";
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        styles.actionButton,
        auraButtonStyle(colors, variant, disabled || busy, variant === "primary" ? "default" : "compact"),
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={variant === "primary" ? colors.primaryText : colors.textSecondary} />
      ) : icon ? (
        <Ionicons
          name={icon}
          size={16}
          color={variant === "primary" ? colors.primaryText : variant === "danger" ? colors.danger : colors.textSecondary}
        />
      ) : null}
      <Text style={[auraButtonTextStyle(colors, variant, disabled || busy), styles.actionButtonText]}>{label}</Text>
    </Pressable>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <Text style={[auraTypography.eyebrow, { color: colors.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

function ItemRow({ item }: { item: SavedOutfitItem }) {
  const { colors } = useAppTheme();
  const meta = [item.brand, item.subcategory || item.category, item.colors.slice(0, 3).join(", ")]
    .filter(Boolean)
    .join(" - ");
  return (
    <View style={[styles.itemRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
      <View style={[styles.itemImageFrame, { borderColor: colors.borderSoft, backgroundColor: colors.surfaceBase }]}>
        {item.imageUrl ? (
          <AppImage source={{ uri: item.imageUrl }} resizeMode="contain" style={styles.itemImage} />
        ) : (
          <Ionicons name="shirt-outline" size={18} color={colors.textMuted} />
        )}
      </View>
      <View style={styles.itemCopy}>
        <Text style={[styles.itemRole, { color: colors.textMuted }]}>{item.role.replace(/_/g, " ")}</Text>
        <Text numberOfLines={2} style={[styles.itemName, { color: colors.text }]}>
          {item.name}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={[auraTypography.caption, { color: colors.textSecondary }]}>
            {meta}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function SavedOutfitDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const [record, setRecord] = useState<SavedOutfitRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.uid || !id) {
        setRecord(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await getSavedOutfit(user.uid, id);
        if (cancelled) return;
        setRecord(next);
        setError(next ? null : "This saved outfit could not be found.");
      } catch {
        if (!cancelled) setError("This saved outfit could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, user?.uid]);

  const outfit = useMemo(() => (record ? savedOutfitToAgentOutfit(record) : null), [record]);
  const subtitle = record ? savedOutfitSubtitle(record) : "";
  const savedDate = record ? formatSavedOutfitDate(record.savedAt) : "";
  const itemCount = record ? savedOutfitItemCount(record) : 0;
  const dateOptions = useMemo(() => {
    const now = new Date();
    const options = [
      { key: "plan-today" as const, label: "Today", date: now },
      { key: "plan-tomorrow" as const, label: "Tomorrow", date: addDays(now, 1) },
      { key: "plan-friday" as const, label: "Friday", date: nextWeekday(now, 5) },
    ];
    const seen = new Set<string>();
    return options.filter((option) => {
      const dateKey = toOutfitDateKey(option.date);
      if (seen.has(dateKey)) return false;
      seen.add(dateKey);
      return true;
    });
  }, []);

  const actionContext = useMemo(
    () => ({
      query: record?.sourceQuery ?? "Saved outfit",
      agentRunId: record?.sourceAgentRunId ?? null,
      sourceMessageId: record?.sourceMessageId ?? null,
    }),
    [record?.sourceAgentRunId, record?.sourceMessageId, record?.sourceQuery],
  );

  const onWearToday = useCallback(async () => {
    if (!outfit) return;
    setBusyAction("wear");
    const dateKey = toOutfitDateKey(new Date());
    try {
      const result = await logAuraAgentOutfitWearClient({
        outfit,
        ...actionContext,
        dateKey,
        wornAt: new Date(),
      });
      Toast.success(result.alreadyLogged ? "Already worn" : "Marked as worn", "Added to Calendar for today.");
      await runHaptic("success");
    } catch {
      Toast.error("Could not log outfit", "Try again in a moment.");
      await runHaptic("error");
    } finally {
      setBusyAction(null);
    }
  }, [actionContext, outfit]);

  const onPlan = useCallback(
    async (date: Date, busyKey: BusyAction) => {
      if (!outfit) return;
      const dateKey = toOutfitDateKey(date);
      setBusyAction(busyKey);
      try {
        const weatherContext = await getAuraPlanningWeatherContext(dateKey);
        const result = await planAuraAgentOutfitClient({
          outfit,
          ...actionContext,
          dateKey,
          weatherContext,
        });
        const warning = result.weatherWarnings?.[0]?.message;
        Toast.success(
          result.alreadyPlanned ? "Already planned" : "Planned outfit",
          warning || `Added to Calendar for ${formatCalendarDateLabel(dateKey)}.`,
        );
        await runHaptic("success");
      } catch {
        Toast.error("Could not plan outfit", "Try again in a moment.");
        await runHaptic("error");
      } finally {
        setBusyAction(null);
      }
    },
    [actionContext, outfit],
  );

  const onRemix = useCallback(() => {
    if (!record) return;
    router.push({
      pathname: "/(tabs)/ai",
      params: {
        prompt: `Remix ${record.title}`,
        promptKey: `saved-remix-${record.id}-${Date.now()}`,
        requiredItemIds: record.itemIds.join(","),
      },
    });
  }, [record]);

  const onDelete = useCallback(() => {
    if (!user?.uid || !record) return;
    Alert.alert(
      "Remove saved outfit?",
      "This removes it from your lookbook. Calendar plans and worn logs stay intact.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setBusyAction("delete");
            deleteSavedOutfit(user.uid, record.id)
              .then(async () => {
                Toast.success("Removed", "Saved outfit removed from your lookbook.");
                await runHaptic("success");
                router.back();
              })
              .catch(async () => {
                Toast.error("Could not remove outfit", "Try again in a moment.");
                await runHaptic("error");
              })
              .finally(() => setBusyAction(null));
          },
        },
      ],
    );
  }, [record, user?.uid]);

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={{ flex: 1 }}>
      <AuraTopSafeAreaScrim color={colors.background} />
      <AuraSubpageHeader title="Saved Outfit" eyebrow="LOOKBOOK" fallbackRoute="/saved-outfits" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 8,
          paddingBottom: layout.bottomDockPadding + 56,
        }}
      >
        {loading ? (
          <>
            <AuraSkeleton height={420} radius={layout.largeRadius} />
            <AuraSkeleton height={120} radius={layout.mediumRadius} />
          </>
        ) : null}

        {!loading && error ? (
          <View style={[auraCardStyle(colors, "card"), styles.errorCard]}>
            <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Could not open this outfit.</Text>
            <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{error}</Text>
          </View>
        ) : null}

        {!loading && record && outfit ? (
          <>
            <AuraAgentOutfitCard colors={colors} outfit={outfit} showDetails={false} showDevDetails={false} />

            <View style={[auraCardStyle(colors, "card"), styles.summaryCard]}>
              <Text style={[auraTypography.eyebrow, { color: colors.textMuted }]}>Saved outfit</Text>
              <Text style={[styles.title, { color: colors.text }]}>{record.title}</Text>
              {subtitle ? (
                <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{subtitle}</Text>
              ) : null}
              <Text style={[auraTypography.caption, { color: colors.textMuted }]}>
                {itemCount} {itemCount === 1 ? "piece" : "pieces"}{savedDate ? ` - Saved ${savedDate}` : ""}
              </Text>
            </View>

            <View style={styles.actionGrid}>
              <ActionButton
                label="Wear Today"
                icon="checkmark-circle-outline"
                variant="primary"
                busy={busyAction === "wear"}
                disabled={Boolean(busyAction)}
                onPress={onWearToday}
              />
              <ActionButton
                label="Ask AURA to Remix"
                icon="sparkles-outline"
                disabled={Boolean(busyAction)}
                onPress={onRemix}
              />
            </View>

            <View style={[auraCardStyle(colors, "card"), styles.planCard]}>
              <View style={styles.planHeader}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Plan this outfit</Text>
                  <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
                    Add it to Calendar with weather warnings when available.
                  </Text>
                </View>
                <Ionicons name="calendar-outline" size={19} color={colors.textSecondary} />
              </View>
              <View style={styles.dateButtonRow}>
                {dateOptions.map((option) => (
                  <ActionButton
                    key={option.key}
                    label={option.label}
                    icon="add-circle-outline"
                    busy={busyAction === option.key}
                    disabled={Boolean(busyAction)}
                    onPress={() => onPlan(option.date, option.key)}
                  />
                ))}
              </View>
            </View>

            <DetailSection title="Pieces">
              <View style={styles.itemsList}>
                {record.items.map((item) => (
                  <ItemRow key={`${item.role}-${item.itemId}`} item={item} />
                ))}
              </View>
            </DetailSection>

            {record.explanation ? (
              <DetailSection title="Why this works">
                <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{record.explanation}</Text>
              </DetailSection>
            ) : null}

            {record.stylingTips.length ? (
              <DetailSection title="Styling tips">
                <View style={styles.noteList}>
                  {record.stylingTips.map((tip, index) => (
                    <Text key={`${tip}-${index}`} style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                      {tip}
                    </Text>
                  ))}
                </View>
              </DetailSection>
            ) : null}

            {record.missingItems.length ? (
              <DetailSection title="Optional additions">
                <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                  {record.missingItems.join(", ")}
                </Text>
              </DetailSection>
            ) : null}

            {record.sourceQuery ? (
              <DetailSection title="Source prompt">
                <Text style={[auraTypography.caption, { color: colors.textMuted }]}>{record.sourceQuery}</Text>
              </DetailSection>
            ) : null}

            <ActionButton
              label="Remove Saved Outfit"
              icon="trash-outline"
              variant="danger"
              busy={busyAction === "delete"}
              disabled={Boolean(busyAction)}
              onPress={onDelete}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  errorCard: {
    gap: 8,
    padding: 18,
  },
  summaryCard: {
    gap: 8,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 30,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionButton: {
    flexDirection: "row",
    gap: 8,
    minWidth: 150,
  },
  actionButtonText: {
    fontSize: 13,
  },
  planCard: {
    gap: 14,
    padding: 16,
  },
  planHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  dateButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  section: {
    gap: 10,
  },
  itemsList: {
    gap: 10,
  },
  itemRow: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 10,
  },
  itemImageFrame: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    height: 68,
    justifyContent: "center",
    overflow: "hidden",
    width: 62,
  },
  itemImage: {
    height: "100%",
    width: "100%",
  },
  itemCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  itemRole: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    lineHeight: 13,
    textTransform: "uppercase",
  },
  itemName: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  noteList: {
    gap: 7,
  },
});
