import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { optimizeImageForUpload } from "./imageOptimization";
import { analyticsErrorProperties, trackLaunchEvent } from "./analytics";

type UploadItemPhotoParams = {
  uid: string;
  itemId: string;
  localUri: string;
  imageId?: string;
  cleanedLocalUri?: string | null;
  normalizedLocalUri?: string | null;
  saveNormalizedAsCleaned?: boolean;
  originalWidth?: number | null;
  originalHeight?: number | null;
  maxWidth?: number;
  quality?: number;
};

function normalizeFileUri(uri: string) {
  const value = String(uri ?? "").trim();
  if (!value) return "";
  if (value.startsWith("file://")) return value;
  if (value.startsWith("/")) return `file://${value}`;
  return value;
}

async function blobFromFileUri(localUri: string): Promise<Blob> {
  const fileUri = normalizeFileUri(localUri);
  if (!fileUri) throw new Error("Missing local file URI for upload.");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error("Failed to read local image file."));
    xhr.ontimeout = () => reject(new Error("Timed out reading local image file."));
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.responseType = "blob";
    xhr.timeout = 15_000;
    xhr.open("GET", fileUri, true);
    xhr.send(null);
  });
}

export async function uploadItemPhoto(params: UploadItemPhotoParams) {
  const {
    uid,
    itemId,
    localUri,
    imageId = "",
    cleanedLocalUri = null,
    normalizedLocalUri = null,
    saveNormalizedAsCleaned = false,
    originalWidth = null,
    originalHeight = null,
    maxWidth,
    quality,
  } = params;

  void maxWidth;
  void quality;

  try {
    const displayImage = await optimizeImageForUpload({
      uri: localUri,
      width: originalWidth,
      height: originalHeight,
      preset: "item_display",
    });
    const primaryBlob = await blobFromFileUri(displayImage.uri);

    const suffix = imageId ? `/${imageId}` : "";
    const storagePath = `users/${uid}/items/${itemId}${suffix}.jpg`;
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, primaryBlob, {
      contentType: "image/jpeg",
    });
    const primaryUrl = await getDownloadURL(fileRef);

    const aiImage = await optimizeImageForUpload({
      uri: localUri,
      width: originalWidth,
      height: originalHeight,
      preset: "item_ingestion",
    });
    let aiUrl = primaryUrl;
    if (aiImage.uri !== displayImage.uri) {
      const aiBlob = await blobFromFileUri(aiImage.uri);
      const aiPath = `users/${uid}/items/${itemId}${suffix}.ai.jpg`;
      const aiRef = ref(storage, aiPath);
      await uploadBytes(aiRef, aiBlob, {
        contentType: "image/jpeg",
      });
      aiUrl = await getDownloadURL(aiRef);
    }

    const cleanedCandidateUri =
      (saveNormalizedAsCleaned ? normalizedLocalUri : null) ||
      cleanedLocalUri ||
      (String(localUri).trim().toLowerCase().endsWith(".png") ? localUri : null);
    let cleanedUrl: string | null = null;
    if (cleanedCandidateUri) {
      const cleanedBlob = await blobFromFileUri(cleanedCandidateUri);
      const cleanedPath = `users/${uid}/items/${itemId}${suffix}.cleaned.png`;
      const cleanedRef = ref(storage, cleanedPath);
      await uploadBytes(cleanedRef, cleanedBlob, {
        contentType: "image/png",
      });
      cleanedUrl = await getDownloadURL(cleanedRef);
    }

    let normalizedUrl: string | null = null;
    if (normalizedLocalUri) {
      const normalizedBlob = await blobFromFileUri(normalizedLocalUri);
      const normalizedPath = `users/${uid}/items/${itemId}${suffix}.normalized.png`;
      const normalizedRef = ref(storage, normalizedPath);
      await uploadBytes(normalizedRef, normalizedBlob, {
        contentType: "image/png",
      });
      normalizedUrl = await getDownloadURL(normalizedRef);
    }

    return {
      originalUrl: primaryUrl,
      primaryUrl,
      aiUrl,
      cleanedUrl,
      normalizedUrl,
      cleanedSource: cleanedUrl ? "vision" : null,
      imageUrls: [primaryUrl],
      images: [
        {
          originalUrl: primaryUrl,
          aiUrl,
          ...(cleanedUrl ? { cleanedUrl } : {}),
          isPrimary: true,
        },
      ],
    };
  } catch (error) {
    void trackLaunchEvent({
      userId: uid,
      eventName: "photo_upload_failed",
      properties: {
        itemId,
        imageId: imageId || null,
        hasCleanedLocalUri: Boolean(cleanedLocalUri),
        hasNormalizedLocalUri: Boolean(normalizedLocalUri),
        saveNormalizedAsCleaned,
        originalWidth,
        originalHeight,
        ...analyticsErrorProperties(error),
      },
    });
    throw error;
  }
}
