import { createHash } from "node:crypto";
import { FieldValue, Firestore } from "firebase-admin/firestore";
import { Slot, WardrobeItem, getSlotForItem } from "./outfitEngine";

type WardrobeSummaryDoc = {
  updatedAt?: number;
  version?: string;
  itemHash?: string;
  stats?: Record<string, unknown>;
  summaryText?: string;
};

type WardrobeSummaryResult = {
  updatedAt: number;
  version: "v1";
  itemHash: string;
  stats: {
    totalItems: number;
    eligibleItems: number;
    slotCounts: Record<Slot, number>;
    topColors: string[];
    topBrands: string[];
    topSubCategories: string[];
  };
  summaryText: string;
};

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value && "toMillis" in value && typeof (value as {toMillis?: () => number}).toMillis === "function") {
    return (value as {toMillis: () => number}).toMillis();
  }
  return 0;
}

function topKeys(counter: Map<string, number>, limit: number): string[] {
  return Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

export function computeWardrobeItemHash(items: WardrobeItem[]): string {
  const payload = items
    .map((item) => ({
      id: item.id,
      updatedAt: toMillis(item.updatedAt),
      status: String(item.status ?? ""),
      category: String(item.category ?? ""),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}

function buildSummary(items: WardrobeItem[], itemHash: string): WardrobeSummaryResult {
  const slotCounts: Record<Slot, number> = {
    top: 0,
    bottom: 0,
    footwear: 0,
    outerwear: 0,
    accessory: 0,
  };
  const colors = new Map<string, number>();
  const brands = new Map<string, number>();
  const subCategories = new Map<string, number>();

  let eligibleItems = 0;
  for (const item of items) {
    const slot = getSlotForItem(item);
    if (slot) slotCounts[slot] += 1;
    if (String(item.ingestion?.status ?? "").trim().toLowerCase() === "done") {
      eligibleItems += 1;
    }

    for (const color of Array.isArray(item.colors) ? item.colors : []) {
      const normalized = String(color).trim().toLowerCase();
      if (!normalized) continue;
      colors.set(normalized, (colors.get(normalized) ?? 0) + 1);
    }
    const brand = String(item.brand ?? "").trim();
    if (brand) brands.set(brand, (brands.get(brand) ?? 0) + 1);
    const subCategory = String(item.subCategory ?? "").trim();
    if (subCategory) subCategories.set(subCategory, (subCategories.get(subCategory) ?? 0) + 1);
  }

  const topColors = topKeys(colors, 4);
  const topBrands = topKeys(brands, 4);
  const topSubCategories = topKeys(subCategories, 6);
  const summaryParts = [
    `${items.length} wardrobe items`,
    `${eligibleItems} analyzed and ready`,
    `slots top:${slotCounts.top}, bottom:${slotCounts.bottom}, footwear:${slotCounts.footwear}, outerwear:${slotCounts.outerwear}, accessory:${slotCounts.accessory}`,
    topColors.length > 0 ? `top colors ${topColors.join(", ")}` : "",
    topBrands.length > 0 ? `common brands ${topBrands.join(", ")}` : "",
    topSubCategories.length > 0 ? `frequent pieces ${topSubCategories.join(", ")}` : "",
  ].filter(Boolean);

  return {
    updatedAt: Date.now(),
    version: "v1",
    itemHash,
    stats: {
      totalItems: items.length,
      eligibleItems,
      slotCounts,
      topColors,
      topBrands,
      topSubCategories,
    },
    summaryText: summaryParts.join(". "),
  };
}

export async function getOrRefreshWardrobeSummary(
  db: Firestore,
  uid: string,
  items: WardrobeItem[]
): Promise<WardrobeSummaryResult> {
  const summaryRef = db.doc(`users/${uid}/ai/wardrobeSummary`);
  const itemHash = computeWardrobeItemHash(items);
  const snap = await summaryRef.get();
  const existing = snap.exists ? (snap.data() as WardrobeSummaryDoc) : null;
  const ageMs = Date.now() - Number(existing?.updatedAt ?? 0);
  const isFresh =
    existing &&
    existing.version === "v1" &&
    existing.itemHash === itemHash &&
    ageMs < 24 * 60 * 60 * 1000;

  if (isFresh && existing?.stats && typeof existing.summaryText === "string") {
    return {
      updatedAt: Number(existing.updatedAt ?? Date.now()),
      version: "v1",
      itemHash,
      stats: existing.stats as WardrobeSummaryResult["stats"],
      summaryText: existing.summaryText,
    };
  }

  const summary = buildSummary(items, itemHash);
  await summaryRef.set(
    {
      ...summary,
      updatedAt: summary.updatedAt,
      serverUpdatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );
  return summary;
}
