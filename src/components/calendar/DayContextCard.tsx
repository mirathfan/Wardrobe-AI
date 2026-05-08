import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

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
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const shouldShowWeatherAction =
    weatherPermission === "unknown" ||
    weatherPermission === "denied" ||
    weatherPermission === "blocked" ||
    weatherState === "error";

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: layout.largeRadius,
          padding: layout.cardPadding,
        },
      ]}
    >
      <Text style={[styles.greeting, { color: colors.textSecondary }]}>
        {greeting} • {timeLabel}
      </Text>
      <Text style={[styles.summary, { color: colors.text }]}>{eventSummary}</Text>
      {shouldShowWeatherAction ? (
        <Pressable
          style={[styles.weatherAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onWeatherAction}
        >
          <Text style={[styles.weatherActionText, { color: colors.text }]}>{weatherSummary}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.weather, { color: colors.textSecondary }]}>{weatherSummary}</Text>
      )}
      <Text style={[styles.tip, { color: colors.textSecondary }]}>{suggestion}</Text>
      {streak >= 2 ? <Text style={[styles.streak, { color: colors.textMuted }]}>Worn {streak} days in a row</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    gap: 6,
  },
  greeting: {
    fontSize: 13,
    fontWeight: "500",
  },
  summary: {
    fontSize: 13,
  },
  weather: {
    fontSize: 13,
  },
  weatherAction: {
    alignSelf: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  weatherActionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  tip: {
    fontSize: 12,
    fontWeight: "400",
  },
  streak: {
    fontSize: 12,
    fontWeight: "500",
  },
});
