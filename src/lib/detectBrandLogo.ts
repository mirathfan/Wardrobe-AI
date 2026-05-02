import {
  detectBrandLogo as detectBrandLogoNative,
  isAvailable as isVisionBgAvailable,
  type BrandDetectionResult,
} from "expo-vision-bg";
import { Platform } from "react-native";

let hasLoggedUnavailable = false;

export async function detectBrandLogo(
  inputUri: string
): Promise<BrandDetectionResult | null> {
  if (Platform.OS !== "ios") {
    return null;
  }

  if (!isVisionBgAvailable()) {
    if (!hasLoggedUnavailable) {
      if (__DEV__) {
        console.log("[BrandDetect] native module unavailable");
      }
      hasLoggedUnavailable = true;
    }
    return null;
  }

  try {
    if (__DEV__) {
      console.log(`[BrandDetect] start uri=${inputUri}`);
    }
    const result = await detectBrandLogoNative(inputUri);
    if (result?.brand) {
      if (__DEV__) {
        console.log(
          `[BrandDetect] result brand=${result.brand} conf=${result.confidence ?? "n/a"}`
        );
      }
    } else {
      if (__DEV__) {
        console.log("[BrandDetect] no match");
      }
    }
    return result;
  } catch (error) {
    if (__DEV__) {
      console.log("[BrandDetect] error", error);
    }
    return null;
  }
}
