import React, { useEffect, useMemo, useRef } from "react";
import { Dimensions, FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, View } from "react-native";

import { addDays, toDayKey } from "../utils/date";

const WINDOW_DAYS = 181;
const HALF = Math.floor(WINDOW_DAYS / 2);
const WIDTH = Dimensions.get("window").width;

type Props = {
  selectedDate: Date;
  onChangeDate: (date: Date) => void;
};

export default function CalendarDayPager({ selectedDate, onChangeDate }: Props) {
  const listRef = useRef<FlatList<Date>>(null);

  const dates = useMemo(() => {
    return Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(new Date(), i - HALF));
  }, []);

  const selectedKey = toDayKey(selectedDate);
  const initialIndex = useMemo(() => {
    const idx = dates.findIndex((d) => toDayKey(d) === selectedKey);
    return idx >= 0 ? idx : HALF;
  }, [dates, selectedKey]);

  useEffect(() => {
    const idx = dates.findIndex((d) => toDayKey(d) === selectedKey);
    if (idx >= 0) {
      listRef.current?.scrollToIndex({ index: idx, animated: false });
    }
  }, [dates, selectedKey]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / WIDTH);
    const next = dates[index];
    if (next && toDayKey(next) !== selectedKey) {
      onChangeDate(next);
    }
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        horizontal
        pagingEnabled
        data={dates}
        initialScrollIndex={initialIndex}
        keyExtractor={(item) => toDayKey(item)}
        renderItem={({ item }) => (
          <View style={styles.page}>
            <Text style={styles.pageText}>{new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(item)}</Text>
          </View>
        )}
        onMomentumScrollEnd={onMomentumEnd}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: WIDTH, offset: WIDTH * index, index })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 2,
    marginBottom: 4,
  },
  page: {
    width: WIDTH,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  pageText: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
});
