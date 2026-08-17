import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
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
    borderColor: Colors.dark.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.dark.chipBackground,
  },
  dayChipSelected: {
    backgroundColor: Colors.dark.purpleSurface,
    borderColor: Colors.dark.purpleBorder,
  },
  dayChipLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "700",
  },
  dayChipNumber: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "800",
    color: Colors.dark.text,
  },
  dayChipLabelSelected: {
    color: Colors.dark.ctaCream,
  },
  todayDot: {
    marginTop: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.ctaCream,
  },
  todayDotSelected: {
    backgroundColor: Colors.dark.ctaCream,
  },
});
