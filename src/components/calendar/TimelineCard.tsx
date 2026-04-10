import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { DayEvent } from "../../hooks/useDayEvents";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type Props = { events: DayEvent[] };

export default function TimelineCard({ events }: Props) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  if (!events.length) {
    return (
      <View
        style={[
          styles.card,
          {
            borderColor: colors.border,
            backgroundColor: colors.surface,
            borderRadius: layout.mediumRadius,
            padding: layout.cardPadding,
          },
        ]}
      >
        <Text style={[styles.muted, { color: colors.textSecondary }]}>No timeline items for this day.</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout.mediumRadius,
          padding: layout.cardPadding,
        },
      ]}
    >
      {events.map((event) => {
        const hour = event.startDate.getHours();
        return (
          <View key={event.id} style={styles.row}>
            <Text style={[styles.hour, { color: colors.textSecondary }]}>{`${hour.toString().padStart(2, "0")}:00`}</Text>
            <View style={[styles.block, { backgroundColor: colors.overlay }]}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{event.title}</Text>
              <Text style={[styles.time, { color: colors.textSecondary }]}>{event.timeLabel}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  row: { flexDirection: "row", gap: 10, marginBottom: 8 },
  hour: { width: 44, fontWeight: "700", fontSize: 12 },
  block: { flex: 1, borderRadius: 14, padding: 10 },
  title: { fontWeight: "700" },
  time: { marginTop: 2, fontSize: 12 },
  muted: {},
});
