import {
  isNativeBackgroundRemovalSupported,
  removeBackground as removeBackgroundCrossPlatform,
} from "@six33/react-native-bg-removal";
import {
  // Legacy iOS-only — replaced by @six33/react-native-bg-removal
  isAvailable as isVisionBgNativeAvailable,
  type RemoveBackgroundOptions,
  removeBackground as removeBackgroundNative,
} from "expo-vision-bg";
import { Image, Platform } from "react-native";

type BackgroundRemovalResult = {
  uri: string;
  width: number | null;
  height: number | null;
  maskUri: string | null;
  contentBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  hasAlphaChannel: boolean;
  hasTransparency: boolean;
  transparentPixelRatio: number;
  transparentPixelCount: number;
  method: "client" | "none";
};

export function isVisionBackgroundRemovalAvailable(): boolean {
  return Platform.OS === "ios" && isVisionBgNativeAvailable();
}

export function isBackgroundRemovalAvailable(): boolean {
  return Platform.OS === "android" || isVisionBackgroundRemovalAvailable();
}

function originalResult(localUri: string): BackgroundRemovalResult {
  return {
    uri: localUri,
    width: null,
    height: null,
    maskUri: null,
    contentBounds: null,
    hasAlphaChannel: false,
    hasTransparency: false,
    transparentPixelRatio: 0,
    transparentPixelCount: 0,
    method: "none",
  };
}

function normalizeFileUri(uri: string) {
  const u = String(uri ?? "").trim();
  if (!u) return "";
  // many RN image components expect file://
  if (u.startsWith("/")) return `file://${u}`;
  return u;
}

function normalizeOptions(
  options?: RemoveBackgroundOptions
): Required<RemoveBackgroundOptions> {
  const threshold = Number.isFinite(options?.threshold)
    ? Number(options?.threshold)
    : 0.64;
  const cleanupRadius = Number.isFinite(options?.cleanupRadius)
    ? Number(options?.cleanupRadius)
    : 2;
  const feather = Number.isFinite(options?.feather)
    ? Number(options?.feather)
    : 0;
  const edgeTighten = Number.isFinite(options?.edgeTighten)
    ? Number(options?.edgeTighten)
    : 0.45;
  const edgePolish = Number.isFinite(options?.edgePolish)
    ? Number(options?.edgePolish)
    : 0.5;
  const maskToAlpha =
    typeof options?.maskToAlpha === "boolean" ? options.maskToAlpha : true;

  return {
    threshold: Math.max(0, Math.min(1, threshold)),
    cleanupRadius: Math.max(0, Math.min(8, Math.round(cleanupRadius))),
    feather: Math.max(0, Math.min(6, Math.round(feather))),
    edgeTighten: Math.max(0, Math.min(1, edgeTighten)),
    edgePolish: Math.max(0, Math.min(1, edgePolish)),
    maskToAlpha,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function isAndroidModelWarmupError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("no foreground") ||
    message.includes("unavailable") ||
    message.includes("model") ||
    message.includes("download") ||
    message.includes("initializ")
  );
}

function getImageSize(uri: string): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    Image.getSize(
      normalizeFileUri(uri),
      (width, height) => resolve({ width, height }),
      () => resolve({ width: null, height: null })
    );
  });
}

