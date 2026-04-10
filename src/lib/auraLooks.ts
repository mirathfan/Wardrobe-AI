import { collection, doc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";

import { db } from "@/src/lib/firebase";
import type { AuraLook } from "@/src/types/aura";
import type { PlannedOutfit } from "@/src/utils/dailyOutfits";

export type SavedAuraLookRecord = {
  id: string;
  look: AuraLook;
  title: string;
  createdAt: number;
  updatedAt: number;
};

function savedLooksCollection(uid: string) {
  return collection(db, "users", uid, "savedLooks");
}

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "";
}

export function auraLookToPlannedOutfit(look: AuraLook): PlannedOutfit {
  const roleMap = look.pieces.reduce<Record<string, string>>((acc, piece) => {
    if (piece.source !== "closet" || !piece.itemId) return acc;
    if (piece.role === "outerwear") acc.outerwear = piece.itemId;
    if (piece.role === "top") acc.top = piece.itemId;
    if (piece.role === "bottom") acc.bottom = piece.itemId;
    if (piece.role === "shoes") acc.shoes = piece.itemId;
    return acc;
  }, {});

  return {
    itemsByCategory: roleMap,
    score: 0.86,
    reasons: [look.shortExplanation, cleanString(look.stylingNote)].filter(Boolean),
    createdAt: Date.now(),
  };
}

export async function saveAuraLook(
  uid: string,
  look: AuraLook,
  options?: { id?: string; title?: string }
) {
  const ref = options?.id ? doc(savedLooksCollection(uid), options.id) : doc(savedLooksCollection(uid));
  const now = Date.now();
  const payload = {
    look,
    title: cleanString(options?.title) || cleanString(look.lookTitle) || "Saved look",
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, payload, { merge: true });
  return { id: ref.id, ...payload } satisfies SavedAuraLookRecord;
}

export async function loadLatestSavedAuraLook(uid: string) {
  const snap = await getDocs(query(savedLooksCollection(uid), orderBy("updatedAt", "desc"), limit(1)));
  const docSnap = snap.docs[0];
  if (!docSnap) return null;
  const data = docSnap.data() ?? {};
  if (!data.look || typeof data.look !== "object") return null;
  return {
    id: docSnap.id,
    look: data.look as AuraLook,
    title: cleanString(data.title) || cleanString((data.look as AuraLook).lookTitle) || "Saved look",
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
  } satisfies SavedAuraLookRecord;
}
