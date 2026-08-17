import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setLogContext, tracedHandler } from "../../shared/logger";
import { redactUid } from "../../shared/rateLimit";
import {
  buildAuraResumeMetrics,
  getAuraMetricsSnapshot,
  refreshAuraMetricsSnapshotForUser,
  resetAuraMetricsForUser,
} from "./metrics";

function requireAuthUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
  return uid;
}

export async function handleGetAuraMetrics(uid: string | undefined) {
  const userId = requireAuthUid(uid);
  return getAuraMetricsSnapshot(userId);
}

export async function handleRefreshAuraMetricsSnapshot(uid: string | undefined, data: unknown) {
  const userId = requireAuthUid(uid);
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return refreshAuraMetricsSnapshotForUser(userId, { dryRun: input.dryRun === true });
}

export async function handleGetAuraResumeMetrics(uid: string | undefined) {
  const userId = requireAuthUid(uid);
  return buildAuraResumeMetrics(await getAuraMetricsSnapshot(userId));
}

export async function handleResetAuraMetrics(uid: string | undefined, data: unknown) {
  const userId = requireAuthUid(uid);
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (input.confirm !== "RESET_AURA_METRICS") {
    throw new HttpsError("invalid-argument", "confirm must be RESET_AURA_METRICS.");
  }
  return resetAuraMetricsForUser(userId);
}

export const getAuraMetrics = onCall(
  { timeoutSeconds: 60 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleGetAuraMetrics(uid);
  }),
);

export const refreshAuraMetricsSnapshot = onCall(
  { timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleRefreshAuraMetricsSnapshot(uid, request.data);
  }),
);

export const getAuraResumeMetrics = onCall(
  { timeoutSeconds: 60 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleGetAuraResumeMetrics(uid);
  }),
);

export const resetAuraMetrics = onCall(
  { timeoutSeconds: 60 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleResetAuraMetrics(uid, request.data);
  }),
);
