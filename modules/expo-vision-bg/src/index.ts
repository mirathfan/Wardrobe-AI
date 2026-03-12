import ExpoVisionBgModule, {
  BrandDetectionResult,
  RemoveBackgroundOptions,
  RemoveBackgroundResult,
  getExpoVisionBgModule,
} from "./ExpoVisionBgModule";

export type { BrandDetectionResult, RemoveBackgroundOptions, RemoveBackgroundResult };

export function isAvailable(): boolean {
  return !!ExpoVisionBgModule;
}

export async function removeBackground(
  uri: string,
  options?: RemoveBackgroundOptions
): Promise<RemoveBackgroundResult> {
  const module = ExpoVisionBgModule ?? getExpoVisionBgModule();
  return module.removeBackground(uri, options);
}

export async function detectBrandLogo(
  uri: string
): Promise<BrandDetectionResult> {
  const module = ExpoVisionBgModule ?? getExpoVisionBgModule();
  return module.detectBrandLogo(uri);
}
