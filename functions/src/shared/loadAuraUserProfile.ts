import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();
const LIST_LIMIT = 10;

type CompactStringMap = Record<string, string>;
type AuraUserProfileListKey =
  | "selectedCategories"
  | "styleAesthetics"
  | "favoriteColors"
  | "avoidedColors"
  | "accessoryPreferences"
  | "occasionPriority"
  | "goals";

export type AuraUserProfile = {
  name?: string;
  firstName?: string;
  region?: string;
  wardrobeMode?: "masculine" | "feminine" | "neutral" | "mixed" | "custom";
  selectedCategories?: string[];
  styleAesthetics?: string[];
  favoriteColors?: string[];
  avoidedColors?: string[];
  accessoryPreferences?: string[];
  occasionPriority?: string[];
  goals?: string[];
  preferredFit?: "slim" | "regular" | "relaxed" | "oversized";
  defaultSizes?: CompactStringMap;
  fitPreferences?: CompactStringMap;
  stylePreferences?: {
    preferredStyles?: string[];
    favoriteColors?: string[];
    avoidedColors?: string[];
    preferredBrands?: string[];
  };
  closetPreferences?: {
    prioritizeUnderused?: boolean;
    hideLaundryByDefault?: boolean;
    defaultSort?: string;
  };
};

function cleanString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanStringList(value: unknown, limit = LIST_LIMIT) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const values: string[] = [];
  for (const entry of value) {
    const text = cleanString(entry);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(text);
    if (values.length >= limit) break;
  }
  return values;
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
  return null;
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

function cleanEnum(value: unknown, allowed: readonly string[]) {
  const next = cleanString(value);
  return next && allowed.includes(next) ? next : null;
}

function cleanFitPreferences(value: unknown) {
  const fitPreferences = readRecord(value);
  const next: CompactStringMap = {};
  const tops = cleanEnum(fitPreferences.tops, ["slim", "regular", "relaxed", "oversized"]);
  const outerwear = cleanEnum(fitPreferences.outerwear, ["slim", "regular", "roomy"]);
  const bottomsRise = cleanEnum(fitPreferences.bottomsRise, ["low", "mid", "high"]);
  const bottomsLeg = cleanEnum(fitPreferences.bottomsLeg, ["skinny", "slim", "straight", "tapered", "wide"]);
  const shoes = cleanEnum(fitPreferences.shoes, ["true_to_size", "half_up", "half_down"]);

  if (tops) next.tops = tops;
  if (outerwear) next.outerwear = outerwear;
  if (bottomsRise) next.bottomsRise = bottomsRise;
  if (bottomsLeg) next.bottomsLeg = bottomsLeg;
  if (shoes) next.shoes = shoes;

  return Object.keys(next).length ? next : null;
}

function cleanDefaultSizes(value: unknown) {
  const defaultSizes = readRecord(value);
  const next: CompactStringMap = {};
  const fields: [string, unknown][] = [
    ["tops", defaultSizes.tops ?? defaultSizes.top],
    ["outerwear", defaultSizes.outerwear],
    ["hoodie", defaultSizes.hoodie],
    ["formalShirt", defaultSizes.formalShirt],
    ["bottoms", defaultSizes.bottoms ?? defaultSizes.bottomWaist ?? defaultSizes.bottomsWaist],
    ["bottomsLength", defaultSizes.bottomsLength ?? defaultSizes.bottomLength],
    ["jeans", defaultSizes.jeans],
    ["dresses", defaultSizes.dresses],
    ["skirts", defaultSizes.skirts],
    ["shoes", defaultSizes.shoes],
  ];

  fields.forEach(([key, value]) => {
    const cleaned = cleanString(value);
    if (cleaned) next[key] = cleaned;
  });

  return Object.keys(next).length ? next : null;
}

