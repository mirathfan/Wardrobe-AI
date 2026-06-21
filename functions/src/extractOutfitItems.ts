import { randomUUID } from "node:crypto";

import { getApps, initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { logger, setLogContext, tracedHandler } from "./shared/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { removeBackground } from "@imgly/background-removal-node";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

import { requireOpenAiApiKey } from "./shared/env";
import {
  ALLOWED_COLORS,
  Category,
  SUB_CATEGORIES,
  isValidCategorySubCategory,
} from "./shared/wardrobeTaxonomy";
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

if (!getApps().length) {
  initializeApp();
}

type GarmentCategory =
  | Category.TOP
  | Category.BOTTOM
  | Category.FOOTWEAR
  | Category.OUTERWEAR
  | Category.ACCESSORY
  | Category.ONE_PIECE;

type BoundingBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

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

type RawDetectedGarment = {
  tempId?: string | null;
  category?: string | null;
  subcategory?: string | null;
  subCategory?: string | null;
  confidence?: number | null;
  boundingBox?: Partial<BoundingBox> | null;
  bbox?: Partial<BoundingBox> | null;
  suggestedName?: string | null;
  suggestedColors?: string[] | null;
  colors?: string[] | null;
  suggestedBrand?: string | null;
  material?: string | null;
  pattern?: string | null;
  extractionWarnings?: string[] | null;
};

type RawLayoutLocatorItem = {
  locatorKey?: string | null;
  sourceTempId?: string | null;
  category?: string | null;
  subcategory?: string | null;
  name?: string | null;
  matchedLayoutItem?: string | null;
  boundingBox?: (Partial<BoundingBox> & { width?: number | null; height?: number | null }) | null;
  bbox?: (Partial<BoundingBox> & { width?: number | null; height?: number | null }) | null;
  confidence?: number | null;
  visible?: boolean | null;
  reason?: string | null;
};

type RawLayoutMetadataItem = RawLayoutLocatorItem & {
  layoutKey?: string | null;
  brand?: string | null;
  suggestedBrand?: string | null;
  isUnbranded?: boolean | null;
  colors?: string[] | null;
  suggestedColors?: string[] | null;
  materialEstimate?: string[] | null;
  material?: string | string[] | null;
  pattern?: string | null;
  fit?: string | null;
  styleAesthetic?: string[] | null;
};

type LocatedLayoutItem = {
  layoutKey: string;
  sourceTempId: string;
  category: GarmentCategory;
  subcategory: string;
  matchedLayoutItem: string;
  boundingBox: BoundingBox;
  confidence: number;
  visible: boolean;
  reason: string | null;
  suggestedName: string;
  suggestedColors: string[];
  suggestedBrand: string | null;
  isUnbranded: boolean;
  materialEstimate: string[];
  pattern: string | null;
  fit: string | null;
  styleAesthetic: string[];
};

type SourceLocatorEntry = {
  item: NormalizedDetectedGarment;
  index: number;
  categoryOrdinal: number;
  locatorKey: string;
  categoryKey: string;
};

type ExpectedLayoutGridCell = {
  sourceTempId: string;
  category: GarmentCategory;
  slot: string;
  boundingBox: BoundingBox;
};

type NormalizedDetectedGarment = {
  tempId: string;
  category: GarmentCategory;
  subcategory: string;
  confidence: number;
  boundingBox: BoundingBox;
  suggestedName: string;
  suggestedColors: string[];
  suggestedBrand: string | null;
  isUnbranded?: boolean | null;
  materialEstimate?: string[];
  material: string | null;
  pattern: string | null;
  fit?: string | null;
  styleAesthetic?: string[];
  extractionWarnings: string[];
};

type ExtractionQuality = {
  score: number;
  visibilityCompleteness: number;
  hasCleanedImageUrl: boolean;
  hasRefinedImageUrl: boolean;
  fallbackUsed: boolean;
  rawCropFallback: boolean;
  partiallyVisible: boolean;
  lowConfidence: boolean;
};

type ExtractedImageState = "cropped" | "polished" | "raw_fallback";
type OutfitImageSource = "outfit_extraction" | "outfit_layout_reconstruction";
type LayoutExtractionMethod =
  | "layout_grid_crop"
  | "layout_bbox_crop"
  | "original_crop_fallback";
type PolishSkippedReason =
  | "accessory_auto_skip"
  | "low_confidence"
  | "tiny_crop"
  | "occluded";

type ExtractedGarment = NormalizedDetectedGarment & {
  maskInfo?: {
    method: "background_removal" | "not_available";
    source: "server";
    warning?: string;
  };
  cropImageUrl: string;
  originalOutfitImageUrl?: string | null;
  originalCropUrl?: string | null;
  refinedImageUrl?: string | null;
  cleanedImageUrl?: string | null;
  normalizedImageUrl?: string | null;
  imageSource: OutfitImageSource;
  reconstructedLayoutUrl?: string | null;
  layoutCropUrl?: string | null;
  boundingBoxOnLayout?: BoundingBox | null;
  extractionMethod?: LayoutExtractionMethod;
  metadataSource?: "layout_one_shot" | null;
  reconstructionWarnings?: string[];
  selectedByDefault?: boolean;
  extractionQuality: ExtractionQuality;
  autoPolishApplied: boolean;
  userPolished: boolean;
  imageState: ExtractedImageState;
  polishAvailable: boolean;
  polishSkippedReason?: PolishSkippedReason | null;
  extractionMetadata: {
    source: "outfit_photo";
    sourceImageStoragePath?: string | null;
    cropStoragePath: string;
    refinedStoragePath?: string | null;
    cleanedStoragePath?: string | null;
    normalizedStoragePath?: string | null;
    polishApplied: boolean;
    polishWarnings: string[];
    backgroundRemovalApplied: boolean;
  };
  polishApplied: boolean;
  cutoutApplied: boolean;
  imageQuality: ProductImageQuality | null;
};

type ImageInput = {
  bytes: Buffer;
  contentType: string;
  sourceStoragePath: string | null;
};

const DETECTION_MODEL = "gpt-5.4-mini";
const QUALITY_MODEL = "gpt-5.4-mini";
const IMAGE_MODEL = "gpt-image-1";
const ACCESSORY_POLISH_MODEL_VERSION = `accessory-polish:${QUALITY_MODEL}:${IMAGE_MODEL}:v1`;
const OUTFIT_LAYOUT_MODEL_VERSION = `outfit-layout:${DETECTION_MODEL}:${IMAGE_MODEL}:v1`;
const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_DETECTED_ITEMS = 6;
const FAST_EXTRACTION_MAX_ITEMS = 4;
const MAX_AUTO_POLISHED_CORE_ITEMS = 4;
const MAX_RAW_DETECTIONS = 10;
const MAX_CROP_DIMENSION = 1400;
const MIN_ABSOLUTE_CONFIDENCE = 0.32;
const CORE_REVIEW_CONFIDENCE = 0.55;
const ACCESSORY_REVIEW_CONFIDENCE = 0.45;
const FAST_EXTRACTION_TIME_BUDGET_MS = 85_000;
const STANDARD_EXTRACTION_TIME_BUDGET_MS = 510_000;
const MIN_ITEM_START_REMAINING_MS = 30_000;
const MIN_AUTO_POLISH_CROP_AREA = 0.018;
const LAYOUT_CROP_CONFIDENCE_THRESHOLD = 0.5;

const BASE_REFINEMENT_PROMPT =
  "Create a clean premium ecommerce product image of only the detected item. Preserve the exact item color, material, design, logos, text, stitching, silhouette, and proportions. Remove the person, skin, hand, face, phone, mirror, room, floor, and background. Do not include body parts. Do not invent new branding. Do not change the item identity. Output a realistic isolated product-style image suitable for a digital wardrobe.";

function outfitExtractionModelVersion(prefs: ReturnType<typeof qualityPreferences>) {
  return [
    "outfit-extraction",
    DETECTION_MODEL,
    QUALITY_MODEL,
    IMAGE_MODEL,
    `max:${prefs.maxItems}`,
    `speed:${prefs.preferSpeed ? "1" : "0"}`,
    `skipPolish:${prefs.skipPolish ? "1" : "0"}`,
    `skipBg:${prefs.skipBackgroundRemoval ? "1" : "0"}`,
    `skipQuality:${prefs.skipQualityScoring ? "1" : "0"}`,
    "v1",
  ].join(":");
}

function cleanTraceId(value: unknown) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 80) || `outfit-${Date.now().toString(36)}`
  );
}

function cleanTempId(value: unknown) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 100) || `item-${Date.now().toString(36)}`
  );
}

function durationMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt);
}

function remainingBudgetMs(startedAt: number, budgetMs: number) {
  return Math.max(0, budgetMs - durationMs(startedAt));
}

function logOutfitExtraction(params: {
  traceId: string;
  step: string;
  status?: "start" | "success" | "failure" | "fallback" | "skip";
  data?: Record<string, unknown>;
  durationMs?: number | null;
}) {
  const status = params.status ?? "success";
  const data = params.data ?? {};
  const durationPart =
    typeof params.durationMs === "number" ? ` durationMs=${params.durationMs}` : "";
  logger.info(
    `[AURA OutfitExtraction] step=${params.step} status=${status} trace=${params.traceId}${durationPart} data=${JSON.stringify(data)}`,
    {
      traceId: params.traceId,
      step: params.step,
      status,
      durationMs: params.durationMs ?? null,
      data,
    },
  );
}

function logOutfitLayout(params: {
  traceId: string;
  step: string;
  status?: "start" | "success" | "failure" | "fallback" | "skip";
  data?: Record<string, unknown>;
  durationMs?: number | null;
}) {
  const status = params.status ?? "success";
  const data = params.data ?? {};
  const durationPart =
    typeof params.durationMs === "number" ? ` durationMs=${params.durationMs}` : "";
  logger.info(
    `[AURA OutfitLayout] step=${params.step} status=${status} trace=${params.traceId}${durationPart} data=${JSON.stringify(data)}`,
    {
      traceId: params.traceId,
      step: params.step,
      status,
      durationMs: params.durationMs ?? null,
      data,
    },
  );
}

function logGridCrop(params: {
  traceId: string;
  item?: string | null;
  category?: string | null;
  data?: Record<string, unknown>;
}) {
  const data = params.data ?? {};
  logger.info(
    `[AURA GridCrop] trace=${params.traceId} item=${params.item ?? "unknown"} category=${params.category ?? "unknown"} ${Object.entries(data)
      .map(([key, value]) => `${key}=${typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)}`)
      .join(" ")}`,
    {
      traceId: params.traceId,
      item: params.item ?? null,
      category: params.category ?? null,
      data,
    },
  );
}

function safeError(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error ?? "Unknown error"),
  };
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
    if (
      parsed.hostname.endsWith(".appspot.com") ||
      parsed.hostname.endsWith(".firebasestorage.app")
    ) {
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
  const requestStoragePath = cleanStoragePath(data.storagePath);
  const imageUrl = String(data.imageUrl ?? "").trim();
  const urlStoragePath = imageUrl ? extractStoragePathFromUrl(imageUrl) : null;
  const storagePath = requestStoragePath ?? urlStoragePath;

  logOutfitExtraction({
    traceId,
    step: "input_validated",
    status: "start",
    data: {
      hasImageUrl: !!imageUrl,
      hasStoragePath: !!storagePath,
    },
  });

  if (storagePath) {
    if (!isUserOwnedStoragePath(uid, storagePath)) {
      logOutfitExtraction({
        traceId,
        step: "input_validated",
        status: "failure",
        durationMs: durationMs(startedAt),
        data: { reason: "storage_path_not_user_owned" },
      });
      throw new HttpsError("permission-denied", "Image must belong to the signed-in user.");
    }
    const file = getStorage().bucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    const sizeBytes = Number(metadata.size ?? 0);
    const contentType = inferContentType(metadata.contentType);
    if (!contentType.startsWith("image/")) {
      throw new HttpsError("invalid-argument", "Outfit extraction needs an image file.");
    }
    if (Number.isFinite(sizeBytes) && sizeBytes > MAX_SOURCE_IMAGE_BYTES) {
      throw new HttpsError("invalid-argument", "Image is too large for outfit extraction.");
    }
    const [bytes] = await file.download();
    logOutfitExtraction({
      traceId,
      step: "input_validated",
      status: "success",
      durationMs: durationMs(startedAt),
      data: {
        inputSource: "storage",
        storagePath,
        sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : bytes.length,
        contentType,
      },
    });
    return { bytes, contentType, sourceStoragePath: storagePath };
  }

  if (!imageUrl) {
    throw new HttpsError("invalid-argument", "Provide imageUrl or storagePath.");
  }

  const fetched = await safeFetch(imageUrl, {
    expectedKind: "image",
    timeoutMs: 15_000,
    maxBytes: MAX_SOURCE_IMAGE_BYTES,
  });
  if (!fetched.ok) {
    logOutfitExtraction({
      traceId,
      step: "input_validated",
      status: "failure",
      durationMs: durationMs(startedAt),
      data: { inputSource: "url", status: fetched.status, contentType: fetched.contentType },
    });
    throw new HttpsError("invalid-argument", "Could not read that image.");
  }
  logOutfitExtraction({
    traceId,
    step: "input_validated",
    status: "success",
    durationMs: durationMs(startedAt),
    data: {
      inputSource: "url",
      byteLength: fetched.bytes.length,
      contentType: fetched.contentType,
    },
  });
  return {
    bytes: fetched.bytes,
    contentType: inferContentType(fetched.contentType),
    sourceStoragePath: null,
  };
}

function dataUrlForImage(input: Pick<ImageInput, "bytes" | "contentType">) {
  return `data:${input.contentType};base64,${input.bytes.toString("base64")}`;
}

function normalizeCategory(value: unknown): GarmentCategory | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!raw) return null;
  if (raw === "shoe" || raw === "shoes" || raw === "sneaker" || raw === "sneakers") {
    return Category.FOOTWEAR;
  }
  if (raw === "tops") return Category.TOP;
  if (raw === "bottoms") return Category.BOTTOM;
  if (raw === "accessories") return Category.ACCESSORY;
  if (raw === "onepiece") return Category.ONE_PIECE;
  if (Object.values(Category).includes(raw as Category)) return raw as GarmentCategory;
  return null;
}

function normalizeSubcategory(category: GarmentCategory, value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
  if (raw && isValidCategorySubCategory(category, raw)) return raw;
  const options = SUB_CATEGORIES[category] as readonly string[] | undefined;
  return options?.[0] ?? "";
}

function cleanText(value: unknown, maxLength = 80) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeColors(value: unknown) {
  const allowed = new Set<string>(ALLOWED_COLORS);
  if (!Array.isArray(value)) return [];
  const colors: string[] = [];
  for (const entry of value) {
    const raw = String(entry ?? "")
      .trim()
      .toLowerCase()
      .replace(/grey/g, "gray");
    const normalized = raw === "gray" ? "grey" : raw;
    const direct = Array.from(allowed).find((color) => normalized.includes(color));
    if (direct && !colors.includes(direct)) colors.push(direct);
    if (colors.length >= 3) break;
  }
  return colors;
}

