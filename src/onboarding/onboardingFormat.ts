import { SHOE_SIZES_EU } from "@/src/onboarding/onboardingOptions";
import type {
  UnitsPreference,
  UserProfilePreferences,
} from "@/src/types/UserProfilePreferences";

const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

export function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

export function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getLocaleParts() {
  const locale =
    Intl.DateTimeFormat().resolvedOptions().locale ||
    (typeof navigator !== "undefined" ? navigator.language : "") ||
    "en-US";
  const region = locale.split("-").find((part) => part.length === 2)?.toUpperCase() ?? "US";
  const unitsPreference: UnitsPreference = IMPERIAL_REGIONS.has(region) ? "imperial" : "metric";
  return { locale, region, unitsPreference };
}

export function unitsForPreference(unitsPreference: UnitsPreference) {
  if (unitsPreference === "imperial") {
    return { length: "in", weight: "lb", shoeRegion: "US", clothingRegion: "US" } as const;
  }
  return { length: "cm", weight: "kg", shoeRegion: "EU", clothingRegion: "INTL" } as const;
}

export function formatHeight(value: number, unitsPreference: UnitsPreference) {
  if (unitsPreference === "imperial") {
    const feet = Math.floor(value / 12);
    const inches = value % 12;
    return `${feet}'${inches}"`;
  }
  return `${value} cm`;
}

export function euShoeConversion(euSize: number) {
  const usMen = Math.max(1, euSize - 33.5);
  const usWomen = Math.max(1, euSize - 31);
  const uk = Math.max(1, euSize - 34);
  return `US M ${formatShoeHalf(usMen)} / US W ${formatShoeHalf(usWomen)} / UK ${formatShoeHalf(uk)}`;
}

export function formatShoeHalf(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function messageForOnboardingSaveError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (code === "permission-denied" || code === "unauthenticated") {
    return "We couldn't save your setup because your session expired. Please sign in again and retry.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "We couldn't save your setup because the network is unavailable. Check your connection and try again.";
  }
  return "We couldn't save your setup. Please try again.";
}

export function shoeValueFromDraft(draft: UserProfilePreferences) {
  const raw = String(draft.defaultSizes.shoes ?? "").match(/\d+/)?.[0];
  const next = raw ? Number(raw) : 42;
  return SHOE_SIZES_EU.includes(next) ? next : 42;
}
