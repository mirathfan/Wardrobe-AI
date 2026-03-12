import { useMemo, useState } from "react";
import { PanResponder } from "react-native";

import { addDays, isSameLocalDate, startOfWeek } from "../utils/date";

export function useSelectedDate() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const today = useMemo(() => new Date(), []);

  const weekDates = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [selectedDate]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const horizontal = Math.abs(gesture.dx);
          const vertical = Math.abs(gesture.dy);
          return horizontal > 24 && horizontal > vertical;
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 52) {
            setSelectedDate((prev) => addDays(prev, -1));
            return;
          }
          if (gesture.dx < -52) {
            setSelectedDate((prev) => addDays(prev, 1));
          }
        },
      }),
    []
  );

  return {
    selectedDate,
    setSelectedDate,
    weekDates,
    today,
    isToday: isSameLocalDate(selectedDate, today),
    panHandlers: panResponder.panHandlers,
  };
}
