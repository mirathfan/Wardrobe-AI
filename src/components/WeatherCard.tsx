import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
import { DailyWeather } from "../utils/weatherDaily";

const colors = Colors.dark;

type Props = {
  permission: "unknown" | "granted" | "denied" | "blocked";
  state: "idle" | "loading" | "ready" | "error";
  weather: DailyWeather | null;
  onPermissionAction: () => void;
};

export default function WeatherCard({ permission, state, weather, onPermissionAction }: Props) {
  const summary =
    weather && (typeof weather.highC === "number" || typeof weather.lowC === "number")
      ? `High ${typeof weather.highC === "number" ? Math.round(weather.highC) : "—"}° • Low ${typeof weather.lowC === "number" ? Math.round(weather.lowC) : "—"}° • ${weather.conditionLabel ?? "Weather"}`
      : null;

  return (
    <View style={styles.card}>
      {permission === "unknown" || permission === "denied" ? (
        <Pressable style={styles.linkBtn} onPress={onPermissionAction}>
          <Text style={styles.linkText}>Enable weather insights</Text>
        </Pressable>
      ) : permission === "blocked" ? (
        <Pressable style={styles.linkBtn} onPress={onPermissionAction}>
          <Text style={styles.linkText}>Enable weather in Settings</Text>
        </Pressable>
      ) : state === "loading" ? (
        <Text style={styles.muted}>Fetching weather…</Text>
      ) : state === "error" ? (
        <Pressable style={styles.linkBtn} onPress={onPermissionAction}>
          <Text style={styles.linkText}>Weather unavailable · Retry</Text>
        </Pressable>
      ) : summary ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.summary}>{summary}</Text>
          {typeof weather?.nowC === "number" ? (
            <Text style={styles.muted}>Now {Math.round(weather.nowC)}°</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.muted}>Weather unavailable</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    backgroundColor: colors.surface,
  },
  summary: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  muted: {
    color: colors.textSecondary,
  },
  linkBtn: {
    alignSelf: "flex-start",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.chipBackground,
  },
  linkText: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
});
