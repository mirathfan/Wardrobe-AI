import { requireOptionalNativeModule } from "expo-modules-core";

export type RemoveBackgroundResult = {
  uri: string;
  width: number;
  height: number;
};

export type RemoveBackgroundOptions = {
  threshold?: number;
  cleanupRadius?: number;
  feather?: number;
  edgeTighten?: number;
  maskToAlpha?: boolean;
};

export type BrandCandidate = {
  brand: string;
  confidence: number;
};

export type BrandDetectionResult = {
  brand: string | null;
  confidence: number | null;
  candidates?: BrandCandidate[];
};

type ExpoVisionBgModuleType = {
  removeBackground(
    uri: string,
    options?: RemoveBackgroundOptions
  ): Promise<RemoveBackgroundResult>;
  detectBrandLogo(uri: string): Promise<BrandDetectionResult>;
};

const nativeModule =
  requireOptionalNativeModule<ExpoVisionBgModuleType>("ExpoVisionBg");

export function getExpoVisionBgModule(): ExpoVisionBgModuleType {
  if (!nativeModule) {
    throw new Error(
      "ExpoVisionBg native module not installed. Rebuild dev client with `npx expo run:ios`."
    );
  }
  return nativeModule;
}

export default nativeModule;
