import {
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  QueryConstraint,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { Alert } from "react-native";

import { db } from "./firebase";
import { logItemStyleEvent } from "./auraMemory";
import { buildSignalFromItem, updateAssistantMemoryFromAction } from "./assistantMemory";
import { getFriendlyErrorMessage } from "./errors";
import { getCachedClosetItems, setCachedClosetItems } from "./localCache";
import type { ClothingItem, ClothingStatus, LaundryStatus } from "../types/ClothingItem";
import { Category } from "../shared/wardrobeTaxonomy";

export type { ClothingItem, ClothingStatus, LaundryStatus } from "../types/ClothingItem";

export type ClosetItem = ClothingItem;
export type ItemSort = "NEWEST" | "MOST_WORN";
export type StatusFilter = "ALL" | ClothingStatus;
export type CanonicalCategory =
  | "top"
  | "one_piece"
  | "bottom"
  | "shoes"
  | "outerwear"
  | "accessory";
export type CanonicalCategoryGroup =
  | "tops"
  | "one_piece"
  | "bottoms"
  | "footwear"
  | "outerwear"
  | "accessories"
  | "other";
export type CategoryFilter =
  | "ALL"
  | "TOP"
  | "ONE_PIECE"
  | "BOTTOM"
  | "SHOES"
  | "OUTERWEAR"
  | "ACCESSORY";
export const MAX_WEARS_BEFORE_WASH = 2;
export const LAUNDRY_STATUS_LABELS: Record<LaundryStatus, string> = {
  clean: "Clean",
  needs_wash: "Needs wash",
  in_laundry: "In laundry",
};
export type IngestionStatus = "pending" | "processing" | "done" | "failed";
export type DraftState = "draft" | "awaiting_confirmation" | "photo_uploaded" | "ingesting" | "ready" | "failed" | "cancelled";
export type ItemLifecycleStatus =
  | "candidate"
  | "uploading"
  | "processing"
  | "needs_review"
  | "ready"
  | "failed"
  | "deleted";

const CATEGORY_MAP: Record<Exclude<CategoryFilter, "ALL">, string[]> = {
  TOP: ["top"],
  ONE_PIECE: ["one_piece"],
  BOTTOM: ["bottom"],
  SHOES: ["shoes"],
  OUTERWEAR: ["outerwear"],
  ACCESSORY: ["accessory"],
};
const LISTEN_TO_ITEMS_LIMIT = 300;

function alertItemMutationError(error: unknown) {
  if (__DEV__) console.log("[callable error]", error);
  Alert.alert("Hold on", getFriendlyErrorMessage(error));
}

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

const CANONICAL_CATEGORY_ALIASES: Record<Exclude<CanonicalCategoryGroup, "other">, readonly string[]> = {
  // Keep this alias table in sync with functions/src/shared/buildAuraContext.ts.
  one_piece: ["one piece", "dress", "jumpsuit", "romper", "set", "matching set"],
  tops: [
    "top",
    "tops",
    "tshirt",
    "t shirt",
    "t-shirt",
    "shirt",
    "tee",
    "polo",
    "sweater",
    "sweatshirt",
    "blouse",
    "crop top",
    "tank",
    "tank top",
    "kurta",
  ],
  outerwear: [
    "outerwear",
    "jacket",
    "jackets",
    "hoodie",
    "hoodies",
    "coat",
    "coats",
    "blazer",
    "blazers",
    "overshirt",
    "overshirts",
    "cardigan",
    "cardigans",
    "shacket",
    "trench",
    "parka",
    "bomber",
    "layer",
    "layers",
  ],
  bottoms: [
    "bottom",
    "bottoms",
    "pants",
    "trousers",
    "jeans",
    "shorts",
    "joggers",
    "skirt",
    "cargo",
    "cargos",
    "chinos",
    "trackpants",
    "track pants",
  ],
  footwear: [
    "shoes",
    "shoe",
    "footwear",
    "sneakers",
    "sneaker",
    "boots",
    "boot",
    "slides",
    "slide",
    "sandals",
    "sandal",
    "loafers",
    "loafer",
    "heel",
    "heels",
    "formal shoe",
    "formal shoes",
    "derby",
    "derbies",
    "oxford",
    "oxfords",
    "chelsea boot",
    "chelsea boots",
  ],
  accessories: [
    "accessory",
    "accessories",
    "cap",
    "hat",
    "watch",
    "sunglasses",
    "glasses",
    "belt",
    "handbag",
    "bag",
    "tote",
    "tote bag",
    "crossbody",
    "necklace",
    "bracelet",
    "ring",
    "earrings",
    "scarf",
    "perfume",
    "jewellery",
    "jewelry",
    "socks",
  ],
};

function normalizedCategoryToken(raw?: string | null) {
  return norm(raw)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLaundryStatus(item: Partial<ClosetItem> | null | undefined): LaundryStatus {
  const raw = String((item as any)?.laundryStatus ?? "").trim().toLowerCase();
  if (raw === "clean" || raw === "needs_wash" || raw === "in_laundry") return raw;
  const legacy = String((item as any)?.status ?? "").trim().toUpperCase();
  if (legacy === "IN_LAUNDRY") return "in_laundry";
  if (legacy === "WORN") return "needs_wash";
  const wears = Number((item as any)?.wearCountSinceWash ?? 0);
  if (Number.isFinite(wears) && wears >= 3) return "needs_wash";
  return "clean";
}

export function legacyStatusForLaundryStatus(status: LaundryStatus): ClothingStatus {
  if (status === "in_laundry") return "IN_LAUNDRY";
  if (status === "needs_wash") return "WORN";
  return "AVAILABLE";
}

export function isItemClean(item: Partial<ClosetItem> | null | undefined) {
  return normalizeLaundryStatus(item) === "clean";
}

export function isItemInLaundry(item: Partial<ClosetItem> | null | undefined) {
  return normalizeLaundryStatus(item) === "in_laundry";
}

export function getIngestionStatus(
  item: Partial<ClosetItem> | null | undefined
): IngestionStatus | null {
  const raw = String(
    (item as any)?.ingestion?.status ?? (item as any)?.ingestionStatus ?? ""
  )
    .trim()
    .toLowerCase();
  if (
    raw === "pending" ||
    raw === "processing" ||
    raw === "done" ||
    raw === "failed"
  ) {
    return raw;
  }
  return null;
}

export function getDraftState(
  item: Partial<ClosetItem> | null | undefined
): DraftState | null {
  const raw = String((item as any)?.draftState ?? "")
    .trim()
    .toLowerCase();
  if (
    raw === "draft" ||
    raw === "awaiting_confirmation" ||
    raw === "photo_uploaded" ||
    raw === "ingesting" ||
    raw === "ready" ||
    raw === "failed" ||
    raw === "cancelled"
  ) {
    return raw;
  }

  if ((item as any)?.isDraft === true) {
    const ingestionStatus = getIngestionStatus(item);
    if (ingestionStatus === "processing" || ingestionStatus === "pending") {
      return "ingesting";
    }
    if (ingestionStatus === "failed") {
      return "failed";
    }
    return "draft";
  }

  return null;
}

export function isVisibleWardrobeItem(
  item: Partial<ClosetItem> | null | undefined
): boolean {
  if (!item) return false;
  const lifecycle = getItemLifecycleStatus(item);
  if (lifecycle === "candidate" || lifecycle === "deleted") return false;
  if ((item as any).isDraft === true) return false;
  const draftState = getDraftState(item);
  if (draftState && draftState !== "ready") return false;
  return true;
}

function hasItemVisualSource(item: Partial<ClosetItem> | null | undefined): boolean {
  if (!item) return false;
  const candidate = item as any;
  return Boolean(
    candidate.photoUrl ||
      candidate.originalImageUrl ||
      candidate.cleanedImageUrl ||
      candidate.photos?.primaryUrl ||
      candidate.photos?.urls?.length ||
      candidate.images?.length ||
      candidate.sourceUrl
  );
}

const STALE_PROCESSING_MS = 10 * 60 * 1000;

function toMillisValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof (value as any).toMillis === "function") {
    const millis = Number((value as any).toMillis());
    return Number.isFinite(millis) ? millis : null;
  }
  return null;
}

