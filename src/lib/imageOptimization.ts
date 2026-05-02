import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

const DEBUG_IMAGE_OPTIMIZATION =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";

export type ImageOptimizationPreset =
  | "aura_chat"
  | "item_ingestion"
  | "item_display";

type OptimizeImageParams = {
  uri: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string | null;
  preset: ImageOptimizationPreset;
};

export type OptimizedImage = {
  uri: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  contentType: "image/jpeg";
  extension: "jpg";
  optimized: boolean;
  original: {
    uri: string;
    width: number | null;
    height: number | null;
    sizeBytes: number | null;
  };
};

const PRESETS: Record<ImageOptimizationPreset, {
  maxDimension: number;
  quality: number;
  skipReencodeBytes: number;
}> = {
  aura_chat: {
    maxDimension: 1024,
    quality: 0.8,
    skipReencodeBytes: 900 * 1024,
  },
  item_ingestion: {
    maxDimension: 1280,
    quality: 0.82,
    skipReencodeBytes: 1300 * 1024,
  },
  item_display: {
    maxDimension: 1600,
    quality: 0.88,
    skipReencodeBytes: 2400 * 1024,
  },
};

function normalizeFileUri(uri: string) {
  const value = String(uri ?? "").trim();
  if (!value) return "";
  if (value.startsWith("file://")) return value;
  if (value.startsWith("/")) return `file://${value}`;
  return value;
}

function looksLikeJpeg(uri: string, mimeType?: string | null) {
  if (/^image\/jpe?g$/i.test(String(mimeType ?? ""))) return true;
  return /\.(jpe?g)(?:$|\?)/i.test(String(uri ?? ""));
}

async function fileSizeBytes(uri: string) {
  try {
    const info = await FileSystem.getInfoAsync(normalizeFileUri(uri));
    return info.exists && typeof (info as { size?: unknown }).size === "number"
      ? Number((info as { size: number }).size)
      : null;
  } catch {
    return null;
  }
}

function resizedDimensions(width: number | null, height: number | null, maxDimension: number) {
  const sourceWidth = Number(width ?? 0);
  const sourceHeight = Number(height ?? 0);
  const hasWidth = Number.isFinite(sourceWidth) && sourceWidth > 0;
  const hasHeight = Number.isFinite(sourceHeight) && sourceHeight > 0;
  if (!hasWidth && !hasHeight) {
    return { width: null, height: null, shouldResize: false };
  }
  const largest = Math.max(hasWidth ? sourceWidth : 0, hasHeight ? sourceHeight : 0);
  if (largest <= maxDimension) {
    return { width: hasWidth ? sourceWidth : null, height: hasHeight ? sourceHeight : null, shouldResize: false };
  }
  if (hasWidth && !hasHeight) {
    return { width: maxDimension, height: null, shouldResize: true };
  }
  if (!hasWidth && hasHeight) {
    return { width: null, height: maxDimension, shouldResize: true };
  }
  const scale = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    shouldResize: true,
  };
}

export async function optimizeImageForUpload(params: OptimizeImageParams): Promise<OptimizedImage> {
  const sourceUri = normalizeFileUri(params.uri);
  if (!sourceUri) {
    throw new Error("Missing image URI.");
  }
  if (/^https?:\/\//i.test(sourceUri)) {
    throw new Error("Remote images cannot be optimized locally.");
  }

  const preset = PRESETS[params.preset];
  const originalSize = await fileSizeBytes(sourceUri);
  const originalWidth = params.width ?? null;
  const originalHeight = params.height ?? null;
  const resized = resizedDimensions(originalWidth, originalHeight, preset.maxDimension);
  const isJpeg = looksLikeJpeg(sourceUri, params.mimeType);
  const canSkipReencode =
    isJpeg &&
    !resized.shouldResize &&
    originalSize !== null &&
    originalSize <= preset.skipReencodeBytes;

  if (canSkipReencode) {
    if (DEBUG_IMAGE_OPTIMIZATION) {
      console.log("[ImageOptimization] skipped", {
        preset: params.preset,
        originalWidth,
        originalHeight,
        originalSize,
      });
    }
    return {
      uri: sourceUri,
      width: originalWidth,
      height: originalHeight,
      sizeBytes: originalSize,
      contentType: "image/jpeg",
      extension: "jpg",
      optimized: false,
      original: {
        uri: sourceUri,
        width: originalWidth,
        height: originalHeight,
        sizeBytes: originalSize,
      },
    };
  }

  const actions = resized.shouldResize
    ? [{ resize: { ...(resized.width ? { width: resized.width } : {}), ...(resized.height ? { height: resized.height } : {}) } }]
    : [];
  const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
    compress: preset.quality,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  const optimizedSize = await fileSizeBytes(result.uri);

  if (DEBUG_IMAGE_OPTIMIZATION) {
    console.log("[ImageOptimization] optimized", {
      preset: params.preset,
      originalWidth,
      originalHeight,
      originalSize,
      optimizedWidth: result.width ?? resized.width ?? originalWidth,
      optimizedHeight: result.height ?? resized.height ?? originalHeight,
      optimizedSize,
      maxDimension: preset.maxDimension,
      quality: preset.quality,
    });
  }

  return {
    uri: result.uri,
    width: result.width ?? resized.width ?? originalWidth,
    height: result.height ?? resized.height ?? originalHeight,
    sizeBytes: optimizedSize,
    contentType: "image/jpeg",
    extension: "jpg",
    optimized: true,
    original: {
      uri: sourceUri,
      width: originalWidth,
      height: originalHeight,
      sizeBytes: originalSize,
    },
  };
}
