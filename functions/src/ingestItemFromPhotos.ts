import { createHash, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { removeBackground } from "@imgly/background-removal-node";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import sharp from "sharp";
import {
  ALLOWED_AESTHETIC_TAGS,
  ALLOWED_COLORS,
  ALLOWED_FORMALITY,
  ALLOWED_LAYER_ROLES,
  ALLOWED_VISUAL_WEIGHT,
  ALLOWED_WARMTH,
  AllowedColor,
  Category,
  SUB_CATEGORIES,
  isValidCategorySubCategory,
  wearSlot,
} from "./shared/wardrobeTaxonomy";
import { redactUrlForLogs, safeFetch, validateSafeUrlForFetch } from "./shared/safeFetch";

if (!getApps().length) {
  initializeApp();
}

type IngestionStatus =
  | "awaiting_confirmation"
  | "pending"
  | "processing"
  | "done"
  | "failed";

type ItemDoc = {
  images?: {
    originalUrl?: string | null;
    cleanedUrl?: string | null;
    isPrimary?: boolean;
  }[] | null;
  brand?: string | null;
  name?: string | null;
  brandConfidence?: number;
  brandEvidence?: string;
  brandCandidates?: string[];
  brandSource?: "ai" | "user";
  brandUpdatedAt?: number;
  category?: string;
  subCategory?: string;
  type?: string | null;
  fit?: string;
  style?: string;
  sleeveLength?: string;
  neckline?: string;
  closure?: string;
  length?: string;
  rise?: string;
  legShape?: string;
  hasLogo?: boolean;
  logoPlacement?: string;
  occasionTags?: string[];
  seasonTags?: string[];
  aestheticTags?: string[];
  formality?: string | null;
  warmth?: string | null;
  layerRole?: string | null;
  visualWeight?: string | null;
  versatilityScore?: number | null;
  photos?: {
    originalUrl?: string | null;
    primaryUrl?: string | null;
    urls?: string[];
    images?: {
      originalUrl?: string | null;
      cleanedUrl?: string | null;
      isPrimary?: boolean;
    }[];
    cleanedUrl?: string | null;
    cleanedPhotoUrl?: string | null;
    normalizedUrl?: string | null;
    croppedUrl?: string;
    thumbUrl?: string;
  };
  photoUrl?: string | null;
  originalImageUrl?: string | null;
  cleanedImageUrl?: string | null;
  photoUri?: string | null;
  colors?: string[];
  colorLabel?: string;
  primaryColor?: string;
  displayColor?: string | null;
  displayColors?: string[] | null;
  colorSource?: "ai" | "user";
  colorUpdatedAt?: number;
  aiColorLabel?: string;
  aiColors?: string[];
  pixelColors?: string[];
  pixelColorHex?: string;
  colorConfidence?: number;
  colorNeedsReview?: boolean;
  aiDebug?: {
    brandEvidence?: string | null;
    brandCandidates?: string[] | null;
    aiColors?: string[] | null;
    aiPrimaryColor?: string | null;
    aiColorLabel?: string | null;
    pixelColors?: string[] | null;
    pixelColorHex?: string | null;
    colorConfidence?: number | null;
    colorNeedsReview?: boolean | null;
  } | null;
  crop?: { x: number; y: number; w: number; h: number; source: "ai" };
  ingestion?: {
    status?: IngestionStatus;
    lastRunAt?: Timestamp | { toMillis?: () => number } | number | null;
    error?: { message: string; code?: string };
    lastProcessedPhotoHash?: string;
    lastProcessedSourceHash?: string;
    runId?: string;
  };
  ingestionStatus?: string | null;
  isDraft?: boolean | null;
  draftState?: string | null;
  ingestionSource?: {
    sourceHash?: string;
    sourceType?: string;
  };
  itemLifecycleStatus?: string | null;
  removedAt?: number | null;
  cleanedFromHash?: string;
  backgroundRemovalMethod?: "client" | "server" | "none";
};

type RawExtraction = {
  brand?: string | null;
  brandConfidence?: number;
  brandEvidence?: "text" | "logo" | "tag" | "unknown";
  brandCandidates?: string[];
  category?: string;
  subCategory?: string;
  type?: string | null;
  name?: string | null;
  colors?: string[];
  primaryColor?: string | null;
  displayColor?: string | null;
  displayColors?: string[] | null;
  pattern?: string;
  material?: string;
  materialConfidence?: number;
  fit?:
    | "slim"
    | "regular"
    | "relaxed"
    | "oversized"
    | "cropped"
    | "tailored"
    | "unknown";
  style?:
    | "casual"
    | "smart_casual"
    | "formal"
    | "athleisure"
    | "streetwear"
    | "workwear"
    | "luxury"
    | "minimal"
    | "unknown";
  sleeveLength?: "sleeveless" | "short" | "three_quarter" | "long" | "unknown";
  neckline?: "crew" | "v_neck" | "collar" | "hood" | "mock_neck" | "unknown";
  closure?: "pullover" | "zip" | "button" | "snap" | "none" | "unknown";
  length?: "cropped" | "regular" | "long" | "unknown";
  rise?: "low" | "mid" | "high" | "unknown";
  legShape?:
    | "skinny"
    | "slim"
    | "straight"
    | "tapered"
    | "wide"
    | "flare"
    | "unknown";
  hasLogo?: boolean;
  logoPlacement?:
    | "chest"
    | "sleeve"
    | "back"
    | "waist"
    | "leg"
    | "all_over"
    | "unknown";
  occasionTags?: string[];
  seasonTags?: string[];
  aestheticTags?: string[];
  formality?:
    | "casual"
    | "smart_casual"
    | "formal"
    | "athletic"
    | "lounge"
    | "party"
    | "streetwear"
    | null;
  warmth?: "light" | "medium" | "heavy" | null;
  layerRole?: "base" | "mid" | "outer" | null;
  visualWeight?: "minimal" | "balanced" | "bold" | null;
  versatilityScore?: number | null;
  confidence?: {
    category?: number;
    subCategory?: number;
    colors?: number;
    brand?: number;
    material?: number;
  };
  detailTags?: string[];
  confidenceSummary?: {
    overall?: number;
    notes?: string;
  };
  formalityScore?: number;
  warmthScore?: number;
  bbox?: { x?: number; y?: number; w?: number; h?: number };
};
type LastRunAtValue =
  | Timestamp
  | { toMillis?: () => number }
  | number
  | null
  | undefined;

const MODEL = "gpt-5.4-mini";
const HOUR_MS = 60 * 60 * 1000;
const ALLOWED_PATTERNS = new Set([
  "solid",
  "striped",
  "plaid",
  "graphic",
  "checked",
  "logo",
  "text",
  "floral",
  "dots",
  "camouflage",
  "textured",
  "monogram",
  "other",
  "unknown",
]);
const ALLOWED_MATERIALS = new Set([
  "cotton",
  "denim",
  "polyester",
  "wool",
  "leather",
  "linen",
  "nylon",
  "silk",
  "rayon",
  "fleece",
  "canvas",
  "satin",
  "suede",
  "knit",
  "unknown",
]);
const ALLOWED_FITS = new Set([
  "slim",
  "regular",
  "relaxed",
  "oversized",
  "cropped",
  "tailored",
  "unknown",
]);
const ALLOWED_STYLES = new Set([
  "casual",
  "smart_casual",
  "formal",
  "athleisure",
  "streetwear",
  "workwear",
  "luxury",
  "minimal",
  "unknown",
]);
const ALLOWED_FORMALITY_SET = new Set<string>(ALLOWED_FORMALITY);
const ALLOWED_WARMTH_SET = new Set<string>(ALLOWED_WARMTH);
const ALLOWED_LAYER_ROLE_SET = new Set<string>(ALLOWED_LAYER_ROLES);
const ALLOWED_VISUAL_WEIGHT_SET = new Set<string>(ALLOWED_VISUAL_WEIGHT);
const ALLOWED_AESTHETIC_TAG_SET = new Set<string>(ALLOWED_AESTHETIC_TAGS);
const ALLOWED_SLEEVE_LENGTHS = new Set([
  "sleeveless",
  "short",
  "three_quarter",
  "long",
  "unknown",
]);
const ALLOWED_NECKLINES = new Set([
  "crew",
  "v_neck",
  "collar",
  "hood",
  "mock_neck",
  "unknown",
]);
const ALLOWED_CLOSURES = new Set([
  "pullover",
  "zip",
  "button",
  "snap",
  "none",
  "unknown",
]);
const ALLOWED_LENGTHS = new Set(["cropped", "regular", "long", "unknown"]);
const ALLOWED_RISES = new Set(["low", "mid", "high", "unknown"]);
const ALLOWED_LEG_SHAPES = new Set([
  "skinny",
  "slim",
  "straight",
  "tapered",
  "wide",
  "flare",
  "unknown",
]);
const ALLOWED_BRAND_EVIDENCE = new Set(["text", "logo", "tag", "unknown"]);
const ALLOWED_LOGO_PLACEMENTS = new Set([
  "chest",
  "sleeve",
  "back",
  "waist",
  "leg",
  "all_over",
  "unknown",
]);
const ALLOWED_OCCASION_TAGS = new Set([
  "casual",
  "work",
  "gym",
  "party",
  "date",
  "travel",
  "lounge",
  "formal_event",
  "streetwear",
]);
const ALLOWED_SEASON_TAGS = new Set([
  "summer",
  "winter",
  "spring_fall",
  "all_season",
  "spring",
  "fall",
]);
const ALLOWED_COLOR_SET = new Set<string>(ALLOWED_COLORS);
const MIN_CROP_RATIO = 0.3;
function toMillis(value: LastRunAtValue): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return null;
}

