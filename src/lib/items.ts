import {
  collection,
  onSnapshot,
  orderBy,
  query,
  QueryConstraint,
  where,
} from "firebase/firestore";

import { db } from "./firebase";
import { ClothingItem, ClothingStatus } from "../types/ClothingItem";

export type ClosetItem = ClothingItem;
export type ItemSort = "NEWEST" | "MOST_WORN";
export type StatusFilter = "ALL" | ClothingStatus;
export type CategoryFilter =
  | "ALL"
  | "TOP"
  | "BOTTOM"
  | "SHOES"
  | "OUTERWEAR"
  | "ACCESSORY";

const CATEGORY_MAP: Record<Exclude<CategoryFilter, "ALL">, string[]> = {
  TOP: ["top"],
  BOTTOM: ["bottom"],
  SHOES: ["shoes"],
  OUTERWEAR: ["outerwear"],
  ACCESSORY: ["accessory"],
};

export function categoryValuesFor(filter: CategoryFilter) {
  if (filter === "ALL") return [];
  return CATEGORY_MAP[filter];
}

export function isInCategory(item: ClosetItem, filter: CategoryFilter) {
  if (filter === "ALL") return true;
  const category = item.category;
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
