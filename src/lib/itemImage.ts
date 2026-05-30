import type { DimensionValue } from "react-native";

import {
  resolveItemImage,
  type ResolvableItemImage,
  type ResolveItemImageSurface,
} from "./resolveItemImage";
import { getVisualNormalizationDefaults, mergeVisualNormalization } from "./visualNormalization";

export type ItemImageSurface =
  | "closet_card"
  | "item_detail"
  | "home_today"
  | "home_continue"
  | "ai_outfit";

type ImageLikeItem = {
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
} & ResolvableItemImage;

export type ItemImageDecoration = {
  shadowStyle: {
    width: DimensionValue;
    height: DimensionValue;
    bottom: DimensionValue;
    opacity: number;
  };
};

export type ItemImageSource = { uri: string } | null;

const DEBUG_ITEM_IMAGES =
  __DEV__ && process.env.EXPO_PUBLIC_DEBUG_ITEM_IMAGES === "1";

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

function isLikelyUiScreenshotUrl(value: string | null | undefined): boolean {
  const lower = String(value ?? "").trim().toLowerCase();
  if (!lower) return false;
  return /screenshot|screen[-_ ]?shot|share[-_ ]?image|social|thumbnail|thumb|icon|sprite|logo|badge|placeholder|swatch|avatar|banner|ui|chrome|header|footer/.test(
    lower
  );
}

function scoreImageCandidate(url: string | null | undefined, context: "cutout" | "original"): number {
  const lower = String(url ?? "").trim().toLowerCase();
  if (!lower) return -100;
  let score = 0;
  if (context === "cutout") score += 12;
  if (lower.endsWith(".png") || lower.includes(".png?")) score += 3;
  if (/normalized|cleaned|vision-cutout|cutout|transparent|alpha|isolated/.test(lower)) score += 10;
  if (/product|pdp|gallery|main|image|photo|model/.test(lower)) score += 4;
  if (/cropped|crop|thumb|thumbnail/.test(lower)) score -= 4;
  if (isLikelyUiScreenshotUrl(lower)) score -= 14;
  return score;
}

function pickBestUrl(values: (string | null | undefined)[], context: "cutout" | "original") {
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => isValidImageUrl(value))
    .sort((a, b) => scoreImageCandidate(b, context) - scoreImageCandidate(a, context))[0] ?? null;
}

