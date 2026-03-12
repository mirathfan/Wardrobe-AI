import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatDayNumber, formatWeekLabel, isSameLocalDate } from "../utils/streak";

type Props = {
  weekDates: Date[];
  selectedDate: Date;
  today: Date;
  onSelect: (date: Date) => void;
};

export default function WeekStrip({ weekDates, selectedDate, today, onSelect }: Props) {
  return (
    <View style={styles.weekStrip}>
      {weekDates.map((day) => {
        const selected = isSameLocalDate(day, selectedDate);
        const isToday = isSameLocalDate(day, today);
        return (
          <Pressable
            key={day.toISOString()}
            onPress={() => onSelect(day)}
            style={[styles.dayChip, selected ? styles.dayChipSelected : null]}
          >
            <Text style={[styles.dayChipLabel, selected ? styles.dayChipLabelSelected : null]}>
              {formatWeekLabel(day)}
            </Text>
            <Text style={[styles.dayChipNumber, selected ? styles.dayChipLabelSelected : null]}>
              {formatDayNumber(day)}
            </Text>
            {isToday ? <View style={[styles.todayDot, selected ? styles.todayDotSelected : null]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  weekStrip: {
    marginTop: 14,
    marginBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  dayChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  dayChipSelected: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  dayChipLabel: {
    fontSize: 11,
    color: "#666",
    fontWeight: "700",
  },
  dayChipNumber: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "800",
    color: "#111",
  },
  dayChipLabelSelected: {
    color: "#fff",
  },
  todayDot: {
    marginTop: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#111",
  },
  todayDotSelected: {
    backgroundColor: "#fff",
  },
});
