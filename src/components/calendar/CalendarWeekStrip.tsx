import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
import { formatDayNumber, formatWeekLabel, isSameLocalDate, toDayKey } from "../../utils/date";

type DayStatus = {
  planned?: boolean;
  worn?: boolean;
  streak?: boolean;
};

type Props = {
  days: Date[];
  selectedDate: Date;
  today: Date;
  statuses?: Record<string, DayStatus>;
  onSelectDay: (date: Date) => void;
};

export default function CalendarWeekStrip({ days, selectedDate, today, statuses = {}, onSelectDay }: Props) {
  return (
    <View style={styles.row}>
      {days.map((day) => {
        const isSelected = isSameLocalDate(day, selectedDate);
        const isToday = isSameLocalDate(day, today);
        const status = statuses[toDayKey(day)] ?? {};

        return (
          <Pressable
            key={day.toISOString()}
            onPress={() => onSelectDay(day)}
            style={[styles.pill, isSelected ? styles.pillActive : null]}
          >
            <Text style={[styles.week, isSelected ? styles.activeText : null]}>{formatWeekLabel(day)}</Text>
            <Text style={[styles.day, isSelected ? styles.activeText : null]}>{formatDayNumber(day)}</Text>

            <View style={styles.indicators}>
              {status.planned ? <View style={[styles.dot, styles.planDot]} /> : <View style={styles.dotSpacer} />}
              {status.worn ? <Text style={[styles.check, isSelected ? styles.activeText : null]}>✓</Text> : <View style={styles.dotSpacer} />}
              {status.streak ? <View style={styles.streakDot} /> : <View style={styles.dotSpacer} />}
            </View>

            {isToday ? <View style={[styles.todayDot, isSelected ? styles.todayDotActive : null]} /> : null}
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
    borderColor: Colors.dark.border,
    borderRadius: 12,
    backgroundColor: Colors.dark.chipBackground,
    alignItems: "center",
    paddingVertical: 8,
  },
  pillActive: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderColor: Colors.dark.borderStrong,
  },
  week: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    fontWeight: "500",
  },
  day: {
    marginTop: 2,
    fontSize: 16,
    color: Colors.dark.text,
    fontWeight: "600",
  },
  activeText: {
    color: Colors.dark.textPrimary,
  },
  indicators: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 12,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  planDot: {
    backgroundColor: Colors.dark.ctaCream,
  },
  check: {
    fontSize: 9,
    color: Colors.dark.success,
    fontWeight: "700",
    lineHeight: 9,
  },
  streakDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.borderStrong,
  },
  dotSpacer: {
    width: 5,
    height: 5,
  },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    backgroundColor: Colors.dark.ctaCream,
  },
  todayDotActive: {
    backgroundColor: Colors.dark.ctaCream,
  },
});
