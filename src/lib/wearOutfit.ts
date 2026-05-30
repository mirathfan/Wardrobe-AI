import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/src/lib/firebase";
import { logItemStyleEvent, logOutfitSnapshotWornStyleEvent } from "@/src/lib/auraMemory";
import { buildSignalFromItem, updateAssistantMemoryFromAction } from "@/src/lib/assistantMemory";
import { MAX_WEARS_BEFORE_WASH, normalizeLaundryStatus } from "@/src/lib/items";
import { filterOutfitItemsToLiveCloset } from "@/src/lib/outfitLiveCloset";
import {
  buildOutfitSnapshot,
  getOwnedItemIdsFromOutfitSnapshot,
  outfitSnapshotToPlannedOutfit,
  type OutfitSnapshot,
  type OutfitSnapshotSource,
} from "@/src/lib/outfitSnapshot";
import type { AuraLook } from "@/src/types/aura";
import type { ClothingItem } from "@/src/types/ClothingItem";
import { toDayKey } from "@/src/utils/date";
import type { OutfitItemsByCategory, PlannedOutfit } from "@/src/utils/dailyOutfits";

export type WearSource =
  | "aura"
  | "calendar"
  | "home"
  | "item_detail"
  | "studio"
  | "saved_look";

type OutfitInput =
  | AuraLook
  | PlannedOutfit
  | {
      look?: AuraLook | null;
      outfitSnapshot?: OutfitSnapshot | null;
      itemIds?: string[] | null;
      title?: string | null;
    }
  | null
  | undefined;

export type WearOutfitParams = {
  uid: string;
  source: WearSource;
  outfitId?: string;
  title?: string;
  itemIds?: string[];
  look?: OutfitInput;
  wornAt?: Date;
  updateItemWearCounts?: boolean;
};

export type PlanOutfitParams = {
  uid: string;
  source: WearSource;
  outfitId?: string;
  title?: string;
  itemIds?: string[];
  look?: OutfitInput;
  date?: Date;
};

export type MarkItemWornParams = {
  uid: string;
  source: WearSource;
  itemId: string;
  wornAt?: Date;
};

export type WearResult = {
  dateKey: string;
  itemIds: string[];
  updatedItemIds: string[];
  skippedItemIds: string[];
  missingItemIds: string[];
  alreadyMarked: boolean;
  outfitSnapshot?: OutfitSnapshot;
};

function cleanString(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach((value) => {
    const cleaned = cleanString(value);
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    next.push(cleaned);
  });
  return next;
}

function toSnapshotSource(source: WearSource): OutfitSnapshotSource {
  if (source === "studio") return "studio";
  if (source === "saved_look") return "saved_look";
  if (source === "item_detail") return "item_detail";
  if (source === "aura") return "aura";
  return "planner";
}

function toMemorySource(source: WearSource) {
  if (source === "aura" || source === "saved_look") return "aura" as const;
  if (source === "studio") return "manual" as const;
  return "planner" as const;
}

function itemDocRef(uid: string, itemId: string) {
  return doc(db, "users", uid, "items", itemId);
}

function outfitDocRef(uid: string, dateKey: string) {
  return doc(db, "users", uid, "outfits", dateKey);
}

function dateFromValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function wasWornOnDate(item: Partial<ClothingItem>, dateKey: string) {
  const lastWorn = dateFromValue(item.lastWornDate) ?? dateFromValue(item.lastWornAt);
  return lastWorn ? toDayKey(lastWorn) === dateKey : false;
}

