import { toCanonicalCategory } from "../../src/lib/items";
import { ClothingItem } from "../../src/types/ClothingItem";

export type EventLike = { id: string; title: string; timeLabel?: string };

export type PlannedOutfit = {
  itemIds: string[];
  slots: {
    outerwear: ClothingItem | null;
    top: ClothingItem | null;
    bottom: ClothingItem | null;
    shoes: ClothingItem | null;
  };
  reasons: string[];
};

type PlannerOptions = {
  dayKey: string;
  variation: number;
  weatherLabel?: string;
  tempC?: number;
  events?: EventLike[];
};

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function seededBias(id: string, seed: string) {
  return (hashString(`${seed}:${id}`) % 1000) / 1000;
}

function toMillis(value: unknown): number | null {
  // TODO(wardrobe-ai): if schema migrates to lastWornAt, pass that value here.
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const out = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(out.getTime()) ? null : out.getTime();
  }
  return null;
}

function isWetWeather(label?: string) {
  const v = norm(label);
  return ["rain", "drizzle", "snow", "showers", "thunder"].some((token) => v.includes(token));
}

function isWindy(label?: string) {
  const v = norm(label);
  return v.includes("wind");
}

function inferEventVibe(event?: EventLike): "formal" | "smart_casual" | "casual" | "active" {
  const title = norm(event?.title);
  if (!title) return "casual";
  if (["gym", "run", "workout", "training", "sport"].some((x) => title.includes(x))) return "active";
  if (["wedding", "interview", "board", "formal", "ceremony", "conference"].some((x) => title.includes(x))) {
    return "formal";
  }
  if (["meeting", "office", "client", "dinner", "date", "presentation"].some((x) => title.includes(x))) {
    return "smart_casual";
  }
  return "casual";
}

function vibeTag(vibe: ReturnType<typeof inferEventVibe>) {
  if (vibe === "formal") return "Formal";
  if (vibe === "smart_casual") return "Smart casual";
  if (vibe === "active") return "Active";
  return "Casual";
}

function scoreItem(item: ClothingItem, opts: PlannerOptions, slot: "outerwear" | "top" | "bottom" | "shoes") {
  const wears = Number(item.wearCountSinceWash ?? 0);
  const lastWorn = toMillis(item.lastWornDate);
  const daysSinceWorn = lastWorn ? (Date.now() - lastWorn) / (24 * 60 * 60 * 1000) : 99;
  const eventVibe = inferEventVibe(opts.events?.[0]);
  const warmTarget = typeof opts.tempC === "number" ? (opts.tempC <= 8 ? 0.85 : opts.tempC >= 24 ? 0.3 : 0.55) : 0.5;
  const warmth = typeof item.warmthScore === "number" ? item.warmthScore : 0.5;
  const formality = typeof item.formalityScore === "number" ? item.formalityScore : 0.5;
  const formalityTarget =
    eventVibe === "formal" ? 0.85 : eventVibe === "smart_casual" ? 0.65 : eventVibe === "active" ? 0.35 : 0.45;

  let score = 0;
  score += Math.min(1, daysSinceWorn / 14) * 0.35;
  score += Math.max(0, 1 - wears / 4) * 0.25;
  score += Math.max(0, 1 - Math.abs(warmth - warmTarget)) * 0.2;
  score += Math.max(0, 1 - Math.abs(formality - formalityTarget)) * 0.12;

  if (slot === "outerwear") {
    if (warmTarget >= 0.7 || isWetWeather(opts.weatherLabel) || isWindy(opts.weatherLabel)) score += 0.18;
    else score -= 0.08;
  }

  if (slot === "top" && daysSinceWorn < 2) score -= 0.15;

  score += seededBias(item.id, `${opts.dayKey}:${opts.variation}`) * 0.08;
  return score;
}

function pickBest(items: ClothingItem[], opts: PlannerOptions, slot: "outerwear" | "top" | "bottom" | "shoes") {
  const sorted = [...items].sort((a, b) => {
    const diff = scoreItem(b, opts, slot) - scoreItem(a, opts, slot);
    if (Math.abs(diff) > 0.0001) return diff;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}

export function weatherTip(tempC?: number, label?: string) {
  if (typeof tempC === "number" && tempC <= 8) return "Cold today — consider a jacket";
  if (isWetWeather(label)) return "Wet weather — consider water-resistant outerwear";
  if (isWindy(label)) return "Windy — layer up";
  return "Comfortable conditions — light layers should work";
}

export function suggestedVibeForEvent(event?: EventLike) {
  return vibeTag(inferEventVibe(event));
}

export function buildPlannedOutfit(items: ClothingItem[], opts: PlannerOptions): PlannedOutfit {
  const available = items.filter((item) => item?.id && item.status !== "IN_LAUNDRY");
  const tops = available.filter((item) => toCanonicalCategory(item.category) === "top");
  const bottoms = available.filter((item) => toCanonicalCategory(item.category) === "bottom");
  const shoes = available.filter((item) => toCanonicalCategory(item.category) === "shoes");
  const outerwearPool = available.filter((item) => toCanonicalCategory(item.category) === "outerwear");

  const top = pickBest(tops, opts, "top");
  const bottom = pickBest(bottoms, opts, "bottom");
  const shoe = pickBest(shoes, opts, "shoes");

  const shouldIncludeOuterwear =
    (typeof opts.tempC === "number" && opts.tempC <= 12) ||
    isWetWeather(opts.weatherLabel) ||
    isWindy(opts.weatherLabel);

  const outerwear = shouldIncludeOuterwear ? pickBest(outerwearPool, opts, "outerwear") : null;

  const reasons: string[] = [];
  if (outerwear) reasons.push("Added outerwear based on today’s weather context.");
  if (opts.events?.length) {
    reasons.push(`Adjusted style direction for today’s event: ${opts.events[0].title}.`);
  }
  if (top) reasons.push(`${top.name || top.subCategory || "Top"} was prioritized to improve wardrobe rotation.`);
  if (bottom) reasons.push(`${bottom.name || bottom.subCategory || "Bottom"} has a good formality and warmth balance.`);
  if (shoe) reasons.push(`${shoe.name || shoe.subCategory || "Shoes"} complements the selected outfit vibe.`);

  const selected = [outerwear, top, bottom, shoe].filter(Boolean) as ClothingItem[];

  return {
    itemIds: selected.map((item) => item.id),
    slots: {
      outerwear,
      top,
      bottom,
      shoes: shoe,
    },
    reasons,
  };
}
