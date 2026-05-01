import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "./firebase";
import { getCachedProfilePreferences, setCachedProfilePreferences } from "./localCache";
import { Category } from "../shared/wardrobeTaxonomy";
import type { UserProfilePreferences } from "../types/UserProfilePreferences";

export type UserAccountProfile = {
  name: string | null;
  photoURL?: string | null;
};

export const EMPTY_USER_PROFILE_PREFERENCES: UserProfilePreferences = {
  onboardingCompleted: false,
  firstName: null,
  region: null,
  unitsPreference: "metric",
  wardrobeMode: "mixed",
  selectedCategories: [],
  styleAesthetics: [],
  preferredFit: null,
  favoriteColors: [],
  avoidedColors: [],
  accessoryPreferences: [],
  occasionPriority: [],
  goals: [],
  height: {
    value: null,
    unit: "cm",
  },
  weight: {
    value: null,
    unit: "kg",
  },
  createdAt: null,
  updatedAt: null,
  units: {
    length: "cm",
    weight: "kg",
    shoeRegion: "US",
    clothingRegion: "INTL",
  },
  body: {},
  defaultSizes: {},
  advancedFit: {},
  fitPreferences: {},
  stylePreferences: {},
  closetPreferences: {},
  notifications: {},
};

export const EMPTY_USER_ACCOUNT_PROFILE: UserAccountProfile = {
  name: null,
  photoURL: null,
};

function isOfflineFirestoreError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as any).code) : "";
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as any).message)
      : String(error ?? "");
  return code === "unavailable" || /client is offline/i.test(message);
}

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
  const height = readRecord(root.height);
  const weight = readRecord(root.weight);
  const defaultSizes = readRecord(root.defaultSizes);
  const advancedFit = readRecord(root.advancedFit);
  const fitPreferences = readRecord(root.fitPreferences);
  const stylePreferences = readRecord(root.stylePreferences);
  const closetPreferences = readRecord(root.closetPreferences);
  const notifications = readRecord(root.notifications);

  return {
    onboardingCompleted: typeof root.onboardingCompleted === "boolean" ? root.onboardingCompleted : false,
    firstName: cleanString(root.firstName),
    region: cleanString(root.region),
    unitsPreference:
      root.unitsPreference === "imperial" || root.unitsPreference === "metric"
        ? root.unitsPreference
        : units.length === "in" || units.weight === "lb"
          ? "imperial"
          : "metric",
    wardrobeMode:
      root.wardrobeMode === "masculine" ||
      root.wardrobeMode === "feminine" ||
      root.wardrobeMode === "neutral" ||
      root.wardrobeMode === "mixed" ||
      root.wardrobeMode === "custom"
        ? root.wardrobeMode
        : "mixed",
    selectedCategories: cleanStringList(root.selectedCategories),
    styleAesthetics: cleanStringList(root.styleAesthetics),
    preferredFit:
      root.preferredFit === "slim" ||
      root.preferredFit === "regular" ||
      root.preferredFit === "relaxed" ||
      root.preferredFit === "oversized"
        ? root.preferredFit
        : null,
    favoriteColors: cleanStringList(root.favoriteColors),
    avoidedColors: cleanStringList(root.avoidedColors),
    accessoryPreferences: cleanStringList(root.accessoryPreferences),
    occasionPriority: cleanStringList(root.occasionPriority),
    goals: cleanStringList(root.goals),
    height: {
      value: cleanNumber(height.value ?? body.height),
      unit: height.unit === "ft_in" ? "ft_in" : "cm",
    },
    weight: {
      value: cleanNumber(weight.value ?? body.weight),
      unit: weight.unit === "lb" ? "lb" : "kg",
    },
    createdAt: cleanNumber(root.createdAt),
    updatedAt: cleanNumber(root.updatedAt),
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
      tops: cleanString(defaultSizes.tops ?? defaultSizes.top),
      top: cleanString(defaultSizes.top),
      outerwear: cleanString(defaultSizes.outerwear),
      hoodie: cleanString(defaultSizes.hoodie),
      formalShirt: cleanString(defaultSizes.formalShirt),
      bottoms: cleanString(defaultSizes.bottoms ?? defaultSizes.bottomWaist),
      bottomWaist: cleanString(defaultSizes.bottomWaist),
      bottomsWaist: cleanString(defaultSizes.bottomsWaist ?? defaultSizes.bottomWaist),
      bottomsLength: cleanString(defaultSizes.bottomsLength ?? defaultSizes.bottomLength),
      bottomLength: cleanString(defaultSizes.bottomLength),
      jeans: cleanString(defaultSizes.jeans),
      dresses: cleanString(defaultSizes.dresses),
      skirts: cleanString(defaultSizes.skirts),
      shoes: cleanString(defaultSizes.shoes),
    },
    advancedFit: {
      bust: cleanString(advancedFit.bust ?? body.chest),
      waistMeasurement: cleanString(advancedFit.waistMeasurement ?? body.waist),
      hips: cleanString(advancedFit.hips ?? body.hips),
      inseam: cleanString(advancedFit.inseam ?? body.inseam),
      shoulderWidth: cleanString(advancedFit.shoulderWidth ?? body.shoulders),
      sleeveLength: cleanString(advancedFit.sleeveLength ?? body.sleeve),
      braSize: cleanString(advancedFit.braSize),
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
      preferredStyles: cleanStringList(stylePreferences.preferredStyles ?? root.styleAesthetics),
      favoriteColors: cleanStringList(stylePreferences.favoriteColors ?? root.favoriteColors),
      avoidedColors: cleanStringList(stylePreferences.avoidedColors ?? root.avoidedColors),
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
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const profile = snap.exists()
      ? normalizeUserProfilePreferences(snap.data()?.profilePreferences)
      : EMPTY_USER_PROFILE_PREFERENCES;
    void setCachedProfilePreferences(uid, profile);
    return profile;
  } catch (error) {
    if (isOfflineFirestoreError(error)) {
      const cached = await getCachedProfilePreferences(uid).catch(() => null);
      if (cached?.data) return cached.data;
    }
    throw error;
  }
}

