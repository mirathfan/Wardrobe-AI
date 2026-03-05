import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatHeaderDate } from "../../utils/date";

type Props = {
  selectedDate: Date;
  today: Date;
  onJumpToToday: () => void;
};

export default function CalendarHeader({ selectedDate, today, onJumpToToday }: Props) {
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(selectedDate);

  const isToday =
    selectedDate.getFullYear() === today.getFullYear() &&
    selectedDate.getMonth() === today.getMonth() &&
    selectedDate.getDate() === today.getDate();

  return (
    <View>
      <Text style={styles.title}>Calendar</Text>
      <Text style={styles.date}>{formatHeaderDate(selectedDate)}</Text>
      <View style={styles.row}>
        <Text style={styles.month}>{monthLabel}</Text>
        {!isToday ? (
          <Pressable onPress={onJumpToToday} style={styles.todayBtn}>
            <Text style={styles.todayBtnText}>Jump to Today</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, fontWeight: "800" },
  date: { marginTop: 4, color: "#666" },
  row: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  month: { fontSize: 16, fontWeight: "700", color: "#111" },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  todayBtnText: { fontSize: 12, fontWeight: "700", color: "#111" },
});
