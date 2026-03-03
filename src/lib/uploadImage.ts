import * as ImageManipulator from "expo-image-manipulator";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

type UploadItemPhotoParams = {
  uid: string;
  itemId: string;
  localUri: string;
  cleanedLocalUri?: string | null;
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

export async function uploadItemPhoto(params: UploadItemPhotoParams) {
  const {
    uid,
    itemId,
    localUri,
    cleanedLocalUri = null,
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

  const response = await fetch(processedUri);
  const blob = await response.blob();

  const storagePath = `users/${uid}/items/${itemId}.jpg`;
  const fileRef = ref(storage, storagePath);

  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
  const primaryUrl = await getDownloadURL(fileRef);

  const cleanedCandidateUri =
    cleanedLocalUri ||
    (String(localUri).trim().toLowerCase().endsWith(".png") ? localUri : null);
  let cleanedUrl: string | null = null;
  if (cleanedCandidateUri) {
    console.log("[uploadItemPhoto] cleanedLocalUri:", cleanedCandidateUri);
    const cleanedResponse = await fetch(cleanedCandidateUri);
    const cleanedBlob = await cleanedResponse.blob();
    const cleanedPath = `users/${uid}/items/${itemId}.cleaned.png`;
    const cleanedRef = ref(storage, cleanedPath);
    console.log("[uploadItemPhoto] cleaned storage path:", cleanedPath);
    await uploadBytes(cleanedRef, cleanedBlob, { contentType: "image/png" });
    cleanedUrl = await getDownloadURL(cleanedRef);
    console.log("[uploadItemPhoto] cleaned download URL:", cleanedUrl);
  }

  return {
    primaryUrl,
    cleanedUrl,
    cleanedSource: cleanedUrl ? "ios_vision" : null,
  };
}
