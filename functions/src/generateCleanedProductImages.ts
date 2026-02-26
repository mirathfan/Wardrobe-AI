import { createHash, randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { logger } from "firebase-functions/v2";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
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
    cleanedFromHash?: string | null;
  };
  ingestion?: {
    status?: string;
  };
};

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

export const generateCleanedProductImages = onDocumentWritten(
  {
    document: "users/{uid}/items/{itemId}",
  },
  async (event) => {
    const uid = String(event.params.uid ?? "");
    const itemId = String(event.params.itemId ?? "");
    const before = event.data?.before.data() as ItemDoc | undefined;
    const after = event.data?.after.data() as ItemDoc | undefined;
    if (!after) return;

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

    const cleanedBytes = await sharp(sourceBytes)
      .resize({width: 1024, height: 1024, fit: "inside", withoutEnlargement: true})
      .flatten({background: {r: 255, g: 255, b: 255}})
      .jpeg({quality: 88})
      .toBuffer();

    const cleanedThumbBytes = await sharp(cleanedBytes)
      .resize({width: 256, height: 256, fit: "inside", withoutEnlargement: true})
      .flatten({background: {r: 255, g: 255, b: 255}})
      .jpeg({quality: 80})
      .toBuffer();

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
          cleanedSource: "placeholder",
          cleanedFromHash: sourceHash,
        },
        cleanedUpdatedAt: Date.now(),
      },
      {merge: true}
    );
  }
);
