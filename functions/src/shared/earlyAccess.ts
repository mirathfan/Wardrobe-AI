import { createHash } from "node:crypto";

import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export type EarlyAccessFeatureKey = "aiPolish" | "outfitExtraction";

export type EarlyAccessFeatureState = {
  featureKey: EarlyAccessFeatureKey;
  betaRole: "standard" | "power";
  enabled: boolean;
  allowed: boolean;
  periodKey: string;
  limit: number;
  used: number;
  remaining: number;
};

type CachedEarlyAccessResult<T> = {
  result: T;
  cacheHit: true;
};

const FEATURE_LIMITS: Record<EarlyAccessFeatureKey, number> = {
  aiPolish: 3,
  outfitExtraction: 2,
};

const FEATURE_USAGE_FIELDS: Record<EarlyAccessFeatureKey, "aiPolishUsed" | "outfitExtractionUsed"> = {
  aiPolish: "aiPolishUsed",
  outfitExtraction: "outfitExtractionUsed",
};

const FEATURE_RUN_KEY_FIELDS: Record<EarlyAccessFeatureKey, "aiPolishRunKeys" | "outfitExtractionRunKeys"> = {
  aiPolish: "aiPolishRunKeys",
  outfitExtraction: "outfitExtractionRunKeys",
};

