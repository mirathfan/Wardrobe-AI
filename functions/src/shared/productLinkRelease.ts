import { logger } from "./logger";

import { redactUrlForLogs } from "./safeFetch";

export const PRODUCT_LINK_EXTRACTION_V2_FLAG = "PRODUCT_LINK_EXTRACTION_V2_ENABLED";

export type ProductLinkWarningCode =
  | "FETCH_FAILED"
  | "FETCH_BLOCKED"
  | "EMPTY_HTML"
  | "NO_STRUCTURED_DATA"
  | "MALFORMED_JSON_LD"
  | "NO_PRODUCT_IMAGE"
  | "NO_PRICE"
  | "PRICE_UNRELIABLE"
  | "AMAZON_PRICE_UNAVAILABLE"
  | "STOCKX_MARKET_PRICE_UNAVAILABLE"
  | "IMAGE_NORMALIZATION_FAILED"
  | "PARTIAL_EXTRACTION"
  | "CLIENT_PREVIEW_FALLBACK_USED"
  | "IMPORT_REQUIRES_IMAGE";

export type ProductLinkFailureCode =
  | ProductLinkWarningCode
  | "INVALID_URL"
  | "UNSAFE_URL"
  | "NO_PRODUCT_METADATA"
  | "DRAFT_FAILED"
  | "UNKNOWN_ERROR";

export type ProductLinkResultStatus = "success" | "partial" | "failed";

type DiagnosticLike = {
  normalizedDomain?: string | null;
  adapterName?: string | null;
  extractionSource?: string | null;
  selectedImageReason?: string | null;
  titleConfidence?: string | null;
  brandConfidence?: string | null;
  categoryConfidence?: string | null;
  imageConfidence?: string | null;
  priceConfidence?: string | null;
  hadStructuredData?: boolean | null;
  hadOpenGraph?: boolean | null;
  hadEmbeddedState?: boolean | null;
  hadRetailerAdapter?: boolean | null;
  candidateImageCount?: number | null;
  missingFields?: unknown;
  extractionWarnings?: unknown;
  warningCodes?: unknown;
  primaryImageHost?: string | null;
};

type MetadataLike = {
  domain?: string | null;
  retailer?: string | null;
  adapterName?: string | null;
  extractionSource?: string | null;
  selectedImageReason?: string | null;
  titleConfidence?: string | null;
  brandConfidence?: string | null;
  categoryConfidence?: string | null;
  imageConfidence?: string | null;
  priceConfidence?: string | null;
  imageUrl?: string | null;
  imageUrls?: unknown;
  primaryImage?: string | null;
  price?: string | number | null;
  priceAmount?: number | null;
  salePrice?: number | null;
  priceUnavailable?: boolean | null;
  marketPriceUnavailable?: boolean | null;
  extractionDiagnostics?: DiagnosticLike | null;
};

type ErrorLike = {
  code?: string | null;
  details?: Record<string, unknown> | null;
};

export type ProductLinkLogMetadata = {
  normalizedDomain?: string | null;
  retailer?: string | null;
  adapterName?: string | null;
  extractionSource?: string | null;
  selectedImageReason?: string | null;
  titleConfidence?: string | null;
  brandConfidence?: string | null;
  categoryConfidence?: string | null;
  imageConfidence?: string | null;
  priceConfidence?: string | null;
  hadStructuredData?: boolean | null;
  hadOpenGraph?: boolean | null;
  hadEmbeddedState?: boolean | null;
  hadRetailerAdapter?: boolean | null;
  candidateImageCount?: number | null;
  missingFields?: string[];
  warningCodes?: ProductLinkWarningCode[];
  failureCode?: ProductLinkFailureCode | null;
  durationMs?: number | null;
  resultStatus?: ProductLinkResultStatus;
  featureFlagEnabled?: boolean;
  primaryImageHost?: string | null;
};

export function isProductLinkExtractionV2Enabled(env = process.env): boolean {
  const raw = env[PRODUCT_LINK_EXTRACTION_V2_FLAG];
  if (raw == null || raw === "") return false;
  return /^(1|true|yes|on|enabled)$/i.test(raw);
}

function cleanCodeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_:.-]/g, "")
    .toLowerCase();
}

function uniqueCodes(codes: Array<ProductLinkWarningCode | null | undefined>) {
  return Array.from(new Set(codes.filter((code): code is ProductLinkWarningCode => !!code)));
}

function safeStringList(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").replace(/\s+/g, "_").slice(0, 80))
    .filter(Boolean)
    .slice(0, maxItems);
}

function hostFromUrl(rawUrl?: string | null) {
  try {
    return rawUrl ? new URL(rawUrl).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function normalizedDomainForProductLink(rawUrl: string | URL | null | undefined) {
  try {
    const url = rawUrl instanceof URL ? rawUrl : new URL(String(rawUrl ?? ""));
    return url.hostname.toLowerCase().replace(/^(?:www\d*|m|mobile)\./, "");
  } catch {
    return null;
  }
}

export function warningCodeForProductLinkWarning(warning: unknown): ProductLinkWarningCode | null {
  const normalized = cleanCodeText(warning);
  if (!normalized) return null;
  if (normalized.includes("client_preview_fallback")) return "CLIENT_PREVIEW_FALLBACK_USED";
  if (normalized.includes("image_url_validation") || normalized.includes("image_normalization")) {
    return "IMAGE_NORMALIZATION_FAILED";
  }
  if (normalized.includes("blocked") || normalized.includes("captcha") || normalized.includes("bot_check")) {
    return "FETCH_BLOCKED";
  }
  if (normalized.includes("fetch_failed")) return "FETCH_FAILED";
  if (normalized.includes("empty_html") || normalized.includes("near_empty_html")) return "EMPTY_HTML";
  if (normalized.includes("malformed_json_ld")) return "MALFORMED_JSON_LD";
  if (normalized.includes("missing_image") || normalized.includes("no_images")) return "NO_PRODUCT_IMAGE";
  if (normalized.includes("amazon") && normalized.includes("price")) return "AMAZON_PRICE_UNAVAILABLE";
  if (normalized.includes("stockx") && normalized.includes("price")) return "STOCKX_MARKET_PRICE_UNAVAILABLE";
  if (normalized.includes("price_unavailable") || normalized.includes("unreliable_price")) return "PRICE_UNRELIABLE";
  if (normalized.includes("missing_price") || normalized.includes("no_price")) return "NO_PRICE";
  if (normalized.includes("partial")) return "PARTIAL_EXTRACTION";
  if (normalized.includes("no_structured_data")) return "NO_STRUCTURED_DATA";
  return null;
}

export function warningCodesForProductLinkDiagnostics(
  diagnostics?: DiagnosticLike | null,
  extraWarnings: unknown[] = [],
  metadata?: MetadataLike | null,
): ProductLinkWarningCode[] {
  const warnings = [
    ...safeStringList(diagnostics?.extractionWarnings, 24),
    ...safeStringList(diagnostics?.warningCodes, 24),
    ...extraWarnings,
  ];
  const missingFields = safeStringList(diagnostics?.missingFields, 12);
  const retailer = String(metadata?.retailer ?? "").toLowerCase();
  const adapter = String(diagnostics?.adapterName ?? metadata?.adapterName ?? "").toLowerCase();
  const domain = String(diagnostics?.normalizedDomain ?? metadata?.domain ?? "").toLowerCase();
  const isAmazon = retailer.includes("amazon") || domain.includes("amazon.");
  const isStockX = retailer.includes("stockx") || adapter === "stockx" || domain.includes("stockx.");
  const codes = warnings.map(warningCodeForProductLinkWarning);
  const hasPrice =
    typeof metadata?.priceAmount === "number" ||
    typeof metadata?.salePrice === "number" ||
    (typeof metadata?.price === "string" && /\d/.test(metadata.price)) ||
    typeof metadata?.price === "number";
  const hasImage =
    !!metadata?.imageUrl ||
    !!metadata?.primaryImage ||
    (Array.isArray(metadata?.imageUrls) && metadata.imageUrls.length > 0);

  if (diagnostics?.hadStructuredData === false) codes.push("NO_STRUCTURED_DATA");
  if (missingFields.includes("image") && !hasImage) codes.push("NO_PRODUCT_IMAGE");
  if (missingFields.includes("price") && !hasPrice) {
    if (isAmazon) codes.push("AMAZON_PRICE_UNAVAILABLE");
    else if (isStockX) codes.push("STOCKX_MARKET_PRICE_UNAVAILABLE");
    else codes.push("NO_PRICE");
  }
  if (metadata?.priceUnavailable && isAmazon) codes.push("AMAZON_PRICE_UNAVAILABLE");
  else if (metadata?.priceUnavailable) codes.push("PRICE_UNRELIABLE");
  if (metadata?.marketPriceUnavailable && isStockX) codes.push("STOCKX_MARKET_PRICE_UNAVAILABLE");

  const unique = uniqueCodes(codes);
  return unique.filter((code) => {
    if (hasImage && code === "NO_PRODUCT_IMAGE") return false;
    if (hasPrice && !metadata?.priceUnavailable && !metadata?.marketPriceUnavailable) {
      return code !== "NO_PRICE" && code !== "PRICE_UNRELIABLE";
    }
    return true;
  });
}

export function productLinkFailureCodeForError(
  error: unknown,
  phase: "preview" | "import" = "preview",
): ProductLinkFailureCode {
  const code = String((error as ErrorLike | null)?.code ?? "").toLowerCase();
  if (code === "invalid_url") return "INVALID_URL";
  if (code === "unsafe_url") return "UNSAFE_URL";
  if (code === "blocked_store") return "FETCH_BLOCKED";
  if (code === "fetch_failed") return "FETCH_FAILED";
  if (code === "no_images") return phase === "import" ? "IMPORT_REQUIRES_IMAGE" : "NO_PRODUCT_IMAGE";
  if (code === "no_metadata") return "NO_PRODUCT_METADATA";
  if (code === "draft_failed") return "DRAFT_FAILED";
  if ((error as ErrorLike | null)?.details?.blockedStore === true) return "FETCH_BLOCKED";
  return "UNKNOWN_ERROR";
}

export function productLinkUserMessageForFailure(
  failureCode: ProductLinkFailureCode | null | undefined,
  phase: "preview" | "import" = "preview",
) {
  switch (failureCode) {
    case "FETCH_BLOCKED":
      return "We couldn't fully read this product page. Try another link, upload a screenshot, or add manually.";
    case "NO_PRODUCT_IMAGE":
    case "IMPORT_REQUIRES_IMAGE":
      return "We found product details, but couldn't find a usable product image.";
    case "NO_PRICE":
    case "PRICE_UNRELIABLE":
    case "AMAZON_PRICE_UNAVAILABLE":
    case "STOCKX_MARKET_PRICE_UNAVAILABLE":
      return "Price may need to be added manually.";
    case "INVALID_URL":
      return "That product link doesn't look valid.";
    case "UNSAFE_URL":
      return "That product link isn't safe to fetch.";
    case "NO_PRODUCT_METADATA":
    case "EMPTY_HTML":
    case "PARTIAL_EXTRACTION":
      return phase === "import"
        ? "We couldn't read enough product details to import this item."
        : "We couldn't fully read this product page, but you may be able to add it manually.";
    default:
      return phase === "import"
        ? "Could not import that product link."
        : "I couldn't read this product page. Try another link, upload a screenshot, or add manually.";
  }
}

export function resultStatusForProductLink(params: {
  failureCode?: ProductLinkFailureCode | null;
  warningCodes?: ProductLinkWarningCode[];
  missingFields?: string[];
  hasTitle?: boolean;
  hasImage?: boolean;
}): ProductLinkResultStatus {
  if (params.failureCode) return "failed";
  const warnings = new Set(params.warningCodes ?? []);
  const missing = new Set(params.missingFields ?? []);
  if (
    warnings.has("FETCH_BLOCKED") ||
    warnings.has("CLIENT_PREVIEW_FALLBACK_USED") ||
    warnings.has("PARTIAL_EXTRACTION") ||
    warnings.has("NO_PRODUCT_IMAGE") ||
    missing.has("title") ||
    missing.has("image") ||
    params.hasTitle === false ||
    params.hasImage === false
  ) {
    return "partial";
  }
  return "success";
}

export function buildProductLinkLogMetadata(params: {
  rawUrl?: string | URL | null;
  metadata?: MetadataLike | null;
  diagnostics?: DiagnosticLike | null;
  selectedImageReason?: string | null;
  candidateImageCount?: number | null;
  primaryImageUrl?: string | null;
  extraWarnings?: unknown[];
  failureCode?: ProductLinkFailureCode | null;
  durationMs?: number | null;
  featureFlagEnabled?: boolean;
  resultStatus?: ProductLinkResultStatus;
}): ProductLinkLogMetadata {
  const diagnostics = params.diagnostics ?? params.metadata?.extractionDiagnostics ?? null;
  const metadataWithEvidence: MetadataLike | null = params.metadata
    ? {
      ...params.metadata,
      imageUrl: params.primaryImageUrl ?? params.metadata.imageUrl ?? null,
      imageUrls:
        params.primaryImageUrl || (params.candidateImageCount ?? 0) > 0
          ? [params.primaryImageUrl ?? params.metadata.imageUrl].filter(Boolean)
          : params.metadata.imageUrls,
    }
    : null;
  const warningCodes = warningCodesForProductLinkDiagnostics(
    diagnostics,
    params.extraWarnings ?? [],
    metadataWithEvidence,
  );
  const missingFields = safeStringList(diagnostics?.missingFields, 12);
  return {
    normalizedDomain:
      diagnostics?.normalizedDomain ??
      params.metadata?.domain ??
      normalizedDomainForProductLink(params.rawUrl),
    retailer: params.metadata?.retailer ?? null,
    adapterName: diagnostics?.adapterName ?? params.metadata?.adapterName ?? null,
    extractionSource: diagnostics?.extractionSource ?? params.metadata?.extractionSource ?? null,
    selectedImageReason:
      params.selectedImageReason ??
      diagnostics?.selectedImageReason ??
      params.metadata?.selectedImageReason ??
      null,
    titleConfidence: diagnostics?.titleConfidence ?? params.metadata?.titleConfidence ?? null,
    brandConfidence: diagnostics?.brandConfidence ?? params.metadata?.brandConfidence ?? null,
    categoryConfidence: diagnostics?.categoryConfidence ?? params.metadata?.categoryConfidence ?? null,
    imageConfidence: diagnostics?.imageConfidence ?? params.metadata?.imageConfidence ?? null,
    priceConfidence: diagnostics?.priceConfidence ?? params.metadata?.priceConfidence ?? null,
    hadStructuredData: diagnostics?.hadStructuredData ?? null,
    hadOpenGraph: diagnostics?.hadOpenGraph ?? null,
    hadEmbeddedState: diagnostics?.hadEmbeddedState ?? null,
    hadRetailerAdapter: diagnostics?.hadRetailerAdapter ?? null,
    candidateImageCount:
      params.candidateImageCount ??
      diagnostics?.candidateImageCount ??
      (Array.isArray(params.metadata?.imageUrls) ? params.metadata.imageUrls.length : null),
    missingFields,
    warningCodes,
    failureCode: params.failureCode ?? null,
    durationMs: params.durationMs ?? null,
    resultStatus:
      params.resultStatus ??
      resultStatusForProductLink({
        failureCode: params.failureCode ?? null,
        warningCodes,
        missingFields,
      }),
    featureFlagEnabled: params.featureFlagEnabled,
    primaryImageHost:
      diagnostics?.primaryImageHost ??
      hostFromUrl(params.primaryImageUrl ?? params.metadata?.imageUrl ?? params.metadata?.primaryImage ?? null),
  };
}

export function logProductLinkEvent(event: string, payload: ProductLinkLogMetadata) {
  if (payload.failureCode) {
    logger.error(event, payload);
  } else {
    logger.info(event, payload);
  }
}

export function redactedProductLinkUrl(rawUrl: string | URL | null | undefined) {
  return redactUrlForLogs(rawUrl ?? null);
}
