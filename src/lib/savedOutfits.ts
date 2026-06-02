import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";

import { db } from "@/src/lib/firebase";
import type {
  AuraAgentFormality,
  AuraAgentOutfit,
  AuraAgentOutfitItem,
  AuraAgentOutfitRole,
} from "@/src/types/auraAgent";

export type SavedOutfitItem = {
  itemId: string;
  role: AuraAgentOutfitRole;
  name: string;
  category: string;
  subcategory?: string;
  brand?: string;
  colors: string[];
  imageUrl: string | null;
  reason?: string;
};

export type SavedOutfitRecord = {
  id: string;
  source: string;
  title: string;
  vibe: string;
  occasion: string;
  formality: Exclude<AuraAgentFormality, "any">;
  itemIds: string[];
  items: SavedOutfitItem[];
  explanation: string;
  stylingTips: string[];
  missingItems: string[];
  outfitFingerprint: string;
  outfitId?: string;
  sourceQuery?: string | null;
  sourceMessageId?: string | null;
  sourceAgentRunId?: string | null;
  savedAt: number;
  active: boolean;
};

function savedOutfitsCollection(uid: string) {
  return collection(db, "users", uid, "savedOutfits");
}

function cleanText(value: unknown, fallback = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function cleanTextList(value: unknown, max = 12) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((entry) => cleanText(entry)).filter(Boolean)),
  ).slice(0, max);
}

function timestampMs(value: unknown, fallback = Date.now()) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === "function") return toMillis();
  }
  return fallback;
}

function normalizeRole(value: unknown): AuraAgentOutfitRole {
  const role = cleanText(value).toLowerCase();
  if (role === "shoes") return "footwear";
  if (
    role === "top" ||
    role === "bottom" ||
    role === "footwear" ||
    role === "outerwear" ||
    role === "accessory" ||
    role === "one_piece"
  ) {
    return role;
  }
  return "accessory";
}

function normalizeFormality(value: unknown): Exclude<AuraAgentFormality, "any"> {
  const formality = cleanText(value).toLowerCase();
  if (
    formality === "athletic" ||
    formality === "lounge" ||
    formality === "casual" ||
    formality === "smart_casual" ||
    formality === "business_casual" ||
    formality === "formal"
  ) {
    return formality;
  }
  return "smart_casual";
}

function normalizeItem(value: unknown): SavedOutfitItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const itemId = cleanText(record.itemId);
  if (!itemId) return null;
  return {
    itemId,
    role: normalizeRole(record.role),
    name: cleanText(record.name || record.title || record.category || record.role, "Closet item"),
    category: cleanText(record.category || record.role, "item"),
    ...(cleanText(record.subcategory) ? { subcategory: cleanText(record.subcategory) } : {}),
    ...(cleanText(record.brand) ? { brand: cleanText(record.brand) } : {}),
    colors: cleanTextList(record.colors, 8),
    imageUrl: cleanText(record.imageUrl) || null,
    ...(cleanText(record.reason) ? { reason: cleanText(record.reason) } : {}),
  };
}

export function normalizeSavedOutfit(id: string, data: Record<string, unknown>): SavedOutfitRecord | null {
  if (data.active === false) return null;
  const items = Array.isArray(data.items)
    ? data.items.map(normalizeItem).filter((item): item is SavedOutfitItem => Boolean(item))
    : [];
  const itemIds = cleanTextList(data.itemIds, 32);
  const mergedItemIds = Array.from(new Set([...itemIds, ...items.map((item) => item.itemId)]));
  if (!mergedItemIds.length && !items.length) return null;
  const title = cleanText(data.title, "AURA outfit");
  return {
    id,
    source: cleanText(data.source, "aura_agent"),
    title,
    vibe: cleanText(data.vibe),
    occasion: cleanText(data.occasion),
    formality: normalizeFormality(data.formality),
    itemIds: mergedItemIds,
    items,
    explanation: cleanText(data.explanation),
    stylingTips: cleanTextList(data.stylingTips, 8),
    missingItems: cleanTextList(data.missingItems, 8),
    outfitFingerprint: cleanText(data.outfitFingerprint, id),
    outfitId: cleanText(data.outfitId) || id,
    sourceQuery: cleanText(data.sourceQuery) || cleanText(data.query) || null,
    sourceMessageId: cleanText(data.sourceMessageId) || null,
    sourceAgentRunId: cleanText(data.sourceAgentRunId) || null,
    savedAt: timestampMs(data.savedAtMs ?? data.savedAt ?? data.createdAt),
    active: data.active !== false,
  };
}

export function savedOutfitToAgentOutfit(record: SavedOutfitRecord): AuraAgentOutfit {
  return {
    outfitId: record.outfitId ?? record.id,
    title: record.title,
    vibe: record.vibe,
    occasion: record.occasion,
    formality: record.formality,
    items: record.items.map((item): AuraAgentOutfitItem => ({
      itemId: item.itemId,
      role: item.role,
      reason: item.reason ?? "",
      name: item.name,
      category: item.category,
      subcategory: item.subcategory,
      brand: item.brand,
      colors: item.colors,
      imageUrl: item.imageUrl,
    })),
    explanation: record.explanation,
    stylingTips: record.stylingTips,
    missingItems: record.missingItems,
    confidence: 1,
  };
}

export function savedOutfitItemCount(record: Pick<SavedOutfitRecord, "itemIds" | "items">) {
  return Math.max(record.itemIds.length, record.items.length);
}

export function savedOutfitSubtitle(record: SavedOutfitRecord) {
  return [record.occasion, record.vibe].map((value) => cleanText(value)).filter(Boolean).join(" · ");
}

export function formatSavedOutfitDate(ms: number) {
  if (!ms) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

export function subscribeSavedOutfits(
  uid: string,
  onNext: (records: SavedOutfitRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(savedOutfitsCollection(uid), orderBy("savedAtMs", "desc"), limit(80));
  return onSnapshot(
    q,
    (snapshot) => {
      onNext(
        snapshot.docs
          .map((entry) => normalizeSavedOutfit(entry.id, entry.data()))
          .filter((entry): entry is SavedOutfitRecord => Boolean(entry)),
      );
    },
    (error) => onError?.(error),
  );
}

export async function getSavedOutfit(uid: string, id: string) {
  const snap = await getDoc(doc(savedOutfitsCollection(uid), id));
  return snap.exists() ? normalizeSavedOutfit(snap.id, snap.data()) : null;
}

export async function deleteSavedOutfit(uid: string, id: string) {
  await setDoc(
    doc(savedOutfitsCollection(uid), id),
    {
      active: false,
      deletedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
