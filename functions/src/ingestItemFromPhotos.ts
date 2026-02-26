import { createHash, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import sharp from "sharp";
import {
  ALLOWED_COLORS,
  AllowedColor,
  Category,
  SUB_CATEGORIES,
  isValidCategorySubCategory,
  wearSlot,
} from "./shared/wardrobeTaxonomy";

if (!getApps().length) {
  initializeApp();
}

type IngestionStatus = "pending" | "processing" | "done" | "failed";

type ItemDoc = {
  category?: string;
  subCategory?: string;
  photos?: {
    primaryUrl?: string | null;
    urls?: string[];
    croppedUrl?: string;
    thumbUrl?: string;
  };
  photoUrl?: string | null;
  photoUri?: string | null;
  colors?: string[];
  colorLabel?: string;
  primaryColor?: string;
  colorSource?: "ai" | "user";
  colorUpdatedAt?: number;
  aiColorLabel?: string;
  aiColors?: string[];
  pixelColors?: string[];
  pixelColorHex?: string;
  colorConfidence?: number;
  colorNeedsReview?: boolean;
  crop?: { x: number; y: number; w: number; h: number; source: "ai" };
  ingestion?: {
    status?: IngestionStatus;
    lastRunAt?: Timestamp | { toMillis?: () => number } | number | null;
    error?: { message: string; code?: string };
    lastProcessedPhotoHash?: string;
  };
};

type RawExtraction = {
  category?: string;
  subCategory?: string;
  colors?: string[];
  pattern?: string;
  material?: string;
  formalityScore?: number;
  warmthScore?: number;
  bbox?: { x?: number; y?: number; w?: number; h?: number };
};
type LastRunAtValue = Timestamp | { toMillis?: () => number } | number | null | undefined;

const MODEL = "gpt-4.1-mini";
const HOUR_MS = 60 * 60 * 1000;
const ALLOWED_PATTERNS = new Set([
  "solid",
  "striped",
  "graphic",
  "checked",
  "textured",
  "unknown",
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
    item.photos?.primaryUrl ?? "",
    ...(Array.isArray(item.photos?.urls) ? item.photos!.urls : []),
    item.photoUrl ?? "",
    item.photoUri ?? "",
  ];

  const deduped = Array.from(new Set(values.map((v) => String(v).trim()).filter(Boolean)));
  return deduped.filter((url) => /^https?:\/\//i.test(url));
}

function hashPhotoUrls(urls: string[]): string {
  return createHash("sha1").update(urls.join("|")).digest("hex");
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizePattern(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (ALLOWED_PATTERNS.has(raw)) return raw;
  return "unknown";
}

function normalizeMaterial(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || "unknown";
}

function normalizeCategory(value: unknown): Category | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return null;
  if (raw === "shoes" || raw === "shoe") return Category.FOOTWEAR;
  if (raw === "onepiece") return Category.ONE_PIECE;
  if (Object.values(Category).includes(raw as Category)) return raw as Category;
  return null;
}

function normalizeSubCategory(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return raw || null;
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
  if (text.includes("beige") || text.includes("tan") || text.includes("khaki")) {
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

function normalizeColors(values: unknown): { colors: AllowedColor[]; colorLabel?: string } {
  if (!Array.isArray(values)) return {colors: []};

  const rawColors = values
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value) => !value.includes("multi") && !value.includes("various"))
    .slice(0, 2);

  const colorLabel = rawColors.length > 0 ? rawColors.join(" / ") : undefined;

  const out: AllowedColor[] = [];
  for (const raw of rawColors) {
    const mapped = normalizeColorToken(raw);
    if (!mapped) continue;
    if (!ALLOWED_COLOR_SET.has(mapped)) continue;
    if (!out.includes(mapped)) out.push(mapped);
    if (out.length >= 2) break;
  }

  return {colors: out, colorLabel};
}

function toHex(r: number, g: number, b: number): string {
  const parts = [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))));
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function rgbToHsv(
  r: number,
  g: number,
  b: number
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
  return {h, s, v};
}

