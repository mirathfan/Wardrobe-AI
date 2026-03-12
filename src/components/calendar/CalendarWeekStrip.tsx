import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
              {status.streak ? <Text style={styles.fire}>🔥</Text> : <View style={styles.dotSpacer} />}
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
    borderColor: "#ddd",
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    paddingVertical: 8,
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
    backgroundColor: "#3b82f6",
  },
  check: {
    fontSize: 9,
    color: "#16a34a",
    fontWeight: "900",
    lineHeight: 9,
  },
  fire: {
    fontSize: 9,
    lineHeight: 9,
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
    backgroundColor: "#111",
  },
  todayDotActive: {
    backgroundColor: "#fff",
  },
});