function cleanClosetPreferences(value: unknown): AuraUserProfile["closetPreferences"] | null {
  const closetPreferences = readRecord(value);
  const next: NonNullable<AuraUserProfile["closetPreferences"]> = {};
  if (closetPreferences.prioritizeUnderused === true) {
    next.prioritizeUnderused = true;
  }
  if (closetPreferences.hideLaundryByDefault === true) {
    next.hideLaundryByDefault = true;
  }
  const defaultSort = cleanString(closetPreferences.defaultSort);
  if (defaultSort) next.defaultSort = defaultSort;
  return Object.keys(next).length ? next : null;
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function addStringList(target: AuraUserProfile, key: AuraUserProfileListKey, values: string[]) {
  if (values.length) target[key] = values;
}

export async function loadAuraUserProfile(uid: string): Promise<AuraUserProfile> {
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.data() ?? {};
  const profilePreferences = readRecord(data.profilePreferences);
  const stylePreferences = readRecord(profilePreferences.stylePreferences);

  const preferredStyles = cleanStringList(stylePreferences.preferredStyles);
  const styleAesthetics = cleanStringList(profilePreferences.styleAesthetics);
  const effectiveStyleAesthetics = styleAesthetics.length ? styleAesthetics : preferredStyles;

  const nestedFavoriteColors = cleanStringList(stylePreferences.favoriteColors);
  const favoriteColors = cleanStringList(profilePreferences.favoriteColors);
  const effectiveFavoriteColors = favoriteColors.length ? favoriteColors : nestedFavoriteColors;

  const nestedAvoidedColors = cleanStringList(stylePreferences.avoidedColors);
  const avoidedColors = cleanStringList(profilePreferences.avoidedColors);
  const effectiveAvoidedColors = avoidedColors.length ? avoidedColors : nestedAvoidedColors;

  const compactStylePreferences: NonNullable<AuraUserProfile["stylePreferences"]> = {};
  if (preferredStyles.length && !sameList(preferredStyles, effectiveStyleAesthetics)) {
    compactStylePreferences.preferredStyles = preferredStyles;
  }
  if (nestedFavoriteColors.length && !sameList(nestedFavoriteColors, effectiveFavoriteColors)) {
    compactStylePreferences.favoriteColors = nestedFavoriteColors;
  }
  if (nestedAvoidedColors.length && !sameList(nestedAvoidedColors, effectiveAvoidedColors)) {
    compactStylePreferences.avoidedColors = nestedAvoidedColors;
  }
  const preferredBrands = cleanStringList(stylePreferences.preferredBrands);
  if (preferredBrands.length) compactStylePreferences.preferredBrands = preferredBrands;

  const profile: AuraUserProfile = {};
  const name = cleanString(data.name);
  const firstName = cleanString(profilePreferences.firstName);
  const region = cleanString(profilePreferences.region);
  const wardrobeMode = cleanWardrobeMode(profilePreferences.wardrobeMode);
  const preferredFit = cleanPreferredFit(profilePreferences.preferredFit);
  const defaultSizes = cleanDefaultSizes(profilePreferences.defaultSizes);
  const fitPreferences = cleanFitPreferences(profilePreferences.fitPreferences);
  const closetPreferences = cleanClosetPreferences(profilePreferences.closetPreferences);

  if (name) profile.name = name;
  if (firstName) profile.firstName = firstName;
  if (region) profile.region = region;
  if (wardrobeMode) profile.wardrobeMode = wardrobeMode;
  addStringList(profile, "selectedCategories", cleanStringList(profilePreferences.selectedCategories));
  addStringList(profile, "styleAesthetics", effectiveStyleAesthetics);
  addStringList(profile, "favoriteColors", effectiveFavoriteColors);
  addStringList(profile, "avoidedColors", effectiveAvoidedColors);
  addStringList(profile, "accessoryPreferences", cleanStringList(profilePreferences.accessoryPreferences));
  addStringList(profile, "occasionPriority", cleanStringList(profilePreferences.occasionPriority));
  addStringList(profile, "goals", cleanStringList(profilePreferences.goals));
  if (preferredFit) profile.preferredFit = preferredFit;
  if (defaultSizes) profile.defaultSizes = defaultSizes;
  if (fitPreferences) profile.fitPreferences = fitPreferences;
  if (Object.keys(compactStylePreferences).length) {
    profile.stylePreferences = compactStylePreferences;
  }
  if (closetPreferences) profile.closetPreferences = closetPreferences;

  return profile;
}
