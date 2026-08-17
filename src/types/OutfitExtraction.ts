import type { ProductImageQuality } from "@/src/types/ProductImageQuality";

export type OutfitExtractionCategory =
  | "top"
  | "bottom"
  | "footwear"
  | "outerwear"
  | "accessory"
  | "one_piece";

export type OutfitExtractionBoundingBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ExtractedImageState = "cropped" | "polished" | "raw_fallback";
export type OutfitImageSource = "outfit_extraction" | "outfit_layout_reconstruction";
export type OutfitExtractionMethod =
  | "layout_grid_crop"
  | "layout_bbox_crop"
  | "layout_crop"
  | "original_crop_fallback";

export type PolishSkippedReason =
  | "accessory_auto_skip"
  | "low_confidence"
  | "tiny_crop"
  | "occluded";

export type DetectedGarment = {
  tempId: string;
  category: OutfitExtractionCategory;
  subcategory: string;
  confidence: number;
  boundingBox: OutfitExtractionBoundingBox;
  maskInfo?: {
    method: "background_removal" | "not_available";
    source: "server";
    warning?: string;
  } | null;
  cropImageUrl: string;
  originalOutfitImageUrl?: string | null;
  originalCropUrl?: string | null;
  refinedImageUrl?: string | null;
  cleanedImageUrl?: string | null;
  normalizedImageUrl?: string | null;
  imageSource?: OutfitImageSource;
  reconstructedLayoutUrl?: string | null;
  layoutCropUrl?: string | null;
  boundingBoxOnLayout?: OutfitExtractionBoundingBox | null;
  extractionMethod?: OutfitExtractionMethod | null;
  metadataSource?: "layout_one_shot" | null;
  reconstructionWarnings?: string[];
  selectedByDefault?: boolean;
  extractionQuality?: {
    score: number;
    visibilityCompleteness: number;
    hasCleanedImageUrl: boolean;
    hasRefinedImageUrl: boolean;
    fallbackUsed: boolean;
    rawCropFallback: boolean;
    partiallyVisible: boolean;
    lowConfidence: boolean;
  } | null;
  extractionMetadata: {
    source: "outfit_photo";
    sourceImageStoragePath?: string | null;
    cropStoragePath: string;
    refinedStoragePath?: string | null;
    cleanedStoragePath?: string | null;
    normalizedStoragePath?: string | null;
    polishApplied: boolean;
    polishWarnings: string[];
    backgroundRemovalApplied: boolean;
  };
  polishApplied?: boolean;
  cutoutApplied?: boolean;
  autoPolishApplied?: boolean;
  userPolished?: boolean;
  imageState?: ExtractedImageState;
  polishAvailable?: boolean;
  polishSkippedReason?: PolishSkippedReason | null;
  imageQuality: ProductImageQuality | null;
  suggestedName: string;
  suggestedColors: string[];
  suggestedBrand?: string | null;
  isUnbranded?: boolean | null;
  materialEstimate?: string[];
  material?: string | null;
  pattern?: string | null;
  fit?: string | null;
  styleAesthetic?: string[];
  extractionWarnings: string[];
};

export type OutfitExtractionSummary = {
  totalDetected: number;
  extractableCount: number;
  failedCount: number;
};

export type OutfitExtractionDraft = {
  traceId: string;
  sourceImageUrl: string;
  sourceStoragePath: string;
  reconstructedLayoutUrl?: string | null;
  detectedItems: ExtractedGarmentPreview[];
  summary: OutfitExtractionSummary;
};

export type ExtractedGarmentPreview = DetectedGarment & {
  selected: boolean;
  removed?: boolean;
};

export type ExtractOutfitItemsResponse = {
  traceId: string;
  detectedItems: DetectedGarment[];
  summary: OutfitExtractionSummary;
};

export type ReconstructOutfitLayoutResponse = {
  traceId: string;
  reconstructedLayoutUrl: string;
  layoutItems: DetectedGarment[];
  summary: OutfitExtractionSummary;
};

export type PolishExtractedAccessoryResponse = {
  refinedImageUrl: string;
  cleanedImageUrl?: string | null;
  refinedStoragePath?: string | null;
  cleanedStoragePath?: string | null;
  imageState: "polished";
  userPolished: true;
  warnings?: string[];
};
