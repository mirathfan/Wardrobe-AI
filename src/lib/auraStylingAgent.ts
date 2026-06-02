import { getFunctions, httpsCallable } from "firebase/functions";

import { app, auth } from "@/src/lib/firebase";
import {
  AURA_AGENT_ACTION_TIMEOUT_MS,
  AURA_AGENT_TIMEOUT_MS,
  AURA_HARDENING_LOG_PREFIX,
  getAuraFriendlyErrorMessage,
  isAuraHardeningTimeoutError,
  sanitizeAuraClientPayload,
  withTimeout,
} from "@/src/lib/auraHardening";
import type {
  AuraOutfitWeatherContext,
  AuraOutfitWeatherWarning,
} from "@/shared/auraOutfitCalendar";
import type {
  AuraAgentFeedbackType,
  AuraAgentOutfit,
  AuraAgentRequest,
  AuraAgentRequestMode,
  AuraAgentResponse,
} from "@/src/types/auraAgent";

export const AURA_AGENT_CALLABLE_NAME = "runAuraStylingAgent";
export const AURA_AGENT_SAVE_OUTFIT_CALLABLE_NAME = "saveAuraAgentOutfit";
export const AURA_AGENT_LOG_WEAR_CALLABLE_NAME = "logAuraAgentOutfitWear";
export const AURA_AGENT_PLAN_OUTFIT_CALLABLE_NAME = "planAuraAgentOutfit";
export const AURA_AGENT_DISLIKE_OUTFIT_CALLABLE_NAME = "dislikeAuraAgentOutfit";
export const AURA_AGENT_FUNCTIONS_REGION = "us-central1";
export const AURA_AGENT_DEFAULT_TIMEOUT_MS = AURA_AGENT_TIMEOUT_MS;
export { AURA_AGENT_ACTION_TIMEOUT_MS };
export const AURA_AGENT_FALLBACK_MESSAGE = "I couldn’t style that right now. Try again in a moment.";
export const AURA_AGENT_SIGN_IN_MESSAGE = "Please sign in again to use AURA styling.";

const VALID_MODES = new Set<AuraAgentRequestMode>([
  "auto",
  "generate_outfit",
  "refine_outfit",
  "explain_outfit",
  "feedback",
  "unknown",
]);
const VALID_FEEDBACK_TYPES = new Set<AuraAgentFeedbackType>([
  "like",
  "dislike",
  "save",
  "wear",
  "not_my_vibe",
  "more_like_this",
  "less_like_this",
  "too_formal",
  "too_casual",
  "more_formal",
  "more_casual",
  "more_streetwear",
  "less_streetwear",
  "more_color",
  "less_color",
  "prefer_item",
  "avoid_item",
  "manual_note",
]);

export class AuraAgentClientError extends Error {
  code?: string;
  originalMessage: string;
  details?: unknown;
  callableName?: string;
  region?: string;