async function removeBackgroundAndroid(
  localUri: string
): Promise<BackgroundRemovalResult> {
  const inputUri = normalizeFileUri(localUri);
  const maxAttempts = 4;
  let lastError: unknown = null;

  const isSupported = await isNativeBackgroundRemovalSupported();
  console.log("[BgRemoval] Android native supported:", isSupported);

  if (!isSupported) {
    throw new Error("Android native background removal is not supported on this device.");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await removeBackgroundCrossPlatform(localUri, {
        trim: true,
      });
      const outputUri = normalizeFileUri(result);
      const changed = outputUri && outputUri !== inputUri;
      const size = changed
        ? await getImageSize(outputUri)
        : { width: null, height: null };
      console.log("[BgRemoval] Android result", {
        attempt,
        outputUri,
        changed,
        width: size.width,
        height: size.height,
      });

      if (changed) {
        return {
          uri: outputUri,
          width: size.width,
          height: size.height,
          maskUri: null,
          contentBounds:
            size.width && size.height
              ? {
                  x: 0,
                  y: 0,
                  width: size.width,
                  height: size.height,
                }
              : null,
          hasAlphaChannel: true,
          hasTransparency: true,
          transparentPixelRatio: 1,
          transparentPixelCount: 1,
          method: "client",
        };
      }

      lastError = new Error("Android background removal returned the original image.");
    } catch (error) {
      lastError = error;
      console.warn("[BgRemoval] Android attempt failed", {
        attempt,
        message: getErrorMessage(error),
      });
    }

    if (attempt < maxAttempts && isAndroidModelWarmupError(lastError)) {
      await delay(900 * attempt);
      continue;
    }

    if (attempt < maxAttempts) {
      await delay(350);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Android background removal failed.");
}

export async function removeBackground(
  localUri: string,
  options?: RemoveBackgroundOptions
): Promise<BackgroundRemovalResult> {
  console.log("[BgRemoval] Platform:", Platform.OS);

  if (Platform.OS === "android") {
    try {
      return await removeBackgroundAndroid(localUri);
    } catch (e) {
      console.warn("[BgRemoval] Android native failed:", e);
      throw e instanceof Error ? e : new Error("Android background removal failed.");
    }
  }

  if (Platform.OS === "ios") {
    console.log("[BgRemoval] Skipping cross-platform native path on iOS; using VisionBG");
  }

  if (Platform.OS !== "ios") {
    console.log("[BgRemoval] Falling back to server-side");
    return originalResult(localUri);
  }

  const available = isVisionBgNativeAvailable();
  const normalizedOptions = normalizeOptions(options);
  console.log("[VisionBG] removeBackground called", {
    available,
    input: localUri,
    options: normalizedOptions,
  });

  if (!available) {
    console.log("[BgRemoval] Falling back to server-side");
    return originalResult(localUri);
  }

  try {
    const result = await removeBackgroundNative(localUri, normalizedOptions);
    console.log("[VisionBG] native result raw:", result);

    const rawOut = String((result as any)?.uri ?? "").trim();
    const width = Number((result as any)?.width ?? 0) || null;
    const height = Number((result as any)?.height ?? 0) || null;
    const rawMask = String((result as any)?.maskUri ?? "").trim();
    const maskUri = rawMask ? normalizeFileUri(rawMask) : null;
    const rawBounds = (result as any)?.contentBounds;
    const contentBounds =
      rawBounds &&
      Number.isFinite(Number(rawBounds?.width)) &&
      Number.isFinite(Number(rawBounds?.height)) &&
      Number(rawBounds?.width) > 0 &&
      Number(rawBounds?.height) > 0
        ? {
            x: Number(rawBounds?.x ?? 0),
            y: Number(rawBounds?.y ?? 0),
            width: Number(rawBounds?.width),
            height: Number(rawBounds?.height),
          }
        : null;
    const hasAlphaChannel = Boolean((result as any)?.hasAlphaChannel);
    const hasTransparency = Boolean((result as any)?.hasTransparency);
    const transparentPixelRatio =
      Number((result as any)?.transparentPixelRatio ?? 0) || 0;
    const transparentPixelCount =
      Number((result as any)?.transparentPixelCount ?? 0) || 0;
    const outputUri = normalizeFileUri(rawOut);

    console.log("[VisionBG] parsed output", {
      rawOut,
      outputUri,
      width,
      height,
      maskUri,
      contentBounds,
      hasAlphaChannel,
      hasTransparency,
      transparentPixelRatio,
      transparentPixelCount,
      changed: outputUri && outputUri !== normalizeFileUri(localUri),
    });

    if (!outputUri) {
      throw new Error(
        "Vision background removal returned an empty output URI.",
      );
    }

    if (outputUri !== normalizeFileUri(localUri)) {
      return {
        uri: outputUri,
        width,
        height,
        maskUri,
        contentBounds,
        hasAlphaChannel,
        hasTransparency,
        transparentPixelRatio,
        transparentPixelCount,
        method: "client",
      };
    }

    if (outputUri === normalizeFileUri(localUri)) {
      console.warn("[VisionBG] native returned original URI; treating as no-op", {
        input: normalizeFileUri(localUri),
        output: outputUri,
      });
    }

    console.log("[BgRemoval] Falling back to server-side");
    return originalResult(localUri);
  } catch (error) {
    console.warn("[VisionBG] FAILED; returning original uri", error);
    console.log("[BgRemoval] Falling back to server-side");
    return originalResult(localUri);
  }
}
