import type { OutfitSnapshot } from "@/src/lib/outfitSnapshot";
import type { AuraLook } from "@/src/types/aura";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type {
  DailyOutfitRecord,
  OutfitItemsByCategory,
  PlannedOutfit,
  WornOutfit,
} from "@/src/utils/dailyOutfits";

type LiveClosetIds = ReadonlySet<string> | Iterable<string> | null | undefined;

type LiveChatOutfit = {
  id: string;
  picks: { slot: string; itemId: string }[];
  score: number;
  reason: string;
};

type OutfitReferenceInput =
  | AuraLook
  | LiveChatOutfit
  | DailyOutfitRecord
  | PlannedOutfit
  | WornOutfit
  | OutfitSnapshot
  | { itemIds?: unknown; picks?: unknown; pieces?: unknown; itemsByCategory?: unknown }
  | null
  | undefined;

export type MissingClosetReference = {
  itemId: string;
  label: string;
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

function liveSetFrom(value: LiveClosetIds): Set<string> | null {
  if (!value) return null;
  return new Set(Array.from(value).map(cleanString).filter(Boolean));
}

export function buildLiveClosetItemIdSet(
  items: (Pick<ClothingItem, "id"> | null | undefined)[],
) {
  return new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => cleanString(item?.id))
      .filter(Boolean),
  );
}

function isAuraLook(value: OutfitReferenceInput): value is AuraLook {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as AuraLook).pieces) &&
      typeof (value as AuraLook).lookTitle === "string",
  );
}

function isChatOutfit(value: OutfitReferenceInput): value is LiveChatOutfit {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as LiveChatOutfit).picks),
  );
}

function isDailyOutfitRecord(value: OutfitReferenceInput): value is DailyOutfitRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("plannedOutfit" in value || "wornOutfit" in value || "dateKey" in value),
  );
}

function isPlannedOutfit(value: OutfitReferenceInput): value is PlannedOutfit {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as PlannedOutfit).itemsByCategory &&
      typeof (value as PlannedOutfit).itemsByCategory === "object",
  );
}

function isWornOutfit(value: OutfitReferenceInput): value is WornOutfit {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as WornOutfit).itemsByCategory &&
      typeof (value as WornOutfit).itemsByCategory === "object" &&
      "wornAt" in value,
  );
}

function isOutfitSnapshot(value: OutfitReferenceInput): value is OutfitSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as OutfitSnapshot).version === 1 &&
      Array.isArray((value as OutfitSnapshot).slots),
  );
}

function itemIdsFromCategories(categories?: OutfitItemsByCategory | null) {
  if (!categories) return [];
  return uniqueStrings([
    categories.outerwear,
    categories.top,
    categories.bottom,
    categories.shoes,
    ...(categories.accessories ?? []),
  ]);
}

function filterCategoriesToLiveCloset(
  categories: OutfitItemsByCategory,
  liveItemIds: Set<string>,
): OutfitItemsByCategory {
  const accessories = (categories.accessories ?? []).filter((itemId) =>
    liveItemIds.has(cleanString(itemId)),
  );
  return {
    ...(categories.outerwear && liveItemIds.has(categories.outerwear)
      ? { outerwear: categories.outerwear }
      : {}),
    ...(categories.top && liveItemIds.has(categories.top)
      ? { top: categories.top }
      : {}),
    ...(categories.bottom && liveItemIds.has(categories.bottom)
      ? { bottom: categories.bottom }
      : {}),
    ...(categories.shoes && liveItemIds.has(categories.shoes)
      ? { shoes: categories.shoes }
      : {}),
    ...(accessories.length ? { accessories } : {}),
  };
}

function categoryMissingReferences(
  categories: OutfitItemsByCategory | null | undefined,
  liveItemIds: Set<string>,
) {
  return itemIdsFromCategories(categories)
    .filter((itemId) => !liveItemIds.has(itemId))
    .map((itemId) => ({ itemId, label: "Removed from closet" }));
}

