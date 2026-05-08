import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DayEvent } from "../hooks/useDayEvents";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

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
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          borderRadius: layout.mediumRadius,
          backgroundColor: colors.surface,
          padding: layout.cardPadding,
        },
      ]}
    >
      {permission === "unknown" || permission === "denied" ? (
        <Pressable style={[styles.linkBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]} onPress={onPermissionAction}>
          <Text style={[styles.linkText, { color: colors.text }]}>Connect calendar</Text>
        </Pressable>
      ) : permission === "blocked" ? (
        <Pressable style={[styles.linkBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]} onPress={onPermissionAction}>
          <Text style={[styles.linkText, { color: colors.text }]}>Enable calendar in Settings</Text>
        </Pressable>
      ) : state === "loading" ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>Reading today&apos;s events…</Text>
      ) : state === "error" ? (
        <Pressable style={[styles.linkBtn, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]} onPress={onPermissionAction}>
          <Text style={[styles.linkText, { color: colors.text }]}>Calendar unavailable · Retry</Text>
        </Pressable>
      ) : events.length === 0 ? (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            padding: 12,
            gap: 5,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>Open day</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
            No calendar events here. AURA can bias this day toward comfort, weather, and your planned outfit.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {events.map((event) => (
            <View key={event.id} style={styles.row}>
              <Text style={[styles.time, { color: colors.text }]}>{event.timeLabel}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                  {event.title}
                </Text>
                {event.location ? (
                  <Text style={[styles.location, { color: colors.textSecondary }]} numberOfLines={1}>
                    {event.location}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {moreCount > 0 ? <Text style={[styles.muted, { color: colors.textSecondary }]}>+{moreCount} more</Text> : null}
        </View>
      )}

      <View style={[styles.separator, { backgroundColor: colors.border }]} />
      <Text style={[styles.vibeLabel, { color: colors.textSecondary }]}>Day rhythm</Text>
      <Text style={[styles.vibeValue, { color: colors.text }]}>{timelineVibe}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  muted: {
  },
  linkBtn: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  linkText: {
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  time: {
    minWidth: 78,
    fontWeight: "500",
    fontSize: 12,
  },
  title: {
    fontWeight: "600",
  },
  location: {
    marginTop: 2,
    fontSize: 12,
  },
  separator: {
    marginVertical: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e7e7e7",
  },
  vibeLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  vibeValue: {
    marginTop: 4,
    fontWeight: "600",
  },
});
