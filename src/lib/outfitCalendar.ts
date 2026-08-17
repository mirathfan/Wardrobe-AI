import {
  clearPlan,
  clearWorn,
  getOutfitByDate,
  type DailyOutfitRecord,
  type OutfitItemsByCategory,
  type PlannedOutfit,
  type WornOutfit,
} from "@/src/utils/dailyOutfits";
import type {
  AuraOutfitWeatherContext,
  AuraOutfitWeatherWarning,
} from "@/shared/auraOutfitCalendar";

export type OutfitCalendarEventStatus = "planned" | "worn";

export type OutfitCalendarEvent = {
  id: string;
  status: OutfitCalendarEventStatus;
  dateKey: string;
  source?: string;
  title: string;
  outfitId?: string;
  outfitFingerprint?: string;
  itemsByCategory: OutfitItemsByCategory;
  itemIds: string[];
  reasons: string[];
  weatherContext?: AuraOutfitWeatherContext;
  weatherWarnings: AuraOutfitWeatherWarning[];
  raw: PlannedOutfit | WornOutfit;
};

function cleanText(value: unknown, fallback = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function itemIdsFromCategories(itemsByCategory: OutfitItemsByCategory) {
  return [
    itemsByCategory.outerwear,
    itemsByCategory.top,
    itemsByCategory.bottom,
    itemsByCategory.shoes,
    ...(itemsByCategory.accessories ?? []),
  ].map((itemId) => cleanText(itemId)).filter(Boolean);
}

export function outfitCalendarStatusLabel(status: OutfitCalendarEventStatus) {
  return status === "worn" ? "Worn" : "Planned";
}

export function outfitCalendarSourceLabel(source?: string) {
  return source === "aura_agent" || source === "aura" ? "AURA" : "Calendar";
}

export function outfitCalendarItemCount(event: Pick<OutfitCalendarEvent, "itemIds" | "itemsByCategory">) {
  return Math.max(event.itemIds.length, itemIdsFromCategories(event.itemsByCategory).length);
}

export function buildOutfitCalendarEvents(record: DailyOutfitRecord | null): OutfitCalendarEvent[] {
  if (!record) return [];
  const events: OutfitCalendarEvent[] = [];
  if (record.plannedOutfit) {
    const planned = record.plannedOutfit;
    const itemIds = itemIdsFromCategories(planned.itemsByCategory);
    events.push({
      id: `${record.dateKey}:planned:${planned.outfitFingerprint ?? itemIds.join("|")}`,
      status: "planned",
      dateKey: record.dateKey,
      source: planned.source,
      title: cleanText(planned.title, "Planned outfit"),
      outfitId: planned.outfitId,
      outfitFingerprint: planned.outfitFingerprint,
      itemsByCategory: planned.itemsByCategory,
      itemIds,
      reasons: planned.reasons ?? [],
      weatherContext: planned.weatherContext,
      weatherWarnings: planned.weatherWarnings ?? [],
      raw: planned,
    });
  }
  if (record.wornOutfit) {
    const worn = record.wornOutfit;
    const itemIds = itemIdsFromCategories(worn.itemsByCategory);
    events.push({
      id: `${record.dateKey}:worn:${worn.outfitFingerprint ?? itemIds.join("|")}`,
      status: "worn",
      dateKey: record.dateKey,
      source: worn.source,
      title: cleanText(worn.title, "Worn outfit"),
      outfitId: worn.outfitId,
      outfitFingerprint: worn.outfitFingerprint,
      itemsByCategory: worn.itemsByCategory,
      itemIds,
      reasons: worn.weatherWarnings?.map((warning) => warning.message) ?? [],
      weatherContext: worn.weatherContext,
      weatherWarnings: worn.weatherWarnings ?? [],
      raw: worn,
    });
  }
  return events;
}

export async function listOutfitEventsForDate(uid: string, dateKey: string) {
  return buildOutfitCalendarEvents(await getOutfitByDate(uid, dateKey));
}

export async function cancelOutfitEvent(uid: string, dateKey: string, status: OutfitCalendarEventStatus) {
  if (status === "planned") return clearPlan(uid, dateKey);
  return clearWorn(uid, dateKey);
}

export async function getOutfitEvent(uid: string, dateKey: string, status: OutfitCalendarEventStatus) {
  const events = await listOutfitEventsForDate(uid, dateKey);
  return events.find((event) => event.status === status) ?? null;
}
