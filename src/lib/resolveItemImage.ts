import { safeUriType } from "./photoPipelineLogger";

export type ResolvedItemImageSource =
  | "normalizedImageUrl"
  | "layoutCropUrl"
  | "cleanedImageUrl"
  | "refinedImageUrl"
  | "photos.refinedUrl"
  | "cutout"
  | "originalImageUrl"
  | "photos[]"
  | "missing";

export type ResolveItemImageVariant = "thumb" | "hero";

export type ResolveItemImageSurface =
  | "closet_grid"
  | "closet_card"
  | "item_detail"
  | "item_detail_modal"
  | "outfit_card"
  | "aura_look_card"
  | "calendar_outfit_card"
  | "home_recommendation"
  | "home_today"
  | "home_continue"
  | "ai_outfit"
  | "unknown";

type ImageEntry = {
  traceId?: string | null;
  originalUrl?: string | null;
  sourceOriginalUrl?: string | null;
  refinedUrl?: string | null;
  cleanedUrl?: string | null;
  isPrimary?: boolean;
};

export type ResolvableItemImage = {
  id?: string | null;
  itemId?: string | null;
  traceId?: string | null;
  photoPipelineTraceId?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  originalImageUrl?: string | null;
  originalCropUrl?: string | null;
  normalizedImageUrl?: string | null;
  refinedImageUrl?: string | null;
  cleanedImageUrl?: string | null;
  photoUrl?: string | null;
  photoUri?: string | null;
  normalizedUrl?: string | null;
  cleanedUrl?: string | null;
  cleanedPhotoUrl?: string | null;
  cleanedSource?: string | null;
  cleanedLocalUri?: string | null;
  pendingPhotoUri?: string | null;
  imageSource?: string | null;
  extractionMethod?: string | null;
  layoutCropUrl?: string | null;
  backgroundRemovalMethod?: "client" | "server" | "none" | string | null;
  productPolish?: {
    status?: string | null;
    refinedImageUrl?: string | null;
    traceId?: string | null;
  } | null;
  imageQuality?: unknown;
  images?: ImageEntry[] | null;
  photos?: {
    traceId?: string | null;
    originalUrl?: string | null;
    primaryUrl?: string | null;
    imageSource?: string | null;
    extractionMethod?: string | null;
    layoutCropUrl?: string | null;
    normalizedImageUrl?: string | null;
    originalCropUrl?: string | null;
    refinedUrl?: string | null;
    imageQuality?: unknown;
    productPolish?: {
      status?: string | null;
      refinedImageUrl?: string | null;
      traceId?: string | null;
    } | null;
    images?: ImageEntry[] | null;
    normalizedUrl?: string | null;
    previewUrl?: string | null;
    cleanedUrl?: string | null;
    cleanedPhotoUrl?: string | null;
    cleanedSource?: string | null;
    cleanedThumbUrl?: string | null;
    thumbUrl?: string | null;
    croppedUrl?: string | null;
    urls?: string[] | null;
  } | null;
  outfitExtraction?: {
    imageSource?: string | null;
    extractionMethod?: string | null;
    layoutCropUrl?: string | null;
    normalizedImageUrl?: string | null;
    originalCropUrl?: string | null;
  } | null;
  visualNormalization?: {
    contentBounds?: {
      leftPct?: number;
      topPct?: number;
      widthPct?: number;
      heightPct?: number;
    } | null;
    contentWidthPct?: number | null;
    contentHeightPct?: number | null;
  } | null;
};

type ImageCandidate = {
  source: ResolvedItemImageSource;
  field: string;
  value?: string | null;
  hasTransparency: boolean | null;
};

export type ResolvedItemImage = {
  uri: string | null;
  itemId: string | null;
  traceId: string | null;
  selectedSource: ResolvedItemImageSource;
  selectedField: string | null;
  variant: ResolveItemImageVariant;
  surface: ResolveItemImageSurface;
  fallbackChain: ResolvedItemImageSource[];
  fallbacksChecked: ResolvedItemImageSource[];
  availableFallbacks: ResolvedItemImageSource[];
  fallbackActivated: boolean;
  hasCleanedImageUrl: boolean;
  hasRefinedImageUrl: boolean;
  hasPhotosRefinedUrl: boolean;
  hasCutoutImage: boolean;
  hasOriginalImageUrl: boolean;
  hasTransparency: boolean | null;
  selectedUriType: string;
};

