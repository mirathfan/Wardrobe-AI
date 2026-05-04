import { logger } from "firebase-functions/v2";
import OpenAI from "openai";

import {
  candidatePreviewResponse,
  extractImageCandidates,
  fallbackImageCandidates,
  productCategoryHintsFromText,
  rankProductLinkImages,
  type AuraCandidateItem,
} from "./auraCandidatePreview";
import type { ProductUrlMetadata } from "./productUrlMetadata";
import { redactUrlForLogs } from "./safeFetch";

export type AuraLinkPreview = {
  sourceUrl: string;
  title: string | null;
  imageUrl: string | null;
  imageUrls?: string[];
  description: string | null;
  brand?: string | null;
  category?: string | null;
  subCategory?: string | null;
  color?: string | null;
  price?: string | null;
  currency?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceDisplay?: string | null;
  salePrice?: number | null;
  originalPrice?: number | null;
  material?: string | null;
  materials?: string[];
  fit?: string | null;
  sleeveLength?: string | null;
  collar?: string | null;
  length?: string | null;
  pattern?: string | null;
  displayColor?: string | null;
  displayColors?: string[] | null;
  sizeOptions?: string[];
  availableSizes?: string[];
  careInstructions?: string[];
  productDescription?: string | null;
  graphicText?: string | null;
  motif?: string | null;
  collaborationName?: string | null;
  status?: "ready" | "needs_review";
};

type UrlCandidateMetadata = ProductUrlMetadata | AuraLinkPreview;

function cleanPreviewText(value: unknown, maxLength = 500) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizePreviewImage(sourceUrl: URL, value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const imageUrl = new URL(raw, sourceUrl);
    if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") return null;
    imageUrl.hash = "";
    return imageUrl.toString();
  } catch {
    return null;
  }
}

export function clientLinkPreviewFromRequest(
  value: unknown,
  detectedUrl: string | null,
): AuraLinkPreview | null {
  if (!value || typeof value !== "object" || !detectedUrl) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.sourceUrl !== "string") return null;
  try {
    const detected = new URL(detectedUrl);
    const source = new URL(candidate.sourceUrl);
    detected.hash = "";
    source.hash = "";
    if (detected.toString() !== source.toString()) return null;
    const imageUrl = normalizePreviewImage(source, candidate.imageUrl);
    const imageUrls = Array.isArray(candidate.imageUrls)
      ? candidate.imageUrls
          .map((url) => normalizePreviewImage(source, url))
          .filter((url): url is string => !!url)
      : [];
    const preview = {
      sourceUrl: detected.toString(),
      title: cleanPreviewText(candidate.title, 220),
      imageUrl,
      imageUrls: imageUrls.length ? imageUrls : imageUrl ? [imageUrl] : [],
      description: cleanPreviewText(candidate.description, 500),
    };
    return preview.imageUrls.length || preview.title || preview.description ? preview : null;
  } catch {
    return null;
  }
}

