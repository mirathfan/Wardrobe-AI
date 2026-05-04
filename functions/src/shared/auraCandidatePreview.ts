import OpenAI from "openai";
import type { ProductExtraction } from "./productLinkExtractor";
import { redactUrlForLogs } from "./safeFetch";

const DEBUG_AURA_CANDIDATE_LOGS =
  process.env.DEBUG_AURA_CANDIDATE_LOGS === "1" ||
  process.env.DEBUG_AURA_CANDIDATE_LOGS === "true";
const PRODUCT_IMAGE_VISION_RANK_LIMIT = 8;

function debugAuraCandidateInfo(...args: Parameters<typeof console.info>) {
  if (DEBUG_AURA_CANDIDATE_LOGS) {
    console.info(...args);
  }
}

function debugAuraCandidateWarn(...args: Parameters<typeof console.warn>) {
  if (DEBUG_AURA_CANDIDATE_LOGS) {
    console.warn(...args);
  }
}

export type AuraCandidateItem = {
  candidateId: string;
  imageUrls: string[];
  primaryImageUrl?: string | null;
  secondaryImageUrls?: string[];
  title?: string | null;
  category?: string | null;
  subCategory?: string | null;
  color?: string | null;
  brand?: string | null;
  material?: string | null;
  materials?: string[];
  fit?: string | null;
  sleeveLength?: string | null;
  collar?: string | null;
  length?: string | null;
  pattern?: string | null;
  confidence?: number | null;
  retailPrice?: number | null;
  purchasePrice?: number | null;
  estimatedValue?: number | null;
  currency?: string | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  originalCurrency?: string | null;
  priceSource?: "product_link" | "manual" | "estimated" | null;
  priceDisplay?: string | null;
  price?: number | null;
  productUrl?: string | null;
  displayColor?: string | null;
  displayColors?: string[] | null;
  sizeOptions?: string[];
  availableSizes?: string[];
  careInstructions?: string[];
  productDescription?: string | null;
  graphicText?: string | null;
  motif?: string | null;
  collaborationName?: string | null;
  sourceType: "image" | "link" | "batch";
  sourceUrl?: string | null;
  status: "awaiting_confirmation" | "needs_review" | "added" | "cancelled" | "failed";
};

export type RankedProductImage = {
  url: string;
  score: number;
  sourceIndex: number;
  urlScore: number;
  reasons: string[];
  isGarmentOnly: boolean;
  isModelImage: boolean;
  isFrontFacing: boolean;
  hasFullProductVisible: boolean;
  isDetailCloseUp: boolean;
  isCropped: boolean;
  isThumbnail: boolean;
  isLifestyleOrBanner: boolean;
  isSideProfileFootwear?: boolean;
  isOverheadFootwear?: boolean;
  bucket?: ProductImageBucket;
};

type ProductImageBucket = "garment_only" | "model_editorial" | "detail_or_crop" | "unknown";

type RawProductImageRanking = {
  index: number;
  score: number;
  isGarmentOnly: boolean;
  isModelImage: boolean;
  isFrontFacing: boolean;
  hasFullProductVisible: boolean;
  isDetailCloseUp: boolean;
  isCropped: boolean;
  isThumbnail: boolean;
  isLifestyleOrBanner: boolean;
  isSideProfileFootwear: boolean;
  isOverheadFootwear: boolean;
  containsMultipleGarments: boolean;
  reasons: string[];
};

type UrlImageSignals = {
  score: number;
  reasons: string[];
  widthHint: number | null;
  detailPenalty: boolean;
  thumbnailPenalty: boolean;
  socialPenalty: boolean;
};

export function candidatePreviewResponse(candidates: AuraCandidateItem[]) {
  const needsReview = candidates.some((candidate) => candidate.status === "needs_review");
  const response = {
    presentation: "candidate_preview" as const,
    title: candidates.length === 1 ? "Review item" : "Review items",
    reply: needsReview
      ? "I couldn’t fully read this item — review before adding"
      : candidates.length === 1
        ? "I found this item. Want me to add it?"
        : `I found ${candidates.length} items. Review them before I add them.`,
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    chips: [],
    look: null,
    candidateItems: candidates,
    candidates,
  };
  debugAuraCandidateInfo("[AURA_CANDIDATE_BACKEND] preview payload created", {
    candidateCount: candidates.length,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    sourceTypes: candidates.map((candidate) => candidate.sourceType),
    hasCandidateItems: true,
    hasCandidatesAlias: true,
    keys: Object.keys(response),
  });
  return response;
}

export function fallbackImageCandidates(imageGroups: string[][]): AuraCandidateItem[] {
  const batch = imageGroups.length > 1;
  return imageGroups
    .filter((imageUrls) => imageUrls.length > 0)
    .map((imageUrls, index) =>
      cleanCandidate(
        {
          title: null,
          category: null,
          subCategory: null,
          color: null,
          brand: null,
          material: null,
          fit: null,
          pattern: null,
          confidence: null,
        },
        imageUrls,
        index,
        batch,
      ),
    );
}