const FALLBACK_CHAIN: ResolvedItemImageSource[] = [
  "cleanedImageUrl",
  "refinedImageUrl",
  "photos.refinedUrl",
  "cutout",
  "originalImageUrl",
  "photos[]",
];
const LAYOUT_FALLBACK_CHAIN: ResolvedItemImageSource[] = [
  "normalizedImageUrl",
  "cleanedImageUrl",
  "layoutCropUrl",
  "originalImageUrl",
  "photos[]",
];

const AURA_DEBUG_IMAGES =
  __DEV__ &&
  (process.env.EXPO_PUBLIC_AURA_DEBUG_IMAGES === "true" ||
    process.env.AURA_DEBUG_IMAGES === "true" ||
    (globalThis as any).AURA_DEBUG_IMAGES === true);

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function sourceToken(value: unknown) {
  return cleanString(value).toLowerCase().replace(/[_-]+/g, " ");
}

export function isResolvableImageUrl(value: string | null | undefined): boolean {
  const url = cleanString(value);
  if (!url) return false;
  if (url.startsWith("file://")) return true;
  if (url.startsWith("ph://")) return true;
  if (url.startsWith("assets-library://")) return true;
  if (url.startsWith("content://")) return true;
  if (url.startsWith("/")) return true;
  return /^https?:\/\//i.test(url);
}

function validUrl(value: string | null | undefined): string | null {
  const url = cleanString(value);
  return isResolvableImageUrl(url) ? url : null;
}