  constructor(
    message: string,
    options?: {
      code?: string;
      originalMessage?: string;
      details?: unknown;
      callableName?: string;
      region?: string;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "AuraAgentClientError";
    this.code = options?.code;
    this.originalMessage = options?.originalMessage ?? message;
    this.details = options?.details;
    this.callableName = options?.callableName;
    this.region = options?.region;
    if (options?.cause) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

type RunAuraStylingAgentOptions = {
  timeoutMs?: number;
};

export type SaveAuraAgentOutfitInput = {
  outfit: AuraAgentOutfit;
  query?: string | null;
  agentRunId?: string | null;
  sourceMessageId?: string | null;
  dateKey?: string | null;
  weatherContext?: AuraOutfitWeatherContext | null;
};

export type SaveAuraAgentOutfitResult = {
  saved: true;
  alreadySaved: boolean;
  savedOutfitId: string;
  message: string;
};

export type LogAuraAgentOutfitWearInput = SaveAuraAgentOutfitInput & {
  wornAt?: string | Date | null;
};

export type LogAuraAgentOutfitWearResult = {
  logged: true;
  alreadyLogged?: boolean;
  wearEventId: string;
  dateKey?: string;
  message: string;
};

export type PlanAuraAgentOutfitInput = SaveAuraAgentOutfitInput & {
  dateKey: string;
};

export type PlanAuraAgentOutfitResult = {
  planned: true;
  alreadyPlanned: boolean;
  eventId: string;
  dateKey: string;
  weatherWarnings?: AuraOutfitWeatherWarning[];
  message: string;
};

export type DislikeAuraAgentOutfitInput = SaveAuraAgentOutfitInput & {
  reasonText?: string | null;
};

export type DislikeAuraAgentOutfitResult = {
  disliked: true;
  alreadyDisliked: boolean;
  dislikedOutfitId: string;
  message: string;
};

function devAgentLog(label: string, details?: Record<string, unknown>) {
  if (!__DEV__) return;
  console.log(AURA_HARDENING_LOG_PREFIX, label, details);
}

function featureFlagValue() {
  return String(process.env.EXPO_PUBLIC_AURA_AGENT_ENABLED ?? "");
}

function debugContext(user?: { uid?: string | null } | null) {
  return {
    callableName: AURA_AGENT_CALLABLE_NAME,
    region: AURA_AGENT_FUNCTIONS_REGION,
    hasAuthUser: !!user,
    uid: user?.uid ?? null,
    featureFlagValue: featureFlagValue() || null,
    featureFlagEnabled: isAuraAgentEnabled(),
  };
}

function cleanText(value: unknown, maxLength = 2000) {
  return String(value ?? "")
    .trim()
    .replace(/\0/g, "")
    .replace(/ignore previous instructions/gi, "")
    .replace(/forget everything/gi, "")
    .replace(/you are now/gi, "")
    .replace(/system:/gi, "")
    .replace(/assistant:/gi, "")
    .slice(0, maxLength);
}

function cleanStringList(value: unknown, max = 16) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const next = cleanText(entry, 120);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    if (out.length >= max) break;
  }
  return out.length ? out : undefined;
}

function cleanMode(value: unknown): AuraAgentRequestMode | undefined {
  const mode = cleanText(value, 40).toLowerCase() as AuraAgentRequestMode;
  return VALID_MODES.has(mode) ? mode : undefined;
}

function cleanFeedbackType(value: unknown): AuraAgentFeedbackType | undefined {
  const feedbackType = cleanText(value, 40).toLowerCase() as AuraAgentFeedbackType;
  return VALID_FEEDBACK_TYPES.has(feedbackType) ? feedbackType : undefined;
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)).filter((entry) => entry !== undefined) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)]),
    ) as T;
  }
  return value;
}

export function sanitizeAuraAgentPayload<T>(value: T): T {
  return stripUndefinedDeep(sanitizeAuraClientPayload(value, {
    includeDiagnostics: __DEV__,
    includeScoreBreakdown: __DEV__,
    dropAiMetadata: !__DEV__,
  }));
}

function sanitizeAuraAgentActionPayload<T>(value: T): T {
  return stripUndefinedDeep(sanitizeAuraClientPayload(value, {
    includeDiagnostics: false,
    includeScoreBreakdown: false,
    dropAiMetadata: true,
  }));
}

