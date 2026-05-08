import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { addDays, toDayKey } from "../../utils/date";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { useAppTheme } from "@/src/hooks/useAppTheme";

type Status = {
  planned?: boolean;
  worn?: boolean;
  streak?: boolean;
};

type RailWeather = {
  high?: number;
  low?: number;
  label?: string;
};

type Props = {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  statuses?: Record<string, Status>;
  weatherByDate?: Record<string, RailWeather>;
};

type RailDate = {
  date: Date;
  key: string;
  weekdayLabel: string;
  dayLabel: string;
};

const WINDOW = 365 * 2 + 1;
const HALF = Math.floor(WINDOW / 2);
const ITEM_WIDTH = 78;
const RAIL_SIDE_PADDING = 8;

function formatWeatherLine(weather?: RailWeather) {
  const high = typeof weather?.high === "number" ? Math.round(weather.high) : null;
  const low = typeof weather?.low === "number" ? Math.round(weather.low) : null;
  if (high !== null || low !== null) {
    return `${high ?? "—"}°/${low ?? "—"}°`;
  }
  return weather?.label ?? "";
}

export default function DateRail({ selectedDate, onSelectDate, statuses = {}, weatherByDate = {} }: Props) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<RailDate>>(null);
  const didInitialScrollRef = useRef(false);

  const dates = useMemo(
    () =>
      Array.from({ length: WINDOW }, (_, index) => {
        const date = addDays(new Date(), index - HALF);
        return {
          date,
          key: toDayKey(date),
          weekdayLabel: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
          dayLabel: new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(date),
        };
      }),
    []
  );

  const selectedKey = toDayKey(selectedDate);

  const selectedIndex = useMemo(() => {
    const index = dates.findIndex((date) => date.key === selectedKey);
    return index >= 0 ? index : HALF;
  }, [dates, selectedKey]);

  const renderDate = useCallback(
    ({ item }: { item: RailDate }) => {
      const isActive = item.key === selectedKey;
      const dayStatus = statuses[item.key];
      const weatherLine = formatWeatherLine(weatherByDate[item.key]);
      const weekdayColor = isActive ? colors.text : colors.textSecondary;
      const dayColor = colors.text;
      const weatherColor = isActive ? colors.textSecondary : colors.textMuted;
      const markerColor = isActive ? colors.accent : colors.textSecondary;
      return (
        <AuraPressable
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.96}
          pressedOpacity={0.88}
          style={[
            styles.cell,
            { borderColor: colors.border, backgroundColor: colors.surfaceSoft },
            isActive
              ? [
                  styles.cellActive,
                  {
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.borderStrong,
                    shadowColor: colors.shadow,
                  },
                ]
              : null,
          ]}
          onPress={() => onSelectDate(item.date)}
        >
          <Text style={[styles.week, { color: weekdayColor }]} numberOfLines={1}>
            {item.weekdayLabel}
          </Text>
          <Text style={[styles.day, { color: dayColor }]} numberOfLines={1}>
            {item.dayLabel}
          </Text>
          <View style={styles.weatherSlot}>
            {weatherLine ? (
              <Text
                style={[styles.weather, { color: weatherColor }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {weatherLine}
              </Text>
            ) : null}
          </View>
          <View style={styles.indicatorRow}>
            {dayStatus?.planned ? <View style={[styles.planDot, { backgroundColor: markerColor }]} /> : null}
            {dayStatus?.worn ? <Text style={[styles.check, { color: isActive ? colors.accent : colors.success }]}>✓</Text> : null}
            {dayStatus?.streak ? <View style={[styles.streakDot, { backgroundColor: isActive ? colors.accent : colors.borderStrong }]} /> : null}
          </View>
        </AuraPressable>
      );
    },
    [
      colors.border,
      colors.accent,
      colors.borderStrong,
      colors.surfaceElevated,
      colors.shadow,
      colors.surfaceSoft,
      colors.success,
      colors.text,
      colors.textMuted,
      colors.textSecondary,
      onSelectDate,
      selectedKey,
      statuses,
      weatherByDate,
    ],
  );

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
      keyExtractor={(item) => item.key}
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
      renderItem={renderDate}
      removeClippedSubviews={false}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={7}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: RAIL_SIDE_PADDING,
  },
  cell: {
    width: ITEM_WIDTH - 6,
    marginHorizontal: 3,
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 5,
  },
  cellActive: {
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  week: {
    fontSize: 11,
    fontWeight: "500",
  },
  day: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: "600",
  },
  weatherSlot: {
    minHeight: 14,
    marginTop: 3,
    justifyContent: "center",
  },
  weather: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "500",
  },
  indicatorRow: {
    marginTop: 3,
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
    fontWeight: "700",
    lineHeight: 9,
  },
  streakDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