function isStaleProcessingItem(item: Partial<ClosetItem> | null | undefined): boolean {
  const candidate = item as any;
  const startedAt =
    toMillisValue(candidate?.ingestion?.startedAt) ??
    toMillisValue(candidate?.ingestion?.lastRunAt) ??
    toMillisValue(candidate?.updatedAt) ??
    toMillisValue(candidate?.createdAt);
  return !startedAt || Date.now() - startedAt >= STALE_PROCESSING_MS;
}

export function getItemLifecycleStatus(
  item: Partial<ClosetItem> | null | undefined
): ItemLifecycleStatus {
  if (!item) return "ready";
  const ingestionStatus = getIngestionStatus(item);
  const draftState = getDraftState(item);
  const explicit = String((item as any)?.itemLifecycleStatus ?? "")
    .trim()
    .toLowerCase();
  if (explicit === "candidate" || explicit === "deleted") return explicit;
  if (ingestionStatus === "failed" || draftState === "failed") return "failed";
  if (
    explicit === "uploading" ||
    explicit === "processing" ||
    explicit === "needs_review" ||
    explicit === "ready" ||
    explicit === "failed"
  ) {
    if (explicit === "processing" && isStaleProcessingItem(item)) return "failed";
    if (
      explicit === "needs_review" &&
      ingestionStatus === "done" &&
      draftState === "ready" &&
      (item as any)?.isDraft !== true
    ) {
      return "ready";
    }
    return explicit;
  }

  if (draftState === "awaiting_confirmation") return "candidate";
  if (draftState === "cancelled") return "deleted";
  if (draftState === "photo_uploaded" && ingestionStatus === "done") return "needs_review";
  if (ingestionStatus === "pending" || ingestionStatus === "processing") {
    return isStaleProcessingItem(item) ? "failed" : "processing";
  }
  if ((item as any)?.isDraft === true && hasItemVisualSource(item)) return "needs_review";
  return "ready";
}

