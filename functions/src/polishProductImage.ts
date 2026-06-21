import { randomUUID } from "node:crypto";

import { getStorage } from "firebase-admin/storage";
import { logger, setLogContext, tracedHandler } from "./shared/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import OpenAI, { toFile } from "openai";

import { requireOpenAiApiKey } from "./shared/env";
import {
  RATE_LIMITS,
  assertFunctionRateLimit,
  redactUid,
} from "./shared/rateLimit";
import {
  EARLY_ACCESS_ERRORS,
  checkAndConsumeEarlyAccessUse,
  getCachedEarlyAccessResult,
  getEarlyAccessFeatureState,
  makeEarlyAccessImageHash,
  normalizeEarlyAccessImageHash,
  setCachedEarlyAccessResult,
} from "./shared/earlyAccess";
import { safeFetch } from "./shared/safeFetch";

type ProductImageQuality = {
  aestheticScore: number;
  lightingQuality: number;
  clutterLevel: number;
  wrinkleLevel: number;
  cropQuality: number;
  visibilityCompleteness: number;
  humanVisible: boolean;
  hangerVisible: boolean;
  surfaceVisible: boolean;
  needsRefinement: boolean;
  refinementReason: string[];
};

type ImageInput = {
  bytes: Buffer;
  contentType: string;
  sourceStoragePath: string | null;
};

const QUALITY_MODEL = "gpt-5.4-mini";
const IMAGE_MODEL = "gpt-image-1";
const PRODUCT_POLISH_MODEL_VERSION = `product-polish:${QUALITY_MODEL}:${IMAGE_MODEL}:v1`;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const BASE_REFINEMENT_PROMPT =
  "Transform this clothing photo into a clean premium ecommerce product image. Preserve the exact garment, color, print, logo, typography, fabric texture, stitching, seams, silhouette, and proportions. Do not redesign the garment. Do not add new branding. Do not change the fit or structure. Remove distracting background elements, improve lighting and contrast, center and straighten the garment, reduce only minor wrinkles, and create a clean catalog-style presentation. Output a realistic single garment image suitable for a digital wardrobe.";

function cleanTraceId(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80) || "missing";
}

function durationMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function safeError(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error ?? "Unknown error"),
  };
}

function qualitySummary(quality: ProductImageQuality) {
  return {
    aestheticScore: quality.aestheticScore,
    lightingQuality: quality.lightingQuality,
    clutterLevel: quality.clutterLevel,
    wrinkleLevel: quality.wrinkleLevel,
    cropQuality: quality.cropQuality,
    visibilityCompleteness: quality.visibilityCompleteness,
    humanVisible: quality.humanVisible,
    hangerVisible: quality.hangerVisible,
    surfaceVisible: quality.surfaceVisible,
    needsRefinement: quality.needsRefinement,
    refinementReasonCount: quality.refinementReason.length,
  };
}

function logBackendPipeline(params: {
  traceId: string;
  step: string;
  status: "start" | "success" | "failure" | "fallback" | "skip";
  data?: Record<string, unknown>;
  durationMs?: number | null;
}) {
  const data = params.data ?? {};
  const durationPart =
    typeof params.durationMs === "number" ? ` durationMs=${params.durationMs}` : "";
  logger.info(
    `[polishProductImage] trace=${params.traceId} step=${params.step} status=${params.status}${durationPart} data=${JSON.stringify(data)}`,
    {
      traceId: params.traceId,
      step: params.step,
      status: params.status,
      durationMs: params.durationMs ?? null,
      data,
    },
  );
}

function clamp01(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function cleanStoragePath(value: unknown) {
  const path = String(value ?? "").trim().replace(/^\/+/, "");
  if (!path || path.includes("..")) return null;
  return path;
}

function isUserOwnedStoragePath(uid: string, storagePath: string | null) {
  return !!storagePath && storagePath.startsWith(`users/${uid}/`);
}

function extractStoragePathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex === -1) return null;
      return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    }
    if (parsed.hostname.endsWith(".appspot.com") || parsed.hostname.endsWith(".firebasestorage.app")) {
      const path = parsed.pathname.replace(/^\/+/, "");
      return path ? decodeURIComponent(path) : null;
    }
    return null;
  } catch {
    return null;
  }
}

