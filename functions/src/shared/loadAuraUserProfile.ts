import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function loadAuraUserProfile(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.data() ?? {};
  return {
    name: cleanString(data.name),
  };
}
