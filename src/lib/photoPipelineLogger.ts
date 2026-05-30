export type PhotoPipelineStatus = "start" | "success" | "failure" | "fallback" | "skip";

export type PhotoPipelineLogEvent = {
  traceId: string;
  step: string;
  status: PhotoPipelineStatus;
  durationMs?: number | null;
  data?: Record<string, unknown>;
  at: number;
};

export type PhotoPipelineLogSink = (event: PhotoPipelineLogEvent) => void;

export function createPhotoPipelineTraceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function photoPipelineNow() {
  return Date.now();
}

export function photoPipelineDuration(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

const PHOTO_PIPELINE_DEBUG =
  __DEV__ &&
  (process.env.EXPO_PUBLIC_AURA_DEBUG_PHOTO_PIPELINE === "true" ||
    process.env.EXPO_PUBLIC_AURA_DEBUG_IMAGES === "true" ||
    process.env.EXPO_PUBLIC_AURA_DEBUG === "1" ||
    (globalThis as any).AURA_DEBUG_PHOTO_PIPELINE === true ||
    (globalThis as any).AURA_DEBUG_IMAGES === true);

export function safeUriType(uri?: string | null) {
  const value = String(uri ?? "").trim();
  if (!value) return "empty";
  if (value.startsWith("file://")) return "file";
  if (value.startsWith("ph://")) return "photo_library";
  if (value.startsWith("assets-library://")) return "asset_library";
  if (value.startsWith("content://")) return "content";
  if (/^https?:\/\//i.test(value)) return "remote";
  if (value.startsWith("data:")) return "data";
  if (value.startsWith("/")) return "local_path";
  return "unknown";
}

const IMPORTANT_PHOTO_PIPELINE_STEPS = new Set([
  "photo_selected",
  "local_image_normalized",
  "refined_image_received",
  "refined_local_rehydrate",
  "refined_image_download",
  "cutout_input_selected",
  "vision_start",
  "vision_success",
  "vision_failure",
  "final_image_selected",
  "extraction_partial_success",
  "brand_defaulted_unbranded",
]);

function shouldEmitPhotoPipelineEvent(step: string, status: PhotoPipelineStatus) {
  return (
    IMPORTANT_PHOTO_PIPELINE_STEPS.has(step) ||
    status === "failure" ||
    status === "fallback"
  );
}

export function safeErrorData(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error ?? "Unknown error"),
  };
}

export function summarizeImageQuality(quality: unknown) {
  const input = quality as Record<string, unknown> | null | undefined;
  if (!input || typeof input !== "object") return null;
  return {
    aestheticScore: numberOrNull(input.aestheticScore),
    lightingQuality: numberOrNull(input.lightingQuality),
    clutterLevel: numberOrNull(input.clutterLevel),
    wrinkleLevel: numberOrNull(input.wrinkleLevel),
    cropQuality: numberOrNull(input.cropQuality),
    visibilityCompleteness: numberOrNull(input.visibilityCompleteness),
    humanVisible: input.humanVisible === true,
    hangerVisible: input.hangerVisible === true,
    surfaceVisible: input.surfaceVisible === true,
    needsRefinement: input.needsRefinement === true,
    refinementReasonCount: Array.isArray(input.refinementReason) ? input.refinementReason.length : 0,
  };
}

function numberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeValue(key: string, value: unknown): unknown {
  const lowerKey = key.toLowerCase();
  if (value == null) return value;
  if (
    lowerKey.includes("uritype") ||
    lowerKey.includes("urltype") ||
    lowerKey.includes("pathhint") ||
    lowerKey.includes("fileexists") ||
    lowerKey.includes("bytesize")
  ) {
    return value;
  }
  if (lowerKey.includes("prompt") || lowerKey.includes("base64") || lowerKey.includes("uid")) {
    return "[redacted]";
  }
  if (typeof value === "string") {
    if (lowerKey.includes("url")) return { present: value.length > 0 };
    if (lowerKey.includes("uri")) return { type: safeUriType(value), present: value.length > 0 };
    if (value.length > 220) return `${value.slice(0, 217)}...`;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) =>
      typeof item === "object" && item !== null ? sanitizeObject(item as Record<string, unknown>) : item
    );
  }
  if (typeof value === "object") {
    return sanitizeObject(value as Record<string, unknown>);
  }
  return value;
}

function sanitizeObject(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, sanitizeValue(key, value)])
  );
}

export function logPhotoPipeline(event: {
  traceId?: string | null;
  step: string;
  status: PhotoPipelineStatus;
  durationMs?: number | null;
  data?: Record<string, unknown>;
  sink?: PhotoPipelineLogSink | null;
}) {
  const traceId = String(event.traceId ?? "").trim();
  if (!traceId || !PHOTO_PIPELINE_DEBUG) return null;
  if (!shouldEmitPhotoPipelineEvent(event.step, event.status)) return null;
  const logEvent: PhotoPipelineLogEvent = {
    traceId,
    step: event.step,
    status: event.status,
    durationMs: event.durationMs ?? null,
    data: sanitizeObject(event.data ?? {}),
    at: Date.now(),
  };
  const durationPart =
    typeof logEvent.durationMs === "number" ? ` durationMs=${logEvent.durationMs}` : "";
  console.log(
    `[AURA PhotoPipeline] trace=${logEvent.traceId} step=${logEvent.step} status=${logEvent.status}${durationPart} data=${JSON.stringify(logEvent.data ?? {})}`
  );
  event.sink?.(logEvent);
  return logEvent;
}

export function formatPhotoPipelineSummaryLine(event: PhotoPipelineLogEvent) {
  const duration =
    typeof event.durationMs === "number" ? ` durationMs=${event.durationMs}` : "";
  const data =
    event.data && Object.keys(event.data).length ? ` data=${JSON.stringify(event.data)}` : "";
  return `${new Date(event.at).toISOString()} trace=${event.traceId} step=${event.step} status=${event.status}${duration}${data}`;
}
