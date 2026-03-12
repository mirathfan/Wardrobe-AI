import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatDayNumber, formatWeekLabel, isSameLocalDate } from "../utils/date";

type Props = {
  days: Date[];
  selectedDate: Date;
  today: Date;
  onSelectDay: (date: Date) => void;
};

export default function CalendarWeekStrip({ days, selectedDate, today, onSelectDay }: Props) {
  return (
    <View style={styles.row}>
      {days.map((day) => {
        const isSelected = isSameLocalDate(day, selectedDate);
        const isToday = isSameLocalDate(day, today);

        return (
          <Pressable
            key={day.toISOString()}
            onPress={() => onSelectDay(day)}
            style={[styles.pill, isSelected ? styles.pillActive : null]}
          >
            <Text style={[styles.week, isSelected ? styles.activeText : null]}>{formatWeekLabel(day)}</Text>
            <Text style={[styles.day, isSelected ? styles.activeText : null]}>{formatDayNumber(day)}</Text>
            {isToday ? <View style={[styles.dot, isSelected ? styles.dotActive : null]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: 14,
    marginBottom: 18,
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    paddingVertical: 9,
  },
  pillActive: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  week: {
    fontSize: 11,
    color: "#666",
    fontWeight: "700",
  },
  day: {
    marginTop: 2,
    fontSize: 16,
    color: "#111",
    fontWeight: "800",
  },
  activeText: {
    color: "#fff",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 5,
    backgroundColor: "#111",
  },
  dotActive: {
    backgroundColor: "#fff",
  },
});