function missingAuraLookReferences(look: AuraLook, liveItemIds: Set<string>) {
  return (look.pieces ?? [])
    .filter((piece) => piece.source === "closet")
    .map((piece) => ({
      itemId: cleanString(piece.itemId),
      label: cleanString(piece.itemName) || "Removed from closet",
    }))
    .filter((entry) => entry.itemId && !liveItemIds.has(entry.itemId));
}

function filterAuraLookToLiveCloset(look: AuraLook, liveItemIds: Set<string>): AuraLook {
  const pieces = (look.pieces ?? []).filter((piece) => {
    if (piece.source !== "closet") return true;
    const itemId = cleanString(piece.itemId);
    return !itemId || liveItemIds.has(itemId);
  });
  const fromCloset = uniqueStrings(
    pieces
      .filter((piece) => piece.source === "closet")
      .map((piece) => piece.itemName),
  );
  return {
    ...look,
    pieces,
    fromCloset,
  };
}

function missingChatOutfitReferences(outfit: LiveChatOutfit, liveItemIds: Set<string>) {
  return (outfit.picks ?? [])
    .map((pick) => cleanString(pick.itemId))
    .filter((itemId) => itemId && !liveItemIds.has(itemId))
    .map((itemId) => ({ itemId, label: "Removed from closet" }));
}

function filterChatOutfitToLiveCloset(outfit: LiveChatOutfit, liveItemIds: Set<string>): LiveChatOutfit {
  return {
    ...outfit,
    picks: (outfit.picks ?? []).filter((pick) => liveItemIds.has(cleanString(pick.itemId))),
  };
}

function filterPlannedOutfitToLiveCloset(
  outfit: PlannedOutfit,
  liveItemIds: Set<string>,
): PlannedOutfit {
  return {
    ...outfit,
    itemsByCategory: filterCategoriesToLiveCloset(outfit.itemsByCategory ?? {}, liveItemIds),
  };
}

function filterWornOutfitToLiveCloset(outfit: WornOutfit, liveItemIds: Set<string>): WornOutfit {
  return {
    ...outfit,
    itemsByCategory: filterCategoriesToLiveCloset(outfit.itemsByCategory ?? {}, liveItemIds),
    ...(outfit.outfitSnapshot
      ? { outfitSnapshot: filterOutfitItemsToLiveCloset(outfit.outfitSnapshot, liveItemIds) }
      : {}),
  };
}

function filterDailyRecordToLiveCloset(
  record: DailyOutfitRecord,
  liveItemIds: Set<string>,
): DailyOutfitRecord {
  return {
    ...record,
    ...(record.plannedOutfit
      ? { plannedOutfit: filterPlannedOutfitToLiveCloset(record.plannedOutfit, liveItemIds) }
      : {}),
    ...(record.wornOutfit
      ? { wornOutfit: filterWornOutfitToLiveCloset(record.wornOutfit, liveItemIds) }
      : {}),
  };
}

function missingSnapshotReferences(snapshot: OutfitSnapshot, liveItemIds: Set<string>) {
  const fromSlots = (snapshot.slots ?? [])
    .filter((slot) => slot.source === "closet")
    .map((slot) => ({
      itemId: cleanString(slot.itemId),
      label: cleanString(slot.label) || "Removed from closet",
    }));
  const fromItemIds = (snapshot.itemIds ?? []).map((itemId) => ({
    itemId: cleanString(itemId),
    label: "Removed from closet",
  }));
  const byId = new Map<string, MissingClosetReference>();
  [...fromSlots, ...fromItemIds].forEach((entry) => {
    if (!entry.itemId || liveItemIds.has(entry.itemId)) return;
    if (!byId.has(entry.itemId) || entry.label !== "Removed from closet") {
      byId.set(entry.itemId, entry);
    }
  });
  return Array.from(byId.values());
}

function filterSnapshotToLiveCloset(
  snapshot: OutfitSnapshot,
  liveItemIds: Set<string>,
): OutfitSnapshot {
  const slots = (snapshot.slots ?? []).filter((slot) => {
    if (slot.source !== "closet") return true;
    const itemId = cleanString(slot.itemId);
    return !itemId || liveItemIds.has(itemId);
  });
  return {
    ...snapshot,
    slots,
    itemIds: uniqueStrings([
      ...(snapshot.itemIds ?? []).filter((itemId) => liveItemIds.has(cleanString(itemId))),
      ...slots
        .filter((slot) => slot.source === "closet")
        .map((slot) => slot.itemId),
    ]),
  };
}

