import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { Alert } from "react-native";

import {
  buildStableAuraLookId,
  cleanAuraString,
  type AuraLookSnapshot,
} from "@/src/lib/auraLookDocument";
import { saveAuraFavoriteOutfit } from "@/src/lib/auraLooks";
import { saveAuraOutfitFeedback, type OutfitFeedbackType } from "@/src/lib/auraOutfitFeedback";
import { db } from "@/src/lib/firebase";
import { getFriendlyErrorMessage } from "@/src/lib/errors";
import type { AuraLook } from "@/src/types/aura";

export type ProfileLookKind = "liked" | "disliked" | "favourite";

export type ProfileLookRecord = {
  id: string;
  collection: "savedLooks" | "savedOutfits" | "outfitFeedback";
  kind: ProfileLookKind;
  look: AuraLook;
  title: string;
  createdAt: number;
  updatedAt: number;
  itemIds: string[];
  isFavourite?: boolean;
};
export type ProfileLooksPageInfo = {
  lastDoc?: DocumentSnapshot;
  hasMore: boolean;
};

const PROFILE_FEEDBACK_PAGE_SIZE = 20;

function userCollection(uid: string, collectionName: ProfileLookRecord["collection"]) {
  return collection(db, "users", uid, collectionName);
}

function alertProfileLookError(error: unknown) {
  if (__DEV__) console.log("[callable error]", error);
  Alert.alert("Hold on", getFriendlyErrorMessage(error));
}

function normalizeTimestamp(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return Date.now();
}

function snapshotToLook(snapshot: AuraLookSnapshot): AuraLook {
  return {
    lookTitle: cleanAuraString(snapshot.lookTitle) || "AURA look",
    vibe: cleanAuraString(snapshot.vibe),
    shortExplanation: cleanAuraString(snapshot.shortExplanation),
    stylingNote: cleanAuraString(snapshot.stylingNote),
    personalizationLabel: cleanAuraString(snapshot.personalizationLabel),
    personalizationNote: cleanAuraString(snapshot.personalizationNote),
    pieces: (snapshot.pieces ?? []).map((piece) => ({
      role: piece.role,
      itemName: cleanAuraString(piece.itemName),
      source: piece.source === "suggested" ? "suggested" : "closet",
      itemId: cleanAuraString(piece.itemId) || null,
      imageUrl: cleanAuraString(piece.imageUrl) || null,
    })),
    fromCloset: (snapshot.fromCloset ?? []).map(cleanAuraString).filter(Boolean),
    addToComplete: (snapshot.addToComplete ?? []).map(cleanAuraString).filter(Boolean),
    alternates: (snapshot.alternates ?? []).map(cleanAuraString).filter(Boolean),
    actions: ["saveLook", "planForToday", "likeLook", "notMyVibe"],
  };
}

function getLookFromData(data: Record<string, unknown>): AuraLook | null {
  const directLook = data.look;
  if (directLook && typeof directLook === "object" && Array.isArray((directLook as AuraLook).pieces)) {
    const look = directLook as AuraLook;
    return {
      ...look,
      actions: Array.isArray(look.actions) && look.actions.length ? look.actions : ["saveLook", "planForToday"],
    };
  }
  const snapshot = data.outfitSnapshot;
  if (snapshot && typeof snapshot === "object" && Array.isArray((snapshot as AuraLookSnapshot).pieces)) {
    return snapshotToLook(snapshot as AuraLookSnapshot);
  }
  return null;
}

function normalizeItemIds(data: Record<string, unknown>, look: AuraLook) {
  if (Array.isArray(data.itemIds)) {
    return data.itemIds.map(cleanAuraString).filter(Boolean);
  }
  return Array.from(
    new Set((look.pieces ?? []).map((piece) => cleanAuraString(piece.itemId)).filter(Boolean)),
  );
}

function toProfileLook(
  id: string,
  collectionName: ProfileLookRecord["collection"],
  kind: ProfileLookKind,
  data: Record<string, unknown>,
): ProfileLookRecord | null {
  const look = getLookFromData(data);
  if (!look) return null;
  const title = cleanAuraString(data.title) || cleanAuraString(look.lookTitle) || "AURA look";
  return {
    id,
    collection: collectionName,
    kind,
    look,
    title,
    createdAt: normalizeTimestamp(data.createdAt),
    updatedAt: normalizeTimestamp(data.updatedAt),
    itemIds: normalizeItemIds(data, look),
  };
}

