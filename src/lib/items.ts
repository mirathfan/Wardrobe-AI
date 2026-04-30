import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  orderBy,
  query,
  QueryConstraint,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import { logItemStyleEvent } from "./auraMemory";
import { buildSignalFromItem, updateAssistantMemoryFromAction } from "./assistantMemory";
import { ClothingItem, ClothingStatus, LaundryStatus } from "../types/ClothingItem";
import { Category } from "../shared/wardrobeTaxonomy";

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

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
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

export function getItemLifecycleStatus(
  item: Partial<ClosetItem> | null | undefined
): ItemLifecycleStatus {
  if (!item) return "ready";
  const explicit = String((item as any)?.itemLifecycleStatus ?? "")
    .trim()
    .toLowerCase();
  if (
    explicit === "candidate" ||
    explicit === "uploading" ||
    explicit === "processing" ||
    explicit === "needs_review" ||
    explicit === "ready" ||
    explicit === "failed" ||
    explicit === "deleted"
  ) {
    return explicit;
  }

  const ingestionStatus = getIngestionStatus(item);
  const draftState = getDraftState(item);
  if (draftState === "awaiting_confirmation") return "candidate";
  if (draftState === "cancelled") return "deleted";
  if (ingestionStatus === "failed" || draftState === "failed") return "failed";
  if (draftState === "photo_uploaded" && ingestionStatus === "done") return "needs_review";
  if (ingestionStatus === "pending" || ingestionStatus === "processing") return "processing";
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

export function toCanonicalCategory(raw?: string | null): CanonicalCategory {
  const v = norm(raw).replace(/\s+/g, " ");

  if (
    [
      "one_piece",
      "dress",
      "jumpsuit",
      "romper",
      "set",
      "matching_set",
    ].includes(v)
  ) {
    return "one_piece";
  }

  if (
    [
      "top",
      "tshirt",
      "t-shirt",
      "shirt",
      "tee",
      "polo",
      "sweater",
      "blouse",
      "crop_top",
      "tank",
    ].includes(v)
  ) {
    return "top";
  }

  if (
    ["bottom", "pants", "trousers", "jeans", "shorts", "joggers", "skirt"].includes(v)
  ) {
    return "bottom";
  }

  if (
    ["shoes", "footwear", "sneakers", "sneaker", "boots", "slides", "sandal", "loafer", "heel"].includes(
      v
    )
  ) {
    return "shoes";
  }

  if (["outerwear", "jacket", "hoodie", "coat", "blazer"].includes(v)) {
    return "outerwear";
  }

  if (
    [
      "accessory",
      "accessories",
      "cap",
      "hat",
      "watch",
      "sunglasses",
      "belt",
      "handbag",
      "bag",
      "necklace",
      "bracelet",
      "ring",
      "earrings",
      "scarf",
      "perfume",
    ].includes(v)
  ) {
    return "accessory";
  }

  return "accessory";
}

export function categoryValuesFor(filter: CategoryFilter) {
  if (filter === "ALL") return [];
  return CATEGORY_MAP[filter];
}

export function normalizeCategoryForStorage(raw?: string | null): Category {
  const v = norm(raw).replace(/\s+/g, " ");
  if (v === "shoes") return Category.FOOTWEAR;
  if (v === "one piece") return Category.ONE_PIECE;
  if (Object.values(Category).includes(v as Category)) return v as Category;
  return Category.TOP;
}

export function isInCategory(item: ClosetItem, filter: CategoryFilter) {
  if (filter === "ALL") return true;
  const category = toCanonicalCategory(item.category);
  return categoryValuesFor(filter).includes(category);
}

export function listenToItems(
  uid: string,
  cb: (items: ClosetItem[]) => void,
  options?: {
    status?: StatusFilter;
    sort?: ItemSort;
    includeDrafts?: boolean;
    onError?: (message: string) => void;
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
  const q = query(itemsRef, ...constraints);

  return onSnapshot(
    q,
    (snap) => {
      const next: ClosetItem[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      cb(options?.includeDrafts ? next : next.filter((item) => isVisibleWardrobeItem(item)));
    },
    (err) => options?.onError?.(err.message)
  );
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

  await updateDoc(ref, {
    status: "WORN",
    laundryStatus: "needs_wash",
    wearCountSinceWash: increment(1),
    lastWornDate: serverTimestamp(),
    lastWornAt: serverTimestamp(),
    laundryUpdatedAt: serverTimestamp(),
  });
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
  await updateDoc(ref, {
    status: "IN_LAUNDRY",
    laundryStatus: "in_laundry",
    laundryUpdatedAt: serverTimestamp(),
  });
}

export async function markWashed(uid: string, itemId: string) {
  const ref = doc(db, "users", uid, "items", itemId);
  await updateDoc(ref, {
    status: "AVAILABLE",
    laundryStatus: "clean",
    wearCountSinceWash: 0,
    lastWashedDate: serverTimestamp(),
    lastWashedAt: serverTimestamp(),
    laundryUpdatedAt: serverTimestamp(),
  });
}

export async function markNeedsWash(uid: string, itemId: string) {
  const ref = doc(db, "users", uid, "items", itemId);
  await updateDoc(ref, {
    status: "WORN",
    laundryStatus: "needs_wash",
    laundryUpdatedAt: serverTimestamp(),
  });
}

export async function updateLaundryStatus(uid: string, itemId: string, laundryStatus: LaundryStatus) {
  const ref = doc(db, "users", uid, "items", itemId);
  await updateDoc(ref, {
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
  });
}