export function isHmProductUrl(rawUrl?: string | null) {
  try {
    const url = new URL(String(rawUrl ?? ""));
    const host = url.hostname.toLowerCase();
    return (
      (host === "hm.com" || host.endsWith(".hm.com")) &&
      /\/productpage\.\d+\.html$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function hmSingleImageClientPreview(preview: AuraLinkPreview | null): AuraLinkPreview | null {
  if (!preview || !isHmProductUrl(preview.sourceUrl) || !preview.imageUrl) return null;
  return {
    ...preview,
    imageUrls: [preview.imageUrl],
  };
}

export function hmSanitizedClientPreview(preview: AuraLinkPreview | null): AuraLinkPreview | null {
  if (!preview || !isHmProductUrl(preview.sourceUrl)) return null;
  const urls = [
    ...(Array.isArray(preview.imageUrls) ? preview.imageUrls : []),
    preview.imageUrl,
  ]
    .map((url) => String(url ?? "").trim())
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname.toLowerCase() === "image.hm.com";
      } catch {
        return false;
      }
    });
  const seen = new Set<string>();
  const imageUrls = urls
    .filter((url) => {
      const key = url.toLowerCase().replace(/([?&])(imwidth|width|height|w|h)=\d+/g, "$1");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 24);
  const imageUrl = imageUrls[0] ?? preview.imageUrl;
  return imageUrl
    ? {
        ...preview,
        imageUrl,
        imageUrls,
      }
    : null;
}

export function brandFromSourceUrl(sourceUrl?: string | null) {
  try {
    const host = new URL(String(sourceUrl ?? "")).hostname.replace(/^www\d*\./, "").toLowerCase();
    if (host.endsWith("hm.com")) return "H&M";
    if (host.endsWith("zara.com")) return "Zara";
    if (host.endsWith("nike.com")) return "Nike";
    const domain = host.split(".")[0] ?? "";
    return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : null;
  } catch {
    return null;
  }
}

function isLikelyProductLinkForReview(sourceUrl?: string | null) {
  try {
    const url = new URL(String(sourceUrl ?? ""));
    const host = url.hostname.toLowerCase();
    if (
      host.includes("amazon.") ||
      host.endsWith("hm.com") ||
      host.endsWith("zara.com") ||
      host.endsWith("nike.com")
    ) {
      return true;
    }
    return /\b(product|productpage|pdp|item|dp|gp\/product)\b/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function fallbackLinkPreviewFromUrl(sourceUrl: string): AuraLinkPreview | null {
  if (!isLikelyProductLinkForReview(sourceUrl)) return null;
  try {
    const url = new URL(sourceUrl);
    const brand = brandFromSourceUrl(sourceUrl);
    const articleId = isHmProductUrl(sourceUrl)
      ? url.pathname.match(/\/productpage\.(\d+)\.html$/i)?.[1] ?? null
      : null;
    const hostLabel = url.hostname.replace(/^www\d*\./i, "");
    return {
      sourceUrl: url.toString(),
      title: brand ? `${brand} product link` : `${hostLabel} product link`,
      imageUrl: null,
      imageUrls: [],
      description: articleId ? `Product ${articleId}` : null,
      brand,
      status: "needs_review",
    };
  } catch {
    return null;
  }
}

function cleanProductTitle(title?: string | null, brand?: string | null) {
  let next = String(title ?? "").replace(/\s+/g, " ").trim();
  next = next
    .replace(/\s*\|\s*H\s*&\s*M(?:\s+[A-Z]{2})?\s*$/i, "")
    .replace(/\s*\|\s*Zara\s*$/i, "")
    .replace(/\s*\|\s*Nike\s*$/i, "")
    .replace(/^Men[’']s\s+/i, "")
    .replace(/^Women[’']s\s+/i, "")
    .replace(/^Ladies[’']?\s+/i, "")
    .trim();
  if (brand) {
    next = next
      .replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "")
      .trim();
  }
  return next || title || null;
}

function mergeUrlMetadataIntoCandidate(
  candidate: AuraCandidateItem,
  metadata: UrlCandidateMetadata,
): AuraCandidateItem {
  const amount =
    "salePrice" in metadata && typeof metadata.salePrice === "number"
      ? metadata.salePrice
      : "priceAmount" in metadata
        ? metadata.priceAmount ?? null
        : null;
  const currency =
    "priceCurrency" in metadata
      ? metadata.priceCurrency ?? metadata.currency ?? null
      : null;
  const priceFields =
    typeof amount === "number" && Number.isFinite(amount)
      ? {
          retailPrice: amount,
          purchasePrice: amount,
          estimatedValue: amount,
          currency,
          originalPrice:
            "originalPrice" in metadata
              ? metadata.originalPrice ?? amount
              : amount,
          salePrice:
            "salePrice" in metadata
              ? metadata.salePrice ?? null
              : null,
          originalCurrency: currency,
          priceSource: "product_link" as const,
          priceDisplay:
            "priceDisplay" in metadata
              ? metadata.priceDisplay ?? metadata.price ?? null
              : null,
          price: amount,
        }
      : {};
  return {
    ...candidate,
    candidateId: `url-${Date.now()}-0`,
    imageUrls:
      "imageUrls" in metadata && Array.isArray(metadata.imageUrls) && metadata.imageUrls.length
        ? metadata.imageUrls
        : metadata.imageUrl
          ? [metadata.imageUrl]
          : candidate.imageUrls,
    title: metadata.title ?? candidate.title,
    category: ("category" in metadata ? metadata.category ?? null : null) ?? candidate.category,
    subCategory: ("subCategory" in metadata ? metadata.subCategory ?? null : null) ?? candidate.subCategory,
    color: ("displayColor" in metadata ? metadata.displayColor ?? metadata.color ?? null : null) ?? candidate.color,
    displayColor: "displayColor" in metadata ? metadata.displayColor ?? metadata.color ?? null : null,
    displayColors: "displayColors" in metadata ? metadata.displayColors ?? [] : [],
    brand: ("brand" in metadata ? metadata.brand ?? null : null) ?? candidate.brand,
    material: ("material" in metadata ? metadata.material ?? null : null) ?? candidate.material,
    materials: "materials" in metadata ? metadata.materials ?? [] : [],
    fit: ("fit" in metadata ? metadata.fit ?? null : null) ?? candidate.fit,
    sleeveLength: "sleeveLength" in metadata ? metadata.sleeveLength ?? null : null,
    collar: "collar" in metadata ? metadata.collar ?? null : null,
    length: "length" in metadata ? metadata.length ?? null : null,
    pattern: ("pattern" in metadata ? metadata.pattern ?? null : null) ?? candidate.pattern,
    sizeOptions: "sizeOptions" in metadata ? metadata.sizeOptions ?? [] : [],
    availableSizes: "availableSizes" in metadata ? metadata.availableSizes ?? metadata.sizeOptions ?? [] : [],
    careInstructions: "careInstructions" in metadata ? metadata.careInstructions ?? [] : [],
    productDescription: "productDescription" in metadata ? metadata.productDescription ?? metadata.description ?? null : metadata.description ?? null,
    graphicText: "graphicText" in metadata ? metadata.graphicText ?? null : null,
    motif: "motif" in metadata ? metadata.motif ?? null : null,
    collaborationName: "collaborationName" in metadata ? metadata.collaborationName ?? null : null,
    confidence: candidate.confidence ?? ("confidence" in metadata ? metadata.confidence ?? null : null),
    ...priceFields,
    productUrl: metadata.sourceUrl,
    sourceType: "link",
    sourceUrl: metadata.sourceUrl,
    status: "status" in metadata && metadata.status === "needs_review"
      ? "needs_review"
      : "awaiting_confirmation",
  };
}

export async function buildUrlCandidatePreview(params: {
  client: OpenAI;
  uid?: string | null;
  metadata: UrlCandidateMetadata;
}) {
  const rawImageUrls = [
    ...("imageUrls" in params.metadata && Array.isArray(params.metadata.imageUrls)
      ? params.metadata.imageUrls
      : []),
    params.metadata.imageUrl,
  ].filter((url): url is string => !!url);
  logger.info("[LINK_IMAGE_SOURCE] URL metadata image source", {
    uid: params.uid ?? null,
    sourceUrl: redactUrlForLogs(params.metadata.sourceUrl),
    rawImageCount: rawImageUrls.length,
    rawImageUrls: rawImageUrls.slice(0, 6).map((url) => redactUrlForLogs(url)),
  });
  const rankedImages = await rankProductLinkImages({
    client: params.client,
    imageUrls: rawImageUrls,
    title: params.metadata.title,
    description: params.metadata.description,
    sourceUrl: params.metadata.sourceUrl,
  });
  const rankedImageUrls = rankedImages.map((image) => image.url);
  const primaryImageUrl = rankedImageUrls[0] ?? null;
  const titleHints = productCategoryHintsFromText(params.metadata.title, params.metadata.description);
  logger.info("[LINK_EXTRACTION_TARGET]", {
    uid: params.uid ?? null,
    sourceUrl: redactUrlForLogs(params.metadata.sourceUrl),
    title: params.metadata.title,
    description: params.metadata.description,
    hintedCategory: titleHints.category,
    hintedSubCategory: titleHints.subCategory,
    chosenImage: redactUrlForLogs(primaryImageUrl),
    chosenImageReasons: rankedImages[0]?.reasons ?? [],
    rawImageCount: rawImageUrls.length,
    rankedImageCount: rankedImageUrls.length,
  });

  let candidates = primaryImageUrl
    ? await extractImageCandidates({
        client: params.client,
        imageGroups: [[primaryImageUrl]],
      })
    : [];
  if (!candidates.length && primaryImageUrl) {
    candidates = fallbackImageCandidates([[primaryImageUrl]]);
  }
  if (!candidates.length) {
    candidates = [
      {
        candidateId: `url-${Date.now()}-0`,
        imageUrls: [],
        title: params.metadata.title,
        category: null,
        subCategory: null,
        color: null,
        brand: null,
        material: null,
        fit: null,
        pattern: null,
        confidence: null,
        sourceType: "link",
        sourceUrl: params.metadata.sourceUrl,
        status: "awaiting_confirmation",
      },
    ];
  }
  const candidate = mergeUrlMetadataIntoCandidate(candidates[0], params.metadata);
  const needsReview = "status" in params.metadata && params.metadata.status === "needs_review";
  const effectiveTitle = params.metadata.title ?? candidate.title;
  const effectiveTitleHints = productCategoryHintsFromText(effectiveTitle, params.metadata.description);
  candidate.imageUrls = rankedImageUrls.length ? rankedImageUrls : candidate.imageUrls;
  candidate.primaryImageUrl = candidate.imageUrls[0] ?? null;
  candidate.secondaryImageUrls = candidate.imageUrls.slice(1);
  logger.info("[LINK_IMAGE_REVIEW_SET]", {
    uid: params.uid ?? null,
    sourceUrl: redactUrlForLogs(params.metadata.sourceUrl),
    candidateId: candidate.candidateId,
    primaryImageUrl: redactUrlForLogs(candidate.primaryImageUrl),
    imageUrls: candidate.imageUrls.slice(0, 8).map((url) => redactUrlForLogs(url)),
    secondaryImageUrls: candidate.secondaryImageUrls.slice(0, 8).map((url) => redactUrlForLogs(url)),
  });
  if (effectiveTitleHints.category) {
    candidate.category = effectiveTitleHints.category;
    candidate.subCategory = effectiveTitleHints.subCategory ?? candidate.subCategory;
    candidate.brand = candidate.brand && !/^no brand$/i.test(candidate.brand)
      ? candidate.brand
      : brandFromSourceUrl(params.metadata.sourceUrl);
  } else if (!needsReview) {
    candidate.category = titleHints.category ?? candidate.category;
    candidate.subCategory = titleHints.subCategory ?? candidate.subCategory;
    candidate.brand = candidate.brand && !/^no brand$/i.test(candidate.brand)
      ? candidate.brand
      : brandFromSourceUrl(params.metadata.sourceUrl);
  } else {
    candidate.category = candidate.category ?? null;
    candidate.subCategory = candidate.subCategory ?? null;
    candidate.brand = candidate.brand ?? null;
  }
  candidate.title = cleanProductTitle(params.metadata.title ?? candidate.title, candidate.brand);
  logger.info("[LINK_BRAND_NORMALIZE] candidate brand/title normalized", {
    uid: params.uid ?? null,
    sourceUrl: params.metadata.sourceUrl,
    rawTitle: params.metadata.title,
    savedBrand: candidate.brand,
    savedTitle: candidate.title,
  });
  logger.info("[AURA_URL_TO_CANDIDATE] converted URL metadata to candidate", {
    uid: params.uid ?? null,
    sourceUrl: params.metadata.sourceUrl,
    imageUrl: params.metadata.imageUrl,
    title: params.metadata.title,
    candidateId: candidate.candidateId,
    category: candidate.category,
    subCategory: candidate.subCategory,
    color: candidate.color,
    brand: candidate.brand,
  });
  const data = candidatePreviewResponse([candidate]);
  if (needsReview) {
    data.reply = "I couldn’t fully read this item — review before adding";
  }
  return {
    data,
    candidate,
    rawImageUrls,
    rankedImages,
    rankedImageUrls,
  };
}