function uniqueSources(values: ResolvedItemImageSource[]) {
  const seen = new Set<ResolvedItemImageSource>();
  return values.filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function primaryImage(item: ResolvableItemImage | null | undefined) {
  return (
    item?.images?.find((image) => image?.isPrimary) ??
    item?.images?.[0] ??
    item?.photos?.images?.find((image) => image?.isPrimary) ??
    item?.photos?.images?.[0] ??
    null
  );
}

function imageEntries(item: ResolvableItemImage | null | undefined) {
  return [...(item?.images ?? []), ...(item?.photos?.images ?? [])];
}

function firstValidCandidate(candidates: ImageCandidate[]) {
  const seenUris = new Set<string>();
  for (let index = 0; index < candidates.length; index += 1) {
    const uri = validUrl(candidates[index]?.value);
    if (!uri || seenUris.has(uri)) continue;
    seenUris.add(uri);
    return { candidate: candidates[index], uri, index };
  }
  return null;
}

function hasValidCandidate(candidates: ImageCandidate[]) {
  return candidates.some((candidate) => isResolvableImageUrl(candidate.value));
}

function isLikelyTransparentUrl(uri: string | null | undefined) {
  const lower = cleanString(uri).toLowerCase();
  if (!lower) return null;
  if (
    lower.endsWith(".png") ||
    lower.includes(".png?") ||
    /normalized|cleaned|vision-cutout|cutout|transparent|alpha|isolated/.test(lower)
  ) {
    return true;
  }
  return null;
}

function isOutfitLayoutReconstructionItem(item: ResolvableItemImage | null | undefined) {
  return sourceToken(item?.imageSource) === "outfit layout reconstruction";
}

function layoutCropCandidatesFor(item: ResolvableItemImage): ImageCandidate[] {
  if (!isOutfitLayoutReconstructionItem(item)) return [];
  const candidates: [ResolvedItemImageSource, string, string | null | undefined][] = [
    ["normalizedImageUrl", "normalizedImageUrl", item.normalizedImageUrl],
    ["normalizedImageUrl", "photos.normalizedImageUrl", item.photos?.normalizedImageUrl],
    ["normalizedImageUrl", "outfitExtraction.normalizedImageUrl", item.outfitExtraction?.normalizedImageUrl],
    ["cleanedImageUrl", "cleanedImageUrl", item.cleanedImageUrl],
    ["cleanedImageUrl", "photos.cleanedUrl", item.photos?.cleanedUrl],
    ["layoutCropUrl", "layoutCropUrl", item.layoutCropUrl],
    ["layoutCropUrl", "photos.layoutCropUrl", item.photos?.layoutCropUrl],
    ["layoutCropUrl", "outfitExtraction.layoutCropUrl", item.outfitExtraction?.layoutCropUrl],
    ["originalImageUrl", "originalCropUrl", item.originalCropUrl],
    ["originalImageUrl", "photos.originalCropUrl", item.photos?.originalCropUrl],
    ["originalImageUrl", "outfitExtraction.originalCropUrl", item.outfitExtraction?.originalCropUrl],
  ];
  return candidates.map(([source, field, value]) => ({
    source,
    field,
    value,
    hasTransparency: source === "cleanedImageUrl" ? isLikelyTransparentUrl(value) : false,
  }));
}

function traceIdForItem(item: ResolvableItemImage | null | undefined) {
  return (
    cleanString(item?.photoPipelineTraceId) ||
    cleanString(item?.traceId) ||
    cleanString(item?.photos?.traceId) ||
    cleanString(item?.productPolish?.traceId) ||
    cleanString(item?.photos?.productPolish?.traceId) ||
    null
  );
}

function itemIdForLog(item: ResolvableItemImage | null | undefined) {
  return cleanString(item?.id) || cleanString(item?.itemId) || null;
}

function buildCandidates(item: ResolvableItemImage): ImageCandidate[] {
  const primary = primaryImage(item);
  const entries = imageEntries(item);
  const sourceOriginalCandidates = entries.map((image) => image?.sourceOriginalUrl);
  const originalCandidates = entries.map((image) => image?.originalUrl);
  const refinedImageUrl = item.refinedImageUrl ?? item.productPolish?.refinedImageUrl ?? null;
  const photosRefinedUrl = item.photos?.refinedUrl ?? item.photos?.productPolish?.refinedImageUrl ?? primary?.refinedUrl ?? null;

  const cleanedCandidates: ImageCandidate[] = [
    {
      source: "cleanedImageUrl",
      field: "cleanedImageUrl",
      value: item.cleanedImageUrl,
      hasTransparency: true,
    },
  ];

  const refinedCandidates: ImageCandidate[] = [
    {
      source: "refinedImageUrl",
      field: item.refinedImageUrl ? "refinedImageUrl" : "productPolish.refinedImageUrl",
      value: refinedImageUrl,
      hasTransparency: isLikelyTransparentUrl(refinedImageUrl),
    },
    {
      source: "photos.refinedUrl",
      field: item.photos?.refinedUrl
        ? "photos.refinedUrl"
        : item.photos?.productPolish?.refinedImageUrl
          ? "photos.productPolish.refinedImageUrl"
          : "images.refinedUrl",
      value: photosRefinedUrl,
      hasTransparency: isLikelyTransparentUrl(photosRefinedUrl),
    },
  ];

  const cutoutCandidates: ImageCandidate[] = [
    ["photos.normalizedUrl", item.photos?.normalizedUrl],
    ["normalizedUrl", item.normalizedUrl],
    ["images.cleanedUrl", primary?.cleanedUrl],
    ["photos.previewUrl", item.photos?.previewUrl],
    ["photos.cleanedUrl", item.photos?.cleanedUrl],
    ["cleanedUrl", item.cleanedUrl],
    ["photos.cleanedPhotoUrl", item.photos?.cleanedPhotoUrl],
    ["cleanedPhotoUrl", item.cleanedPhotoUrl],
    ["photos.cleanedThumbUrl", item.photos?.cleanedThumbUrl],
    ["cleanedLocalUri", item.cleanedLocalUri],
  ].map(([field, value]) => ({
    source: "cutout" as const,
    field: String(field),
    value: value as string | null | undefined,
    hasTransparency: true,
  }));

  const originalCandidate: ImageCandidate = {
    source: "originalImageUrl",
    field: "originalImageUrl",
    value: item.originalImageUrl,
    hasTransparency: isLikelyTransparentUrl(item.originalImageUrl),
  };

  const photoFallbackCandidates: ImageCandidate[] = [
    ...sourceOriginalCandidates.map((value) => ({ field: "images.sourceOriginalUrl", value })),
    ...originalCandidates.map((value) => ({ field: "images.originalUrl", value })),
    { field: "photos.originalUrl", value: item.photos?.originalUrl },
    { field: "photos.primaryUrl", value: item.photos?.primaryUrl },
    { field: "photoUrl", value: item.photoUrl },
    { field: "image", value: item.image },
    { field: "imageUrl", value: item.imageUrl },
    { field: "photoUri", value: item.photoUri },
    { field: "pendingPhotoUri", value: item.pendingPhotoUri },
    { field: "photos.thumbUrl", value: item.photos?.thumbUrl },
    { field: "photos.croppedUrl", value: item.photos?.croppedUrl },
    ...(item.photos?.urls ?? []).map((value) => ({ field: "photos.urls", value })),
  ].map((candidate) => ({
    source: "photos[]" as const,
    field: candidate.field,
    value: candidate.value,
    hasTransparency: isLikelyTransparentUrl(candidate.value),
  }));

  return [
    ...layoutCropCandidatesFor(item),
    ...cleanedCandidates,
    ...refinedCandidates,
    ...cutoutCandidates,
    originalCandidate,
    ...photoFallbackCandidates,
  ];
}

function hasInvalidVisualDimensions(item: ResolvableItemImage | null | undefined) {
  const width =
    item?.visualNormalization?.contentWidthPct ??
    item?.visualNormalization?.contentBounds?.widthPct ??
    null;
  const height =
    item?.visualNormalization?.contentHeightPct ??
    item?.visualNormalization?.contentBounds?.heightPct ??
    null;
  if (width == null && height == null) return false;
  return (
    (typeof width === "number" && (!Number.isFinite(width) || width <= 0)) ||
    (typeof height === "number" && (!Number.isFinite(height) || height <= 0))
  );
}

function sanitizeLogData(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes("url") || lowerKey.includes("uri")) {
        return [key, { present: cleanString(value).length > 0, type: typeof value === "string" ? safeUriType(value) : typeof value }];
      }
      if (lowerKey.includes("uid") || lowerKey.includes("base64") || lowerKey.includes("prompt")) {
        return [key, "[redacted]"];
      }
      if (Array.isArray(value)) {
        return [key, value.slice(0, 12)];
      }
      if (typeof value === "string" && value.length > 180) {
        return [key, `${value.slice(0, 177)}...`];
      }
      return [key, value];
    }),
  );
}

