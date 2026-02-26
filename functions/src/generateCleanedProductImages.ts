import { createHash, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import path from "node:path";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

if (!getApps().length) {
  initializeApp();
}

type LastRunLike = Timestamp | { toMillis?: () => number } | number | null | undefined;

type ItemDoc = {
  updatedAt?: LastRunLike;
  cleanedUpdatedAt?: LastRunLike;
  colorUpdatedAt?: LastRunLike;
  cropUpdatedAt?: LastRunLike;
  crop?: Record<string, unknown> | null;
  photoUrl?: string | null;
  photos?: {
    primaryUrl?: string | null;
    urls?: string[];
    croppedUrl?: string | null;
    cleanedUrl?: string | null;
    cleanedThumbUrl?: string | null;
    cleanedSource?: string | null;
    cleanedFromHash?: string | null;
    cleanedCrop?: Record<string, unknown> | null;
  };
  ingestion?: {
    status?: string;
  };
};

let sessionPromise: Promise<ort.InferenceSession> | null = null;

async function getSegmentationSession(): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const modelPath = path.join(__dirname, "..", "models", "u2netp.onnx");
    const modelLoadStart = Date.now();
    const session = await ort.InferenceSession.create(modelPath);
    logger.info("Loaded ONNX segmentation model", {
      modelPath,
      modelLoadMs: Date.now() - modelLoadStart,
      inputNames: session.inputNames,
      outputNames: session.outputNames,
    });
    return session;
  })();

  return sessionPromise;
}

function pickCleanedFields(doc?: ItemDoc) {
  return {
    cleanedUpdatedAt: doc?.cleanedUpdatedAt ?? null,
    cleanedUrl: doc?.photos?.cleanedUrl ?? null,
    cleanedThumbUrl: doc?.photos?.cleanedThumbUrl ?? null,
    cleanedSource: doc?.photos?.cleanedSource ?? null,
    cleanedFromHash: doc?.photos?.cleanedFromHash ?? null,
    cleanedCrop: doc?.photos?.cleanedCrop ?? null,
  };
}

function stripCleanedFields(doc?: ItemDoc): Record<string, unknown> {
  if (!doc) return {};
  return {
    ...doc,
    cleanedUpdatedAt: undefined,
    photos: {
      ...(doc.photos ?? {}),
      cleanedUrl: undefined,
      cleanedThumbUrl: undefined,
      cleanedSource: undefined,
      cleanedFromHash: undefined,
      cleanedCrop: undefined,
    },
  };
}

function toMillis(value: LastRunLike): number | null {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value === "object" && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return null;
}

function trimStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function getInputImageUrl(item: ItemDoc): string {
  const candidate =
    item.photos?.croppedUrl ||
    item.photos?.primaryUrl ||
    item.photoUrl ||
    item.photos?.urls?.[0] ||
    "";
  const url = String(candidate).trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

async function downloadImageBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download source image: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function uploadImageAndGetUrl(path: string, bytes: Buffer): Promise<string> {
  const bucket = getStorage().bucket();
  const token = randomUUID();
  const file = bucket.file(path);

  await file.save(bytes, {
    metadata: {
      contentType: "image/jpeg",
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
    resumable: false,
  });

  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function createCleanedImagesWithOnnx(sourceBytes: Buffer): Promise<{
  cleanedBytes: Buffer;
  cleanedThumbBytes: Buffer;
  inferMs: number;
  alphaMin: number;
  alphaMax: number;
  chosenOutputName: string;
  inverted: boolean;
  fgRatio: number;
  alphaMean: number;
  alphaP05: number;
  alphaP95: number;
  alphaSpread: number;
}> {
  const originalMeta = await sharp(sourceBytes)
    .rotate()
    .metadata();
  const originalWidth = originalMeta.width ?? 0;
  const originalHeight = originalMeta.height ?? 0;
  if (!originalWidth || !originalHeight) {
    throw new Error("Invalid original dimensions for cleaned image generation");
  }

  const originalRgb = await sharp(sourceBytes)
    .rotate()
    .removeAlpha()
    .raw()
    .toBuffer({resolveWithObject: true});
  const rgbWidth = originalRgb.info.width;
  const rgbHeight = originalRgb.info.height;
  if (!rgbWidth || !rgbHeight) {
    throw new Error("Invalid RGB dimensions for cleaned image generation");
  }

  const modelWidth = 320;
  const modelHeight = 320;
  const resized = await sharp(originalRgb.data, {
    raw: {width: rgbWidth, height: rgbHeight, channels: 3},
  })
    .resize(modelWidth, modelHeight, {fit: "fill"})
    .raw()
    .toBuffer();

  const hw = modelWidth * modelHeight;
  const tensorData = new Float32Array(3 * hw);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  for (let i = 0; i < hw; i++) {
    const pixelIndex = i * 3;
    const r = resized[pixelIndex] / 255;
    const g = resized[pixelIndex + 1] / 255;
    const b = resized[pixelIndex + 2] / 255;
    tensorData[i] = (r - mean[0]) / std[0];
    tensorData[hw + i] = (g - mean[1]) / std[1];
    tensorData[2 * hw + i] = (b - mean[2]) / std[2];
  }

  const input = new ort.Tensor("float32", tensorData, [1, 3, modelHeight, modelWidth]);
  const session = await getSegmentationSession();
  const inputName = session.inputNames[0];
  const inferStart = Date.now();
  const outputMap = await session.run({[inputName]: input});
  const inferMs = Date.now() - inferStart;

  const percentile = (values: number[], p: number): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
    return sorted[idx];
  };

  type OutputEval = {
    name: string;
    mask320: Float32Array;
    alphaMean: number;
    alphaP05: number;
    alphaP95: number;
    alphaSpread: number;
    fgRatio: number;
    score: number;
  };
  const evaluatedOutputs: OutputEval[] = [];
  const validOutputs: OutputEval[] = [];

  for (const outputName of session.outputNames) {
    const output = outputMap[outputName];
    if (!output) continue;

    const outputDataRaw = output.data as Float32Array | number[];
    const outputData = Array.from(outputDataRaw as ArrayLike<number>);
    const outputDims = output.dims;
    const maskWidth =
      outputDims.length >= 2 && outputDims[outputDims.length - 1] > 0
        ? outputDims[outputDims.length - 1]
        : modelWidth;
    const maskHeight =
      outputDims.length >= 2 && outputDims[outputDims.length - 2] > 0
        ? outputDims[outputDims.length - 2]
        : modelHeight;
    const plane = maskWidth * maskHeight;
    if (plane <= 0 || outputData.length < plane) continue;

    const offset = outputData.length - plane;
    let rawMin = Number.POSITIVE_INFINITY;
    let rawMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < plane; i++) {
      const v = outputData[offset + i];
      if (v < rawMin) rawMin = v;
      if (v > rawMax) rawMax = v;
    }

    const looksLikeLogits = rawMin < 0 || rawMax > 1;
    const maskU8 = new Uint8Array(plane);
    for (let i = 0; i < plane; i++) {
      const raw = outputData[offset + i];
      const prob = looksLikeLogits ? 1 / (1 + Math.exp(-raw)) : raw;
      const clamped = Math.max(0, Math.min(1, prob));
      maskU8[i] = Math.round(clamped * 255);
    }

    const mask320Bytes = await sharp(Buffer.from(maskU8), {
      raw: {width: maskWidth, height: maskHeight, channels: 1},
    })
      .resize(modelWidth, modelHeight, {fit: "fill"})
      .raw()
      .toBuffer();
    const mask320 = new Float32Array(modelWidth * modelHeight);
    const asNumbers = new Array<number>(mask320.length);
    for (let i = 0; i < mask320.length; i++) {
      const value = mask320Bytes[i] / 255;
      mask320[i] = value;
      asNumbers[i] = value;
    }

    const p05 = percentile(asNumbers, 0.05);
    const p95 = percentile(asNumbers, 0.95);
    const spread = p95 - p05;
    const alphaMean = asNumbers.reduce((sum, value) => sum + value, 0) / asNumbers.length;
    const fgCount = asNumbers.reduce((sum, value) => sum + (value > 0.5 ? 1 : 0), 0);
    const fgRatio = fgCount / asNumbers.length;
    const score = spread * (1 - Math.abs(fgRatio - 0.35));

    const out: OutputEval = {
      name: outputName,
      mask320,
      alphaMean,
      alphaP05: p05,
      alphaP95: p95,
      alphaSpread: spread,
      fgRatio,
      score,
    };
    evaluatedOutputs.push(out);
    if (fgRatio >= 0.03 && fgRatio <= 0.97) {
      validOutputs.push(out);
    }
  }

  if (evaluatedOutputs.length === 0) {
    throw new Error("No valid ONNX output mask found");
  }

  let selected = validOutputs.sort((a, b) => b.score - a.score)[0];
  if (!selected) {
    const fallbackName = session.outputNames[session.outputNames.length - 1] ?? "";
    selected =
      evaluatedOutputs.find((out) => out.name === fallbackName) ??
      evaluatedOutputs[evaluatedOutputs.length - 1];
  }

  const normDen = Math.max(1e-6, selected.alphaP95 - selected.alphaP05);
  const alphaNormalizedFloat = new Float32Array(selected.mask320.length);
  for (let i = 0; i < selected.mask320.length; i++) {
    const clamped = Math.max(selected.alphaP05, Math.min(selected.alphaP95, selected.mask320[i]));
    const scaled = (clamped - selected.alphaP05) / normDen;
    const gamma = Math.pow(Math.max(0, Math.min(1, scaled)), 0.8);
    alphaNormalizedFloat[i] = gamma;
  }

  const fgRatioFor = (values: Float32Array): number => {
    let fg = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > 0.5) fg += 1;
    }
    return fg / values.length;
  };

  const fgRatioAlpha = fgRatioFor(alphaNormalizedFloat);
  const invAlpha = new Float32Array(alphaNormalizedFloat.length);
  for (let i = 0; i < alphaNormalizedFloat.length; i++) {
    invAlpha[i] = 1 - alphaNormalizedFloat[i];
  }
  const fgRatioInvAlpha = fgRatioFor(invAlpha);

  const target = 0.35;
  const alphaValid = fgRatioAlpha >= 0.05 && fgRatioAlpha <= 0.9;
  const invValid = fgRatioInvAlpha >= 0.05 && fgRatioInvAlpha <= 0.9;
  const chooseInverted =
    (!alphaValid && invValid) ||
    (alphaValid && invValid && Math.abs(fgRatioInvAlpha - target) < Math.abs(fgRatioAlpha - target));

  const selectedAlpha = chooseInverted ? invAlpha : alphaNormalizedFloat;
  const fgRatioSelected = chooseInverted ? fgRatioInvAlpha : fgRatioAlpha;
  if (fgRatioSelected < 0.05 || fgRatioSelected > 0.9) {
    throw new Error(
      `Degenerate selected foreground ratio: ${fgRatioSelected.toFixed(4)} (output=${selected.name})`
    );
  }

  const alphaNormalized = new Uint8Array(selectedAlpha.length);
  for (let i = 0; i < selectedAlpha.length; i++) {
    alphaNormalized[i] = Math.round(Math.max(0, Math.min(1, selectedAlpha[i])) * 255);
  }

  const alphaResized = await sharp(Buffer.from(alphaNormalized), {
    raw: {width: modelWidth, height: modelHeight, channels: 1},
  })
    .resize(originalWidth, originalHeight, {fit: "fill"})
    .blur(0.8)
    .raw()
    .toBuffer({resolveWithObject: true});
  const alphaWidthFinal = alphaResized.info.width;
  const alphaHeightFinal = alphaResized.info.height;
  const alphaData = alphaResized.data;

  if (
    rgbWidth !== originalWidth ||
    rgbHeight !== originalHeight ||
    alphaWidthFinal !== originalWidth ||
    alphaHeightFinal !== originalHeight
  ) {
    throw new Error(
      `Alpha/RGB dimension mismatch rgb=${rgbWidth}x${rgbHeight} alpha=${alphaWidthFinal}x${alphaHeightFinal} original=${originalWidth}x${originalHeight}`
    );
  }

  let finalAlphaMin = Number.POSITIVE_INFINITY;
  let finalAlphaMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < alphaData.length; i++) {
    const v = alphaData[i] / 255;
    if (v < finalAlphaMin) finalAlphaMin = v;
    if (v > finalAlphaMax) finalAlphaMax = v;
  }
  if (finalAlphaMax < 0.05 || finalAlphaMax - finalAlphaMin < 0.01) {
    throw new Error(
      `Degenerate alpha mask: min=${finalAlphaMin.toFixed(4)} max=${finalAlphaMax.toFixed(4)}`
    );
  }

  let alphaSum = 0;
  for (let i = 0; i < alphaData.length; i++) {
    alphaSum += alphaData[i] / 255;
  }
  const alphaMean = alphaData.length ? alphaSum / alphaData.length : 0;
  let fgCountFinal = 0;
  for (let i = 0; i < alphaData.length; i++) {
    if (alphaData[i] / 255 > 0.5) fgCountFinal += 1;
  }
  const fgRatio = alphaData.length ? fgCountFinal / alphaData.length : 0;
  if (fgRatio < 0.03 || fgRatio > 0.97) {
    throw new Error(`Degenerate final foreground ratio: ${fgRatio.toFixed(4)}`);
  }

  const cleanedRaw = Buffer.alloc(rgbWidth * rgbHeight * 3);
  for (let i = 0; i < rgbWidth * rgbHeight; i++) {
    const alpha = alphaData[i] / 255;
    const base = i * 3;
    cleanedRaw[base] = Math.round(originalRgb.data[base] * alpha + 255 * (1 - alpha));
    cleanedRaw[base + 1] = Math.round(originalRgb.data[base + 1] * alpha + 255 * (1 - alpha));
    cleanedRaw[base + 2] = Math.round(originalRgb.data[base + 2] * alpha + 255 * (1 - alpha));
  }

  const cleanedBytes = await sharp(cleanedRaw, {
    raw: {width: rgbWidth, height: rgbHeight, channels: 3},
  })
    .resize({width: 1024, height: 1024, fit: "inside", withoutEnlargement: true})
    .jpeg({quality: 88})
    .toBuffer();

  const cleanedThumbBytes = await sharp(cleanedBytes)
    .resize({width: 256, height: 256, fit: "inside", withoutEnlargement: true})
    .jpeg({quality: 80})
    .toBuffer();

  return {
    cleanedBytes,
    cleanedThumbBytes,
    inferMs,
    alphaMin: Number.isFinite(finalAlphaMin) ? finalAlphaMin : 0,
    alphaMax: Number.isFinite(finalAlphaMax) ? finalAlphaMax : 0,
    chosenOutputName: selected.name,
    inverted: chooseInverted,
    fgRatio,
    alphaMean,
    alphaP05: selected.alphaP05,
    alphaP95: selected.alphaP95,
    alphaSpread: selected.alphaSpread,
  };
}

