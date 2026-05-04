import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import OpenAI from "openai";

import {
  BLOCKED_STORE_MESSAGE,
  ProductLinkError,
} from "./shared/productLinkExtractor";
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
import { redactUrlForLogs } from "./shared/safeFetch";

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

    const rawClientPreview = clientLinkPreviewFromRequest(request.data?.linkPreview, url);
    const hmClientFallback =
      hmSanitizedClientPreview(rawClientPreview) ?? hmSingleImageClientPreview(rawClientPreview);
    const clientPreview = isHmProductUrl(url) ? null : rawClientPreview;
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    try {
      logger.info("[LINK_PREVIEW] extracting product link", {
        uid,
        url: redactUrlForLogs(url),
        hasClientLinkPreview: !!clientPreview,
        clientPreviewImageCount: clientPreview?.imageUrls?.length ?? 0,
      });
      const metadata = await extractProductUrlMetadata(url);
      if (!metadata.imageUrl) {
        const fallbackPreview =
          clientPreview ??
          hmClientFallback ??
          (metadata.title || metadata.description
            ? { ...metadata, status: "needs_review" as const }
            : fallbackLinkPreviewFromUrl(url));
        if (fallbackPreview) {
          logger.info("[LINK_PREVIEW] using AURA URL fallback after missing server image", {
            uid,
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
          return previewResponseFromCandidate({
            candidate: built.candidate,
            metadata: fallbackPreview,
            imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
            imageExtractionSource: "fallback",
          });
        }
      }

      const built = await buildUrlCandidatePreview({
        client,
        uid,
        metadata,
      });

      logger.info("[LINK_PREVIEW] product link extracted", {
        uid,
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
      const fallbackPreview = clientPreview ?? hmClientFallback ?? fallbackLinkPreviewFromUrl(url);
      if (fallbackPreview) {
        logger.info("[LINK_PREVIEW] using AURA client preview fallback", {
          uid,
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
        return previewResponseFromCandidate({
          candidate: built.candidate,
          metadata: fallbackPreview,
          imageCandidateCount: built.rankedImageUrls.length || built.rawImageUrls.length,
          imageExtractionSource: "fallback",
        });
      }
      const message = messageForError(error);
      logger.error("[LINK_PREVIEW] extraction failed", {
        uid,
        url: redactUrlForLogs(url),
        code: error instanceof ProductLinkError ? error.code : null,
        blockedStoreFallback: error instanceof ProductLinkError && error.code === "blocked_store",
        error: message,
      });
      throw new HttpsError(codeForError(error), message, detailsForError(error));
    }
  }
);