export function isAuraAgentEnabled() {
  const value = String(process.env.EXPO_PUBLIC_AURA_AGENT_ENABLED ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function buildAuraAgentCallablePayload(input: AuraAgentRequest): AuraAgentRequest {
  const count = Number(input.count);
  const includeDiagnostics = __DEV__ ? input.includeDiagnostics ?? true : false;
  return sanitizeAuraAgentPayload({
    query: cleanText(input.query),
    mode: cleanMode(input.mode) ?? "auto",
    count: Number.isFinite(count) ? Math.max(1, Math.min(5, Math.round(count))) : undefined,
    occasion: input.occasion ? cleanText(input.occasion, 160) : undefined,
    weather: input.weather ? cleanText(input.weather, 160) : undefined,
    formality: input.formality,
    preferredColors: cleanStringList(input.preferredColors),
    requiredColors: cleanStringList(input.requiredColors),
    requiredCategories: cleanStringList(input.requiredCategories),
    useStyleMemory: input.useStyleMemory ?? true,
    includeDiagnostics,
    previousOutfit: input.previousOutfit
      ? (sanitizeAuraAgentPayload(input.previousOutfit) as Record<string, unknown>)
      : undefined,
    outfitId: input.outfitId ? cleanText(input.outfitId, 180) : undefined,
    feedbackType: cleanFeedbackType(input.feedbackType),
    selectedItemIds: cleanStringList(input.selectedItemIds, 24),
    note: input.note ? cleanText(input.note, 500) : undefined,
  });
}

export function normalizeAuraAgentError(error: unknown): AuraAgentClientError {
  if (error instanceof AuraAgentClientError) return error;
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof candidate?.code === "string" ? candidate.code : undefined;
  const details = candidate?.details;
  const originalMessage =
    error instanceof Error
      ? error.message
      : typeof candidate?.message === "string"
        ? candidate.message
        : String(error ?? "");
  const lower = `${code ?? ""} ${originalMessage}`.toLowerCase();

  let message = AURA_AGENT_FALLBACK_MESSAGE;
  if (lower.includes("auth") || lower.includes("unauthenticated") || lower.includes("permission")) {
    message = AURA_AGENT_SIGN_IN_MESSAGE;
  } else if (lower.includes("not enough") || lower.includes("minimum closet")) {
    message = "I need a few more ready closet items before I can build that outfit.";
  } else if (lower.includes("index") || lower.includes("embedding")) {
    message = "Your wardrobe intelligence is still updating. Try again in a minute.";
  } else if (lower.includes("openai") || lower.includes("api key") || lower.includes("config")) {
    message = "AURA styling is not configured correctly yet.";
  } else if (lower.includes("unavailable") || lower.includes("network") || lower.includes("timeout")) {
    message = "AURA couldn't reach the styling service. Check your connection and try again.";
  } else if (
    lower.includes("vector") ||
    lower.includes("langgraph") ||
    lower.includes("raw openai") ||
    lower.includes("function error")
  ) {
    message = getAuraFriendlyErrorMessage(error);
  }

  return new AuraAgentClientError(message, {
    code,
    originalMessage: originalMessage || message,
    details,
    callableName: AURA_AGENT_CALLABLE_NAME,
    region: AURA_AGENT_FUNCTIONS_REGION,
    cause: error,
  });
}

export function buildAuraAgentFallbackMessage(error?: unknown) {
  if (!error) return AURA_AGENT_FALLBACK_MESSAGE;
  const normalized = normalizeAuraAgentError(error);
  return normalized.code === "auth/unauthenticated" || normalized.message === AURA_AGENT_SIGN_IN_MESSAGE
    ? AURA_AGENT_SIGN_IN_MESSAGE
    : AURA_AGENT_FALLBACK_MESSAGE;
}

function isAuraAgentResponse(value: unknown): value is AuraAgentResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.mode === "string" &&
    typeof candidate.message === "string" &&
    candidate.intent !== null &&
    typeof candidate.intent === "object" &&
    Array.isArray(candidate.suggestedActions) &&
    (candidate.outfits === undefined || Array.isArray(candidate.outfits))
  );
}

function createAuraAgentTimeoutError(
  timeoutMs: number,
  user?: { uid?: string | null } | null,
  callableName = AURA_AGENT_CALLABLE_NAME,
) {
  return new AuraAgentClientError(AURA_AGENT_FALLBACK_MESSAGE, {
    code: "functions/deadline-exceeded",
    originalMessage: `${callableName} timed out after ${timeoutMs}ms.`,
    details: {
      timeoutMs,
      ...debugContext(user),
      callableName,
    },
    callableName,
    region: AURA_AGENT_FUNCTIONS_REGION,
  });
}

function withAuraAgentTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  user?: { uid?: string | null } | null,
  callableName = AURA_AGENT_CALLABLE_NAME,
) {
  return withTimeout(promise, timeoutMs, callableName).catch((error) => {
    if (isAuraHardeningTimeoutError(error)) {
      const timeoutError = createAuraAgentTimeoutError(timeoutMs, user, callableName);
      devAgentLog("timeout", {
        code: timeoutError.code ?? null,
        message: timeoutError.message,
        originalMessage: timeoutError.originalMessage,
        details: timeoutError.details,
        ...debugContext(user),
      });
      throw timeoutError;
    }
    throw error;
  });
}

