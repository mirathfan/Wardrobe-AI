import type { AuraLook, AuraLookPiece } from "@/src/types/aura";
import type { PlannedOutfit } from "@/src/utils/dailyOutfits";

export type OutfitSlotKey =
  | "outerwear"
  | "top"
  | "bottom"
  | "shoes"
  | "accessory"
  | "other";

export type OutfitSnapshotSource =
  | "aura"
  | "planner"
  | "studio"
  | "saved_look"
  | "item_detail";

export type OutfitSnapshotSlot = {
  slot: OutfitSlotKey;
  source: "closet" | "suggested";
  itemId?: string;
  label: string;
  imageUrl?: string;
};

export type OutfitSnapshot = {
  version: 1;
  title?: string;
  source: OutfitSnapshotSource;
  itemIds: string[];
  slots: OutfitSnapshotSlot[];
  missingPieces?: string[];
  stylingNote?: string;
};

type SnapshotInput =
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

function isAuraLook(value: SnapshotInput): value is AuraLook {
  return Boolean(
    value &&
      typeof value === "object" &&
      Array.isArray((value as AuraLook).pieces) &&
      typeof (value as AuraLook).lookTitle === "string",
  );
}

function isPlannedOutfit(value: SnapshotInput): value is PlannedOutfit {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as PlannedOutfit).itemsByCategory &&
      typeof (value as PlannedOutfit).itemsByCategory === "object",
  );
}

function isOutfitSnapshot(value: unknown): value is OutfitSnapshot {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value as OutfitSnapshot).version === 1 &&
      Array.isArray((value as OutfitSnapshot).slots),
  );
}

function roleToSlot(role: AuraLookPiece["role"]): OutfitSlotKey {
  if (role === "accessory") return "accessory";
  return role;
}

function normalizeSlot(slot: unknown): OutfitSlotKey {
  const value = cleanString(slot).toLowerCase();
  if (
    value === "outerwear" ||
    value === "top" ||
    value === "bottom" ||
    value === "shoes" ||
    value === "accessory"
  ) {
    return value;
  }
  if (value === "footwear") return "shoes";
  return "other";
}

function cleanSnapshot(snapshot: OutfitSnapshot, source?: OutfitSnapshotSource): OutfitSnapshot {
  const slots = (snapshot.slots ?? [])
    .map((slot) => {
      const label = cleanString(slot.label) || cleanString(slot.itemId) || "Item";
      const itemId = slot.source === "closet" ? cleanString(slot.itemId) : "";
      return {
        slot: normalizeSlot(slot.slot),
        source: slot.source === "suggested" ? "suggested" as const : "closet" as const,
        ...(itemId ? { itemId } : {}),
        label,
        ...(cleanString(slot.imageUrl) ? { imageUrl: cleanString(slot.imageUrl) } : {}),
      };
    })
    .filter((slot) => slot.label);

  const itemIds = uniqueStrings([
    ...(snapshot.itemIds ?? []),
    ...slots
      .filter((slot) => slot.source === "closet")
      .map((slot) => slot.itemId),
  ]);

  return {
    version: 1,
    ...(cleanString(snapshot.title) ? { title: cleanString(snapshot.title) } : {}),
    source: source ?? snapshot.source ?? "planner",
    itemIds,
    slots,
    ...(snapshot.missingPieces?.length
      ? { missingPieces: uniqueStrings(snapshot.missingPieces) }
      : {}),
    ...(cleanString(snapshot.stylingNote) ? { stylingNote: cleanString(snapshot.stylingNote) } : {}),
  };
}

export function auraLookToOutfitSnapshot(
  look: AuraLook,
  source: OutfitSnapshotSource = "aura",
): OutfitSnapshot {
  const slots: OutfitSnapshotSlot[] = (look.pieces ?? []).map((piece) => {
    const itemId = piece.source === "closet" ? cleanString(piece.itemId) : "";
    return {
      slot: roleToSlot(piece.role),
      source: piece.source === "suggested" ? "suggested" : "closet",
      ...(itemId ? { itemId } : {}),
      label: cleanString(piece.itemName) || cleanString(piece.itemId) || "Item",
      ...(cleanString(piece.imageUrl) ? { imageUrl: cleanString(piece.imageUrl) } : {}),
    };
  });

  return cleanSnapshot(
    {
      version: 1,
      title: cleanString(look.lookTitle) || undefined,
      source,
      itemIds: uniqueStrings(
        slots
          .filter((slot) => slot.source === "closet")
          .map((slot) => slot.itemId),
      ),
      slots,
      missingPieces: uniqueStrings([...(look.addToComplete ?? [])]),
      stylingNote: cleanString(look.stylingNote) || cleanString(look.shortExplanation) || undefined,
    },
    source,
  );
}

