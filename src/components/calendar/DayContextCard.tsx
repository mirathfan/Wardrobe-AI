import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type PermissionState = "unknown" | "granted" | "denied" | "blocked";
type LoadState = "idle" | "loading" | "ready" | "error";

type Props = {
  greeting: string;
  timeLabel: string;
  eventSummary: string;
  weatherSummary: string;
  suggestion: string;
  streak?: number;
  weatherPermission: PermissionState;
  weatherState: LoadState;
  onWeatherAction: () => void;
};

export default function DayContextCard({
  greeting,
  timeLabel,
  eventSummary,
  weatherSummary,
  suggestion,
  streak = 0,
  weatherPermission,
  weatherState,
  onWeatherAction,
}: Props) {
  const shouldShowWeatherAction =
    weatherPermission === "unknown" ||
    weatherPermission === "denied" ||
    weatherPermission === "blocked" ||
    weatherState === "error";

  return (
    <View style={styles.card}>
      <Text style={styles.greeting}>
        {greeting} • {timeLabel}
      </Text>
      <Text style={styles.summary}>{eventSummary}</Text>
      {shouldShowWeatherAction ? (
        <Pressable style={styles.weatherAction} onPress={onWeatherAction}>
          <Text style={styles.weatherActionText}>{weatherSummary}</Text>
        </Pressable>
      ) : (
        <Text style={styles.weather}>{weatherSummary}</Text>
      )}
      <Text style={styles.tip}>{suggestion}</Text>
      {streak >= 2 ? <Text style={styles.streak}>🔥 Outfit streak: {streak} days</Text> : null}
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
    gap: 6,
  },
  greeting: {
    fontSize: 13,
    color: "#111",
    fontWeight: "700",
  },
  summary: {
    color: "#1f2937",
    fontSize: 13,
  },
  weather: {
    color: "#1f2937",
    fontSize: 13,
  },
  weatherAction: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  weatherActionText: {
    color: "#111",
    fontSize: 12,
    fontWeight: "700",
  },
  tip: {
    color: "#4b5563",
    fontSize: 12,
    fontWeight: "600",
  },
  streak: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "700",
  },
});