export const generateCleanedProductImages = onDocumentWritten(
  {
    document: "users/{uid}/items/{itemId}",
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 60,
  },
  async (event) => {
    const uid = String(event.params.uid ?? "");
    const itemId = String(event.params.itemId ?? "");
    const before = event.data?.before.data() as ItemDoc | undefined;
    const after = event.data?.after.data() as ItemDoc | undefined;
    if (!after) return;

    if (before) {
      const cleanedChanged =
        JSON.stringify(pickCleanedFields(before)) !==
        JSON.stringify(pickCleanedFields(after));
      const onlyCleanedFieldsChanged =
        cleanedChanged &&
        JSON.stringify(stripCleanedFields(before)) ===
          JSON.stringify(stripCleanedFields(after));

      if (onlyCleanedFieldsChanged) {
        logger.info("Skipping cleaned image generation: self-write", {uid, itemId});
        return;
      }
    }

    const status = trimStatus(after.ingestion?.status);
    if (status !== "done") {
      logger.info("Skipping cleaned image generation: ingestion is not done", {uid, itemId, status});
      return;
    }

    const inputUrl = getInputImageUrl(after);
    if (!inputUrl) {
      logger.info("Skipping cleaned image generation: no valid source url", {uid, itemId});
      return;
    }

    const missingCleaned = !after.photos?.cleanedUrl || !after.photos?.cleanedThumbUrl;
    const cleanedUpdatedAtMs = toMillis(after.cleanedUpdatedAt);
    const updatedAtMs = toMillis(after.updatedAt) ?? 0;
    const colorUpdatedAtMs = toMillis(after.colorUpdatedAt) ?? 0;
    const cropUpdatedAtMs = toMillis(after.cropUpdatedAt) ?? 0;
    const sourceUpdatedAtMs = Math.max(updatedAtMs, colorUpdatedAtMs, cropUpdatedAtMs);
    const stale = !!sourceUpdatedAtMs && (!cleanedUpdatedAtMs || cleanedUpdatedAtMs < sourceUpdatedAtMs);
    const cropChanged =
      JSON.stringify(after.crop ?? null) !== JSON.stringify(after.photos?.cleanedCrop ?? null);

    if (!missingCleaned && !stale && !cropChanged) {
      logger.info("Skipping cleaned image generation: output already fresh", {
        uid,
        itemId,
        missingCleaned,
        stale,
        cropChanged,
        sourceUpdatedAtMs,
        cleanedUpdatedAtMs,
      });
      return;
    }

    const sourceBytes = await downloadImageBytes(inputUrl);
    const sourceHash = createHash("sha1").update(sourceBytes).digest("hex");
    const cleanedFromHash = String(after.photos?.cleanedFromHash ?? "").trim();
    if (cleanedFromHash && cleanedFromHash === sourceHash) {
      logger.info("Skipping cleaned image generation: same source hash", {uid, itemId, sourceHash});
      return;
    }

    let cleanedResult: {
      cleanedBytes: Buffer;
      cleanedThumbBytes: Buffer;
      inferMs: number;
      alphaMin: number;
      alphaMax: number;
      chosenOutputName: string;
      inverted: boolean;
      fgRatio: number;
      alphaMean: number;
      alphaP05: number;
      alphaP95: number;
      alphaSpread: number;
    };
    try {
      cleanedResult = await createCleanedImagesWithOnnx(sourceBytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("ONNX cleaned image generation failed", {
        uid,
        itemId,
        inputUrl,
        error: message,
      });
      return;
    }
    const cleanedBytes = cleanedResult.cleanedBytes;
    const cleanedThumbBytes = cleanedResult.cleanedThumbBytes;

    const cleanedPath = `users/${uid}/items/${itemId}/cleaned.jpg`;
    const cleanedThumbPath = `users/${uid}/items/${itemId}/cleaned_thumb.jpg`;
    const cleanedUrl = await uploadImageAndGetUrl(cleanedPath, cleanedBytes);
    const cleanedThumbUrl = await uploadImageAndGetUrl(cleanedThumbPath, cleanedThumbBytes);

    logger.info("Cleaned image generation transition", {
      uid,
      itemId,
      inputUrl,
      cleanedPath,
      cleanedThumbPath,
      sourceBytes: sourceBytes.length,
      inferMs: cleanedResult.inferMs,
      chosenOutputName: cleanedResult.chosenOutputName,
      inverted: cleanedResult.inverted,
      fgRatio: cleanedResult.fgRatio,
      alphaMean: cleanedResult.alphaMean,
      alphaP05: cleanedResult.alphaP05,
      alphaP95: cleanedResult.alphaP95,
      alphaSpread: cleanedResult.alphaSpread,
      alphaMin: cleanedResult.alphaMin,
      alphaMax: cleanedResult.alphaMax,
      cleanedBytes: cleanedBytes.length,
      cleanedThumbBytes: cleanedThumbBytes.length,
    });

    const db = getFirestore();
    const ref = db.doc(`users/${uid}/items/${itemId}`);
    await ref.set(
      {
        photos: {
          cleanedUrl,
          cleanedThumbUrl,
          cleanedSource: "onnx",
          cleanedFromHash: sourceHash,
          cleanedCrop: after.crop ?? null,
        },
        cleanedUpdatedAt: Date.now(),
      },
      {merge: true}
    );
  }
);