export async function runAuraStylingAgentClient(
  input: AuraAgentRequest,
  options: RunAuraStylingAgentOptions = {},
): Promise<AuraAgentResponse> {
  const user = auth.currentUser;
  if (!user) {
    const authError = new AuraAgentClientError(AURA_AGENT_SIGN_IN_MESSAGE, {
      code: "auth/unauthenticated",
      originalMessage: "No authenticated Firebase user.",
      details: debugContext(null),
      callableName: AURA_AGENT_CALLABLE_NAME,
      region: AURA_AGENT_FUNCTIONS_REGION,
    });
    devAgentLog("error", {
      code: authError.code ?? null,
      message: authError.message,
      originalMessage: authError.originalMessage,
      details: authError.details,
      ...debugContext(null),
    });
    throw authError;
  }

  const payload = buildAuraAgentCallablePayload(input);
  const timeoutMs = Math.max(1, options.timeoutMs ?? AURA_AGENT_DEFAULT_TIMEOUT_MS);
  devAgentLog("request payload", {
    payload,
    timeoutMs,
    ...debugContext(user),
  });

  try {
    const functions = getFunctions(app, AURA_AGENT_FUNCTIONS_REGION);
    const callable = httpsCallable<AuraAgentRequest, AuraAgentResponse>(
      functions,
      AURA_AGENT_CALLABLE_NAME,
    );
    const result = await withAuraAgentTimeout(callable(payload), timeoutMs, user, AURA_AGENT_CALLABLE_NAME);
    if (!isAuraAgentResponse(result.data)) {
      throw new AuraAgentClientError(AURA_AGENT_FALLBACK_MESSAGE, {
        code: "aura-agent/empty-response",
        originalMessage: `${AURA_AGENT_CALLABLE_NAME} returned an empty or invalid response.`,
        details: {
          responseType: typeof result.data,
          responseKeys:
            result.data && typeof result.data === "object"
              ? Object.keys(result.data as Record<string, unknown>)
              : [],
          ...debugContext(user),
        },
        callableName: AURA_AGENT_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
      });
    }
    const response = sanitizeAuraAgentPayload({
      ...result.data,
      requestedCount: payload.count,
    });
    devAgentLog("success", {
      mode: response.mode,
      outfitCount: response.outfits?.length ?? 0,
      hasFeedback: !!response.feedback,
      ...debugContext(user),
    });
    return response;
  } catch (error) {
    const normalized = normalizeAuraAgentError(error);
    devAgentLog("error", {
      ...debugContext(user),
      code: normalized.code ?? null,
      message: normalized.message,
      originalMessage: normalized.originalMessage,
      details: normalized.details,
      callableName: normalized.callableName ?? AURA_AGENT_CALLABLE_NAME,
      region: normalized.region ?? AURA_AGENT_FUNCTIONS_REGION,
    });
    throw normalized;
  }
}

function assertAuraAgentAuth(callableName: string) {
  const user = auth.currentUser;
  if (user) return user;
  const authError = new AuraAgentClientError(AURA_AGENT_SIGN_IN_MESSAGE, {
    code: "auth/unauthenticated",
    originalMessage: "No authenticated Firebase user.",
    details: debugContext(null),
    callableName,
    region: AURA_AGENT_FUNCTIONS_REGION,
  });
  devAgentLog("error", {
    code: authError.code ?? null,
    message: authError.message,
    originalMessage: authError.originalMessage,
    details: authError.details,
    ...debugContext(null),
  });
  throw authError;
}

function buildAuraAgentOutfitActionPayload(
  input:
    | SaveAuraAgentOutfitInput
    | LogAuraAgentOutfitWearInput
    | PlanAuraAgentOutfitInput
    | DislikeAuraAgentOutfitInput,
) {
  return sanitizeAuraAgentActionPayload({
    outfit: input.outfit,
    query: input.query ? cleanText(input.query, 500) : undefined,
    agentRunId: input.agentRunId ? cleanText(input.agentRunId, 180) : undefined,
    sourceMessageId: input.sourceMessageId ? cleanText(input.sourceMessageId, 180) : undefined,
    dateKey: input.dateKey ? cleanText(input.dateKey, 40) : undefined,
    weatherContext: input.weatherContext,
    reasonText: "reasonText" in input && input.reasonText ? cleanText(input.reasonText, 500) : undefined,
    wornAt: "wornAt" in input && input.wornAt
      ? input.wornAt instanceof Date
        ? input.wornAt.toISOString()
        : cleanText(input.wornAt, 80)
      : undefined,
  });
}

function isSaveAuraAgentOutfitResult(value: unknown): value is SaveAuraAgentOutfitResult {
  const candidate = value as Partial<SaveAuraAgentOutfitResult> | null;
  return !!candidate && candidate.saved === true && typeof candidate.savedOutfitId === "string";
}

function isLogAuraAgentOutfitWearResult(value: unknown): value is LogAuraAgentOutfitWearResult {
  const candidate = value as Partial<LogAuraAgentOutfitWearResult> | null;
  return !!candidate && candidate.logged === true && typeof candidate.wearEventId === "string";
}

function isPlanAuraAgentOutfitResult(value: unknown): value is PlanAuraAgentOutfitResult {
  const candidate = value as Partial<PlanAuraAgentOutfitResult> | null;
  return !!candidate && candidate.planned === true && typeof candidate.eventId === "string";
}

