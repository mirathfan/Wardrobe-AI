import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatHeaderDate } from "../../utils/date";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type Props = {
  selectedDate: Date;
  today: Date;
  onJumpToToday: () => void;
};

export default function CalendarHeader({ selectedDate, today, onJumpToToday }: Props) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(selectedDate);

  const isToday =
    selectedDate.getFullYear() === today.getFullYear() &&
    selectedDate.getMonth() === today.getMonth() &&
    selectedDate.getDate() === today.getDate();

  return (
    <View style={[styles.wrap, { gap: 8 }]}>
      <Text style={[styles.kicker, { color: colors.textSecondary }]}>Plan the week</Text>
      <Text style={[styles.title, { color: colors.text, fontSize: 30 * layout.titleScale }]}>Calendar</Text>
      <Text style={[styles.date, { color: colors.textSecondary }]}>{formatHeaderDate(selectedDate)}</Text>
      <View style={styles.row}>
        <Text style={[styles.month, { color: colors.text }]}>{monthLabel}</Text>
        {!isToday ? (
          <Pressable
            onPress={onJumpToToday}
            style={[styles.todayBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[styles.todayBtnText, { color: colors.text }]}>Jump to Today</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  kicker: { fontSize: 13, fontWeight: "700" },
  title: { fontWeight: "900" },
  date: { marginTop: 2, fontSize: 14 },
  row: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  month: { fontSize: 16, fontWeight: "800" },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  todayBtnText: { fontSize: 12, fontWeight: "700" },
});
