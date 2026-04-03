import * as ImageManipulator from "expo-image-manipulator";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

type UploadItemPhotoParams = {
  uid: string;
  itemId: string;
  localUri: string;
  cleanedLocalUri?: string | null;
  normalizedLocalUri?: string | null;
  originalWidth?: number | null;
  maxWidth?: number;
  quality?: number;
};

async function processImageToJpegUri(params: {
  localUri: string;
  originalWidth?: number | null;
  maxWidth: number;
  quality: number;
}) {
  const { localUri, originalWidth, maxWidth, quality } = params;

  const actions =
    originalWidth && originalWidth > maxWidth
      ? [{ resize: { width: maxWidth } }]
      : [];

  const result = await ImageManipulator.manipulateAsync(localUri, actions, {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return result.uri;
}

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
    cleanedLocalUri = null,
    normalizedLocalUri = null,
    originalWidth = null,
    maxWidth = 1000,
    quality = 0.7,
  } = params;

  const processedUri = await processImageToJpegUri({
    localUri,
    originalWidth,
    maxWidth,
    quality,
  });
  const primaryBlob = await blobFromFileUri(processedUri);

  const storagePath = `users/${uid}/items/${itemId}.jpg`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, primaryBlob, {
    contentType: "image/jpeg",
  });
  const primaryUrl = await getDownloadURL(fileRef);

  const cleanedCandidateUri =
    cleanedLocalUri ||
    (String(localUri).trim().toLowerCase().endsWith(".png") ? localUri : null);
  let cleanedUrl: string | null = null;
  if (cleanedCandidateUri) {
    const cleanedBlob = await blobFromFileUri(cleanedCandidateUri);
    const cleanedPath = `users/${uid}/items/${itemId}.cleaned.png`;
    const cleanedRef = ref(storage, cleanedPath);
    await uploadBytes(cleanedRef, cleanedBlob, {
      contentType: "image/png",
    });
    cleanedUrl = await getDownloadURL(cleanedRef);
  }

  let normalizedUrl: string | null = null;
  if (normalizedLocalUri) {
    const normalizedBlob = await blobFromFileUri(normalizedLocalUri);
    const normalizedPath = `users/${uid}/items/${itemId}.normalized.png`;
    const normalizedRef = ref(storage, normalizedPath);
    await uploadBytes(normalizedRef, normalizedBlob, {
      contentType: "image/png",
    });
    normalizedUrl = await getDownloadURL(normalizedRef);
  }

  return {
    originalUrl: primaryUrl,
    primaryUrl,
    cleanedUrl,
    normalizedUrl,
    cleanedSource: cleanedUrl ? "vision" : null,
  };
}