export const EARLY_ACCESS_ERRORS = {
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

export function currentEarlyAccessPeriodKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function makeEarlyAccessImageHash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function normalizeEarlyAccessImageHash(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function normalizeBetaRole(value: unknown): "standard" | "power" {
  return value === "power" ? "power" : "standard";
}

function featureEnabled(data: Record<string, unknown>, featureKey: EarlyAccessFeatureKey) {
  const access = data.featureAccess;
  if (!access || typeof access !== "object") return false;
  return (access as Record<string, unknown>)[featureKey] === true;
}

function numericField(data: Record<string, unknown>, field: string) {
  const value = Number(data[field] ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function runKeysField(data: Record<string, unknown>, field: string) {
  const value = data[field];
  return Array.isArray(value)
    ? value.map((entry) => String(entry)).filter(Boolean).slice(-20)
    : [];
}

function safeRunKey(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

function earlyAccessError(error: (typeof EARLY_ACCESS_ERRORS)[keyof typeof EARLY_ACCESS_ERRORS]) {
  return new HttpsError("failed-precondition", error.message, {
    code: error.code,
    message: error.message,
  });
}

function featureStateFromData(params: {
  featureKey: EarlyAccessFeatureKey;
  userData: Record<string, unknown>;
  usageData: Record<string, unknown>;
  periodKey: string;
}) {
  const betaRole = normalizeBetaRole(params.userData.betaRole);
  const enabled = featureEnabled(params.userData, params.featureKey);
  const allowed = betaRole === "power" && enabled;
  const limit = FEATURE_LIMITS[params.featureKey];
  const usageField = FEATURE_USAGE_FIELDS[params.featureKey];
  const used = params.usageData.periodKey === params.periodKey
    ? Math.min(limit, numericField(params.usageData, usageField))
    : 0;

  return {
    featureKey: params.featureKey,
    betaRole,
    enabled,
    allowed,
    periodKey: params.periodKey,
    limit,
    used,
    remaining: allowed ? Math.max(0, limit - used) : 0,
  } satisfies EarlyAccessFeatureState;
}

export async function getEarlyAccessFeatureState(
  uid: string,
  featureKey: EarlyAccessFeatureKey,
): Promise<EarlyAccessFeatureState> {
  const db = getFirestore();
  const periodKey = currentEarlyAccessPeriodKey();
  const [userSnap, usageSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("users").doc(uid).collection("usage").doc("earlyAccess").get(),
  ]);
  return featureStateFromData({
    featureKey,
    userData: userSnap.data() ?? {},
    usageData: usageSnap.data() ?? {},
    periodKey,
  });
}

export async function checkAndConsumeEarlyAccessUse(
  uid: string,
  featureKey: EarlyAccessFeatureKey,
  options: { runKey?: string | null } = {},
): Promise<EarlyAccessFeatureState & { consumed: boolean; alreadyConsumedForRun: boolean }> {
  const db = getFirestore();
  const userRef = db.collection("users").doc(uid);
  const usageRef = userRef.collection("usage").doc("earlyAccess");
  const periodKey = currentEarlyAccessPeriodKey();
  const usageField = FEATURE_USAGE_FIELDS[featureKey];
  const runKeyField = FEATURE_RUN_KEY_FIELDS[featureKey];
  const limit = FEATURE_LIMITS[featureKey];
  const normalizedRunKey = safeRunKey(options.runKey);

  return db.runTransaction(async (transaction) => {
    const [userSnap, usageSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(usageRef),
    ]);
    const userData = userSnap.data() ?? {};
    const rawUsageData = usageSnap.data() ?? {};
    const usageData = rawUsageData.periodKey === periodKey ? rawUsageData : {};
    const state = featureStateFromData({ featureKey, userData, usageData, periodKey });

    if (!state.allowed) {
      throw earlyAccessError(EARLY_ACCESS_ERRORS.featureNotAvailable);
    }

    const runKeys = runKeysField(usageData, runKeyField);
    if (normalizedRunKey && runKeys.includes(normalizedRunKey)) {
      return {
        ...state,
        consumed: false,
        alreadyConsumedForRun: true,
      };
    }

    if (state.used >= limit) {
      throw earlyAccessError(EARLY_ACCESS_ERRORS.limitReached);
    }

    const nextUsed = state.used + 1;
    const nextRunKeys = normalizedRunKey ? [...runKeys, normalizedRunKey].slice(-20) : runKeys;
    const resetFields = rawUsageData.periodKey === periodKey
      ? {}
      : {
          aiPolishUsed: 0,
          outfitExtractionUsed: 0,
          aiPolishRunKeys: [],
          outfitExtractionRunKeys: [],
        };
    transaction.set(
      usageRef,
      {
        ...resetFields,
        periodKey,
        [usageField]: nextUsed,
        [runKeyField]: nextRunKeys,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );

    return {
      ...state,
      used: nextUsed,
      remaining: Math.max(0, limit - nextUsed),
      consumed: true,
      alreadyConsumedForRun: false,
    };
  });
}

function cacheDocId(featureKey: EarlyAccessFeatureKey, imageHash: string, modelVersion: string) {
  return createHash("sha256")
    .update(`${featureKey}:${imageHash}:${modelVersion}`)
    .digest("hex");
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      entry === undefined ? null : stripUndefined(entry),
    ]),
  );
}

export async function getCachedEarlyAccessResult<T>(
  uid: string,
  featureKey: EarlyAccessFeatureKey,
  imageHash: string | null,
  modelVersion: string,
): Promise<CachedEarlyAccessResult<T> | null> {
  if (!imageHash) return null;
  const db = getFirestore();
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("earlyAccessCache")
    .doc(cacheDocId(featureKey, imageHash, modelVersion))
    .get();
  const data = snap.data();
  if (!data || data.featureKey !== featureKey || data.modelVersion !== modelVersion) {
    return null;
  }
  return { result: data.result as T, cacheHit: true };
}

export async function setCachedEarlyAccessResult(
  uid: string,
  featureKey: EarlyAccessFeatureKey,
  imageHash: string | null,
  modelVersion: string,
  result: unknown,
) {
  if (!imageHash) return;
  const db = getFirestore();
  await db
    .collection("users")
    .doc(uid)
    .collection("earlyAccessCache")
    .doc(cacheDocId(featureKey, imageHash, modelVersion))
    .set(
      {
        featureKey,
        imageHash,
        modelVersion,
        result: stripUndefined(result),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}
