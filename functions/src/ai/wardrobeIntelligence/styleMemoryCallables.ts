import { HttpsError, onCall } from "firebase-functions/v2/https";
import { setLogContext, tracedHandler } from "../../shared/logger";
import { redactUid } from "../../shared/rateLimit";
import { safeRecordAuraMetricEvent } from "./metrics";
import {
  defaultStyleProfile,
  listStyleMemoriesForUser,
  outfitStyleMemoryContextFromResponse,
  readStyleProfile,
  rebuildStyleProfile,
  recordStyleMemoryFeedback,
  retrieveStyleMemoryContextForUser,
  serializeStyleMemoryForClient,
  softDeleteAllStyleMemoriesForUser,
  softDeleteStyleMemory,
  type RecordStyleMemoryDeps,
  type RetrieveStyleMemoryDeps,
} from "./styleMemory";
import type { StyleMemory, StyleMemoryClient, StyleMemoryFeedbackInput, StyleProfile } from "./styleMemoryTypes";

function requireAuthUid(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Please sign in first.");
  return uid;
}

function requireMemoryId(value: unknown): string {
  const memoryId = String(value ?? "").trim();
  if (!memoryId) throw new HttpsError("invalid-argument", "A style memory ID is required.");
  return memoryId;
}

export type StyleMemoryCallableDeps = RecordStyleMemoryDeps & RetrieveStyleMemoryDeps;
export type StyleMemoryCleanupDeps = {
  listMemories?: (uid: string) => Promise<StyleMemory[]>;
  updateMemory?: (uid: string, memoryId: string, patch: Partial<StyleMemory>) => Promise<void>;
  writeStyleProfile?: (uid: string, profile: StyleProfile) => Promise<void>;
};
export type StyleMemoryListDeps = {
  listStyleMemories?: (
    uid: string,
    input: { limit?: number; polarity?: string; type?: string },
  ) => Promise<(StyleMemory | StyleMemoryClient)[]>;
};

export async function handleRecordOutfitFeedback(
  uid: string | undefined,
  data: unknown,
  deps: StyleMemoryCallableDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = data && typeof data === "object" ? data as StyleMemoryFeedbackInput : {} as StyleMemoryFeedbackInput;
  if (!input.feedbackType) throw new HttpsError("invalid-argument", "feedbackType is required.");
  const result = await recordStyleMemoryFeedback(userId, input, deps);
  await safeRecordAuraMetricEvent(userId, {
    type: "style_feedback_recorded",
    feedbackType: input.feedbackType,
  });
  return result;
}

export async function handleRetrieveStyleMemoryContext(
  uid: string | undefined,
  data: unknown,
  deps: StyleMemoryCallableDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const response = await retrieveStyleMemoryContextForUser(userId, {
    query: String(input.query ?? ""),
    occasion: typeof input.occasion === "string" ? input.occasion : undefined,
    formality: typeof input.formality === "string" ? input.formality : undefined,
    limit: Number(input.limit),
    includeDiagnostics: input.includeDiagnostics === true,
    respectInputOccasion: input.respectInputOccasion === true,
  }, deps);
  await safeRecordAuraMetricEvent(userId, {
    type: "style_memory_retrieved",
    retrievedCount: response.positiveMemories.length + response.negativeMemories.length,
  });
  return {
    ...response,
    outfitPromptContextPreview: outfitStyleMemoryContextFromResponse(response),
  };
}

export async function handleGetStyleProfile(
  uid: string | undefined,
  deps: Pick<StyleMemoryCallableDeps, "getStyleProfile"> = {},
) {
  const userId = requireAuthUid(uid);
  return await (deps.getStyleProfile ?? readStyleProfile)(userId) ?? defaultStyleProfile(userId);
}

export async function handleRebuildStyleProfileFromMemories(uid: string | undefined, data: unknown) {
  const userId = requireAuthUid(uid);
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return rebuildStyleProfile(userId, { dryRun: input.dryRun === true });
}

export async function handleListStyleMemories(
  uid: string | undefined,
  data: unknown,
  deps: StyleMemoryListDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const query = {
    limit: Number(input.limit),
    polarity: typeof input.polarity === "string" ? input.polarity : undefined,
    type: typeof input.type === "string" ? input.type : undefined,
  };
  const memories = deps.listStyleMemories
    ? await deps.listStyleMemories(userId, query)
    : await listStyleMemoriesForUser(userId, query);
  return {
    memories: memories.map((memory) => serializeStyleMemoryForClient(memory as StyleMemory)),
  };
}

export async function handleDeleteStyleMemory(uid: string | undefined, data: unknown) {
  const userId = requireAuthUid(uid);
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (input.confirm !== "DELETE_STYLE_MEMORY") {
    throw new HttpsError("invalid-argument", "confirm must be DELETE_STYLE_MEMORY.");
  }
  const memoryId = requireMemoryId(input.memoryId);
  await softDeleteStyleMemory(userId, memoryId);
  return { memoryId, active: false };
}

export async function handleSoftDeleteAllStyleMemories(
  uid: string | undefined,
  data: unknown,
  deps: StyleMemoryCleanupDeps = {},
) {
  const userId = requireAuthUid(uid);
  const input = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (input.confirm !== "SOFT_DELETE_ALL_STYLE_MEMORIES") {
    throw new HttpsError("invalid-argument", "confirm must be SOFT_DELETE_ALL_STYLE_MEMORIES.");
  }
  return softDeleteAllStyleMemoriesForUser(userId, deps);
}

export const recordOutfitFeedback = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleRecordOutfitFeedback(uid, request.data);
  }),
);

export const retrieveStyleMemoryContext = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleRetrieveStyleMemoryContext(uid, request.data);
  }),
);

export const getStyleProfile = onCall(
  { timeoutSeconds: 60 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleGetStyleProfile(uid);
  }),
);

export const rebuildStyleProfileFromMemories = onCall(
  { timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleRebuildStyleProfileFromMemories(uid, request.data);
  }),
);

export const listStyleMemories = onCall(
  { timeoutSeconds: 60 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleListStyleMemories(uid, request.data);
  }),
);

export const deleteStyleMemory = onCall(
  { timeoutSeconds: 60 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleDeleteStyleMemory(uid, request.data);
  }),
);

export const softDeleteAllStyleMemories = onCall(
  { timeoutSeconds: 120 },
  tracedHandler(async (request) => {
    const uid = requireAuthUid(request.auth?.uid);
    setLogContext({ uidHash: redactUid(uid) });
    return handleSoftDeleteAllStyleMemories(uid, request.data);
  }),
);