function isDislikeAuraAgentOutfitResult(value: unknown): value is DislikeAuraAgentOutfitResult {
  const candidate = value as Partial<DislikeAuraAgentOutfitResult> | null;
  return !!candidate && candidate.disliked === true && typeof candidate.dislikedOutfitId === "string";
}

export async function saveAuraAgentOutfitClient(
  input: SaveAuraAgentOutfitInput,
  options: RunAuraStylingAgentOptions = {},
): Promise<SaveAuraAgentOutfitResult> {
  const user = assertAuraAgentAuth(AURA_AGENT_SAVE_OUTFIT_CALLABLE_NAME);
  const payload = buildAuraAgentOutfitActionPayload(input);
  const timeoutMs = Math.max(1, options.timeoutMs ?? AURA_AGENT_ACTION_TIMEOUT_MS);
  devAgentLog("save outfit request payload", { payload, timeoutMs, ...debugContext(user) });
  try {
    const functions = getFunctions(app, AURA_AGENT_FUNCTIONS_REGION);
    const callable = httpsCallable<typeof payload, SaveAuraAgentOutfitResult>(
      functions,
      AURA_AGENT_SAVE_OUTFIT_CALLABLE_NAME,
    );
    const result = await withAuraAgentTimeout(callable(payload), timeoutMs, user, AURA_AGENT_SAVE_OUTFIT_CALLABLE_NAME);
    if (!isSaveAuraAgentOutfitResult(result.data)) {
      throw new AuraAgentClientError("I couldn’t save that right now. Try again.", {
        code: "aura-agent/invalid-save-response",
        originalMessage: `${AURA_AGENT_SAVE_OUTFIT_CALLABLE_NAME} returned an invalid response.`,
        callableName: AURA_AGENT_SAVE_OUTFIT_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
      });
    }
    return sanitizeAuraAgentPayload(result.data);
  } catch (error) {
    const normalized = normalizeAuraAgentError(error);
    throw new AuraAgentClientError(
      normalized.message === AURA_AGENT_SIGN_IN_MESSAGE
        ? normalized.message
        : "I couldn’t save that right now. Try again.",
      {
        code: normalized.code,
        originalMessage: normalized.originalMessage,
        details: normalized.details,
        callableName: AURA_AGENT_SAVE_OUTFIT_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
        cause: error,
      },
    );
  }
}

export async function logAuraAgentOutfitWearClient(
  input: LogAuraAgentOutfitWearInput,
  options: RunAuraStylingAgentOptions = {},
): Promise<LogAuraAgentOutfitWearResult> {
  const user = assertAuraAgentAuth(AURA_AGENT_LOG_WEAR_CALLABLE_NAME);
  const payload = buildAuraAgentOutfitActionPayload(input);
  const timeoutMs = Math.max(1, options.timeoutMs ?? AURA_AGENT_ACTION_TIMEOUT_MS);
  devAgentLog("log wear request payload", { payload, timeoutMs, ...debugContext(user) });
  try {
    const functions = getFunctions(app, AURA_AGENT_FUNCTIONS_REGION);
    const callable = httpsCallable<typeof payload, LogAuraAgentOutfitWearResult>(
      functions,
      AURA_AGENT_LOG_WEAR_CALLABLE_NAME,
    );
    const result = await withAuraAgentTimeout(callable(payload), timeoutMs, user, AURA_AGENT_LOG_WEAR_CALLABLE_NAME);
    if (!isLogAuraAgentOutfitWearResult(result.data)) {
      throw new AuraAgentClientError("I couldn’t record that feedback. Try again.", {
        code: "aura-agent/invalid-wear-response",
        originalMessage: `${AURA_AGENT_LOG_WEAR_CALLABLE_NAME} returned an invalid response.`,
        callableName: AURA_AGENT_LOG_WEAR_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
      });
    }
    return sanitizeAuraAgentPayload(result.data);
  } catch (error) {
    const normalized = normalizeAuraAgentError(error);
    throw new AuraAgentClientError(
      normalized.message === AURA_AGENT_SIGN_IN_MESSAGE
        ? normalized.message
        : "I couldn’t record that feedback. Try again.",
      {
        code: normalized.code,
        originalMessage: normalized.originalMessage,
        details: normalized.details,
        callableName: AURA_AGENT_LOG_WEAR_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
        cause: error,
      },
    );
  }
}

