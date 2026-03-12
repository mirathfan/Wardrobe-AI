import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";

import { isSameLocalDate } from "../utils/date";
import { formatTimeLabel } from "../utils/time";

type CalendarState = "idle" | "loading" | "ready" | "error";
type PermissionState = "unknown" | "granted" | "denied" | "blocked";

export type DayEvent = {
  id: string;
  title: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  timeLabel: string;
};

let CalendarModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  CalendarModule = require("expo-calendar");
} catch {
  CalendarModule = null;
}

export function useDayEvents(selectedDate: Date) {
  const [state, setState] = useState<CalendarState>("idle");
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [events, setEvents] = useState<DayEvent[]>([]);
  const [moreCount, setMoreCount] = useState(0);

  const loadEvents = useCallback(async () => {
    if (!CalendarModule) {
      setState("error");
      return;
    }

    setState("loading");
    try {
      const calendars = await CalendarModule.getCalendarsAsync(CalendarModule.EntityTypes.EVENT);
      const calendarIds = calendars.map((calendar: { id: string }) => calendar.id).filter(Boolean);

      if (calendarIds.length === 0) {
        setEvents([]);
        setMoreCount(0);
        setState("ready");
        return;
      }

      const start = new Date(selectedDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);

      const raw = await CalendarModule.getEventsAsync(calendarIds, start, end);
      const mapped = raw
        .map((event: any) => {
          const startDate = new Date(event.startDate);
          const endDate = new Date(event.endDate ?? event.startDate);
          const sameDay = isSameLocalDate(startDate, endDate);
          const timeLabel = sameDay
            ? `${formatTimeLabel(startDate)} - ${formatTimeLabel(endDate)}`
            : `${formatTimeLabel(startDate)}`;
          return {
            id: String(event.id),
            title: String(event.title || "Untitled"),
            location: event.location ? String(event.location) : undefined,
            startDate,
            endDate,
            timeLabel,
          } as DayEvent;
        })
        .sort((a: DayEvent, b: DayEvent) => a.startDate.getTime() - b.startDate.getTime());

      setEvents(mapped.slice(0, 3));
      setMoreCount(Math.max(0, mapped.length - 3));
      setState("ready");
    } catch {
      setState("error");
    }
  }, [selectedDate]);

  const requestPermission = useCallback(async () => {
    if (!CalendarModule) {
      setPermission("blocked");
      setState("error");
      return;
    }

    try {
      const result = await CalendarModule.requestCalendarPermissionsAsync();
      if (result?.granted) {
        setPermission("granted");
        await loadEvents();
        return;
      }

      if (result?.canAskAgain === false) {
        setPermission("blocked");
      } else {
        setPermission("denied");
      }
      setState("idle");
    } catch {
      setPermission("blocked");
      setState("error");
    }
  }, [loadEvents]);

  const refresh = useCallback(async () => {
    if (permission !== "granted") return;
    await loadEvents();
  }, [loadEvents, permission]);

  const openSettings = useCallback(async () => {
    try {
      await Linking.openSettings();
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (permission === "granted") {
      loadEvents().catch(() => setState("error"));
    }
  }, [loadEvents, permission]);

  return {
    permission,
    state,
    events,
    moreCount,
    actions: {
      requestPermission,
      refresh,
      openSettings,
    },
  };
}
