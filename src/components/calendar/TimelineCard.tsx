import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { DayEvent } from "../../hooks/useDayEvents";

type Props = { events: DayEvent[] };

export default function TimelineCard({ events }: Props) {
  if (!events.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.muted}>No timeline items for this day.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {events.map((event) => {
        const hour = event.startDate.getHours();
        return (
          <View key={event.id} style={styles.row}>
            <Text style={styles.hour}>{`${hour.toString().padStart(2, "0")}:00`}</Text>
            <View style={styles.block}>
              <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
              <Text style={styles.time}>{event.timeLabel}</Text>
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
    borderColor: "#dedede",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff",
  },
  row: { flexDirection: "row", gap: 10, marginBottom: 8 },
  hour: { width: 44, color: "#6b7280", fontWeight: "700", fontSize: 12 },
  block: { flex: 1, borderRadius: 10, backgroundColor: "#f6f7f8", padding: 8 },
  title: { color: "#111", fontWeight: "700" },
  time: { marginTop: 2, color: "#666", fontSize: 12 },
  muted: { color: "#666" },
});