function extractPhotoUrls(item: ItemDoc): string[] {
  const values = [
    ...(Array.isArray(item.images)
      ? item.images.flatMap((image) => [image?.cleanedUrl ?? "", image?.originalUrl ?? ""])
      : []),
    ...(Array.isArray(item.photos?.images)
      ? item.photos.images.flatMap((image) => [image?.cleanedUrl ?? "", image?.originalUrl ?? ""])
      : []),
    item.photos?.cleanedUrl ?? "",
    item.photos?.cleanedPhotoUrl ?? "",
    item.photos?.originalUrl ?? "",
    item.photos?.primaryUrl ?? "",
    item.cleanedImageUrl ?? "",
    item.originalImageUrl ?? "",
    item.photoUrl ?? "",
    item.photoUri ?? "",
    ...(Array.isArray(item.photos?.urls) ? item.photos!.urls : []),
  ];

  const deduped = Array.from(
    new Set(values.map((v) => String(v).trim()).filter(Boolean)),
  );
  return deduped.filter((url) => /^https?:\/\//i.test(url));
}

function getIngestionStatus(item: ItemDoc | undefined): IngestionStatus | "" {
  return (item?.ingestion?.status ?? item?.ingestionStatus ?? "")
    .toString()
    .trim()
    .toLowerCase() as IngestionStatus | "";
}

function extractIngestionSourceUrls(item: ItemDoc): string[] {
  const values = [
    ...(Array.isArray(item.images)
      ? item.images.flatMap((image) => [image?.cleanedUrl ?? "", image?.originalUrl ?? ""])
      : []),
    ...(Array.isArray(item.photos?.images)
      ? item.photos.images.flatMap((image) => [image?.cleanedUrl ?? "", image?.originalUrl ?? ""])
      : []),
    item.photos?.cleanedUrl ?? "",
    item.photos?.cleanedPhotoUrl ?? "",
    item.photos?.normalizedUrl ?? "",
    item.photos?.originalUrl ?? "",
    item.photos?.primaryUrl ?? "",
    item.cleanedImageUrl ?? "",
    item.originalImageUrl ?? "",
    item.photoUrl ?? "",
    item.photoUri ?? "",
    ...(Array.isArray(item.photos?.urls) ? item.photos!.urls : []),
  ];
  const deduped = Array.from(
    new Set(values.map((v) => String(v).trim()).filter(Boolean)),
  );
  return deduped.filter((url) => /^https?:\/\//i.test(url));
}

function hashPhotoUrls(urls: string[]): string {
  return createHash("sha1").update(urls.join("|")).digest("hex");
}

function extractStoragePathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex === -1) return null;
      const encodedPath = parsed.pathname.slice(markerIndex + marker.length);
      return decodeURIComponent(encodedPath);
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

function isUserOwnedStoragePath(uid: string, storagePath: string | null) {
  return !!storagePath && storagePath.startsWith(`users/${uid}/`);
}

function extractDownloadTokenFromUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("token");
  } catch {
    return null;
  }
}

function hasClientCleanedImage(item: ItemDoc): boolean {
  const values = [
    ...(Array.isArray(item.images)
      ? item.images.map((image) => image?.cleanedUrl ?? "")
      : []),
    ...(Array.isArray(item.photos?.images)
      ? item.photos.images.map((image) => image?.cleanedUrl ?? "")
      : []),
    item.photos?.cleanedUrl ?? "",
    item.photos?.cleanedPhotoUrl ?? "",
    item.cleanedImageUrl ?? "",
  ];
  return values.some((value) => /^https?:\/\//i.test(String(value ?? "").trim()));
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function clamp01(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizePattern(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (ALLOWED_PATTERNS.has(raw)) return raw;
  return "unknown";
}

function normalizeMaterial(value: unknown): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (ALLOWED_MATERIALS.has(raw)) return raw;
  return "unknown";
}

function normalizeCategory(value: unknown): Category | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!raw) return null;
  if (raw === "shoes" || raw === "shoe") return Category.FOOTWEAR;
  if (raw === "onepiece") return Category.ONE_PIECE;
  if (Object.values(Category).includes(raw as Category)) return raw as Category;
  return null;
}

function normalizeSubCategory(value: unknown): string | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return raw || null;
}

function normalizeEnum(
  value: unknown,
  allowed: Set<string>,
  fallback = "unknown",
): string {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (allowed.has(raw)) return raw;
  return fallback;
}

function normalizeNullableEnum(
  value: unknown,
  allowed: Set<string>,
): string | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (
    !raw ||
    raw === "unknown" ||
    raw === "n/a" ||
    raw === "na" ||
    raw === "null"
  ) {
    return null;
  }
  if (allowed.has(raw)) return raw;
  return null;
}

function normalizeFreeTextLabel(value: unknown, maxLength = 48): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/\s+/g, " ")
    .replace(/[^\w\s/&-]/g, "")
    .trim();
  if (!normalized) return null;
  if (["unknown", "n/a", "na", "null"].includes(normalized.toLowerCase()))
    return null;
  return normalized.slice(0, maxLength);
}

function normalizeOptionalTagList(
  value: unknown,
  allowed: Set<string>,
  maxLength: number,
): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const normalized = String(entry ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const expanded =
      normalized === "spring_fall" ? ["spring", "fall"] : [normalized];
    for (const candidate of expanded) {
      if (!allowed.has(candidate)) continue;
      if (!out.includes(candidate)) out.push(candidate);
      if (out.length >= maxLength) break;
    }
    if (out.length >= maxLength) break;
  }
  return out;
}

function normalizeOptionalScore(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeBrand(value: unknown): string | null {
  const raw = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const lowered = raw.toLowerCase();
  if (
    !lowered ||
    lowered === "unknown" ||
    lowered === "n/a" ||
    lowered === "na" ||
    lowered === "null"
  ) {
    return null;
  }
  if (/\b(brand|logo|designer|fashion|unknown|null|none)\b/i.test(raw)) {
    return null;
  }
  return raw;
}

function normalizeBrandCandidates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const normalized = normalizeBrand(entry);
    if (!normalized) continue;
    if (!out.includes(normalized)) out.push(normalized);
    if (out.length >= 5) break;
  }
  return out;
}

function inferCategoryFromSubCategory(
  subCategory: string | null,
): Category | null {
  if (!subCategory) return null;
  for (const category of Object.values(Category) as Category[]) {
    const subCategories = SUB_CATEGORIES[category] as readonly string[];
    if (subCategories.includes(subCategory)) {
      return category;
    }
  }
  return null;
}

function hasBottomGarmentCue(params: {
  subCategory: string | null;
  rise: string | null;
  legShape: string | null;
  bbox?: RawExtraction["bbox"];
}): boolean {
  const inferredCategory = inferCategoryFromSubCategory(params.subCategory);
  if (inferredCategory === Category.BOTTOM) return true;
  if (params.rise && params.rise !== "unknown") return true;
  if (params.legShape && params.legShape !== "unknown") return true;
  const bboxW = Number(params.bbox?.w ?? 0);
  const bboxH = Number(params.bbox?.h ?? 0);
  return bboxW > 0 && bboxH > 0 && bboxH / bboxW >= 1.45;
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function humanizeLabel(value: string): string {
  return toTitleCase(
    String(value ?? "")
      .replace(/_/g, " ")
      .trim(),
  );
}

function normalizeColorToken(raw: string): AllowedColor | null {
  const text = raw.toLowerCase().replace(/[_-]/g, " ").trim();
  if (!text) return null;
  if (text.includes("multi") || text.includes("various")) return null;
  if (text.includes("gray") || text.includes("grey")) return "grey";
  if (text.includes("navy")) return "navy";
  if (text.includes("blue")) return "blue";
  if (text.includes("black")) return "black";
  if (text.includes("white")) return "white";
  if (
    text.includes("cream") ||
    text.includes("ivory") ||
    text.includes("off white")
  ) {
    return "cream";
  }
  if (text.includes("gold")) return "gold";
  if (text.includes("silver")) return "silver";
  if (
    text.includes("beige") ||
    text.includes("tan") ||
    text.includes("khaki")
  ) {
    return "beige";
  }
  if (text.includes("brown")) return "brown";
  if (text.includes("red")) return "red";
  if (text.includes("green")) return "green";
  if (text.includes("yellow")) return "yellow";
  if (text.includes("orange")) return "orange";
  if (text.includes("pink")) return "pink";
  if (text.includes("purple")) return "purple";
  return null;
}

function normalizeColors(values: unknown): {
  colors: AllowedColor[];
  colorLabel?: string;
} {
  if (!Array.isArray(values)) return { colors: [] };

  const rawColors = values
    .map((entry) =>
      String(entry ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter((value) => value.length > 0)
    .filter((value) => !value.includes("multi") && !value.includes("various"))
    .slice(0, 3);

  const colorLabel = rawColors.length > 0 ? rawColors.join(" / ") : undefined;

  const out: AllowedColor[] = [];
  for (const raw of rawColors) {
    const mapped = normalizeColorToken(raw);
    if (!mapped) continue;
    if (!ALLOWED_COLOR_SET.has(mapped)) continue;
    if (!out.includes(mapped)) out.push(mapped);
    if (out.length >= 3) break;
  }

  return { colors: out, colorLabel };
}

function normalizeDisplayColorValue(value: unknown): string | null {
  const normalized = normalizeFreeTextLabel(value, 32);
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  if (["unknown", "n/a", "na", "null", "none"].includes(lower)) return null;
  return lower;
}

function normalizeDisplayColors(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const entry of values) {
    const normalized = normalizeDisplayColorValue(entry);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= 4) break;
  }
  return out;
}

function normalizeDetailTags(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeFreeTextLabel(value, 24)
      ?.toLowerCase()
      .replace(/\s+/g, "_");
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= 6) break;
  }
  return out;
}

