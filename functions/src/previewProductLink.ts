import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger, setLogContext, tracedHandler } from "./shared/logger";
import OpenAI from "openai";

import {
  BLOCKED_STORE_MESSAGE,
  ProductLinkError,
} from "./shared/productLinkExtractor";
import { requireOpenAiApiKey } from "./shared/env";
import { type AuraCandidateItem } from "./shared/auraCandidatePreview";
import {
  extractProductUrlMetadata,
  type ProductUrlMetadata,
} from "./shared/productUrlMetadata";
import { normalizeProductUrl } from "./shared/productExtractionPipeline";
import {
  buildProductLinkLogMetadata,
  isProductLinkExtractionV2Enabled,
  logProductLinkEvent,
  normalizedDomainForProductLink,
  productLinkFailureCodeForError,
  productLinkUserMessageForFailure,
  resultStatusForProductLink,
  warningCodesForProductLinkDiagnostics,
  type ProductLinkWarningCode,
} from "./shared/productLinkRelease";
import {
  brandFromSourceUrl,
  buildUrlCandidatePreview,
  canUseHmBlockedStorePreviewFallback,
  clientLinkPreviewFromRequest,
  fallbackLinkPreviewFromUrl,
  hmSanitizedClientPreview,
  hmSingleImageClientPreview,
  isHmProductUrl,
  type AuraLinkPreview,
} from "./shared/auraUrlCandidatePreview";
import {
  RATE_LIMITS,
  assertFunctionRateLimit,
  redactUid,
} from "./shared/rateLimit";
import { redactUrlForLogs } from "./shared/safeFetch";

const PRODUCT_LINK_FAILURE_MESSAGE =
  "I couldn't read this product page. Try another link, upload a screenshot, or add manually.";
const PREVIEW_METADATA_CACHE_TTL_MS = 5 * 60 * 1000;

const previewMetadataCache = new Map<string, {
  expiresAt: number;
  metadata: ProductUrlMetadata;
}>();

function codeForError(
  error: unknown,
): "invalid-argument" | "failed-precondition" | "internal" {
  if (!(error instanceof ProductLinkError)) return "internal";
  switch (error.code) {
    case "invalid_url":
    case "unsafe_url":
    case "fetch_failed":
      return "invalid-argument";
    case "blocked_store":
    case "no_metadata":
    case "no_images":
      return "failed-precondition";
    default:
      return "internal";
  }
}

