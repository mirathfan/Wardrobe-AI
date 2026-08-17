import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { optimizeImageForUpload } from "./imageOptimization";
import { analyticsErrorProperties, trackLaunchEvent } from "./analytics";
import {
  logPhotoPipeline,
  photoPipelineDuration,
  photoPipelineNow,
  safeErrorData,
  safeUriType,
  type PhotoPipelineLogSink,
} from "@/src/lib/photoPipelineLogger";
import type {
  ItemImageSource,
  ProductImageQuality,
  ProductImageVariant,
  ProductPolishMetadata,
} from "@/src/types/ProductImageQuality";

type UploadItemPhotoParams = {
  uid: string;
  itemId: string;
  localUri: string;
  imageId?: string;
  cleanedLocalUri?: string | null;
  normalizedLocalUri?: string | null;
  sourceOriginalLocalUri?: string | null;
  refinedLocalUri?: string | null;
  saveNormalizedAsCleaned?: boolean;
  originalWidth?: number | null;
  originalHeight?: number | null;
  imageQuality?: ProductImageQuality | null;
  productPolish?: ProductPolishMetadata | null;
  imageSource?: ItemImageSource | null;
  cutoutSourceKind?: ProductImageVariant | null;
  traceId?: string | null;
  onLog?: PhotoPipelineLogSink | null;
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

function pathHint(uri?: string | null) {
  const value = String(uri ?? "");
  if (!value) return "";
  return value.length > 88 ? `...${value.slice(-88)}` : value;
}

export async function blobFromFileUri(localUri: string): Promise<Blob> {
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
    sourceOriginalLocalUri = null,
    refinedLocalUri = null,
    saveNormalizedAsCleaned = false,
    originalWidth = null,
    originalHeight = null,
    imageQuality = null,
    productPolish = null,
    imageSource = null,
    cutoutSourceKind = null,
    traceId = null,
    onLog = null,
    maxWidth,
    quality,
  } = params;

  void maxWidth;
  void quality;

  const uploadStartedAt = photoPipelineNow();
  logPhotoPipeline({
    traceId,
    step: "upload_original",
    status: "start",
    sink: onLog,
    data: {
      purpose: "item_save",
      imageId: imageId || "primary",
      hasItemId: !!itemId,
      uriType: safeUriType(localUri),
      originalUploadPathHint: pathHint(sourceOriginalLocalUri ?? localUri),
      displayInputPathHint: pathHint(localUri),
      refinedLocalPathHint: pathHint(refinedLocalUri),
      cleanedLocalPathHint: pathHint(cleanedLocalUri ?? normalizedLocalUri),
      hasCleanedLocalUri: Boolean(cleanedLocalUri),
      hasNormalizedLocalUri: Boolean(normalizedLocalUri),
      hasSourceOriginalLocalUri: Boolean(sourceOriginalLocalUri),
      hasRefinedLocalUri: Boolean(refinedLocalUri),
      imageSource,
      cutoutSourceKind,
      originalWidth,
      originalHeight,
    },
  });

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
    let sourceOriginalUrl = primaryUrl;
    const shouldUploadSourceOriginal =
      !!sourceOriginalLocalUri &&
      sourceOriginalLocalUri !== localUri &&
      !/^https?:\/\//i.test(sourceOriginalLocalUri);
    if (shouldUploadSourceOriginal) {
      const sourceImage = await optimizeImageForUpload({
        uri: sourceOriginalLocalUri,
        width: originalWidth,
        height: originalHeight,
        preset: "item_display",
      });
      const sourceBlob = await blobFromFileUri(sourceImage.uri);
      const sourcePath = `users/${uid}/items/${itemId}${suffix}.source.jpg`;
      const sourceRef = ref(storage, sourcePath);
      await uploadBytes(sourceRef, sourceBlob, {
        contentType: "image/jpeg",
      });
      sourceOriginalUrl = await getDownloadURL(sourceRef);
    }

    let refinedUrl: string | null = null;
    if (refinedLocalUri) {
      if (refinedLocalUri === localUri) {
        refinedUrl = primaryUrl;
      } else if (!/^https?:\/\//i.test(refinedLocalUri)) {
        const refinedImage = await optimizeImageForUpload({
          uri: refinedLocalUri,
          width: originalWidth,
          height: originalHeight,
          preset: "item_display",
        });
        const refinedBlob = await blobFromFileUri(refinedImage.uri);
        const refinedPath = `users/${uid}/items/${itemId}${suffix}.refined.jpg`;
        const refinedRef = ref(storage, refinedPath);
        await uploadBytes(refinedRef, refinedBlob, {
          contentType: "image/jpeg",
        });
        refinedUrl = await getDownloadURL(refinedRef);
      }
    }

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
      const cleanedStartedAt = photoPipelineNow();
      const cleanedPath = `users/${uid}/items/${itemId}${suffix}.cleaned.png`;
      logPhotoPipeline({
        traceId,
        step: "cleaned_image_upload",
        status: "start",
        sink: onLog,
        data: {
          imageId: imageId || "primary",
          storagePath: cleanedPath,
          uriType: safeUriType(cleanedCandidateUri),
        },
      });
      try {
        const cleanedBlob = await blobFromFileUri(cleanedCandidateUri);
        const cleanedRef = ref(storage, cleanedPath);
        await uploadBytes(cleanedRef, cleanedBlob, {
          contentType: "image/png",
        });
        cleanedUrl = await getDownloadURL(cleanedRef);
        logPhotoPipeline({
          traceId,
          step: "cleaned_image_upload",
          status: "success",
          durationMs: photoPipelineDuration(cleanedStartedAt),
          sink: onLog,
          data: {
            storagePath: cleanedPath,
            hasCleanedUrl: !!cleanedUrl,
          },
        });
      } catch (error) {
        logPhotoPipeline({
          traceId,
          step: "cleaned_image_upload",
          status: "failure",
          durationMs: photoPipelineDuration(cleanedStartedAt),
          sink: onLog,
          data: safeErrorData(error),
        });
        throw error;
      }
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

    const uploadResult = {
      originalUrl: sourceOriginalUrl,
      sourceOriginalUrl,
      primaryUrl,
      aiUrl,
      cleanedUrl,
      normalizedUrl,
      refinedUrl,
      cleanedSource: cleanedUrl ? "vision" : null,
      imageUrls: [primaryUrl],
      images: [
        {
          traceId,
          originalUrl: primaryUrl,
          sourceOriginalUrl,
          aiUrl,
          ...(refinedUrl ? { refinedUrl } : {}),
          ...(cleanedUrl ? { cleanedUrl } : {}),
          ...(imageSource ? { imageSource } : {}),
          ...(cutoutSourceKind ? { cutoutSourceKind } : {}),
          isPrimary: true,
        },
      ],
      imageQuality,
      productPolish,
      imageSource,
      cutoutSourceKind,
    };
    logPhotoPipeline({
      traceId,
      step: "upload_original",
      status: "success",
      durationMs: photoPipelineDuration(uploadStartedAt),
      sink: onLog,
      data: {
        imageId: imageId || "primary",
        hasPrimaryUrl: !!uploadResult.primaryUrl,
        hasOriginalUrl: !!uploadResult.originalUrl,
        hasSourceOriginalUrl: !!uploadResult.sourceOriginalUrl,
        hasAiUrl: !!uploadResult.aiUrl,
        hasCleanedUrl: !!uploadResult.cleanedUrl,
        hasNormalizedUrl: !!uploadResult.normalizedUrl,
        hasRefinedUrl: !!uploadResult.refinedUrl,
        imageSource,
        cutoutSourceKind,
        originalUploadPathHint: pathHint(sourceOriginalLocalUri ?? localUri),
        displayInputPathHint: pathHint(localUri),
        refinedLocalPathHint: pathHint(refinedLocalUri),
        cleanedLocalPathHint: pathHint(cleanedCandidateUri),
      },
    });
    return uploadResult;
  } catch (error) {
    logPhotoPipeline({
      traceId,
      step: "upload_original",
      status: "failure",
      durationMs: photoPipelineDuration(uploadStartedAt),
      sink: onLog,
      data: safeErrorData(error),
    });
    void trackLaunchEvent({
      userId: uid,
      eventName: "photo_upload_failed",
      properties: {
        itemId,
        imageId: imageId || null,
        hasCleanedLocalUri: Boolean(cleanedLocalUri),
        hasNormalizedLocalUri: Boolean(normalizedLocalUri),
        hasSourceOriginalLocalUri: Boolean(sourceOriginalLocalUri),
        hasRefinedLocalUri: Boolean(refinedLocalUri),
        saveNormalizedAsCleaned,
        originalWidth,
        originalHeight,
        ...analyticsErrorProperties(error),
      },
    });
    throw error;
  }
}
