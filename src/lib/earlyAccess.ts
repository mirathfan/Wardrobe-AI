import { doc, onSnapshot } from "firebase/firestore";
import React from "react";

import { db } from "@/src/lib/firebase";

export type EarlyAccessFeatureKey = "aiPolish" | "outfitExtraction";

export type EarlyAccessFeatureState = {
  loading: boolean;
  featureKey: EarlyAccessFeatureKey;
  betaRole: "standard" | "power";
  enabled: boolean;
  allowed: boolean;
  periodKey: string;
  limit: number;
  used: number;
  remaining: number;
};

export const EARLY_ACCESS_LIMITED_PREVIEW = {
  title: "Coming soon",
  body: "We’re fine-tuning this feature for Early Access.",
  cta: "Got it",
} as const;

export const EARLY_ACCESS_BACKEND_ERRORS = {
  featureNotAvailable: {
    code: "FEATURE_NOT_AVAILABLE",
    message: "This feature is coming soon in Early Access.",
  },
  limitReached: {
    code: "EARLY_ACCESS_LIMIT_REACHED",
    message:
      "You’ve used your beta runs for this feature. More runs will be available soon.",
  },
} as const;

const FEATURE_LIMITS: Record<EarlyAccessFeatureKey, number> = {
  aiPolish: 3,
  outfitExtraction: 2,
};

const FEATURE_USAGE_FIELDS: Record<EarlyAccessFeatureKey, "aiPolishUsed" | "outfitExtractionUsed"> = {
  aiPolish: "aiPolishUsed",
  outfitExtraction: "outfitExtractionUsed",
};

function currentPeriodKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function normalizeRole(value: unknown): "standard" | "power" {
  return value === "power" ? "power" : "standard";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numericUsed(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function buildState(
  featureKey: EarlyAccessFeatureKey,
  userData: Record<string, unknown>,
  usageData: Record<string, unknown>,
  loading = false,
): EarlyAccessFeatureState {
  const periodKey = currentPeriodKey();
  const betaRole = normalizeRole(userData.betaRole);
  const featureAccess = asRecord(userData.featureAccess);
  const enabled = featureAccess[featureKey] === true;
  const allowed = betaRole === "power" && enabled;
  const limit = FEATURE_LIMITS[featureKey];
  const used = usageData.periodKey === periodKey
    ? Math.min(limit, numericUsed(usageData[FEATURE_USAGE_FIELDS[featureKey]]))
    : 0;

  return {
    loading,
    featureKey,
    betaRole,
    enabled,
    allowed,
    periodKey,
    limit,
    used,
    remaining: allowed ? Math.max(0, limit - used) : 0,
  };
}

export function useEarlyAccessFeature(
  uid: string | null | undefined,
  featureKey: EarlyAccessFeatureKey,
): EarlyAccessFeatureState {
  const [userData, setUserData] = React.useState<Record<string, unknown>>({});
  const [usageData, setUsageData] = React.useState<Record<string, unknown>>({});
  const [loading, setLoading] = React.useState(Boolean(uid));

  React.useEffect(() => {
    setUserData({});
    setUsageData({});
    setLoading(Boolean(uid));
    if (!uid) return undefined;

    let userLoaded = false;
    let usageLoaded = false;
    const updateLoading = () => setLoading(!(userLoaded && usageLoaded));
    const userUnsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        userLoaded = true;
        setUserData(snap.data() ?? {});
        updateLoading();
      },
      () => {
        userLoaded = true;
        setUserData({});
        updateLoading();
      },
    );
    const usageUnsub = onSnapshot(
      doc(db, "users", uid, "usage", "earlyAccess"),
      (snap) => {
        usageLoaded = true;
        setUsageData(snap.data() ?? {});
        updateLoading();
      },
      () => {
        usageLoaded = true;
        setUsageData({});
        updateLoading();
      },
    );

    return () => {
      userUnsub();
      usageUnsub();
    };
  }, [uid]);

  return React.useMemo(
    () => buildState(featureKey, userData, usageData, loading),
    [featureKey, loading, usageData, userData],
  );
}

export function earlyAccessFeatureLabel(featureKey: EarlyAccessFeatureKey, remaining: number) {
  void featureKey;
  return `${remaining} beta runs included`;
}

function detailsRecord(error: unknown) {
  if (!error || typeof error !== "object" || !("details" in error)) return {};
  return asRecord((error as { details?: unknown }).details);
}

export function earlyAccessErrorCode(error: unknown) {
  const details = detailsRecord(error);
  const detailsCode = typeof details.code === "string" ? details.code : "";
  if (detailsCode === EARLY_ACCESS_BACKEND_ERRORS.featureNotAvailable.code) return detailsCode;
  if (detailsCode === EARLY_ACCESS_BACKEND_ERRORS.limitReached.code) return detailsCode;

  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes(EARLY_ACCESS_BACKEND_ERRORS.featureNotAvailable.code)) {
    return EARLY_ACCESS_BACKEND_ERRORS.featureNotAvailable.code;
  }
  if (message.includes(EARLY_ACCESS_BACKEND_ERRORS.limitReached.code)) {
    return EARLY_ACCESS_BACKEND_ERRORS.limitReached.code;
  }
  return "";
}

export function isEarlyAccessError(error: unknown) {
  return Boolean(earlyAccessErrorCode(error));
}

export function earlyAccessErrorMessage(error: unknown) {
  const details = detailsRecord(error);
  if (typeof details.message === "string" && details.message.trim()) {
    return details.message;
  }
  const code = earlyAccessErrorCode(error);
  if (code === EARLY_ACCESS_BACKEND_ERRORS.featureNotAvailable.code) {
    return EARLY_ACCESS_BACKEND_ERRORS.featureNotAvailable.message;
  }
  if (code === EARLY_ACCESS_BACKEND_ERRORS.limitReached.code) {
    return EARLY_ACCESS_BACKEND_ERRORS.limitReached.message;
  }
  return "";
}
