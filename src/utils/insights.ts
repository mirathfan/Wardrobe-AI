import type { ClosetItem } from "../../src/lib/items";

export type InsightCandidate = {
  id: string;
  title: string;
  body: string;
  reasons: string[];
  priority: number;
};

type Context = {
  items: ClosetItem[];
  weather?: { label?: string; tempC?: number } | null;
  calendar?: { eventTitle?: string; eventTime?: string } | null;
};

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    const ms = date?.getTime?.();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function buildInsightCandidates(context: Context): InsightCandidate[] {
  const { items, weather, calendar } = context;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const candidates: InsightCandidate[] = [];

  const unworn = items
    .filter((item) => Number(item.wearCountSinceWash ?? 0) === 0)
    .sort((a, b) => Number((b.createdAt as number) ?? 0) - Number((a.createdAt as number) ?? 0));

  if (unworn.length > 0) {
    const pick = unworn[0];
    candidates.push({
      id: "new-item",
      title: "New item ready",
      body: `${pick.name || "A new piece"} is fresh in your closet and hasn't been worn yet.`,
      reasons: [
        "This item has 0 wears so far.",
        "Rotating new pieces improves closet usage.",
      ],
      priority: 100,
    });
  }

  // TODO(wardrobe-ai): if schema switches to lastWornAt, update this lookup.
  const stale = items
    .map((item) => ({ item, lastWornMs: toMillis(item.lastWornDate) }))
    .filter((entry) => entry.lastWornMs && now - (entry.lastWornMs as number) >= 30 * dayMs)
    .sort((a, b) => (a.lastWornMs as number) - (b.lastWornMs as number));

  if (stale.length > 0) {
    const pick = stale[0].item;
    candidates.push({
      id: "underused",
      title: "Underused item spotted",
      body: `${pick.name || "This piece"} has been idle for 30+ days. Rotate it in today.`,
      reasons: [
        "It has not been worn recently.",
        "Reintroducing underused items improves variety.",
      ],
      priority: 90,
    });
  }

  if (weather && typeof weather.tempC === "number") {
    const temp = Math.round(weather.tempC);
    candidates.push({
      id: "weather",
      title: "Weather-aware pick",
      body: `${temp}°C and ${weather.label || "current conditions"}. Choose layers that match today's weather.`,
      reasons: [
        `Current local weather is ${temp}°C (${weather.label || "conditions"}).`,
        "Outfit comfort is improved by adapting to weather.",
      ],
      priority: 80,
    });
  }

  if (calendar?.eventTitle) {
    candidates.push({
      id: "calendar",
      title: "Plan around today",
      body: `You have ${calendar.eventTime ? `${calendar.eventTime} ` : ""}${calendar.eventTitle}. Build a look for that event.`,
      reasons: [
        "Today's calendar has an upcoming event.",
        "Aligning outfit choices with your schedule reduces decision fatigue.",
      ],
      priority: 70,
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      id: "fallback",
      title: "Try a fresh outfit",
      body: "Build an outfit from your newest pieces and let AI do the heavy lifting.",
      reasons: [
        "No strong single signal right now.",
        "A fresh combination keeps rotation balanced.",
      ],
      priority: 10,
    });
  }

  return candidates.sort((a, b) => b.priority - a.priority);
}

export function chooseDailyInsightId(candidates: InsightCandidate[], previousId?: string | null) {
  if (candidates.length === 0) return null;
  if (!previousId) return candidates[0].id;
  const index = candidates.findIndex((c) => c.id === previousId);
  if (index === -1) return candidates[0].id;
  return candidates[(index + 1) % candidates.length].id;
}