export function isProcessingWardrobeItem(
  item: Partial<ClosetItem> | null | undefined
): boolean {
  if (!item || !hasItemVisualSource(item)) return false;
  const lifecycle = getItemLifecycleStatus(item);
  return lifecycle === "uploading" || lifecycle === "processing" || lifecycle === "needs_review" || lifecycle === "failed";
}

export function toCanonicalCategoryGroup(raw?: string | null): CanonicalCategoryGroup {
  const value = normalizedCategoryToken(raw);
  if (!value) return "other";

  for (const [category, aliases] of Object.entries(CANONICAL_CATEGORY_ALIASES) as [
    Exclude<CanonicalCategoryGroup, "other">,
    readonly string[],
  ][]) {
    if (aliases.includes(value)) return category;
  }

  return "other";
}

export function toCanonicalCategory(raw?: string | null): CanonicalCategory {
  const category = toCanonicalCategoryGroup(raw);
  if (category === "tops") return "top";
  if (category === "bottoms") return "bottom";
  if (category === "footwear") return "shoes";
  if (category === "accessories") return "accessory";
  if (category === "one_piece") return "one_piece";
  if (category === "outerwear") return "outerwear";
  return "accessory";
}

export function categoryValuesFor(filter: CategoryFilter) {
  if (filter === "ALL") return [];
  return CATEGORY_MAP[filter];
}

