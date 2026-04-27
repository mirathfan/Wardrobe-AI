import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";

import { auth, db } from "@/src/lib/firebase";
import {
  type AuraLookSnapshot,
  buildAuraLookSnapshot,
  buildStableAuraLookId,
  cleanAuraString,
  getAuraLookItemIds,
  hashAuraText,
} from "@/src/lib/auraLookDocument";
import type { AuraLook, AuraLookOptionMeta } from "@/src/types/aura";

export type OutfitFeedbackType =
  | "outfit_liked"
  | "outfit_disliked"
  | "outfit_favorited"
  | "outfit_skipped";

export type OutfitFeedbackSnapshot = AuraLookSnapshot;

export type OutfitFeedbackRecord = {
  id: string;
  feedbackType: OutfitFeedbackType;
  createdAt: number;
  updatedAt: number;
  source: "aura" | "aura_swipe";
  sessionId: string | null;
  chatId: string | null;
  messageId: string | null;
  optionIndex: number | null;
  optionLabel: string;
  optionId: string;
  batchPosition: number | null;
  directionLabel: string | null;
  itemIds: string[];
  title: string;
  stylingNote: string;
  personalizationLabel: string;
  personalizationNote: string;
  outfitSnapshot: OutfitFeedbackSnapshot;
};

function outfitFeedbackCollection(uid: string) {
  return collection(db, "users", uid, "outfitFeedback");
}

function buildFeedbackId(input: {
  chatId?: string | null;
  messageId?: string | null;
  optionIndex?: number | null;
  optionLabel?: string | null;
  sessionId?: string | null;
  batchPosition?: number | null;
  feedbackType: OutfitFeedbackType;
  look: AuraLook;
}) {
  const raw = [
    input.feedbackType,
    cleanAuraString(input.sessionId) || "no-session",
    cleanAuraString(input.chatId) || "no-chat",
    cleanAuraString(input.messageId) || "no-message",
    typeof input.optionIndex === "number" ? String(input.optionIndex) : "no-option",
    typeof input.batchPosition === "number" ? String(input.batchPosition) : "no-position",
    cleanAuraString(input.optionLabel).toLowerCase() || "no-label",
    buildStableAuraLookId("feedback", input.look),
  ].join("|");
  return `aura_${hashAuraText(raw)}`;
}

function toRecord(
  id: string,
  data: Record<string, unknown>,
): OutfitFeedbackRecord | null {
  const snapshot = data.outfitSnapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  const outfitSnapshot = snapshot as OutfitFeedbackSnapshot;
  const feedbackType =
    data.feedbackType === "outfit_disliked" || data.feedbackType === "disliked"
      ? "outfit_disliked"
      : data.feedbackType === "outfit_liked" || data.feedbackType === "liked"
        ? "outfit_liked"
        : data.feedbackType === "outfit_favorited"
          ? "outfit_favorited"
          : data.feedbackType === "outfit_skipped"
            ? "outfit_skipped"
            : null;
  if (!feedbackType) return null;
  return {
    id,
    feedbackType,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
    source: data.source === "aura_swipe" ? "aura_swipe" : "aura",
    sessionId: cleanAuraString(data.sessionId) || null,
    chatId: cleanAuraString(data.chatId) || null,
    messageId: cleanAuraString(data.messageId) || null,
    optionIndex: typeof data.optionIndex === "number" ? data.optionIndex : null,
    optionLabel: cleanAuraString(data.optionLabel),
    optionId: cleanAuraString(data.optionId),
    batchPosition: typeof data.batchPosition === "number" ? data.batchPosition : null,
    directionLabel: cleanAuraString(data.directionLabel) || null,
    itemIds: Array.isArray(data.itemIds) ? data.itemIds.map((entry) => cleanAuraString(entry)).filter(Boolean) : [],
    title: cleanAuraString(data.title),
    stylingNote: cleanAuraString(data.stylingNote),
    personalizationLabel: cleanAuraString(data.personalizationLabel),
    personalizationNote: cleanAuraString(data.personalizationNote),
    outfitSnapshot,
  };
}

export async function saveAuraOutfitFeedback(
  uid: string,
  input: {
    feedbackType: OutfitFeedbackType;
    look: AuraLook;
    chatId?: string | null;
    messageId?: string | null;
    option?: AuraLookOptionMeta | null;
    source?: "aura" | "aura_swipe";
    sessionId?: string | null;
    batchPosition?: number | null;
    directionLabel?: string | null;
  },
) {
  const authUid = auth.currentUser?.uid ?? null;
  if (!authUid) {
    console.warn("No user auth, skipping remote save");
    return null;
  }
  if (authUid !== uid) {
    console.warn("Auth UID mismatch, skipping remote save", { authUid, uid });
    return null;
  }

  const optionIndex = typeof input.option?.optionIndex === "number" ? input.option.optionIndex : null;
  const optionLabel = cleanAuraString(input.option?.optionLabel);
  const optionId =
    cleanAuraString(input.option?.optionId) ||
    (typeof optionIndex === "number" ? `option-${optionIndex + 1}` : "default");
  const id = buildFeedbackId({
    feedbackType: input.feedbackType,
    sessionId: input.sessionId,
    chatId: input.chatId,
    messageId: input.messageId,
    optionIndex,
    batchPosition: input.batchPosition,
    optionLabel,
    look: input.look,
  });
  const ref = doc(outfitFeedbackCollection(uid), id);
  const existing = await getDoc(ref);
  const now = Date.now();
  const snapshot = buildAuraLookSnapshot(input.look);
  const createdAt =
    existing.exists() && typeof existing.data()?.createdAt === "number"
      ? (existing.data()?.createdAt as number)
      : now;
  const payload = {
    feedbackType: input.feedbackType,
    createdAt,
    updatedAt: now,
    source: input.source ?? "aura",
    sessionId: cleanAuraString(input.sessionId) || null,
    chatId: cleanAuraString(input.chatId) || null,
    messageId: cleanAuraString(input.messageId) || null,
    optionIndex,
    optionLabel,
    optionId,
    batchPosition: typeof input.batchPosition === "number" ? input.batchPosition : null,
    directionLabel: cleanAuraString(input.directionLabel) || null,
    itemIds: getAuraLookItemIds(input.look),
    title: cleanAuraString(input.look.lookTitle) || "AURA look",
    stylingNote: cleanAuraString(input.look.stylingNote),
    personalizationLabel: cleanAuraString(input.look.personalizationLabel),
    personalizationNote: cleanAuraString(input.look.personalizationNote),
    outfitSnapshot: snapshot,
  };
  console.log("Saving outfit feedback for uid:", uid, "feedback:", id, "path:", `users/${uid}/outfitFeedback/${id}`);
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.error("SAVE LOOK ERROR:", e);
    throw e;
  }
  return {
    id,
    ...payload,
  } satisfies OutfitFeedbackRecord;
}

export async function loadRecentOutfitFeedback(
  uid: string,
  options?: {
    feedbackType?: OutfitFeedbackType;
    max?: number;
  },
) {
  const max = Math.max(1, Math.min(options?.max ?? 12, 50));
  const snap = await getDocs(
    query(outfitFeedbackCollection(uid), orderBy("updatedAt", "desc"), limit(options?.feedbackType ? max * 3 : max)),
  );
  const records = snap.docs
    .map((entry) => toRecord(entry.id, entry.data() as Record<string, unknown>))
    .filter((entry): entry is OutfitFeedbackRecord => !!entry);
  const filtered = options?.feedbackType
    ? records.filter((entry) => entry.feedbackType === options.feedbackType)
    : records;
  return filtered.slice(0, max);
}