export function candidatesFromProductExtractions(
  extractions: ProductExtraction[],
): AuraCandidateItem[] {
  return extractions.map((extraction, index) => {
    const titleHints = productCategoryHintsFromText(
      extraction.metadata.title,
      extraction.metadata.description,
    );
    const amount = extraction.metadata.priceAmount ?? null;
    const currency = extraction.metadata.priceCurrency ?? extraction.metadata.currency ?? null;
    const currentAmount =
      typeof extraction.metadata.salePrice === "number"
        ? extraction.metadata.salePrice
        : amount;
    const priceFields =
      typeof currentAmount === "number" && Number.isFinite(currentAmount)
        ? {
            retailPrice: currentAmount,
            purchasePrice: currentAmount,
            estimatedValue: currentAmount,
            currency,
            originalPrice: extraction.metadata.originalPrice ?? amount ?? currentAmount,
            salePrice: extraction.metadata.salePrice ?? null,
            originalCurrency: currency,
            priceSource: "product_link" as const,
            priceDisplay: extraction.metadata.priceDisplay ?? extraction.metadata.price ?? null,
            price: currentAmount,
          }
        : {};
    return {
      candidateId: `link-${Date.now()}-${index}`,
      imageUrls: extraction.imageUrls,
      primaryImageUrl: extraction.imageUrls[0] ?? null,
      secondaryImageUrls: extraction.imageUrls.slice(1),
      title: extraction.metadata.title ?? null,
      category: titleHints.category ?? extraction.metadata.categoryHints?.[0] ?? null,
      subCategory: titleHints.subCategory ?? extraction.metadata.categoryHints?.[1] ?? null,
      color: extraction.metadata.color ?? null,
      displayColor: extraction.metadata.displayColor ?? extraction.metadata.color ?? null,
      displayColors: extraction.metadata.displayColors ?? [],
      brand:
        extraction.status === "needs_review"
          ? extraction.metadata.brand ?? null
          : extraction.metadata.brand ?? extraction.metadata.retailer ?? null,
      material: extraction.metadata.material ?? null,
      materials: extraction.metadata.materials ?? [],
      fit: extraction.metadata.fit ?? null,
      sleeveLength: extraction.metadata.sleeveLength ?? null,
      collar: extraction.metadata.collar ?? null,
      length: extraction.metadata.length ?? null,
      pattern: extraction.metadata.pattern ?? null,
      sizeOptions: extraction.metadata.sizeOptions ?? [],
      availableSizes: extraction.metadata.availableSizes ?? extraction.metadata.sizeOptions ?? [],
      careInstructions: extraction.metadata.careInstructions ?? [],
      productDescription: extraction.metadata.productDescription ?? extraction.metadata.description ?? null,
      graphicText: extraction.metadata.graphicText ?? null,
      motif: extraction.metadata.motif ?? null,
      collaborationName: extraction.metadata.collaborationName ?? null,
      confidence: extraction.confidence ?? null,
      ...priceFields,
      sourceType: extractions.length > 1 ? "batch" : "link",
      sourceUrl: extraction.metadata.sourceUrl,
      productUrl: extraction.metadata.sourceUrl,
      status: extraction.status === "needs_review" ? "needs_review" : "awaiting_confirmation",
    };
  });
}

function imageDedupeKey(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^(imwidth|width|height|w|h|sw|sh|q|quality)$/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    const sortedSearch = Array.from(parsed.searchParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key.toLowerCase()}=${value.toLowerCase()}`)
      .join("&");
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.toLowerCase()}?${sortedSearch}`;
  } catch {
    return url.toLowerCase().replace(/([?&])(imwidth|width|height|w|h|sw|sh|q|quality)=\d+/gi, "$1");
  }
}

function imageDimensionHints(url: string) {
  const lower = url.toLowerCase();
  const values: number[] = [];
  try {
    const parsed = new URL(url);
    for (const key of ["imwidth", "width", "w", "sw", "height", "h", "sh"]) {
      const value = Number(parsed.searchParams.get(key) ?? 0);
      if (Number.isFinite(value) && value > 0) values.push(value);
    }
  } catch {
    // Fall back to path parsing below.
  }
  for (const dim of lower.matchAll(/(?:_|-|\/)(\d{2,4})(?:x|_|-)(\d{2,4})(?:[._/?-]|$)/g)) {
    values.push(Number(dim[1]), Number(dim[2]));
  }
  return values.filter((value) => Number.isFinite(value) && value > 0);
}

