import {
  FieldValue,
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "../lib/firebase";
import { toDayKey } from "./date";

export type OutfitItemsByCategory = {
  outerwear?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
};

export type PlannedOutfit = {
  itemsByCategory: OutfitItemsByCategory;
  locked?: {
    outerwear?: boolean;
    top?: boolean;
    bottom?: boolean;
    shoes?: boolean;
  };
  score: number;
  reasons: string[];
  createdAt: number;
};

export type WornOutfit = {
  itemsByCategory: OutfitItemsByCategory;
  wornAt: number;
};

export type DailyOutfitRecord = {
  dateKey: string;
  plannedOutfit?: PlannedOutfit;
  wornOutfit?: WornOutfit;
};

type FirestoreOutfitDoc = {
  dateKey?: string;
  itemIds?: string[];
  planned?: boolean;
  plannedOutfit?: PlannedOutfit | null;
  wornOutfit?: WornOutfit | null;
};

function isFirestoreSentinel(value: unknown): value is FieldValue {
  return value instanceof FieldValue;
}

function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => removeUndefinedFields(entry)) as T;
  }

  if (isFirestoreSentinel(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, removeUndefinedFields(entry)]);
    return Object.fromEntries(entries) as T;
  }

  return value;
}

function normalizeDateKey(dateKey: string | Date) {
  return typeof dateKey === "string" ? dateKey : toDayKey(dateKey);
}

function outfitDocRef(uid: string, dateKey: string) {
  return doc(db, "users", uid, "outfits", dateKey);
}

function cleanItemIds(itemsByCategory: OutfitItemsByCategory) {
  return [
    itemsByCategory.outerwear,
    itemsByCategory.top,
    itemsByCategory.bottom,
    itemsByCategory.shoes,
  ].filter(Boolean) as string[];
}

function toRecord(
  snap: QueryDocumentSnapshot | { id: string; data: () => FirestoreOutfitDoc } | null
): DailyOutfitRecord | null {
  if (!snap) return null;
  const data = (snap.data() as FirestoreOutfitDoc) ?? {};
  const dateKey = String(data.dateKey ?? snap.id ?? "").trim();
  if (!dateKey) return null;

  const plannedOutfit =
    data.plannedOutfit && typeof data.plannedOutfit === "object"
      ? data.plannedOutfit
      : undefined;
  const wornOutfit =
    data.wornOutfit && typeof data.wornOutfit === "object"
      ? data.wornOutfit
      : undefined;

  if (!plannedOutfit && !wornOutfit) return null;

  return {
    dateKey,
    ...(plannedOutfit ? { plannedOutfit } : {}),
    ...(wornOutfit ? { wornOutfit } : {}),
  };
}

export async function getOutfitByDate(uid: string, dateKey: string | Date) {
  const key = normalizeDateKey(dateKey);
  const snap = await getDoc(outfitDocRef(uid, key));
  return snap.exists() ? toRecord(snap) : null;
}