function uniqueMissingReferences(references: MissingClosetReference[]) {
  const byId = new Map<string, MissingClosetReference>();
  references.forEach((reference) => {
    if (!reference.itemId) return;
    if (!byId.has(reference.itemId) || reference.label !== "Removed from closet") {
      byId.set(reference.itemId, reference);
    }
  });
  return Array.from(byId.values());
}

export function getMissingClosetReferences(
  outfit: OutfitReferenceInput,
  liveItemIdsInput: LiveClosetIds,
): MissingClosetReference[] {
  const liveItemIds = liveSetFrom(liveItemIdsInput);
  if (!outfit || !liveItemIds) return [];

  if (isAuraLook(outfit)) return uniqueMissingReferences(missingAuraLookReferences(outfit, liveItemIds));
  if (isChatOutfit(outfit)) return uniqueMissingReferences(missingChatOutfitReferences(outfit, liveItemIds));
  if (isDailyOutfitRecord(outfit)) {
    return uniqueMissingReferences([
      ...categoryMissingReferences(outfit.plannedOutfit?.itemsByCategory, liveItemIds),
      ...categoryMissingReferences(outfit.wornOutfit?.itemsByCategory, liveItemIds),
      ...(outfit.wornOutfit?.outfitSnapshot
        ? missingSnapshotReferences(outfit.wornOutfit.outfitSnapshot, liveItemIds)
        : []),
    ]);
  }
  if (isWornOutfit(outfit)) {
    return uniqueMissingReferences([
      ...categoryMissingReferences(outfit.itemsByCategory, liveItemIds),
      ...(outfit.outfitSnapshot ? missingSnapshotReferences(outfit.outfitSnapshot, liveItemIds) : []),
    ]);
  }
  if (isPlannedOutfit(outfit)) {
    return uniqueMissingReferences(categoryMissingReferences(outfit.itemsByCategory, liveItemIds));
  }
  if (isOutfitSnapshot(outfit)) {
    return uniqueMissingReferences(missingSnapshotReferences(outfit, liveItemIds));
  }

  const itemIds = Array.isArray((outfit as { itemIds?: unknown }).itemIds)
    ? ((outfit as { itemIds: unknown[] }).itemIds)
    : [];
  return uniqueMissingReferences(
    itemIds
      .map(cleanString)
      .filter((itemId) => itemId && !liveItemIds.has(itemId))
      .map((itemId) => ({ itemId, label: "Removed from closet" })),
  );
}

export function getMissingClosetItemIds(
  outfit: OutfitReferenceInput,
  liveItemIds: LiveClosetIds,
) {
  return getMissingClosetReferences(outfit, liveItemIds).map((reference) => reference.itemId);
}

export function hasDeletedClosetReferences(
  outfit: OutfitReferenceInput,
  liveItemIds: LiveClosetIds,
) {
  return getMissingClosetReferences(outfit, liveItemIds).length > 0;
}

export function filterOutfitItemsToLiveCloset<T extends OutfitReferenceInput>(
  outfit: T,
  liveItemIdsInput: LiveClosetIds,
): T {
  const liveItemIds = liveSetFrom(liveItemIdsInput);
  if (!outfit || !liveItemIds) return outfit;

  if (isAuraLook(outfit)) return filterAuraLookToLiveCloset(outfit, liveItemIds) as T;
  if (isChatOutfit(outfit)) return filterChatOutfitToLiveCloset(outfit, liveItemIds) as T;
  if (isDailyOutfitRecord(outfit)) return filterDailyRecordToLiveCloset(outfit, liveItemIds) as T;
  if (isWornOutfit(outfit)) return filterWornOutfitToLiveCloset(outfit, liveItemIds) as T;
  if (isPlannedOutfit(outfit)) return filterPlannedOutfitToLiveCloset(outfit, liveItemIds) as T;
  if (isOutfitSnapshot(outfit)) return filterSnapshotToLiveCloset(outfit, liveItemIds) as T;
  return outfit;
}