function urlImageSignals(url: string): UrlImageSignals {
  const lower = url.toLowerCase();
  const reasons: string[] = [];
  const dimensions = imageDimensionHints(url);
  const widthHint = dimensions.length ? Math.max(...dimensions) : null;
  let score = 0;

  if (/\.(jpe?g|png|webp)(\?|$)/i.test(lower)) {
    score += 8;
    reasons.push("image file extension");
  }
  if (/(product|pdp|gallery|main|model|packshot|studio|image|photo)/i.test(lower)) {
    score += 12;
    reasons.push("product/gallery URL hint");
  }
  if (/(clean|cutout|transparent|isolated|packshot|studio)/i.test(lower)) {
    score += 18;
    reasons.push("clean product image URL hint");
  }
  if (/image\.hm\.com$/i.test(safeHost(url))) {
    score += 10;
    reasons.push("H&M product image host");
  }
  if (widthHint) {
    if (widthHint >= 1000) {
      score += 18;
      reasons.push(`large image hint ${widthHint}px`);
    } else if (widthHint >= 700) {
      score += 12;
      reasons.push(`medium-large image hint ${widthHint}px`);
    } else if (widthHint < 220) {
      score -= 35;
      reasons.push(`thumbnail-sized image hint ${widthHint}px`);
    } else if (widthHint < 420) {
      score -= 12;
      reasons.push(`small image hint ${widthHint}px`);
    }
  }

  const detailPenalty = /(detail|close[-_ ]?up|zoom|macro|fabric|texture|material|crop|cropped|graphic|logo[-_ ]?shot|chest[-_ ]?graphic|print[-_ ]?detail)/i.test(lower);
  if (detailPenalty) {
    score -= 55;
    reasons.push("detail/close-up URL hint");
  }
  const thumbnailPenalty = /(thumb|thumbnail|small|swatch|colorchip|sprite|icon|favicon|placeholder|badge|payment|loader)/i.test(lower);
  if (thumbnailPenalty) {
    score -= 70;
    reasons.push("thumbnail/icon URL hint");
  }
  const socialPenalty = /(share|social|facebook|pinterest|banner|header|footer|hero|promo|campaign|lifestyle|editorial|nav|ui)/i.test(lower);
  if (socialPenalty) {
    score -= 45;
    reasons.push("social/banner URL hint");
  }

  return { score, reasons, widthHint, detailPenalty, thumbnailPenalty, socialPenalty };
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stableUniqueUrls(urls: string[]) {
  const byKey = new Map<string, { url: string; firstIndex: number; variantScore: number }>();
  urls
    .map((url, index) => ({ url: String(url ?? "").trim(), index }))
    .filter((entry) => !!entry.url && !/\s/.test(entry.url))
    .forEach((entry) => {
      const key = imageDedupeKey(entry.url);
      const signals = urlImageSignals(entry.url);
      const variantScore = (signals.widthHint ?? 0) + signals.score;
      const existing = byKey.get(key);
      if (
        !existing ||
        variantScore > existing.variantScore ||
        (variantScore === existing.variantScore && entry.url.localeCompare(existing.url) < 0)
      ) {
        byKey.set(key, {
          url: entry.url,
          firstIndex: existing?.firstIndex ?? entry.index,
          variantScore,
        });
      }
    });
  return Array.from(byKey.values())
    .sort((a, b) => a.firstIndex - b.firstIndex || a.url.localeCompare(b.url))
    .map((entry) => entry.url);
}

function productImageReasonText(result: RawProductImageRanking | undefined) {
  return (result?.reasons ?? []).join(" ").toLowerCase();
}

function productImageReasonSuggestsModel(result: RawProductImageRanking | undefined) {
  const text = productImageReasonText(result).replace(
    /\b(no visible|without|no)\s+(person|model|human|body|torso|leg|arm|head)s?\b/g,
    "",
  );
  return /\b(model|person|human|wearing|worn|body|torso|leg|arm|head|full[-\s]?body|editorial)\b/.test(
    text,
  );
}

function productImageReasonSuggestsGarmentOnly(result: RawProductImageRanking | undefined) {
  return /\b(garment[-\s]?only|product[-\s]?only|standalone|isolated|flat[-\s]?lay|plain background|studio product|no visible (person|model|human))\b/.test(
    productImageReasonText(result),
  );
}

function productImageReasonSuggestsDetailOrCrop(result: RawProductImageRanking | undefined) {
  return /\b(detail|close[-\s]?up|fabric|texture|material|zoom|macro|cropped|crop|partial|logo only|graphic only|chest graphic|print detail|not full|not fully visible|cut off|thumbnail|banner|social|lifestyle)\b/.test(
    productImageReasonText(result),
  );
}

function productImageBucket(result: RawProductImageRanking | undefined): ProductImageBucket {
  if (
    result?.isDetailCloseUp ||
    result?.isCropped ||
    result?.isThumbnail ||
    result?.isLifestyleOrBanner ||
    productImageReasonSuggestsDetailOrCrop(result)
  ) {
    return "detail_or_crop";
  }
  if (result?.isModelImage || productImageReasonSuggestsModel(result)) return "model_editorial";
  if (result?.isGarmentOnly || productImageReasonSuggestsGarmentOnly(result)) return "garment_only";
  return "unknown";
}

function productImageScore(params: {
  result: RawProductImageRanking | undefined;
  bucket: ProductImageBucket;
  url: string;
  isFootwearProduct?: boolean;
}) {
  const { result, bucket, url, isFootwearProduct } = params;
  const baseScore = Math.max(0, Math.min(100, Number(result?.score ?? 20)));
  const signals = urlImageSignals(url);
  let score = baseScore + signals.score;
  if (result?.hasFullProductVisible) score += 80;
  if (result?.isFrontFacing) score += 24;
  if (result?.isGarmentOnly) score += 40;
  if (result?.isModelImage) score += result?.hasFullProductVisible ? 0 : -24;
  if (!result?.hasFullProductVisible) score -= 55;
  if (result?.containsMultipleGarments) score -= 38;
  if (result?.isDetailCloseUp || signals.detailPenalty) score -= 120;
  if (result?.isCropped) score -= 95;
  if (result?.isThumbnail || signals.thumbnailPenalty) score -= 120;
  if (result?.isLifestyleOrBanner || signals.socialPenalty) score -= 90;
  if (bucket === "garment_only") score += 44;
  if (bucket === "model_editorial") score += result?.hasFullProductVisible ? 0 : -42;
  if (bucket === "detail_or_crop") score -= 120;
  if (isFootwearProduct) {
    const usableFootwearProductImage =
      result?.hasFullProductVisible &&
      !result?.isDetailCloseUp &&
      !result?.isCropped &&
      !result?.isThumbnail &&
      !result?.isLifestyleOrBanner;
    if (usableFootwearProductImage && result?.isSideProfileFootwear) {
      score += 170;
    }
    if (usableFootwearProductImage && result?.isOverheadFootwear) {
      score -= 80;
    }
  }
  return score;
}

function sortProductImages(items: RankedProductImage[]) {
  return [...items].sort(
    (a, b) =>
      b.score - a.score ||
      b.urlScore - a.urlScore ||
      a.sourceIndex - b.sourceIndex ||
      a.url.localeCompare(b.url),
  );
}

function selectVisionRankCandidates(items: RankedProductImage[]) {
  return orderProductImageBuckets(items)
    .filter((item) => item.bucket !== "detail_or_crop" && !item.isThumbnail && !item.isLifestyleOrBanner)
    .slice(0, PRODUCT_IMAGE_VISION_RANK_LIMIT);
}

function logProductImageRankingMetrics(params: {
  sourceUrl?: string | null;
  extractedImageCount: number;
  dedupedImageCount: number;
  visionRankedImageCount: number;
  selected: RankedProductImage | undefined;
  selectedReason: string;
}) {
  console.info("[LINK_IMAGE_RANKING_METRICS]", {
    sourceUrl: redactUrlForLogs(params.sourceUrl),
    extractedImageCount: params.extractedImageCount,
    dedupedImageCount: params.dedupedImageCount,
    visionRankedImageCount: params.visionRankedImageCount,
    selectedPrimaryImageUrl: redactUrlForLogs(params.selected?.url),
    selectedPrimaryBucket: params.selected?.bucket ?? null,
    selectedPrimaryScore: params.selected?.score ?? null,
    selectedPrimaryReason: params.selectedReason,
  });
}

function orderProductImageBuckets(items: RankedProductImage[]) {
  const garmentOnly = items.filter((item) => item.bucket === "garment_only");
  const modelEditorial = items.filter((item) => item.bucket === "model_editorial");
  const detailOrCrop = items.filter((item) => item.bucket === "detail_or_crop");
  const unknown = items.filter((item) => item.bucket === "unknown");

  if (garmentOnly.length > 0) {
    return [
      ...sortProductImages(garmentOnly),
      ...sortProductImages(unknown),
      ...sortProductImages(modelEditorial),
      ...sortProductImages(detailOrCrop),
    ];
  }

  return [
    ...sortProductImages([...modelEditorial, ...unknown]),
    ...sortProductImages(detailOrCrop),
  ];
}

function logProductImageBuckets(params: {
  sourceUrl?: string | null;
  items: RankedProductImage[];
}) {
  const buckets: Record<ProductImageBucket, string[]> = {
    garment_only: [],
    model_editorial: [],
    detail_or_crop: [],
    unknown: [],
  };
  for (const item of params.items) {
    buckets[item.bucket ?? "unknown"].push(item.url);
  }
  debugAuraCandidateInfo("[LINK_PRIMARY_BUCKETS]", {
    sourceUrl: params.sourceUrl ?? null,
    garmentOnlyCount: buckets.garment_only.length,
    modelEditorialCount: buckets.model_editorial.length,
    detailOrCropCount: buckets.detail_or_crop.length,
    unknownCount: buckets.unknown.length,
    garmentOnlyUrls: buckets.garment_only,
    modelEditorialUrls: buckets.model_editorial,
    detailOrCropUrls: buckets.detail_or_crop,
    unknownUrls: buckets.unknown,
  });
  debugAuraCandidateInfo("[LINK_IMAGE_BUCKETS]", {
    sourceUrl: params.sourceUrl ?? null,
    garmentOnlyCount: buckets.garment_only.length,
    modelEditorialCount: buckets.model_editorial.length,
    detailOrCropCount: buckets.detail_or_crop.length,
    unknownCount: buckets.unknown.length,
    garmentOnlyUrls: buckets.garment_only,
    modelEditorialUrls: buckets.model_editorial,
    detailOrCropUrls: buckets.detail_or_crop,
    unknownUrls: buckets.unknown,
  });
}

function rankedImageFromUrlOnly(url: string, sourceIndex: number): RankedProductImage {
  const signals = urlImageSignals(url);
  const bucket: ProductImageBucket =
    signals.detailPenalty || signals.thumbnailPenalty || signals.socialPenalty
      ? "detail_or_crop"
      : "unknown";
  const score =
    20 +
    signals.score -
    (signals.detailPenalty ? 120 : 0) -
    (signals.thumbnailPenalty ? 120 : 0) -
    (signals.socialPenalty ? 90 : 0);
  return {
    url,
    sourceIndex,
    urlScore: signals.score,
    score,
    reasons: signals.reasons.length ? signals.reasons : ["URL heuristic only"],
    isGarmentOnly: false,
    isModelImage: false,
    isFrontFacing: false,
    hasFullProductVisible: false,
    isDetailCloseUp: signals.detailPenalty,
    isCropped: signals.detailPenalty,
    isThumbnail: signals.thumbnailPenalty,
    isLifestyleOrBanner: signals.socialPenalty,
    bucket,
  };
}

function logRankedProductImages(params: {
  sourceUrl?: string | null;
  items: RankedProductImage[];
  selected: RankedProductImage | undefined;
}) {
  debugAuraCandidateInfo("[LINK_IMAGE_RANKING_SUMMARY]", {
    sourceUrl: params.sourceUrl ?? null,
    selectedPrimaryImageUrl: params.selected?.url ?? null,
    selectedScore: params.selected?.score ?? null,
    selectedReasons: params.selected?.reasons ?? [],
    rankings: params.items.map((item) => ({
      sourceIndex: item.sourceIndex,
      url: item.url,
      score: item.score,
      urlScore: item.urlScore,
      bucket: item.bucket ?? "unknown",
      isGarmentOnly: item.isGarmentOnly,
      isModelImage: item.isModelImage,
      isFrontFacing: item.isFrontFacing,
      hasFullProductVisible: item.hasFullProductVisible,
      isDetailCloseUp: item.isDetailCloseUp,
      isCropped: item.isCropped,
      isThumbnail: item.isThumbnail,
      isLifestyleOrBanner: item.isLifestyleOrBanner,
      isSideProfileFootwear: item.isSideProfileFootwear ?? false,
      isOverheadFootwear: item.isOverheadFootwear ?? false,
      reasons: item.reasons,
    })),
  });
}

function isFootwearProductText(title?: string | null, description?: string | null) {
  const hints = productCategoryHintsFromText(title, description);
  if (hints.category === "footwear") return true;
  return /\b(air force|jordan|dunk|shoe|shoes|sneaker|sneakers|trainer|trainers|boot|boots|loafer|loafers|sandal|sandals|footwear)\b/i.test(
    `${title ?? ""} ${description ?? ""}`,
  );
}

export async function rankProductLinkImages(params: {
  client: OpenAI;
  imageUrls: string[];
  title?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
}): Promise<RankedProductImage[]> {
  const extractedImageCount = params.imageUrls.length;
  const imageUrls = stableUniqueUrls(params.imageUrls).slice(0, 24);
  const isFootwearProduct = isFootwearProductText(params.title, params.description);
  const urlOnlyRanked = imageUrls.map((url, index) => rankedImageFromUrlOnly(url, index));
  const visionRankCandidates = selectVisionRankCandidates(urlOnlyRanked);
  debugAuraCandidateInfo("[LINK_IMAGE_CANDIDATES]", {
    sourceUrl: params.sourceUrl ?? null,
    candidateCount: imageUrls.length,
    urls: imageUrls,
    title: params.title ?? null,
    isFootwearProduct,
  });
  if (imageUrls.length <= 1) {
    const ranked = imageUrls.map((url, index) => ({
      ...rankedImageFromUrlOnly(url, index),
      score: 50 + urlImageSignals(url).score,
      reasons: ["only image candidate", ...urlImageSignals(url).reasons],
    }));
    logProductImageBuckets({ sourceUrl: params.sourceUrl, items: ranked });
    logRankedProductImages({
      sourceUrl: params.sourceUrl,
      items: ranked,
      selected: ranked[0],
    });
    logProductImageRankingMetrics({
      sourceUrl: params.sourceUrl,
      extractedImageCount,
      dedupedImageCount: imageUrls.length,
      visionRankedImageCount: 0,
      selected: ranked[0],
      selectedReason: ranked[0]?.reasons[0] ?? "only image candidate",
    });
    debugAuraCandidateInfo("[LINK_PRIMARY_CHOSEN]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      bucket: ranked[0]?.bucket ?? null,
      score: ranked[0]?.score ?? null,
      reasons: ranked[0]?.reasons ?? [],
      garmentOnlyAvailable: ranked.some((item) => item.bucket === "garment_only"),
    });
    debugAuraCandidateInfo("[LINK_IMAGE_PRIMARY]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      primaryReasons: ranked[0]?.reasons ?? [],
      primaryIsGarmentOnly: ranked[0]?.isGarmentOnly ?? false,
    });
    debugAuraCandidateInfo("[LINK_IMAGE_SECONDARY]", {
      sourceUrl: params.sourceUrl ?? null,
      secondaryImageUrls: ranked.slice(1).map((item) => item.url),
    });
    return ranked;
  }

  if (!visionRankCandidates.length) {
    const ranked = orderProductImageBuckets(urlOnlyRanked);
    logProductImageBuckets({ sourceUrl: params.sourceUrl, items: ranked });
    logRankedProductImages({
      sourceUrl: params.sourceUrl,
      items: ranked,
      selected: ranked[0],
    });
    logProductImageRankingMetrics({
      sourceUrl: params.sourceUrl,
      extractedImageCount,
      dedupedImageCount: imageUrls.length,
      visionRankedImageCount: 0,
      selected: ranked[0],
      selectedReason: ranked[0]?.reasons[0] ?? "URL heuristic only",
    });
    return ranked;
  }

  try {
    const response = await params.client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "developer",
          content:
            "Rank retail product images for wardrobe item ingestion. Prefer a clean garment-only/product-only packshot over model/editorial images when both clearly show the product. The primary wardrobe image should show the complete target garment/product clearly. For footwear, if a clean side/lateral profile product photo of the shoe is available, prefer it as primary over top-down, overhead, pair, sole, or detail views. A side/lateral footwear profile is a horizontal shoe image from the side, often toe pointing left or right; only prefer it when the full shoe is visible and it is not cropped. Penalize detail crops, fabric/texture shots, zoomed logos or chest graphics, thumbnails, banners, social previews, and lifestyle images where the item is not the clear product. A garment-only/product-only image has no visible person, model, limbs, head, torso, mannequin, or full outfit; it is usually a standalone garment on a plain studio background or flat lay. Any image with a person wearing the item, even if the target product is visible, is model/editorial. A full clean model shot is better than a cropped detail close-up only when no garment-only/product-only packshot is available. If the title says shirt, shorts, jeans, or another specific garment, a full-body model wearing other garments is not garment-only.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Product title: ${params.title ?? "unknown"}\n` +
                `Description: ${params.description ?? "unknown"}\n` +
                "For each image index, score 0-100 for usefulness as the primary wardrobe item image and classify whether it is garment-only/product-only, model/editorial, front-facing/canonical, whether the full target product is visible, whether it is a footwear side/lateral profile view, whether it is a footwear overhead/top-down view, whether it is a detail close-up, cropped/partial, thumbnail, social/banner/lifestyle image, and whether it contains multiple visible garments. Return JSON only.",
            },
            ...visionRankCandidates.flatMap((item) => [
              {
                type: "input_text" as const,
                text: `Image index ${item.sourceIndex}: ${redactUrlForLogs(item.url)}`,
              },
              {
                type: "input_image" as const,
                image_url: item.url,
                detail: "low" as const,
              },
            ]),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "product_image_ranking",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              rankings: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    index: { type: "number" },
                    score: { type: "number" },
                    isGarmentOnly: { type: "boolean" },
                    isModelImage: { type: "boolean" },
                    isFrontFacing: { type: "boolean" },
                    hasFullProductVisible: { type: "boolean" },
                    isDetailCloseUp: { type: "boolean" },
                    isCropped: { type: "boolean" },
                    isThumbnail: { type: "boolean" },
                    isLifestyleOrBanner: { type: "boolean" },
                    isSideProfileFootwear: { type: "boolean" },
                    isOverheadFootwear: { type: "boolean" },
                    containsMultipleGarments: { type: "boolean" },
                    reasons: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: [
                    "index",
                    "score",
                    "isGarmentOnly",
                    "isModelImage",
                    "isFrontFacing",
                    "hasFullProductVisible",
                    "isDetailCloseUp",
                    "isCropped",
                    "isThumbnail",
                    "isLifestyleOrBanner",
                    "isSideProfileFootwear",
                    "isOverheadFootwear",
                    "containsMultipleGarments",
                    "reasons",
                  ],
                },
              },
            },
            required: ["rankings"],
          },
        },
      },
    });
    const parsed = JSON.parse(String(response.output_text || "{}")) as {
      rankings?: {
        index: number;
        score: number;
        isGarmentOnly: boolean;
        isModelImage: boolean;
        isFrontFacing: boolean;
        hasFullProductVisible: boolean;
        isDetailCloseUp: boolean;
        isCropped: boolean;
        isThumbnail: boolean;
        isLifestyleOrBanner: boolean;
        isSideProfileFootwear: boolean;
        isOverheadFootwear: boolean;
        containsMultipleGarments: boolean;
        reasons: string[];
      }[];
    };
    const byIndex = new Map((parsed.rankings ?? []).map((entry) => [Math.trunc(entry.index), entry]));
    const urlOnlyByIndex = new Map(urlOnlyRanked.map((entry) => [entry.sourceIndex, entry]));
    const scored = imageUrls.map((url, index) => {
      const result = byIndex.get(index);
      if (!result) {
        const fallback = urlOnlyByIndex.get(index) ?? rankedImageFromUrlOnly(url, index);
        return {
          ...fallback,
          reasons: Array.from(new Set(["URL pre-rank only", ...fallback.reasons])),
        };
      }
      const signals = urlImageSignals(url);
      const bucket =
        signals.detailPenalty || signals.thumbnailPenalty || signals.socialPenalty
          ? "detail_or_crop"
          : productImageBucket(result);
      const score = productImageScore({ result, bucket, url, isFootwearProduct });
      const combinedReasons = [
        ...(result?.reasons?.slice(0, 4) ?? ["not ranked by model"]),
        ...signals.reasons.slice(0, 3),
      ];
      const item = {
        url,
        sourceIndex: index,
        urlScore: signals.score,
        score,
        reasons: Array.from(new Set(combinedReasons)),
        isGarmentOnly: !!result?.isGarmentOnly,
        isModelImage: !!result?.isModelImage,
        isFrontFacing: !!result?.isFrontFacing,
        hasFullProductVisible: !!result?.hasFullProductVisible,
        isDetailCloseUp: !!result?.isDetailCloseUp || signals.detailPenalty,
        isCropped: !!result?.isCropped,
        isThumbnail: !!result?.isThumbnail || signals.thumbnailPenalty,
        isLifestyleOrBanner: !!result?.isLifestyleOrBanner || signals.socialPenalty,
        isSideProfileFootwear: !!result?.isSideProfileFootwear,
        isOverheadFootwear: !!result?.isOverheadFootwear,
        bucket,
      };
      debugAuraCandidateInfo("[LINK_PRIMARY_SCORE]", {
        sourceUrl: params.sourceUrl ?? null,
        index,
        url,
        bucket: item.bucket,
        baseScore: result?.score ?? null,
        urlScore: item.urlScore,
        score: item.score,
        isGarmentOnly: item.isGarmentOnly,
        isModelImage: item.isModelImage,
        isFrontFacing: item.isFrontFacing,
        hasFullProductVisible: item.hasFullProductVisible,
        isDetailCloseUp: item.isDetailCloseUp,
        isCropped: item.isCropped,
        isThumbnail: item.isThumbnail,
        isLifestyleOrBanner: item.isLifestyleOrBanner,
        isSideProfileFootwear: item.isSideProfileFootwear,
        isOverheadFootwear: item.isOverheadFootwear,
        containsMultipleGarments: !!result?.containsMultipleGarments,
        reasons: item.reasons,
      });
      debugAuraCandidateInfo("[LINK_IMAGE_SCORE]", {
        sourceUrl: params.sourceUrl ?? null,
        index,
        url,
        score: item.score,
        urlScore: item.urlScore,
        isGarmentOnly: item.isGarmentOnly,
        isModelImage: item.isModelImage,
        isFrontFacing: item.isFrontFacing,
        hasFullProductVisible: item.hasFullProductVisible,
        isDetailCloseUp: item.isDetailCloseUp,
        isCropped: item.isCropped,
        isThumbnail: item.isThumbnail,
        isLifestyleOrBanner: item.isLifestyleOrBanner,
        isSideProfileFootwear: item.isSideProfileFootwear,
        isOverheadFootwear: item.isOverheadFootwear,
        reasons: item.reasons,
      });
      return item;
    });
    logProductImageBuckets({ sourceUrl: params.sourceUrl, items: scored });
    const ranked = orderProductImageBuckets(scored);
    logRankedProductImages({
      sourceUrl: params.sourceUrl,
      items: ranked,
      selected: ranked[0],
    });
    logProductImageRankingMetrics({
      sourceUrl: params.sourceUrl,
      extractedImageCount,
      dedupedImageCount: imageUrls.length,
      visionRankedImageCount: visionRankCandidates.length,
      selected: ranked[0],
      selectedReason: ranked[0]?.reasons[0] ?? "vision and URL ranking",
    });
    debugAuraCandidateInfo("[LINK_PRIMARY_CHOSEN]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      bucket: ranked[0]?.bucket ?? null,
      score: ranked[0]?.score ?? null,
      reasons: ranked[0]?.reasons ?? [],
      garmentOnlyAvailable: scored.some((item) => item.bucket === "garment_only"),
    });
    debugAuraCandidateInfo("[LINK_IMAGE_PRIMARY]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      primaryReasons: ranked[0]?.reasons ?? [],
      primaryIsGarmentOnly: ranked[0]?.isGarmentOnly ?? false,
    });
    debugAuraCandidateInfo("[LINK_IMAGE_SECONDARY]", {
      sourceUrl: params.sourceUrl ?? null,
      secondaryImageUrls: ranked.slice(1).map((item) => item.url),
    });
    return ranked;
  } catch (error) {
    debugAuraCandidateWarn("[LINK_IMAGE_SCORE]", "visual ranking failed; using deterministic URL ranking", {
      sourceUrl: params.sourceUrl ?? null,
      error,
    });
    const ranked = orderProductImageBuckets(urlOnlyRanked);
    logProductImageBuckets({ sourceUrl: params.sourceUrl, items: ranked });
    for (const item of ranked) {
      debugAuraCandidateInfo("[LINK_IMAGE_SCORE]", {
        sourceUrl: params.sourceUrl ?? null,
        index: item.sourceIndex,
        url: item.url,
        score: item.score,
        urlScore: item.urlScore,
        bucket: item.bucket,
        reasons: item.reasons,
      });
    }
    logRankedProductImages({
      sourceUrl: params.sourceUrl,
      items: ranked,
      selected: ranked[0],
    });
    logProductImageRankingMetrics({
      sourceUrl: params.sourceUrl,
      extractedImageCount,
      dedupedImageCount: imageUrls.length,
      visionRankedImageCount: visionRankCandidates.length,
      selected: ranked[0],
      selectedReason: ranked[0]?.reasons[0] ?? "deterministic URL fallback",
    });
    debugAuraCandidateInfo("[LINK_PRIMARY_CHOSEN]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      bucket: ranked[0]?.bucket ?? null,
      score: ranked[0]?.score ?? null,
      reasons: ranked[0]?.reasons ?? [],
      garmentOnlyAvailable: false,
    });
    debugAuraCandidateInfo("[LINK_IMAGE_PRIMARY]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      primaryReasons: ranked[0]?.reasons ?? [],
      primaryIsGarmentOnly: ranked[0]?.isGarmentOnly ?? false,
    });
    debugAuraCandidateInfo("[LINK_IMAGE_SECONDARY]", {
      sourceUrl: params.sourceUrl ?? null,
      secondaryImageUrls: ranked.slice(1).map((item) => item.url),
    });
    return ranked;
  }
}

