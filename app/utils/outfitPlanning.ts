import { toCanonicalCategory } from "../../src/lib/items";
import { ClothingItem } from "../../src/types/ClothingItem";
import { parseDateValue } from "./date";

export type LookId = "casual" | "minimal" | "street";

export type PlannedLook = {
  id: LookId;
  label: string;
  slotItemIds: {
    outerwear: string | null;
    top: string | null;
    bottom: string | null;
    shoes: string | null;
  };
  score: number;
  reasons: string[];
};

export type DailyOutfitPlan = {
  date: string;
  selectedLookId: LookId;
  looks: PlannedLook[];
  createdAt: number;
};

type EventLike = {
  id: string;
  title: string;
  timeLabel: string;
  startDate: Date;
};

type PlannerContext = {
  dayKey: string;
  tempC?: number;
  weatherLabel?: string;
  events?: EventLike[];
};

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function hash(input: string) {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(value);
}

function seededRank(id: string, seed: string) {
  return (hash(`${seed}:${id}`) % 1000) / 1000;
}

function daysSinceLastWorn(item: ClothingItem) {
  const date = parseDateValue(item.lastWornDate);
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

function itemRotationScore(item: ClothingItem) {
  const wears = Number(item.wearCountSinceWash ?? 0);
  const days = daysSinceLastWorn(item);
  if (days == null) return 0.9;
  return Math.max(0.15, Math.min(1, days / 20 + (wears === 0 ? 0.25 : 0)));
}

function isCold(tempC?: number) {
  return typeof tempC === "number" && tempC < 10;
}

function isWet(label?: string) {
  const value = norm(label);
  return ["rain", "drizzle", "snow", "showers", "storm"].some((token) => value.includes(token));
}

function inferVibe(events: EventLike[] = []) {
  if (!events.length) return "All-day casual";
  const joined = events.map((e) => norm(e.title)).join(" ");
  const hasNight = events.some((e) => e.startDate.getHours() >= 18);
  if (["meeting", "class", "work"].some((word) => joined.includes(word))) return "Work smart casual";
  if (hasNight && ["party", "club", "dinner"].some((word) => joined.includes(word))) return "Night out";
  return "Casual";
}

function pairingCount(item: ClothingItem, items: ClothingItem[]) {
  const colors = new Set((item.colors ?? []).map((c) => norm(c)).filter(Boolean));
  if (colors.size === 0 && item.primaryColor) colors.add(norm(item.primaryColor));
  if (!colors.size) return 0;

  let count = 0;
  items.forEach((candidate) => {
    if (candidate.id === item.id) return;
    const c = new Set((candidate.colors ?? []).map((v) => norm(v)).filter(Boolean));
    if (c.size === 0 && candidate.primaryColor) c.add(norm(candidate.primaryColor));
    const overlap = Array.from(colors).some((color) => c.has(color));
    if (overlap) count += 1;
  });
  return count;
}

function pickItem(pool: ClothingItem[], seed: string, offset: number) {
  const ranked = [...pool].sort((a, b) => {
    const aScore = itemRotationScore(a) + seededRank(a.id, `${seed}:${offset}`) * 0.25;
    const bScore = itemRotationScore(b) + seededRank(b.id, `${seed}:${offset}`) * 0.25;
    if (Math.abs(bScore - aScore) > 0.0001) return bScore - aScore;
    return a.id.localeCompare(b.id);
  });
  return ranked[offset % Math.max(1, ranked.length)] ?? null;
}

function scoreLook(
  look: PlannedLook,
  context: PlannerContext,
  itemsById: Map<string, ClothingItem>,
  allItems: ClothingItem[]
) {
  let score = 70;
  const outerwear = look.slotItemIds.outerwear ? itemsById.get(look.slotItemIds.outerwear) : null;

  if (isCold(context.tempC) && outerwear) score += 10;

  const vibe = inferVibe(context.events);
  if (context.events?.length) {
    if (vibe.includes("smart") && look.id !== "street") score += 8;
    if (vibe.includes("Night") && look.id === "street") score += 8;
    if (vibe.includes("Casual") && look.id === "casual") score += 8;
  }

  const selected = Object.values(look.slotItemIds)
    .map((id) => (id ? itemsById.get(id) : null))
    .filter(Boolean) as ClothingItem[];

  const underused = selected.filter((item) => {
    const days = daysSinceLastWorn(item);
    return days == null || days >= 7 || Number(item.wearCountSinceWash ?? 0) === 0;
  }).length;
  if (underused > 0) score += 5;

  const pairCount = selected.reduce((acc, item) => acc + pairingCount(item, allItems), 0);
  score += Math.max(2, Math.min(6, Math.floor(pairCount / Math.max(1, selected.length * 2))));

  return Math.max(0, Math.min(99, score));
}

function weatherReason(context: PlannerContext, hasOuterwear: boolean) {
  if (isCold(context.tempC) && hasOuterwear) return "Cold weather: jacket recommended.";
  if (isWet(context.weatherLabel) && hasOuterwear) return "Wet weather: added protective outerwear.";
  if (isCold(context.tempC) && !hasOuterwear) return "Cold weather: consider adding a jacket.";
  return "Weather conditions match this look.";
}

function rotationReason(selected: ClothingItem[]) {
  const underused = selected.find((item) => {
    const days = daysSinceLastWorn(item);
    return days == null || days > 10 || Number(item.wearCountSinceWash ?? 0) === 0;
  });
  if (!underused) return "Rotation: balanced with your recently worn items.";
  return `Rotation: underused ${underused.subCategory || underused.category || "item"} included.`;
}

export function weatherSuggestion(tempC?: number, weatherLabel?: string) {
  if (isCold(tempC)) return "Cold today — consider a jacket.";
  if (isWet(weatherLabel)) return "Wet weather — consider water-resistant outerwear.";
  if (norm(weatherLabel).includes("wind")) return "Windy — layer up.";
  return "Good conditions for a balanced casual outfit.";
}

export function inferTimelineVibe(events: EventLike[]) {
  return inferVibe(events);
}

export function generateDailyPlan(items: ClothingItem[], context: PlannerContext): DailyOutfitPlan {
  const available = items.filter((item) => item.status !== "IN_LAUNDRY");

  const tops = available.filter((item) => toCanonicalCategory(item.category) === "top");
  const bottoms = available.filter((item) => toCanonicalCategory(item.category) === "bottom");
  const shoes = available.filter((item) => toCanonicalCategory(item.category) === "shoes");
  const outerwear = available.filter((item) => toCanonicalCategory(item.category) === "outerwear");

  const lookDefs: { id: LookId; label: string; offset: number }[] = [
    { id: "casual", label: "Casual", offset: 0 },
    { id: "minimal", label: "Minimal", offset: 1 },
    { id: "street", label: "Street", offset: 2 },
  ];

  const itemsById = new Map(items.map((item) => [item.id, item]));

  const looks = lookDefs.map((def) => {
    const top = pickItem(tops, `${context.dayKey}:${def.id}:top`, def.offset);
    const bottom = pickItem(bottoms, `${context.dayKey}:${def.id}:bottom`, def.offset + 1);
    const shoe = pickItem(shoes, `${context.dayKey}:${def.id}:shoes`, def.offset + 2);

    const shouldUseOuterwear = isCold(context.tempC) || isWet(context.weatherLabel) || def.id === "street";
    const outer = shouldUseOuterwear
      ? pickItem(outerwear, `${context.dayKey}:${def.id}:outer`, def.offset + 3)
      : null;

    const look: PlannedLook = {
      id: def.id,
      label: def.label,
      slotItemIds: {
        outerwear: outer?.id ?? null,
        top: top?.id ?? null,
        bottom: bottom?.id ?? null,
        shoes: shoe?.id ?? null,
      },
      score: 70,
      reasons: [],
    };

    const selected = [outer, top, bottom, shoe].filter(Boolean) as ClothingItem[];
    const score = scoreLook(look, context, itemsById, available);
    const reasons = [
      weatherReason(context, !!outer),
      rotationReason(selected),
    ];

    return {
      ...look,
      score,
      reasons,
    };
  });

  return {
    date: context.dayKey,
    selectedLookId: "casual",
    looks,
    createdAt: Date.now(),
  };
}

export function lookToItems(look: PlannedLook, byId: Map<string, ClothingItem>) {
  return {
    outerwear: look.slotItemIds.outerwear ? byId.get(look.slotItemIds.outerwear) ?? null : null,
    top: look.slotItemIds.top ? byId.get(look.slotItemIds.top) ?? null : null,
    bottom: look.slotItemIds.bottom ? byId.get(look.slotItemIds.bottom) ?? null : null,
    shoes: look.slotItemIds.shoes ? byId.get(look.slotItemIds.shoes) ?? null : null,
  };
}

export function formatLastWorn(item: ClothingItem | null) {
  if (!item) return "Last worn: —";
  const date = parseDateValue(item.lastWornDate);
  if (!date) return "Last worn: —";
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "Last worn: today";
  if (days === 1) return "Last worn: 1 day ago";
  return `Last worn: ${days} days ago`;
}
