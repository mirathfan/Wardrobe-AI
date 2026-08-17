import * as FileSystem from "expo-file-system/legacy";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { app, storage } from "@/src/lib/firebase";
import { getFriendlyErrorMessage } from "@/src/lib/errors";
import { optimizeImageForUpload } from "@/src/lib/imageOptimization";
import {
  logPhotoPipeline,
  photoPipelineDuration,
  photoPipelineNow,
  safeErrorData,
  safeUriType,
  summarizeImageQuality,
  type PhotoPipelineLogSink,
} from "@/src/lib/photoPipelineLogger";
import { blobFromFileUri } from "@/src/lib/uploadImage";
import type {
  ProductImageQuality,
  ProductPolishCallableResponse,
} from "@/src/types/ProductImageQuality";

type ProductPolishGarmentMetadata = {
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  subCategory?: string | null;
  pattern?: string | null;
  material?: string | null;
  colors?: string[];
  graphicText?: string | null;
};

type RunProductPolishParams = {
  uid: string;
  localUri: string;
  width?: number | null;
  height?: number | null;
  photoHash: string;
  traceId?: string | null;
  onLog?: PhotoPipelineLogSink | null;
  garmentMetadata?: ProductPolishGarmentMetadata | null;
};

export type ProductPolishLocalResult = ProductPolishCallableResponse & {
  sourceImageUrl: string;
  sourceStoragePath: string;
  refinedLocalUri?: string | null;
};

function safePathToken(value: string) {
  return String(value || "photo")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "photo";
}

function pathHint(uri?: string | null) {
  const value = String(uri ?? "");
  if (!value) return "";
  return value.length > 88 ? `...${value.slice(-88)}` : value;
}

async function localFileDebugInfo(uri?: string | null) {
  const value = String(uri ?? "").trim();
  if (!value || !value.startsWith("file://")) {
    return {
      fileExists: value ? null : false,
      byteSize: null as number | null,
      pathHint: pathHint(value),
    };
  }
  try {
    const info = await FileSystem.getInfoAsync(value);
    return {
      fileExists: Boolean(info.exists),
      byteSize: info.exists && typeof (info as any).size === "number"
        ? Number((info as any).size)
        : null,
      pathHint: pathHint(value),
    };
  } catch {
    return {
      fileExists: false,
      byteSize: null,
      pathHint: pathHint(value),
    };
  }
}

async function uploadProductPolishSource(params: RunProductPolishParams) {
  const startedAt = photoPipelineNow();
  logPhotoPipeline({
    traceId: params.traceId,
    step: "upload_original",
    status: "start",
    sink: params.onLog,
    data: {
      uriType: safeUriType(params.localUri),
      width: params.width ?? null,
      height: params.height ?? null,
      purpose: "product_polish_source",
    },
  });
  const optimized = await optimizeImageForUpload({
    uri: params.localUri,
    width: params.width,
    height: params.height,
    preset: "item_ingestion",
  });
  const blob = await blobFromFileUri(optimized.uri);
  const token = safePathToken(params.photoHash);
  const storagePath = `users/${params.uid}/productPolish/sources/${Date.now()}-${token}.jpg`;
  const fileRef = ref(storage, storagePath);
  try {
    await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
    const imageUrl = await getDownloadURL(fileRef);
    logPhotoPipeline({
      traceId: params.traceId,
      step: "upload_original",
      status: "success",
      durationMs: photoPipelineDuration(startedAt),
      sink: params.onLog,
      data: {
        storagePath,
        hasImageUrl: !!imageUrl,
        optimized,
      },
    });
    return { storagePath, imageUrl };
  } catch (error) {
    logPhotoPipeline({
      traceId: params.traceId,
      step: "upload_original",
      status: "failure",
      durationMs: photoPipelineDuration(startedAt),
      sink: params.onLog,
      data: safeErrorData(error),
    });
    throw error;
  }
}

