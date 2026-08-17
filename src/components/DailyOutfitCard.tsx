import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { ClothingItem } from "../../src/types/ClothingItem";
import { DailyOutfitRecord, PlannedOutfit } from "../utils/dailyOutfits";
import { lookToItems, PlannedLook } from "../utils/outfitPlanning";
import FlatLayCanvas from "@/src/components/outfit/FlatLayCanvas";
import CalendarOutfitEventCard from "@/src/components/calendar/CalendarOutfitEventCard";
import { homeTypography } from "@/src/components/home/homeTypography";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  filterOutfitItemsToLiveCloset,
  getMissingClosetItemIds,
} from "@/src/lib/outfitLiveCloset";
import AuraPressable from "@/src/components/aura/AuraPressable";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  auraChipStyle,
  auraChipTextStyle,
} from "@/src/components/ui/auraStylePrimitives";
import {
  buildOutfitCalendarEvents,
  type OutfitCalendarEventStatus,
} from "@/src/lib/outfitCalendar";

type SlotKey = "outerwear" | "top" | "bottom" | "shoes";

type Props = {
  dateLabel: string;
  isPastDate: boolean;
  record: DailyOutfitRecord | null;
  looks: PlannedLook[];
  selectedLookId: PlannedLook["id"];
  itemsById: Map<string, ClothingItem>;
  thinking: boolean;
  onSelectLook: (id: PlannedLook["id"]) => void;
  onUseOutfit: () => void;
  onWhy: () => void;
  onMarkWorn: () => void;
  onClearPlan: () => void;
  onCopyPlan: () => void;
  onSwapSlot: (slot: SlotKey) => void;
  onOpenOutfitEvent?: (status: OutfitCalendarEventStatus) => void;
};

function plannedToLook(planned: PlannedOutfit): PlannedLook {
  return {
    id: "casual",
    label: planned.title || "Planned",
    slotItemIds: {
      outerwear: planned.itemsByCategory.outerwear ?? null,
      top: planned.itemsByCategory.top ?? null,
      bottom: planned.itemsByCategory.bottom ?? null,
      shoes: planned.itemsByCategory.shoes ?? null,
    },
    score: planned.score,
    reasons: planned.reasons,
  };
}

