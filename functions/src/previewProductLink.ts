import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
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
import {
  brandFromSourceUrl,
  buildUrlCandidatePreview,
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

function shouldSkipPreviewFallback(error: unknown) {
  if (!(error instanceof ProductLinkError)) return false;
  return (
    error.code === "blocked_store" ||
    error.code === "no_metadata" ||
    error.code === "no_images" ||
    error.code === "invalid_url" ||
    error.code === "unsafe_url"
  );
}

function messageForError(error: unknown) {
  if (error instanceof ProductLinkError && error.code === "blocked_store") return BLOCKED_STORE_MESSAGE;
  if (error instanceof ProductLinkError) return error.message;
  if (error instanceof Error) return error.message;
  return "Could not read that product link.";
}

function detailsForError(error: unknown) {
  if (!(error instanceof ProductLinkError)) return undefined;
  return {
    productLinkCode: error.code,
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

function previewResponseFromCandidate(params: {
  candidate: AuraCandidateItem;
  metadata: ProductLinkPreviewMetadata;
  imageCandidateCount: number;
  imageExtractionSource: "json_ld" | "og_image" | "twitter" | "html_image" | "fallback" | null;
}) {
  const { candidate, metadata } = params;
  return {
    ok: true,
    preview: {
      candidate,
      metadata: {
        sourceUrl: metadata.sourceUrl,
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
        categoryHints: [candidate.category, candidate.subCategory].filter(
          (value): value is string => !!String(value ?? "").trim(),
        ),
        sku: "sku" in metadata ? metadata.sku ?? null : null,
        imageExtractionSource: params.imageExtractionSource,
        imageCandidateCount: params.imageCandidateCount,
      },
    },
  };
}

export const previewProductLink = onCall(
  { secrets: ["OPENAI_API_KEY"] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }

    const url = String(request.data?.url ?? "").trim();
    if (!url) {
      throw new HttpsError("invalid-argument", "A product link is required.");
    }
    await assertFunctionRateLimit(uid, "productLink", RATE_LIMITS.productLink);

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
      const metadata = await extractProductUrlMetadata(url);
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
          });
          throwIfCandidateMissingEvidence(built.candidate, fallbackPreview);
          return previewResponseFromCandidate({
            candidate: built.candidate,
            metadata: fallbackPreview,
            imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
            imageExtractionSource: "fallback",
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

      return previewResponseFromCandidate({
        candidate: built.candidate,
        metadata,
        imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
        imageExtractionSource: null,
      });
    } catch (error) {
      const fallbackPreview = [clientPreview, hmClientFallback, fallbackLinkPreviewFromUrl(url)]
        .find(previewHasUsableProductEvidence) ?? null;
      if (fallbackPreview && !shouldSkipPreviewFallback(error)) {
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
        });
        throwIfCandidateMissingEvidence(built.candidate, fallbackPreview);
        return previewResponseFromCandidate({
          candidate: built.candidate,
          metadata: fallbackPreview,
          imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
          imageExtractionSource: "fallback",
        });
      }
      const message = messageForError(error);
      logger.error("[LINK_PREVIEW] extraction failed", {
        uidHash: redactUid(uid),
        url: redactUrlForLogs(url),
        code: error instanceof ProductLinkError ? error.code : null,
        blockedStoreFallback: error instanceof ProductLinkError && error.code === "blocked_store",
        error: message,
      });
      throw new HttpsError(codeForError(error), message, detailsForError(error));
    }
  }
);
