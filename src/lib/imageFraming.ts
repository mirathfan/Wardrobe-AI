import type { AppImageResizeMode } from "@/src/components/common/AppImage";
import type { ResolvedItemImage } from "@/src/lib/resolveItemImage";

export type FramedImageKind = "transparent_cutout" | "polished_product" | "raw_crop";
export type FramedImageStrategy =
  | "square_centered"
  | "tall_centered"
  | "wide_centered"
  | "accessory_tight";
export type ImageFramingSurface =
  | "closet_grid"
  | "item_detail"
  | "item_detail_modal"
  | "outfit_extraction_review";

type FrameableItem = {
  id?: string | null;
  itemId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
  imageSource?: string | null;
  cutoutSourceKind?: string | null;
  source?: string | null;
  extractionMethod?: string | null;
  layoutCropUrl?: string | null;
  backgroundRemovalMethod?: string | null;
  cleanedImageUrl?: string | null;
  refinedImageUrl?: string | null;
  productPolish?: {
    status?: string | null;
    refinedImageUrl?: string | null;
  } | null;
  photos?: {
    imageSource?: string | null;
    cutoutSourceKind?: string | null;
    layoutCropUrl?: string | null;
    extractionMethod?: string | null;
    refinedUrl?: string | null;
    cleanedUrl?: string | null;
    cleanedPhotoUrl?: string | null;
    productPolish?: {
      status?: string | null;
      refinedImageUrl?: string | null;
    } | null;
  } | null;
  extractionQuality?: {
    rawCropFallback?: boolean | null;
  } | null;
  outfitExtraction?: {
    imageSource?: string | null;
    extractionMethod?: string | null;
    layoutCropUrl?: string | null;
    extractionQuality?: {
      rawCropFallback?: boolean | null;
    } | null;
  } | null;
};

export type ImageFramingDecision = {
  imageKind: FramedImageKind;
  recommendedResizeMode: AppImageResizeMode;
  recommendedPadding: number;
  shouldUseWhiteTrim: boolean;
  strategy: FramedImageStrategy;
  scale: number;
  translateY: number;
  backgroundColor?: string;
  imageStyle: {
    transform: ({ scale: number } | { translateY: number })[];
  };
};

const AURA_DEBUG_IMAGE_FRAMING =
  __DEV__ &&
  (process.env.EXPO_PUBLIC_AURA_DEBUG_IMAGES === "true" ||
    process.env.EXPO_PUBLIC_AURA_DEBUG_FRAMING === "true" ||
    (globalThis as any).AURA_DEBUG_IMAGES === true ||
    (globalThis as any).AURA_DEBUG_FRAMING === true);
const loggedFramingKeys = new Set<string>();

