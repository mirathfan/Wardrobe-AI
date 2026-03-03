import ExpoVisionBgModule, {
  RemoveBackgroundOptions,
  RemoveBackgroundResult,
  getExpoVisionBgModule,
} from "./ExpoVisionBgModule";

export type { RemoveBackgroundOptions, RemoveBackgroundResult };

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