function logImageResolverEvent(
  event: string,
  resolved: ResolvedItemImage,
  status: "success" | "failure" | "fallback" | "warning",
  data: Record<string, unknown> = {},
) {
  if (!AURA_DEBUG_IMAGES) return;
  const safeData = sanitizeLogData({
    event,
    status,
    surface: resolved.surface,
    variant: resolved.variant,
    selectedField: resolved.selectedField,
    selectedUriType: resolved.selectedUriType,
    fallbackChain: resolved.fallbackChain,
    fallbacksChecked: resolved.fallbacksChecked,
    availableFallbacks: resolved.availableFallbacks,
    fallbackActivated: resolved.fallbackActivated,
    hasCleanedImageUrl: resolved.hasCleanedImageUrl,
    hasRefinedImageUrl: resolved.hasRefinedImageUrl,
    hasPhotosRefinedUrl: resolved.hasPhotosRefinedUrl,
    hasCutoutImage: resolved.hasCutoutImage,
    hasOriginalImageUrl: resolved.hasOriginalImageUrl,
    hasTransparency: resolved.hasTransparency,
    ...data,
  });
  console.log(
    `[AURA ImageResolver] item=${resolved.itemId ?? "unknown"} trace=${resolved.traceId ?? "none"} surface=${resolved.surface} selected=${resolved.selectedSource} fallbacksChecked=${JSON.stringify(resolved.fallbacksChecked)} hasTransparency=${String(resolved.hasTransparency)} data=${JSON.stringify(safeData)}`,
  );
}

