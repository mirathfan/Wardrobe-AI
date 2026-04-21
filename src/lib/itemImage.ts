import { getVisualNormalizationDefaults, mergeVisualNormalization } from "./visualNormalization";

export type ItemImageSurface =
  | "closet_card"
  | "item_detail"
  | "home_today"
  | "home_continue"
  | "ai_outfit";

type ImageLikeItem = {
  images?: {
    originalUrl?: string | null;
    cleanedUrl?: string | null;
    isPrimary?: boolean;
  }[] | null;
  originalImageUrl?: string | null;
  cleanedImageUrl?: string | null;
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
  visualNormalization?: {
    contentBounds?: {
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
    };
    contentWidthPct?: number;
    contentHeightPct?: number;
    visualFillRatio?: number;
    verticalBias?: number;
    recommendedScale?: number;
    recommendedTranslateY?: number;
    anchor?: "top" | "center" | "waist" | "foot";
  } | null;
  photoUrl?: string | null;
  photoUri?: string | null;
  normalizedUrl?: string | null;
  cleanedUrl?: string | null;
  cleanedPhotoUrl?: string | null;
  cleanedSource?: string | null;
  cleanedLocalUri?: string | null;
  pendingPhotoUri?: string | null;
  photos?: {
    originalUrl?: string | null;
    images?: {
      originalUrl?: string | null;
      cleanedUrl?: string | null;
      isPrimary?: boolean;
    }[] | null;
    normalizedUrl?: string | null;
    previewUrl?: string | null;
    cleanedUrl?: string | null;
    cleanedPhotoUrl?: string | null;
    cleanedSource?: string | null;
    cleanedThumbUrl?: string | null;
    thumbUrl?: string | null;
    croppedUrl?: string | null;
    primaryUrl?: string | null;
    urls?: string[];
  };
};

function isValidImageUrl(value: string | null | undefined): boolean {
  const url = String(value ?? "").trim();
  if (!url) return false;
  if (url.startsWith("file://")) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  return true;
}

function firstValidUrl(values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const url = String(value ?? "").trim();
    if (isValidImageUrl(url)) return url;
  }
  return null;
}

function getCleanedSource(item: ImageLikeItem): string {
  const explicit = String(item.photos?.cleanedSource ?? item.cleanedSource ?? "")
    .trim()
    .toLowerCase();
  if (explicit) return explicit;

  const cleanedCandidate = String(
    item.photos?.normalizedUrl ??
      item.normalizedUrl ??
      item.photos?.cleanedUrl ??
      item.cleanedUrl ??
      item.photos?.cleanedPhotoUrl ??
      item.cleanedPhotoUrl ??
      ""
  ).trim().toLowerCase();

  if (
    cleanedCandidate.endsWith(".png") ||
    cleanedCandidate.includes(".cleaned.png") ||
    cleanedCandidate.includes("%2fitems%2f") && cleanedCandidate.includes(".cleaned.png") ||
    cleanedCandidate.includes("vision-cutout")
  ) {
    return "vision";
  }

  return "";
}