function inferContentType(contentType: string | null | undefined) {
  const value = String(contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return value.startsWith("image/") ? value : "image/jpeg";
}

async function readImageInput(uid: string, data: Record<string, unknown>, traceId: string): Promise<ImageInput> {
  const startedAt = Date.now();
  logBackendPipeline({
    traceId,
    step: "input_validated",
    status: "start",
    data: {
      hasImageUrl: !!String(data.imageUrl ?? "").trim(),
      hasStoragePath: !!String(data.storagePath ?? "").trim(),
    },
  });
  const requestStoragePath = cleanStoragePath(data.storagePath);
  const imageUrl = String(data.imageUrl ?? "").trim();
  const urlStoragePath = imageUrl ? extractStoragePathFromUrl(imageUrl) : null;
  const storagePath = requestStoragePath ?? urlStoragePath;

  if (storagePath) {
    if (!isUserOwnedStoragePath(uid, storagePath)) {
      logBackendPipeline({
        traceId,
        step: "input_validated",
        status: "failure",
        durationMs: durationMs(startedAt),
        data: { reason: "storage_path_not_user_owned", hasStoragePath: true },
      });
      throw new HttpsError("permission-denied", "Image must belong to the signed-in user.");
    }
    const file = getStorage().bucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    const sizeBytes = Number(metadata.size ?? 0);
    const contentType = inferContentType(metadata.contentType);
    if (!contentType.startsWith("image/")) {
      logBackendPipeline({
        traceId,
        step: "input_validated",
        status: "failure",
        durationMs: durationMs(startedAt),
        data: { reason: "unsupported_content_type", contentType },
      });
      throw new HttpsError("invalid-argument", "Image cleanup needs an image file.");
    }
    if (Number.isFinite(sizeBytes) && sizeBytes > MAX_IMAGE_BYTES) {
      logBackendPipeline({
        traceId,
        step: "input_validated",
        status: "failure",
        durationMs: durationMs(startedAt),
        data: { reason: "image_too_large", sizeBytes },
      });
      throw new HttpsError("invalid-argument", "Image is too large for cleanup.");
    }
    logBackendPipeline({
      traceId,
      step: "input_validated",
      status: "success",
      durationMs: durationMs(startedAt),
      data: {
        inputSource: "storage",
        storagePath,
        contentType,
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      },
    });
    const fetchStartedAt = Date.now();
    logBackendPipeline({
      traceId,
      step: "source_image_fetched",
      status: "start",
      data: { inputSource: "storage", storagePath },
    });
    const [bytes] = await file.download();
    if (bytes.length > MAX_IMAGE_BYTES) {
      logBackendPipeline({
        traceId,
        step: "source_image_fetched",
        status: "failure",
        durationMs: durationMs(fetchStartedAt),
        data: { reason: "downloaded_image_too_large", byteLength: bytes.length },
      });
      throw new HttpsError("invalid-argument", "Image is too large for cleanup.");
    }
    logBackendPipeline({
      traceId,
      step: "source_image_fetched",
      status: "success",
      durationMs: durationMs(fetchStartedAt),
      data: { inputSource: "storage", byteLength: bytes.length, contentType },
    });
    return { bytes, contentType, sourceStoragePath: storagePath };
  }

  if (!imageUrl) {
    logBackendPipeline({
      traceId,
      step: "input_validated",
      status: "failure",
      durationMs: durationMs(startedAt),
      data: { reason: "missing_image_input" },
    });
    throw new HttpsError("invalid-argument", "Provide imageUrl or storagePath.");
  }

  logBackendPipeline({
    traceId,
    step: "input_validated",
    status: "success",
    durationMs: durationMs(startedAt),
    data: { inputSource: "url", hasImageUrl: true },
  });
  const fetchStartedAt = Date.now();
  logBackendPipeline({
    traceId,
    step: "source_image_fetched",
    status: "start",
    data: { inputSource: "url", hasImageUrl: true },
  });
  const fetched = await safeFetch(imageUrl, {
    expectedKind: "image",
    timeoutMs: 12_000,
    maxBytes: MAX_IMAGE_BYTES,
  });
  if (!fetched.ok) {
    logBackendPipeline({
      traceId,
      step: "source_image_fetched",
      status: "failure",
      durationMs: durationMs(fetchStartedAt),
      data: { status: fetched.status, contentType: fetched.contentType },
    });
    throw new HttpsError("invalid-argument", "Could not read that image.");
  }
  logBackendPipeline({
    traceId,
    step: "source_image_fetched",
    status: "success",
    durationMs: durationMs(fetchStartedAt),
    data: {
      status: fetched.status,
      contentType: fetched.contentType,
      byteLength: fetched.bytes.length,
    },
  });
  return {
    bytes: fetched.bytes,
    contentType: inferContentType(fetched.contentType),
    sourceStoragePath: null,
  };
}

function dataUrlForImage(input: ImageInput) {
  return `data:${input.contentType};base64,${input.bytes.toString("base64")}`;
}

function normalizedReasons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function withDecisionReasons(parsed: Partial<ProductImageQuality>): ProductImageQuality {
  const reasons = new Set(normalizedReasons(parsed.refinementReason));
  const quality: ProductImageQuality = {
    aestheticScore: clamp01(parsed.aestheticScore, 1),
    lightingQuality: clamp01(parsed.lightingQuality, 1),
    clutterLevel: clamp01(parsed.clutterLevel, 0),
    wrinkleLevel: clamp01(parsed.wrinkleLevel, 0),
    cropQuality: clamp01(parsed.cropQuality, 1),
    visibilityCompleteness: clamp01(parsed.visibilityCompleteness, 1),
    humanVisible: parsed.humanVisible === true,
    hangerVisible: parsed.hangerVisible === true,
    surfaceVisible: parsed.surfaceVisible === true,
    needsRefinement: parsed.needsRefinement === true,
    refinementReason: [],
  };

  if (quality.aestheticScore < 0.72) reasons.add("low_aesthetic_score");
  if (quality.clutterLevel > 0.5) reasons.add("background_clutter");
  if (quality.lightingQuality < 0.55) reasons.add("poor_lighting");
  if (quality.cropQuality < 0.65) reasons.add("poor_crop");
  if (quality.humanVisible) reasons.add("person_visible");
  if (quality.hangerVisible) reasons.add("hanger_visible");
  if (quality.surfaceVisible) reasons.add("bed_floor_or_surface_visible");

  const needsRefinement =
    quality.needsRefinement ||
    quality.aestheticScore < 0.72 ||
    quality.clutterLevel > 0.5 ||
    quality.lightingQuality < 0.55 ||
    quality.cropQuality < 0.65 ||
    quality.humanVisible ||
    quality.hangerVisible ||
    quality.surfaceVisible;

  return {
    ...quality,
    needsRefinement,
    refinementReason: Array.from(reasons).slice(0, 8),
  };
}

function fallbackQuality(reason: string): ProductImageQuality {
  return {
    aestheticScore: 1,
    lightingQuality: 1,
    clutterLevel: 0,
    wrinkleLevel: 0,
    cropQuality: 1,
    visibilityCompleteness: 1,
    humanVisible: false,
    hangerVisible: false,
    surfaceVisible: false,
    needsRefinement: false,
    refinementReason: [reason],
  };
}

async function evaluateImageQuality(client: OpenAI, input: ImageInput) {
  const response = await client.responses.create({
    model: QUALITY_MODEL,
    input: [
      {
        role: "developer",
        content:
          "Evaluate a single-garment wardrobe upload for premium digital closet readiness. Return JSON only. Score fields from 0 to 1. Set needsRefinement when the photo is messy, dark, wrinkled, cluttered, cropped badly, on a bed/floor/surface/hanger, includes a visible person/body, or would not look like a clean ecommerce product image.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Analyze this clothing item photo. Do not identify people. Focus only on image quality, garment visibility, background clutter, lighting, crop, wrinkles, hanger/surface/person visibility, and whether Studio Clean-Up is needed.",
          },
          {
            type: "input_image",
            image_url: dataUrlForImage(input),
            detail: "low",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "product_image_quality",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            aestheticScore: { type: "number" },
            lightingQuality: { type: "number" },
            clutterLevel: { type: "number" },
            wrinkleLevel: { type: "number" },
            cropQuality: { type: "number" },
            visibilityCompleteness: { type: "number" },
            humanVisible: { type: "boolean" },
            hangerVisible: { type: "boolean" },
            surfaceVisible: { type: "boolean" },
            needsRefinement: { type: "boolean" },
            refinementReason: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "aestheticScore",
            "lightingQuality",
            "clutterLevel",
            "wrinkleLevel",
            "cropQuality",
            "visibilityCompleteness",
            "humanVisible",
            "hangerVisible",
            "surfaceVisible",
            "needsRefinement",
            "refinementReason",
          ],
        },
      },
    },
  });
  const parsed = JSON.parse(String(response.output_text || "{}")) as Partial<ProductImageQuality>;
  return withDecisionReasons(parsed);
}

