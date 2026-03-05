import React, { useEffect, useMemo, useRef } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { addDays, isSameLocalDate, toDayKey } from "../../utils/date";

type Status = {
  planned?: boolean;
  worn?: boolean;
  streak?: boolean;
};

type Props = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  statuses?: Record<string, Status>;
};

const WINDOW = 365 * 2 + 1;
const HALF = Math.floor(WINDOW / 2);
const ITEM_WIDTH = 62;

export default function DateRail({ selectedDate, onSelectDate, statuses = {} }: Props) {
  const listRef = useRef<FlatList<Date>>(null);

  const dates = useMemo(
    () => Array.from({ length: WINDOW }, (_, index) => addDays(new Date(), index - HALF)),
    []
  );

  const selectedKey = toDayKey(selectedDate);

  const selectedIndex = useMemo(() => {
    const index = dates.findIndex((date) => toDayKey(date) === selectedKey);
    return index >= 0 ? index : HALF;
  }, [dates, selectedKey]);

  useEffect(() => {
    listRef.current?.scrollToIndex({
      index: selectedIndex,
      animated: true,
      viewPosition: 0.5,
    });
  }, [selectedIndex]);

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={dates}
      keyExtractor={(item) => toDayKey(item)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      snapToAlignment="center"
      decelerationRate="fast"
      getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })}
      renderItem={({ item }) => {
        const isActive = isSameLocalDate(item, selectedDate);
        const key = toDayKey(item);
        const dayStatus = statuses[key];
        return (
          <Pressable
            style={[styles.cell, isActive ? styles.cellActive : null]}
            onPress={() => onSelectDate(item)}
          >
            <Text style={[styles.week, isActive ? styles.activeText : null]}>
              {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(item)}
            </Text>
            <Text style={[styles.day, isActive ? styles.activeText : null]}>
              {new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(item)}
            </Text>
            <View style={styles.indicatorRow}>
              {dayStatus?.planned ? <View style={styles.planDot} /> : null}
              {dayStatus?.worn ? <Text style={styles.check}>✓</Text> : null}
              {dayStatus?.streak ? <Text style={styles.fire}>🔥</Text> : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  cell: {
    width: ITEM_WIDTH - 6,
    marginHorizontal: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    alignItems: "center",
    paddingVertical: 8,
  },
  cellActive: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  week: {
    fontSize: 11,
    color: "#6b7280",
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
  indicatorRow: {
    marginTop: 4,
    minHeight: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  planDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
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
});

