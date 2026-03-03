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
    : 0.62;
  const cleanupRadius = Number.isFinite(options?.cleanupRadius)
    ? Number(options?.cleanupRadius)
    : 3;
  const feather = Number.isFinite(options?.feather)
    ? Number(options?.feather)
    : 1;
  const edgeTighten = Number.isFinite(options?.edgeTighten)
    ? Number(options?.edgeTighten)
    : 0;
  const maskToAlpha =
    typeof options?.maskToAlpha === "boolean" ? options.maskToAlpha : true;

  return {
    threshold: Math.max(0, Math.min(1, threshold)),
    cleanupRadius: Math.max(0, Math.min(8, Math.round(cleanupRadius))),
    feather: Math.max(0, Math.min(6, Math.round(feather))),
    edgeTighten: Math.max(0, Math.min(1, edgeTighten)),
    maskToAlpha,
  };
}

export async function removeBackground(
  localUri: string,
  options?: RemoveBackgroundOptions
): Promise<string> {
  if (Platform.OS !== "ios") return localUri;

  const available = isVisionBgNativeAvailable();
  const normalizedOptions = normalizeOptions(options);
  console.log("[VisionBG] removeBackground called", {
    available,
    input: localUri,
    options: normalizedOptions,
  });

  if (!available) return localUri;

  try {
    const result = await removeBackgroundNative(localUri, normalizedOptions);
    console.log("[VisionBG] native result raw:", result);

    const rawOut = String((result as any)?.uri ?? "").trim();
    const outputUri = normalizeFileUri(rawOut);

    console.log("[VisionBG] parsed output", { rawOut, outputUri });

    if (!outputUri) {
      throw new Error(
        "Vision background removal returned an empty output URI.",
      );
    }

    return outputUri;
  } catch (error) {
    console.warn("[VisionBG] FAILED; returning original uri", error);
    return localUri;
  }
}
