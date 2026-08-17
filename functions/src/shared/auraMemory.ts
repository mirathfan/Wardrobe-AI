import {Firestore} from "firebase-admin/firestore";

import {
  LEARNED_STYLE_MEMORY_DOC_ID,
  SESSION_CONTEXT_DOC_ID,
  STYLE_PROFILE_DOC_ID,
  buildCompactAuraMemoryContext,
  buildStyleProfileFromLegacyPreferences,
  emptyLearnedStyleMemory,
  normalizeAuraSessionContext,
  normalizeLearnedStyleMemory,
  normalizeStyleProfile,
  type AuraSessionContext,
  type CompactAuraMemoryContext,
  type LearnedStyleMemory,
  type StyleProfile,
} from "../../../shared/auraMemory";

function userDocRef(db: Firestore, uid: string) {
  return db.collection("users").doc(uid);
}

function profileDocRef(db: Firestore, uid: string, docId: string) {
  return userDocRef(db, uid).collection("profile").doc(docId);
}

function sessionContextDocRef(db: Firestore, uid: string, chatId: string) {
  return userDocRef(db, uid).collection("aiChats").doc(chatId)
    .collection("sessionContext").doc(SESSION_CONTEXT_DOC_ID);
}

export async function loadAuraStyleProfile(
  db: Firestore,
  uid: string
): Promise<StyleProfile | null> {
  const [styleSnap, userSnap] = await Promise.all([
    profileDocRef(db, uid, STYLE_PROFILE_DOC_ID).get(),
    userDocRef(db, uid).get(),
  ]);

  if (styleSnap.exists) {
    return normalizeStyleProfile(styleSnap.data());
  }

  const userData = userSnap.data() ?? {};
  const legacy = userData.profilePreferences ?? {};
  const profile = buildStyleProfileFromLegacyPreferences(legacy);
  return profile;
}

export async function loadLearnedAuraStyleMemory(
  db: Firestore,
  uid: string
): Promise<LearnedStyleMemory | null> {
  const snap = await profileDocRef(db, uid, LEARNED_STYLE_MEMORY_DOC_ID).get();
  return snap.exists ? normalizeLearnedStyleMemory(snap.data()) : emptyLearnedStyleMemory();
}

export async function loadAuraSessionContext(
  db: Firestore,
  uid: string,
  chatId?: string | null
): Promise<AuraSessionContext | null> {
  if (!chatId) return null;
  const snap = await sessionContextDocRef(db, uid, chatId).get();
  if (!snap.exists) return null;
  const session = normalizeAuraSessionContext(snap.data());
  if (!session) return null;
  if (session.expiresAt && session.expiresAt <= Date.now()) return null;
  return session;
}

export async function loadCompactAuraMemoryContext(
  db: Firestore,
  uid: string,
  chatId?: string | null
): Promise<CompactAuraMemoryContext> {
  const [explicitProfile, learnedProfile, session] = await Promise.all([
    loadAuraStyleProfile(db, uid),
    loadLearnedAuraStyleMemory(db, uid),
    loadAuraSessionContext(db, uid, chatId),
  ]);

  return buildCompactAuraMemoryContext({
    explicitProfile,
    learnedProfile,
    session,
  });
}
