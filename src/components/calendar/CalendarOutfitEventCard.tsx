import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import FlatLayCanvas from "@/src/components/outfit/FlatLayCanvas";
import {
  auraCardStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  outfitCalendarItemCount,
  outfitCalendarSourceLabel,
  outfitCalendarStatusLabel,
  type OutfitCalendarEvent,
} from "@/src/lib/outfitCalendar";
import type { ClothingItem } from "@/src/types/ClothingItem";

type Props = {
  event: OutfitCalendarEvent;
  itemsById: Map<string, ClothingItem>;
  onPress: () => void;
  compact?: boolean;
};

export const CALENDAR_OUTFIT_PREVIEW_WIDTH = 148;
export const CALENDAR_OUTFIT_COMPACT_PREVIEW_WIDTH = 136;

function canvasItems(event: OutfitCalendarEvent, itemsById: Map<string, ClothingItem>) {
  return {
    outerwear: event.itemsByCategory.outerwear ? itemsById.get(event.itemsByCategory.outerwear) ?? null : null,
    top: event.itemsByCategory.top ? itemsById.get(event.itemsByCategory.top) ?? null : null,
    bottom: event.itemsByCategory.bottom ? itemsById.get(event.itemsByCategory.bottom) ?? null : null,
    shoes: event.itemsByCategory.shoes ? itemsById.get(event.itemsByCategory.shoes) ?? null : null,
  };
}

export default function CalendarOutfitEventCard({ event, itemsById, onPress, compact = false }: Props) {
  const { colors } = useAppTheme();
  const itemCount = outfitCalendarItemCount(event);
  const hasWeatherWarnings = event.weatherWarnings.length > 0;
  const previewWidth = compact ? CALENDAR_OUTFIT_COMPACT_PREVIEW_WIDTH : CALENDAR_OUTFIT_PREVIEW_WIDTH;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${outfitCalendarStatusLabel(event.status)} outfit, ${event.title}`}
      onPress={onPress}
      style={[
        styles.card,
        auraCardStyle(colors, "inset"),
        {
          borderColor: event.status === "worn" ? colors.purpleBorder : colors.border,
          backgroundColor: event.status === "worn" ? colors.surfaceInteractive : colors.surfaceMuted,
        },
      ]}
    >
      <View
        style={[
          styles.canvasFrame,
          {
            width: previewWidth,
            height: previewWidth,
          },
        ]}
      >
        <FlatLayCanvas
          items={canvasItems(event, itemsById)}
          previewWidth={previewWidth}
        />
      </View>
      <View style={styles.copy}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: colors.chipBackground, borderColor: colors.border }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {outfitCalendarStatusLabel(event.status)}
            </Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
            <Text style={[styles.badgeText, { color: colors.textMuted }]}>
              {outfitCalendarSourceLabel(event.source)}
            </Text>
          </View>
          {hasWeatherWarnings ? (
            <View
              accessibilityLabel="Weather warning"
              style={[styles.iconBadge, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}
            >
              <Ionicons name="warning-outline" size={13} color={colors.textSecondary} />
            </View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
          {event.title}
        </Text>
        <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
          {itemCount} {itemCount === 1 ? "piece" : "pieces"}
          {hasWeatherWarnings ? " - weather note" : ""}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    overflow: "hidden",
    padding: 10,
  },
  canvasFrame: {
    alignItems: "center",
    borderRadius: 18,
    flexShrink: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
  copy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  badgeRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
    lineHeight: 11,
    textTransform: "uppercase",
  },
  iconBadge: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 19,
  },
});
