import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "./firebase";
import { Category } from "../shared/wardrobeTaxonomy";
import type { UserProfilePreferences } from "../types/UserProfilePreferences";

export const EMPTY_USER_PROFILE_PREFERENCES: UserProfilePreferences = {
  units: {
    length: "cm",
    weight: "kg",
    shoeRegion: "US",
    clothingRegion: "INTL",
  },
  body: {},
  defaultSizes: {},
  fitPreferences: {},
  stylePreferences: {},
  closetPreferences: {},
  notifications: {},
};

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

function cleanNumber(value: unknown) {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function normalizeUserProfilePreferences(value: unknown): UserProfilePreferences {
  const root = readRecord(value);
  const units = readRecord(root.units);
  const body = readRecord(root.body);
  const defaultSizes = readRecord(root.defaultSizes);
  const fitPreferences = readRecord(root.fitPreferences);
  const stylePreferences = readRecord(root.stylePreferences);
  const closetPreferences = readRecord(root.closetPreferences);
  const notifications = readRecord(root.notifications);

  return {
    units: {
      length: units.length === "in" ? "in" : "cm",
      weight: units.weight === "lb" ? "lb" : "kg",
      shoeRegion:
        units.shoeRegion === "UK" || units.shoeRegion === "EU" ? units.shoeRegion : "US",
      clothingRegion:
        units.clothingRegion === "US" ||
        units.clothingRegion === "UK" ||
        units.clothingRegion === "EU" ||
        units.clothingRegion === "INTL"
          ? units.clothingRegion
          : "INTL",
    },
    body: {
      height: cleanNumber(body.height),
      weight: cleanNumber(body.weight),
      chest: cleanNumber(body.chest),
      shoulders: cleanNumber(body.shoulders),
      neck: cleanNumber(body.neck),
      sleeve: cleanNumber(body.sleeve),
      waist: cleanNumber(body.waist),
      hips: cleanNumber(body.hips),
      inseam: cleanNumber(body.inseam),
      thigh: cleanNumber(body.thigh),
      footLength: cleanNumber(body.footLength),
    },
    defaultSizes: {
      top: cleanString(defaultSizes.top),
      outerwear: cleanString(defaultSizes.outerwear),
      hoodie: cleanString(defaultSizes.hoodie),
      formalShirt: cleanString(defaultSizes.formalShirt),
      bottomWaist: cleanString(defaultSizes.bottomWaist),
      bottomLength: cleanString(defaultSizes.bottomLength),
      jeans: cleanString(defaultSizes.jeans),
      shoes: cleanString(defaultSizes.shoes),
    },
    fitPreferences: {
      tops:
        fitPreferences.tops === "slim" ||
        fitPreferences.tops === "regular" ||
        fitPreferences.tops === "relaxed" ||
        fitPreferences.tops === "oversized"
          ? fitPreferences.tops
          : null,
      outerwear:
        fitPreferences.outerwear === "slim" ||
        fitPreferences.outerwear === "regular" ||
        fitPreferences.outerwear === "roomy"
          ? fitPreferences.outerwear
          : null,
      bottomsRise:
        fitPreferences.bottomsRise === "low" ||
        fitPreferences.bottomsRise === "mid" ||
        fitPreferences.bottomsRise === "high"
          ? fitPreferences.bottomsRise
          : null,
      bottomsLeg:
        fitPreferences.bottomsLeg === "skinny" ||
        fitPreferences.bottomsLeg === "slim" ||
        fitPreferences.bottomsLeg === "straight" ||
        fitPreferences.bottomsLeg === "tapered" ||
        fitPreferences.bottomsLeg === "wide"
          ? fitPreferences.bottomsLeg
          : null,
      shoes:
        fitPreferences.shoes === "true_to_size" ||
        fitPreferences.shoes === "half_up" ||
        fitPreferences.shoes === "half_down"
          ? fitPreferences.shoes
          : null,
    },
    stylePreferences: {
      preferredStyles: cleanStringList(stylePreferences.preferredStyles),
      favoriteColors: cleanStringList(stylePreferences.favoriteColors),
      avoidedColors: cleanStringList(stylePreferences.avoidedColors),
      preferredBrands: cleanStringList(stylePreferences.preferredBrands),
    },
    closetPreferences: {
      prioritizeUnderused:
        typeof closetPreferences.prioritizeUnderused === "boolean"
          ? closetPreferences.prioritizeUnderused
          : false,
      hideLaundryByDefault:
        typeof closetPreferences.hideLaundryByDefault === "boolean"
          ? closetPreferences.hideLaundryByDefault
          : false,
      defaultSort: cleanString(closetPreferences.defaultSort),
    },
    notifications: {
      laundryReminders:
        typeof notifications.laundryReminders === "boolean"
          ? notifications.laundryReminders
          : false,
      outfitReminders:
        typeof notifications.outfitReminders === "boolean"
          ? notifications.outfitReminders
          : false,
      underusedItemNudges:
        typeof notifications.underusedItemNudges === "boolean"
          ? notifications.underusedItemNudges
          : false,
    },
  };
}

export async function loadUserProfilePreferences(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return EMPTY_USER_PROFILE_PREFERENCES;
  return normalizeUserProfilePreferences(snap.data()?.profilePreferences);
}

export async function saveUserProfilePreferences(
  uid: string,
  profilePreferences: UserProfilePreferences,
) {
  const normalized = normalizeUserProfilePreferences(profilePreferences);
  await setDoc(
    doc(db, "users", uid),
    {
      profilePreferences: normalized,
      profileUpdatedAt: Date.now(),
    },
    { merge: true },
  );
}

export function getDefaultSizeForSelection(
  profile: UserProfilePreferences | null,
  category: Category | null,
  subCategory: string | null | undefined,
) {
  if (!profile || !category) return "";
  const sub = String(subCategory ?? "").trim().toLowerCase();
  const defaults = profile.defaultSizes;
  if (category === Category.OUTERWEAR) return defaults.outerwear ?? "";
  if (category === Category.FOOTWEAR) return defaults.shoes ?? "";
  if (category === Category.BOTTOM) {
    if (sub === "jeans" && defaults.jeans) return defaults.jeans;
    const parts = [defaults.bottomWaist, defaults.bottomLength].filter(Boolean);
    return parts.join(" / ");
  }
  if (category === Category.TOP) {
    if (sub === "hoodie" || sub === "sweatshirt") return defaults.hoodie ?? defaults.top ?? "";
    if (sub === "shirt" || sub === "polo") return defaults.formalShirt ?? defaults.top ?? "";
    return defaults.top ?? "";
  }
  return "";
}