function normalizeTextArray(value: unknown, maxLength = 40, maxItems = 4) {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanText(item, maxLength))
      .filter(Boolean)
      .slice(0, maxItems);
  }
  const single = cleanText(value, maxLength);
  return single ? [single] : [];
}

function normalizeWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 5);
}

function normalizeBoundingBox(
  value: (Partial<BoundingBox> & { width?: number | null; height?: number | null }) | null | undefined,
): BoundingBox | null {
  const x = clamp01(value?.x, Number.NaN);
  const y = clamp01(value?.y, Number.NaN);
  const w = clamp01(value?.w ?? value?.width, Number.NaN);
  const h = clamp01(value?.h ?? value?.height, Number.NaN);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  if (w <= 0 || h <= 0) return null;
  const clampedW = Math.min(w, 1 - x);
  const clampedH = Math.min(h, 1 - y);
  if (clampedW <= 0 || clampedH <= 0) return null;
  return { x, y, w: clampedW, h: clampedH };
}

function reviewConfidenceFor(category: GarmentCategory) {
  return category === Category.ACCESSORY || category === Category.OUTERWEAR
    ? ACCESSORY_REVIEW_CONFIDENCE
    : CORE_REVIEW_CONFIDENCE;
}

function boundingBoxArea(box: BoundingBox) {
  return Math.max(0, box.w) * Math.max(0, box.h);
}

function isTinyNoisyDetection(category: GarmentCategory, box: BoundingBox) {
  const area = boundingBoxArea(box);
  if (category === Category.ACCESSORY) return area < 0.004;
  if (category === Category.FOOTWEAR) return area < 0.008;
  return area < 0.018;
}

function categoryPriority(category: GarmentCategory) {
  if (category === Category.TOP || category === Category.ONE_PIECE) return 0;
  if (category === Category.BOTTOM) return 1;
  if (category === Category.FOOTWEAR) return 2;
  if (category === Category.OUTERWEAR) return 3;
  return 4;
}

function boxIntersectionOverUnion(a: BoundingBox, b: BoundingBox) {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(ax2, bx2);
  const y2 = Math.min(ay2, by2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = boundingBoxArea(a) + boundingBoxArea(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

function defaultNameFor(category: GarmentCategory, subcategory: string, colors: string[]) {
  const color = colors[0] ? `${colors[0]} ` : "";
  const label = subcategory || category;
  return `${color}${label.replace(/_/g, " ")}`.trim();
}

function normalizeDetectedGarments(rawItems: RawDetectedGarment[], traceId: string) {
  const normalized: NormalizedDetectedGarment[] = [];
  for (const raw of rawItems.slice(0, MAX_RAW_DETECTIONS)) {
    const category = normalizeCategory(raw.category);
    const boundingBox = normalizeBoundingBox(raw.boundingBox ?? raw.bbox);
    const confidence = clamp01(raw.confidence, 0);
    if (!category || !boundingBox || confidence < MIN_ABSOLUTE_CONFIDENCE) continue;
    if (isTinyNoisyDetection(category, boundingBox)) continue;
    const subcategory = normalizeSubcategory(category, raw.subcategory ?? raw.subCategory);
    const suggestedColors = normalizeColors(raw.suggestedColors ?? raw.colors);
    const extractionWarnings = normalizeWarnings(raw.extractionWarnings);
    if (confidence < reviewConfidenceFor(category)) {
      extractionWarnings.push("We couldn’t confidently extract this item.");
    }
    const suggestedName =
      cleanText(raw.suggestedName) ||
      defaultNameFor(category, subcategory, suggestedColors) ||
      category;
    const rawTempId = String(raw.tempId ?? "").trim();
    const explicitTempId = rawTempId ? cleanTempId(rawTempId) : `${traceId}-${normalized.length + 1}`;
    normalized.push({
      tempId: explicitTempId,
      category,
      subcategory,
      confidence,
      boundingBox,
      suggestedName,
      suggestedColors,
      suggestedBrand: cleanText(raw.suggestedBrand) || null,
      isUnbranded: !cleanText(raw.suggestedBrand),
      materialEstimate: raw.material ? [cleanText(raw.material, 40)].filter(Boolean) : [],
      material: cleanText(raw.material, 40) || null,
      pattern: cleanText(raw.pattern, 40) || null,
      fit: null,
      styleAesthetic: [],
      extractionWarnings,
    });
  }

  return normalized
    .sort((a, b) => {
      const priority = categoryPriority(a.category) - categoryPriority(b.category);
      if (priority !== 0) return priority;
      return b.confidence - a.confidence;
    })
    .reduce<NormalizedDetectedGarment[]>((items, item) => {
      const duplicate = items.some((existing) => {
        const iou = boxIntersectionOverUnion(existing.boundingBox, item.boundingBox);
        return iou > 0.82 || (iou > 0.72 && existing.category === item.category);
      });
      if (!duplicate && items.length < MAX_DETECTED_ITEMS) items.push(item);
      return items;
    }, []);
}

async function detectGarments(client: OpenAI, input: ImageInput, traceId: string) {
  const startedAt = Date.now();
  logOutfitExtraction({
    traceId,
    step: "garment_detection_started",
    status: "start",
    data: { model: DETECTION_MODEL, byteLength: input.bytes.length },
  });
  const response = await client.responses.create({
    model: DETECTION_MODEL,
    input: [
      {
        role: "developer",
        content:
          "You detect visible garments in full outfit photos for a wardrobe app. Return JSON only. Do not identify people. Do not hallucinate invisible garments. Prefer partial success: return only visible, extractable garments with normalized bounding boxes around the garment, not the whole body.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Detect up to 6 visible clothing items in this outfit photo. Prioritize tops, bottoms, and footwear first. Include outerwear and accessories only if visible enough. Ignore tiny noisy detections. If a garment is partly hidden, include it only when enough of it is visible to make a useful closet item. Bounding boxes must be normalized x,y,w,h from top-left, tight but padded enough to avoid clipping logos, text, hems, sleeves, and shoes.",
          },
          {
            type: "input_image",
            image_url: dataUrlForImage(input),
            detail: "high",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "outfit_garment_detection",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            detectedItems: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  category: {
                    type: "string",
                    enum: ["top", "bottom", "footwear", "outerwear", "accessory", "one_piece"],
                  },
                  subcategory: { type: "string" },
                  confidence: { type: "number" },
                  boundingBox: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                      w: { type: "number" },
                      h: { type: "number" },
                    },
                    required: ["x", "y", "w", "h"],
                  },
                  suggestedName: { type: "string" },
                  suggestedColors: {
                    type: "array",
                    items: { type: "string" },
                  },
                  suggestedBrand: { type: ["string", "null"] },
                  material: { type: ["string", "null"] },
                  pattern: { type: ["string", "null"] },
                  extractionWarnings: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: [
                  "category",
                  "subcategory",
                  "confidence",
                  "boundingBox",
                  "suggestedName",
                  "suggestedColors",
                  "suggestedBrand",
                  "material",
                  "pattern",
                  "extractionWarnings",
                ],
              },
            },
          },
          required: ["detectedItems"],
        },
      },
    },
  });
  const parsed = JSON.parse(String(response.output_text || "{}")) as {
    detectedItems?: RawDetectedGarment[];
  };
  const items = normalizeDetectedGarments(parsed.detectedItems ?? [], traceId);
  for (const item of items) {
    logOutfitExtraction({
      traceId,
      step: "item_detected",
      data: {
        tempId: item.tempId,
        category: item.category,
        confidence: item.confidence,
        lowConfidence: item.confidence < reviewConfidenceFor(item.category),
      },
    });
  }
  logOutfitExtraction({
    traceId,
    step: "garment_detection_started",
    status: "success",
    durationMs: durationMs(startedAt),
    data: { rawCount: parsed.detectedItems?.length ?? 0, normalizedCount: items.length },
  });
  return items;
}

function normalizeRequestDetectedItems(data: Record<string, unknown>, traceId: string) {
  if (!Array.isArray(data.detectedItems)) return [];
  return normalizeDetectedGarments(data.detectedItems as RawDetectedGarment[], traceId).slice(
    0,
    MAX_DETECTED_ITEMS,
  );
}

function layoutPromptForDetectedItems(detectedItems: NormalizedDetectedGarment[]) {
  const itemSummary = detectedItems.map((item) => ({
    tempId: item.tempId,
    category: item.category,
    subcategory: item.subcategory,
    name: item.suggestedName,
    colors: item.suggestedColors,
    brand: item.suggestedBrand,
    material: item.material,
    pattern: item.pattern,
    confidence: item.confidence,
  }));
  return [
    "Create a strict 2-column fashion product grid on a white background. Put each item fully inside its own large cell with generous padding. Do not let any garment touch a cell edge. Do not overlap items. Do not add borders, text, labels, captions, watermarks, or brand names. Top-left cell: outerwear if present. Top-right cell: top/shirt. Bottom-left cell: bottoms. Bottom-right cell: footwear. Place accessories in separate small cells below the main grid. Every item must be fully visible, centered, and easy to crop automatically.",
    "This layout is intended for automatic machine cropping. Do not create artistic arrangements, collage compositions, drifting placement, random spacing, or rotated garments. Use consistent cell sizing, consistent margins, and visible whitespace between cells. Every garment must remain centered inside a predictable rectangular cell.",
    "Preserve the visible outfit items' colors, category, pattern, style, logos, graphics, materials, silhouettes, and overall identity. Remove the person, face, hands, phone, mirror, room, floor, and background. Do not invent extra garments or missing design details.",
    "Use a square or portrait canvas with a clean white background. Only reconstruct items that are visible in the source photo. If a detected item is partial, preserve only the visible design cues and avoid inventing missing details.",
    `Detected source items to preserve: ${JSON.stringify(itemSummary)}`,
  ].join("\n\n");
}

function locatorToken(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function sourceLocatorEntries(sourceItems: NormalizedDetectedGarment[]): SourceLocatorEntry[] {
  const categoryCounts = new Map<GarmentCategory, number>();
  return sourceItems.slice(0, MAX_DETECTED_ITEMS).map((item, index) => {
    const categoryOrdinal = (categoryCounts.get(item.category) ?? 0) + 1;
    categoryCounts.set(item.category, categoryOrdinal);
    return {
      item,
      index,
      categoryOrdinal,
      locatorKey: `item_${index + 1}`,
      categoryKey: `${item.category}_${categoryOrdinal}`,
    };
  });
}

function sourceLocatorAliases(entry: SourceLocatorEntry) {
  const aliases = new Set(
    [
      entry.item.tempId,
      entry.locatorKey,
      entry.categoryKey,
      `${entry.item.category}_${entry.index + 1}`,
      `${entry.item.category}_${entry.categoryOrdinal}`,
      `${entry.item.category}_${entry.item.subcategory}_${entry.categoryOrdinal}`,
      `${entry.item.subcategory}_${entry.categoryOrdinal}`,
      entry.item.suggestedName,
    ]
      .map(locatorToken)
      .filter(Boolean),
  );
  if (entry.item.category === Category.FOOTWEAR) {
    aliases.add(`shoe_${entry.categoryOrdinal}`);
    aliases.add(`shoes_${entry.categoryOrdinal}`);
  }
  if (entry.item.category === Category.ONE_PIECE) {
    aliases.add(`onepiece_${entry.categoryOrdinal}`);
    aliases.add(`dress_${entry.categoryOrdinal}`);
  }
  return aliases;
}

const LOCATOR_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "by",
  "for",
  "from",
  "in",
  "item",
  "layout",
  "of",
  "on",
  "the",
  "visible",
  "with",
]);

function locatorTokensForText(value: unknown) {
  return locatorToken(value)
    .split("_")
    .filter((token) => token.length >= 2 && !LOCATOR_STOP_WORDS.has(token));
}

function tokenOverlapScore(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  return a.reduce((score, token) => score + (bSet.has(token) ? 1 : 0), 0);
}

function sourceLocatorScore(raw: RawLayoutLocatorItem, entry: SourceLocatorEntry) {
  const rawCategory = normalizeCategory(raw.category);
  let score = 0;
  if (rawCategory === entry.item.category) score += 6;
  else if (rawCategory) score -= 6;

  const rawSubcategory = locatorToken(raw.subcategory);
  const sourceSubcategory = locatorToken(entry.item.subcategory);
  if (rawSubcategory && sourceSubcategory) {
    if (rawSubcategory === sourceSubcategory) score += 5;
    else if (rawSubcategory.includes(sourceSubcategory) || sourceSubcategory.includes(rawSubcategory)) {
      score += 2;
    }
  }

  const rawText = locatorTokensForText([
    raw.locatorKey,
    raw.sourceTempId,
    raw.category,
    raw.subcategory,
    raw.name,
    raw.matchedLayoutItem,
    raw.reason,
  ].join(" "));
  const sourceText = locatorTokensForText([
    entry.item.category,
    entry.item.subcategory,
    entry.item.suggestedName,
    entry.item.suggestedColors.join(" "),
    entry.item.material,
    entry.item.pattern,
  ].join(" "));
  score += tokenOverlapScore(rawText, sourceText) * 2;

  return score;
}

function resolveLocatedSource(
  raw: RawLayoutLocatorItem,
  entries: SourceLocatorEntry[],
  usedSourceIds: Set<string>,
) {
  const availableEntries = entries.filter((entry) => !usedSourceIds.has(entry.item.tempId));
  const rawSourceTokens = [raw.sourceTempId, raw.locatorKey, raw.name, raw.matchedLayoutItem]
    .map(locatorToken)
    .filter(Boolean);
  for (const rawSourceToken of rawSourceTokens) {
    const aliasMatches = availableEntries.filter((entry) =>
      sourceLocatorAliases(entry).has(rawSourceToken),
    );
    if (aliasMatches.length === 1) {
      return { entry: aliasMatches[0], reason: "alias" };
    }
    if (aliasMatches.length > 1) {
      const rawCategory = normalizeCategory(raw.category);
      const categoryMatch = aliasMatches.find((entry) => entry.item.category === rawCategory);
      if (categoryMatch) return { entry: categoryMatch, reason: "category_alias" };
    }
  }

  const rawCategory = normalizeCategory(raw.category);
  const categoryEntries = rawCategory
    ? availableEntries.filter((entry) => entry.item.category === rawCategory)
    : availableEntries;
  if (categoryEntries.length === 1) {
    return { entry: categoryEntries[0], reason: "single_category_candidate" };
  }

  const scored = categoryEntries
    .map((entry) => ({ entry, score: sourceLocatorScore(raw, entry) }))
    .sort((a, b) => b.score - a.score);
  const [best, runnerUp] = scored;
  if (best && best.score >= 6 && best.score >= (runnerUp?.score ?? 0) + 2) {
    return { entry: best.entry, reason: "text_match" };
  }

  return null;
}

