import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function cleanStringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanString(entry))
    .filter(Boolean) as string[];
}

function cleanWardrobeMode(value: unknown) {
  const next = String(value ?? "").trim();
  if (
    next === "masculine" ||
    next === "feminine" ||
    next === "neutral" ||
    next === "mixed" ||
    next === "custom"
  ) {
    return next;
  }
  return "mixed";
}

function cleanPreferredFit(value: unknown) {
  const next = String(value ?? "").trim();
  if (
    next === "slim" ||
    next === "regular" ||
    next === "relaxed" ||
    next === "oversized"
  ) {
    return next;
  }
  return null;
}

export async function loadAuraUserProfile(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.data() ?? {};
  const profilePreferences =
    data.profilePreferences && typeof data.profilePreferences === "object"
      ? (data.profilePreferences as Record<string, unknown>)
      : {};
  return {
    name: cleanString(data.name),
    firstName: cleanString(profilePreferences.firstName),
    region: cleanString(profilePreferences.region),
    wardrobeMode: cleanWardrobeMode(profilePreferences.wardrobeMode),
    selectedCategories: cleanStringList(profilePreferences.selectedCategories),
    styleAesthetics: cleanStringList(profilePreferences.styleAesthetics),
    preferredFit: cleanPreferredFit(profilePreferences.preferredFit),
    occasionPriority: cleanStringList(profilePreferences.occasionPriority),
    accessoryPreferences: cleanStringList(profilePreferences.accessoryPreferences),
    goals: cleanStringList(profilePreferences.goals),
  };
}