function mergeByStableLookId(records: ProfileLookRecord[]) {
  const merged = new Map<string, ProfileLookRecord>();
  records.forEach((record) => {
    const key = buildStableAuraLookId("look", record.look);
    const current = merged.get(key);
    if (!current || record.createdAt > current.createdAt) {
      merged.set(key, record);
    }
  });
  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function subscribeProfileFeedbackLooks(
  uid: string,
  feedbackType: Extract<OutfitFeedbackType, "outfit_liked" | "outfit_disliked">,
  onNext: (records: ProfileLookRecord[], pageInfo: ProfileLooksPageInfo) => void,
  onError: (error: Error) => void,
  startAfterDoc?: DocumentSnapshot,
): Unsubscribe {
  const kind: ProfileLookKind = feedbackType === "outfit_liked" ? "liked" : "disliked";
  const q = query(
    userCollection(uid, "outfitFeedback"),
    orderBy("createdAt", "desc"),
    ...(startAfterDoc ? [startAfter(startAfterDoc)] : []),
    limit(PROFILE_FEEDBACK_PAGE_SIZE),
  );
  return onSnapshot(
    q,
    (snap) => {
      onNext(
        snap.docs
          .filter((entry) => entry.data().feedbackType === feedbackType)
          .map((entry) => toProfileLook(entry.id, "outfitFeedback", kind, entry.data() as Record<string, unknown>))
          .filter((entry): entry is ProfileLookRecord => Boolean(entry)),
        {
          lastDoc: snap.docs[snap.docs.length - 1],
          hasMore: snap.docs.length === PROFILE_FEEDBACK_PAGE_SIZE,
        },
      );
    },
    onError,
  );
}

export function subscribeFavouriteLooks(
  uid: string,
  onNext: (records: ProfileLookRecord[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const handleSnap = (
    collectionName: "savedLooks" | "savedOutfits",
    setter: (records: ProfileLookRecord[]) => void,
  ) =>
    onSnapshot(
      query(userCollection(uid, collectionName), orderBy("createdAt", "desc"), limit(50)),
      (snap) => {
        setter(
          snap.docs
            .map((entry) => toProfileLook(entry.id, collectionName, "favourite", entry.data() as Record<string, unknown>))
            .filter((entry): entry is ProfileLookRecord => Boolean(entry)),
        );
      },
      onError,
    );

  let savedLooks: ProfileLookRecord[] = [];
  let savedOutfits: ProfileLookRecord[] = [];
  const emit = () => onNext(mergeByStableLookId([...savedLooks, ...savedOutfits]));

  const unsubSavedLooks = handleSnap("savedLooks", (records) => {
    savedLooks = records;
    emit();
  });
  const unsubSavedOutfits = handleSnap("savedOutfits", (records) => {
    savedOutfits = records;
    emit();
  });

  return () => {
    unsubSavedLooks();
    unsubSavedOutfits();
  };
}

export async function removeProfileLook(uid: string, record: ProfileLookRecord) {
  try {
    await deleteDoc(doc(db, "users", uid, record.collection, record.id));
  } catch (error) {
    alertProfileLookError(error);
    throw error;
  }
}

export async function removeProfileLooks(uid: string, records: ProfileLookRecord[]) {
  await Promise.all(records.map((record) => removeProfileLook(uid, record)));
}

export async function favouriteProfileLooks(uid: string, records: ProfileLookRecord[]) {
  try {
    await Promise.all(
      records.map((record) =>
        saveAuraFavoriteOutfit(uid, record.look, {
          source: record.collection === "outfitFeedback" ? "aura" : "aura_swipe",
          title: record.title,
        }),
      ),
    );
  } catch (error) {
    alertProfileLookError(error);
    throw error;
  }
}

export async function dislikeProfileLooks(uid: string, records: ProfileLookRecord[]) {
  try {
    await Promise.all(
      records.map((record) =>
        saveAuraOutfitFeedback(uid, {
          feedbackType: "outfit_disliked",
          look: record.look,
          source: record.collection === "outfitFeedback" ? "aura" : "aura_swipe",
        }),
      ),
    );
  } catch (error) {
    alertProfileLookError(error);
    throw error;
  }
}

export async function likeProfileLooks(uid: string, records: ProfileLookRecord[]) {
  try {
    await Promise.all(
      records.map((record) =>
        saveAuraOutfitFeedback(uid, {
          feedbackType: "outfit_liked",
          look: record.look,
          source: record.collection === "outfitFeedback" ? "aura" : "aura_swipe",
        }),
      ),
    );
  } catch (error) {
    alertProfileLookError(error);
    throw error;
  }
}

export async function markFeedbackLookLiked(uid: string, record: ProfileLookRecord) {
  try {
    await setDoc(
      doc(db, "users", uid, "outfitFeedback", record.id),
      {
        feedbackType: "outfit_liked",
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  } catch (error) {
    alertProfileLookError(error);
    throw error;
  }
}