export function subscribeOutfitByDate(
  uid: string,
  dateKey: string | Date,
  cb: (record: DailyOutfitRecord | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const key = normalizeDateKey(dateKey);
  return onSnapshot(
    outfitDocRef(uid, key),
    (snap) => cb(snap.exists() ? toRecord(snap) : null),
    (error) => onError?.(error)
  );
}

export function subscribeOutfitsInRange(
  uid: string,
  startDateKey: string,
  endDateKey: string,
  cb: (records: Record<string, DailyOutfitRecord | null>) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const outfitsRef = collection(db, "users", uid, "outfits");
  const q = query(
    outfitsRef,
    where(documentId(), ">=", startDateKey),
    where(documentId(), "<=", endDateKey),
    orderBy(documentId())
  );

  return onSnapshot(
    q,
    (snap) => {
      const next: Record<string, DailyOutfitRecord | null> = {};
      snap.docs.forEach((docSnap) => {
        next[docSnap.id] = toRecord(docSnap);
      });
      cb(next);
    },
    (error) => onError?.(error)
  );
}

export async function savePlannedOutfit(
  uid: string,
  dateKey: string | Date,
  itemIds: string[],
  extraFields?: {
    plannedOutfit?: PlannedOutfit;
    [key: string]: unknown;
  }
) {
  const key = normalizeDateKey(dateKey);
  const ref = outfitDocRef(uid, key);
  const rawPayload = {
    dateKey: key,
    itemIds: itemIds.filter(Boolean),
    planned: true,
    ...(extraFields ?? {}),
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
  const payload = removeUndefinedFields(rawPayload);

  console.log("[OutfitSave] savePlannedOutfit:raw", {
    path: ref.path,
    uid,
    dateKey: key,
    itemIds,
    rawPayload,
  });
  console.log("[OutfitSave] savePlannedOutfit:clean", {
    path: ref.path,
    uid,
    dateKey: key,
    itemIds: Array.isArray(payload.itemIds) ? payload.itemIds : [],
    payload,
  });

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    console.log("[OutfitSave] savePlannedOutfit:error", {
      path: ref.path,
      uid,
      dateKey: key,
      itemIds,
      rawPayload,
      payload,
      error,
    });
    throw error;
  }
  return getOutfitByDate(uid, key);
}

export async function savePlannedRecord(
  uid: string,
  dateKey: string | Date,
  plannedOutfit: PlannedOutfit
) {
  const key = normalizeDateKey(dateKey);
  return savePlannedOutfit(uid, key, cleanItemIds(plannedOutfit.itemsByCategory), {
    plannedOutfit,
  });
}

export async function markOutfitWorn(
  uid: string,
  dateKey: string | Date,
  wornOutfit: WornOutfit
) {
  const key = normalizeDateKey(dateKey);
  const ref = outfitDocRef(uid, key);
  const payload = removeUndefinedFields({
    dateKey: key,
    itemIds: cleanItemIds(wornOutfit.itemsByCategory),
    planned: false,
    wornOutfit,
    wornAtMs: wornOutfit.wornAt,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });

  await setDoc(
    ref,
    payload,
    { merge: true }
  );
  return getOutfitByDate(uid, key);
}

export async function clearPlannedOutfit(uid: string, dateKey: string | Date) {
  const key = normalizeDateKey(dateKey);
  const ref = outfitDocRef(uid, key);
  await setDoc(
    ref,
    {
      planned: false,
      itemIds: deleteField(),
      plannedOutfit: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  return getOutfitByDate(uid, key);
}

export async function copyPlannedOutfit(
  uid: string,
  fromDateKey: string | Date,
  toDateKey: string | Date
) {
  const source = await getOutfitByDate(uid, fromDateKey);
  if (!source?.plannedOutfit) return null;

  return savePlannedRecord(uid, toDateKey, {
    ...source.plannedOutfit,
    createdAt: Date.now(),
  });
}

export async function getRecordsForDateKeys(uid: string, dateKeys: string[]) {
  const keys = Array.from(new Set(dateKeys.map((key) => String(key).trim()).filter(Boolean)));
  const out: Record<string, DailyOutfitRecord | null> = {};
  keys.forEach((key) => {
    out[key] = null;
  });

  if (keys.length === 0) return out;

  const outfitsRef = collection(db, "users", uid, "outfits");
  for (let index = 0; index < keys.length; index += 30) {
    const chunk = keys.slice(index, index + 30);
    const snap = await getDocs(
      query(outfitsRef, where(documentId(), "in", chunk), orderBy(documentId()))
    );
    snap.docs.forEach((docSnap) => {
      out[docSnap.id] = toRecord(docSnap);
    });
  }

  return out;
}

export async function getDailyRecord(uid: string, dateKey: string | Date) {
  return getOutfitByDate(uid, dateKey);
}

export async function setPlanned(
  uid: string,
  dateKey: string | Date,
  plannedOutfit: PlannedOutfit
) {
  return savePlannedRecord(uid, dateKey, plannedOutfit);
}

export async function setWorn(uid: string, dateKey: string | Date, wornOutfit: WornOutfit) {
  return markOutfitWorn(uid, dateKey, wornOutfit);
}

export async function clearPlan(uid: string, dateKey: string | Date) {
  return clearPlannedOutfit(uid, dateKey);
}

export async function copyPlan(uid: string, fromDateKey: string | Date, toDateKey: string | Date) {
  return copyPlannedOutfit(uid, fromDateKey, toDateKey);
}