export function normalizeUserAccountProfile(value: unknown): UserAccountProfile {
  const root = readRecord(value);
  return {
    name: cleanString(root.name),
    photoURL: cleanString(root.photoURL),
  };
}

export async function loadUserAccountProfile(uid: string) {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return EMPTY_USER_ACCOUNT_PROFILE;
    return normalizeUserAccountProfile(snap.data());
  } catch (error) {
    if (isOfflineFirestoreError(error)) return EMPTY_USER_ACCOUNT_PROFILE;
    throw error;
  }
}

export async function saveUserAccountProfile(uid: string, accountProfile: UserAccountProfile) {
  const normalized = normalizeUserAccountProfile(accountProfile);
  await setDoc(
    doc(db, "users", uid),
    {
      ...normalized,
      profileUpdatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function saveUserProfilePreferences(
  uid: string,
  profilePreferences: UserProfilePreferences,
) {
  const normalized = normalizeUserProfilePreferences(profilePreferences);
  const timestamp = Date.now();
  await setDoc(
    doc(db, "users", uid),
    {
      profilePreferences: {
        ...normalized,
        createdAt: normalized.createdAt ?? timestamp,
        updatedAt: timestamp,
        height: normalized.height,
        weight: normalized.weight,
        stylePreferences: {
          ...normalized.stylePreferences,
          preferredStyles: normalized.styleAesthetics,
          favoriteColors: normalized.favoriteColors,
          avoidedColors: normalized.avoidedColors,
        },
        fitPreferences: {
          ...normalized.fitPreferences,
          tops: normalized.preferredFit ?? normalized.fitPreferences.tops ?? null,
        },
        defaultSizes: {
          ...normalized.defaultSizes,
          top: normalized.defaultSizes.top ?? normalized.defaultSizes.tops ?? null,
          tops: normalized.defaultSizes.tops ?? normalized.defaultSizes.top ?? null,
          bottomWaist:
            normalized.defaultSizes.bottomWaist ?? normalized.defaultSizes.bottoms ?? null,
          bottomsWaist:
            normalized.defaultSizes.bottomsWaist ??
            normalized.defaultSizes.bottomWaist ??
            normalized.defaultSizes.bottoms ??
            null,
          bottoms:
            normalized.defaultSizes.bottoms ?? normalized.defaultSizes.bottomWaist ?? null,
          bottomLength:
            normalized.defaultSizes.bottomLength ?? normalized.defaultSizes.bottomsLength ?? null,
          bottomsLength:
            normalized.defaultSizes.bottomsLength ?? normalized.defaultSizes.bottomLength ?? null,
          dresses: normalized.defaultSizes.dresses ?? null,
          skirts: normalized.defaultSizes.skirts ?? null,
        },
        advancedFit: {
          ...normalized.advancedFit,
          bust: normalized.advancedFit.bust ?? null,
          waistMeasurement: normalized.advancedFit.waistMeasurement ?? null,
          hips: normalized.advancedFit.hips ?? null,
          inseam: normalized.advancedFit.inseam ?? null,
          shoulderWidth: normalized.advancedFit.shoulderWidth ?? null,
          sleeveLength: normalized.advancedFit.sleeveLength ?? null,
          braSize: normalized.advancedFit.braSize ?? null,
        },
        body: {
          ...normalized.body,
          height: normalized.height.value ?? normalized.body.height ?? null,
          weight: normalized.weight.value ?? normalized.body.weight ?? null,
          chest: normalized.advancedFit.bust ?? normalized.body.chest ?? null,
          waist:
            normalized.advancedFit.waistMeasurement ?? normalized.body.waist ?? null,
          hips: normalized.advancedFit.hips ?? normalized.body.hips ?? null,
          inseam: normalized.advancedFit.inseam ?? normalized.body.inseam ?? null,
          shoulders:
            normalized.advancedFit.shoulderWidth ?? normalized.body.shoulders ?? null,
          sleeve:
            normalized.advancedFit.sleeveLength ?? normalized.body.sleeve ?? null,
        },
      },
      profileUpdatedAt: Date.now(),
    },
    { merge: true },
  );
  void setCachedProfilePreferences(uid, {
    ...normalized,
    createdAt: normalized.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
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
  if (category === Category.ONE_PIECE) {
    if (sub === "dress" && defaults.dresses) return defaults.dresses;
    return defaults.dresses ?? defaults.tops ?? defaults.top ?? "";
  }
  if (category === Category.BOTTOM) {
    if (sub === "jeans" && defaults.jeans) return defaults.jeans;
    if (sub === "skirt" && defaults.skirts) return defaults.skirts;
    const parts = [
      defaults.bottoms ?? defaults.bottomsWaist ?? defaults.bottomWaist,
      defaults.bottomsLength ?? defaults.bottomLength,
    ].filter(Boolean);
    return parts.join(" / ");
  }
  if (category === Category.TOP) {
    if (sub === "hoodie" || sub === "sweatshirt") return defaults.hoodie ?? defaults.top ?? "";
    if (sub === "shirt" || sub === "polo") return defaults.formalShirt ?? defaults.top ?? "";
    return defaults.tops ?? defaults.top ?? "";
  }
  return "";
}
