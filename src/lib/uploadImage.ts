import * as ImageManipulator from "expo-image-manipulator";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

type UploadItemPhotoParams = {
  uid: string;
  itemId: string;
  localUri: string;
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
  return getDownloadURL(fileRef);
}