export function normalizeCategoryForStorage(raw?: string | null): Category {
  const category = toCanonicalCategoryGroup(raw);
  if (category === "tops") return Category.TOP;
  if (category === "bottoms") return Category.BOTTOM;
  if (category === "footwear") return Category.FOOTWEAR;
  if (category === "outerwear") return Category.OUTERWEAR;
  if (category === "one_piece") return Category.ONE_PIECE;
  if (category === "accessories") return Category.ACCESSORY;
  const v = normalizedCategoryToken(raw);
  if (Object.values(Category).includes(v as Category)) return v as Category;
  return Category.TOP;
}

export function isInCategory(item: ClosetItem, filter: CategoryFilter) {
  if (filter === "ALL") return true;
  const category = toCanonicalCategory(item.category);
  return categoryValuesFor(filter).includes(category);
}

export type ClosetItemsSourceMeta = {
  source: "cache" | "firestore";
  stale?: boolean;
  updatedAt?: number;
};

function applyItemOptions(
  items: ClosetItem[],
  options?: {
    status?: StatusFilter;
    sort?: ItemSort;
    includeDrafts?: boolean;
  }
) {
  const status = options?.status ?? "ALL";
  const sort = options?.sort ?? "NEWEST";
  const visible = options?.includeDrafts ? items : items.filter((item) => isVisibleWardrobeItem(item));
  const filtered =
    status === "ALL"
      ? visible
      : visible.filter((item) => item.status === status || legacyStatusForLaundryStatus(normalizeLaundryStatus(item)) === status);

  return [...filtered].sort((left, right) => {
    if (sort === "MOST_WORN") {
      return Number(right.wearCountSinceWash ?? 0) - Number(left.wearCountSinceWash ?? 0);
    }
    return toTimestampNumber(right.createdAt) - toTimestampNumber(left.createdAt);
  });
}

function toTimestampNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
    if (typeof maybeTimestamp.toMillis === "function") {
      const millis = maybeTimestamp.toMillis();
      return Number.isFinite(millis) ? millis : 0;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000 + Math.floor((maybeTimestamp.nanoseconds ?? 0) / 1000000);
    }
  }
  return 0;
}

export function listenToItems(
  uid: string,
  cb: (items: ClosetItem[], meta?: ClosetItemsSourceMeta) => void,
  options?: {
    status?: StatusFilter;
    sort?: ItemSort;
    includeDrafts?: boolean;
    hydrateFromCache?: boolean;
    onError?: (message: string) => void;
    onCacheStatus?: (meta: ClosetItemsSourceMeta) => void;
  }
) {
  const constraints: QueryConstraint[] = [];
  const status = options?.status ?? "ALL";
  const sort = options?.sort ?? "NEWEST";

  if (status !== "ALL") {
    constraints.push(where("status", "==", status));
  }

  constraints.push(
    sort === "MOST_WORN"
      ? orderBy("wearCountSinceWash", "desc")
      : orderBy("createdAt", "desc")
  );

  const itemsRef = collection(db, "users", uid, "items");
  // TODO before GA: replace this fixed cap with a paginated load-more flow.
  const q = query(itemsRef, ...constraints, limit(LISTEN_TO_ITEMS_LIMIT));
  let active = true;

  if (options?.hydrateFromCache !== false) {
    void getCachedClosetItems(uid).then((cached) => {
      if (!active || !cached?.data?.length) return;
      const meta: ClosetItemsSourceMeta = {
        source: "cache",
        stale: cached.stale,
        updatedAt: cached.updatedAt,
      };
      options?.onCacheStatus?.(meta);
      cb(applyItemOptions(cached.data as ClosetItem[], options), meta);
    });
  }

  const unsubscribe = onSnapshot(
    q,
    (snap) => {
      const next: ClosetItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      void setCachedClosetItems(uid, next);
      cb(applyItemOptions(next, options), { source: "firestore" });
    },
    (err) => {
      if (__DEV__) {
        console.warn("[Items] listenToItems failed", err);
      }
      options?.onError?.("We couldn't load your closet. Please try again.");
    }
  );

  return () => {
    active = false;
    unsubscribe();
  };
}

function toDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (typeof (value as any).toDate === "function") {
    const d = (value as any).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  return null;
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export async function safeMarkWorn(uid: string, itemId: string) {
  const ref = doc(db, "users", uid, "items", itemId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    throw new Error("Item not found");
  }

  const data = snap.data() as Partial<ClosetItem>;
  if (normalizeLaundryStatus(data) === "in_laundry") {
    throw new Error("Item is in laundry");
  }

  const wearCount = Number(data.wearCountSinceWash ?? 0);
  if (wearCount >= MAX_WEARS_BEFORE_WASH) {
    throw new Error("Wash required before wearing again");
  }

  const lastWorn = toDateValue(data.lastWornDate);
  if (lastWorn && isSameLocalDay(lastWorn, new Date())) {
    throw new Error("Item already worn today");
  }

  try {
    await updateDoc(ref, {
      status: "WORN",
      laundryStatus: "needs_wash",
      wearCountSinceWash: increment(1),
      lastWornDate: serverTimestamp(),
      lastWornAt: serverTimestamp(),
      laundryUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    alertItemMutationError(error);
    throw error;
  }
  void logItemStyleEvent(uid, "item_worn", {
    ...(data as ClothingItem),
    id: itemId,
  });
  void updateAssistantMemoryFromAction(uid, "wear_item", buildSignalFromItem({
    ...(data as ClothingItem),
    id: itemId,
  }));
}

export async function markWorn(uid: string, itemId: string) {
  return safeMarkWorn(uid, itemId);
}

export async function sendToLaundry(uid: string, itemId: string) {
  const ref = doc(db, "users", uid, "items", itemId);
  try {
    await updateDoc(ref, {
      status: "IN_LAUNDRY",
      laundryStatus: "in_laundry",
      laundryUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    alertItemMutationError(error);
    throw error;
  }
}

export async function markWashed(uid: string, itemId: string) {
  const ref = doc(db, "users", uid, "items", itemId);
  try {
    await updateDoc(ref, {
      status: "AVAILABLE",
      laundryStatus: "clean",
      wearCountSinceWash: 0,
      lastWashedDate: serverTimestamp(),
      lastWashedAt: serverTimestamp(),
      laundryUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    alertItemMutationError(error);
    throw error;
  }
}

export async function markNeedsWash(uid: string, itemId: string) {
  const ref = doc(db, "users", uid, "items", itemId);
  try {
    await updateDoc(ref, {
      status: "WORN",
      laundryStatus: "needs_wash",
      laundryUpdatedAt: serverTimestamp(),
    });
  } catch (error) {
    alertItemMutationError(error);
    throw error;
  }
}

function laundryStatusUpdatePayload(laundryStatus: LaundryStatus) {
  return {
    status: legacyStatusForLaundryStatus(laundryStatus),
    laundryStatus,
    ...(laundryStatus === "clean"
      ? {
          wearCountSinceWash: 0,
          lastWashedDate: serverTimestamp(),
          lastWashedAt: serverTimestamp(),
        }
      : {}),
    laundryUpdatedAt: serverTimestamp(),
  };
}

export async function updateLaundryStatus(uid: string, itemId: string, laundryStatus: LaundryStatus) {
  const ref = doc(db, "users", uid, "items", itemId);
  try {
    await updateDoc(ref, laundryStatusUpdatePayload(laundryStatus));
  } catch (error) {
    alertItemMutationError(error);
    throw error;
  }
}

export async function updateLaundryStatuses(uid: string, itemIds: string[], laundryStatus: LaundryStatus) {
  const uniqueItemIds = Array.from(new Set(itemIds.filter(Boolean)));
  if (!uniqueItemIds.length) return;

  const batch = writeBatch(db);
  uniqueItemIds.forEach((itemId) => {
    batch.update(doc(db, "users", uid, "items", itemId), laundryStatusUpdatePayload(laundryStatus));
  });
  try {
    await batch.commit();
  } catch (error) {
    alertItemMutationError(error);
    throw error;
  }
}
