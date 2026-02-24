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
import { addItemToOutfit, toDateKey } from "./outfits";
import { ClothingItem, ClothingStatus } from "../types/ClothingItem";

export type ClosetItem = ClothingItem;
export type ItemSort = "NEWEST" | "MOST_WORN";
export type StatusFilter = "ALL" | ClothingStatus;
export type CanonicalCategory =
  | "top"
  | "bottom"
  | "shoes"
  | "outerwear"
  | "accessory";
export type CategoryFilter =
  | "ALL"
  | "TOP"
  | "BOTTOM"
  | "SHOES"
  | "OUTERWEAR"
  | "ACCESSORY";
export const MAX_WEARS_BEFORE_WASH = 2;

const CATEGORY_MAP: Record<Exclude<CategoryFilter, "ALL">, string[]> = {
  TOP: ["top"],
  BOTTOM: ["bottom"],
  SHOES: ["shoes"],
  OUTERWEAR: ["outerwear"],
  ACCESSORY: ["accessory"],
};

function norm(v?: string | null) {
  return (v ?? "").trim().toLowerCase();
}

export function toCanonicalCategory(raw?: string | null): CanonicalCategory {
  const v = norm(raw).replace(/\s+/g, " ");

  if (
    ["top", "tshirt", "t-shirt", "shirt", "tee", "polo", "sweater"].includes(v)
  ) {
    return "top";
  }

  if (
    ["bottom", "pants", "trousers", "jeans", "shorts", "joggers"].includes(v)
  ) {
    return "bottom";
  }

  if (["shoes", "sneakers", "boots", "slides"].includes(v)) {
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
      cb(next);
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
  if (data.status === "IN_LAUNDRY") {
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

  await addItemToOutfit(toDateKey(new Date()), itemId, false);
  await updateDoc(ref, {
    status: "WORN",
    wearCountSinceWash: increment(1),
    lastWornDate: serverTimestamp(),
  });
}

export async function markWorn(uid: string, itemId: string) {
  return safeMarkWorn(uid, itemId);
}

export async function sendToLaundry(uid: string, itemId: string) {
  const ref = doc(db, "users", uid, "items", itemId);
  await updateDoc(ref, { status: "IN_LAUNDRY" });
}

export async function markWashed(uid: string, itemId: string) {
  const ref = doc(db, "users", uid, "items", itemId);
  await updateDoc(ref, {
    status: "AVAILABLE",
    wearCountSinceWash: 0,
    lastWashedDate: serverTimestamp(),
  });
}
