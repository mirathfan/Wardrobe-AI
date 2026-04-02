import {
  isAvailable as isVisionBgNativeAvailable,
  type RemoveBackgroundOptions,
  removeBackground as removeBackgroundNative,
} from "expo-vision-bg";
import { Platform } from "react-native";

export function isVisionBackgroundRemovalAvailable(): boolean {
  return Platform.OS === "ios" && isVisionBgNativeAvailable();
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
    : 0.60;
  const cleanupRadius = Number.isFinite(options?.cleanupRadius)
    ? Number(options?.cleanupRadius)
    : 2;
  const feather = Number.isFinite(options?.feather)
    ? Number(options?.feather)
    : 1;
  const edgeTighten = Number.isFinite(options?.edgeTighten)
    ? Number(options?.edgeTighten)
    : 0.03;
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

export async function removeBackground(
  localUri: string,
  options?: RemoveBackgroundOptions
): Promise<{
  uri: string;
  width: number | null;
  height: number | null;
  maskUri: string | null;
  hasAlphaChannel: boolean;
  hasTransparency: boolean;
  transparentPixelRatio: number;
  transparentPixelCount: number;
}> {
  if (Platform.OS !== "ios") {
    return {
      uri: localUri,
      width: null,
      height: null,
      maskUri: null,
      hasAlphaChannel: false,
      hasTransparency: false,
      transparentPixelRatio: 0,
      transparentPixelCount: 0,
    };
  }

  const available = isVisionBgNativeAvailable();
  const normalizedOptions = normalizeOptions(options);
  console.log("[VisionBG] removeBackground called", {
    available,
    input: localUri,
    options: normalizedOptions,
  });

  if (!available) {
    return {
      uri: localUri,
      width: null,
      height: null,
      maskUri: null,
      hasAlphaChannel: false,
      hasTransparency: false,
      transparentPixelRatio: 0,
      transparentPixelCount: 0,
    };
  }

  try {
    const result = await removeBackgroundNative(localUri, normalizedOptions);
    console.log("[VisionBG] native result raw:", result);

    const rawOut = String((result as any)?.uri ?? "").trim();
    const width = Number((result as any)?.width ?? 0) || null;
    const height = Number((result as any)?.height ?? 0) || null;
    const rawMask = String((result as any)?.maskUri ?? "").trim();
    const maskUri = rawMask ? normalizeFileUri(rawMask) : null;
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

    if (outputUri === normalizeFileUri(localUri)) {
      console.warn("[VisionBG] native returned original URI; treating as no-op", {
        input: normalizeFileUri(localUri),
        output: outputUri,
      });
    }

    return {
      uri: outputUri,
      width,
      height,
      maskUri,
      hasAlphaChannel,
      hasTransparency,
      transparentPixelRatio,
      transparentPixelCount,
    };
  } catch (error) {
    console.warn("[VisionBG] FAILED; returning original uri", error);
    return {
      uri: localUri,
      width: null,
      height: null,
      maskUri: null,
      hasAlphaChannel: false,
      hasTransparency: false,
      transparentPixelRatio: 0,
      transparentPixelCount: 0,
    };
  }
}
