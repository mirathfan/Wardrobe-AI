import { collection, doc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";

import {
  buildAuraLookSnapshot,
  buildStableAuraLookId,
  cleanAuraString,
  getAuraLookItemIds,
} from "@/src/lib/auraLookDocument";
import { logAuraLookStyleEvent } from "@/src/lib/auraMemory";
import { auth, db } from "@/src/lib/firebase";
import type { AuraLook } from "@/src/types/aura";
import type { PlannedOutfit } from "@/src/utils/dailyOutfits";

export type SavedAuraLookRecord = {
  id: string;
  look: AuraLook;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type SavedAuraOutfitRecord = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  source: "aura_swipe" | "aura";
  sessionId: string | null;
  itemIds: string[];
  stylingNote: string;
  previewImageUrls: string[];
  outfitSnapshot: ReturnType<typeof buildAuraLookSnapshot>;
};

function savedLooksCollection(uid: string) {
  return collection(db, "users", uid, "savedLooks");
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
    reasons: [look.shortExplanation, cleanAuraString(look.stylingNote)].filter(Boolean),
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
    title: cleanAuraString(options?.title) || cleanAuraString(look.lookTitle) || "Saved look",
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, payload, { merge: true });
  void logAuraLookStyleEvent(uid, "outfit_saved", look, { source: "aura" });
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
    title: cleanAuraString(data.title) || cleanAuraString((data.look as AuraLook).lookTitle) || "Saved look",
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
  } satisfies SavedAuraLookRecord;
}

export async function saveAuraFavoriteOutfit(
  uid: string,
  look: AuraLook,
  options?: {
    source?: "aura_swipe" | "aura";
    sessionId?: string | null;
    title?: string | null;
  },
) {
  const id = buildStableAuraLookId("saved", look);
  const authUid = auth.currentUser?.uid ?? null;
  if (!authUid) {
    console.warn("No user auth, skipping remote save");
    return null;
  }
  if (authUid !== uid) {
    console.warn("Auth UID mismatch, skipping remote save", { authUid, uid });
    return null;
  }

  const ref = doc(savedLooksCollection(uid), id);
  const now = Date.now();
  const payload = {
    id,
    title: cleanAuraString(options?.title) || cleanAuraString(look.lookTitle) || "Saved outfit",
    createdAt: now,
    updatedAt: now,
    source: options?.source ?? "aura_swipe",
    sessionId: cleanAuraString(options?.sessionId) || null,
    itemIds: getAuraLookItemIds(look),
    stylingNote: cleanAuraString(look.stylingNote),
    previewImageUrls: (look.pieces ?? [])
      .map((piece) => cleanAuraString(piece.imageUrl))
      .filter(Boolean)
      .slice(0, 4),
    outfitSnapshot: buildAuraLookSnapshot(look),
    look,
  };
  console.log("Saving look for uid:", uid, "look:", id, "path:", `users/${uid}/savedLooks/${id}`);
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.error("SAVE LOOK ERROR:", e);
    throw e;
  }
  void logAuraLookStyleEvent(uid, "outfit_saved", look, {
    source: options?.source === "aura_swipe" ? "aura" : (options?.source ?? "aura"),
  });
  return {
    ...payload,
  } satisfies SavedAuraOutfitRecord;
}