export async function planAuraAgentOutfitClient(
  input: PlanAuraAgentOutfitInput,
  options: RunAuraStylingAgentOptions = {},
): Promise<PlanAuraAgentOutfitResult> {
  const user = assertAuraAgentAuth(AURA_AGENT_PLAN_OUTFIT_CALLABLE_NAME);
  const payload = buildAuraAgentOutfitActionPayload(input);
  const timeoutMs = Math.max(1, options.timeoutMs ?? AURA_AGENT_ACTION_TIMEOUT_MS);
  devAgentLog("plan outfit request payload", { payload, timeoutMs, ...debugContext(user) });
  try {
    const functions = getFunctions(app, AURA_AGENT_FUNCTIONS_REGION);
    const callable = httpsCallable<typeof payload, PlanAuraAgentOutfitResult>(
      functions,
      AURA_AGENT_PLAN_OUTFIT_CALLABLE_NAME,
    );
    const result = await withAuraAgentTimeout(callable(payload), timeoutMs, user, AURA_AGENT_PLAN_OUTFIT_CALLABLE_NAME);
    if (!isPlanAuraAgentOutfitResult(result.data)) {
      throw new AuraAgentClientError("I couldn’t plan that right now. Try again.", {
        code: "aura-agent/invalid-plan-response",
        originalMessage: `${AURA_AGENT_PLAN_OUTFIT_CALLABLE_NAME} returned an invalid response.`,
        callableName: AURA_AGENT_PLAN_OUTFIT_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
      });
    }
    return sanitizeAuraAgentPayload(result.data);
  } catch (error) {
    const normalized = normalizeAuraAgentError(error);
    throw new AuraAgentClientError(
      normalized.message === AURA_AGENT_SIGN_IN_MESSAGE
        ? normalized.message
        : "I couldn’t plan that right now. Try again.",
      {
        code: normalized.code,
        originalMessage: normalized.originalMessage,
        details: normalized.details,
        callableName: AURA_AGENT_PLAN_OUTFIT_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
        cause: error,
      },
    );
  }
}

export async function dislikeAuraAgentOutfitClient(
  input: DislikeAuraAgentOutfitInput,
  options: RunAuraStylingAgentOptions = {},
): Promise<DislikeAuraAgentOutfitResult> {
  const user = assertAuraAgentAuth(AURA_AGENT_DISLIKE_OUTFIT_CALLABLE_NAME);
  const payload = buildAuraAgentOutfitActionPayload(input);
  const timeoutMs = Math.max(1, options.timeoutMs ?? AURA_AGENT_ACTION_TIMEOUT_MS);
  devAgentLog("dislike outfit request payload", { payload, timeoutMs, ...debugContext(user) });
  try {
    const functions = getFunctions(app, AURA_AGENT_FUNCTIONS_REGION);
    const callable = httpsCallable<typeof payload, DislikeAuraAgentOutfitResult>(
      functions,
      AURA_AGENT_DISLIKE_OUTFIT_CALLABLE_NAME,
    );
    const result = await withAuraAgentTimeout(callable(payload), timeoutMs, user, AURA_AGENT_DISLIKE_OUTFIT_CALLABLE_NAME);
    if (!isDislikeAuraAgentOutfitResult(result.data)) {
      throw new AuraAgentClientError("I couldn’t record that feedback. Try again.", {
        code: "aura-agent/invalid-dislike-response",
        originalMessage: `${AURA_AGENT_DISLIKE_OUTFIT_CALLABLE_NAME} returned an invalid response.`,
        callableName: AURA_AGENT_DISLIKE_OUTFIT_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
      });
    }
    return sanitizeAuraAgentPayload(result.data);
  } catch (error) {
    const normalized = normalizeAuraAgentError(error);
    throw new AuraAgentClientError(
      normalized.message === AURA_AGENT_SIGN_IN_MESSAGE
        ? normalized.message
        : "I couldn’t record that feedback. Try again.",
      {
        code: normalized.code,
        originalMessage: normalized.originalMessage,
        details: normalized.details,
        callableName: AURA_AGENT_DISLIKE_OUTFIT_CALLABLE_NAME,
        region: AURA_AGENT_FUNCTIONS_REGION,
        cause: error,
      },
    );
  }
}

export function isAuraAgentMode(value: unknown): value is AuraAgentRequestMode {
  return VALID_MODES.has(cleanText(value, 40).toLowerCase() as AuraAgentRequestMode);
}

export function isAuraAgentFeedbackType(value: unknown): value is AuraAgentFeedbackType {
  return VALID_FEEDBACK_TYPES.has(cleanText(value, 40).toLowerCase() as AuraAgentFeedbackType);
}
