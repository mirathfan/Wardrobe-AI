import { collection, doc, getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";

import {
  buildAuraLookSnapshot,
  buildStableAuraLookId,
  cleanAuraString,
  getAuraLookItemIds,
} from "@/src/lib/auraLookDocument";
import { logAuraLookStyleEvent } from "@/src/lib/auraMemory";
import { auth, db } from "@/src/lib/firebase";
import { auraLookToOutfitSnapshot, outfitSnapshotToPlannedOutfit } from "@/src/lib/outfitSnapshot";
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

function cleanAuraLookForFirestore(look: AuraLook): AuraLook {
  return {
    lookTitle: cleanAuraString(look.lookTitle),
    vibe: cleanAuraString(look.vibe),
    shortExplanation: cleanAuraString(look.shortExplanation),
    stylingNote: cleanAuraString(look.stylingNote),
    personalizationLabel: cleanAuraString(look.personalizationLabel),
    personalizationNote: cleanAuraString(look.personalizationNote),
    stylingIntelligence: look.stylingIntelligence ?? null,
    pieces: (look.pieces ?? []).map((piece) => ({
      role: piece.role,
      itemName: cleanAuraString(piece.itemName),
      source: piece.source,
      itemId: cleanAuraString(piece.itemId) || null,
      imageUrl: cleanAuraString(piece.imageUrl) || null,
    })),
    fromCloset: (look.fromCloset ?? []).map(cleanAuraString).filter(Boolean),
    addToComplete: (look.addToComplete ?? []).map(cleanAuraString).filter(Boolean),
    alternates: (look.alternates ?? []).map(cleanAuraString).filter(Boolean),
    actions: (look.actions ?? []).filter(Boolean),
  };
}

export function auraLookToPlannedOutfit(look: AuraLook): PlannedOutfit {
  return outfitSnapshotToPlannedOutfit(auraLookToOutfitSnapshot(look, "aura"), {
    score:
      typeof look.stylingIntelligence?.overallScore === "number"
        ? Math.round(look.stylingIntelligence.overallScore)
        : 0.86,
    reasons: [look.shortExplanation, cleanAuraString(look.stylingNote)].filter(Boolean),
    createdAt: Date.now(),
  });
}

export async function saveAuraLook(
  uid: string,
  look: AuraLook,
  options?: { id?: string; title?: string }
) {
  const ref = options?.id ? doc(savedLooksCollection(uid), options.id) : doc(savedLooksCollection(uid));
  const now = Date.now();
  const savedLook = cleanAuraLookForFirestore(look);
  const payload = {
    look: savedLook,
    title: cleanAuraString(options?.title) || cleanAuraString(savedLook.lookTitle) || "Saved look",
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (error) {
    if (__DEV__) {
      console.error("SAVE LOOK ERROR:", error);
    }
    throw error;
  }
  void logAuraLookStyleEvent(uid, "outfit_saved", savedLook, { source: "aura" });
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
    if (__DEV__) {
      console.warn("No user auth, skipping remote save");
    }
    return null;
  }
  if (authUid !== uid) {
    if (__DEV__) {
      console.warn("Auth UID mismatch, skipping remote save");
    }
    return null;
  }

  const ref = doc(savedLooksCollection(uid), id);
  const now = Date.now();
  const savedLook = cleanAuraLookForFirestore(look);
  const payload = {
    id,
    title: cleanAuraString(options?.title) || cleanAuraString(savedLook.lookTitle) || "Saved outfit",
    createdAt: now,
    updatedAt: now,
    source: options?.source ?? "aura_swipe",
    sessionId: cleanAuraString(options?.sessionId) || null,
    itemIds: getAuraLookItemIds(savedLook),
    stylingNote: cleanAuraString(savedLook.stylingNote),
    previewImageUrls: (savedLook.pieces ?? [])
      .map((piece) => cleanAuraString(piece.imageUrl))
      .filter(Boolean)
      .slice(0, 4),
    outfitSnapshot: buildAuraLookSnapshot(savedLook),
    look: savedLook,
  };
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    if (__DEV__) {
      console.error("SAVE LOOK ERROR:", e);
    }
    throw e;
  }
  void logAuraLookStyleEvent(uid, "outfit_saved", savedLook, {
    source: options?.source === "aura_swipe" ? "aura" : (options?.source ?? "aura"),
  });
  return {
    ...payload,
  } satisfies SavedAuraOutfitRecord;
}
