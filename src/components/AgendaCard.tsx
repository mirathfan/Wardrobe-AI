import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DayEvent } from "../hooks/useDayEvents";

type Props = {
  permission: "unknown" | "granted" | "denied" | "blocked";
  state: "idle" | "loading" | "ready" | "error";
  events: DayEvent[];
  moreCount: number;
  timelineVibe: string;
  onPermissionAction: () => void;
};

export default function AgendaCard({
  permission,
  state,
  events,
  moreCount,
  timelineVibe,
  onPermissionAction,
}: Props) {
  return (
    <View style={styles.card}>
      {permission === "unknown" || permission === "denied" ? (
        <Pressable style={styles.linkBtn} onPress={onPermissionAction}>
          <Text style={styles.linkText}>Connect calendar</Text>
        </Pressable>
      ) : permission === "blocked" ? (
        <Pressable style={styles.linkBtn} onPress={onPermissionAction}>
          <Text style={styles.linkText}>Enable calendar in Settings</Text>
        </Pressable>
      ) : state === "loading" ? (
        <Text style={styles.muted}>Reading today&apos;s events…</Text>
      ) : state === "error" ? (
        <Pressable style={styles.linkBtn} onPress={onPermissionAction}>
          <Text style={styles.linkText}>Calendar unavailable · Retry</Text>
        </Pressable>
      ) : events.length === 0 ? (
        <Text style={styles.muted}>No events today</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {events.map((event) => (
            <View key={event.id} style={styles.row}>
              <Text style={styles.time}>{event.timeLabel}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {event.title}
                </Text>
                {event.location ? (
                  <Text style={styles.location} numberOfLines={1}>
                    {event.location}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {moreCount > 0 ? <Text style={styles.muted}>+{moreCount} more</Text> : null}
        </View>
      )}

      <View style={styles.separator} />
      <Text style={styles.vibeLabel}>Timeline vibe</Text>
      <Text style={styles.vibeValue}>{timelineVibe}</Text>
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
  muted: {
    color: "#666",
  },
  linkBtn: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
  },
  linkText: {
    color: "#111",
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  time: {
    minWidth: 78,
    color: "#111",
    fontWeight: "700",
    fontSize: 12,
  },
  title: {
    color: "#222",
    fontWeight: "600",
  },
  location: {
    marginTop: 2,
    color: "#6b7280",
    fontSize: 12,
  },
  separator: {
    marginVertical: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e7e7e7",
  },
  vibeLabel: {
    color: "#666",
    fontSize: 12,
    fontWeight: "700",
  },
  vibeValue: {
    marginTop: 4,
    color: "#111",
    fontWeight: "700",
  },
});