function getPrimaryImage(item: ImageLikeItem) {
  const primary =
    item.images?.find((image) => image?.isPrimary) ??
    item.images?.[0] ??
    item.photos?.images?.find((image) => image?.isPrimary) ??
    item.photos?.images?.[0] ??
    null;
  return {
    originalUrl: String(primary?.originalUrl ?? item.originalImageUrl ?? "").trim() || null,
    cleanedUrl: String(primary?.cleanedUrl ?? item.cleanedImageUrl ?? "").trim() || null,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeToken(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function getFrameAspectRatio(item: ImageLikeItem | null | undefined): number {
  const joined = [
    normalizeToken(item?.category),
    normalizeToken(item?.subCategory),
    normalizeToken(item?.type),
  ].join(" ");

  if (
    joined.includes("jeans") ||
    joined.includes("pants") ||
    joined.includes("trousers") ||
    joined.includes("dress") ||
    joined.includes("skirt") ||
    joined.includes("jumpsuit") ||
    joined.includes("romper")
  ) {
    return 0.72;
  }
  if (
    joined.includes("shirt") ||
    joined.includes("blouse") ||
    joined.includes("tee") ||
    joined.includes("top") ||
    joined.includes("crop top") ||
    joined.includes("jacket") ||
    joined.includes("coat") ||
    joined.includes("hoodie")
  ) {
    return 0.82;
  }
  if (
    joined.includes("shoe") ||
    joined.includes("sneaker") ||
    joined.includes("boot") ||
    joined.includes("loafer") ||
    joined.includes("heel")
  ) {
    return 1.18;
  }
  if (
    joined.includes("glasses") ||
    joined.includes("watch") ||
    joined.includes("bag") ||
    joined.includes("handbag") ||
    joined.includes("bracelet") ||
    joined.includes("necklace") ||
    joined.includes("hat") ||
    joined.includes("cap")
  ) {
    return 1.0;
  }
  return 0.86;
}

type SurfaceProfile = {
  aspectRatioMin: number;
  aspectRatioMax: number;
  aspectRatioWeight: number;
  fillTargetHeight: number;
  fillTargetWidth: number;
  fillAggressiveness: number;
  minScale: number;
  maxScale: number;
  translateMin: number;
  translateMax: number;
  verticalBiasStrength: number;
};

const SURFACE_PROFILES: Record<ItemImageSurface, SurfaceProfile> = {
  closet_card: {
    aspectRatioMin: 0.66,
    aspectRatioMax: 0.92,
    aspectRatioWeight: 0.76,
    fillTargetHeight: 96,
    fillTargetWidth: 90,
    fillAggressiveness: 1.12,
    minScale: 1.02,
    maxScale: 1.58,
    translateMin: -10,
    translateMax: 20,
    verticalBiasStrength: 0.2,
  },
  item_detail: {
    aspectRatioMin: 0.62,
    aspectRatioMax: 1.06,
    aspectRatioWeight: 0.68,
    fillTargetHeight: 95,
    fillTargetWidth: 92,
    fillAggressiveness: 1.08,
    minScale: 1,
    maxScale: 1.5,
    translateMin: -12,
    translateMax: 22,
    verticalBiasStrength: 0.18,
  },
  home_today: {
    aspectRatioMin: 0.72,
    aspectRatioMax: 1.02,
    aspectRatioWeight: 0.58,
    fillTargetHeight: 92,
    fillTargetWidth: 88,
    fillAggressiveness: 1.02,
    minScale: 0.98,
    maxScale: 1.38,
    translateMin: -10,
    translateMax: 16,
    verticalBiasStrength: 0.12,
  },
  home_continue: {
    aspectRatioMin: 0.72,
    aspectRatioMax: 0.98,
    aspectRatioWeight: 0.62,
    fillTargetHeight: 93,
    fillTargetWidth: 88,
    fillAggressiveness: 1.05,
    minScale: 1,
    maxScale: 1.42,
    translateMin: -10,
    translateMax: 18,
    verticalBiasStrength: 0.14,
  },
  ai_outfit: {
    aspectRatioMin: 0.78,
    aspectRatioMax: 1.08,
    aspectRatioWeight: 0.56,
    fillTargetHeight: 90,
    fillTargetWidth: 86,
    fillAggressiveness: 1,
    minScale: 0.96,
    maxScale: 1.34,
    translateMin: -10,
    translateMax: 14,
    verticalBiasStrength: 0.1,
  },
};

function clampAspectRatio(value: number, min: number, max: number) {
  return clamp(value, min, max);
}

function getContentAspectRatio(item: ImageLikeItem | null | undefined, fallback: number) {
  const widthPct = item?.visualNormalization?.contentWidthPct ?? item?.visualNormalization?.contentBounds?.widthPct;
  const heightPct =
    item?.visualNormalization?.contentHeightPct ?? item?.visualNormalization?.contentBounds?.heightPct;
  if (!widthPct || !heightPct) return fallback;
  return clampAspectRatio(widthPct / heightPct, 0.45, 1.6);
}

export function getItemImagePresentation(
  item: ImageLikeItem | null | undefined,
  options:
    | { surface: ItemImageSurface }
    | { variant: "thumb" | "hero" },
) {
  const surface: ItemImageSurface =
    "surface" in options
      ? options.surface
      : options.variant === "hero"
        ? "item_detail"
        : "closet_card";
  const surfaceProfile = SURFACE_PROFILES[surface];
  const normalization = mergeVisualNormalization(
    getVisualNormalizationDefaults({
      category: item?.category,
      subCategory: item?.subCategory,
      type: item?.type,
    }),
    item?.visualNormalization,
  );
  const fallbackAspectRatio = getFrameAspectRatio(item);
  const contentWidthPct =
    normalization.contentWidthPct ?? normalization.contentBounds?.widthPct ?? 82;
  const contentHeightPct =
    normalization.contentHeightPct ?? normalization.contentBounds?.heightPct ?? 88;
  const contentAspectRatio = getContentAspectRatio(item, fallbackAspectRatio);
  const containerAspectRatio = clampAspectRatio(
    fallbackAspectRatio * (1 - surfaceProfile.aspectRatioWeight) +
      contentAspectRatio * surfaceProfile.aspectRatioWeight,
    surfaceProfile.aspectRatioMin,
    surfaceProfile.aspectRatioMax,
  );
  const fillHeightBoost = surfaceProfile.fillTargetHeight / contentHeightPct;
  const fillWidthBoost = surfaceProfile.fillTargetWidth / contentWidthPct;
  const fillBoost = clamp(
    Math.max(fillHeightBoost, fillWidthBoost) * surfaceProfile.fillAggressiveness,
    surfaceProfile.minScale,
    surfaceProfile.maxScale,
  );
  const anchorBias =
    normalization.anchor === "top"
      ? 4
      : normalization.anchor === "waist"
        ? 3
        : normalization.anchor === "foot"
          ? 2
          : 0;
  const verticalBias = normalization.verticalBias ?? 0;
  const scale = clamp(
    (normalization.recommendedScale ?? 1) * fillBoost,
    surfaceProfile.minScale,
    surfaceProfile.maxScale,
  );
  const translateY = clamp(
    (normalization.recommendedTranslateY ?? 0) +
      anchorBias +
      verticalBias * surfaceProfile.verticalBiasStrength,
    surfaceProfile.translateMin,
    surfaceProfile.translateMax,
  );

  return {
    resizeMode: "contain" as const,
    containerAspectRatio,
    imageStyle: {
      transform: [{ translateY }, { scale }],
    } as const,
  };
}

export function getItemImageUrl(
  item: ImageLikeItem | null | undefined,
  options: { variant: "thumb" | "hero" }
): string | null {
  if (!item) return null;
  const primaryImage = getPrimaryImage(item);
  const cleanedSource = getCleanedSource(item);
  const preferredVisionCleaned =
    cleanedSource === "vision"
      ? [
          primaryImage.cleanedUrl,
          item.photos?.normalizedUrl,
          item.normalizedUrl,
          item.photos?.previewUrl,
          item.photos?.cleanedUrl,
          item.cleanedUrl,
          item.photos?.cleanedPhotoUrl,
          item.cleanedPhotoUrl,
        ]
      : [];
  const fallbackCleaned = [
    primaryImage.cleanedUrl,
    item.photos?.normalizedUrl,
    item.normalizedUrl,
    item.photos?.previewUrl,
    item.photos?.cleanedUrl,
    item.cleanedUrl,
    item.photos?.cleanedPhotoUrl,
    item.cleanedPhotoUrl,
  ];

  if (options.variant === "hero") {
    return firstValidUrl([
      ...preferredVisionCleaned,
      primaryImage.originalUrl,
      item.photos?.primaryUrl,
      item.photoUrl,
      item.photoUri,
      ...fallbackCleaned,
      item.cleanedLocalUri,
      item.pendingPhotoUri,
      item.photos?.cleanedThumbUrl,
      item.photos?.thumbUrl,
      item.photos?.croppedUrl,
      item.photos?.urls?.[0],
    ]);
  }

  return firstValidUrl([
    ...preferredVisionCleaned,
    primaryImage.originalUrl,
    item.photos?.primaryUrl,
    item.photoUrl,
    item.photoUri,
    ...fallbackCleaned,
    item.cleanedLocalUri,
    item.pendingPhotoUri,
    item.photos?.cleanedThumbUrl,
    item.photos?.thumbUrl,
    item.photos?.croppedUrl,
    item.photos?.urls?.[0],
  ]);
}
