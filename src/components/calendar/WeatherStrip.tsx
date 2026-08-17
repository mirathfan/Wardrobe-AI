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
            day.selected ? [styles.cellSelected, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderStrong }] : null,
          ]}
        >
          <Text style={[styles.label, { color: day.selected ? colors.text : colors.textSecondary }]}>{day.label}</Text>
          <Text style={[styles.temp, { color: day.selected ? colors.text : colors.text }]}>
            {typeof day.high === "number" ? Math.round(day.high) : "—"}°
          </Text>
          <Text style={[styles.sub, { color: day.selected ? colors.textSecondary : colors.textSecondary }]}>
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
  label: { fontSize: 10, fontWeight: "500" },
  temp: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  sub: { fontSize: 10 },
});
