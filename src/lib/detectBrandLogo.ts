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
      console.log("[BrandDetect] native module unavailable");
      hasLoggedUnavailable = true;
    }
    return null;
  }

  try {
    console.log(`[BrandDetect] start uri=${inputUri}`);
    const result = await detectBrandLogoNative(inputUri);
    if (result?.brand) {
      console.log(
        `[BrandDetect] result brand=${result.brand} conf=${result.confidence ?? "n/a"}`
      );
    } else {
      console.log("[BrandDetect] no match");
    }
    return result;
  } catch (error) {
    console.log("[BrandDetect] error", error);
    return null;
  }
}