export async function rankProductExtractionImages(params: {
  client: OpenAI;
  extraction: ProductExtraction;
}): Promise<ProductExtraction> {
  const rankedImages = await rankProductLinkImages({
    client: params.client,
    imageUrls: params.extraction.imageUrls,
    title: params.extraction.metadata.title,
    description: params.extraction.metadata.description,
    sourceUrl: params.extraction.metadata.sourceUrl,
  });
  const imageUrls = rankedImages.map((image) => image.url);
  debugAuraCandidateInfo("[LINK_IMAGE_EXTRACTION_RANKED]", {
    sourceUrl: params.extraction.metadata.sourceUrl,
    primaryImageUrl: imageUrls[0] ?? null,
    imageUrls,
    rankings: rankedImages.map((image) => ({
      url: image.url,
      score: image.score,
      bucket: image.bucket ?? "unknown",
      reasons: image.reasons,
    })),
  });
  return {
    ...params.extraction,
    imageUrls: imageUrls.length ? imageUrls : params.extraction.imageUrls,
    partialData: params.extraction.partialData
      ? {
          ...params.extraction.partialData,
          imageUrls: imageUrls.length ? imageUrls : params.extraction.partialData.imageUrls,
        }
      : params.extraction.partialData,
  };
}

export function productCategoryHintsFromText(title?: string | null, description?: string | null) {
  const titleText = String(title ?? "").toLowerCase();
  const text = `${titleText} ${description ?? ""}`.toLowerCase();
  const topSubCategory = (() => {
    if (/\bpolo\b/.test(titleText)) return "polo";
    if (/\bt-?shirt|\btee\b/.test(titleText)) return "tshirt";
    if (/\bhoodie\b/.test(titleText)) return "hoodie";
    if (/\bsweater|jumper|knit\b/.test(titleText)) return "sweater";
    if (/\btank|vest\b/.test(titleText)) return "tank";
    if (/\bblouse\b/.test(titleText)) return "blouse";
    if (/\bshirt\b/.test(titleText)) return "shirt";
    return null;
  })();
  if (topSubCategory) return { category: "top", subCategory: topSubCategory };
  if (/\b(jacket|coat|blazer)\b/.test(titleText)) return { category: "outerwear", subCategory: null };
  if (/\b(shoe|sneaker|boot|loafer|sandal)\b/.test(titleText)) return { category: "footwear", subCategory: null };
  if (/\b(dress|jumpsuit|romper)\b/.test(titleText)) return { category: "one_piece", subCategory: null };
  if (/\b(shorts?|trousers?|pants?|jeans?|skirt|leggings?)\b/.test(titleText)) {
    return {
      category: "bottom",
      subCategory: /\bshorts?\b/.test(titleText)
        ? "shorts"
        : /\bjeans?\b/.test(titleText)
          ? "jeans"
          : /\bskirt\b/.test(titleText)
            ? "skirt"
            : "trousers",
    };
  }
  if (/\b(shorts?|trousers?|pants?|jeans?|skirt|leggings?)\b/.test(text)) {
    return { category: "bottom", subCategory: text.includes("short") ? "shorts" : null };
  }
  if (/\b(shirt|t-shirt|tee|polo|sweater|hoodie|blouse|top)\b/.test(text)) {
    return {
      category: "top",
      subCategory: text.includes("polo")
        ? "polo"
        : text.includes("sweater")
          ? "sweater"
          : null,
    };
  }
  if (/\b(jacket|coat|blazer)\b/.test(text)) return { category: "outerwear", subCategory: null };
  if (/\b(shoe|sneaker|boot|loafer|sandal)\b/.test(text)) return { category: "footwear", subCategory: null };
  if (/\b(dress|jumpsuit|romper)\b/.test(text)) return { category: "one_piece", subCategory: null };
  return { category: null, subCategory: null };
}

