import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";

export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "USD - US Dollar", symbol: "$" },
  { code: "INR", label: "INR - Indian Rupee", symbol: "₹" },
  { code: "EUR", label: "EUR - Euro", symbol: "€" },
  { code: "GBP", label: "GBP - British Pound", symbol: "£" },
  { code: "CAD", label: "CAD - Canadian Dollar", symbol: "C$" },
  { code: "AUD", label: "AUD - Australian Dollar", symbol: "A$" },
  { code: "AED", label: "AED - UAE Dirham", symbol: "د.إ" },
] as const;

export type SupportedCurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]["code"];

const SUPPORTED_CODES = new Set<string>(SUPPORTED_CURRENCIES.map((currency) => currency.code));

const REGION_CURRENCY: Record<string, SupportedCurrencyCode> = {
  US: "USD",
  IN: "INR",
  GB: "GBP",
  UK: "GBP",
  CA: "CAD",
  AU: "AUD",
  AE: "AED",
};

const EUR_REGION_CODES = new Set([
  "AT",
  "BE",
  "CY",
  "EE",
  "FI",
  "FR",
  "EU",
  "DE",
  "GR",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "HR",
  "BG",
  "CZ",
  "DK",
  "HU",
  "SE",
  "NO",
  "IS",
  "LI",
  "AD",
  "MC",
  "SM",
  "VA",
]);

const SYMBOL_CURRENCY: Record<string, string> = {
  "$": "USD",
  "US$": "USD",
  "CA$": "CAD",
  "C$": "CAD",
  "AU$": "AUD",
  "A$": "AUD",
  "₹": "INR",
  "RS": "INR",
  "INR": "INR",
  "€": "EUR",
  "£": "GBP",
  "د.إ": "AED",
  "AED": "AED",
};

function normalizeRegionCode(regionCode?: string | null) {
  const normalized = String(regionCode ?? "")
    .trim()
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  return normalized || null;
}

function regionFromLocale(locale?: string | null) {
  const match = String(locale ?? "").match(/[-_]([a-z]{2}|\d{3})(?:$|[-_])/i);
  return normalizeRegionCode(match?.[1]);
}

function localeCandidates() {
  const candidates: string[] = [];
  const navigatorLike = globalThis as unknown as {
    navigator?: { languages?: readonly string[]; language?: string };
  };
  const languages = navigatorLike.navigator?.languages;
  if (Array.isArray(languages)) candidates.push(...languages);
  if (navigatorLike.navigator?.language) candidates.push(navigatorLike.navigator.language);
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale) candidates.push(locale);
  } catch {}
  return candidates.filter(Boolean);
}

export function normalizeCurrencyCode(code?: string | null) {
  const raw = String(code ?? "").trim();
  if (!raw) return null;
  const symbolMapped = SYMBOL_CURRENCY[raw] ?? SYMBOL_CURRENCY[raw.toUpperCase()];
  if (symbolMapped) return symbolMapped;
  const normalized = raw.replace(/[^a-z]/gi, "").toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

export function isSupportedCurrencyCode(code?: string | null): code is SupportedCurrencyCode {
  const normalized = normalizeCurrencyCode(code);
  return !!normalized && SUPPORTED_CODES.has(normalized);
}

export function getCurrencyForRegion(regionCode?: string | null): SupportedCurrencyCode {
  const region = normalizeRegionCode(regionCode);
  if (!region) return "USD";
  if (REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  if (EUR_REGION_CODES.has(region)) return "EUR";
  return "USD";
}

export function detectDeviceCurrency(): SupportedCurrencyCode {
  for (const locale of localeCandidates()) {
    const region = regionFromLocale(locale);
    if (region) return getCurrencyForRegion(region);
  }
  return "USD";
}

export function formatMoney(amount: number, currency?: string | null) {
  const normalizedCurrency = normalizeCurrencyCode(currency) ?? "USD";
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: Number.isInteger(safeAmount) ? 0 : 2,
    }).format(safeAmount);
  } catch {
    const fixed = Number.isInteger(safeAmount) ? String(safeAmount) : safeAmount.toFixed(2);
    return `${normalizedCurrency} ${fixed}`;
  }
}

export function resolveUserCurrency(
  profilePreferences?: Pick<
    UserProfilePreferences,
    "currencyMode" | "preferredCurrency" | "detectedCurrency"
  > | null,
): SupportedCurrencyCode {
  const detected =
    (isSupportedCurrencyCode(profilePreferences?.detectedCurrency)
      ? normalizeCurrencyCode(profilePreferences?.detectedCurrency)
      : null) ?? detectDeviceCurrency();
  const preferred =
    isSupportedCurrencyCode(profilePreferences?.preferredCurrency)
      ? normalizeCurrencyCode(profilePreferences?.preferredCurrency)
      : null;

  if (profilePreferences?.currencyMode === "manual") {
    return (preferred ?? detected ?? "USD") as SupportedCurrencyCode;
  }
  return (detected ?? preferred ?? "USD") as SupportedCurrencyCode;
}