function derivedImageUrl(value: string | null | undefined): string | null {
  const url = String(value ?? "").trim();
  if (!isValidImageUrl(url)) return null;
  return /normalized|cleaned|vision-cutout|cutout|transparent|alpha|isolated|preview|thumb|thumbnail|cropped|crop/.test(
    url.toLowerCase()
  )
    ? url
    : null;
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

function isTopLikeItem(item: ImageLikeItem | null | undefined) {
  const joined = [
    normalizeToken(item?.category),
    normalizeToken(item?.subCategory),
    normalizeToken(item?.type),
  ].join(" ");

  return /shirt|polo|blouse|tee|t-shirt|top|crop top|sweater|overshirt|hoodie|jacket|coat|outerwear/.test(
    joined
  );
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
    fillTargetHeight: 82,
    fillTargetWidth: 78,
    fillAggressiveness: 0.9,
    minScale: 0.88,
    maxScale: 1.18,
    translateMin: -6,
    translateMax: 10,
    verticalBiasStrength: 0.08,
  },
  item_detail: {
    aspectRatioMin: 0.62,
    aspectRatioMax: 1.06,
    aspectRatioWeight: 0.68,
    fillTargetHeight: 84,
    fillTargetWidth: 82,
    fillAggressiveness: 0.9,
    minScale: 0.9,
    maxScale: 1.16,
    translateMin: -8,
    translateMax: 12,
    verticalBiasStrength: 0.08,
  },
  home_today: {
    aspectRatioMin: 0.72,
    aspectRatioMax: 1.02,
    aspectRatioWeight: 0.58,
    fillTargetHeight: 82,
    fillTargetWidth: 78,
    fillAggressiveness: 0.92,
    minScale: 0.9,
    maxScale: 1.16,
    translateMin: -7,
    translateMax: 10,
    verticalBiasStrength: 0.08,
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
    fillTargetHeight: 82,
    fillTargetWidth: 80,
    fillAggressiveness: 0.94,
    minScale: 0.88,
    maxScale: 1.24,
    translateMin: -8,
    translateMax: 12,
    verticalBiasStrength: 0.08,
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

function hasMeasuredVisualNormalization(item: ImageLikeItem | null | undefined) {
  return Boolean(
    item?.visualNormalization?.contentBounds ||
      item?.visualNormalization?.contentWidthPct ||
      item?.visualNormalization?.contentHeightPct
  );
}

function hasItemLevelVisualNormalization(item: ImageLikeItem | null | undefined) {
  return Boolean(
    hasMeasuredVisualNormalization(item) ||
      item?.visualNormalization?.recommendedScale != null ||
      item?.visualNormalization?.recommendedTranslateY != null ||
      item?.visualNormalization?.verticalBias != null
  );
}

function hasNormalizedImage(item: ImageLikeItem | null | undefined) {
  return isValidImageUrl(item?.photos?.normalizedUrl) || isValidImageUrl(item?.normalizedUrl);
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
  const hasMeasuredNormalization = hasMeasuredVisualNormalization(item);
  const hasItemNormalization = hasItemLevelVisualNormalization(item);
  const fallbackAspectRatio = getFrameAspectRatio(item);
  const topLike = isTopLikeItem(item);
  const usesNormalizedImage = hasNormalizedImage(item);
  const rawContentWidthPct =
    normalization.contentWidthPct ?? normalization.contentBounds?.widthPct ?? 82;
  const rawContentHeightPct =
    normalization.contentHeightPct ?? normalization.contentBounds?.heightPct ?? 88;
  const contentWidthPct =
    topLike && (surface === "closet_card" || surface === "item_detail")
      ? clamp(rawContentWidthPct, 72, 80)
      : rawContentWidthPct;
  const contentHeightPct =
    topLike && (surface === "closet_card" || surface === "item_detail")
      ? clamp(rawContentHeightPct, 74, 84)
      : rawContentHeightPct;
  const rawContentAspectRatio = getContentAspectRatio(item, fallbackAspectRatio);
  const contentAspectRatio =
    topLike && (surface === "closet_card" || surface === "item_detail")
      ? clampAspectRatio(rawContentAspectRatio, 0.72, 0.92)
      : rawContentAspectRatio;
  const containerAspectRatio = clampAspectRatio(
    fallbackAspectRatio *
      (1 -
        (surface === "closet_card" && !hasMeasuredNormalization
          ? surfaceProfile.aspectRatioWeight * 0.45
          : topLike && (surface === "closet_card" || surface === "item_detail")
            ? surfaceProfile.aspectRatioWeight * 0.55
            : surfaceProfile.aspectRatioWeight)) +
      contentAspectRatio *
        (surface === "closet_card" && !hasMeasuredNormalization
          ? surfaceProfile.aspectRatioWeight * 0.45
          : topLike && (surface === "closet_card" || surface === "item_detail")
            ? surfaceProfile.aspectRatioWeight * 0.55
            : surfaceProfile.aspectRatioWeight),
    surfaceProfile.aspectRatioMin,
    surfaceProfile.aspectRatioMax,
  );
  const fillHeightBoost = surfaceProfile.fillTargetHeight / contentHeightPct;
  const fillWidthBoost = surfaceProfile.fillTargetWidth / contentWidthPct;
  const fillBoost = clamp(
    (topLike && (surface === "closet_card" || surface === "item_detail")
      ? ((fillHeightBoost + fillWidthBoost) / 2) * surfaceProfile.fillAggressiveness
      : Math.max(fillHeightBoost, fillWidthBoost) * surfaceProfile.fillAggressiveness),
    surfaceProfile.minScale,
    surface === "closet_card" && !hasMeasuredNormalization
      ? Math.min(surfaceProfile.maxScale, 1.06)
      : surfaceProfile.maxScale,
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
    surface === "closet_card" && !hasItemNormalization
      ? Math.min(surfaceProfile.maxScale, 1.08)
      : surfaceProfile.maxScale,
  );
  const translateY = clamp(
    (normalization.recommendedTranslateY ?? 0) +
      anchorBias +
      verticalBias * surfaceProfile.verticalBiasStrength,
    surface === "closet_card" && !hasMeasuredNormalization
      ? Math.max(surfaceProfile.translateMin, -4)
      : surfaceProfile.translateMin,
    surface === "closet_card" && !hasMeasuredNormalization
      ? Math.min(surfaceProfile.translateMax, 8)
      : surfaceProfile.translateMax,
  );
  const imageTransform =
    usesNormalizedImage && (surface === "closet_card" || surface === "item_detail")
      ? [{ translateY: 0 }, { scale: 1 }]
      : [{ translateY }, { scale }];

  return {
    resizeMode: "contain" as const,
    containerAspectRatio,
    imageStyle: {
      transform: imageTransform,
    } as const,
  };
}

export function getItemImageDecoration(
  item: ImageLikeItem | null | undefined,
  surface: ItemImageSurface,
): ItemImageDecoration {
  const joined = [
    normalizeToken(item?.category),
    normalizeToken(item?.subCategory),
    normalizeToken(item?.type),
  ].join(" ");

  if (surface === "ai_outfit") {
    if (/shoe|sneaker|loafer|boot|heel/.test(joined)) {
      return { shadowStyle: { width: "56%", height: "11%", bottom: "14%", opacity: 0.16 } };
    }
    if (/watch|glasses|bracelet|necklace|ring|earrings/.test(joined)) {
      return { shadowStyle: { width: "34%", height: "8%", bottom: "18%", opacity: 0.12 } };
    }
    return { shadowStyle: { width: "48%", height: "9%", bottom: "14%", opacity: 0.14 } };
  }

  if (surface === "item_detail") {
    if (/shoe|sneaker|loafer|boot|heel/.test(joined)) {
      return { shadowStyle: { width: "54%", height: "10%", bottom: "13%", opacity: 0.12 } };
    }
    if (/watch|glasses|bracelet|necklace|ring|earrings/.test(joined)) {
      return { shadowStyle: { width: "30%", height: "7%", bottom: "16%", opacity: 0.08 } };
    }
    return { shadowStyle: { width: "46%", height: "8%", bottom: "12%", opacity: 0.1 } };
  }

  return { shadowStyle: { width: "42%", height: "8%", bottom: "10%", opacity: 0.1 } };
}

export function getItemImageUrl(
  item: ImageLikeItem | null | undefined,
  options: {
    variant: "thumb" | "hero";
    surface?: ResolveItemImageSurface;
    log?: boolean;
  }
): string | null {
  if (!item) return null;
  if (normalizeToken(item.imageSource) === "outfit layout reconstruction") {
    return resolveItemImage(item, {
      variant: options.variant,
      surface: options.surface ?? (options.variant === "hero" ? "item_detail" : "closet_card"),
      log: options.log,
    }).uri;
  }

  const primaryImage = getPrimaryImage(item);
  const cleanedSource = getCleanedSource(item);
  const preferredVisionCleaned =
    cleanedSource === "vision"
      ? [
          item.photos?.normalizedUrl,
          item.normalizedUrl,
          primaryImage.cleanedUrl,
          item.photos?.previewUrl,
          item.photos?.cleanedUrl,
          item.cleanedUrl,
          item.photos?.cleanedPhotoUrl,
          item.cleanedPhotoUrl,
        ]
      : [];
  const fallbackCleaned = [
    item.photos?.normalizedUrl,
    item.normalizedUrl,
    primaryImage.cleanedUrl,
    item.photos?.previewUrl,
    item.photos?.cleanedUrl,
    item.cleanedUrl,
    item.photos?.cleanedPhotoUrl,
    item.cleanedPhotoUrl,
  ];

  const preferredCutout = pickBestUrl(
    [
      ...preferredVisionCleaned,
      ...fallbackCleaned,
      item.photos?.cleanedThumbUrl,
      item.cleanedLocalUri,
    ],
    "cutout"
  );
  const preferredThumbnail = pickBestUrl(
    [
      item.photos?.cleanedThumbUrl,
      item.photos?.thumbUrl,
      item.photos?.croppedUrl,
      item.photos?.previewUrl,
      derivedImageUrl(item.photos?.primaryUrl),
      derivedImageUrl(item.photoUrl),
      ...(item.photos?.urls ?? []).map(derivedImageUrl),
    ],
    "original"
  );
  const preferredOriginal = pickBestUrl(
    [
      primaryImage.originalUrl,
      item.photos?.primaryUrl,
      item.photoUrl,
      item.photos?.urls?.[0],
      ...(item.photos?.urls ?? []),
      item.photoUri,
      item.pendingPhotoUri,
      item.photos?.thumbUrl,
      item.photos?.croppedUrl,
    ],
    "original"
  );
  const picked =
    options.variant === "thumb"
      ? preferredCutout ??
        preferredThumbnail ??
        firstValidUrl([
          ...fallbackCleaned,
          item.cleanedLocalUri,
          item.photos?.cleanedThumbUrl,
          item.photos?.thumbUrl,
          item.photos?.croppedUrl,
          item.photos?.previewUrl,
        ])
      : preferredCutout ??
        preferredOriginal ??
        firstValidUrl([
          ...fallbackCleaned,
          primaryImage.originalUrl,
          item.photos?.primaryUrl,
          item.photoUrl,
          item.photoUri,
          item.cleanedLocalUri,
          item.pendingPhotoUri,
          item.photos?.thumbUrl,
          item.photos?.croppedUrl,
          item.photos?.urls?.[0],
        ]);
  if (DEBUG_ITEM_IMAGES) {
    console.log("[ITEM_IMAGE_PICK]", {
      variant: options.variant,
      picked,
      preferredCutout,
      preferredThumbnail,
      preferredOriginal,
      hasPrimaryCleaned: !!primaryImage.cleanedUrl,
      hasCleanedImageUrl: !!item.cleanedImageUrl,
      hasPhotosCleanedUrl: !!item.photos?.cleanedUrl,
      hasNormalizedUrl: !!item.photos?.normalizedUrl || !!item.normalizedUrl,
      hasOriginal: !!primaryImage.originalUrl,
      cleanedSource,
    });
  }
  return picked;
}

export function getBestThumbnailImageSource(
  item: ImageLikeItem | null | undefined,
  options: { surface?: ResolveItemImageSurface; log?: boolean } = {},
): ItemImageSource {
  const uri = getItemImageUrl(item, {
    variant: "thumb",
    surface: options.surface ?? "closet_card",
    log: options.log,
  });
  return uri ? { uri } : null;
}