async function downloadRefinedImage(url: string, params: Pick<RunProductPolishParams, "traceId" | "onLog">) {
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDirectory || typeof FileSystem.downloadAsync !== "function") {
    logPhotoPipeline({
      traceId: params.traceId,
      step: "refined_image_download",
      status: "failure",
      sink: params.onLog,
      data: { reason: "file_system_unavailable", hasRefinedImageUrl: !!url },
    });
    return null;
  }
  const destination = `${baseDirectory}aura-product-polish-${Date.now()}.jpg`;
  const startedAt = photoPipelineNow();
  logPhotoPipeline({
    traceId: params.traceId,
    step: "refined_image_download",
    status: "start",
    sink: params.onLog,
    data: { hasRefinedImageUrl: !!url, destinationUriType: safeUriType(destination) },
  });
  try {
    const result = await FileSystem.downloadAsync(url, destination);
    const fileInfo = await localFileDebugInfo(result?.uri);
    logPhotoPipeline({
      traceId: params.traceId,
      step: "refined_image_download",
      status: result?.uri ? "success" : "failure",
      durationMs: photoPipelineDuration(startedAt),
      sink: params.onLog,
      data: {
        outputUriType: safeUriType(result?.uri),
        outputPathHint: fileInfo.pathHint,
        hasLocalUri: !!result?.uri,
        fileExists: fileInfo.fileExists,
        byteSize: fileInfo.byteSize,
      },
    });
    return result?.uri ?? null;
  } catch (error) {
    logPhotoPipeline({
      traceId: params.traceId,
      step: "refined_image_download",
      status: "failure",
      durationMs: photoPipelineDuration(startedAt),
      sink: params.onLog,
      data: safeErrorData(error),
    });
    throw error;
  }
}

function fallbackQuality(reason: string): ProductImageQuality {
  return {
    aestheticScore: 1,
    lightingQuality: 1,
    clutterLevel: 0,
    wrinkleLevel: 0,
    cropQuality: 1,
    visibilityCompleteness: 1,
    humanVisible: false,
    hangerVisible: false,
    surfaceVisible: false,
    needsRefinement: false,
    refinementReason: [reason],
  };
}

export async function runProductPolishForLocalImage(
  params: RunProductPolishParams
): Promise<ProductPolishLocalResult> {
  const source = await uploadProductPolishSource(params);
  const functions = getFunctions(app);
  const callable = httpsCallable<
    {
      imageUrl: string;
      storagePath: string;
      imageHash?: string | null;
      traceId?: string | null;
      garmentMetadata?: ProductPolishGarmentMetadata | null;
    },
    ProductPolishCallableResponse
  >(functions, "polishProductImage");

  const callableStartedAt = photoPipelineNow();
  logPhotoPipeline({
    traceId: params.traceId,
    step: "polish_function",
    status: "start",
    sink: params.onLog,
    data: {
      storagePath: source.storagePath,
      hasImageUrl: !!source.imageUrl,
      hasGarmentMetadata: !!params.garmentMetadata,
    },
  });
  let result;
  try {
    result = await callable({
      imageUrl: source.imageUrl,
      storagePath: source.storagePath,
      imageHash: params.photoHash,
      traceId: params.traceId ?? null,
      garmentMetadata: params.garmentMetadata ?? null,
    });
  } catch (error) {
    logPhotoPipeline({
      traceId: params.traceId,
      step: "polish_function",
      status: "failure",
      durationMs: photoPipelineDuration(callableStartedAt),
      sink: params.onLog,
      data: {
        ...safeErrorData(error),
        friendlyMessage: getFriendlyErrorMessage(error),
      },
    });
    throw error;
  }
  const data = result.data;
  logPhotoPipeline({
    traceId: params.traceId,
    step: "polish_function",
    status: "success",
    durationMs: photoPipelineDuration(callableStartedAt),
    sink: params.onLog,
    data: {
      refinementApplied: data.refinementApplied,
      hasRefinedImageUrl: !!data.refinedImageUrl,
      hasRefinedStoragePath: !!data.refinedStoragePath,
      modelUsed: data.modelUsed ?? null,
      warningCount: data.warnings?.length ?? 0,
      imageQuality: summarizeImageQuality(data.imageQuality),
    },
  });
  const refinedLocalUri = data.refinementApplied && data.refinedImageUrl
    ? await downloadRefinedImage(data.refinedImageUrl, params)
    : null;

  return {
    ...data,
    imageQuality: data.imageQuality ?? fallbackQuality("analysis_unavailable"),
    sourceImageUrl: source.imageUrl,
    sourceStoragePath: source.storagePath,
    refinedLocalUri,
  };
}