type ImageCandidateExtraction = {
  title?: string | null;
  category?: string | null;
  subCategory?: string | null;
  color?: string | null;
  brand?: string | null;
  material?: string | null;
  fit?: string | null;
  pattern?: string | null;
  confidence?: number | null;
};

function cleanCandidate(value: ImageCandidateExtraction, imageUrls: string[], index: number, batch: boolean): AuraCandidateItem {
  return {
    candidateId: `image-${Date.now()}-${index}`,
    imageUrls,
    primaryImageUrl: imageUrls[0] ?? null,
    secondaryImageUrls: imageUrls.slice(1),
    title: value.title ?? null,
    category: value.category ?? null,
    subCategory: value.subCategory ?? null,
    color: value.color ?? null,
    brand: value.brand ?? null,
    material: value.material ?? null,
    fit: value.fit ?? null,
    pattern: value.pattern ?? null,
    confidence: typeof value.confidence === "number" ? value.confidence : null,
    sourceType: batch ? "batch" : "image",
    sourceUrl: null,
    status: "awaiting_confirmation",
  };
}

export async function extractImageCandidates(params: {
  client: OpenAI;
  imageGroups: string[][];
}): Promise<AuraCandidateItem[]> {
  const candidates: AuraCandidateItem[] = [];
  const batch = params.imageGroups.length > 1;

  for (let index = 0; index < params.imageGroups.length; index += 1) {
    const imageUrls = params.imageGroups[index] ?? [];
    if (!imageUrls.length) continue;
    const visionImageUrls = imageUrls.slice(0, 3);
    const response = await params.client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "developer",
          content:
            "Extract concise clothing item preview details from the image(s). Return JSON only. Do not invent brand/material if not visible.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Return JSON with keys: title, category, subCategory, color, brand, material, fit, pattern, confidence. Use null for unknown values.",
            },
            ...visionImageUrls.map((url) => ({
              type: "input_image" as const,
              image_url: url,
              detail: "high" as const,
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "aura_candidate_item",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: ["string", "null"] },
              category: { type: ["string", "null"] },
              subCategory: { type: ["string", "null"] },
              color: { type: ["string", "null"] },
              brand: { type: ["string", "null"] },
              material: { type: ["string", "null"] },
              fit: { type: ["string", "null"] },
              pattern: { type: ["string", "null"] },
              confidence: { type: ["number", "null"] },
            },
            required: [
              "title",
              "category",
              "subCategory",
              "color",
              "brand",
              "material",
              "fit",
              "pattern",
              "confidence",
            ],
          },
        },
      },
    });
    let parsed: ImageCandidateExtraction = {};
    try {
      parsed = JSON.parse(String(response.output_text || "{}")) as ImageCandidateExtraction;
    } catch {
      parsed = {};
    }
    candidates.push(cleanCandidate(parsed, imageUrls, index, batch));
  }

  return candidates;
}