function PrimaryActionButton({
  label,
  colors,
  onPress,
  disabled = false,
}: {
  label: string;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <AuraPressable
      accessibilityRole="button"
      haptic="light"
      disabled={disabled}
      pressedScale={0.97}
      pressedOpacity={0.9}
      style={[
        styles.primaryBtn,
        auraButtonStyle(colors, "primary"),
        {
          shadowColor: colors.ctaCream,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[colors.ctaCream, colors.ctaCream]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={[auraButtonTextStyle(colors, "primary"), styles.primaryBtnText]}>{label}</Text>
    </AuraPressable>
  );
}

export default function DailyOutfitCard({
  dateLabel,
  isPastDate,
  record,
  looks,
  selectedLookId,
  itemsById,
  thinking,
  onSelectLook,
  onUseOutfit,
  onMarkWorn,
  onClearPlan,
  onCopyPlan,
  onWhy,
  onOpenOutfitEvent,
}: Props) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const liveItemIds = React.useMemo(() => new Set(itemsById.keys()), [itemsById]);
  const missingItemIds = React.useMemo(
    () => getMissingClosetItemIds(record, liveItemIds),
    [liveItemIds, record],
  );
  const displayRecord = React.useMemo(
    () => filterOutfitItemsToLiveCloset(record, liveItemIds),
    [liveItemIds, record],
  );
  const hasMissingItems = missingItemIds.length > 0;
  const hasWorn = !!displayRecord?.wornOutfit;
  const hasPlanned = !!displayRecord?.plannedOutfit;
  const activeOutfitMeta = displayRecord?.wornOutfit ?? displayRecord?.plannedOutfit ?? null;
  const weatherWarnings = activeOutfitMeta?.weatherWarnings ?? [];
  const isAuraSource = activeOutfitMeta?.source === "aura_agent" || activeOutfitMeta?.source === "aura";
  const title = activeOutfitMeta?.title;
  const calendarEvents = React.useMemo(
    () => buildOutfitCalendarEvents(displayRecord),
    [displayRecord],
  );

  const activeLook = hasPlanned
    ? plannedToLook(displayRecord?.plannedOutfit as PlannedOutfit)
    : looks.find((look) => look.id === selectedLookId) ?? looks[0] ?? null;

  const gridItems = activeLook
    ? lookToItems(activeLook, itemsById)
    : { outerwear: null, top: null, bottom: null, shoes: null };

  return (
    <View
      style={[
        styles.card,
        auraCardStyle(colors, "card"),
        {
          borderColor: colors.border,
          borderRadius: layout.largeRadius,
          padding: layout.cardPadding,
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 3 }}>
          {hasMissingItems ? (
            <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Outfit needs an update</Text>
          ) : hasWorn ? (
            <Text style={[homeTypography.titleSmall, { color: colors.text }]}>{title || `Worn on ${dateLabel}`}</Text>
          ) : hasPlanned ? (
            <Text style={[homeTypography.titleSmall, { color: colors.text }]}>{title || "Planned"}</Text>
          ) : (
            <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Plan outfit for this day</Text>
          )}
          {hasWorn || hasPlanned ? (
            <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>
              {hasWorn ? "Worn" : "Planned"}{isAuraSource ? " · AURA" : ""}
            </Text>
          ) : null}
        </View>
        {weatherWarnings.length ? (
          <View
            accessibilityLabel="Weather warning"
            style={[styles.warningIcon, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
          >
            <Ionicons name="warning-outline" size={16} color={colors.textSecondary} />
          </View>
        ) : null}
      </View>

      {!hasWorn && !hasPlanned ? (
        <View style={styles.segRow}>
          {looks.map((look) => {
            const active = look.id === selectedLookId;
            return (
              <Pressable
                key={look.id}
                style={[
                  styles.segChip,
                  auraChipStyle(colors, active ? "selected" : "filter"),
                  {
                  },
                ]}
                onPress={() => onSelectLook(look.id)}
              >
                <Text style={[homeTypography.caption, auraChipTextStyle(colors, active ? "selected" : "filter")]}>{look.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {thinking ? <Text style={[homeTypography.caption, styles.thinking, { color: colors.textSecondary }]}>Planning...</Text> : null}
      <View style={{ height: 10 }} />
      {calendarEvents.length ? (
        <View style={styles.eventList}>
          {calendarEvents.map((event) => (
            <CalendarOutfitEventCard
              key={event.id}
              event={event}
              itemsById={itemsById}
              compact
              onPress={() => (onOpenOutfitEvent ? onOpenOutfitEvent(event.status) : onWhy())}
            />
          ))}
        </View>
      ) : (
        <FlatLayCanvas items={gridItems} />
      )}

      {hasMissingItems ? (
        <View style={[styles.removedNotice, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
          <Text style={[homeTypography.bodySmall, { color: colors.text }]}>Removed from closet</Text>
          <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>
            {missingItemIds.length === 1
              ? "1 planned piece is no longer in your closet."
              : `${missingItemIds.length} planned pieces are no longer in your closet.`}
          </Text>
        </View>
      ) : null}

      {activeLook ? (
        <View style={styles.scoreWrap}>
          <Text style={[homeTypography.bodySmall, styles.score, { color: colors.textSecondary }]}>Styling note</Text>
          {(activeLook.reasons ?? []).slice(0, 2).map((reason) => (
            <Text key={reason} style={[homeTypography.caption, styles.reason, { color: colors.textSecondary }]}>{reason}</Text>
          ))}
        </View>
      ) : null}

      {weatherWarnings.length ? (
        <View style={[styles.weatherWarningBox, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
          {weatherWarnings.slice(0, 2).map((warning) => (
            <Text key={warning.message} style={[homeTypography.caption, { color: colors.textSecondary }]}>
              {warning.message}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {hasWorn ? (
          <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>Outfit already marked worn.</Text>
        ) : hasPlanned ? (
          <PrimaryActionButton
            label="Mark Worn"
            colors={colors}
            onPress={onMarkWorn}
            disabled={hasMissingItems}
          />
        ) : (
          <PrimaryActionButton label="Use this outfit" colors={colors} onPress={onUseOutfit} />
        )}
      </View>

      {hasMissingItems && hasPlanned && !hasWorn ? (
        <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>
          Clear this plan or swap the removed piece before marking it worn.
        </Text>
      ) : null}

      {hasPlanned && !hasWorn ? (
        <View style={styles.textActions}>
          <Pressable onPress={onClearPlan}><Text style={[homeTypography.caption, styles.textAction, { color: colors.textSecondary }]}>Clear plan</Text></Pressable>
          <Pressable onPress={onCopyPlan}><Text style={[homeTypography.caption, styles.textAction, { color: colors.textSecondary }]}>Copy this plan to…</Text></Pressable>
        </View>
      ) : null}

      {!hasPlanned && !hasWorn && looks.length === 0 ? (
        <Pressable
          onPress={() => Alert.alert("No plan", "Add more items (top/bottom/shoes) to generate suggestions.")}
          style={[styles.linkBtn, { backgroundColor: colors.chipBackground, borderColor: colors.border }]}
        >
          <Text style={[homeTypography.caption, styles.linkText, { color: colors.textSecondary }]}>No outfit suggestions yet</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0,
  },
  segRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  warningIcon: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  segChip: {
    paddingHorizontal: 12,
  },
  segText: {
    fontWeight: "700",
    fontSize: 12,
  },
  thinking: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "500",
  },
  scoreWrap: {
    marginTop: 10,
    gap: 4,
  },
  eventList: {
    gap: 10,
  },
  removedNotice: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    marginTop: 10,
    padding: 10,
  },
  weatherWarningBox: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    marginTop: 10,
    padding: 10,
  },
  score: {
    fontWeight: "500",
  },
  reason: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.65,
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  primaryBtn: {
    minWidth: 190,
    alignSelf: "flex-start",
    overflow: "hidden",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  primaryBtnText: {
    fontSize: 15,
  },
  secondaryBtn: {
    minHeight: 44,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  textActions: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  textAction: {
    fontWeight: "500",
  },
  linkBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  linkText: {
    fontWeight: "600",
  },
});