function sameStringSet(a: string[], b: string[]) {
  const left = uniqueStrings(a).sort();
  const right = uniqueStrings(b).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function itemIdsFromDailyDoc(data: Record<string, any>) {
  const worn = data.wornOutfit?.itemsByCategory ?? {};
  return uniqueStrings([
    ...(Array.isArray(data.itemIds) ? data.itemIds : []),
    worn.outerwear,
    worn.top,
    worn.bottom,
    worn.shoes,
    ...(Array.isArray(worn.accessories) ? worn.accessories : []),
  ]);
}

function snapshotToItemsByCategory(snapshot: OutfitSnapshot): OutfitItemsByCategory {
  const firstItemForSlot = (slot: string) =>
    snapshot.slots.find((entry) => entry.slot === slot && entry.source === "closet" && entry.itemId)?.itemId;
  const accessories = uniqueStrings(
    snapshot.slots
      .filter((entry) => entry.slot === "accessory" && entry.source === "closet")
      .map((entry) => entry.itemId),
  );

  return {
    ...(firstItemForSlot("outerwear") ? { outerwear: firstItemForSlot("outerwear") } : {}),
    ...(firstItemForSlot("top") ? { top: firstItemForSlot("top") } : {}),
    ...(firstItemForSlot("bottom") ? { bottom: firstItemForSlot("bottom") } : {}),
    ...(firstItemForSlot("shoes") ? { shoes: firstItemForSlot("shoes") } : {}),
    ...(accessories.length ? { accessories } : {}),
  };
}

async function loadOwnedItems(uid: string, itemIds: string[]) {
  const ids = uniqueStrings(itemIds);
  const snaps = await Promise.all(ids.map((itemId) => getDoc(itemDocRef(uid, itemId))));
  const items = new Map<string, ClothingItem>();
  const missingItemIds: string[] = [];
  snaps.forEach((snap, index) => {
    const itemId = ids[index];
    if (!itemId) return;
    if (!snap.exists()) {
      missingItemIds.push(itemId);
      return;
    }
    items.set(itemId, { ...(snap.data() as ClothingItem), id: itemId });
  });
  return { items, missingItemIds };
}

function buildSnapshot(params: {
  look?: OutfitInput;
  itemIds?: string[];
  title?: string;
  source: WearSource;
}) {
  return buildOutfitSnapshot(params.look, {
    source: toSnapshotSource(params.source),
    title: params.title,
    itemIds: params.itemIds,
  });
}

function plannedOutfitOptions(input: OutfitInput) {
  if (
    input &&
    typeof input === "object" &&
    (input as PlannedOutfit).itemsByCategory &&
    typeof (input as PlannedOutfit).itemsByCategory === "object"
  ) {
    const planned = input as PlannedOutfit;
    return {
      score: planned.score,
      reasons: planned.reasons,
      createdAt: planned.createdAt,
    };
  }
  return undefined;
}

export async function markOutfitWorn({
  uid,
  source,
  outfitId,
  title,
  itemIds,
  look,
  wornAt,
  updateItemWearCounts = true,
}: WearOutfitParams): Promise<WearResult> {
  const wornDate = wornAt ?? new Date();
  const dateKey = toDayKey(wornDate);
  const wornAtMs = wornDate.getTime();
  const snapshot = buildSnapshot({ look, itemIds, title, source });
  const requestedItemIds = getOwnedItemIdsFromOutfitSnapshot(snapshot);

  if (!requestedItemIds.length) {
    throw new Error("This look has no closet items to mark as worn.");
  }

  const { items, missingItemIds } = await loadOwnedItems(uid, requestedItemIds);
  const ownedItemIds = requestedItemIds.filter((itemId) => items.has(itemId));

  if (!ownedItemIds.length) {
    throw new Error("This look has no closet items to mark as worn.");
  }
  const liveSnapshot = filterOutfitItemsToLiveCloset(snapshot, new Set(ownedItemIds));

  const dailyRef = outfitDocRef(uid, dateKey);
  const dailySnap = await getDoc(dailyRef);
  const dailyData = dailySnap.exists() ? dailySnap.data() as Record<string, any> : {};
  const existingWornItemIds = dailyData.wornOutfit ? itemIdsFromDailyDoc(dailyData) : [];

  if (dailyData.wornOutfit && sameStringSet(existingWornItemIds, ownedItemIds)) {
    return {
      dateKey,
      itemIds: ownedItemIds,
      updatedItemIds: [],
      skippedItemIds: ownedItemIds,
      missingItemIds,
      alreadyMarked: true,
      outfitSnapshot: liveSnapshot,
    };
  }

  const skippedItemIds: string[] = [];
  const updatedItemIds: string[] = [];

  if (updateItemWearCounts) {
    for (const itemId of ownedItemIds) {
      const item = items.get(itemId);
      if (!item) continue;
      const alreadyWornToday = wasWornOnDate(item, dateKey);
      if (alreadyWornToday) {
        skippedItemIds.push(itemId);
        continue;
      }
      if (normalizeLaundryStatus(item) === "in_laundry") {
        throw new Error(`${item.name || item.category || "An item"} is in laundry.`);
      }
      if (Number(item.wearCountSinceWash ?? 0) >= MAX_WEARS_BEFORE_WASH) {
        throw new Error(`${item.name || item.category || "An item"} needs a wash before wearing again.`);
      }
      updatedItemIds.push(itemId);
    }
  } else {
    skippedItemIds.push(...ownedItemIds);
  }

  const batch = writeBatch(db);
  const now = Date.now();
  updatedItemIds.forEach((itemId) => {
    batch.update(itemDocRef(uid, itemId), {
      status: "WORN",
      laundryStatus: "needs_wash",
      wearCountSinceWash: increment(1),
      lastWornDate: serverTimestamp(),
      lastWornAt: serverTimestamp(),
      laundryUpdatedAt: serverTimestamp(),
      updatedAt: now,
    });
  });

  batch.set(
    dailyRef,
    {
      dateKey,
      itemIds: ownedItemIds,
      planned: false,
      wornOutfit: {
        itemsByCategory: snapshotToItemsByCategory(liveSnapshot),
        wornAt: wornAtMs,
        source,
        ...(cleanString(title ?? liveSnapshot.title) ? { title: cleanString(title ?? liveSnapshot.title) } : {}),
        ...(cleanString(outfitId) ? { outfitId: cleanString(outfitId) } : {}),
        outfitSnapshot: liveSnapshot,
      },
      wornAtMs,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
  void logOutfitSnapshotWornStyleEvent(uid, liveSnapshot, {
    source: toMemorySource(source),
    wornAt: wornAtMs,
  }).catch((error) => {
    if (__DEV__) {
      console.warn("[wearOutfit] Failed to log style event", error);
    }
  });

  return {
    dateKey,
    itemIds: ownedItemIds,
    updatedItemIds,
    skippedItemIds,
    missingItemIds,
    alreadyMarked: false,
    outfitSnapshot: liveSnapshot,
  };
}

export async function markItemWorn({
  uid,
  source,
  itemId,
  wornAt,
}: MarkItemWornParams): Promise<WearResult> {
  const dateKey = toDayKey(wornAt ?? new Date());
  const itemRef = itemDocRef(uid, itemId);
  const snap = await getDoc(itemRef);

  if (!snap.exists()) {
    throw new Error("Item not found.");
  }

  const item = { ...(snap.data() as ClothingItem), id: itemId };
  if (wasWornOnDate(item, dateKey)) {
    return {
      dateKey,
      itemIds: [itemId],
      updatedItemIds: [],
      skippedItemIds: [itemId],
      missingItemIds: [],
      alreadyMarked: true,
    };
  }

  if (normalizeLaundryStatus(item) === "in_laundry") {
    throw new Error("Item is in laundry.");
  }

  if (Number(item.wearCountSinceWash ?? 0) >= MAX_WEARS_BEFORE_WASH) {
    throw new Error("Wash required before wearing again.");
  }

  const batch = writeBatch(db);
  batch.update(itemRef, {
    status: "WORN",
    laundryStatus: "needs_wash",
    wearCountSinceWash: increment(1),
    lastWornDate: serverTimestamp(),
    lastWornAt: serverTimestamp(),
    laundryUpdatedAt: serverTimestamp(),
    updatedAt: Date.now(),
  });
  await batch.commit();

  void logItemStyleEvent(uid, "item_worn", item);
  void updateAssistantMemoryFromAction(uid, "wear_item", buildSignalFromItem(item));

  return {
    dateKey,
    itemIds: [itemId],
    updatedItemIds: [itemId],
    skippedItemIds: [],
    missingItemIds: [],
    alreadyMarked: false,
  };
}

export async function planOutfitForToday({
  uid,
  source,
  outfitId,
  title,
  itemIds,
  look,
  date,
}: PlanOutfitParams) {
  const planDate = date ?? new Date();
  const dateKey = toDayKey(planDate);
  const snapshot = buildSnapshot({ look, itemIds, title, source });
  const requestedItemIds = getOwnedItemIdsFromOutfitSnapshot(snapshot);

  if (!requestedItemIds.length) {
    throw new Error("This look has no closet items to plan.");
  }
  const { items } = await loadOwnedItems(uid, requestedItemIds);
  const ownedItemIds = requestedItemIds.filter((itemId) => items.has(itemId));
  if (!ownedItemIds.length) {
    throw new Error("This look has no closet items to plan.");
  }
  const liveSnapshot = filterOutfitItemsToLiveCloset(snapshot, new Set(ownedItemIds));

  const plannedOutfit = outfitSnapshotToPlannedOutfit(liveSnapshot, plannedOutfitOptions(look));
  const batch = writeBatch(db);
  batch.set(
    outfitDocRef(uid, dateKey),
    {
      dateKey,
      itemIds: ownedItemIds,
      planned: true,
      plannedOutfit,
      plannedSource: source,
      ...(cleanString(title ?? liveSnapshot.title) ? { title: cleanString(title ?? liveSnapshot.title) } : {}),
      ...(cleanString(outfitId) ? { outfitId: cleanString(outfitId) } : {}),
      outfitSnapshot: liveSnapshot,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  return {
    dateKey,
    itemIds: ownedItemIds,
    plannedOutfit,
    outfitSnapshot: liveSnapshot,
  };
}
