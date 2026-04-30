import React, { useEffect, useMemo, useRef } from "react";
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { addDays, isSameLocalDate, toDayKey } from "../../utils/date";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { useAppTheme } from "@/src/hooks/useAppTheme";

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
const RAIL_SIDE_PADDING = 24;

export default function DateRail({ selectedDate, onSelectDate, statuses = {} }: Props) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Date>>(null);
  const didInitialScrollRef = useRef(false);

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
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: selectedIndex,
        viewPosition: 0.5,
        animated: didInitialScrollRef.current,
      });
      didInitialScrollRef.current = true;
    }, 80);
    return () => clearTimeout(timer);
  }, [selectedIndex, width]);

  return (
    <FlatList
      ref={listRef}
      horizontal
      data={dates}
      keyExtractor={(item) => toDayKey(item)}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      initialScrollIndex={Math.max(0, selectedIndex - 1)}
      onScrollToIndexFailed={(info) => {
        requestAnimationFrame(() => {
          listRef.current?.scrollToOffset({
            offset: Math.max(0, info.averageItemLength * info.index - ITEM_WIDTH * 2),
            animated: false,
          });
        });
      }}
      snapToAlignment="center"
      decelerationRate="fast"
      getItemLayout={(_, index) => ({ length: ITEM_WIDTH, offset: ITEM_WIDTH * index, index })}
      renderItem={({ item }) => {
        const isActive = isSameLocalDate(item, selectedDate);
        const key = toDayKey(item);
        const dayStatus = statuses[key];
        return (
          <AuraPressable
            haptic="selection"
            hapticTrigger="press"
            pressedScale={0.96}
            pressedOpacity={0.88}
            style={[
              styles.cell,
              { borderColor: colors.border, backgroundColor: colors.surface },
              isActive ? [styles.cellActive, { backgroundColor: colors.accent, borderColor: colors.accent }] : null,
            ]}
            onPress={() => onSelectDate(item)}
          >
            <Text style={[styles.week, { color: colors.textSecondary }, isActive ? styles.activeText : null]}>
              {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(item)}
            </Text>
            <Text style={[styles.day, { color: colors.text }, isActive ? styles.activeText : null]}>
              {new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(item)}
            </Text>
            <View style={styles.indicatorRow}>
              {dayStatus?.planned ? <View style={[styles.planDot, { backgroundColor: colors.aiAccent }]} /> : null}
              {dayStatus?.worn ? <Text style={styles.check}>✓</Text> : null}
              {dayStatus?.streak ? <Text style={styles.fire}>🔥</Text> : null}
            </View>
          </AuraPressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 8,
    paddingHorizontal: RAIL_SIDE_PADDING,
  },
  cell: {
    width: ITEM_WIDTH - 6,
    marginHorizontal: 3,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  cellActive: {
  },
  week: {
    fontSize: 11,
    fontWeight: "700",
  },
  day: {
    marginTop: 2,
    fontSize: 16,
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
