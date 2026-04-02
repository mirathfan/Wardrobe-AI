import { collection, getDocs, orderBy, query } from "firebase/firestore";

import { db } from "../lib/firebase";

function toDateKey(date: Date) {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function getWornDateKeys(uid: string) {
  const outfitsRef = collection(db, "users", uid, "outfits");
  const snap = await getDocs(query(outfitsRef, orderBy("dateKey", "asc")));
  return snap.docs
    .map((docSnap) => {
      const data = docSnap.data() as { dateKey?: string; wornOutfit?: unknown };
      const hasWorn = !!(data?.wornOutfit && typeof data.wornOutfit === "object");
      return hasWorn ? String(data.dateKey ?? docSnap.id) : "";
    })
    .filter(Boolean);
}

export async function logOutfitDay(uid: string, date = new Date()) {
  const key = toDateKey(date);
  const existing = await getWornDateKeys(uid);
  if (existing.includes(key)) return existing;
  return [...existing, key].sort();
}

export async function getOutfitStreak(uid: string, today = new Date()) {
  const values = await getWornDateKeys(uid);
  if (values.length === 0) return 0;

  const logged = new Set(values);
  const cursor = new Date(today);
  cursor.setHours(0, 0, 0, 0);

  let streak = 0;
  while (logged.has(toDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export async function getLoggedOutfitDays(uid: string) {
  return getWornDateKeys(uid);
}

export async function getWeeklyLoggedFlags(uid: string, anchorDate = new Date()) {
  const loggedDays = new Set(await getLoggedOutfitDays(uid));
  const start = new Date(anchorDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return loggedDays.has(toDateKey(date)) ? 1 : 0;
  });
}

export function dateKeyOf(date: Date) {
  return toDateKey(date);
}

export function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function formatHeaderDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function formatWeekLabel(value: Date) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(value);
}

export function formatDayNumber(value: Date) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(value);
}

export function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const next = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(next.getTime()) ? null : next;
  }
  if (typeof value === "number") {
    const out = new Date(value);
    return Number.isNaN(out.getTime()) ? null : out;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const out = new Date(value);
    return Number.isNaN(out.getTime()) ? null : out;
  }
  return null;
}
