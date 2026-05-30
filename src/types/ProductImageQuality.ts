export type ProductImageQuality = {
  aestheticScore: number;
  lightingQuality: number;
  clutterLevel: number;
  wrinkleLevel: number;
  cropQuality: number;
  visibilityCompleteness: number;
  humanVisible: boolean;
  hangerVisible: boolean;
  surfaceVisible: boolean;
  needsRefinement: boolean;
  refinementReason: string[];
};

export type ProductImageVariant = "original" | "polished";

export type ItemImageSource =
  | "polished_cutout"
  | "polished"
  | "original_cutout"
  | "original";

export type ProductPolishMetadata = {
  source: "photo_upload";
  status: "not_needed" | "applied" | "failed";
  activeVariant: ProductImageVariant;
  traceId?: string | null;
  modelUsed?: string | null;
  sourceStoragePath?: string | null;
  refinedStoragePath?: string | null;
  refinedImageUrl?: string | null;
  warnings?: string[];
  errorMessage?: string | null;
  appliedAt?: number | null;
};

export type ProductPolishCallableResponse = {
  ok: boolean;
  imageQuality: ProductImageQuality;
  refinementApplied: boolean;
  refinedImageUrl?: string | null;
  refinedStoragePath?: string | null;
  modelUsed?: string | null;
  warnings?: string[];
};

export const PRODUCT_POLISH_THRESHOLDS = {
  aestheticScore: 0.72,
  clutterLevel: 0.5,
  lightingQuality: 0.55,
  cropQuality: 0.65,
} as const;

export function shouldRunProductPolish(quality: ProductImageQuality | null | undefined) {
  if (!quality) return false;
  return (
    quality.needsRefinement ||
    quality.aestheticScore < PRODUCT_POLISH_THRESHOLDS.aestheticScore ||
    quality.clutterLevel > PRODUCT_POLISH_THRESHOLDS.clutterLevel ||
    quality.lightingQuality < PRODUCT_POLISH_THRESHOLDS.lightingQuality ||
    quality.cropQuality < PRODUCT_POLISH_THRESHOLDS.cropQuality ||
    quality.humanVisible ||
    quality.hangerVisible ||
    quality.surfaceVisible
  );
}
