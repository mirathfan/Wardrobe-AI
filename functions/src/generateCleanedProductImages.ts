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

function hasCropChanged(before?: ItemDoc, after?: ItemDoc): boolean {
  const prev = JSON.stringify(before?.crop ?? null);
  const next = JSON.stringify(after?.crop ?? null);
  return prev !== next;
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
}> {
  const src = await sharp(sourceBytes)
    .removeAlpha()
    .toColourspace("rgb")
    .raw()
    .toBuffer({resolveWithObject: true});

  const sourceWidth = src.info.width;
  const sourceHeight = src.info.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("Invalid source dimensions for cleaned image generation");
  }

  const modelWidth = 320;
  const modelHeight = 320;
  const resized = await sharp(src.data, {
    raw: {width: sourceWidth, height: sourceHeight, channels: 3},
  })
    .resize(modelWidth, modelHeight, {fit: "fill"})
    .raw()
    .toBuffer();

  const hw = modelWidth * modelHeight;
  const tensorData = new Float32Array(3 * hw);
  for (let i = 0; i < hw; i++) {
    const pixelIndex = i * 3;
    tensorData[i] = resized[pixelIndex] / 255;
    tensorData[hw + i] = resized[pixelIndex + 1] / 255;
    tensorData[2 * hw + i] = resized[pixelIndex + 2] / 255;
  }

  const input = new ort.Tensor("float32", tensorData, [1, 3, modelHeight, modelWidth]);
  const session = await getSegmentationSession();
  const inputName = session.inputNames[0];
  const inferStart = Date.now();
  const outputMap = await session.run({[inputName]: input});
  const inferMs = Date.now() - inferStart;

  const outputName = session.outputNames[0];
  const output = outputMap[outputName];
  if (!output) {
    throw new Error("ONNX segmentation output is missing");
  }

  const outputData = output.data as Float32Array;
  const outputDims = output.dims;
  const alphaWidth = outputDims.length >= 2 ? outputDims[outputDims.length - 1] : modelWidth;
  const alphaHeight = outputDims.length >= 2 ? outputDims[outputDims.length - 2] : modelHeight;

  let alphaMin = Number.POSITIVE_INFINITY;
  let alphaMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < outputData.length; i++) {
    const v = outputData[i];
    if (v < alphaMin) alphaMin = v;
    if (v > alphaMax) alphaMax = v;
  }

  const spread = alphaMax - alphaMin;
  const alphaNormalized = new Uint8Array(outputData.length);
  for (let i = 0; i < outputData.length; i++) {
    const value = spread > 1e-8 ? (outputData[i] - alphaMin) / spread : 0;
    alphaNormalized[i] = Math.max(0, Math.min(255, Math.round(value * 255)));
  }

  const alphaResized = await sharp(Buffer.from(alphaNormalized), {
    raw: {width: alphaWidth, height: alphaHeight, channels: 1},
  })
    .resize(sourceWidth, sourceHeight, {fit: "fill"})
    .blur(0.8)
    .raw()
    .toBuffer();

  const cleanedRaw = Buffer.alloc(sourceWidth * sourceHeight * 3);
  for (let i = 0; i < sourceWidth * sourceHeight; i++) {
    const alpha = alphaResized[i] / 255;
    const base = i * 3;
    cleanedRaw[base] = Math.round(src.data[base] * alpha + 255 * (1 - alpha));
    cleanedRaw[base + 1] = Math.round(src.data[base + 1] * alpha + 255 * (1 - alpha));
    cleanedRaw[base + 2] = Math.round(src.data[base + 2] * alpha + 255 * (1 - alpha));
  }

  const cleanedBytes = await sharp(cleanedRaw, {
    raw: {width: sourceWidth, height: sourceHeight, channels: 3},
  })
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
    alphaMin: Number.isFinite(alphaMin) ? alphaMin : 0,
    alphaMax: Number.isFinite(alphaMax) ? alphaMax : 0,
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
    const updatedAtMs = toMillis(after.updatedAt);
    const cleanedUpdatedAtMs = toMillis(after.cleanedUpdatedAt);
    const stale = !!updatedAtMs && (!cleanedUpdatedAtMs || cleanedUpdatedAtMs < updatedAtMs);
    const cropChanged = hasCropChanged(before, after);

    if (!missingCleaned && !stale && !cropChanged) {
      logger.info("Skipping cleaned image generation: output already fresh", {
        uid,
        itemId,
        missingCleaned,
        stale,
        cropChanged,
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

    const cleanedResult = await createCleanedImagesWithOnnx(sourceBytes);
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
        },
        cleanedUpdatedAt: Date.now(),
      },
      {merge: true}
    );
  }
);