function token(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function joinedCategory(item?: FrameableItem | null) {
  return [item?.category, item?.subCategory, item?.type].map(token).filter(Boolean).join(" ");
}

function itemId(item?: FrameableItem | null, resolved?: ResolvedItemImage | null) {
  return token(item?.id) || token(item?.itemId) || token(resolved?.itemId) || "unknown";
}

function hasText(value: unknown, pattern: RegExp) {
  return pattern.test(token(value));
}

function isOutfitLayoutReconstructionItem(item?: FrameableItem | null) {
  return token(item?.imageSource) === "outfit layout reconstruction";
}

function hasLayoutCropSignal(item?: FrameableItem | null) {
  return (
    Boolean(item?.layoutCropUrl || item?.photos?.layoutCropUrl || item?.outfitExtraction?.layoutCropUrl) ||
    hasText(item?.extractionMethod, /layout.*crop/) ||
    hasText(item?.photos?.extractionMethod, /layout.*crop/) ||
    hasText(item?.outfitExtraction?.extractionMethod, /layout.*crop/)
  );
}

function inferStrategy(item?: FrameableItem | null): FramedImageStrategy {
  const category = joinedCategory(item);
  if (/(jeans|pants|trousers|denim|skirt|shorts|bottom|dress|jumpsuit|romper|one piece)/.test(category)) {
    return "tall_centered";
  }
  if (/(shoe|sneaker|boot|loafer|heel|footwear|slide)/.test(category)) {
    return "wide_centered";
  }
  if (/(watch|necklace|bracelet|ring|earring|glasses|sunglasses|belt|bag|hat|cap|accessor)/.test(category)) {
    return "accessory_tight";
  }
  return "square_centered";
}

function isRawCrop(item?: FrameableItem | null, resolved?: ResolvedItemImage | null) {
  return (
    item?.extractionQuality?.rawCropFallback === true ||
    item?.outfitExtraction?.extractionQuality?.rawCropFallback === true ||
    resolved?.selectedSource === "originalImageUrl" ||
    resolved?.selectedSource === "photos[]"
  );
}

function isPolished(item?: FrameableItem | null, resolved?: ResolvedItemImage | null) {
  const layoutReconstruction = isOutfitLayoutReconstructionItem(item);
  return (
    resolved?.selectedSource === "refinedImageUrl" ||
    resolved?.selectedSource === "photos.refinedUrl" ||
    hasText(item?.source, /outfit extraction|product polish/) ||
    (layoutReconstruction && hasText(item?.source, /outfit layout|layout reconstruction/)) ||
    hasText(item?.imageSource, /polished/) ||
    layoutReconstruction ||
    hasText(item?.photos?.imageSource, /polished/) ||
    hasText(item?.cutoutSourceKind, /polished/) ||
    hasText(item?.photos?.cutoutSourceKind, /polished/) ||
    hasText(item?.productPolish?.status, /applied/) ||
    hasText(item?.photos?.productPolish?.status, /applied/) ||
    Boolean(item?.refinedImageUrl || item?.productPolish?.refinedImageUrl || item?.photos?.refinedUrl)
  );
}

function isLayoutCrop(item?: FrameableItem | null) {
  return isOutfitLayoutReconstructionItem(item) && hasLayoutCropSignal(item);
}

function inferKind(item?: FrameableItem | null, resolved?: ResolvedItemImage | null): FramedImageKind {
  if (isRawCrop(item, resolved)) return "raw_crop";
  if (
    resolved?.hasTransparency === true ||
    resolved?.selectedSource === "cleanedImageUrl" ||
    resolved?.selectedSource === "cutout" ||
    hasText(item?.backgroundRemovalMethod, /client|server/) ||
    Boolean(item?.cleanedImageUrl || item?.photos?.cleanedUrl || item?.photos?.cleanedPhotoUrl)
  ) {
    return "transparent_cutout";
  }
  if (isPolished(item, resolved)) return "polished_product";
  return "raw_crop";
}

function paddingFor(kind: FramedImageKind, strategy: FramedImageStrategy) {
  if (kind === "raw_crop") return 0;
  if (kind === "polished_product") {
    return 0;
  }
  if (strategy === "tall_centered") return 0.08;
  if (strategy === "wide_centered") return 0.09;
  if (strategy === "accessory_tight") return 0.08;
  return 0.1;
}

function surfaceScaleMultiplier(surface: ImageFramingSurface) {
  if (surface === "item_detail_modal") return 0.9;
  if (surface === "item_detail") return 0.94;
  if (surface === "outfit_extraction_review") return 0.96;
  return 1;
}

function scaleFor(kind: FramedImageKind, strategy: FramedImageStrategy, surface: ImageFramingSurface) {
  const multiplier = surfaceScaleMultiplier(surface);
  if (kind === "raw_crop") return surface === "closet_grid" ? 1.03 : 1;
  if (kind === "polished_product") {
    if (strategy === "tall_centered") return 1.28 * multiplier;
    if (strategy === "wide_centered") return 1.3 * multiplier;
    if (strategy === "accessory_tight") return 1.42 * multiplier;
    return 1.32 * multiplier;
  }
  if (strategy === "tall_centered") return 1.1 * multiplier;
  if (strategy === "wide_centered") return 1.12 * multiplier;
  if (strategy === "accessory_tight") return 1.22 * multiplier;
  return 1.1 * multiplier;
}

function translateYFor(kind: FramedImageKind, strategy: FramedImageStrategy) {
  if (kind === "polished_product" && strategy === "tall_centered") return -2;
  if (kind === "polished_product" && strategy === "square_centered") return -2;
  if (strategy === "tall_centered") return -1;
  if (strategy === "wide_centered") return 1;
  if (strategy === "accessory_tight") return 0;
  return -1;
}

function logImageFraming(item: FrameableItem | null | undefined, decision: ImageFramingDecision, resolved?: ResolvedItemImage | null) {
  if (!AURA_DEBUG_IMAGE_FRAMING) return;
  const key = `${itemId(item, resolved)}:${decision.imageKind}:${decision.strategy}:${decision.recommendedResizeMode}:${Math.round(decision.recommendedPadding * 100)}`;
  if (loggedFramingKeys.has(key)) return;
  loggedFramingKeys.add(key);
  console.info(
    `[AURA ImageFraming] item=${itemId(item, resolved)} kind=${decision.imageKind} category=${token(item?.category) || "unknown"} strategy=${decision.strategy} padding=${Math.round(decision.recommendedPadding * 100)}`,
  );
}

export function getImageFraming(
  item?: FrameableItem | null,
  resolved?: ResolvedItemImage | null,
  options: { surface?: ImageFramingSurface } = {},
): ImageFramingDecision {
  const imageKind = inferKind(item, resolved);
  const strategy = inferStrategy(item);
  const surface = options.surface ?? "closet_grid";
  const sourceAwareLayoutCrop = isLayoutCrop(item);
  const layoutSignalSkipped = hasLayoutCropSignal(item) && !isOutfitLayoutReconstructionItem(item);
  const recommendedPadding = sourceAwareLayoutCrop
    ? strategy === "accessory_tight"
      ? 0.04
      : 0.05
    : paddingFor(imageKind, strategy);
  const scale = sourceAwareLayoutCrop ? 1 : scaleFor(imageKind, strategy, surface);
  const translateY = sourceAwareLayoutCrop ? 0 : translateYFor(imageKind, strategy);
  const decision: ImageFramingDecision = {
    imageKind,
    strategy,
    recommendedPadding,
    recommendedResizeMode: imageKind === "transparent_cutout" || sourceAwareLayoutCrop ? "contain" : "cover",
    shouldUseWhiteTrim: imageKind === "polished_product",
    scale,
    translateY,
    backgroundColor: imageKind === "polished_product" || sourceAwareLayoutCrop ? "#FFFFFF" : undefined,
    imageStyle: {
      transform: [{ translateY }, { scale }],
    },
  };
  if (AURA_DEBUG_IMAGE_FRAMING && sourceAwareLayoutCrop) {
    console.info(
      `[AURA GridCrop] sourceAwareMode=layout_reconstruction item=${itemId(item, resolved)} category=${token(item?.category) || "unknown"}`,
    );
  } else if (AURA_DEBUG_IMAGE_FRAMING && layoutSignalSkipped) {
    console.info(
      `[AURA GridCrop] skippedForNormalClosetItem=true item=${itemId(item, resolved)} category=${token(item?.category) || "unknown"}`,
    );
  }
  logImageFraming(item, decision, resolved);
  return decision;
}

export function imageFramingPadding(size: number, decision: ImageFramingDecision) {
  if (!Number.isFinite(size) || size <= 0) return 0;
  return Math.round(size * decision.recommendedPadding);
}
