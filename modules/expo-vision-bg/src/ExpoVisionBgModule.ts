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

type ExpoVisionBgModuleType = {
  removeBackground(
    uri: string,
    options?: RemoveBackgroundOptions
  ): Promise<RemoveBackgroundResult>;
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