export function plannedOutfitToOutfitSnapshot(
  plannedOutfit: PlannedOutfit,
  source: OutfitSnapshotSource = "planner",
): OutfitSnapshot {
  const itemsByCategory = plannedOutfit.itemsByCategory ?? {};
  const slots: OutfitSnapshotSlot[] = [
    ["outerwear", itemsByCategory.outerwear],
    ["top", itemsByCategory.top],
    ["bottom", itemsByCategory.bottom],
    ["shoes", itemsByCategory.shoes],
    ...(itemsByCategory.accessories ?? []).map((itemId) => ["accessory", itemId] as const),
  ]
    .map(([slot, itemId]) => ({
      slot: normalizeSlot(slot),
      source: "closet" as const,
      itemId: cleanString(itemId),
      label: cleanString(itemId) || "Item",
    }))
    .filter((slot) => slot.itemId);

  return cleanSnapshot(
    {
      version: 1,
      source,
      itemIds: slots.map((slot) => slot.itemId).filter(Boolean) as string[],
      slots,
      stylingNote: plannedOutfit.reasons?.filter(Boolean).join(" ") || undefined,
    },
    source,
  );
}

export function outfitSnapshotFromItemIds(
  itemIds: string[],
  options?: {
    title?: string | null;
    source?: OutfitSnapshotSource;
  },
): OutfitSnapshot {
  const ids = uniqueStrings(itemIds);
  return {
    version: 1,
    ...(cleanString(options?.title) ? { title: cleanString(options?.title) } : {}),
    source: options?.source ?? "planner",
    itemIds: ids,
    slots: ids.map((itemId) => ({
      slot: "other",
      source: "closet",
      itemId,
      label: itemId,
    })),
  };
}

export function buildOutfitSnapshot(
  input: SnapshotInput,
  options?: {
    title?: string | null;
    source?: OutfitSnapshotSource;
    itemIds?: string[] | null;
  },
): OutfitSnapshot {
  const source = options?.source ?? "planner";

  if (isAuraLook(input)) {
    const snapshot = auraLookToOutfitSnapshot(input, source);
    return cleanSnapshot(
      {
        ...snapshot,
        title: cleanString(options?.title) || snapshot.title,
        itemIds: uniqueStrings([...(options?.itemIds ?? []), ...snapshot.itemIds]),
      },
      source,
    );
  }

  if (isPlannedOutfit(input)) {
    const snapshot = plannedOutfitToOutfitSnapshot(input, source);
    return cleanSnapshot(
      {
        ...snapshot,
        title: cleanString(options?.title) || snapshot.title,
        itemIds: uniqueStrings([...(options?.itemIds ?? []), ...snapshot.itemIds]),
      },
      source,
    );
  }

  if (input && typeof input === "object") {
    if ((input as { look?: AuraLook | null }).look) {
      return buildOutfitSnapshot((input as { look?: AuraLook | null }).look, options);
    }
    if (isOutfitSnapshot((input as { outfitSnapshot?: unknown }).outfitSnapshot)) {
      return cleanSnapshot(
        {
          ...((input as { outfitSnapshot: OutfitSnapshot }).outfitSnapshot),
          title:
            cleanString(options?.title) ||
            cleanString((input as { title?: string | null }).title) ||
            (input as { outfitSnapshot: OutfitSnapshot }).outfitSnapshot.title,
          itemIds: uniqueStrings([
            ...(options?.itemIds ?? []),
            ...((input as { itemIds?: string[] | null }).itemIds ?? []),
            ...(input as { outfitSnapshot: OutfitSnapshot }).outfitSnapshot.itemIds,
          ]),
        },
        source,
      );
    }
    return outfitSnapshotFromItemIds(
      uniqueStrings([
        ...(options?.itemIds ?? []),
        ...((input as { itemIds?: string[] | null }).itemIds ?? []),
      ]),
      {
        title:
          cleanString(options?.title) ||
          cleanString((input as { title?: string | null }).title),
        source,
      },
    );
  }

  return outfitSnapshotFromItemIds(options?.itemIds ?? [], {
    title: options?.title,
    source,
  });
}

export function getOwnedItemIdsFromOutfitSnapshot(snapshot: OutfitSnapshot) {
  return uniqueStrings([
    ...(snapshot.itemIds ?? []),
    ...(snapshot.slots ?? [])
      .filter((slot) => slot.source === "closet")
      .map((slot) => slot.itemId),
  ]);
}

export function outfitSnapshotToPlannedOutfit(
  snapshot: OutfitSnapshot,
  options?: {
    score?: number;
    reasons?: string[];
    createdAt?: number;
  },
): PlannedOutfit {
  const firstItemForSlot = (slot: OutfitSlotKey) =>
    snapshot.slots.find((entry) => entry.slot === slot && entry.source === "closet" && entry.itemId)?.itemId;
  const accessories = uniqueStrings(
    snapshot.slots
      .filter((entry) => entry.slot === "accessory" && entry.source === "closet")
      .map((entry) => entry.itemId),
  );

  return {
    itemsByCategory: {
      ...(firstItemForSlot("outerwear") ? { outerwear: firstItemForSlot("outerwear") } : {}),
      ...(firstItemForSlot("top") ? { top: firstItemForSlot("top") } : {}),
      ...(firstItemForSlot("bottom") ? { bottom: firstItemForSlot("bottom") } : {}),
      ...(firstItemForSlot("shoes") ? { shoes: firstItemForSlot("shoes") } : {}),
      ...(accessories.length ? { accessories } : {}),
    },
    score: options?.score ?? 0.86,
    reasons: options?.reasons?.length
      ? options.reasons
      : [snapshot.stylingNote].filter(Boolean) as string[],
    createdAt: options?.createdAt ?? Date.now(),
  };
}
