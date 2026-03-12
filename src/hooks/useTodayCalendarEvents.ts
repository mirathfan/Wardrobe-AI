import { useCallback, useState } from "react";
import { Linking } from "react-native";

import { endOfDay, formatTimeLabel, startOfDay } from "../utils/time";

type CalendarState = "idle" | "loading" | "ready" | "error";
type PermissionState = "unknown" | "granted" | "denied" | "blocked";

type CalendarEventItem = {
  id: string;
  title: string;
  startDate: Date;
  timeLabel: string;
};

let CalendarModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  CalendarModule = require("expo-calendar");
} catch {
  CalendarModule = null;
}

export function useTodayCalendarEvents() {
  const [state, setState] = useState<CalendarState>("idle");
  const [permission, setPermission] = useState<PermissionState>("unknown");
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
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

      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);

      const rawEvents = await CalendarModule.getEventsAsync(calendarIds, todayStart, todayEnd);
      const upcoming = rawEvents
        .map((event: any) => {
          const startDate = new Date(event.startDate);
          return {
            id: String(event.id),
            title: String(event.title || "Untitled"),
            startDate,
            timeLabel: formatTimeLabel(startDate),
          };
        })
        .filter((event: CalendarEventItem) => event.startDate.getTime() >= now.getTime())
        .sort((a: CalendarEventItem, b: CalendarEventItem) => a.startDate.getTime() - b.startDate.getTime());

      const next = upcoming.slice(0, 2);
      setEvents(next);
      setMoreCount(Math.max(0, upcoming.length - next.length));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!CalendarModule) {
      setPermission("blocked");
      setState("error");
      return;
    }

    setState("loading");

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