function toHex(r: number, g: number, b: number): string {
  const parts = [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))));
  return `#${parts
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function rgbToHsv(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; v: number } {
  const rn = Math.max(0, Math.min(255, r)) / 255;
  const gn = Math.max(0, Math.min(255, g)) / 255;
  const bn = Math.max(0, Math.min(255, b)) / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = ((gn - bn) / d) % 6;
    } else if (max === gn) {
      h = (bn - rn) / d + 2;
    } else {
      h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function mapRgbToAllowedColor(r: number, g: number, b: number): AllowedColor {
  const { h, s, v } = rgbToHsv(r, g, b);

  // Very low saturation should map to neutral palette buckets.
  if (s < 0.12) {
    if (v > 0.85) return "white";
    if (v < 0.2) return "black";
    return "grey";
  }

  const mapByHue = (): AllowedColor | null => {
    if (h >= 345 || h < 15) return "red";
    if (h >= 15 && h < 45) return "orange";
    if (h >= 45 && h < 75) return "yellow";
    if (h >= 80 && h < 160) return "green";
    if (h >= 190 && h < 250) return "blue";
    if (h >= 250 && h < 300) return "purple";
    if (h >= 300 && h < 345) return "pink";
    return null;
  };

  // Pastel zone: attempt hue-based color and only fall back if hue is ambiguous.
  if (s < 0.25) {
    const mappedPastel = mapByHue();
    return mappedPastel ?? "grey";
  }

  const mapped = mapByHue();
  if (mapped) return mapped;

  return "grey";
}

async function validateImageInputUrls(uid: string, itemId: string, urls: string[], label: string) {
  const safeUrls: string[] = [];
  for (const url of urls) {
    const storagePath = extractStoragePathFromUrl(url);
    if (storagePath) {
      if (isUserOwnedStoragePath(uid, storagePath)) {
        safeUrls.push(url);
      } else {
        logger.warn("[INGEST_SECURITY] rejected foreign Storage image URL", {
          uid,
          itemId,
          label,
          storagePath,
        });
      }
      continue;
    }
    try {
      safeUrls.push((await validateSafeUrlForFetch(url)).toString());
    } catch (error) {
      logger.warn("[INGEST_SECURITY] rejected unsafe external image URL", {
        uid,
        itemId,
        label,
        url: redactUrlForLogs(url),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return Array.from(new Set(safeUrls));
}

async function downloadImageBytes(uid: string, url: string): Promise<Buffer> {
  const storagePath = extractStoragePathFromUrl(url);
  if (storagePath) {
    if (!isUserOwnedStoragePath(uid, storagePath)) {
      throw new Error("Image Storage path is not owned by this user.");
    }
    const file = getStorage().bucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    const size = Number(metadata.size ?? 0);
    const contentType = String(metadata.contentType ?? "").toLowerCase();
    if (Number.isFinite(size) && size > 10 * 1024 * 1024) {
      throw new Error("Image is too large.");
    }
    if (!contentType.startsWith("image/")) {
      throw new Error("Storage file is not an image.");
    }
    const [bytes] = await file.download();
    return bytes;
  }

  const response = await safeFetch(url, {
    expectedKind: "image",
    maxBytes: 10 * 1024 * 1024,
  });
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  return response.bytes;
}

async function hasTransparentPngBackground(bytes: Buffer): Promise<boolean> {
  const metadata = await sharp(bytes).metadata();
  if (metadata.format !== "png" || !metadata.hasAlpha) return false;

  const raw = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels = raw.info.channels;
  const data = raw.data;
  for (let i = channels - 1; i < data.length; i += channels) {
    if (data[i] < 255) return true;
  }
  return false;
}

async function blobToBuffer(blob: Blob): Promise<Buffer> {
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function applyServerBackgroundRemoval(params: {
  uid: string;
  itemId: string;
  photoUrl: string;
  imageBytes: Buffer;
}): Promise<{
  bytes: Buffer;
  method: "server" | "none";
}> {
  const { uid, itemId, photoUrl, imageBytes } = params;
  try {
    if (await hasTransparentPngBackground(imageBytes)) {
      logger.info("[BgRemoval] Server-side removal skipped; PNG already has transparency", {
        uid,
        itemId,
      });
      return { bytes: imageBytes, method: "none" };
    }

    const storagePath = extractStoragePathFromUrl(photoUrl);
    if (!storagePath) {
      logger.warn("[BgRemoval] Server-side removal skipped; unable to parse Storage path", {
        uid,
        itemId,
        photoUrl: redactUrlForLogs(photoUrl),
      });
      return { bytes: imageBytes, method: "none" };
    }
    if (!isUserOwnedStoragePath(uid, storagePath)) {
      logger.warn("[BgRemoval] Server-side removal skipped; Storage path is not user-owned", {
        uid,
        itemId,
        storagePath,
      });
      return { bytes: imageBytes, method: "none" };
    }

    const result = await removeBackground(imageBytes, {
      output: { format: "image/png", quality: 0.92 },
    });
    const pngBytes = await blobToBuffer(result);
    const token = extractDownloadTokenFromUrl(photoUrl) ?? randomUUID();
    await getStorage().bucket().file(storagePath).save(pngBytes, {
      metadata: {
        contentType: "image/png",
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
      resumable: false,
    });
    logger.info("[BgRemoval] Server-side removal applied", {
      uid,
      itemId,
      storagePath,
    });
    return { bytes: pngBytes, method: "server" };
  } catch (error) {
    logger.error("[BgRemoval] Server-side removal failed; continuing original image", {
      uid,
      itemId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { bytes: imageBytes, method: "none" };
  }
}

function clampBbox(
  bbox: RawExtraction["bbox"],
  width: number,
  height: number,
): {
  left: number;
  top: number;
  cropWidth: number;
  cropHeight: number;
  normalized: { x: number; y: number; w: number; h: number; source: "ai" };
} {
  const fallback = { x: 0.2, y: 0.15, w: 0.6, h: 0.7 };
  const nxRaw = Number(bbox?.x);
  const nyRaw = Number(bbox?.y);
  const nwRaw = Number(bbox?.w);
  const nhRaw = Number(bbox?.h);

  let nx = Number.isFinite(nxRaw) ? nxRaw : fallback.x;
  let ny = Number.isFinite(nyRaw) ? nyRaw : fallback.y;
  let nw = Number.isFinite(nwRaw) ? nwRaw : fallback.w;
  let nh = Number.isFinite(nhRaw) ? nhRaw : fallback.h;

  nx = Math.max(0, Math.min(1, nx));
  ny = Math.max(0, Math.min(1, ny));
  nw = Math.max(MIN_CROP_RATIO, Math.min(1, nw));
  nh = Math.max(MIN_CROP_RATIO, Math.min(1, nh));

  if (nw * nh > 0.7) {
    nx += 0.05 * nw;
    ny += 0.05 * nh;
    nw *= 0.9;
    nh *= 0.9;

    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));
    nw = Math.max(MIN_CROP_RATIO, Math.min(1, nw));
    nh = Math.max(MIN_CROP_RATIO, Math.min(1, nh));
  }

  if (nx + nw > 1) nx = Math.max(0, 1 - nw);
  if (ny + nh > 1) ny = Math.max(0, 1 - nh);

  let left = Math.round(nx * width);
  let top = Math.round(ny * height);
  let cropWidth = Math.round(nw * width);
  let cropHeight = Math.round(nh * height);

  const minWidth = Math.max(1, Math.round(width * MIN_CROP_RATIO));
  const minHeight = Math.max(1, Math.round(height * MIN_CROP_RATIO));
  cropWidth = Math.max(minWidth, cropWidth);
  cropHeight = Math.max(minHeight, cropHeight);

  if (left + cropWidth > width) left = Math.max(0, width - cropWidth);
  if (top + cropHeight > height) top = Math.max(0, height - cropHeight);
  cropWidth = Math.min(cropWidth, width - left);
  cropHeight = Math.min(cropHeight, height - top);

  return {
    left,
    top,
    cropWidth,
    cropHeight,
    normalized: {
      x: left / width,
      y: top / height,
      w: cropWidth / width,
      h: cropHeight / height,
      source: "ai",
    },
  };
}

async function uploadImageAndGetUrl(
  path: string,
  bytes: Buffer,
  contentType = "image/jpeg",
): Promise<string> {
  const bucket = getStorage().bucket();
  const bucketName = bucket.name;
  const file = bucket.file(path);
  const token = randomUUID();
  await file.save(bytes, {
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
    resumable: false,
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function detectPixelColor(
  croppedBytes: Buffer,
): Promise<{ pixelColor: AllowedColor; pixelHex: string }> {
  const tiny = await sharp(croppedBytes)
    .resize({ width: 64, height: 64, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const histogram = new Map<
    string,
    { count: number; r: number; g: number; b: number }
  >();
  const channels = tiny.info.channels;
  const data = tiny.data;
  let opaquePixels = 0;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = channels >= 4 ? data[i + 3] : 255;
    if (a < 20) continue;
    opaquePixels += 1;
    const key = `${Math.floor(r / 16)}-${Math.floor(g / 16)}-${Math.floor(b / 16)}`;
    const existing = histogram.get(key);
    if (existing) {
      existing.count += 1;
      existing.r += r;
      existing.g += g;
      existing.b += b;
    } else {
      histogram.set(key, { count: 1, r, g, b });
    }
  }

  let dominant: { count: number; r: number; g: number; b: number } | null =
    null;
  for (const bucket of histogram.values()) {
    if (!dominant || bucket.count > dominant.count) {
      dominant = bucket;
    }
  }

  if (!dominant || opaquePixels < 24) {
    logger.warn("Pixel color fallback: too few opaque pixels", {
      opaquePixels,
      histogramBuckets: histogram.size,
    });
    return { pixelColor: "grey", pixelHex: "#808080" };
  }

  const avgR = dominant.r / dominant.count;
  const avgG = dominant.g / dominant.count;
  const avgB = dominant.b / dominant.count;

  return {
    pixelColor: mapRgbToAllowedColor(avgR, avgG, avgB),
    pixelHex: toHex(avgR, avgG, avgB),
  };
}

function applyScoreConstraints(
  category: Category,
  subCategory: string,
  formalityScore: number,
  warmthScore: number,
): { formalityScore: number; warmthScore: number } {
  let nextFormality = formalityScore;
  let nextWarmth = warmthScore;

  if (subCategory === "tshirt") {
    nextFormality = Math.min(nextFormality, 0.5);
    nextWarmth = Math.min(nextWarmth, 0.4);
  }

  if (
    category === Category.TOP &&
    ["hoodie", "sweatshirt", "sweater"].includes(subCategory)
  ) {
    nextWarmth = Math.max(nextWarmth, 0.6);
  }

  return {
    formalityScore: clampScore(nextFormality),
    warmthScore: clampScore(nextWarmth),
  };
}

function deriveLayerRole(
  category: Category,
  subCategory: string | null,
  current: string | null,
): string | null {
  const normalized = normalizeNullableEnum(current, ALLOWED_LAYER_ROLE_SET);
  if (normalized) return normalized;
  if (category === Category.OUTERWEAR) return "outer";
  if (category === Category.TOP) {
    if (["hoodie", "sweatshirt", "sweater"].includes(subCategory ?? ""))
      return "mid";
    if (["tshirt", "tank", "shirt", "polo"].includes(subCategory ?? ""))
      return "base";
  }
  return null;
}

function deriveWarmth(
  material: string,
  subCategory: string | null,
  category: Category,
  current: string | null,
): string | null {
  const normalized = normalizeNullableEnum(current, ALLOWED_WARMTH_SET);
  if (normalized) return normalized;
  if (
    ["wool", "fleece"].includes(material) ||
    ["coat"].includes(subCategory ?? "")
  )
    return "heavy";
  if (
    category === Category.OUTERWEAR ||
    [
      "hoodie",
      "sweatshirt",
      "sweater",
      "overshirt",
      "blazer",
      "jacket",
    ].includes(subCategory ?? "")
  ) {
    return "medium";
  }
  if (["tshirt", "tank", "polo", "shirt", "shorts"].includes(subCategory ?? ""))
    return "light";
  return null;
}

function deriveFormality(
  subCategory: string | null,
  style: string,
  current: string | null,
): string | null {
  const normalized = normalizeNullableEnum(current, ALLOWED_FORMALITY_SET);
  if (normalized) return normalized;
  if (style !== "unknown" && ALLOWED_FORMALITY_SET.has(style)) return style;
  if (["blazer"].includes(subCategory ?? "")) return "formal";
  if (
    ["shirt", "trousers", "loafer", "formal_shoe"].includes(subCategory ?? "")
  )
    return "smart_casual";
  if (
    ["hoodie", "sweatshirt", "joggers", "trackpants", "sneaker"].includes(
      subCategory ?? "",
    )
  ) {
    return "streetwear";
  }
  return null;
}

function deriveVisualWeight(
  pattern: string,
  hasLogo: boolean,
  logoPlacement: string,
  aestheticTags: string[],
  current: string | null,
): string | null {
  const normalized = normalizeNullableEnum(current, ALLOWED_VISUAL_WEIGHT_SET);
  if (normalized) return normalized;
  if (
    ["graphic", "logo", "text", "floral", "camouflage"].includes(pattern) ||
    aestheticTags.includes("statement") ||
    aestheticTags.includes("logo_heavy") ||
    aestheticTags.includes("monogram") ||
    (hasLogo && logoPlacement === "all_over")
  ) {
    return "bold";
  }
  if (pattern === "solid" && !hasLogo) return "minimal";
  return "balanced";
}

function deriveVersatilityScore(
  current: number | null,
  pattern: string,
  hasLogo: boolean,
  logoPlacement: string,
  aestheticTags: string[],
  visualWeight: string | null,
): number | null {
  const normalized = normalizeOptionalScore(current, 1, 5);
  if (normalized != null) return normalized;
  if (
    ["graphic", "logo", "floral", "camouflage"].includes(pattern) ||
    aestheticTags.includes("statement") ||
    aestheticTags.includes("luxury") ||
    aestheticTags.includes("logo_heavy") ||
    aestheticTags.includes("monogram") ||
    (hasLogo && logoPlacement === "all_over") ||
    visualWeight === "bold"
  ) {
    return 2;
  }
  if (pattern === "solid") return 4;
  return 3;
}

function safeJsonExtract(text: string): RawExtraction | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw) as RawExtraction;
  } catch {
    return null;
  }
}

async function extractWithOpenAI(photoUrls: string[]): Promise<RawExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You are a fashion catalog parser and wardrobe stylist. You are given multiple images of the same clothing item. Combine information across all images to determine the most accurate attributes and output ONLY one JSON object matching the schema. No markdown. No prose. No extra keys.",
            "Be visually grounded. Use only what is visible in the garment image. Prefer null over guessing when uncertain.",
            "Schema keys only: category, subCategory, type, name, brand, brandConfidence, colors, primaryColor, displayColor, displayColors, pattern, material, materialConfidence, fit, style, sleeveLength, neckline, closure, length, rise, legShape, hasLogo, logoPlacement, formality, warmth, layerRole, aestheticTags, occasionTags, seasonTags, visualWeight, versatilityScore, detailTags, confidenceSummary, confidence.",
            "HARD category disambiguation priority:",
            "1) If two leg openings, inseam, crotch seam, fly, waistband, belt loops, or drawstring at the waist are visible, category MUST be bottom.",
            "2) If collar or neckline plus sleeves are visible, category is top unless it is clearly open-front outerwear.",
            "3) If zipper/open front coat/jacket/blazer/cardigan/overshirt is visible, category is outerwear.",
            "4) If a single one-piece garment such as jumpsuit/dress/romper is visible, category is one_piece.",
            "5) If shoes/boots/sandals are visible, category is footwear.",
            "For pants vs top, prioritize waistband/fly/two-leg evidence over upper-body fabric cues.",
            "Brand detection: identify the brand when there is strong visual evidence. Accept the following as valid evidence: clearly readable brand text (logo, print, tag, label), a distinct and recognizable logo glyph or symbol, or an unmistakable repeated monogram pattern with consistent and legible letterforms. For repeated monograms or house patterns, only return a brand if the letterforms or symbols are clearly visible and consistent across multiple repeats. Do not infer brand from general style, silhouette, material, color palette, or perceived luxury appearance alone. If the evidence is partial, blurred, cropped, low-resolution, obstructed, or ambiguous, return brand=null. When a brand is identified from strong evidence, set hasLogo=true, set logoPlacement appropriately (chest, sleeve, back, waist, leg, all_over), and set brandConfidence proportional to how clearly the evidence is visible. Prefer precision over recall: it is better to return null than to return an incorrect brand.",
            "type should be a more specific fashion label than subCategory when visible, for example denim_jacket, trucker_jacket, varsity_jacket, bomber_jacket, dress_shirt, straight_jeans. Return null if not clear.",
            "name should be a concise catalog-style item title using visible garment attributes only, not marketing fluff.",
            "Extract garment colors only; ignore transparent regions, checkerboard preview backgrounds, white studio backgrounds, empty cutout space, lighting casts, shadows, and skin.",
            "colors and primaryColor should be normalized app colors from the base palette. displayColor and displayColors should be short human-friendly visible garment color labels such as light blue, off-white, washed black, olive green, beige, or khaki.",
            "Return up to 3 garment colors when clearly visible, order them by visual prominence, and choose one garment primaryColor.",
            "Prefer null over unknown, empty string, n/a, or guesses for uncertain fields.",
            "Pattern enum: solid, striped, plaid, checked, graphic, logo, text, floral, dots, camouflage, textured, monogram, other, unknown.",
            "Material enum: cotton, denim, polyester, wool, leather, linen, nylon, silk, rayon, fleece, canvas, satin, suede, knit, unknown.",
            "Fit enum: slim, regular, relaxed, oversized, cropped, tailored, unknown.",
            "Style enum: casual, smart_casual, formal, athleisure, streetwear, workwear, luxury, minimal, unknown.",
            "Sleeve enum: sleeveless, short, three_quarter, long, unknown.",
            "Neckline enum: crew, v_neck, collar, hood, mock_neck, unknown.",
            "Closure enum: pullover, zip, button, snap, none, unknown.",
            "Length enum: cropped, regular, long, unknown.",
            "Rise enum: low, mid, high, unknown.",
            "Leg shape enum: skinny, slim, straight, tapered, wide, flare, unknown.",
            "Logo placement enum: chest, sleeve, back, waist, leg, all_over, unknown.",
            "formality enum: casual, smart_casual, formal, athletic, lounge, party, streetwear.",
            "warmth enum: light, medium, heavy.",
            "layerRole enum: base, mid, outer.",
            "aestheticTags max 3 from: luxury, streetwear, statement, minimal, classic, sporty, workwear, preppy, edgy, vintage, logo_heavy, monogram, utility.",
            "occasionTags max 4 from: casual, work, gym, party, date, travel, lounge, formal_event, streetwear.",
            "seasonTags max 3 from: summer, winter, spring, fall, all_season.",
            "visualWeight enum: minimal, balanced, bold.",
            "versatilityScore is an integer 1..5 where 1 is highly statement/limited and 5 is highly versatile.",
            "confidence is optional and may contain category, subCategory, colors, brand, each 0..1.",
            "Think like a stylist: infer outfit-useful semantics conservatively from visible cues only.",
            "If branding is subtle or ambiguous, do not guess.",
            `Valid categories: ${Object.values(Category).join(", ")}.`,
            `Valid subCategory map: ${JSON.stringify(SUB_CATEGORIES)}.`,
          ].join(" "),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Analyze these garment photos together as one item.",
                "Use all images to improve brand, material, pattern, color, and visible-detail accuracy.",
                "If the images conflict, choose the most consistent signal and lower confidence.",
                "Prefer visible garment type and visible logo/text/tag only.",
                "Use waistband/fly/two-leg cues to avoid misclassifying pants as tops.",
                "If uncertain, return null instead of guessing.",
                "Colors and primaryColor must describe the garment only, never the background, transparency, checkerboard cutout preview, or empty space.",
                "displayColor and displayColors should be short user-facing visible color names, not marketing language.",
                "If a piece has multiple visible garment colors, include them and choose the main one as primaryColor.",
              ].join(" "),
            },
            ...photoUrls.map((photoUrl) => ({
              type: "image_url" as const,
              image_url: { url: photoUrl },
            })),
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OpenAI request failed: ${response.status} ${body.slice(0, 240)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content ?? "";
  logger.info("OpenAI raw extraction response", {
    rawText: content.slice(0, 2000),
    truncated: content.length > 2000,
  });
  const parsed = safeJsonExtract(content);
  if (!parsed) {
    throw new Error("OpenAI returned invalid JSON payload");
  }
  logger.info("OpenAI parsed extraction payload", { parsed });

  return parsed;
}

export const ingestItemFromPhotos = onDocumentWritten(
  {
    document: "users/{uid}/items/{itemId}",
    secrets: ["OPENAI_API_KEY"],
  },
  async (event) => {
    const uid = String(event.params.uid ?? "");
    const itemId = String(event.params.itemId ?? "");
    const before = event.data?.before.data() as ItemDoc | undefined;
    const after = event.data?.after.data() as ItemDoc | undefined;
    if (!after) return;

    const rawPhotoUrls = extractPhotoUrls(after);
    const rawSourceUrls = extractIngestionSourceUrls(after);
    const photoUrls = await validateImageInputUrls(uid, itemId, rawPhotoUrls, "photo");
    const sourceUrls = await validateImageInputUrls(uid, itemId, rawSourceUrls, "source");
    const sourceType = String(after.ingestionSource?.sourceType ?? "").trim();
    const isSnapDoneDraft =
      after.isDraft === true &&
      (sourceType === "aura_chat" || sourceType === "aura_product_link");
    const hasPhoto = photoUrls.length > 0;
    const status = getIngestionStatus(after);
    const lifecycleStatus = String(after.itemLifecycleStatus ?? "").trim().toLowerCase();
    const draftState = String(after.draftState ?? "").trim().toLowerCase();
    const isCancelledOrDeleted =
      lifecycleStatus === "deleted" ||
      lifecycleStatus === "candidate" ||
      draftState === "cancelled" ||
      draftState === "awaiting_confirmation" ||
      status === "awaiting_confirmation";
    logger.info("[INGEST_TRIGGER] item write received", {
      uid,
      itemId,
      status: status || null,
      sourceType: sourceType || null,
      isSnapDoneDraft,
      lifecycleStatus: lifecycleStatus || null,
      draftState: draftState || null,
      isDraft: after.isDraft ?? null,
      hasImagesArray: Array.isArray(after.images),
      imagesCount: Array.isArray(after.images) ? after.images.length : 0,
      photoUrl: redactUrlForLogs(String(after.photoUrl ?? "").trim() || null),
      photosPrimaryUrl: redactUrlForLogs(String(after.photos?.primaryUrl ?? "").trim() || null),
      photosUrls: Array.isArray(after.photos?.urls)
        ? after.photos?.urls.map((url) => redactUrlForLogs(url))
        : [],
      extractedPhotoUrls: photoUrls.map((url) => redactUrlForLogs(url)),
      hasPhoto,
    });
    if (isCancelledOrDeleted) {
      logger.info("[INGEST_VALIDATE] skipping cancelled, deleted, or candidate item", {
        uid,
        itemId,
        status,
        lifecycleStatus: lifecycleStatus || null,
        draftState: draftState || null,
      });
      return;
    }
    if (status === "processing" || status === "done") {
      logger.info("[INGEST_VALIDATE] skipping active or terminal status", {
        uid,
        itemId,
        status,
        sourceType: sourceType || null,
        isSnapDoneDraft,
      });
      return;
    }
    if (draftState === "awaiting_confirmation" || draftState === "cancelled") {
      logger.info("Skipping ingestion: awaiting user confirmation", {
        uid,
        itemId,
        status,
        draftState: draftState || null,
      });
      return;
    }
    if (!hasPhoto) {
      if (rawPhotoUrls.length > 0) {
        await getFirestore()
          .doc(`users/${uid}/items/${itemId}`)
          .set(
            {
              itemLifecycleStatus: "failed",
              ingestionStatus: "failed",
              ingestion: {
                status: "failed",
                lastRunAt: FieldValue.serverTimestamp(),
                error: { message: "Image URL is not safe to process." },
              },
              updatedAt: Date.now(),
            },
            { merge: true },
          );
      }
      logger.info("[INGEST_VALIDATE] skipping no photo URLs", {
        uid,
        itemId,
        sourceType: sourceType || null,
        isSnapDoneDraft,
        hasImagesArray: Array.isArray(after.images),
        imagesCount: Array.isArray(after.images) ? after.images.length : 0,
        hasPhotosMap: !!after.photos,
      });
      return;
    }

    const beforeSourceUrls = before
      ? await validateImageInputUrls(uid, itemId, extractIngestionSourceUrls(before), "before-source")
      : [];
    const photoHash = hashPhotoUrls(photoUrls);
    const declaredSourceHash =
      String(after.ingestionSource?.sourceHash ?? "").trim() || null;
    const currentSourceHash = sourceUrls.length
      ? hashPhotoUrls(sourceUrls)
      : "";
    const previousSourceHash = beforeSourceUrls.length
      ? hashPhotoUrls(beforeSourceUrls)
      : "";
    const existingColorSource = String(after.colorSource ?? "")
      .trim()
      .toLowerCase();
    const hasUserColorOverride = existingColorSource === "user";
    const existingBrandSource = String(after.brandSource ?? "")
      .trim()
      .toLowerCase();
    const hasUserBrandOverride = existingBrandSource === "user";
    const existingBrandValue = String(after.brand ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const hasLegacyAiBrandSignals =
      typeof after.brandConfidence === "number" ||
      !!String(after.brandEvidence ?? after.aiDebug?.brandEvidence ?? "").trim() ||
      (Array.isArray(after.brandCandidates) && after.brandCandidates.length > 0) ||
      (Array.isArray(after.aiDebug?.brandCandidates) &&
        after.aiDebug.brandCandidates.length > 0);
    const shouldPreserveLegacyManualBrand =
      !existingBrandSource &&
      !!existingBrandValue &&
      !hasLegacyAiBrandSignals;
    const lastRunAtMs = toMillis(after.ingestion?.lastRunAt);
    const beforeStatus = getIngestionStatus(before);
    const processedPhotoHash = String(
      after.ingestion?.lastProcessedPhotoHash ??
        before?.ingestion?.lastProcessedPhotoHash ??
        "",
    ).trim();
    const processedSourceHash = String(
      after.ingestion?.lastProcessedSourceHash ??
        before?.ingestion?.lastProcessedSourceHash ??
        "",
    ).trim();
    const hasNewPhoto =
      !!currentSourceHash &&
      (!processedSourceHash || currentSourceHash !== processedSourceHash);
    const isCreate = !before;
    const hasSourcePhoto = sourceUrls.length > 0;
    const alreadyProcessedCurrentSource =
      !!currentSourceHash &&
      !!processedSourceHash &&
      currentSourceHash === processedSourceHash;

    const retryBlocked =
      status === "failed" &&
      alreadyProcessedCurrentSource &&
      !!lastRunAtMs &&
      Date.now() - lastRunAtMs < HOUR_MS;

    const explicitRetryRequested =
      status === "pending" &&
      beforeStatus === "failed" &&
      alreadyProcessedCurrentSource;

    const shouldRun =
      hasSourcePhoto &&
      !retryBlocked &&
      (isCreate ||
        !status ||
        !currentSourceHash ||
        !processedSourceHash ||
        !alreadyProcessedCurrentSource ||
        explicitRetryRequested);

    logger.info("[INGEST_VALIDATE] trigger decision", {
      uid,
      itemId,
      beforeExists: !!before,
      beforeStatus: String(before?.ingestion?.status ?? "").trim() || null,
      afterStatus: status || null,
      beforeSourceUrls: beforeSourceUrls.map((url) => redactUrlForLogs(url)),
      afterSourceUrls: sourceUrls.map((url) => redactUrlForLogs(url)),
      declaredSourceHash,
      previousSourceHash: previousSourceHash || null,
      currentSourceHash: currentSourceHash || null,
      processedPhotoHash: processedPhotoHash || null,
      processedSourceHash: processedSourceHash || null,
      hasSourcePhoto,
      hasNewPhoto,
      alreadyProcessedCurrentSource,
      retryBlocked,
      explicitRetryRequested,
      shouldRun,
      skipReason: !hasSourcePhoto
        ? "missing-source-photo"
        : retryBlocked
          ? "recent-failed-same-source"
          : explicitRetryRequested
            ? null
            : shouldRun
              ? null
              : "current-source-already-processed",
    });

    if (!shouldRun) {
      logger.info("[INGEST_VALIDATE] skipping conditions not met", {
        uid,
        itemId,
        status: status ?? "missing",
        hasNewPhoto,
        retryBlocked,
        explicitRetryRequested,
        declaredSourceHash,
        previousSourceHash: previousSourceHash || null,
        currentSourceHash: currentSourceHash || null,
        processedPhotoHash: processedPhotoHash || null,
        processedSourceHash: processedSourceHash || null,
      });
      return;
    }

    const db = getFirestore();
    const ref = db.doc(`users/${uid}/items/${itemId}`);
    const latestSnapshot = await ref.get();
    const latestData = latestSnapshot.data() as ItemDoc | undefined;
    const latestStatus = getIngestionStatus(latestData);
    const latestProcessedSourceHash = String(
      latestData?.ingestion?.lastProcessedSourceHash ?? "",
    ).trim();
    if (latestStatus === "processing" || latestStatus === "done") {
      logger.info("[INGEST_VALIDATE] skipping latest state already active/terminal", {
        uid,
        itemId,
        latestStatus,
      });
      return;
    }
    if (
      latestProcessedSourceHash &&
      currentSourceHash &&
      latestProcessedSourceHash === currentSourceHash
    ) {
      logger.info(
        "[INGEST_VALIDATE] skipping latest source already processed for current hash",
        {
          uid,
          itemId,
          currentSourceHash,
          latestProcessedSourceHash,
        },
      );
      return;
    }

    if (after.cleanedFromHash === currentSourceHash) {
      logger.info(
        "[INGEST_VALIDATE] skipping cleanedFromHash already matches current source",
        {
          uid,
          itemId,
          currentSourceHash,
        },
      );
      return;
    }

    const runId = randomUUID();
    logger.info("[INGEST_START] transition to processing", {
      uid,
      itemId,
      isSnapDoneDraft,
      from: status ?? "missing",
      to: "processing",
    });
    await ref.set(
      {
        ...(after.isDraft === true ? { draftState: "ingesting" } : {}),
        itemLifecycleStatus: "processing",
        ingestionStatus: "processing",
        backgroundRemovalMethod: hasClientCleanedImage(after) ? "client" : "none",
        ingestion: {
          runId,
          status: "processing",
          lastRunAt: FieldValue.serverTimestamp(),
          lastProcessedPhotoHash: photoHash,
          lastProcessedSourceHash: currentSourceHash,
        },
      },
      { merge: true },
    );

    try {
      let backgroundRemovalMethod: "client" | "server" | "none" =
        hasClientCleanedImage(after) ? "client" : "none";
      let originalBytes = await downloadImageBytes(uid, photoUrls[0]);
      if (backgroundRemovalMethod !== "client") {
        const serverRemoval = await applyServerBackgroundRemoval({
          uid,
          itemId,
          photoUrl: photoUrls[0],
          imageBytes: originalBytes,
        });
        originalBytes = serverRemoval.bytes;
        backgroundRemovalMethod = serverRemoval.method;
      }

      const extracted = await extractWithOpenAI(photoUrls);
      let warning: string | null = null;
      const storedImageCandidates: {
        originalUrl?: string | null;
        cleanedUrl?: string | null;
        isPrimary?: boolean;
      }[] = Array.isArray(after.images)
        ? after.images
        : Array.isArray(after.photos?.images)
          ? after.photos.images
          : photoUrls.map((url, index) => ({
              originalUrl: url,
              isPrimary: index === 0,
            }));

      const storedImages = storedImageCandidates
        .map((image) => ({
          originalUrl: String(image?.originalUrl ?? "").trim(),
          ...(String(image?.cleanedUrl ?? "").trim()
            ? { cleanedUrl: String(image?.cleanedUrl ?? "").trim() }
            : {}),
          isPrimary: Boolean(image?.isPrimary),
        }))
        .filter((image) => image.originalUrl);
      const primaryStoredImage =
        storedImages.find((image) => image.isPrimary) ?? storedImages[0] ?? null;
      const primaryCleanedUrl = String(primaryStoredImage?.cleanedUrl ?? "").trim() || null;

      let category = normalizeCategory(extracted.category);
      let subCategory = normalizeSubCategory(extracted.subCategory);
      const inferredCategory = inferCategoryFromSubCategory(subCategory);

      if (!category) {
        if (inferredCategory) {
          category = inferredCategory;
          warning =
            "Invalid category from classifier; inferred category from sub-category.";
        } else {
          category = Category.TOP;
          warning = "Invalid category from classifier; fallback applied.";
        }
      } else if (!subCategory) {
        subCategory = SUB_CATEGORIES[category][0];
        warning = "Sub-category missing; defaulted by category.";
      } else if (!isValidCategorySubCategory(category, subCategory)) {
        if (inferredCategory) {
          category = inferredCategory;
          if (!isValidCategorySubCategory(category, subCategory)) {
            subCategory = SUB_CATEGORIES[category][0];
          }
          warning =
            "Invalid category/sub-category pairing; reconciled from sub-category.";
        } else {
          subCategory = SUB_CATEGORIES[category][0];
          warning =
            "Invalid sub-category from classifier; defaulted by category.";
        }
      }
      subCategory = subCategory ?? SUB_CATEGORIES[category][0];
      const itemType = normalizeFreeTextLabel(
        String(extracted.type ?? "").replace(/_/g, " "),
      );
      const extractedName = normalizeFreeTextLabel(extracted.name, 72);

      const pattern = normalizePattern(extracted.pattern);
      const material = normalizeMaterial(extracted.material);
      const materialConfidence = clamp01(
        extracted.materialConfidence ?? extracted.confidence?.material ?? 0,
      );
      const fit = normalizeEnum(extracted.fit, ALLOWED_FITS);
      const style = normalizeEnum(extracted.style, ALLOWED_STYLES);
      const sleeveLength = normalizeEnum(
        extracted.sleeveLength,
        ALLOWED_SLEEVE_LENGTHS,
      );
      const neckline = normalizeEnum(extracted.neckline, ALLOWED_NECKLINES);
      const closure = normalizeEnum(extracted.closure, ALLOWED_CLOSURES);
      const itemLength = normalizeEnum(extracted.length, ALLOWED_LENGTHS);
      const rise = normalizeEnum(extracted.rise, ALLOWED_RISES);
      const legShape = normalizeEnum(extracted.legShape, ALLOWED_LEG_SHAPES);

      if (
        category === Category.TOP &&
        hasBottomGarmentCue({
          subCategory,
          rise,
          legShape,
          bbox: extracted.bbox,
        })
      ) {
        category = Category.BOTTOM;
        if (
          !subCategory ||
          !isValidCategorySubCategory(category, subCategory)
        ) {
          subCategory = "chinos";
        }
        warning = "Classifier top result overridden by bottom-garment cues.";
      }
      const hasLogo =
        typeof extracted.hasLogo === "boolean" ? extracted.hasLogo : false;
      const logoPlacement = normalizeEnum(
        extracted.logoPlacement,
        ALLOWED_LOGO_PLACEMENTS,
      );
      const occasionTags = normalizeOptionalTagList(
        extracted.occasionTags,
        ALLOWED_OCCASION_TAGS,
        4,
      );
      const seasonTags = normalizeOptionalTagList(
        extracted.seasonTags,
        ALLOWED_SEASON_TAGS,
        3,
      );
      const aestheticTags = normalizeOptionalTagList(
        extracted.aestheticTags,
        ALLOWED_AESTHETIC_TAG_SET,
        3,
      );
      const rawBrand = normalizeBrand(extracted.brand);
      const brandCandidates = normalizeBrandCandidates(
        extracted.brandCandidates,
      );
      const brand = rawBrand ?? null;
      const brandConfidenceRaw = clamp01(
        extracted.brandConfidence ?? extracted.confidence?.brand ?? 0,
      );
      const brandEvidence = normalizeEnum(
        extracted.brandEvidence,
        ALLOWED_BRAND_EVIDENCE,
      );
      const brandConfidence = brand
        ? brandConfidenceRaw
        : Math.min(brandConfidenceRaw, 0.4);
      const formality = deriveFormality(
        subCategory,
        style,
        normalizeNullableEnum(extracted.formality, ALLOWED_FORMALITY_SET),
      );
      const layerRole = deriveLayerRole(
        category,
        subCategory,
        normalizeNullableEnum(extracted.layerRole, ALLOWED_LAYER_ROLE_SET),
      );
      const warmth = deriveWarmth(
        material,
        subCategory,
        category,
        normalizeNullableEnum(extracted.warmth, ALLOWED_WARMTH_SET),
      );
      const visualWeight = deriveVisualWeight(
        pattern,
        hasLogo,
        logoPlacement,
        aestheticTags,
        normalizeNullableEnum(
          extracted.visualWeight,
          ALLOWED_VISUAL_WEIGHT_SET,
        ),
      );
      const versatilityScore = deriveVersatilityScore(
        normalizeOptionalScore(extracted.versatilityScore, 1, 5),
        pattern,
        hasLogo,
        logoPlacement,
        aestheticTags,
        visualWeight,
      );
      const categoryConfidence = clamp01(extracted.confidence?.category ?? 0);
      const subCategoryConfidence = clamp01(
        extracted.confidence?.subCategory ?? 0,
      );
      const colorsConfidence = clamp01(extracted.confidence?.colors ?? 0);
      const detailTags = normalizeDetailTags(extracted.detailTags);
      const { colors: aiColorsRaw, colorLabel } = normalizeColors(
        extracted.colors,
      );
      const aiPrimaryColor = normalizeColorToken(
        String(extracted.primaryColor ?? ""),
      );
      const aiColors = aiColorsRaw.slice(0, 3);
      const safeAiColorLabel = colorLabel?.trim() ? colorLabel.trim() : null;
      const aiDisplayColor = normalizeDisplayColorValue(extracted.displayColor);
      const aiDisplayColors = normalizeDisplayColors(extracted.displayColors);

      const metadata = await sharp(originalBytes).metadata();
      const imageWidth = metadata.width ?? 0;
      const imageHeight = metadata.height ?? 0;
      if (!imageWidth || !imageHeight) {
        throw new Error("Unable to read source image dimensions");
      }

      const cropRect = clampBbox(extracted.bbox, imageWidth, imageHeight);
      const croppedForColorBytes = await sharp(originalBytes)
        .extract({
          left: cropRect.left,
          top: cropRect.top,
          width: cropRect.cropWidth,
          height: cropRect.cropHeight,
        })
        .png()
        .toBuffer();
      const croppedBytes = await sharp(croppedForColorBytes)
        .jpeg({ quality: 85 })
        .toBuffer();
      const thumbBytes = await sharp(croppedBytes)
        .resize({ width: 256 })
        .jpeg({ quality: 78 })
        .toBuffer();

      const croppedStoragePath = `users/${uid}/items/${itemId}/cropped.jpg`;
      const thumbStoragePath = `users/${uid}/items/${itemId}/thumb.jpg`;
      const croppedUrl = await uploadImageAndGetUrl(
        croppedStoragePath,
        croppedBytes,
      );
      const thumbUrl = await uploadImageAndGetUrl(thumbStoragePath, thumbBytes);

      const pixelResult = await detectPixelColor(croppedForColorBytes);
      const pixelPrimary = pixelResult.pixelColor;
      const pixelColors: AllowedColor[] = pixelPrimary ? [pixelPrimary] : [];

      let finalColors: AllowedColor[] = [];
      let finalColorLabel: string | null = null;
      let finalPrimaryColor: string | undefined;
      let colorConfidence = 0.4;
      let colorNeedsReview = true;

      if (aiColors.length > 0 || aiPrimaryColor) {
        const prioritizedAiColors = [...aiColors];
        if (aiPrimaryColor && !prioritizedAiColors.includes(aiPrimaryColor)) {
          prioritizedAiColors.unshift(aiPrimaryColor);
        } else if (aiPrimaryColor) {
          prioritizedAiColors.splice(
            prioritizedAiColors.indexOf(aiPrimaryColor),
            1,
          );
          prioritizedAiColors.unshift(aiPrimaryColor);
        }
        finalColors = prioritizedAiColors.slice(0, 3);
        finalPrimaryColor = toTitleCase(aiPrimaryColor ?? finalColors[0]);
        finalColorLabel = safeAiColorLabel
          ? toTitleCase(safeAiColorLabel)
          : finalColors.map((value) => toTitleCase(value)).join(" / ");
        colorConfidence = Math.max(0.6, colorsConfidence || 0);
        colorNeedsReview = false;
      } else if (pixelPrimary) {
        finalColors = [pixelPrimary];
        finalColorLabel = toTitleCase(pixelPrimary);
        finalPrimaryColor = toTitleCase(pixelPrimary);
        colorConfidence = 0.3;
        colorNeedsReview = true;
      }

      const persistedColorNeedsReview = hasUserColorOverride
        ? false
        : colorNeedsReview;
      let finalDisplayColors = aiDisplayColors.slice(0, 4);
      if (aiDisplayColor && !finalDisplayColors.includes(aiDisplayColor)) {
        finalDisplayColors.unshift(aiDisplayColor);
      } else if (aiDisplayColor) {
        finalDisplayColors = [
          aiDisplayColor,
          ...finalDisplayColors.filter((value) => value !== aiDisplayColor),
        ];
      }
      if (!finalDisplayColors.length && safeAiColorLabel) {
        const fallbackDisplayColor = normalizeDisplayColorValue(safeAiColorLabel);
        if (fallbackDisplayColor) finalDisplayColors = [fallbackDisplayColor];
      }
      if (!finalDisplayColors.length && finalPrimaryColor) {
        const fallbackDisplayColor = normalizeDisplayColorValue(finalPrimaryColor);
        if (fallbackDisplayColor) finalDisplayColors = [fallbackDisplayColor];
      }
      const finalDisplayColor = finalDisplayColors[0] ?? null;
      const generatedNameColor =
        finalDisplayColor
          ? toTitleCase(String(finalDisplayColor))
          : finalColors.length > 0
          ? toTitleCase(String(finalColors[0]))
          : finalPrimaryColor;
      const inferredName =
        extractedName ??
        (!String(after.name ?? "").trim() && generatedNameColor
          ? `${generatedNameColor} ${humanizeLabel(itemType ?? subCategory ?? category)}`
          : null);

      const constrainedScores = applyScoreConstraints(
        category,
        subCategory,
        clampScore(extracted.formalityScore),
        clampScore(extracted.warmthScore),
      );
      let formalityScore = constrainedScores.formalityScore;
      let warmthScore = constrainedScores.warmthScore;
      const confidenceOverall = Number(
        (
          (categoryConfidence +
            subCategoryConfidence +
            colorsConfidence +
            brandConfidence +
            materialConfidence) /
          5
        ).toFixed(3),
      );
      const confidenceSummary = {
        overall: confidenceOverall,
        notes:
          normalizeFreeTextLabel(extracted.confidenceSummary?.notes, 180) ??
          (photoUrls.length > 1
            ? "Combined multiple images for a more reliable extraction."
            : "Built from a single item image."),
      };

      if (subCategory === "tshirt") {
        formalityScore = Math.min(formalityScore, 0.5);
        warmthScore = Math.min(warmthScore, 0.4);
      }

      logger.info("Ingestion normalized output", {
        uid,
        itemId,
        normalized: {
          category,
          subCategory,
          type: itemType,
          confidence: {
            category: categoryConfidence,
            subCategory: subCategoryConfidence,
            colors: colorsConfidence,
            brand: brandConfidence,
          },
          brand:
            hasUserBrandOverride || shouldPreserveLegacyManualBrand
              ? (after.brand ?? null)
              : brand,
          brandConfidence,
          brandEvidence,
          brandCandidates,
          wearSlot: wearSlot(category),
          pattern,
          material,
          materialConfidence,
          ...(detailTags.length > 0 ? { detailTags } : {}),
          fit,
          style,
          formality,
          warmth,
          layerRole,
          visualWeight,
          versatilityScore,
          sleeveLength,
          neckline,
          closure,
          length: itemLength,
          rise,
          legShape,
          hasLogo,
          logoPlacement,
          occasionTags,
          seasonTags,
          aestheticTags,
          crop: cropRect.normalized,
          "photos.croppedUrl": croppedUrl,
          "photos.thumbUrl": thumbUrl,
          finalColors,
          ...(finalColorLabel ? { finalColorLabel } : {}),
          finalPrimaryColor,
          finalDisplayColor,
          finalDisplayColors,
          detailTags,
          confidenceSummary,
          generatedName: inferredName,
          backgroundRemovalMethod,
          colorSource: hasUserColorOverride ? "user" : "ai",
          formalityScore,
          warmthScore,
          aiDebug: {
            brandEvidence,
            brandCandidates,
            aiColors,
            aiPrimaryColor: aiPrimaryColor ? toTitleCase(aiPrimaryColor) : null,
            aiColorLabel: safeAiColorLabel ?? null,
            pixelColors,
            pixelColorHex: pixelResult.pixelHex,
            colorConfidence,
            colorNeedsReview: persistedColorNeedsReview,
          },
          warning,
          userBrandOverridePreserved: hasUserBrandOverride,
          legacyManualBrandPreserved: shouldPreserveLegacyManualBrand,
          userColorOverridePreserved: hasUserColorOverride,
        },
      });

      logger.info("Ingestion final write payload", {
        uid,
        itemId,
        finalWrite: {
          category,
          subCategory,
          type: itemType,
          colors: finalColors,
          detailTags,
          brand:
            hasUserBrandOverride || shouldPreserveLegacyManualBrand
              ? (after.brand ?? null)
              : brand,
          generatedName: inferredName,
          lastProcessedSourceHash: currentSourceHash,
          backgroundRemovalMethod,
        },
      });

      const latestBeforeDone = await ref.get();
      if (!latestBeforeDone.exists) {
        logger.warn("[INGEST_VALIDATE] skipping completion because item doc was hard-deleted", {
          uid,
          itemId,
          runId,
        });
        return;
      }
      const latestRunId = String(
        latestBeforeDone.get("ingestion.runId") ?? "",
      ).trim();
      const latestDraftState = String(
        latestBeforeDone.get("draftState") ?? "",
      ).trim().toLowerCase();
      const latestLifecycleStatus = String(
        latestBeforeDone.get("itemLifecycleStatus") ?? "",
      ).trim().toLowerCase();
      if (
        latestDraftState === "cancelled" ||
        latestDraftState === "awaiting_confirmation" ||
        latestLifecycleStatus === "deleted" ||
        latestLifecycleStatus === "candidate"
      ) {
        logger.warn("[INGEST_VALIDATE] skipping completion because item was removed or is candidate-only", {
          uid,
          itemId,
          runId,
          latestDraftState,
          latestLifecycleStatus,
        });
        return;
      }
      if (latestRunId && latestRunId !== runId) {
        logger.warn("Skipping stale ingestion completion write", {
          uid,
          itemId,
          runId,
          latestRunId,
        });
        return;
      }

      const latestImageCandidates: {
        originalUrl?: string | null;
        cleanedUrl?: string | null;
        isPrimary?: boolean;
      }[] = Array.isArray(latestBeforeDone.get("images"))
        ? latestBeforeDone.get("images")
        : Array.isArray(latestBeforeDone.get("photos.images"))
          ? latestBeforeDone.get("photos.images")
          : [];
      const latestImages = latestImageCandidates
        .map((image) => ({
          originalUrl: String(image?.originalUrl ?? "").trim(),
          ...(String(image?.cleanedUrl ?? "").trim()
            ? { cleanedUrl: String(image?.cleanedUrl ?? "").trim() }
            : {}),
          isPrimary: Boolean(image?.isPrimary),
        }))
        .filter((image) => image.originalUrl);
      const latestPrimaryImage =
        latestImages.find((image) => image.isPrimary) ?? latestImages[0] ?? null;
      const preservedOriginalImageUrl =
        String(
          latestPrimaryImage?.originalUrl ??
            latestBeforeDone.get("originalImageUrl") ??
            primaryStoredImage?.originalUrl ??
            after.originalImageUrl ??
            photoUrls[0] ??
            "",
        ).trim() || photoUrls[0];
      const preservedCleanedImageUrl =
        String(
          latestPrimaryImage?.cleanedUrl ??
            latestBeforeDone.get("cleanedImageUrl") ??
            latestBeforeDone.get("photos.cleanedUrl") ??
            primaryCleanedUrl ??
            after.cleanedImageUrl ??
            "",
        ).trim() || null;
      const preservedImages =
        latestImages.length > 0
          ? latestImages
          : storedImages.map((image, index) => ({
              originalUrl:
                index === 0 ? preservedOriginalImageUrl : image.originalUrl,
              ...(index === 0 && preservedCleanedImageUrl
                ? { cleanedUrl: preservedCleanedImageUrl }
                : image.cleanedUrl
                  ? { cleanedUrl: image.cleanedUrl }
                  : {}),
              isPrimary: image.isPrimary,
            }));
      const preservedPrimaryDisplayUrl =
        preservedCleanedImageUrl ??
        (String(
          latestBeforeDone.get("photoUrl") ??
            latestBeforeDone.get("photos.primaryUrl") ??
            preservedOriginalImageUrl,
        ).trim() ||
          preservedOriginalImageUrl);
      const preservedPhotoUrls = Array.isArray(latestBeforeDone.get("imageUrls"))
        ? latestBeforeDone
            .get("imageUrls")
            .map((value: unknown) => String(value ?? "").trim())
            .filter(Boolean)
        : photoUrls;

      await ref.set(
        {
          cleanedFromHash: currentSourceHash,
          originalImageUrl: preservedOriginalImageUrl,
          cleanedImageUrl: preservedCleanedImageUrl,
          photoUrl: preservedPrimaryDisplayUrl,
          imageUrls: preservedPhotoUrls,
          images: preservedImages,
          ...(after.isDraft === true
            ? isSnapDoneDraft
              ? { isDraft: false, draftState: "ready", itemLifecycleStatus: "ready" }
              : { draftState: "photo_uploaded", itemLifecycleStatus: "needs_review" }
            : {}),
          ...(!String(after.name ?? "").trim() && inferredName
            ? { name: inferredName }
            : {}),
          category,
          subCategory,
          ...(itemType ? { type: itemType } : {}),
          wearSlot: wearSlot(category),
          pattern,
          material,
          materialConfidence,
          ...(detailTags.length > 0 ? { detailTags } : {}),
          confidenceSummary,
          fit,
          style,
          ...(formality ? { formality } : {}),
          ...(warmth ? { warmth } : {}),
          ...(layerRole ? { layerRole } : {}),
          ...(visualWeight ? { visualWeight } : {}),
          ...(versatilityScore != null ? { versatilityScore } : {}),
          sleeveLength,
          neckline,
          closure,
          length: itemLength,
          rise,
          legShape,
          hasLogo,
          logoPlacement,
          ...(occasionTags.length > 0 ? { occasionTags } : {}),
          ...(seasonTags.length > 0 ? { seasonTags } : {}),
          ...(aestheticTags.length > 0 ? { aestheticTags } : {}),
          crop: cropRect.normalized,
          ...(!hasUserColorOverride
            ? {
                ...(finalColors.length > 0 ? { colors: finalColors } : {}),
                ...(finalColorLabel ? { colorLabel: finalColorLabel } : {}),
                ...(finalPrimaryColor
                  ? { primaryColor: finalPrimaryColor }
                  : {}),
                ...(finalDisplayColor
                  ? { displayColor: toTitleCase(finalDisplayColor) }
                  : {}),
                ...(finalDisplayColors.length > 0
                  ? {
                      displayColors: finalDisplayColors.map((value) =>
                        toTitleCase(value),
                      ),
                    }
                  : {}),
                colorSource: "ai",
                colorUpdatedAt: Date.now(),
              }
            : {}),
          ...(!hasUserBrandOverride && !shouldPreserveLegacyManualBrand
            ? {
                brand,
                brandConfidence,
                brandSource: "ai",
                brandUpdatedAt: Date.now(),
              }
            : {
                brandConfidence,
              }),
          aiDebug: {
            brandEvidence,
            ...(brandCandidates.length > 0 ? { brandCandidates } : {}),
            ...(aiColors.length > 0 ? { aiColors } : {}),
            ...(aiPrimaryColor
              ? { aiPrimaryColor: toTitleCase(aiPrimaryColor) }
              : {}),
            ...(safeAiColorLabel ? { aiColorLabel: safeAiColorLabel } : {}),
            ...(finalDisplayColor ? { displayColor: finalDisplayColor } : {}),
            ...(finalDisplayColors.length > 0
              ? { displayColors: finalDisplayColors }
              : {}),
            ...(pixelColors.length > 0 ? { pixelColors } : {}),
            ...(pixelResult.pixelHex
              ? { pixelColorHex: pixelResult.pixelHex }
              : {}),
            ...(hasUserColorOverride ? {} : { colorConfidence }),
            colorNeedsReview: persistedColorNeedsReview,
          },
          formalityScore,
          warmthScore,
          photos: {
            originalUrl: preservedOriginalImageUrl,
            primaryUrl: preservedPrimaryDisplayUrl,
            urls: preservedPhotoUrls,
            images: preservedImages,
            ...(preservedCleanedImageUrl
              ? {
                  cleanedUrl: preservedCleanedImageUrl,
                  cleanedSource: "vision",
                }
              : {}),
            croppedUrl,
            thumbUrl,
          },
          backgroundRemovalMethod,
          ingestionStatus: "done",
          ingestion: {
            runId,
            status: "done",
            lastRunAt: FieldValue.serverTimestamp(),
            lastProcessedPhotoHash: photoHash,
            lastProcessedSourceHash: currentSourceHash,
            ...(warning
              ? { error: { message: warning, code: "warning" } }
              : {}),
          },
        },
        { merge: true },
      );

      logger.info("[INGEST_SUCCESS] transition to done", {
        uid,
        itemId,
        isSnapDoneDraft,
        finalizedDraft: isSnapDoneDraft,
        from: "processing",
        to: "done",
        category,
        subCategory,
        colors: finalColors,
        brand:
          hasUserBrandOverride || shouldPreserveLegacyManualBrand
            ? (after.brand ?? null)
            : brand,
        processedSourceHash: currentSourceHash,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown ingestion error";
      logger.error("[INGEST_ERROR] ingestion failed", {
        uid,
        itemId,
        isSnapDoneDraft,
        error: message,
      });

      const latest = await ref.get();
      if (!latest.exists) {
        logger.warn("[INGEST_ERROR] skipping failure write because item doc was hard-deleted", {
          uid,
          itemId,
          runId,
          error: message,
        });
        return;
      }
      const latestStatus = String(
        latest.get("ingestion.status") ?? latest.get("ingestionStatus") ?? "",
      )
        .trim()
        .toLowerCase();
      const latestRunId = String(latest.get("ingestion.runId") ?? "").trim();
      const latestDraftState = String(latest.get("draftState") ?? "").trim().toLowerCase();
      const latestLifecycleStatus = String(latest.get("itemLifecycleStatus") ?? "").trim().toLowerCase();
      if (latestStatus === "done") {
        logger.warn("[INGEST_ERROR] failure ignored because item is already done", {
          uid,
          itemId,
          error: message,
        });
        return;
      }
      if (latestRunId && latestRunId !== runId) {
        logger.warn("[INGEST_ERROR] skipping stale failure write", {
          uid,
          itemId,
          runId,
          latestRunId,
          error: message,
        });
        return;
      }
      if (
        latestDraftState === "cancelled" ||
        latestDraftState === "awaiting_confirmation" ||
        latestLifecycleStatus === "deleted" ||
        latestLifecycleStatus === "candidate"
      ) {
        logger.warn("[INGEST_ERROR] skipping failure write because item was removed or is candidate-only", {
          uid,
          itemId,
          runId,
          latestDraftState,
          latestLifecycleStatus,
          error: message,
        });
        return;
      }

      await ref.set(
        {
          ...(after.isDraft === true ? { draftState: "failed" } : {}),
          itemLifecycleStatus: "failed",
          ingestionStatus: "failed",
          ingestion: {
            runId,
            status: "failed",
            lastRunAt: FieldValue.serverTimestamp(),
            lastProcessedPhotoHash: photoHash,
            lastProcessedSourceHash: currentSourceHash,
            error: { message },
          },
        },
        { merge: true },
      );
    }
  },
);