async function createReconstructedLayout(params: {
  client: OpenAI;
  uid: string;
  traceId: string;
  input: ImageInput;
  detectedItems: NormalizedDetectedGarment[];
}) {
  const startedAt = Date.now();
  logOutfitLayout({
    traceId: params.traceId,
    step: "layout_reconstruction_started",
    status: "start",
    data: {
      model: IMAGE_MODEL,
      detectedCount: params.detectedItems.length,
      byteLength: params.input.bytes.length,
    },
  });
  logOutfitLayout({
    traceId: params.traceId,
    step: "grid_layout_prompt_used",
    status: "success",
    data: {
      coreGrid: "outerwear_top_left_top_top_right_bottom_bottom_left_footwear_bottom_right",
      gridGeometry: "deterministic_equal_cells",
      accessoryPlacement: "horizontal_strip_below_core_grid",
      accessoryCount: params.detectedItems.filter((item) => item.category === Category.ACCESSORY).length,
    },
  });
  const image = await toFile(params.input.bytes, "outfit-source.jpg", {
    type: params.input.contentType,
  });
  const response = await params.client.images.edit({
    model: IMAGE_MODEL,
    image,
    prompt: layoutPromptForDetectedItems(params.detectedItems),
    size: "auto",
    quality: "medium",
    input_fidelity: "high",
    output_format: "jpeg",
    output_compression: 92,
    user: params.uid,
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("Image model returned no reconstructed layout.");
  }
  const bytes = Buffer.from(b64, "base64");
  const storagePath = `users/${params.uid}/outfitExtraction/${params.traceId}/reconstructed-layout.jpg`;
  const url = await uploadImageAndGetUrl(storagePath, bytes, "image/jpeg");
  logOutfitLayout({
    traceId: params.traceId,
    step: "layout_reconstruction_success",
    status: "success",
    durationMs: durationMs(startedAt),
    data: {
      storagePath,
      byteLength: bytes.length,
    },
  });
  return { bytes, url, storagePath };
}

function normalizeLocatedLayoutItems(
  rawItems: RawLayoutLocatorItem[],
  sourceItems: NormalizedDetectedGarment[],
  traceId: string,
) {
  const sourceEntries = sourceLocatorEntries(sourceItems);
  const usedSourceIds = new Set<string>();
  const located: LocatedLayoutItem[] = [];
  for (const raw of rawItems.slice(0, MAX_DETECTED_ITEMS)) {
    const resolvedSource = resolveLocatedSource(raw, sourceEntries, usedSourceIds);
    if (!resolvedSource) {
      logOutfitLayout({
        traceId,
        step: "layout_crop_rejected",
        status: "skip",
        data: {
          locatorKey: cleanText(raw.locatorKey, 100) || null,
          sourceTempId: cleanText(raw.sourceTempId, 100) || null,
          category: normalizeCategory(raw.category),
          reason: "source_not_resolved",
          confidence: clamp01(raw.confidence, 0),
        },
      });
      continue;
    }
    const source = resolvedSource.entry.item;
    const sourceTempId = source.tempId;
    const rawSourceToken = locatorToken(raw.sourceTempId || raw.locatorKey || raw.name || raw.matchedLayoutItem);
    const exactSourceToken = locatorToken(sourceTempId);
    if (rawSourceToken && rawSourceToken !== exactSourceToken) {
      logOutfitLayout({
        traceId,
        step: "layout_locator_source_resolved",
        status: "success",
        data: {
          sourceTempId,
          locatorKey: cleanText(raw.locatorKey, 100) || null,
          returnedSourceTempId: cleanText(raw.sourceTempId, 100),
          category: source.category,
          reason: resolvedSource.reason,
        },
      });
    }
    const category = normalizeCategory(raw.category) ?? source.category;
    const boundingBox = normalizeBoundingBox(raw.boundingBox ?? raw.bbox);
    const confidence = clamp01(raw.confidence, 0);
    const visible = raw.visible !== false;
    if (!boundingBox) {
      logOutfitLayout({
        traceId,
        step: "layout_crop_rejected",
        status: "skip",
        data: {
          sourceTempId,
          category,
          reason: "invalid_bbox",
          confidence,
        },
      });
      continue;
    }
    located.push({
      layoutKey: cleanText(raw.locatorKey || raw.sourceTempId, 80) || source.category,
      sourceTempId,
      category,
      subcategory: normalizeSubcategory(category, raw.subcategory ?? source.subcategory),
      matchedLayoutItem: cleanText(raw.matchedLayoutItem || raw.name) || source.suggestedName,
      boundingBox,
      confidence,
      visible,
      reason: cleanText(raw.reason, 180) || null,
      suggestedName: cleanText(raw.name || raw.matchedLayoutItem) || source.suggestedName,
      suggestedColors: source.suggestedColors,
      suggestedBrand: source.suggestedBrand,
      isUnbranded: source.isUnbranded !== false,
      materialEstimate: source.materialEstimate ?? [],
      pattern: source.pattern,
      fit: source.fit ?? null,
      styleAesthetic: source.styleAesthetic ?? [],
    });
    usedSourceIds.add(sourceTempId);
    logOutfitLayout({
      traceId,
      step: "layout_bbox_found",
      status: "success",
      data: {
        sourceTempId,
        category,
        confidence,
        visible,
        boundingBox,
      },
    });
  }
  return located;
}

async function locateItemsInReconstructedLayout(params: {
  client: OpenAI;
  reconstructedLayoutUrl: string;
  traceId: string;
  sourceItems: NormalizedDetectedGarment[];
}) {
  const startedAt = Date.now();
  const sourceEntries = sourceLocatorEntries(params.sourceItems);
  const sourceSummary = sourceEntries.map((entry) => ({
    sourceTempId: entry.item.tempId,
    locatorKey: entry.locatorKey,
    categoryKey: entry.categoryKey,
    itemNumber: entry.index + 1,
    categoryOrdinal: entry.categoryOrdinal,
    category: entry.item.category,
    subcategory: entry.item.subcategory,
    suggestedName: entry.item.suggestedName,
    colors: entry.item.suggestedColors,
    confidence: entry.item.confidence,
  }));
  logOutfitLayout({
    traceId: params.traceId,
    step: "layout_locator_started",
    status: "start",
    data: {
      sourceCount: sourceSummary.length,
      model: DETECTION_MODEL,
    },
  });
  logOutfitLayout({
    traceId: params.traceId,
    step: "layout_locator_prompt_items",
    status: "success",
    data: {
      items: sourceSummary.map((item) => ({
        locatorKey: item.locatorKey,
        categoryKey: item.categoryKey,
        sourceTempId: item.sourceTempId,
        category: item.category,
        subcategory: item.subcategory,
        name: item.suggestedName,
        colors: item.colors,
      })),
    },
  });
  const response = await params.client.responses.create({
    model: DETECTION_MODEL,
    input: [
      {
        role: "developer",
        content:
          "You are locating clothing items inside a clean reconstructed outfit layout image. Return normalized bounding boxes for each visible item. The layout image contains separated product-style garments on a white background. Match the requested source items to the visible layout items by category, color, name, and appearance. Return only JSON. Coordinates must be normalized 0-1 relative to the layout image. Include generous but not excessive boxes around the full item. Use sourceTempId exactly when possible; if copying the long ID is difficult, use locatorKey.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Find every visible source item in this reconstructed outfit layout. Return one item per source item when visible. Prefer the exact sourceTempId and always include the item's locatorKey. If the long sourceTempId is awkward to copy, put the locatorKey in sourceTempId too. Bounding boxes are normalized from top-left with x,y,width,height around the full garment only, including sleeves, hems, shoes, and accessories. Keep boxes generous but not excessive. Mark visible=false if the item is missing or too changed to locate confidently. Source items: ${JSON.stringify(sourceSummary)}`,
          },
          {
            type: "input_image",
            image_url: params.reconstructedLayoutUrl,
            detail: "high",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "outfit_layout_item_locator",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  locatorKey: { type: "string" },
                  sourceTempId: { type: "string" },
                  category: {
                    type: "string",
                    enum: ["top", "bottom", "footwear", "outerwear", "accessory", "one_piece"],
                  },
                  subcategory: { type: "string" },
                  name: { type: "string" },
                  matchedLayoutItem: { type: "string" },
                  boundingBox: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                      width: { type: "number" },
                      height: { type: "number" },
                    },
                    required: ["x", "y", "width", "height"],
                  },
                  confidence: { type: "number" },
                  visible: { type: "boolean" },
                  reason: { type: "string" },
                },
                required: [
                  "locatorKey",
                  "sourceTempId",
                  "category",
                  "subcategory",
                  "name",
                  "matchedLayoutItem",
                  "boundingBox",
                  "confidence",
                  "visible",
                  "reason",
                ],
              },
            },
          },
          required: ["items"],
        },
      },
    },
  });
  const parsed = JSON.parse(String(response.output_text || "{}")) as {
    items?: RawLayoutLocatorItem[];
  };
  const located = normalizeLocatedLayoutItems(parsed.items ?? [], params.sourceItems, params.traceId);
  logOutfitLayout({
    traceId: params.traceId,
    step: "layout_locator_success",
    status: "success",
    durationMs: durationMs(startedAt),
    data: {
      rawCount: parsed.items?.length ?? 0,
      locatedCount: located.length,
    },
  });
  return located;
}

function normalizeLayoutMetadataItems(
  rawItems: RawLayoutMetadataItem[],
  sourceItems: NormalizedDetectedGarment[],
  traceId: string,
) {
  const sourceEntries = sourceLocatorEntries(sourceItems);
  const usedSourceIds = new Set<string>();
  const located: LocatedLayoutItem[] = [];
  for (const raw of rawItems.slice(0, MAX_DETECTED_ITEMS)) {
    const resolvedSource = resolveLocatedSource(raw, sourceEntries, usedSourceIds);
    if (!resolvedSource) {
      logOutfitLayout({
        traceId,
        step: "layout_crop_rejected",
        status: "skip",
        data: {
          layoutKey: cleanText(raw.layoutKey, 100) || null,
          sourceTempId: cleanText(raw.sourceTempId, 100) || null,
          category: normalizeCategory(raw.category),
          reason: "metadata_source_not_resolved",
          confidence: clamp01(raw.confidence, 0),
        },
      });
      continue;
    }

    const source = resolvedSource.entry.item;
    const sourceTempId = source.tempId;
    const category = normalizeCategory(raw.category) ?? source.category;
    const boundingBox = normalizeBoundingBox(raw.boundingBox ?? raw.bbox);
    const confidence = clamp01(raw.confidence, source.confidence);
    const visible = raw.visible !== false;
    if (!boundingBox) {
      logOutfitLayout({
        traceId,
        step: "layout_crop_rejected",
        status: "skip",
        data: {
          sourceTempId,
          category,
          reason: "invalid_metadata_bbox",
          confidence,
        },
      });
      continue;
    }

    const brand = cleanText(raw.brand ?? raw.suggestedBrand, 60);
    const isUnbranded =
      raw.isUnbranded === true ||
      !brand ||
      /^(unbranded|unknown|none|n\/a)$/i.test(brand);
    const colors = normalizeColors(raw.colors ?? raw.suggestedColors);
    const materialEstimate = normalizeTextArray(raw.materialEstimate ?? raw.material, 40, 4);
    const name = cleanText(raw.name || raw.matchedLayoutItem, 90) || source.suggestedName;

    located.push({
      layoutKey: cleanText(raw.layoutKey || raw.locatorKey || raw.sourceTempId, 80) || source.category,
      sourceTempId,
      category,
      subcategory: normalizeSubcategory(category, raw.subcategory ?? source.subcategory),
      matchedLayoutItem: cleanText(raw.matchedLayoutItem || raw.name) || name,
      boundingBox,
      confidence,
      visible,
      reason: cleanText(raw.reason, 180) || null,
      suggestedName: name,
      suggestedColors: colors.length ? colors : source.suggestedColors,
      suggestedBrand: isUnbranded ? null : brand,
      isUnbranded,
      materialEstimate: materialEstimate.length ? materialEstimate : source.materialEstimate ?? [],
      pattern: cleanText(raw.pattern, 40) || source.pattern,
      fit: cleanText(raw.fit, 40) || (source.fit ?? null),
      styleAesthetic: normalizeTextArray(raw.styleAesthetic, 40, 5),
    });
    usedSourceIds.add(sourceTempId);
    logOutfitLayout({
      traceId,
      step: "layout_bbox_found",
      status: "success",
      data: {
        sourceTempId,
        category,
        confidence,
        visible,
        boundingBox,
        metadataSource: "layout_one_shot",
      },
    });
  }
  return located;
}

async function extractLayoutItemsMetadata(params: {
  client: OpenAI;
  reconstructedLayoutUrl: string;
  traceId: string;
  sourceItems: NormalizedDetectedGarment[];
}) {
  const startedAt = Date.now();
  const sourceEntries = sourceLocatorEntries(params.sourceItems);
  const sourceSummary = sourceEntries.map((entry) => ({
    sourceTempId: entry.item.tempId,
    locatorKey: entry.locatorKey,
    categoryKey: entry.categoryKey,
    layoutKey:
      entry.item.category === Category.ACCESSORY
        ? `accessory_${entry.categoryOrdinal}`
        : entry.item.category === Category.ONE_PIECE
          ? "top"
          : entry.item.category,
    itemNumber: entry.index + 1,
    categoryOrdinal: entry.categoryOrdinal,
    category: entry.item.category,
    subcategory: entry.item.subcategory,
    name: entry.item.suggestedName,
    colors: entry.item.suggestedColors,
    material: entry.item.material,
    pattern: entry.item.pattern,
    confidence: entry.item.confidence,
  }));

  logOutfitLayout({
    traceId: params.traceId,
    step: "layout_metadata_started",
    status: "start",
    data: {
      sourceCount: sourceSummary.length,
      model: DETECTION_MODEL,
    },
  });

  const response = await params.client.responses.create({
    model: DETECTION_MODEL,
    input: [
      {
        role: "developer",
        content:
          "You inspect a clean reconstructed outfit product-grid image for a wardrobe app. Return strict JSON only. In one pass, locate each visible garment/accessory and extract closet metadata. Do not invent invisible garments, brands, or design details.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Extract all visible layout items from this reconstructed outfit grid. Match requested source items by sourceTempId, locatorKey, category, colors, name, and appearance. Return one JSON item per visible source item. Use normalized x,y,width,height bounding boxes relative to the full layout image; boxes must include the full garment with generous whitespace so sleeves, hems, shoes, and accessories are not clipped. Expected layout keys: outerwear, top, bottom, footwear, accessory_1, accessory_2. If a brand is not clearly visible, set brand to "Unbranded" and isUnbranded=true. Source items: ${JSON.stringify(sourceSummary)}`,
          },
          {
            type: "input_image",
            image_url: params.reconstructedLayoutUrl,
            detail: "high",
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "outfit_layout_metadata",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  layoutKey: { type: "string" },
                  locatorKey: { type: "string" },
                  sourceTempId: { type: "string" },
                  category: {
                    type: "string",
                    enum: ["top", "bottom", "footwear", "outerwear", "accessory", "one_piece"],
                  },
                  subcategory: { type: "string" },
                  name: { type: "string" },
                  brand: { type: "string" },
                  isUnbranded: { type: "boolean" },
                  colors: { type: "array", items: { type: "string" } },
                  materialEstimate: { type: "array", items: { type: "string" } },
                  pattern: { type: ["string", "null"] },
                  fit: { type: ["string", "null"] },
                  styleAesthetic: { type: "array", items: { type: "string" } },
                  boundingBox: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      x: { type: "number" },
                      y: { type: "number" },
                      width: { type: "number" },
                      height: { type: "number" },
                    },
                    required: ["x", "y", "width", "height"],
                  },
                  confidence: { type: "number" },
                  visible: { type: "boolean" },
                  reason: { type: "string" },
                },
                required: [
                  "layoutKey",
                  "locatorKey",
                  "sourceTempId",
                  "category",
                  "subcategory",
                  "name",
                  "brand",
                  "isUnbranded",
                  "colors",
                  "materialEstimate",
                  "pattern",
                  "fit",
                  "styleAesthetic",
                  "boundingBox",
                  "confidence",
                  "visible",
                  "reason",
                ],
              },
            },
          },
          required: ["items"],
        },
      },
    },
  });
  const parsed = JSON.parse(String(response.output_text || "{}")) as {
    items?: RawLayoutMetadataItem[];
  };
  const located = normalizeLayoutMetadataItems(parsed.items ?? [], params.sourceItems, params.traceId);
  logOutfitLayout({
    traceId: params.traceId,
    step: "layout_metadata_success",
    status: "success",
    durationMs: durationMs(startedAt),
    data: {
      rawCount: parsed.items?.length ?? 0,
      locatedCount: located.length,
    },
  });
  return located;
}