function cleanText(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function previewHasUsableProductEvidence(preview: AuraLinkPreview | null | undefined) {
  if (!preview) return false;
  const hasTitle = !!cleanText(preview.title);
  const hasImage = !!cleanText(preview.imageUrl) || (preview.imageUrls ?? []).some((url) => !!cleanText(url));
  return hasTitle && hasImage;
}

function candidateHasUsableProductEvidence(candidate: AuraCandidateItem, metadata: ProductLinkPreviewMetadata) {
  const title = cleanText(candidate.title) || cleanText(metadata.title);
  const image =
    cleanText(candidate.primaryImageUrl) ||
    cleanText(candidate.imageUrls?.[0]) ||
    cleanText(candidate.secondaryImageUrls?.[0]) ||
    cleanText("imageUrl" in metadata ? metadata.imageUrl : null);
  return { hasTitle: !!title, hasImage: !!image };
}

function throwIfCandidateMissingEvidence(candidate: AuraCandidateItem, metadata: ProductLinkPreviewMetadata) {
  const evidence = candidateHasUsableProductEvidence(candidate, metadata);
  if (!evidence.hasTitle) {
    throw new ProductLinkError(PRODUCT_LINK_FAILURE_MESSAGE, "no_metadata", {
      reason: "missing_product_title",
    });
  }
  if (!evidence.hasImage) {
    throw new ProductLinkError(PRODUCT_LINK_FAILURE_MESSAGE, "no_images", {
      reason: "missing_product_image",
    });
  }
}

function shouldSkipPreviewFallback(error: unknown, rawUrl: string, fallbackPreview: AuraLinkPreview | null | undefined) {
  if (!(error instanceof ProductLinkError)) return false;
  return (
    error.code === "invalid_url" ||
    error.code === "unsafe_url" ||
    (error.code === "blocked_store" && !canUseHmBlockedStorePreviewFallback(rawUrl, fallbackPreview))
  );
}

function messageForError(error: unknown) {
  if (error instanceof ProductLinkError && error.code === "blocked_store") return BLOCKED_STORE_MESSAGE;
  if (error instanceof ProductLinkError) {
    return productLinkUserMessageForFailure(productLinkFailureCodeForError(error, "preview"), "preview");
  }
  if (error instanceof Error) return error.message;
  return "Could not read that product link.";
}

function detailsForError(
  error: unknown,
  failureCode: string | null,
  warningCodes: ProductLinkWarningCode[],
) {
  if (!(error instanceof ProductLinkError)) return undefined;
  return {
    productLinkCode: error.code,
    failureCode,
    warningCodes,
    ...(error.details ?? {}),
  };
}

function domainFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\d*\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

type ProductLinkPreviewMetadata = ProductUrlMetadata | AuraLinkPreview;

function previewMetadataCacheKey(url: string) {
  try {
    return normalizeProductUrl(new URL(url)).normalizedUrl;
  } catch {
    return null;
  }
}

function isCacheablePreviewMetadata(metadata: ProductUrlMetadata) {
  return !!(cleanText(metadata.title) || cleanText(metadata.imageUrl) || cleanText(metadata.description));
}

async function extractProductUrlMetadataWithCache(url: string) {
  const key = previewMetadataCacheKey(url);
  const now = Date.now();
  if (key) {
    const cached = previewMetadataCache.get(key);
    if (cached && cached.expiresAt > now) return { metadata: cached.metadata, cacheHit: true };
    if (cached) previewMetadataCache.delete(key);
  }
  const metadata = await extractProductUrlMetadata(url);
  if (key && isCacheablePreviewMetadata(metadata)) {
    previewMetadataCache.set(key, {
      expiresAt: now + PREVIEW_METADATA_CACHE_TTL_MS,
      metadata,
    });
  }
  return { metadata, cacheHit: false };
}

function productUrlMetadataForRolloutMode(
  metadata: ProductUrlMetadata,
  featureFlagEnabled: boolean,
): ProductUrlMetadata {
  if (featureFlagEnabled) return metadata;
  return {
    ...metadata,
    canonicalUrl: metadata.sourceUrl,
    category: null,
    subCategory: null,
    extractionSource: null,
    adapterName: null,
  };
}

function previewResponseFromCandidate(params: {
  candidate: AuraCandidateItem;
  metadata: ProductLinkPreviewMetadata;
  imageCandidateCount: number;
  imageExtractionSource: "json_ld" | "og_image" | "twitter" | "html_image" | "fallback" | null;
  selectedImageReason?: string | null;
}) {
  const { candidate, metadata } = params;
  return {
    ok: true,
    preview: {
      candidate,
      metadata: {
        sourceUrl: metadata.sourceUrl,
        canonicalUrl: "canonicalUrl" in metadata ? metadata.canonicalUrl ?? metadata.sourceUrl : metadata.sourceUrl,
        domain: domainFromUrl(metadata.sourceUrl),
        retailer: metadata.brand ?? brandFromSourceUrl(metadata.sourceUrl),
        title: metadata.title ?? candidate.title ?? null,
        brand: candidate.brand ?? metadata.brand ?? brandFromSourceUrl(metadata.sourceUrl),
        color: candidate.color ?? null,
        displayColor: candidate.displayColor ?? candidate.color ?? null,
        displayColors: candidate.displayColors ?? [],
        material: candidate.material ?? null,
        materials: candidate.materials ?? [],
        fit: candidate.fit ?? null,
        sleeveLength: candidate.sleeveLength ?? null,
        collar: candidate.collar ?? null,
        length: candidate.length ?? null,
        pattern: candidate.pattern ?? null,
        price: candidate.priceDisplay ?? null,
        priceAmount: candidate.retailPrice ?? null,
        priceCurrency: candidate.currency ?? candidate.originalCurrency ?? null,
        priceDisplay: candidate.priceDisplay ?? null,
        salePrice: candidate.salePrice ?? null,
        originalPrice: candidate.originalPrice ?? null,
        description: metadata.description ?? null,
        productDescription: candidate.productDescription ?? metadata.productDescription ?? metadata.description ?? null,
        sizeHints: [],
        sizeOptions: candidate.sizeOptions ?? [],
        availableSizes: candidate.availableSizes ?? [],
        careInstructions: candidate.careInstructions ?? [],
        graphicText: candidate.graphicText ?? null,
        motif: candidate.motif ?? null,
        collaborationName: candidate.collaborationName ?? null,
        category: candidate.category ?? ("category" in metadata ? metadata.category ?? null : null),
        subCategory: candidate.subCategory ?? ("subCategory" in metadata ? metadata.subCategory ?? null : null),
        categoryHints: [candidate.category, candidate.subCategory].filter(
          (value): value is string => !!String(value ?? "").trim(),
        ),
        sku: "sku" in metadata ? metadata.sku ?? null : null,
        styleId: "styleId" in metadata ? metadata.styleId ?? null : null,
        productId: "productId" in metadata ? metadata.productId ?? null : null,
        availability: "availability" in metadata ? metadata.availability ?? null : null,
        selectedSize: "selectedSize" in metadata ? metadata.selectedSize ?? null : null,
        sizes: "sizes" in metadata ? metadata.sizes ?? [] : [],
        extractionSource: "extractionSource" in metadata ? metadata.extractionSource ?? null : null,
        adapterName: "adapterName" in metadata ? metadata.adapterName ?? null : null,
        priceUnavailable: "priceUnavailable" in metadata ? metadata.priceUnavailable ?? undefined : undefined,
        marketPriceUnavailable: "marketPriceUnavailable" in metadata ? metadata.marketPriceUnavailable ?? undefined : undefined,
        imageExtractionSource: params.imageExtractionSource,
        imageCandidateCount: params.imageCandidateCount,
        selectedImageReason:
          params.selectedImageReason ??
          ("selectedImageReason" in metadata ? metadata.selectedImageReason ?? null : null),
      },
    },
  };
}

export const previewProductLink = onCall(
  { secrets: ["OPENAI_API_KEY"] },
  tracedHandler(async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }
    setLogContext({ uidHash: redactUid(uid) });

    const url = String(request.data?.url ?? "").trim();
    if (!url) {
      throw new HttpsError("invalid-argument", "A product link is required.");
    }
    await assertFunctionRateLimit(uid, "productLink", RATE_LIMITS.productLink);
    const startedAt = Date.now();
    const featureFlagEnabled = isProductLinkExtractionV2Enabled();
    logProductLinkEvent("product_link_preview_started", buildProductLinkLogMetadata({
      rawUrl: url,
      featureFlagEnabled,
      resultStatus: "partial",
      durationMs: 0,
    }));

    const rawClientPreview = clientLinkPreviewFromRequest(request.data?.linkPreview, url);
    const hmClientFallback =
      hmSanitizedClientPreview(rawClientPreview) ?? hmSingleImageClientPreview(rawClientPreview);
    const clientPreview = isHmProductUrl(url) ? null : rawClientPreview;
    const client = new OpenAI({
      apiKey: requireOpenAiApiKey(),
    });

    try {
      logger.info("[LINK_PREVIEW] extracting product link", {
        uidHash: redactUid(uid),
        url: redactUrlForLogs(url),
        hasClientLinkPreview: !!clientPreview,
        clientPreviewImageCount: clientPreview?.imageUrls?.length ?? 0,
      });
      const extracted = await extractProductUrlMetadataWithCache(url);
      const metadata = productUrlMetadataForRolloutMode(extracted.metadata, featureFlagEnabled);
      if (!metadata.imageUrl) {
        const fallbackPreview = [clientPreview, hmClientFallback, { ...metadata, status: "needs_review" as const }]
          .find(previewHasUsableProductEvidence) ?? null;
        if (fallbackPreview) {
          logger.info("[LINK_PREVIEW] using AURA URL fallback after missing server image", {
            uidHash: redactUid(uid),
            url: redactUrlForLogs(url),
            hasTitle: !!fallbackPreview.title,
            hasImageUrl: !!fallbackPreview.imageUrl,
            imageCount: fallbackPreview.imageUrls?.length ?? 0,
            sanitizedHmFallback: fallbackPreview === hmClientFallback,
          });
          const built = await buildUrlCandidatePreview({
            client,
            uid,
            metadata: fallbackPreview,
            preferNikeFootwearLeftProfile: true,
          });
          throwIfCandidateMissingEvidence(built.candidate, fallbackPreview);
          const warningCodes: ProductLinkWarningCode[] = [
            "CLIENT_PREVIEW_FALLBACK_USED",
            "PARTIAL_EXTRACTION",
          ];
          logProductLinkEvent("product_link_preview_partial", buildProductLinkLogMetadata({
            rawUrl: url,
            metadata,
            diagnostics: metadata.extractionDiagnostics,
            selectedImageReason: built.selectedImageReason,
            candidateImageCount: built.rankedImageUrls.length || built.rawImageUrls.length,
            primaryImageUrl: built.candidate.primaryImageUrl,
            extraWarnings: warningCodes,
            durationMs: Date.now() - startedAt,
            featureFlagEnabled,
            resultStatus: "partial",
          }));
          return previewResponseFromCandidate({
            candidate: built.candidate,
            metadata: fallbackPreview,
            imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
            imageExtractionSource: "fallback",
            selectedImageReason: built.selectedImageReason,
          });
        }
        throw new ProductLinkError(PRODUCT_LINK_FAILURE_MESSAGE, "no_images", {
          reason: metadata.title || metadata.description ? "missing_product_image" : "missing_product_evidence",
        });
      }

      const built = await buildUrlCandidatePreview({
        client,
        uid,
        metadata,
        preferNikeFootwearLeftProfile: true,
      });
      throwIfCandidateMissingEvidence(built.candidate, metadata);

      logger.info("[LINK_PREVIEW] product link extracted", {
        uidHash: redactUid(uid),
        domain: domainFromUrl(metadata.sourceUrl),
        imageExtractionSource: "aura_url_candidate",
        imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
        selectedImageHost: built.candidate.primaryImageUrl ? new URL(built.candidate.primaryImageUrl).hostname : null,
        imageCount: built.candidate.imageUrls.length,
        hasTitle: !!built.candidate.title,
      });
      const warningCodes = warningCodesForProductLinkDiagnostics(
        metadata.extractionDiagnostics,
        extracted.cacheHit ? [] : [],
        metadata,
      );
      const resultStatus = resultStatusForProductLink({
        warningCodes,
        missingFields: metadata.extractionDiagnostics?.missingFields ?? [],
        hasTitle: !!built.candidate.title,
        hasImage: !!built.candidate.primaryImageUrl,
      });
      logProductLinkEvent(
        resultStatus === "partial" ? "product_link_preview_partial" : "product_link_preview_succeeded",
        buildProductLinkLogMetadata({
          rawUrl: url,
          metadata,
          diagnostics: metadata.extractionDiagnostics,
          selectedImageReason: built.selectedImageReason,
          candidateImageCount: built.rankedImageUrls.length || built.rawImageUrls.length,
          primaryImageUrl: built.candidate.primaryImageUrl,
          durationMs: Date.now() - startedAt,
          featureFlagEnabled,
          resultStatus,
        }),
      );

      return previewResponseFromCandidate({
        candidate: built.candidate,
        metadata,
        imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
        imageExtractionSource: null,
        selectedImageReason: built.selectedImageReason,
      });
    } catch (error) {
      const fallbackPreview = [clientPreview, hmClientFallback, fallbackLinkPreviewFromUrl(url)]
        .find(previewHasUsableProductEvidence) ?? null;
      if (fallbackPreview && !shouldSkipPreviewFallback(error, url, fallbackPreview)) {
        logger.info("[LINK_PREVIEW] using AURA client preview fallback", {
          uidHash: redactUid(uid),
          url: redactUrlForLogs(url),
          code: error instanceof ProductLinkError ? error.code : null,
          imageCount: fallbackPreview.imageUrls?.length ?? 0,
          hasTitle: !!fallbackPreview.title,
        });
        const built = await buildUrlCandidatePreview({
          client,
          uid,
          metadata: fallbackPreview,
          preferNikeFootwearLeftProfile: true,
        });
        throwIfCandidateMissingEvidence(built.candidate, fallbackPreview);
        const failureCode = productLinkFailureCodeForError(error, "preview");
        logProductLinkEvent("product_link_preview_partial", buildProductLinkLogMetadata({
          rawUrl: url,
          metadata: fallbackPreview,
          selectedImageReason: built.selectedImageReason,
          candidateImageCount: built.rankedImageUrls.length || built.rawImageUrls.length,
          primaryImageUrl: built.candidate.primaryImageUrl,
          extraWarnings: [
            "CLIENT_PREVIEW_FALLBACK_USED",
            failureCode === "FETCH_BLOCKED" ? "FETCH_BLOCKED" : "PARTIAL_EXTRACTION",
          ],
          durationMs: Date.now() - startedAt,
          featureFlagEnabled,
          resultStatus: "partial",
        }));
        return previewResponseFromCandidate({
          candidate: built.candidate,
          metadata: fallbackPreview,
          imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
          imageExtractionSource: "fallback",
          selectedImageReason: built.selectedImageReason,
        });
      }
      const failureCode = productLinkFailureCodeForError(error, "preview");
      const warningCodes = warningCodesForProductLinkDiagnostics(null, [failureCode], {
        domain: normalizedDomainForProductLink(url),
      });
      const message = messageForError(error);
      logProductLinkEvent("product_link_preview_failed", buildProductLinkLogMetadata({
        rawUrl: url,
        failureCode,
        extraWarnings: warningCodes,
        durationMs: Date.now() - startedAt,
        featureFlagEnabled,
        resultStatus: "failed",
      }));
      logger.error("[LINK_PREVIEW] extraction failed", {
        uidHash: redactUid(uid),
        url: redactUrlForLogs(url),
        code: error instanceof ProductLinkError ? error.code : null,
        blockedStoreFallback: error instanceof ProductLinkError && error.code === "blocked_store",
        error: message,
      });
      throw new HttpsError(codeForError(error), message, detailsForError(error, failureCode, warningCodes));
    }
  })
);
