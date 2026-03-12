import { useMemo, useState } from "react";
import { PanResponder } from "react-native";

function startOfWeek(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - value.getDay());
  return value;
}

function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function useSelectedDay() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const today = useMemo(() => new Date(), []);

  const weekDates = useMemo(() => {
    const start = startOfWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [selectedDate]);

  const selectDate = (date: Date) => setSelectedDate(new Date(date));

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const horizontal = Math.abs(gesture.dx);
          const vertical = Math.abs(gesture.dy);
          return horizontal > 22 && horizontal > vertical;
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > 48) {
            setSelectedDate((prev) => {
              const next = new Date(prev);
              next.setDate(next.getDate() - 1);
              return next;
            });
            return;
          }

          if (gesture.dx < -48) {
            setSelectedDate((prev) => {
              const next = new Date(prev);
              next.setDate(next.getDate() + 1);
              return next;
            });
          }
        },
      }),
    []
  );

  return {
    selectedDate,
    today,
    weekDates,
    isSelectedToday: isSameLocalDate(selectedDate, today),
    selectDate,
    panHandlers: panResponder.panHandlers,
  };
}
