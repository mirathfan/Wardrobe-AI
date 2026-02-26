import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
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
    forceCleaned?: boolean | null;
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

async function uploadImageAndGetUrl(path: string, bytes: Buffer, contentType = "image/jpeg"): Promise<string> {
  const bucket = getStorage().bucket();
  const token = randomUUID();
  const file = bucket.file(path);

  await file.save(bytes, {
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

type CleanedOnnxSuccess = {
  ok: true;
  cleanedBytes: Buffer;
  cleanedThumbBytes: Buffer;
  debugMaskBytes: Buffer;
  debugOverlayBytes: Buffer;
  inferMs: number;
  alphaMin: number;
  alphaMax: number;
  chosenOutputName: string;
  inverted: boolean;
  fgRatio: number;
  centerMinusBorder: number;
  alphaMean: number;
  alphaP05: number;
  alphaP95: number;
  alphaSpread: number;
};

type CleanedOnnxFailure = {
  ok: false;
  reason: string;
};

async function createCleanedImagesWithOnnx(sourceBytes: Buffer): Promise<CleanedOnnxSuccess | CleanedOnnxFailure> {
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
    alphaP05: number;
    alphaP95: number;
    alphaSpread: number;
  };
  type MaskCandidate = {
    outputName: string;
    inverted: boolean;
    mask320: Float32Array;
    alphaMean: number;
    fgRatio: number;
    centerMinusBorder: number;
    alphaP05: number;
    alphaP95: number;
    alphaSpread: number;
    score: number;
  };
  const evaluatedOutputs: OutputEval[] = [];
  const validCandidates: MaskCandidate[] = [];

  const computeBorderCenterGap = (values: Float32Array): number => {
    const w = modelWidth;
    const h = modelHeight;
    const borderW = Math.max(1, Math.round(w * 0.12));
    const borderH = Math.max(1, Math.round(h * 0.12));
    const centerX0 = Math.floor(w * 0.2);
    const centerX1 = Math.ceil(w * 0.8);
    const centerY0 = Math.floor(h * 0.2);
    const centerY1 = Math.ceil(h * 0.8);

    let borderSum = 0;
    let borderCount = 0;
    let centerSum = 0;
    let centerCount = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const v = values[idx];
        const isBorder =
          x < borderW || x >= w - borderW || y < borderH || y >= h - borderH;
        if (isBorder) {
          borderSum += v;
          borderCount += 1;
        }
        if (x >= centerX0 && x < centerX1 && y >= centerY0 && y < centerY1) {
          centerSum += v;
          centerCount += 1;
        }
      }
    }

    const borderMean = borderCount ? borderSum / borderCount : 0;
    const centerMean = centerCount ? centerSum / centerCount : 0;
    return centerMean - borderMean;
  };

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
    let sampledMin = Number.POSITIVE_INFINITY;
    let sampledMax = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < asNumbers.length; i += 32) {
      const v = asNumbers[i];
      if (v < sampledMin) sampledMin = v;
      if (v > sampledMax) sampledMax = v;
    }
    logger.info("ONNX output stats", {
      outputName,
      outputDims,
      outputDataLength: outputData.length,
      rawMin,
      rawMax,
      sampledMin,
      sampledMax,
      alphaP05: p05,
      alphaP95: p95,
      alphaSpread: spread,
    });
    const out: OutputEval = {
      name: outputName,
      alphaP05: p05,
      alphaP95: p95,
      alphaSpread: spread,
    };
    evaluatedOutputs.push(out);

    const normDen = Math.max(1e-6, p95 - p05);
    const normalized = new Float32Array(mask320.length);
    for (let i = 0; i < mask320.length; i++) {
      const clamped = Math.max(p05, Math.min(p95, mask320[i]));
      const scaled = (clamped - p05) / normDen;
      const gamma = Math.pow(Math.max(0, Math.min(1, scaled)), 0.8);
      normalized[i] = gamma;
    }

    const addCandidate = (candidateMask: Float32Array, inverted: boolean) => {
      if (spread < 0.05) return;

      let sum = 0;
      let fgCount = 0;
      for (let i = 0; i < candidateMask.length; i++) {
        const value = candidateMask[i];
        sum += value;
        if (value > 0.5) fgCount += 1;
      }
      const alphaMean = candidateMask.length ? sum / candidateMask.length : 0;
      const fgRatio = candidateMask.length ? fgCount / candidateMask.length : 0;
      if (fgRatio < 0.01 || fgRatio > 0.995) return;

      const centerMinusBorder = computeBorderCenterGap(candidateMask);
      const score = spread + centerMinusBorder * 0.3;
      logger.info("ONNX candidate stats", {
        outputName,
        inverted,
        fgRatio,
        alphaMean,
        centerMinusBorder,
        spread,
        score,
      });

      validCandidates.push({
        outputName,
        inverted,
        mask320: candidateMask,
        alphaMean,
        fgRatio,
        centerMinusBorder,
        alphaP05: p05,
        alphaP95: p95,
        alphaSpread: spread,
        score,
      });
    };

    addCandidate(normalized, false);
    const inverted = new Float32Array(normalized.length);
    for (let i = 0; i < normalized.length; i++) {
      inverted[i] = 1 - normalized[i];
    }
    addCandidate(inverted, true);
  }

  if (evaluatedOutputs.length === 0) {
    return {
      ok: false,
      reason: "No valid ONNX output mask found",
    };
  }

  if (validCandidates.length === 0) {
    return {
      ok: false,
      reason: "No non-degenerate ONNX mask candidate found",
    };
  }

  const selected = validCandidates.sort((a, b) => b.score - a.score)[0];
  logger.info("ONNX selected candidate", {
    outputName: selected.outputName,
    inverted: selected.inverted,
    fgRatio: selected.fgRatio,
    centerMinusBorder: selected.centerMinusBorder,
    alphaMean: selected.alphaMean,
    spread: selected.alphaSpread,
    score: selected.score,
  });
  const selectedAlpha = selected.mask320;
  if (selected.fgRatio < 0.02 || selected.fgRatio > 0.995 || selected.alphaSpread < 0.10) {
    return {
      ok: false,
      reason: `Selected mask failed threshold checks fg=${selected.fgRatio.toFixed(4)} spread=${selected.alphaSpread.toFixed(4)}`,
    };
  }

  const alphaNormalized = new Uint8Array(selectedAlpha.length);
  for (let i = 0; i < selectedAlpha.length; i++) {
    alphaNormalized[i] = Math.round(Math.max(0, Math.min(1, selectedAlpha[i])) * 255);
  }
  const debugMaskBytes = await sharp(Buffer.from(alphaNormalized), {
    raw: {width: modelWidth, height: modelHeight, channels: 1},
  })
    .png()
    .toBuffer();
  await writeFile("/tmp/mask.png", debugMaskBytes);

  const overlayRaw = Buffer.alloc(modelWidth * modelHeight * 3);
  for (let i = 0; i < modelWidth * modelHeight; i++) {
    const a = selectedAlpha[i];
    const base = i * 3;
    const r = resized[base];
    const g = resized[base + 1];
    const b = resized[base + 2];
    overlayRaw[base] = Math.round(r * (1 - a * 0.6) + 255 * (a * 0.6));
    overlayRaw[base + 1] = Math.round(g * (1 - a * 0.6));
    overlayRaw[base + 2] = Math.round(b * (1 - a * 0.6));
  }
  const debugOverlayBytes = await sharp(overlayRaw, {
    raw: {width: modelWidth, height: modelHeight, channels: 3},
  })
    .png()
    .toBuffer();
  await writeFile("/tmp/overlay.png", debugOverlayBytes);

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
    ok: true,
    cleanedBytes,
    cleanedThumbBytes,
    debugMaskBytes,
    debugOverlayBytes,
    inferMs,
    alphaMin: Number.isFinite(finalAlphaMin) ? finalAlphaMin : 0,
    alphaMax: Number.isFinite(finalAlphaMax) ? finalAlphaMax : 0,
    chosenOutputName: selected.outputName,
    inverted: selected.inverted,
    fgRatio,
    centerMinusBorder: selected.centerMinusBorder,
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

    const forceCleaned = after.photos?.forceCleaned === true;
    const missingCleaned = !after.photos?.cleanedUrl || !after.photos?.cleanedThumbUrl;
    const cleanedUpdatedAtMs = toMillis(after.cleanedUpdatedAt);
    const updatedAtMs = toMillis(after.updatedAt) ?? 0;
    const colorUpdatedAtMs = toMillis(after.colorUpdatedAt) ?? 0;
    const cropUpdatedAtMs = toMillis(after.cropUpdatedAt) ?? 0;
    const sourceUpdatedAtMs = Math.max(updatedAtMs, colorUpdatedAtMs, cropUpdatedAtMs);
    const stale = !!sourceUpdatedAtMs && (!cleanedUpdatedAtMs || cleanedUpdatedAtMs < sourceUpdatedAtMs);
    const cropChanged =
      JSON.stringify(after.crop ?? null) !== JSON.stringify(after.photos?.cleanedCrop ?? null);

    if (!forceCleaned && !missingCleaned && !stale && !cropChanged) {
      logger.info("Skipping cleaned image generation: output already fresh", {
        uid,
        itemId,
        forceCleaned,
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
    if (!forceCleaned && cleanedFromHash && cleanedFromHash === sourceHash) {
      logger.info("Skipping cleaned image generation: same source hash", {uid, itemId, sourceHash});
      return;
    }

    let cleanedResult: CleanedOnnxSuccess | CleanedOnnxFailure;
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
    if (!cleanedResult.ok) {
      logger.error("ONNX cleaned image generation skipped", {
        uid,
        itemId,
        inputUrl,
        reason: cleanedResult.reason,
      });
      return;
    }
    const cleanedBytes = cleanedResult.cleanedBytes;
    const cleanedThumbBytes = cleanedResult.cleanedThumbBytes;
    const debugMaskBytes = cleanedResult.debugMaskBytes;
    const debugOverlayBytes = cleanedResult.debugOverlayBytes;

    const cleanedPath = `users/${uid}/items/${itemId}/cleaned.jpg`;
    const cleanedThumbPath = `users/${uid}/items/${itemId}/cleaned_thumb.jpg`;
    const debugMaskPath = `users/${uid}/items/${itemId}/debug_mask.png`;
    const debugOverlayPath = `users/${uid}/items/${itemId}/debug_overlay.png`;
    const cleanedUrl = await uploadImageAndGetUrl(cleanedPath, cleanedBytes);
    const cleanedThumbUrl = await uploadImageAndGetUrl(cleanedThumbPath, cleanedThumbBytes);
    const debugMaskUrl = await uploadImageAndGetUrl(debugMaskPath, debugMaskBytes, "image/png");
    const debugOverlayUrl = await uploadImageAndGetUrl(debugOverlayPath, debugOverlayBytes, "image/png");

    logger.info("Cleaned image generation transition", {
      uid,
      itemId,
      inputUrl,
      cleanedPath,
      cleanedThumbPath,
      debugMaskPath,
      debugOverlayPath,
      debugMaskUrl,
      debugOverlayUrl,
      sourceBytes: sourceBytes.length,
      inferMs: cleanedResult.inferMs,
      chosenOutputName: cleanedResult.chosenOutputName,
      inverted: cleanedResult.inverted,
      fgRatio: cleanedResult.fgRatio,
      centerMinusBorder: cleanedResult.centerMinusBorder,
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
          forceCleaned: false,
        },
        cleanedUpdatedAt: Date.now(),
      },
      {merge: true}
    );
  }
);