function hasComplexGraphicRisk(metadata: unknown, quality: ProductImageQuality) {
  const text = JSON.stringify(metadata ?? {}).toLowerCase();
  return (
    /\b(logo|graphic|print|typography|text|monogram|embroidered|embroidery|patch)\b/.test(text) ||
    quality.refinementReason.some((reason) => /logo|graphic|text|print/i.test(reason))
  );
}

function buildRefinementPrompt(params: {
  garmentMetadata: unknown;
  conservative: boolean;
}) {
  const metadataText = JSON.stringify(params.garmentMetadata ?? {}, null, 2).slice(0, 1200);
  return [
    BASE_REFINEMENT_PROMPT,
    params.conservative
      ? "The garment may contain logos, text, graphics, or distinctive prints. Use conservative cleanup only: preserve all marks exactly and leave uncertain details unchanged."
      : "",
    `Known garment metadata, if helpful: ${metadataText || "none"}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function uploadRefinedImage(uid: string, bytes: Buffer, traceId: string) {
  const path = `users/${uid}/productPolish/refined/${Date.now()}-${randomUUID()}.jpg`;
  const bucket = getStorage().bucket();
  const token = randomUUID();
  const startedAt = Date.now();
  logBackendPipeline({
    traceId,
    step: "refined_image_uploaded",
    status: "start",
    data: { storagePath: path, byteLength: bytes.length },
  });
  try {
    await bucket.file(path).save(bytes, {
      metadata: {
        contentType: "image/jpeg",
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
      resumable: false,
    });
    const result = {
      refinedStoragePath: path,
      refinedImageUrl: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
    };
    logBackendPipeline({
      traceId,
      step: "refined_image_uploaded",
      status: "success",
      durationMs: durationMs(startedAt),
      data: { storagePath: path, hasRefinedImageUrl: !!result.refinedImageUrl },
    });
    return result;
  } catch (error) {
    logBackendPipeline({
      traceId,
      step: "refined_image_uploaded",
      status: "failure",
      durationMs: durationMs(startedAt),
      data: safeError(error),
    });
    throw error;
  }
}

async function refineImage(params: {
  client: OpenAI;
  uid: string;
  input: ImageInput;
  prompt: string;
  traceId: string;
  conservative: boolean;
  hasComplexGraphic: boolean;
}) {
  const image = await toFile(params.input.bytes, "garment.jpg", {
    type: params.input.contentType,
  });
  const startedAt = Date.now();
  logBackendPipeline({
    traceId: params.traceId,
    step: "openai_generation",
    status: "start",
    data: {
      mode: params.conservative ? "conservative" : "standard",
      hasComplexGraphic: params.hasComplexGraphic,
      model: IMAGE_MODEL,
      inputContentType: params.input.contentType,
      sourceByteLength: params.input.bytes.length,
    },
  });
  try {
    const response = await params.client.images.edit({
      model: IMAGE_MODEL,
      image,
      prompt: params.prompt,
      size: "auto",
      quality: "medium",
      input_fidelity: "high",
      output_format: "jpeg",
      output_compression: 92,
      user: params.uid,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("Image model returned no image.");
    }
    const bytes = Buffer.from(b64, "base64");
    logBackendPipeline({
      traceId: params.traceId,
      step: "openai_generation",
      status: "success",
      durationMs: durationMs(startedAt),
      data: { model: IMAGE_MODEL, outputByteLength: bytes.length },
    });
    return uploadRefinedImage(params.uid, bytes, params.traceId);
  } catch (error) {
    logBackendPipeline({
      traceId: params.traceId,
      step: "openai_generation",
      status: "failure",
      durationMs: durationMs(startedAt),
      data: safeError(error),
    });
    throw error;
  }
}

export const polishProductImage = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 120, memory: "1GiB" },
  tracedHandler(async (request) => {
    const data = (request.data ?? {}) as Record<string, unknown>;
    const traceId = cleanTraceId(data.traceId);
    const requestStartedAt = Date.now();
    logBackendPipeline({
      traceId,
      step: "callable_received",
      status: "start",
      data: {
        hasAuth: !!request.auth?.uid,
        hasImageUrl: !!String(data.imageUrl ?? "").trim(),
        hasStoragePath: !!String(data.storagePath ?? "").trim(),
        hasGarmentMetadata: !!data.garmentMetadata,
      },
    });
    const uid = request.auth?.uid;
    if (!uid) {
      logBackendPipeline({
        traceId,
        step: "auth_verified",
        status: "failure",
        data: { reason: "missing_auth" },
      });
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }
    logBackendPipeline({
      traceId,
      step: "auth_verified",
      status: "success",
      data: { hasUid: true },
    });

    const uidHash = redactUid(uid);
    setLogContext({ uidHash });
    const featureState = await getEarlyAccessFeatureState(uid, "aiPolish");
    if (!featureState.allowed) {
      throw new HttpsError("failed-precondition", EARLY_ACCESS_ERRORS.featureNotAvailable.message, {
        code: EARLY_ACCESS_ERRORS.featureNotAvailable.code,
        message: EARLY_ACCESS_ERRORS.featureNotAvailable.message,
      });
    }
    const imageUrl = String(data.imageUrl ?? "").trim();
    const garmentMetadata = data.garmentMetadata ?? null;
    const input = await readImageInput(uid, data, traceId);
    const imageHash =
      normalizeEarlyAccessImageHash(data.imageHash) ||
      normalizeEarlyAccessImageHash(data.photoHash) ||
      makeEarlyAccessImageHash(input.bytes);
    const cached = await getCachedEarlyAccessResult(uid, "aiPolish", imageHash, PRODUCT_POLISH_MODEL_VERSION);
    if (cached) {
      logBackendPipeline({
        traceId,
        step: "early_access_cache_checked",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          featureKey: "aiPolish",
          cacheHit: true,
          modelVersion: PRODUCT_POLISH_MODEL_VERSION,
        },
      });
      return cached.result;
    }
    if (featureState.remaining <= 0) {
      throw new HttpsError("failed-precondition", EARLY_ACCESS_ERRORS.limitReached.message, {
        code: EARLY_ACCESS_ERRORS.limitReached.code,
        message: EARLY_ACCESS_ERRORS.limitReached.message,
      });
    }

    const rateLimitStartedAt = Date.now();
    logBackendPipeline({
      traceId,
      step: "rate_limit_checked",
      status: "start",
      data: { endpoint: "productPolish" },
    });
    try {
      await assertFunctionRateLimit(uid, "productPolish", RATE_LIMITS.productPolish);
      logBackendPipeline({
        traceId,
        step: "rate_limit_checked",
        status: "success",
        durationMs: durationMs(rateLimitStartedAt),
        data: { endpoint: "productPolish" },
      });
    } catch (error) {
      logBackendPipeline({
        traceId,
        step: "rate_limit_checked",
        status: "failure",
        durationMs: durationMs(rateLimitStartedAt),
        data: safeError(error),
      });
      throw error;
    }

    await checkAndConsumeEarlyAccessUse(uid, "aiPolish", { runKey: imageHash });
    logBackendPipeline({
      traceId,
      step: "early_access_usage_consumed",
      status: "success",
      data: {
        featureKey: "aiPolish",
        modelVersion: PRODUCT_POLISH_MODEL_VERSION,
      },
    });

    const client = new OpenAI({ apiKey: requireOpenAiApiKey() });

    logger.info("[ProductPolish] evaluating image", {
      traceId,
      uidHash,
      sourceStoragePath: input.sourceStoragePath ? "user_storage" : null,
      hasImageUrl: !!imageUrl,
    });

    let imageQuality: ProductImageQuality;
    const qualityStartedAt = Date.now();
    try {
      logBackendPipeline({
        traceId,
        step: "quality_scoring",
        status: "start",
        data: {
          model: QUALITY_MODEL,
          contentType: input.contentType,
          sourceByteLength: input.bytes.length,
        },
      });
      imageQuality = await evaluateImageQuality(client, input);
      logBackendPipeline({
        traceId,
        step: "quality_scoring",
        status: "success",
        durationMs: durationMs(qualityStartedAt),
        data: {
          model: QUALITY_MODEL,
          imageQuality: qualitySummary(imageQuality),
        },
      });
    } catch (error) {
      logBackendPipeline({
        traceId,
        step: "quality_scoring",
        status: "failure",
        durationMs: durationMs(qualityStartedAt),
        data: safeError(error),
      });
      logger.error("[ProductPolish] quality analysis failed; continuing original", {
        traceId,
        uidHash,
        error: error instanceof Error ? error.message : String(error),
      });
      const response = {
        ok: true,
        imageQuality: fallbackQuality("analysis_failed"),
        refinementApplied: false,
        refinedImageUrl: null,
        refinedStoragePath: null,
        modelUsed: QUALITY_MODEL,
        warnings: ["product_polish_analysis_failed"],
      };
      logBackendPipeline({
        traceId,
        step: "fallback_path",
        status: "fallback",
        data: { reason: "quality_analysis_failed", refinementApplied: false },
      });
      logBackendPipeline({
        traceId,
        step: "response_returned",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          refinementApplied: false,
          hasRefinedImageUrl: false,
          warningCount: response.warnings.length,
        },
      });
      await setCachedEarlyAccessResult(
        uid,
        "aiPolish",
        imageHash,
        PRODUCT_POLISH_MODEL_VERSION,
        response,
      );
      return response;
    }

    const hasComplexGraphic = hasComplexGraphicRisk(garmentMetadata, imageQuality);
    const warnings = hasComplexGraphic
      ? ["complex_logo_text_or_graphic_preservation_risk"]
      : [];

    if (!imageQuality.needsRefinement) {
      logBackendPipeline({
        traceId,
        step: "polish_decision",
        status: "skip",
        data: {
          needsRefinement: false,
          hasComplexGraphic,
          imageQuality: qualitySummary(imageQuality),
        },
      });
      const response = {
        ok: true,
        imageQuality,
        refinementApplied: false,
        refinedImageUrl: null,
        refinedStoragePath: null,
        modelUsed: QUALITY_MODEL,
        warnings,
      };
      logBackendPipeline({
        traceId,
        step: "response_returned",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          refinementApplied: false,
          hasRefinedImageUrl: false,
          warningCount: warnings.length,
        },
      });
      await setCachedEarlyAccessResult(
        uid,
        "aiPolish",
        imageHash,
        PRODUCT_POLISH_MODEL_VERSION,
        response,
      );
      return response;
    }

    try {
      logBackendPipeline({
        traceId,
        step: "polish_decision",
        status: "success",
        data: {
          needsRefinement: true,
          hasComplexGraphic,
          mode: warnings.length > 0 ? "conservative" : "standard",
          imageQuality: qualitySummary(imageQuality),
        },
      });
      const refined = await refineImage({
        client,
        uid,
        input,
        traceId,
        conservative: warnings.length > 0,
        hasComplexGraphic,
        prompt: buildRefinementPrompt({
          garmentMetadata,
          conservative: warnings.length > 0,
        }),
      });
      logger.info("[ProductPolish] refinement applied", {
        traceId,
        uidHash,
        reasonCount: imageQuality.refinementReason.length,
        conservative: warnings.length > 0,
      });
      const response = {
        ok: true,
        imageQuality,
        refinementApplied: true,
        refinedImageUrl: refined.refinedImageUrl,
        refinedStoragePath: refined.refinedStoragePath,
        modelUsed: IMAGE_MODEL,
        warnings,
      };
      logBackendPipeline({
        traceId,
        step: "response_returned",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          refinementApplied: true,
          hasRefinedImageUrl: !!response.refinedImageUrl,
          hasRefinedStoragePath: !!response.refinedStoragePath,
          warningCount: warnings.length,
        },
      });
      await setCachedEarlyAccessResult(
        uid,
        "aiPolish",
        imageHash,
        PRODUCT_POLISH_MODEL_VERSION,
        response,
      );
      return response;
    } catch (error) {
      logger.error("[ProductPolish] refinement failed; continuing original", {
        traceId,
        uidHash,
        error: error instanceof Error ? error.message : String(error),
      });
      const response = {
        ok: true,
        imageQuality,
        refinementApplied: false,
        refinedImageUrl: null,
        refinedStoragePath: null,
        modelUsed: IMAGE_MODEL,
        warnings: [...warnings, "product_polish_refinement_failed"],
      };
      logBackendPipeline({
        traceId,
        step: "fallback_path",
        status: "fallback",
        data: {
          reason: "refinement_failed",
          refinementApplied: false,
          ...safeError(error),
        },
      });
      logBackendPipeline({
        traceId,
        step: "response_returned",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          refinementApplied: false,
          hasRefinedImageUrl: false,
          warningCount: response.warnings.length,
        },
      });
      await setCachedEarlyAccessResult(
        uid,
        "aiPolish",
        imageHash,
        PRODUCT_POLISH_MODEL_VERSION,
        response,
      );
      return response;
    }
  })
);
