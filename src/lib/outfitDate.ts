import { toDayKey } from "@/src/utils/date";

const DEFAULT_TIMEZONE = "America/Chicago";

function partsForTimezone(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

export function toOutfitDateKey(date: Date = new Date(), timezone = DEFAULT_TIMEZONE) {
  if (!timezone) return toDayKey(date);
  const parts = partsForTimezone(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function parseOutfitDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCalendarDateLabel(dateKey: string) {
  const date = parseOutfitDateKey(dateKey);
  if (!date) return dateKey;
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function isTodayDateKey(dateKey: string, now = new Date(), timezone = DEFAULT_TIMEZONE) {
  return dateKey === toOutfitDateKey(now, timezone);
}

export function isFutureDateKey(dateKey: string, now = new Date(), timezone = DEFAULT_TIMEZONE) {
  return dateKey > toOutfitDateKey(now, timezone);
}
