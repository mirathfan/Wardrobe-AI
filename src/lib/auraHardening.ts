export const AURA_HARDENING_LOG_PREFIX = "[AURA_HARDENING]";
export const AURA_AGENT_TIMEOUT_MS = 45_000;
export const AURA_AGENT_ACTION_TIMEOUT_MS = 20_000;
export const AURA_HARDENING_FRIENDLY_ERROR = "I couldn’t complete that right now. Try again.";

export const AURA_CLIENT_PRIVATE_PAYLOAD_KEYS = new Set([
  "embeddingVector",
  "embeddingRaw",
  "_values",
  "vector",
  "rawVector",
  "queryVector",
  "rawOpenAIResponse",
  "rawOpenAiResponse",
  "rawLangGraphState",
  "rawLangGraphResponse",
  "rawResponse",
  "openAIResponse",
  "openAiResponse",
]);

const SECRET_KEY_PATTERN = /(^|_|\b)(apiKey|authToken|accessToken|refreshToken|idToken|secret)(_|$|\b)/i;

export class AuraHardeningTimeoutError extends Error {
  code = "aura/timeout";
  label: string;
  timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms.`);
    this.name = "AuraHardeningTimeoutError";
    this.label = label;
    this.timeoutMs = timeoutMs;
  }
}

export function isAuraHardeningTimeoutError(error: unknown): error is AuraHardeningTimeoutError {
  return error instanceof AuraHardeningTimeoutError ||
    ((error as { code?: unknown })?.code === "aura/timeout" &&
      typeof (error as { timeoutMs?: unknown })?.timeoutMs === "number");
}

function shouldDropKey(
  key: string,
  options: {
    includeDiagnostics?: boolean;
    includeScoreBreakdown?: boolean;
    dropAiMetadata?: boolean;
  },
) {
  if (AURA_CLIENT_PRIVATE_PAYLOAD_KEYS.has(key)) return true;
  if (SECRET_KEY_PATTERN.test(key)) return true;
  if (!options.includeDiagnostics && key === "diagnostics") return true;
  if (!options.includeScoreBreakdown && key === "scoreBreakdown") return true;
  if (options.dropAiMetadata !== false && key === "aiMetadata") return true;
  return false;
}

export function sanitizeAuraClientPayload<T>(
  value: T,
  options: {
    includeDiagnostics?: boolean;
    includeScoreBreakdown?: boolean;
    dropAiMetadata?: boolean;
  } = {},
): T {
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeAuraClientPayload(entry, options))
      .filter((entry) => entry !== undefined) as T;
  }
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined || shouldDropKey(key, options)) continue;
    output[key] = sanitizeAuraClientPayload(entry, options);
  }
  return output as T;
}

export function containsAuraPrivatePayloadKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsAuraPrivatePayloadKeys);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) => (
    AURA_CLIENT_PRIVATE_PAYLOAD_KEYS.has(key) ||
    key === "diagnostics" ||
    key === "scoreBreakdown" ||
    key === "aiMetadata" ||
    SECRET_KEY_PATTERN.test(key) ||
    containsAuraPrivatePayloadKeys(entry)
  ));
}

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const safeTimeoutMs = Math.max(1, Math.round(timeoutMs));
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new AuraHardeningTimeoutError(label, safeTimeoutMs));
    }, safeTimeoutMs);

    promise.then(
      (value) => {
        if (timeoutId) clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export async function runWithLoadingCleanup<T>({
  run,
  setLoading,
  cleanup,
}: {
  run: () => Promise<T>;
  setLoading: (loading: boolean) => void;
  cleanup?: () => void;
}) {
  setLoading(true);
  try {
    return await run();
  } finally {
    setLoading(false);
    cleanup?.();
  }
}

export function getAuraFriendlyErrorMessage(error: unknown) {
  const candidate = error as { code?: unknown; message?: unknown };
  const message = error instanceof Error
    ? error.message
    : typeof candidate?.message === "string"
      ? candidate.message
      : String(error ?? "");
  const lower = `${typeof candidate?.code === "string" ? candidate.code : ""} ${message}`.toLowerCase();
  if (lower.includes("auth") || lower.includes("unauthenticated") || lower.includes("permission")) {
    return "Please sign in again to use AURA.";
  }
  if (lower.includes("not enough") || lower.includes("minimum closet")) {
    return "I need a few more closet items to style this.";
  }
  return AURA_HARDENING_FRIENDLY_ERROR;
}

export function assertAuraUserPathSegment(value: string, label = "path segment") {
  const segment = String(value ?? "").trim();
  if (!segment || segment.includes("/") || segment === "." || segment === "..") {
    throw new Error(`Invalid AURA ${label}.`);
  }
  return segment;
}

export function auraUserScopedPath(uid: string, ...segments: string[]) {
  const safeUid = assertAuraUserPathSegment(uid, "user id");
  const safeSegments = segments.map((segment, index) =>
    assertAuraUserPathSegment(segment, `path segment ${index + 1}`),
  );
  return ["users", safeUid, ...safeSegments].join("/");
}