function normalizedReasons(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 8);
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
  if (quality.surfaceVisible) reasons.add("surface_visible");

  return {
    ...quality,
    needsRefinement:
      quality.needsRefinement ||
      quality.aestheticScore < 0.72 ||
      quality.clutterLevel > 0.5 ||
      quality.lightingQuality < 0.55 ||
      quality.cropQuality < 0.65 ||
      quality.humanVisible ||
      quality.hangerVisible ||
      quality.surfaceVisible,
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

function qualitySummary(quality: ProductImageQuality | null) {
  if (!quality) return null;
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

function isPartiallyVisible(item: NormalizedDetectedGarment, quality: ProductImageQuality | null) {
  const warningText = [
    ...item.extractionWarnings,
    ...(quality?.refinementReason ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return (
    (quality?.visibilityCompleteness ?? 1) < 0.72 ||
    /\b(partial|partly|occluded|hidden|blocked|cropped|not fully visible|low visibility)\b/.test(warningText)
  );
}

function extractionQualityFor(params: {
  item: NormalizedDetectedGarment;
  imageQuality: ProductImageQuality | null;
  hasRefinedImageUrl: boolean;
  hasCleanedImageUrl: boolean;
  fallbackUsed: boolean;
}): ExtractionQuality {
  const lowConfidence = params.item.confidence < reviewConfidenceFor(params.item.category);
  const partiallyVisible = isPartiallyVisible(params.item, params.imageQuality);
  const scoreParts = [
    params.item.confidence,
    params.imageQuality?.visibilityCompleteness ?? params.item.confidence,
    params.hasCleanedImageUrl ? 1 : params.hasRefinedImageUrl ? 0.72 : 0.18,
    partiallyVisible ? 0.35 : 1,
    lowConfidence ? 0.4 : 1,
  ];
  const score = scoreParts.reduce((sum, value) => sum + value, 0) / scoreParts.length;
  return {
    score: clamp01(score, 0),
    visibilityCompleteness: clamp01(params.imageQuality?.visibilityCompleteness, params.item.confidence),
    hasCleanedImageUrl: params.hasCleanedImageUrl,
    hasRefinedImageUrl: params.hasRefinedImageUrl,
    fallbackUsed: params.fallbackUsed,
    rawCropFallback: !params.hasRefinedImageUrl && !params.hasCleanedImageUrl,
    partiallyVisible,
    lowConfidence,
  };
}

async function evaluateImageQuality(client: OpenAI, input: Pick<ImageInput, "bytes" | "contentType">) {
  const response = await client.responses.create({
    model: QUALITY_MODEL,
    input: [
      {
        role: "developer",
        content:
          "Evaluate a single garment crop from a worn outfit photo for digital closet product-image readiness. Return JSON only.",
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Score this garment crop from 0 to 1. Set needsRefinement when a person/body, mirror/room, background clutter, poor crop, poor lighting, visible hanger/surface, or other garments make it unsuitable as a clean product image. Preserve logos and graphics in any later refinement.",
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
        name: "outfit_crop_quality",
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
  return withDecisionReasons(JSON.parse(String(response.output_text || "{}")));
}

function hasComplexGraphicRisk(item: NormalizedDetectedGarment, quality: ProductImageQuality) {
  const text = JSON.stringify({
    name: item.suggestedName,
    pattern: item.pattern,
    warnings: item.extractionWarnings,
  }).toLowerCase();
  return (
    /\b(logo|graphic|print|typography|text|monogram|embroidered|embroidery|patch|anime)\b/.test(text) ||
    quality.refinementReason.some((reason) => /logo|graphic|text|print/i.test(reason))
  );
}

function targetItemLabel(item: NormalizedDetectedGarment) {
  return [item.category, item.subcategory, item.suggestedName]
    .map((value) => cleanText(value, 80))
    .filter(Boolean)
    .join(" / ");
}

function isAccessoryLike(item: NormalizedDetectedGarment) {
  return item.category === Category.ACCESSORY;
}

function isAutoPolishCategory(item: NormalizedDetectedGarment) {
  return (
    item.category === Category.TOP ||
    item.category === Category.BOTTOM ||
    item.category === Category.OUTERWEAR ||
    item.category === Category.FOOTWEAR
  );
}

function autoPolishSkipReasonFor(params: {
  item: NormalizedDetectedGarment;
  imageQuality: ProductImageQuality | null;
  skipPolish: boolean;
  autoPolishBudgetAvailable: boolean;
}) {
  const cropArea = boundingBoxArea(params.item.boundingBox);
  if (params.item.category === Category.ACCESSORY) return "accessory_auto_skip" as const;
  if (!isAutoPolishCategory(params.item)) return null;
  if (params.skipPolish) return null;
  if (!params.autoPolishBudgetAvailable) return null;
  if (params.item.confidence < reviewConfidenceFor(params.item.category)) {
    return "low_confidence" as const;
  }
  if (cropArea < MIN_AUTO_POLISH_CROP_AREA) return "tiny_crop" as const;
  if (isPartiallyVisible(params.item, params.imageQuality)) return "occluded" as const;
  return null;
}

function logAutoPolishSkipped(params: {
  traceId: string;
  item: NormalizedDetectedGarment;
  reason: string;
}) {
  logOutfitExtraction({
    traceId: params.traceId,
    step: "item_auto_polish_skipped",
    status: "skip",
    data: {
      tempId: params.item.tempId,
      category: params.item.category,
      confidence: params.item.confidence,
      reason: params.reason,
    },
  });
}

function buildRefinementPrompt(item: NormalizedDetectedGarment, conservative: boolean) {
  const metadataText = JSON.stringify(
    {
      category: item.category,
      subcategory: item.subcategory,
      name: item.suggestedName,
      colors: item.suggestedColors,
      brand: item.suggestedBrand,
      material: item.material,
      pattern: item.pattern,
    },
    null,
    2,
  );
  const target = targetItemLabel(item) || item.category;
  return [
    `Create a clean premium ecommerce product image of only the detected item: ${target}.`,
    BASE_REFINEMENT_PROMPT,
    "This source is a crop from a worn outfit photo, so aggressively remove body, skin, hands, face, phone, mirror, room, and other garments from the item image.",
    isAccessoryLike(item)
      ? "For accessories, isolate only the accessory if possible. Be conservative with tiny or occluded jewelry/watches and do not invent missing decorative details."
      : "For tops, bottoms, outerwear, one-pieces, and shoes, isolate the garment strongly enough that no body or mirror-selfie context remains.",
    "If the item is partially visible, reconstruct only the visible item conservatively and leave uncertain details plain rather than inventing new design.",
    conservative
      ? "The garment may contain logos, text, typography, anime art, luxury marks, or distinctive graphics. Use conservative cleanup only: preserve all marks exactly and leave uncertain details unchanged."
      : "",
    `Detected target garment metadata: ${metadataText}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function refineCropImage(params: {
  client: OpenAI;
  uid: string;
  traceId: string;
  item: NormalizedDetectedGarment;
  bytes: Buffer;
  conservative: boolean;
}) {
  const image = await toFile(params.bytes, "outfit-garment-crop.jpg", {
    type: "image/jpeg",
  });
  const startedAt = Date.now();
  logOutfitExtraction({
    traceId: params.traceId,
    step: "item_product_polish_started",
    status: "start",
    data: {
      tempId: params.item.tempId,
      category: params.item.category,
      confidence: params.item.confidence,
      conservative: params.conservative,
      model: IMAGE_MODEL,
    },
  });
  const response = await params.client.images.edit({
    model: IMAGE_MODEL,
    image,
    prompt: buildRefinementPrompt(params.item, params.conservative),
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
  logOutfitExtraction({
    traceId: params.traceId,
    step: "item_product_polish_success",
    status: "success",
    durationMs: durationMs(startedAt),
    data: {
      tempId: params.item.tempId,
      category: params.item.category,
      confidence: params.item.confidence,
      byteLength: bytes.length,
    },
  });
  return bytes;
}

async function blobToBuffer(blob: Blob): Promise<Buffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadImageAndGetUrl(
  path: string,
  bytes: Buffer,
  contentType = "image/jpeg",
): Promise<string> {
  const bucket = getStorage().bucket();
  const token = randomUUID();
  await bucket.file(path).save(bytes, {
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
    resumable: false,
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

function paddedCropForBox(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number,
  category: GarmentCategory,
) {
  const paddingRatio =
    category === Category.ACCESSORY ? 0.1 : category === Category.FOOTWEAR ? 0.16 : 0.12;
  const centerX = (box.x + box.w / 2) * imageWidth;
  const centerY = (box.y + box.h / 2) * imageHeight;
  const paddedWidth = Math.min(imageWidth, box.w * imageWidth * (1 + paddingRatio * 2));
  const paddedHeight = Math.min(imageHeight, box.h * imageHeight * (1 + paddingRatio * 2));
  let left = Math.round(centerX - paddedWidth / 2);
  let top = Math.round(centerY - paddedHeight / 2);
  let width = Math.round(paddedWidth);
  let height = Math.round(paddedHeight);

  left = Math.max(0, Math.min(imageWidth - 1, left));
  top = Math.max(0, Math.min(imageHeight - 1, top));
  width = Math.max(1, Math.min(imageWidth - left, width));
  height = Math.max(1, Math.min(imageHeight - top, height));

  return { left, top, width, height };
}

async function cropGarmentImage(params: {
  inputBytes: Buffer;
  item: NormalizedDetectedGarment;
  imageWidth: number;
  imageHeight: number;
}) {
  const crop = paddedCropForBox(
    params.item.boundingBox,
    params.imageWidth,
    params.imageHeight,
    params.item.category,
  );
  const bytes = await sharp(params.inputBytes)
    .rotate()
    .extract(crop)
    .resize({
      width: MAX_CROP_DIMENSION,
      height: MAX_CROP_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { bytes, crop };
}

async function createCleanedCutout(params: {
  traceId: string;
  item: NormalizedDetectedGarment;
  bytes: Buffer;
}) {
  const startedAt = Date.now();
  logOutfitExtraction({
    traceId: params.traceId,
    step: "item_cutout_started",
    status: "start",
    data: {
      tempId: params.item.tempId,
      category: params.item.category,
      confidence: params.item.confidence,
    },
  });
  const result = await removeBackground(params.bytes, {
    output: { format: "image/png", quality: 0.92 },
  });
  const pngBytes = await blobToBuffer(result);
  logOutfitExtraction({
    traceId: params.traceId,
    step: "item_cutout_success",
    status: "success",
    durationMs: durationMs(startedAt),
    data: {
      tempId: params.item.tempId,
      category: params.item.category,
      confidence: params.item.confidence,
      byteLength: pngBytes.length,
    },
  });
  return pngBytes;
}

async function processDetectedItem(params: {
  client: OpenAI;
  uid: string;
  traceId: string;
  input: ImageInput;
  sourceImageUrl: string | null;
  item: NormalizedDetectedGarment;
  imageWidth: number;
  imageHeight: number;
  skipPolish: boolean;
  skipBackgroundRemoval: boolean;
  skipQualityScoring: boolean;
  autoPolishBudgetAvailable: boolean;
}) {
  const { client, uid, traceId, input, item } = params;
  const storageBase = `users/${uid}/outfitExtraction/${traceId}/${item.tempId}`;
  const cropResult = await cropGarmentImage({
    inputBytes: input.bytes,
    item,
    imageWidth: params.imageWidth,
    imageHeight: params.imageHeight,
  });
  const cropStoragePath = `${storageBase}.crop.jpg`;
  const cropImageUrl = await uploadImageAndGetUrl(cropStoragePath, cropResult.bytes, "image/jpeg");
  logOutfitExtraction({
    traceId,
    step: "item_crop_created",
    status: "success",
    data: {
      tempId: item.tempId,
      category: item.category,
      confidence: item.confidence,
      cropStoragePath,
      crop: cropResult.crop,
    },
  });
  if (item.category === Category.ACCESSORY) {
    logOutfitExtraction({
      traceId,
      step: "accessory_crop_ready",
      status: "success",
      data: {
        tempId: item.tempId,
        category: item.category,
        confidence: item.confidence,
        cropStoragePath,
      },
    });
  }

  let imageQuality: ProductImageQuality | null = null;
  let polishApplied = false;
  const polishWarnings: string[] = [];
  let refinedBytes: Buffer | null = null;
  let refinedImageUrl: string | null = null;
  let refinedStoragePath: string | null = null;

  if (item.category === Category.ACCESSORY) {
    imageQuality = fallbackQuality("accessory_crop_only");
    logOutfitExtraction({
      traceId,
      step: "item_quality_scoring",
      status: "skip",
      data: { tempId: item.tempId, reason: "accessory_crop_only" },
    });
  } else if (params.skipQualityScoring) {
    imageQuality = fallbackQuality("quality_analysis_skipped_prefer_speed");
    logOutfitExtraction({
      traceId,
      step: "item_quality_scoring",
      status: "skip",
      data: { tempId: item.tempId, reason: "prefer_speed" },
    });
  } else {
    try {
      imageQuality = await evaluateImageQuality(client, {
        bytes: cropResult.bytes,
        contentType: "image/jpeg",
      });
      logOutfitExtraction({
        traceId,
        step: "item_quality_scoring",
        status: "success",
        data: {
          tempId: item.tempId,
          category: item.category,
          confidence: item.confidence,
          imageQuality: qualitySummary(imageQuality),
        },
      });
    } catch (error) {
      imageQuality = fallbackQuality("quality_analysis_failed");
      polishWarnings.push("product_polish_analysis_failed");
      logOutfitExtraction({
        traceId,
        step: "item_quality_scoring",
        status: "failure",
        data: { tempId: item.tempId, ...safeError(error) },
      });
    }
  }

  const conservative = imageQuality ? hasComplexGraphicRisk(item, imageQuality) : false;
  const polishSkippedReason = autoPolishSkipReasonFor({
    item,
    imageQuality,
    skipPolish: params.skipPolish,
    autoPolishBudgetAvailable: params.autoPolishBudgetAvailable,
  });
  const shouldPolish =
    isAutoPolishCategory(item) &&
    !params.skipPolish &&
    params.autoPolishBudgetAvailable &&
    !polishSkippedReason;

  if (item.category === Category.ACCESSORY) {
    polishWarnings.push("accessory_auto_skip");
    logAutoPolishSkipped({ traceId, item, reason: "accessory_auto_skip" });
  } else if (!isAutoPolishCategory(item)) {
    polishWarnings.push("auto_polish_skipped_non_core_category");
    logAutoPolishSkipped({ traceId, item, reason: "non_core_category" });
  } else if (params.skipPolish) {
    polishWarnings.push("product_polish_skipped_prefer_speed");
    logAutoPolishSkipped({ traceId, item, reason: "prefer_speed" });
  } else if (!params.autoPolishBudgetAvailable) {
    polishWarnings.push("auto_polish_limit_reached");
    logAutoPolishSkipped({ traceId, item, reason: "auto_polish_limit" });
  } else if (polishSkippedReason) {
    polishWarnings.push(polishSkippedReason);
    logAutoPolishSkipped({ traceId, item, reason: polishSkippedReason });
  }

  if (shouldPolish) {
    try {
      refinedBytes = await refineCropImage({
        client,
        uid,
        traceId,
        item,
        bytes: cropResult.bytes,
        conservative,
      });
      polishApplied = true;
      if (conservative) polishWarnings.push("complex_logo_text_or_graphic_preservation_risk");
      try {
        refinedStoragePath = `${storageBase}.refined.jpg`;
        refinedImageUrl = await uploadImageAndGetUrl(refinedStoragePath, refinedBytes, "image/jpeg");
      } catch (error) {
        refinedStoragePath = null;
        polishWarnings.push("product_polish_upload_failed");
        logOutfitExtraction({
          traceId,
          step: "item_product_polish_fallback",
          status: "fallback",
          data: {
            tempId: item.tempId,
            category: item.category,
            confidence: item.confidence,
            reason: "refined_upload_failed",
            ...safeError(error),
          },
        });
      }
    } catch (error) {
      polishWarnings.push("product_polish_refinement_failed");
      logOutfitExtraction({
        traceId,
        step: "item_product_polish_fallback",
        status: "fallback",
        data: {
          tempId: item.tempId,
          category: item.category,
          confidence: item.confidence,
          ...safeError(error),
        },
      });
    }
  }

  let cleanedImageUrl: string | null = null;
  let cleanedStoragePath: string | null = null;
  let backgroundRemovalApplied = false;
  let maskInfo: ExtractedGarment["maskInfo"] = {
    method: "not_available",
    source: "server",
  };

  if (!params.skipBackgroundRemoval && refinedBytes) {
    try {
      const cutoutBytes = await createCleanedCutout({
        traceId,
        item,
        bytes: refinedBytes,
      });
      cleanedStoragePath = `${storageBase}.cleaned.png`;
      cleanedImageUrl = await uploadImageAndGetUrl(cleanedStoragePath, cutoutBytes, "image/png");
      backgroundRemovalApplied = true;
      maskInfo = { method: "background_removal", source: "server" };
    } catch (error) {
      maskInfo = {
        method: "not_available",
        source: "server",
        warning: "Background removal failed; crop is still available.",
      };
      logOutfitExtraction({
        traceId,
        step: "item_cutout_fallback",
        status: "fallback",
        data: {
          tempId: item.tempId,
          category: item.category,
          confidence: item.confidence,
          ...safeError(error),
        },
      });
    }
  } else if (!refinedBytes) {
    if (item.category !== Category.ACCESSORY) {
      polishWarnings.push("raw_crop_fallback");
    }
    maskInfo = {
      method: "not_available",
      source: "server",
      warning:
        item.category === Category.ACCESSORY
          ? "Accessory cropped only. Polish manually if needed."
          : "Cropped from outfit photo; review before saving.",
    };
  }

  const fallbackUsed = !refinedImageUrl || !cleanedImageUrl;
  const extractionQuality = extractionQualityFor({
    item,
    imageQuality,
    hasRefinedImageUrl: !!refinedImageUrl,
    hasCleanedImageUrl: !!cleanedImageUrl,
    fallbackUsed,
  });
  const extractionWarnings = new Set(item.extractionWarnings);
  if (item.category === Category.ACCESSORY) {
    extractionWarnings.add("Accessory cropped only. Polish manually if needed.");
  } else if (extractionQuality.rawCropFallback) {
    extractionWarnings.add("Cropped from outfit photo; review before saving.");
  }
  if (extractionQuality.partiallyVisible) extractionWarnings.add("Item is partially visible.");
  if (extractionQuality.lowConfidence) extractionWarnings.add("Needs review.");
  if (refinedImageUrl && !cleanedImageUrl) {
    extractionWarnings.add("Background removal failed; polished image is available for review.");
  }
  const autoPolishApplied =
    polishApplied && isAutoPolishCategory(item) && (!!refinedImageUrl || !!cleanedImageUrl);
  const imageState: ExtractedImageState = autoPolishApplied
    ? "polished"
    : item.category === Category.ACCESSORY
      ? "cropped"
      : "raw_fallback";

  return {
    ...item,
    extractionWarnings: Array.from(extractionWarnings).slice(0, 8),
    maskInfo,
    cropImageUrl,
    originalOutfitImageUrl: params.sourceImageUrl,
    originalCropUrl: cropImageUrl,
    refinedImageUrl,
    cleanedImageUrl,
    imageSource: "outfit_extraction" as const,
    extractionQuality,
    imageQuality,
    autoPolishApplied,
    userPolished: false,
    imageState,
    polishAvailable: item.category === Category.ACCESSORY,
    polishSkippedReason: polishSkippedReason ?? null,
    polishApplied: autoPolishApplied,
    cutoutApplied: backgroundRemovalApplied,
    extractionMetadata: {
      source: "outfit_photo" as const,
      sourceImageStoragePath: input.sourceStoragePath,
      cropStoragePath,
      refinedStoragePath,
      cleanedStoragePath,
      polishApplied: autoPolishApplied,
      polishWarnings,
      backgroundRemovalApplied,
    },
  };
}

function hasPartialWarning(item: NormalizedDetectedGarment) {
  return /\b(partial|partly|occluded|hidden|blocked|cropped|not fully visible|low visibility)\b/i.test(
    item.extractionWarnings.join(" "),
  );
}

function isLayoutCropMethod(method: LayoutExtractionMethod) {
  return method === "layout_grid_crop" || method === "layout_bbox_crop";
}

function selectedByDefaultForLayout(
  item: NormalizedDetectedGarment,
  method: LayoutExtractionMethod,
) {
  if (!isLayoutCropMethod(method)) return false;
  if (item.category === Category.ACCESSORY) return false;
  if (item.confidence < LAYOUT_CROP_CONFIDENCE_THRESHOLD) return false;
  return (
    item.category === Category.TOP ||
    item.category === Category.BOTTOM ||
    item.category === Category.OUTERWEAR ||
    item.category === Category.FOOTWEAR ||
    item.category === Category.ONE_PIECE
  );
}

function extractionQualityForLayout(
  item: NormalizedDetectedGarment,
  method: LayoutExtractionMethod,
): ExtractionQuality {
  const lowConfidence = item.confidence < reviewConfidenceFor(item.category);
  const partiallyVisible = hasPartialWarning(item);
  const fallbackUsed = !isLayoutCropMethod(method);
  return {
    score: clamp01(
      item.confidence * (fallbackUsed ? 0.55 : 0.92) * (partiallyVisible ? 0.65 : 1),
      0,
    ),
    visibilityCompleteness: clamp01(partiallyVisible ? item.confidence * 0.7 : item.confidence, item.confidence),
    hasCleanedImageUrl: false,
    hasRefinedImageUrl: false,
    fallbackUsed,
    rawCropFallback: fallbackUsed,
    partiallyVisible,
    lowConfidence,
  };
}

function buildExpectedLayoutGridCells(sourceItems: NormalizedDetectedGarment[]) {
  const cells = new Map<string, ExpectedLayoutGridCell>();
  const byCategory = new Map<GarmentCategory, NormalizedDetectedGarment[]>();
  for (const item of sourceItems.slice(0, MAX_DETECTED_ITEMS)) {
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }

  const accessories = byCategory.get(Category.ACCESSORY) ?? [];
  const hasAccessories = accessories.length > 0;
  const marginX = 0.07;
  const topY = 0.06;
  const gapX = 0.05;
  const gapY = 0.045;
  const mainBottom = hasAccessories ? 0.78 : 0.94;
  const cellW = (1 - marginX * 2 - gapX) / 2;
  const cellH = (mainBottom - topY - gapY) / 2;
  const rightX = marginX + cellW + gapX;
  const bottomY = topY + cellH + gapY;
  const coreCells = {
    outerwear: { x: marginX, y: topY, w: cellW, h: cellH },
    top: { x: rightX, y: topY, w: cellW, h: cellH },
    bottom: { x: marginX, y: bottomY, w: cellW, h: cellH },
    footwear: { x: rightX, y: bottomY, w: cellW, h: cellH },
  };

  const addUniqueCoreCell = (
    category: GarmentCategory,
    slot: keyof typeof coreCells,
  ) => {
    const items = byCategory.get(category) ?? [];
    if (items.length !== 1) return;
    cells.set(items[0].tempId, {
      sourceTempId: items[0].tempId,
      category: items[0].category,
      slot,
      boundingBox: coreCells[slot],
    });
  };

  addUniqueCoreCell(Category.OUTERWEAR, "outerwear");
  addUniqueCoreCell(Category.TOP, "top");
  if (!(byCategory.get(Category.TOP) ?? []).length) {
    addUniqueCoreCell(Category.ONE_PIECE, "top");
  }
  addUniqueCoreCell(Category.BOTTOM, "bottom");
  addUniqueCoreCell(Category.FOOTWEAR, "footwear");

  return cells;
}

function layoutPaddingRatioFor(category: GarmentCategory) {
  if (category === Category.ACCESSORY) return 0.3;
  if (category === Category.FOOTWEAR) return 0.26;
  if (category === Category.BOTTOM) return 0.2;
  if (category === Category.TOP || category === Category.OUTERWEAR || category === Category.ONE_PIECE) {
    return category === Category.OUTERWEAR ? 0.24 : 0.22;
  }
  return 0.22;
}

function pixelCropForNormalizedBox(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number,
) {
  let left = Math.round(box.x * imageWidth);
  let top = Math.round(box.y * imageHeight);
  let width = Math.round(box.w * imageWidth);
  let height = Math.round(box.h * imageHeight);

  left = Math.max(0, Math.min(imageWidth - 1, left));
  top = Math.max(0, Math.min(imageHeight - 1, top));
  width = Math.max(1, Math.min(imageWidth - left, width));
  height = Math.max(1, Math.min(imageHeight - top, height));

  return { left, top, width, height };
}

function expandNormalizedBox(box: BoundingBox, paddingRatio: number): BoundingBox {
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  const width = Math.min(1, box.w * (1 + paddingRatio * 2));
  const height = Math.min(1, box.h * (1 + paddingRatio * 2));
  const x = Math.max(0, Math.min(1 - width, centerX - width / 2));
  const y = Math.max(0, Math.min(1 - height, centerY - height / 2));
  return { x, y, w: width, h: height };
}

function boxTouchesCellEdge(box: BoundingBox, cell: BoundingBox, tolerance = 0.012) {
  return (
    box.x <= cell.x + tolerance ||
    box.y <= cell.y + tolerance ||
    box.x + box.w >= cell.x + cell.w - tolerance ||
    box.y + box.h >= cell.y + cell.h - tolerance
  );
}

function aspectRatioValidForCategory(category: GarmentCategory, width: number, height: number) {
  if (!width || !height) return false;
  const ratio = width / height;
  if (category === Category.BOTTOM) return ratio >= 0.2 && ratio <= 1.2;
  if (category === Category.FOOTWEAR) return ratio >= 0.45 && ratio <= 3.4;
  if (category === Category.ACCESSORY) return ratio >= 0.25 && ratio <= 4.2;
  return ratio >= 0.35 && ratio <= 2.2;
}

function paddedLayoutCropForBox(
  box: BoundingBox,
  imageWidth: number,
  imageHeight: number,
  category: GarmentCategory,
) {
  const paddingRatio = layoutPaddingRatioFor(category);
  const centerX = (box.x + box.w / 2) * imageWidth;
  const centerY = (box.y + box.h / 2) * imageHeight;
  const paddedWidth = Math.min(imageWidth, box.w * imageWidth * (1 + paddingRatio * 2));
  const paddedHeight = Math.min(imageHeight, box.h * imageHeight * (1 + paddingRatio * 2));
  let left = Math.round(centerX - paddedWidth / 2);
  let top = Math.round(centerY - paddedHeight / 2);
  let width = Math.round(paddedWidth);
  let height = Math.round(paddedHeight);

  left = Math.max(0, Math.min(imageWidth - 1, left));
  top = Math.max(0, Math.min(imageHeight - 1, top));
  width = Math.max(1, Math.min(imageWidth - left, width));
  height = Math.max(1, Math.min(imageHeight - top, height));

  return { left, top, width, height };
}

function minGridContentRatioFor(category: GarmentCategory) {
  if (category === Category.ACCESSORY) return 0.004;
  if (category === Category.FOOTWEAR) return 0.008;
  if (category === Category.BOTTOM) return 0.012;
  return 0.01;
}

function gridCropPaddingRatioFor(category: GarmentCategory) {
  if (category === Category.OUTERWEAR) return 0.24;
  if (category === Category.TOP || category === Category.ONE_PIECE) return 0.22;
  if (category === Category.BOTTOM) return 0.2;
  if (category === Category.FOOTWEAR) return 0.26;
  if (category === Category.ACCESSORY) return 0.3;
  return 0.22;
}

function boxCenterInsideCell(box: BoundingBox, cell: BoundingBox) {
  const tolerance = 0.035;
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  return (
    centerX >= cell.x - tolerance &&
    centerX <= cell.x + cell.w + tolerance &&
    centerY >= cell.y - tolerance &&
    centerY <= cell.y + cell.h + tolerance
  );
}

type ComponentBox = {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function canUsePrimaryComponentTrim(item: NormalizedDetectedGarment) {
  const colors = new Set(item.suggestedColors.map((color) => color.toLowerCase()));
  if (item.category === Category.FOOTWEAR) return false;
  if (colors.has("white") && (item.category === Category.TOP || item.category === Category.ONE_PIECE)) {
    return false;
  }
  return item.category !== Category.ACCESSORY || !colors.has("white");
}

function nonWhitePixel(data: Buffer, index: number) {
  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const a = data[index + 3];
  if (a < 24) return false;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max < 242 || max - min > 18;
}

async function primaryComponentTrim(params: {
  bytes: Buffer;
  item: NormalizedDetectedGarment;
}) {
  if (!canUsePrimaryComponentTrim(params.item)) return null;
  const raw = await sharp(params.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = raw.info;
  if (!width || !height || channels < 4) return null;
  const visited = new Uint8Array(width * height);
  const components: ComponentBox[] = [];
  const stack: number[] = [];

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (visited[pixel]) continue;
    const byteIndex = pixel * channels;
    if (!nonWhitePixel(raw.data, byteIndex)) {
      visited[pixel] = 1;
      continue;
    }

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    stack.push(pixel);
    visited[pixel] = 1;

    while (stack.length) {
      const current = stack.pop() ?? 0;
      const x = current % width;
      const y = Math.floor(current / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1,
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || visited[neighbor]) continue;
        const neighborByteIndex = neighbor * channels;
        if (!nonWhitePixel(raw.data, neighborByteIndex)) {
          visited[neighbor] = 1;
          continue;
        }
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }

    if (area >= 24) {
      components.push({ area, minX, minY, maxX, maxY });
    }
  }

  if (!components.length) return null;
  components.sort((a, b) => b.area - a.area);
  const largest = components[0];
  const areaThreshold =
    params.item.category === Category.FOOTWEAR ? largest.area * 0.28 : largest.area * 0.42;
  const largestCenterY = (largest.minY + largest.maxY) / 2;
  const selected = components.filter((component) => {
    if (component === largest) return true;
    if (component.area < areaThreshold) return false;
    if (params.item.category === Category.FOOTWEAR) {
      const centerY = (component.minY + component.maxY) / 2;
      return Math.abs(centerY - largestCenterY) < height * 0.22;
    }
    return false;
  });

  const union = selected.reduce(
    (box, component) => ({
      minX: Math.min(box.minX, component.minX),
      minY: Math.min(box.minY, component.minY),
      maxX: Math.max(box.maxX, component.maxX),
      maxY: Math.max(box.maxY, component.maxY),
    }),
    { minX: width, minY: height, maxX: 0, maxY: 0 },
  );
  const paddingRatio = gridCropPaddingRatioFor(params.item.category);
  const padX = Math.round(width * paddingRatio);
  const padY = Math.round(height * paddingRatio);
  const left = Math.max(0, union.minX - padX);
  const top = Math.max(0, union.minY - padY);
  const right = Math.min(width - 1, union.maxX + padX);
  const bottom = Math.min(height - 1, union.maxY + padY);
  const crop = {
    left,
    top,
    width: Math.max(1, right - left + 1),
    height: Math.max(1, bottom - top + 1),
  };
  const contentRatio = (crop.width * crop.height) / (width * height);
  if (contentRatio < minGridContentRatioFor(params.item.category)) return null;
  const bytes = await sharp(params.bytes)
    .extract(crop)
    .jpeg({ quality: 94 })
    .toBuffer({ resolveWithObject: true });
  return {
    data: bytes.data,
    info: bytes.info,
    method: "primary_component" as const,
    componentCount: selected.length,
    contentRatio,
  };
}

async function nonWhiteContentBounds(bytes: Buffer) {
  const raw = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = raw.info;
  if (!width || !height || channels < 4) return null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * channels;
    if (!nonWhitePixel(raw.data, index)) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    count += 1;
  }
  if (maxX < minX || maxY < minY || count < 24) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    contentRatio: count / (width * height),
    touchesEdge:
      minX <= width * 0.025 ||
      minY <= height * 0.025 ||
      maxX >= width * 0.975 ||
      maxY >= height * 0.975,
  };
}

function productCanvasFit(category: GarmentCategory) {
  if (category === Category.BOTTOM) return { width: 0.68, height: 0.9 };
  if (category === Category.FOOTWEAR) return { width: 0.86, height: 0.72 };
  if (category === Category.ACCESSORY) return { width: 0.72, height: 0.72 };
  return { width: 0.82, height: 0.84 };
}

async function normalizeProductCrop(params: {
  bytes: Buffer;
  item: NormalizedDetectedGarment;
}) {
  const canvas = 1024;
  let inputBytes = params.bytes;
  const componentTrim = await primaryComponentTrim({
    bytes: params.bytes,
    item: params.item,
  });
  if (componentTrim) {
    inputBytes = componentTrim.data;
  }
  const fit = productCanvasFit(params.item.category);
  const image = await sharp(inputBytes)
    .rotate()
    .resize({
      width: Math.round(canvas * fit.width),
      height: Math.round(canvas * fit.height),
      fit: "inside",
      withoutEnlargement: false,
    })
    .jpeg({ quality: 94 })
    .toBuffer();
  const metadata = await sharp(image).metadata();
  const resizedWidth = Number(metadata.width ?? 0);
  const resizedHeight = Number(metadata.height ?? 0);
  const left = Math.max(0, Math.round((canvas - resizedWidth) / 2));
  const top = Math.max(0, Math.round((canvas - resizedHeight) / 2));
  const normalized = await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 3,
      background: "#ffffff",
    },
  })
    .composite([{ input: image, left, top }])
    .jpeg({ quality: 94 })
    .toBuffer();
  return {
    bytes: normalized,
    canvas,
    resizedWidth,
    resizedHeight,
    fit,
    trimMethod: componentTrim?.method ?? "safe_square_canvas",
  };
}

async function cropExpectedGridCellImage(params: {
  inputBytes: Buffer;
  item: NormalizedDetectedGarment;
  gridCell: ExpectedLayoutGridCell;
  layoutItem?: LocatedLayoutItem | null;
  imageWidth: number;
  imageHeight: number;
}) {
  const paddingRatio = gridCropPaddingRatioFor(params.item.category);
  const bboxInsideCell =
    !!params.layoutItem &&
    !layoutCropRejectReason(params.layoutItem) &&
    boxCenterInsideCell(params.layoutItem.boundingBox, params.gridCell.boundingBox);
  let usedFullCell = !bboxInsideCell;
  let cellEdgeGuardTriggered = false;
  let normalizedCropBox = params.gridCell.boundingBox;
  if (bboxInsideCell && params.layoutItem) {
    const expanded = expandNormalizedBox(params.layoutItem.boundingBox, paddingRatio);
    normalizedCropBox = expanded;
    if (boxTouchesCellEdge(expanded, params.gridCell.boundingBox)) {
      cellEdgeGuardTriggered = true;
      usedFullCell = true;
      normalizedCropBox = params.gridCell.boundingBox;
    }
  }

  let crop = pixelCropForNormalizedBox(
    normalizedCropBox,
    params.imageWidth,
    params.imageHeight,
  );
  if (
    crop.width < 64 ||
    crop.height < 64 ||
    !aspectRatioValidForCategory(params.item.category, crop.width, crop.height)
  ) {
    usedFullCell = true;
    crop = pixelCropForNormalizedBox(
      params.gridCell.boundingBox,
      params.imageWidth,
      params.imageHeight,
    );
  }

  let cropBytes = await sharp(params.inputBytes)
    .rotate()
    .extract(crop)
    .jpeg({ quality: 94 })
    .toBuffer();
  const contentBounds = await nonWhiteContentBounds(cropBytes);
  let edgeGuardTriggered = false;
  if (contentBounds?.touchesEdge && !usedFullCell) {
    edgeGuardTriggered = true;
    usedFullCell = true;
    crop = pixelCropForNormalizedBox(
      params.gridCell.boundingBox,
      params.imageWidth,
      params.imageHeight,
    );
    cropBytes = await sharp(params.inputBytes)
      .rotate()
      .extract(crop)
      .jpeg({ quality: 94 })
      .toBuffer();
  }

  const contentRatio = contentBounds?.contentRatio ?? (crop.width * crop.height) / (params.imageWidth * params.imageHeight);
  if (contentRatio < minGridContentRatioFor(params.item.category)) {
    throw new Error(`grid_cell_empty:${contentRatio.toFixed(4)}`);
  }
  const layoutBytes = await sharp(cropBytes)
    .resize({
      width: MAX_CROP_DIMENSION,
      height: MAX_CROP_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 94 })
    .toBuffer();
  const normalized = await normalizeProductCrop({
    bytes: cropBytes,
    item: params.item,
  });
  return {
    bytes: layoutBytes,
    normalizedBytes: normalized.bytes,
    crop,
    contentRatio,
    bboxInsideCell,
    usedFullCell,
    edgeGuardTriggered: edgeGuardTriggered || cellEdgeGuardTriggered,
    paddingRatio,
    trimmed: {
      width: normalized.resizedWidth,
      height: normalized.resizedHeight,
      method: normalized.trimMethod,
      componentCount: null,
    },
  };
}

async function cropLayoutItemImage(params: {
  inputBytes: Buffer;
  item: NormalizedDetectedGarment;
  layoutBox: BoundingBox;
  imageWidth: number;
  imageHeight: number;
}) {
  const crop = paddedLayoutCropForBox(
    params.layoutBox,
    params.imageWidth,
    params.imageHeight,
    params.item.category,
  );
  const bytes = await sharp(params.inputBytes)
    .rotate()
    .extract(crop)
    .resize({
      width: MAX_CROP_DIMENSION,
      height: MAX_CROP_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 94 })
    .toBuffer();
  const normalized = await normalizeProductCrop({
    bytes,
    item: params.item,
  });
  return { bytes, normalizedBytes: normalized.bytes, crop, normalized };
}

function layoutCropRejectReason(item: LocatedLayoutItem | null) {
  if (!item) return "bbox_not_found";
  if (!item.visible) return "not_visible";
  if (item.confidence < LAYOUT_CROP_CONFIDENCE_THRESHOLD) return "low_confidence";
  if (isTinyNoisyDetection(item.category, item.boundingBox)) return "tiny_crop";
  return null;
}

function applyLayoutMetadata(
  source: NormalizedDetectedGarment,
  layoutItem: LocatedLayoutItem | null,
): NormalizedDetectedGarment {
  if (!layoutItem) return source;
  return {
    ...source,
    category: layoutItem.category,
    subcategory: layoutItem.subcategory,
    confidence: Math.max(source.confidence, layoutItem.confidence),
    suggestedName: layoutItem.suggestedName || source.suggestedName,
    suggestedColors: layoutItem.suggestedColors.length ? layoutItem.suggestedColors : source.suggestedColors,
    suggestedBrand: layoutItem.suggestedBrand,
    isUnbranded: layoutItem.isUnbranded,
    materialEstimate: layoutItem.materialEstimate,
    material: layoutItem.materialEstimate[0] ?? source.material,
    pattern: layoutItem.pattern ?? source.pattern,
    fit: layoutItem.fit,
    styleAesthetic: layoutItem.styleAesthetic,
  };
}

async function processLayoutItem(params: {
  uid: string;
  traceId: string;
  sourceInput: ImageInput;
  sourceImageUrl: string | null;
  sourceImageWidth: number;
  sourceImageHeight: number;
  layoutBytes: Buffer;
  layoutImageWidth: number;
  layoutImageHeight: number;
  reconstructedLayoutUrl: string;
  sourceItem: NormalizedDetectedGarment;
  gridCell: ExpectedLayoutGridCell | null;
  layoutItem: LocatedLayoutItem | null;
}) {
  const sourceItem = applyLayoutMetadata(params.sourceItem, params.layoutItem);
  const storageBase = `users/${params.uid}/outfitExtraction/${params.traceId}/${sourceItem.tempId}`;
  const originalCropResult = await cropGarmentImage({
    inputBytes: params.sourceInput.bytes,
    item: sourceItem,
    imageWidth: params.sourceImageWidth,
    imageHeight: params.sourceImageHeight,
  });
  const originalCropStoragePath = `${storageBase}.original-crop.jpg`;
  const originalCropUrl = await uploadImageAndGetUrl(
    originalCropStoragePath,
    originalCropResult.bytes,
    "image/jpeg",
  );

  let cropImageUrl = originalCropUrl;
  let cropStoragePath = originalCropStoragePath;
  let layoutCropUrl: string | null = null;
  let normalizedImageUrl: string | null = null;
  let normalizedStoragePath: string | null = null;
  let boundingBoxOnLayout: BoundingBox | null = null;
  let extractionMethod: LayoutExtractionMethod = "original_crop_fallback";
  const reconstructionWarnings = new Set<string>();
  const extractionWarnings = new Set(sourceItem.extractionWarnings);
  let fallbackReason: string | null = null;
  logGridCrop({
    traceId: params.traceId,
    item: sourceItem.tempId,
    category: sourceItem.category,
    data: {
      sourceAwareMode: "layout_reconstruction",
      padding: Math.round(gridCropPaddingRatioFor(sourceItem.category) * 100),
      hasGridCell: !!params.gridCell,
      hasLayoutBBox: !!params.layoutItem,
    },
  });

  if (params.gridCell) {
    logOutfitLayout({
      traceId: params.traceId,
      step: "grid_cell_crop_started",
      status: "start",
      data: {
        sourceTempId: sourceItem.tempId,
        category: sourceItem.category,
        slot: params.gridCell.slot,
        gridCell: params.gridCell.boundingBox,
      },
    });
    try {
      const gridCropResult = await cropExpectedGridCellImage({
        inputBytes: params.layoutBytes,
        item: sourceItem,
        gridCell: params.gridCell,
        layoutItem: params.layoutItem,
        imageWidth: params.layoutImageWidth,
        imageHeight: params.layoutImageHeight,
      });
      const gridCropStoragePath = `${storageBase}.grid-crop.jpg`;
      layoutCropUrl = await uploadImageAndGetUrl(
        gridCropStoragePath,
        gridCropResult.bytes,
        "image/jpeg",
      );
      normalizedStoragePath = `${storageBase}.normalized.jpg`;
      normalizedImageUrl = await uploadImageAndGetUrl(
        normalizedStoragePath,
        gridCropResult.normalizedBytes,
        "image/jpeg",
      );
      cropImageUrl = normalizedImageUrl;
      cropStoragePath = normalizedStoragePath;
      boundingBoxOnLayout = params.gridCell.boundingBox;
      extractionMethod = "layout_grid_crop";
      logOutfitLayout({
        traceId: params.traceId,
        step: "grid_crop_expanded",
        status: "success",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          padding: Math.round(gridCropResult.paddingRatio * 100),
          usedFullCell: gridCropResult.usedFullCell,
          bboxRefinementInsideCell: gridCropResult.bboxInsideCell,
        },
      });
      if (gridCropResult.edgeGuardTriggered) {
        logOutfitLayout({
          traceId: params.traceId,
          step: "grid_crop_edge_guard_triggered",
          status: "fallback",
          data: {
            sourceTempId: sourceItem.tempId,
            category: sourceItem.category,
            reason: "content_touched_crop_edge",
          },
        });
      }
      logOutfitLayout({
        traceId: params.traceId,
        step: "grid_cell_crop_created",
        status: "success",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          slot: params.gridCell.slot,
          cropStoragePath,
          layoutCropStoragePath: gridCropStoragePath,
          normalizedStoragePath,
          gridCell: params.gridCell.boundingBox,
          crop: gridCropResult.crop,
          contentRatio: gridCropResult.contentRatio,
          bboxRefinementInsideCell: gridCropResult.bboxInsideCell,
          trimmed: gridCropResult.trimmed,
        },
      });
      logOutfitLayout({
        traceId: params.traceId,
        step: "normalized_product_image_created",
        status: "success",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          normalizedStoragePath,
          canvas: 1024,
        },
      });
    } catch (error) {
      fallbackReason = error instanceof Error && error.message.startsWith("grid_cell_empty")
        ? "grid_cell_empty"
        : "grid_cell_crop_failed";
      logOutfitLayout({
        traceId: params.traceId,
        step: "grid_cell_crop_empty",
        status: "fallback",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          slot: params.gridCell.slot,
          reason: fallbackReason,
          ...safeError(error),
        },
      });
      logOutfitLayout({
        traceId: params.traceId,
        step: "grid_cell_crop_fallback_to_bbox",
        status: "fallback",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          slot: params.gridCell.slot,
          reason: fallbackReason,
        },
      });
    }
  } else {
    fallbackReason = "grid_cell_unavailable";
    logOutfitLayout({
      traceId: params.traceId,
      step: "grid_cell_crop_fallback_to_bbox",
      status: "fallback",
      data: {
        sourceTempId: sourceItem.tempId,
        category: sourceItem.category,
        reason: fallbackReason,
      },
    });
  }

  const rejectReason = layoutCropRejectReason(params.layoutItem);
  if (!layoutCropUrl && rejectReason) {
    if (rejectReason === "bbox_not_found") {
      logOutfitLayout({
        traceId: params.traceId,
        step: "layout_bbox_missing",
        status: "fallback",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          subcategory: sourceItem.subcategory,
          name: sourceItem.suggestedName,
          reason: rejectReason,
        },
      });
    }
    logOutfitLayout({
      traceId: params.traceId,
      step: "layout_crop_rejected",
      status: "skip",
      data: {
        sourceTempId: sourceItem.tempId,
        category: sourceItem.category,
        reason: rejectReason,
        confidence: params.layoutItem?.confidence ?? null,
      },
    });
  } else if (!layoutCropUrl && params.layoutItem) {
    try {
      const layoutCropResult = await cropLayoutItemImage({
        inputBytes: params.layoutBytes,
        item: sourceItem,
        layoutBox: params.layoutItem.boundingBox,
        imageWidth: params.layoutImageWidth,
        imageHeight: params.layoutImageHeight,
      });
      const layoutCropStoragePath = `${storageBase}.layout-crop.jpg`;
      layoutCropUrl = await uploadImageAndGetUrl(
        layoutCropStoragePath,
        layoutCropResult.bytes,
        "image/jpeg",
      );
      normalizedStoragePath = `${storageBase}.normalized.jpg`;
      normalizedImageUrl = await uploadImageAndGetUrl(
        normalizedStoragePath,
        layoutCropResult.normalizedBytes,
        "image/jpeg",
      );
      cropImageUrl = normalizedImageUrl;
      cropStoragePath = normalizedStoragePath;
      boundingBoxOnLayout = params.layoutItem.boundingBox;
      extractionMethod = "layout_bbox_crop";
      logOutfitLayout({
        traceId: params.traceId,
        step: "layout_bbox_crop_created",
        status: "success",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          cropStoragePath,
          layoutCropStoragePath,
          normalizedStoragePath,
          boundingBoxOnLayout,
          confidence: params.layoutItem.confidence,
          crop: layoutCropResult.crop,
        },
      });
      logOutfitLayout({
        traceId: params.traceId,
        step: "normalized_product_image_created",
        status: "success",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          normalizedStoragePath,
          canvas: 1024,
        },
      });
    } catch (error) {
      reconstructionWarnings.add("Layout crop failed; using original crop.");
      fallbackReason = "layout_bbox_crop_failed";
      logOutfitLayout({
        traceId: params.traceId,
        step: "layout_crop_rejected",
        status: "fallback",
        data: {
          sourceTempId: sourceItem.tempId,
          category: sourceItem.category,
          reason: fallbackReason,
          ...safeError(error),
        },
      });
      logOutfitLayout({
        traceId: params.traceId,
        step: "layout_crop_fallback",
        status: "fallback",
        data: {
          tempId: sourceItem.tempId,
          category: sourceItem.category,
          reason: fallbackReason,
          ...safeError(error),
        },
      });
    }
  }

  if (extractionMethod === "original_crop_fallback") {
    reconstructionWarnings.add("Layout reconstruction missed this item; using original crop.");
    extractionWarnings.add("Original crop.");
    logOutfitLayout({
      traceId: params.traceId,
      step: "original_crop_fallback",
      status: "fallback",
      data: {
        sourceTempId: sourceItem.tempId,
        category: sourceItem.category,
        reason: rejectReason ?? fallbackReason ?? (params.layoutItem ? "layout_crop_unavailable" : "bbox_not_found"),
        originalCropStoragePath,
      },
    });
    logOutfitLayout({
      traceId: params.traceId,
      step: "layout_crop_fallback",
      status: "fallback",
      data: {
        sourceTempId: sourceItem.tempId,
        category: sourceItem.category,
        reason: rejectReason ?? fallbackReason ?? (params.layoutItem ? "layout_crop_unavailable" : "bbox_not_found"),
        originalCropStoragePath,
      },
    });
  }
  if (sourceItem.confidence < reviewConfidenceFor(sourceItem.category)) {
    extractionWarnings.add("Needs review.");
  }

  const selectedByDefault = selectedByDefaultForLayout(sourceItem, extractionMethod);
  const maskInfo: ExtractedGarment["maskInfo"] =
    extractionMethod === "original_crop_fallback"
      ? {
          method: "not_available",
          source: "server",
          warning: "Original crop.",
        }
      : {
          method: "not_available",
          source: "server",
        };
  return {
    ...sourceItem,
    extractionWarnings: Array.from(extractionWarnings).slice(0, 8),
    maskInfo,
    cropImageUrl,
    originalOutfitImageUrl: params.sourceImageUrl,
    originalCropUrl,
    refinedImageUrl: null,
    cleanedImageUrl: normalizedImageUrl,
    normalizedImageUrl,
    imageSource: "outfit_layout_reconstruction" as const,
    reconstructedLayoutUrl: params.reconstructedLayoutUrl,
    layoutCropUrl,
    boundingBoxOnLayout,
    extractionMethod,
    metadataSource: params.layoutItem ? "layout_one_shot" as const : null,
    reconstructionWarnings: Array.from(reconstructionWarnings),
    selectedByDefault,
    extractionQuality: {
      ...extractionQualityForLayout(sourceItem, extractionMethod),
      hasCleanedImageUrl: !!normalizedImageUrl,
      rawCropFallback: extractionMethod === "original_crop_fallback",
      fallbackUsed: extractionMethod === "original_crop_fallback",
    },
    imageQuality: fallbackQuality(
      isLayoutCropMethod(extractionMethod) ? "layout_reconstruction_crop" : "layout_original_crop_fallback",
    ),
    autoPolishApplied: false,
    userPolished: false,
    imageState: "cropped" as const,
    polishAvailable: sourceItem.category === Category.ACCESSORY,
    polishSkippedReason: sourceItem.category === Category.ACCESSORY ? "accessory_auto_skip" as const : null,
    polishApplied: false,
    cutoutApplied: false,
    extractionMetadata: {
      source: "outfit_photo" as const,
      sourceImageStoragePath: params.sourceInput.sourceStoragePath,
      cropStoragePath,
      refinedStoragePath: null,
      cleanedStoragePath: normalizedStoragePath,
      normalizedStoragePath,
      polishApplied: false,
      polishWarnings: sourceItem.category === Category.ACCESSORY ? ["accessory_auto_skip"] : [],
      backgroundRemovalApplied: false,
    },
  };
}

function qualityPreferences(data: Record<string, unknown>) {
  const input = data.qualityPreferences && typeof data.qualityPreferences === "object"
    ? (data.qualityPreferences as Record<string, unknown>)
    : {};
  const preferSpeed = input.preferSpeed === true;
  const maxItems = Number(input.maxItems ?? MAX_DETECTED_ITEMS);
  const maxAllowedItems = preferSpeed ? FAST_EXTRACTION_MAX_ITEMS : MAX_DETECTED_ITEMS;
  return {
    maxItems: Number.isFinite(maxItems)
      ? Math.max(1, Math.min(maxAllowedItems, Math.floor(maxItems)))
      : maxAllowedItems,
    preferSpeed,
    skipPolish: input.skipPolish === true,
    skipBackgroundRemoval: input.skipBackgroundRemoval === true,
    skipQualityScoring: input.skipQualityScoring === true,
  };
}

export const extractOutfitItems = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 540, memory: "1GiB" },
  tracedHandler(async (request) => {
    const data = (request.data ?? {}) as Record<string, unknown>;
    const traceId = cleanTraceId(data.traceId);
    const requestStartedAt = Date.now();
    const uid = request.auth?.uid;
    logOutfitExtraction({
      traceId,
      step: "callable_received",
      status: "start",
      data: {
        hasAuth: !!uid,
        hasImageUrl: !!String(data.imageUrl ?? "").trim(),
        hasStoragePath: !!String(data.storagePath ?? "").trim(),
      },
    });

    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }
    setLogContext({ uidHash: redactUid(uid) });
    const featureState = await getEarlyAccessFeatureState(uid, "outfitExtraction");
    if (!featureState.allowed) {
      throw new HttpsError("failed-precondition", EARLY_ACCESS_ERRORS.featureNotAvailable.message, {
        code: EARLY_ACCESS_ERRORS.featureNotAvailable.code,
        message: EARLY_ACCESS_ERRORS.featureNotAvailable.message,
      });
    }

    const prefs = qualityPreferences(data);
    const extractionBudgetMs = prefs.preferSpeed
      ? FAST_EXTRACTION_TIME_BUDGET_MS
      : STANDARD_EXTRACTION_TIME_BUDGET_MS;
    logOutfitExtraction({
      traceId,
      step: "quality_preferences_resolved",
      status: "success",
      data: {
        maxItems: prefs.maxItems,
        preferSpeed: prefs.preferSpeed,
        skipPolish: prefs.skipPolish,
        skipBackgroundRemoval: prefs.skipBackgroundRemoval,
        skipQualityScoring: prefs.skipQualityScoring,
        extractionBudgetMs,
      },
    });
    const sourceImageUrl = String(data.imageUrl ?? "").trim() || null;
    const input = await readImageInput(uid, data, traceId);
    const metadata = await sharp(input.bytes).metadata();
    const imageWidth = Number(metadata.width ?? 0);
    const imageHeight = Number(metadata.height ?? 0);
    if (!imageWidth || !imageHeight) {
      throw new HttpsError("invalid-argument", "Could not read image dimensions.");
    }
    const imageHash =
      normalizeEarlyAccessImageHash(data.imageHash) ||
      makeEarlyAccessImageHash(input.bytes);
    const modelVersion = outfitExtractionModelVersion(prefs);
    const cached = await getCachedEarlyAccessResult(uid, "outfitExtraction", imageHash, modelVersion);
    if (cached) {
      logOutfitExtraction({
        traceId,
        step: "early_access_cache_checked",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          featureKey: "outfitExtraction",
          cacheHit: true,
          modelVersion,
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

    try {
      await assertFunctionRateLimit(uid, "outfitExtraction", RATE_LIMITS.outfitExtraction);
    } catch (error) {
      logOutfitExtraction({
        traceId,
        step: "rate_limit_checked",
        status: "failure",
        data: safeError(error),
      });
      throw error;
    }

    await checkAndConsumeEarlyAccessUse(uid, "outfitExtraction", {
      runKey: traceId || imageHash,
    });
    logOutfitExtraction({
      traceId,
      step: "early_access_usage_consumed",
      status: "success",
      data: {
        featureKey: "outfitExtraction",
        modelVersion,
      },
    });

    const client = new OpenAI({ apiKey: requireOpenAiApiKey() });

    let detected: NormalizedDetectedGarment[] = [];
    try {
      detected = (await detectGarments(client, input, traceId)).slice(0, prefs.maxItems);
    } catch (error) {
      logOutfitExtraction({
        traceId,
        step: "garment_detection_started",
        status: "failure",
        data: safeError(error),
      });
      throw new HttpsError("internal", "AURA could not detect garments in this outfit photo.");
    }

    const extracted: ExtractedGarment[] = [];
    let failedCount = 0;
    let autoPolishedCoreCount = 0;
    for (const item of detected) {
      const remainingMs = remainingBudgetMs(requestStartedAt, extractionBudgetMs);
      if (remainingMs < MIN_ITEM_START_REMAINING_MS) {
        const skippedCount = detected.length - extracted.length - failedCount;
        failedCount += Math.max(0, skippedCount);
        logOutfitExtraction({
          traceId,
          step: "item_processing_time_budget",
          status: "skip",
          durationMs: durationMs(requestStartedAt),
          data: {
            remainingMs,
            skippedCount,
            extractedCount: extracted.length,
          },
        });
        break;
      }

      try {
        const result = await processDetectedItem({
          client,
          uid,
          traceId,
          input,
          sourceImageUrl,
          item,
          imageWidth,
          imageHeight,
          skipPolish: prefs.skipPolish,
          skipBackgroundRemoval: prefs.skipBackgroundRemoval,
          skipQualityScoring: prefs.skipQualityScoring,
          autoPolishBudgetAvailable: autoPolishedCoreCount < MAX_AUTO_POLISHED_CORE_ITEMS,
        });
        const autoPolishAttempted =
          result.autoPolishApplied ||
          result.extractionMetadata.polishWarnings.includes("product_polish_refinement_failed") ||
          result.extractionMetadata.polishWarnings.includes("product_polish_upload_failed");
        if (autoPolishAttempted) {
          autoPolishedCoreCount += 1;
        }
        extracted.push(result);
      } catch (error) {
        failedCount += 1;
        logOutfitExtraction({
          traceId,
          step: "item_processing_failed",
          status: "failure",
          data: {
            tempId: item.tempId,
            category: item.category,
            ...safeError(error),
          },
        });
      }
    }

    logOutfitExtraction({
      traceId,
      step: "review_ready",
      status: "success",
      durationMs: durationMs(requestStartedAt),
      data: {
        uidHash: redactUid(uid),
        totalDetected: detected.length,
        extractableCount: extracted.length,
        failedCount,
        autoPolishedCoreCount,
        maxAutoPolishedCoreItems: MAX_AUTO_POLISHED_CORE_ITEMS,
      },
    });

    const response = {
      traceId,
      detectedItems: extracted,
      summary: {
        totalDetected: detected.length,
        extractableCount: extracted.length,
        failedCount,
      },
    };
    await setCachedEarlyAccessResult(
      uid,
      "outfitExtraction",
      imageHash,
      modelVersion,
      response,
    );
    return response;
  }),
);

export const reconstructOutfitLayout = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 540, memory: "1GiB" },
  tracedHandler(async (request) => {
    const data = (request.data ?? {}) as Record<string, unknown>;
    const traceId = cleanTraceId(data.traceId);
    const uid = request.auth?.uid;
    const requestStartedAt = Date.now();
    logOutfitLayout({
      traceId,
      step: "callable_received",
      status: "start",
      data: {
        hasAuth: !!uid,
        hasImageUrl: !!String(data.imageUrl ?? "").trim(),
        hasStoragePath: !!String(data.storagePath ?? "").trim(),
        hasDetectedItems: Array.isArray(data.detectedItems),
      },
    });

    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }
    setLogContext({ uidHash: redactUid(uid) });
    const featureState = await getEarlyAccessFeatureState(uid, "outfitExtraction");
    if (!featureState.allowed) {
      throw new HttpsError("failed-precondition", EARLY_ACCESS_ERRORS.featureNotAvailable.message, {
        code: EARLY_ACCESS_ERRORS.featureNotAvailable.code,
        message: EARLY_ACCESS_ERRORS.featureNotAvailable.message,
      });
    }

    const sourceImageUrl = String(data.imageUrl ?? "").trim() || null;
    const input = await readImageInput(uid, data, traceId);
    const sourceMetadata = await sharp(input.bytes).metadata();
    const sourceImageWidth = Number(sourceMetadata.width ?? 0);
    const sourceImageHeight = Number(sourceMetadata.height ?? 0);
    if (!sourceImageWidth || !sourceImageHeight) {
      throw new HttpsError("invalid-argument", "Could not read image dimensions.");
    }
    const imageHash =
      normalizeEarlyAccessImageHash(data.imageHash) ||
      makeEarlyAccessImageHash(input.bytes);
    const cached = await getCachedEarlyAccessResult(
      uid,
      "outfitExtraction",
      imageHash,
      OUTFIT_LAYOUT_MODEL_VERSION,
    );
    if (cached) {
      logOutfitLayout({
        traceId,
        step: "early_access_cache_checked",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          featureKey: "outfitExtraction",
          cacheHit: true,
          modelVersion: OUTFIT_LAYOUT_MODEL_VERSION,
        },
      });
      return cached.result;
    }

    let detected = normalizeRequestDetectedItems(data, traceId);
    if (featureState.remaining <= 0) {
      throw new HttpsError("failed-precondition", EARLY_ACCESS_ERRORS.limitReached.message, {
        code: EARLY_ACCESS_ERRORS.limitReached.code,
        message: EARLY_ACCESS_ERRORS.limitReached.message,
      });
    }

    try {
      await assertFunctionRateLimit(
        uid,
        "outfitLayoutReconstruction",
        RATE_LIMITS.outfitLayoutReconstruction,
      );
    } catch (error) {
      logOutfitLayout({
        traceId,
        step: "rate_limit_checked",
        status: "failure",
        data: safeError(error),
      });
      throw error;
    }

    await checkAndConsumeEarlyAccessUse(uid, "outfitExtraction", {
      runKey: traceId || imageHash,
    });
    logOutfitLayout({
      traceId,
      step: "early_access_usage_consumed",
      status: "success",
      data: {
        featureKey: "outfitExtraction",
        modelVersion: OUTFIT_LAYOUT_MODEL_VERSION,
      },
    });

    const client = new OpenAI({ apiKey: requireOpenAiApiKey() });
    if (!detected.length) {
      try {
        detected = (await detectGarments(client, input, traceId)).slice(0, MAX_DETECTED_ITEMS);
      } catch (error) {
        logOutfitLayout({
          traceId,
          step: "layout_source_detection_failed",
          status: "failure",
          data: safeError(error),
        });
        throw new HttpsError("internal", "AURA could not understand this outfit photo.");
      }
    }

    if (!detected.length) {
      throw new HttpsError("failed-precondition", "AURA could not detect visible outfit items.");
    }

    const layout = await createReconstructedLayout({
      client,
      uid,
      traceId,
      input,
      detectedItems: detected,
    });
    const layoutMetadata = await sharp(layout.bytes).metadata();
    const layoutImageWidth = Number(layoutMetadata.width ?? 0);
    const layoutImageHeight = Number(layoutMetadata.height ?? 0);
    if (!layoutImageWidth || !layoutImageHeight) {
      throw new HttpsError("internal", "AURA could not read the reconstructed layout.");
    }

    let locatedLayoutItems: LocatedLayoutItem[] = [];
    try {
      locatedLayoutItems = await extractLayoutItemsMetadata({
        client,
        reconstructedLayoutUrl: layout.url,
        traceId,
        sourceItems: detected,
      });
    } catch (error) {
      logOutfitLayout({
        traceId,
        step: "layout_metadata_success",
        status: "failure",
        data: safeError(error),
      });
      try {
        locatedLayoutItems = await locateItemsInReconstructedLayout({
          client,
          reconstructedLayoutUrl: layout.url,
          traceId,
          sourceItems: detected,
        });
      } catch (locatorError) {
        logOutfitLayout({
          traceId,
          step: "layout_locator_success",
          status: "failure",
          data: safeError(locatorError),
        });
      }
    }

    const locatedBySourceId = new Map(
      locatedLayoutItems.map((item) => [item.sourceTempId, item]),
    );
    const expectedGridCells = buildExpectedLayoutGridCells(detected);
    const layoutItems: ExtractedGarment[] = [];
    let failedCount = 0;
    for (const sourceItem of detected.slice(0, MAX_DETECTED_ITEMS)) {
      try {
        const extracted = await processLayoutItem({
          uid,
          traceId,
          sourceInput: input,
          sourceImageUrl,
          sourceImageWidth,
          sourceImageHeight,
          layoutBytes: layout.bytes,
          layoutImageWidth,
          layoutImageHeight,
          reconstructedLayoutUrl: layout.url,
          sourceItem,
          gridCell: expectedGridCells.get(sourceItem.tempId) ?? null,
          layoutItem: locatedBySourceId.get(sourceItem.tempId) ?? null,
        });
        logOutfitLayout({
          traceId,
          step: "item_review_image_selected",
          status: "success",
          data: {
            sourceTempId: sourceItem.tempId,
            category: sourceItem.category,
            method: extracted.extractionMethod,
            hasLayoutCropUrl: !!extracted.layoutCropUrl,
          },
        });
        layoutItems.push(extracted);
      } catch (error) {
        failedCount += 1;
        logOutfitLayout({
          traceId,
          step: "layout_crop_fallback",
          status: "failure",
          data: {
            tempId: sourceItem.tempId,
            category: sourceItem.category,
            ...safeError(error),
          },
        });
      }
    }

    logOutfitLayout({
      traceId,
      step: "review_ready",
      status: "success",
      durationMs: durationMs(requestStartedAt),
      data: {
        uidHash: redactUid(uid),
        totalDetected: detected.length,
        layoutDetected: locatedLayoutItems.length,
        extractableCount: layoutItems.length,
        failedCount,
        gridCropCount: layoutItems.filter((item) => item.extractionMethod === "layout_grid_crop").length,
        bboxCropCount: layoutItems.filter((item) => item.extractionMethod === "layout_bbox_crop").length,
        layoutCropCount: layoutItems.filter((item) => isLayoutCropMethod(item.extractionMethod ?? "original_crop_fallback")).length,
        originalFallbackCount: layoutItems.filter(
          (item) => item.extractionMethod === "original_crop_fallback",
        ).length,
      },
    });

    const response = {
      traceId,
      reconstructedLayoutUrl: layout.url,
      layoutItems,
      summary: {
        totalDetected: detected.length,
        extractableCount: layoutItems.length,
        failedCount,
      },
    };
    await setCachedEarlyAccessResult(
      uid,
      "outfitExtraction",
      imageHash,
      OUTFIT_LAYOUT_MODEL_VERSION,
      response,
    );
    return response;
  }),
);

export const polishExtractedAccessory = onCall(
  { secrets: ["OPENAI_API_KEY"], timeoutSeconds: 240, memory: "1GiB" },
  tracedHandler(async (request) => {
    const data = (request.data ?? {}) as Record<string, unknown>;
    const traceId = cleanTraceId(data.traceId);
    const uid = request.auth?.uid;
    const itemTempId = cleanTempId(data.itemTempId);
    const cropImageUrl = String(data.cropImageUrl ?? "").trim();
    const requestStartedAt = Date.now();
    logOutfitExtraction({
      traceId,
      step: "accessory_polish_requested",
      status: "start",
      data: {
        hasAuth: !!uid,
        itemTempId,
        hasCropImageUrl: !!cropImageUrl,
      },
    });

    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }
    setLogContext({ uidHash: redactUid(uid) });
    const featureState = await getEarlyAccessFeatureState(uid, "aiPolish");
    if (!featureState.allowed) {
      throw new HttpsError("failed-precondition", EARLY_ACCESS_ERRORS.featureNotAvailable.message, {
        code: EARLY_ACCESS_ERRORS.featureNotAvailable.code,
        message: EARLY_ACCESS_ERRORS.featureNotAvailable.message,
      });
    }

    const category = normalizeCategory(data.category);
    if (category !== Category.ACCESSORY) {
      throw new HttpsError("invalid-argument", "Only extracted accessories can be polished here.");
    }
    if (!cropImageUrl) {
      throw new HttpsError("invalid-argument", "Provide the accessory crop image.");
    }
    const cropStoragePath = extractStoragePathFromUrl(cropImageUrl);
    if (!isUserOwnedStoragePath(uid, cropStoragePath)) {
      throw new HttpsError("permission-denied", "Accessory crop must belong to the signed-in user.");
    }

    const subcategory = normalizeSubcategory(category, data.subcategory);
    const suggestedName =
      cleanText(data.suggestedName) || defaultNameFor(category, subcategory, []);
    const item: NormalizedDetectedGarment = {
      tempId: itemTempId,
      category,
      subcategory,
      confidence: 1,
      boundingBox: { x: 0, y: 0, w: 1, h: 1 },
      suggestedName,
      suggestedColors: [],
      suggestedBrand: null,
      material: null,
      pattern: null,
      extractionWarnings: [],
    };
    const cropInput = await readImageInput(uid, { imageUrl: cropImageUrl }, traceId);
    const imageHash =
      normalizeEarlyAccessImageHash(data.imageHash) ||
      makeEarlyAccessImageHash(cropInput.bytes);
    const cached = await getCachedEarlyAccessResult(
      uid,
      "aiPolish",
      imageHash,
      ACCESSORY_POLISH_MODEL_VERSION,
    );
    if (cached) {
      logOutfitExtraction({
        traceId,
        step: "early_access_cache_checked",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          featureKey: "aiPolish",
          cacheHit: true,
          itemTempId,
          modelVersion: ACCESSORY_POLISH_MODEL_VERSION,
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

    try {
      await assertFunctionRateLimit(uid, "accessoryPolish", RATE_LIMITS.accessoryPolish);
    } catch (error) {
      logOutfitExtraction({
        traceId,
        step: "rate_limit_checked",
        status: "failure",
        data: safeError(error),
      });
      throw error;
    }

    await checkAndConsumeEarlyAccessUse(uid, "aiPolish", {
      runKey: imageHash,
    });
    logOutfitExtraction({
      traceId,
      step: "early_access_usage_consumed",
      status: "success",
      data: {
        featureKey: "aiPolish",
        itemTempId,
        modelVersion: ACCESSORY_POLISH_MODEL_VERSION,
      },
    });

    const client = new OpenAI({ apiKey: requireOpenAiApiKey() });

    try {
      const refinedBytes = await refineCropImage({
        client,
        uid,
        traceId,
        item,
        bytes: cropInput.bytes,
        conservative: true,
      });
      const storageBase = `users/${uid}/outfitExtraction/${traceId}/${itemTempId}`;
      const refinedStoragePath = `${storageBase}.accessory-refined.jpg`;
      const refinedImageUrl = await uploadImageAndGetUrl(
        refinedStoragePath,
        refinedBytes,
        "image/jpeg",
      );
      let cleanedImageUrl: string | null = null;
      let cleanedStoragePath: string | null = null;
      const warnings: string[] = [];
      try {
        const cutoutBytes = await createCleanedCutout({
          traceId,
          item,
          bytes: refinedBytes,
        });
        cleanedStoragePath = `${storageBase}.accessory-cleaned.png`;
        cleanedImageUrl = await uploadImageAndGetUrl(cleanedStoragePath, cutoutBytes, "image/png");
      } catch (error) {
        warnings.push("accessory_background_removal_failed");
        logOutfitExtraction({
          traceId,
          step: "accessory_polish_failed",
          status: "fallback",
          durationMs: durationMs(requestStartedAt),
          data: {
            itemTempId,
            reason: "background_removal_failed",
            ...safeError(error),
          },
        });
      }

      logOutfitExtraction({
        traceId,
        step: "accessory_polish_success",
        status: "success",
        durationMs: durationMs(requestStartedAt),
        data: {
          itemTempId,
          hasCleanedImageUrl: !!cleanedImageUrl,
          refinedStoragePath,
          cleanedStoragePath,
        },
      });

      const response = {
        refinedImageUrl,
        cleanedImageUrl,
        refinedStoragePath,
        cleanedStoragePath,
        imageState: "polished" as const,
        userPolished: true,
        warnings,
      };
      await setCachedEarlyAccessResult(
        uid,
        "aiPolish",
        imageHash,
        ACCESSORY_POLISH_MODEL_VERSION,
        response,
      );
      return response;
    } catch (error) {
      logOutfitExtraction({
        traceId,
        step: "accessory_polish_failed",
        status: "failure",
        durationMs: durationMs(requestStartedAt),
        data: {
          itemTempId,
          ...safeError(error),
        },
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "AURA could not polish this accessory.");
    }
  }),
);