export function resolveItemImage(
  item: ResolvableItemImage | null | undefined,
  options: {
    variant?: ResolveItemImageVariant;
    surface?: ResolveItemImageSurface;
    log?: boolean;
  } = {},
): ResolvedItemImage {
  const variant = options.variant ?? "thumb";
  const surface = options.surface ?? "unknown";
  const candidates = item ? buildCandidates(item) : [];
  const fallbackChain = isOutfitLayoutReconstructionItem(item) ? LAYOUT_FALLBACK_CHAIN : FALLBACK_CHAIN;
  const selected = firstValidCandidate(candidates);
  const selectedSource = selected?.candidate.source ?? "missing";
  const selectedPriorityIndex = fallbackChain.indexOf(selectedSource);
  const fallbacksChecked =
    selected && selectedPriorityIndex > 0 ? fallbackChain.slice(0, selectedPriorityIndex) : [];
  const availableFallbacks = selected
    ? uniqueSources(
        candidates
          .slice(selected.index + 1)
          .filter((candidate) => isResolvableImageUrl(candidate.value))
          .map((candidate) => candidate.source),
      )
    : [];
  const cutoutCandidates = candidates.filter((candidate) => candidate.source === "cutout");
  const resolved: ResolvedItemImage = {
    uri: selected?.uri ?? null,
    itemId: itemIdForLog(item),
    traceId: traceIdForItem(item),
    selectedSource,
    selectedField: selected?.candidate.field ?? null,
    variant,
    surface,
    fallbackChain,
    fallbacksChecked,
    availableFallbacks,
    fallbackActivated: selectedPriorityIndex > 0,
    hasCleanedImageUrl: isResolvableImageUrl(item?.cleanedImageUrl),
    hasRefinedImageUrl: isResolvableImageUrl(item?.refinedImageUrl ?? item?.productPolish?.refinedImageUrl),
    hasPhotosRefinedUrl: isResolvableImageUrl(item?.photos?.refinedUrl ?? item?.photos?.productPolish?.refinedImageUrl),
    hasCutoutImage: hasValidCandidate(cutoutCandidates),
    hasOriginalImageUrl: isResolvableImageUrl(item?.originalImageUrl),
    hasTransparency:
      selected?.candidate.hasTransparency ??
      isLikelyTransparentUrl(selected?.uri) ??
      (item?.backgroundRemovalMethod === "client" || item?.backgroundRemovalMethod === "server" ? true : null),
    selectedUriType: selected?.uri ? safeUriType(selected.uri) : "missing",
  };

  if (options.log !== false) {
    logImageResolverEvent(
      resolved.uri ? "resolved" : "missing_url",
      resolved,
      resolved.uri ? "success" : "warning",
    );
    if (resolved.fallbackActivated) {
      logImageResolverEvent("fallback_activated", resolved, "fallback");
    }
    if (hasInvalidVisualDimensions(item)) {
      logImageResolverEvent("invalid_dimensions", resolved, "warning", {
        contentWidthPct:
          item?.visualNormalization?.contentWidthPct ??
          item?.visualNormalization?.contentBounds?.widthPct ??
          null,
        contentHeightPct:
          item?.visualNormalization?.contentHeightPct ??
          item?.visualNormalization?.contentBounds?.heightPct ??
          null,
      });
    }
  }

  return resolved;
}

export function logResolvedItemImageLoadFailure(
  resolved: ResolvedItemImage,
  data: Record<string, unknown> = {},
) {
  logImageResolverEvent("load_failure", resolved, "failure", data);
}

export function logResolvedItemImageInvalidDimensions(
  resolved: ResolvedItemImage,
  dimensions: { width?: number | null; height?: number | null },
) {
  const width = Number(dimensions.width);
  const height = Number(dimensions.height);
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) return;
  logImageResolverEvent("invalid_dimensions", resolved, "warning", {
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
  });
}

export function itemImageSourceBadgeLabel(resolved: ResolvedItemImage | null | undefined) {
  switch (resolved?.selectedSource) {
    case "cleanedImageUrl":
    case "cutout":
      return "Cleaned";
    case "refinedImageUrl":
    case "photos.refinedUrl":
      return "Refined";
    case "originalImageUrl":
      return "Original";
    case "photos[]":
      return "Fallback";
    default:
      return "Missing";
  }
}
