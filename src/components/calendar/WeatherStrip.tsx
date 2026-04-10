import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/src/hooks/useAppTheme";

type Day = { label: string; high?: number; low?: number; selected?: boolean };

type Props = { days: Day[] };

export default function WeatherStrip({ days }: Props) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      {days.map((day) => (
        <View
          key={day.label}
          style={[
            styles.cell,
            { borderColor: colors.border, backgroundColor: colors.surface },
            day.selected ? [styles.cellSelected, { backgroundColor: colors.accent, borderColor: colors.accent }] : null,
          ]}
        >
          <Text style={[styles.label, { color: colors.textSecondary }, day.selected ? styles.labelSelected : null]}>{day.label}</Text>
          <Text style={[styles.temp, { color: colors.text }, day.selected ? styles.labelSelected : null]}>
            {typeof day.high === "number" ? Math.round(day.high) : "—"}°
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }, day.selected ? styles.labelSelected : null]}>
            {typeof day.low === "number" ? Math.round(day.low) : "—"}°
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 6 },
  cell: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 6,
    alignItems: "center",
  },
  cellSelected: {},
  label: { fontSize: 10, fontWeight: "700" },
  temp: { fontSize: 12, fontWeight: "800", marginTop: 2 },
  sub: { fontSize: 10 },
  labelSelected: { color: "#fff" },
});
