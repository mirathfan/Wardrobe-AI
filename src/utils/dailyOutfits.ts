import { getStoredJson, setStoredJson } from "./storage";
import { toDayKey } from "./date";

export type OutfitItemsByCategory = {
  outerwear?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
};

export type PlannedOutfit = {
  itemsByCategory: OutfitItemsByCategory;
  locked?: {
    outerwear?: boolean;
    top?: boolean;
    bottom?: boolean;
    shoes?: boolean;
  };
  score: number;
  reasons: string[];
  createdAt: number;
};

export type WornOutfit = {
  itemsByCategory: OutfitItemsByCategory;
  wornAt: number;
};

export type DailyOutfitRecord = {
  dateKey: string;
  plannedOutfit?: PlannedOutfit;
  wornOutfit?: WornOutfit;
};

const DAILY_RECORDS_KEY = "wardrobe_ai_daily_outfit_records_v2";

async function getAllRecords() {
  return (await getStoredJson<Record<string, DailyOutfitRecord>>(DAILY_RECORDS_KEY)) ?? {};
}

async function saveAllRecords(records: Record<string, DailyOutfitRecord>) {
  await setStoredJson(DAILY_RECORDS_KEY, records);
}

export async function getDailyRecord(dateKey: string | Date) {
  const key = typeof dateKey === "string" ? dateKey : toDayKey(dateKey);
  const all = await getAllRecords();
  return all[key] ?? null;
}

export async function setPlanned(dateKey: string | Date, plannedOutfit: PlannedOutfit) {
  const key = typeof dateKey === "string" ? dateKey : toDayKey(dateKey);
  const all = await getAllRecords();
  const prev = all[key];
  all[key] = {
    dateKey: key,
    plannedOutfit,
    wornOutfit: prev?.wornOutfit,
  };
  await saveAllRecords(all);
  return all[key];
}

export async function setWorn(dateKey: string | Date, wornOutfit: WornOutfit) {
  const key = typeof dateKey === "string" ? dateKey : toDayKey(dateKey);
  const all = await getAllRecords();
  const prev = all[key];
  all[key] = {
    dateKey: key,
    plannedOutfit: prev?.plannedOutfit,
    wornOutfit,
  };
  await saveAllRecords(all);
  return all[key];
}

export async function clearPlan(dateKey: string | Date) {
  const key = typeof dateKey === "string" ? dateKey : toDayKey(dateKey);
  const all = await getAllRecords();
  const prev = all[key];
  if (!prev) return null;
  all[key] = {
    dateKey: key,
    wornOutfit: prev.wornOutfit,
  };
  await saveAllRecords(all);
  return all[key];
}

export async function copyPlan(fromDateKey: string | Date, toDateKey: string | Date) {
  const fromKey = typeof fromDateKey === "string" ? fromDateKey : toDayKey(fromDateKey);
  const toKey = typeof toDateKey === "string" ? toDateKey : toDayKey(toDateKey);
  const all = await getAllRecords();
  const source = all[fromKey]?.plannedOutfit;
  if (!source) return null;

  all[toKey] = {
    dateKey: toKey,
    plannedOutfit: {
      ...source,
      createdAt: Date.now(),
    },
    wornOutfit: all[toKey]?.wornOutfit,
  };

  await saveAllRecords(all);
  return all[toKey];
}

export async function getRecordsForDateKeys(dateKeys: string[]) {
  const all = await getAllRecords();
  const out: Record<string, DailyOutfitRecord | null> = {};
  dateKeys.forEach((key) => {
    out[key] = all[key] ?? null;
  });
  return out;
}