function mapRgbToAllowedColor(r: number, g: number, b: number): AllowedColor {
  const {h, s, v} = rgbToHsv(r, g, b);

  // Low-saturation colors should map to neutral palette buckets.
  if (s < 0.2) {
    if (v > 0.85) return "white";
    if (v < 0.2) return "black";
    return "grey";
  }

  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 68) return "yellow";
  if (h < 170) return "green";
  if (h < 260) return "blue";
  if (h < 300) return "purple";
  if (h < 345) return "pink";

  return "grey";
}

async function downloadImageBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function clampBbox(
  bbox: RawExtraction["bbox"],
  width: number,
  height: number
): { left: number; top: number; cropWidth: number; cropHeight: number; normalized: { x: number; y: number; w: number; h: number; source: "ai" } } {
  const fallback = {x: 0.2, y: 0.15, w: 0.6, h: 0.7};
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

async function uploadImageAndGetUrl(path: string, bytes: Buffer, contentType = "image/jpeg"): Promise<string> {
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

async function detectPixelColor(croppedBytes: Buffer): Promise<{ pixelColor: AllowedColor; pixelHex: string }> {
  const tiny = await sharp(croppedBytes)
    .resize({width: 64, height: 64, fit: "inside"})
    .removeAlpha()
    .raw()
    .toBuffer({resolveWithObject: true});

  const histogram = new Map<string, {count: number; r: number; g: number; b: number}>();
  const channels = tiny.info.channels;
  const data = tiny.data;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = `${Math.floor(r / 16)}-${Math.floor(g / 16)}-${Math.floor(b / 16)}`;
    const existing = histogram.get(key);
    if (existing) {
      existing.count += 1;
      existing.r += r;
      existing.g += g;
      existing.b += b;
    } else {
      histogram.set(key, {count: 1, r, g, b});
    }
  }

  let dominant: {count: number; r: number; g: number; b: number} | null = null;
  for (const bucket of histogram.values()) {
    if (!dominant || bucket.count > dominant.count) {
      dominant = bucket;
    }
  }

  if (!dominant) {
    return {pixelColor: "grey", pixelHex: "#808080"};
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
  warmthScore: number
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

async function extractWithOpenAI(photoUrl: string): Promise<RawExtraction> {
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
      response_format: {type: "json_object"},
      messages: [
        {
          role: "system",
          content: [
            "Classify one clothing item from the image.",
            "Return strict JSON only with keys:",
            "category, subCategory, colors, pattern, material, formalityScore, warmthScore, bbox.",
            "No markdown, no extra keys, no prose.",
            "Do not hallucinate brand names or logos.",
            "Extract garment color only; ignore background objects, lighting casts, shadows, and skin tones.",
            "If uncertain about material or pattern, return 'unknown'.",
            "Return up to 2 concrete garment color names in colors. Do NOT output multicolor.",
            "bbox must be normalized 0..1 with x,y,w,h and tightly cover garment region while excluding most background.",
            "If unsure, use a safe central garment crop.",
            "Use strict scoring rubric with anchors:",
            "formalityScore: 0.0 gym/lounge tee, 0.3 casual everyday, 0.5 smart-casual knit, 0.7 business-casual shirt/blazer mix, 0.9 formal tailoring.",
            "warmthScore: 0.0 very light sleeveless/summer fabric, 0.3 light short-sleeve cotton, 0.5 midweight long-sleeve, 0.7 hoodie/sweater, 0.9 heavy coat/insulated outerwear.",
            "Hard constraints: if subCategory is tshirt then formalityScore <= 0.5 and warmthScore <= 0.4.",
            "Hard constraints: if category is top and subCategory is hoodie, sweatshirt, or sweater then warmthScore >= 0.6.",
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
                "Analyze this garment photo.",
                "Prefer visible garment type.",
                "If uncertain, pick the closest valid category/subCategory and use unknown for uncertain fields.",
                "Colors must describe the garment only, not the background.",
                "Return bbox values between 0 and 1.",
              ].join(" "),
            },
            {
              type: "image_url",
              image_url: {url: photoUrl},
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${body.slice(0, 240)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
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
  logger.info("OpenAI parsed extraction payload", {parsed});

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

    const photoUrls = extractPhotoUrls(after);
    if (photoUrls.length === 0) {
      logger.info("Skipping ingestion: no photo URLs", {uid, itemId});
      return;
    }

    const photoHash = hashPhotoUrls(photoUrls);
    const status = String(after.ingestion?.status ?? "").trim() as IngestionStatus | "";
    const existingColorSource = String(after.colorSource ?? "").trim().toLowerCase();
    const hasUserColorOverride = existingColorSource === "user";
    const lastRunAtMs = toMillis(after.ingestion?.lastRunAt);
    const lastHash = after.ingestion?.lastProcessedPhotoHash ?? before?.ingestion?.lastProcessedPhotoHash ?? "";
    const hasNewPhoto = lastHash !== photoHash;

    const retryBlocked =
      status === "failed" &&
      !hasNewPhoto &&
      !!lastRunAtMs &&
      Date.now() - lastRunAtMs < HOUR_MS;

    const shouldRun =
      (!status || status === "pending") ||
      ((status === "done" || status === "processing" || status === "failed") && hasNewPhoto);

    if (!shouldRun || retryBlocked) {
      logger.info("Skipping ingestion: conditions not met", {
        uid,
        itemId,
        status: status ?? "missing",
        hasNewPhoto,
        retryBlocked,
      });
      return;
    }

    const db = getFirestore();
    const ref = db.doc(`users/${uid}/items/${itemId}`);

    logger.info("Ingestion transition", {uid, itemId, from: status ?? "missing", to: "processing"});
    await ref.set({
      ingestion: {
        status: "processing",
        lastRunAt: FieldValue.serverTimestamp(),
        lastProcessedPhotoHash: photoHash,
      },
    }, {merge: true});

    try {
      const extracted = await extractWithOpenAI(photoUrls[0]);
      let warning: string | null = null;

      let category = normalizeCategory(extracted.category);
      let subCategory = normalizeSubCategory(extracted.subCategory);

      if (!category) {
        category = Category.TOP;
        subCategory = "tshirt";
        warning = "Invalid category from classifier; fallback applied.";
      } else if (!subCategory) {
        subCategory = SUB_CATEGORIES[category][0];
        warning = "Sub-category missing; defaulted by category.";
      } else if (!isValidCategorySubCategory(category, subCategory)) {
        subCategory = SUB_CATEGORIES[category][0];
        warning = "Invalid sub-category from classifier; defaulted by category.";
      }

      const pattern = normalizePattern(extracted.pattern);
      const material = normalizeMaterial(extracted.material);
      const {colors: aiColorsRaw, colorLabel} = normalizeColors(extracted.colors);
      const aiColors = aiColorsRaw.slice(0, 2);
      const safeAiColorLabel = colorLabel?.trim() ? colorLabel.trim() : null;

      const originalBytes = await downloadImageBytes(photoUrls[0]);
      const metadata = await sharp(originalBytes).metadata();
      const imageWidth = metadata.width ?? 0;
      const imageHeight = metadata.height ?? 0;
      if (!imageWidth || !imageHeight) {
        throw new Error("Unable to read source image dimensions");
      }

      const cropRect = clampBbox(extracted.bbox, imageWidth, imageHeight);
      const croppedBytes = await sharp(originalBytes)
        .extract({
          left: cropRect.left,
          top: cropRect.top,
          width: cropRect.cropWidth,
          height: cropRect.cropHeight,
        })
        .jpeg({quality: 85})
        .toBuffer();
      const thumbBytes = await sharp(croppedBytes)
        .resize({width: 256})
        .jpeg({quality: 78})
        .toBuffer();

      const croppedStoragePath = `users/${uid}/items/${itemId}/cropped.jpg`;
      const thumbStoragePath = `users/${uid}/items/${itemId}/thumb.jpg`;
      const croppedUrl = await uploadImageAndGetUrl(croppedStoragePath, croppedBytes);
      const thumbUrl = await uploadImageAndGetUrl(thumbStoragePath, thumbBytes);

      const pixelResult = await detectPixelColor(croppedBytes);
      const pixelPrimary = pixelResult.pixelColor;
      const pixelColors: AllowedColor[] = [pixelPrimary];

      const aiPrimary = aiColors[0];
      const pixelPrimaryMatchesAi = !!aiPrimary && aiPrimary === pixelPrimary;

      let finalColors: AllowedColor[] = [];
      let finalColorLabel: string | null = null;
      let finalPrimaryColor: string | undefined;
      let colorConfidence = 0.5;
      let colorNeedsReview = false;

      if (pixelPrimaryMatchesAi) {
        finalColors = [pixelPrimary];
        finalColorLabel = safeAiColorLabel ? toTitleCase(safeAiColorLabel) : toTitleCase(pixelPrimary);
        finalPrimaryColor = toTitleCase(pixelPrimary);
        colorConfidence = 0.9;
        colorNeedsReview = false;
      } else if (pixelPrimary) {
        finalColors = [pixelPrimary];
        finalColorLabel = toTitleCase(pixelPrimary);
        finalPrimaryColor = toTitleCase(pixelPrimary);
        colorConfidence = 0.5;
        colorNeedsReview = !!aiPrimary;
      } else if (aiPrimary) {
        finalColors = [aiPrimary];
        finalColorLabel = safeAiColorLabel ? toTitleCase(safeAiColorLabel) : toTitleCase(aiPrimary);
        finalPrimaryColor = toTitleCase(aiPrimary);
        colorConfidence = 0.6;
        colorNeedsReview = false;
      }
      const persistedColorNeedsReview = hasUserColorOverride ? false : colorNeedsReview;

      const constrainedScores = applyScoreConstraints(
        category,
        subCategory,
        clampScore(extracted.formalityScore),
        clampScore(extracted.warmthScore)
      );
      let formalityScore = constrainedScores.formalityScore;
      let warmthScore = constrainedScores.warmthScore;

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
          wearSlot: wearSlot(category),
          pattern,
          material,
          aiColors,
          ...(safeAiColorLabel ? {aiColorLabel: safeAiColorLabel} : {}),
          pixelColors,
          pixelColorHex: pixelResult.pixelHex,
          ...(hasUserColorOverride ? {} : {colorConfidence}),
          colorNeedsReview: persistedColorNeedsReview,
          crop: cropRect.normalized,
          photos: {
            primaryUrl: photoUrls[0],
            urls: photoUrls,
            croppedUrl,
            thumbUrl,
          },
          finalColors,
          ...(finalColorLabel ? {finalColorLabel} : {}),
          finalPrimaryColor,
          colorSource: hasUserColorOverride ? "user" : "ai",
          formalityScore,
          warmthScore,
          warning,
          userColorOverridePreserved: hasUserColorOverride,
        },
      });

      await ref.set({
        category,
        subCategory,
        wearSlot: wearSlot(category),
        pattern,
        material,
        ...(safeAiColorLabel ? {aiColorLabel: safeAiColorLabel} : {}),
        ...(aiColors.length > 0 ? {aiColors} : {}),
        ...(pixelColors.length > 0 ? {pixelColors} : {}),
        ...(pixelResult.pixelHex ? {pixelColorHex: pixelResult.pixelHex} : {}),
        ...(hasUserColorOverride ? {} : {colorConfidence}),
        colorNeedsReview: persistedColorNeedsReview,
        crop: cropRect.normalized,
        ...(!hasUserColorOverride ? {
          ...(finalColors.length > 0 ? {colors: finalColors} : {}),
          ...(finalColorLabel ? {colorLabel: finalColorLabel} : {}),
          ...(finalPrimaryColor ? {primaryColor: finalPrimaryColor} : {}),
          colorSource: "ai",
          colorUpdatedAt: Date.now(),
        } : {}),
        formalityScore,
        warmthScore,
        photos: {
          primaryUrl: photoUrls[0],
          urls: photoUrls,
          croppedUrl,
          thumbUrl,
        },
        ingestion: {
          status: "done",
          lastRunAt: FieldValue.serverTimestamp(),
          lastProcessedPhotoHash: photoHash,
          ...(warning ? {error: {message: warning, code: "warning"}} : {}),
        },
      }, {merge: true});

      logger.info("Ingestion transition", {
        uid,
        itemId,
        from: "processing",
        to: "done",
        category,
        subCategory,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown ingestion error";
      logger.error("Ingestion failed", {uid, itemId, error: message});

      await ref.set({
        ingestion: {
          status: "failed",
          lastRunAt: FieldValue.serverTimestamp(),
          lastProcessedPhotoHash: photoHash,
          error: {message},
        },
      }, {merge: true});
    }
  }
);
