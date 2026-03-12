import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Day = { label: string; high?: number; low?: number; selected?: boolean };

type Props = { days: Day[] };

export default function WeatherStrip({ days }: Props) {
  return (
    <View style={styles.row}>
      {days.map((day) => (
        <View key={day.label} style={[styles.cell, day.selected ? styles.cellSelected : null]}>
          <Text style={[styles.label, day.selected ? styles.labelSelected : null]}>{day.label}</Text>
          <Text style={[styles.temp, day.selected ? styles.labelSelected : null]}>
            {typeof day.high === "number" ? Math.round(day.high) : "—"}°
          </Text>
          <Text style={[styles.sub, day.selected ? styles.labelSelected : null]}>
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
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  cellSelected: { backgroundColor: "#111", borderColor: "#111" },
  label: { fontSize: 10, color: "#666", fontWeight: "700" },
  temp: { fontSize: 12, color: "#111", fontWeight: "800", marginTop: 2 },
  sub: { fontSize: 10, color: "#666" },
  labelSelected: { color: "#fff" },
});
