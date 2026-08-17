import {
  ProductLinkError,
  buildClosetDraftFieldsFromProductExtraction,
  buildCompatibilityClosetDraftFieldsFromProductExtraction,
  extractProductImagesFromHtml,
  extractProductMetadataFromHtml,
  type ProductExtraction,
} from "./productLinkExtractor";
import { extractGenericProductDataSync } from "./productExtractionPipeline";
import {
  PRODUCT_LINK_EXTRACTION_V2_FLAG,
  buildProductLinkLogMetadata,
  isProductLinkExtractionV2Enabled,
  productLinkFailureCodeForError,
  productLinkUserMessageForFailure,
  resultStatusForProductLink,
  warningCodesForProductLinkDiagnostics,
} from "./productLinkRelease";
import { NIKE_FOOTWEAR_LEFT_PROFILE_REASON } from "./nikeFootwearImageRanking";
import { runNikeFootwearImageRankingFixture } from "./nikeFootwearImageRanking.fixture";
import {
  canUseHmBlockedStorePreviewFallback,
  hmProductIdFromUrl,
  hmSanitizedClientPreview,
  hmSingleImageClientPreview,
  isHmProductUrl,
  type AuraLinkPreview,
} from "./auraUrlCandidatePreview";
import { productUrlMetadataFromProductExtraction } from "./productUrlMetadata";

type FixtureResult = {
  name: string;
  passed: boolean;
  details?: Record<string, unknown>;
};

function pass(name: string, passed: boolean, details?: Record<string, unknown>): FixtureResult {
  return { name, passed, details };
}

function extractionFromHtml(url: string, html: string, selectedImageReason?: string | null): ProductExtraction {
  const metadata = extractProductMetadataFromHtml(url, html);
  return {
    metadata,
    imageUrls: extractProductImagesFromHtml(url, html),
    selectedImageReason: selectedImageReason ?? metadata.selectedImageReason ?? null,
  };
}

function withTemporaryFlag(value: string | undefined, fn: () => boolean) {
  const previous = process.env[PRODUCT_LINK_EXTRACTION_V2_FLAG];
  if (value == null) delete process.env[PRODUCT_LINK_EXTRACTION_V2_FLAG];
  else process.env[PRODUCT_LINK_EXTRACTION_V2_FLAG] = value;
  try {
    return fn();
  } finally {
    if (previous == null) delete process.env[PRODUCT_LINK_EXTRACTION_V2_FLAG];
    else process.env[PRODUCT_LINK_EXTRACTION_V2_FLAG] = previous;
  }
}

const sneakerHtml = `
  <script type="application/json">
    {"product":{"name":"Example Runner Shoes","brand":"Example Brand","category":"Sneakers","price":"120.00","currency":"USD","color":"Black/White","images":["https://cdn.example.com/products/runner-product-main-1400.jpg"]}}
  </script>`;

const blockedHtml = `
  <html><head><title>Access Denied</title></head><body>Captcha required. Verify you are human.</body></html>`;

const amazonHtml = `
  <meta property="og:title" content="Amazon.com: Example Brand Running Shoes : Clothing, Shoes & Jewelry" />
  <meta property="og:image" content="https://m.media-amazon.com/images/I/running-shoe-product-main.jpg" />`;

const stockXHtml = `
  <script type="application/json">{"product":{"title":"Nike Dunk Low Panda","brand":"Nike","category":"Sneakers","colorway":"White Black","styleId":"DD1391-100","image":"https://images.stockx.com/images/Nike-Dunk-Low-Panda-product.jpg"}}</script>`;

const nikeHtml = `
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Nike Air Force 1 '07 Men's Shoes. Nike.com","brand":{"name":"Nike"},"category":"Men's Shoes","color":"Summit White/Black","image":["https://static.nike.com/a/images/t_PDP_1728_v1/air-force-1-left-profile-product.jpg"],"offers":{"@type":"Offer","price":"115.00","priceCurrency":"USD"}}
  </script>`;

const hmUrl = "https://www2.hm.com/en_in/productpage.1288186012.html";
const hmHtml = `
  <script type="application/json">
    {"product":{"title":"Light denim blue loose HM.com","brand":"H&M","images":["https://image.hm.com/assets/hm/38/bd/38bd797400d45df21dba6ffd60b7482019a3a4c0.jpg?imwidth=768"]}}
  </script>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","name":"Loose Straight Jeans","brand":{"name":"H&M"},"color":"Light denim blue","sku":"1288186012","category":{"name":"Loose"},"image":["https://image.hm.com/assets/hm/38/bd/38bd797400d45df21dba6ffd60b7482019a3a4c0.jpg?imwidth=768"],"offers":{"@type":"Offer","price":"2699.0","priceCurrency":"INR"}}
  </script>`;

export function runProductLinkReleaseFixture() {
  const extraction = extractionFromHtml("https://example.com/products/runner", sneakerHtml);
  const v2Draft = buildClosetDraftFieldsFromProductExtraction(extraction, {
    includePriceFields: true,
  });
  const compatDraft = buildCompatibilityClosetDraftFieldsFromProductExtraction(extraction, {
    includePriceFields: true,
  });
  const blocked = extractGenericProductDataSync("https://example.com/products/blocked", blockedHtml);
  const amazon = extractGenericProductDataSync("https://www.amazon.com/dp/B08N5WRWNW", amazonHtml);
  const stockX = extractGenericProductDataSync("https://stockx.com/nike-dunk-low-panda", stockXHtml);
  const nike = extractionFromHtml(
    "https://www.nike.com/t/air-force-1-07-mens-shoes/CW2288-111",
    nikeHtml,
    NIKE_FOOTWEAR_LEFT_PROFILE_REASON,
  );
  const hmExtraction = extractionFromHtml(hmUrl, hmHtml);
  const safeLog = buildProductLinkLogMetadata({
    rawUrl: "https://example.com/products/runner?utm_source=test",
    metadata: extraction.metadata,
    diagnostics: extraction.metadata.extractionDiagnostics,
    primaryImageUrl: extraction.imageUrls[0] ?? null,
    durationMs: 42,
    featureFlagEnabled: true,
  });
  const fallbackStatus = resultStatusForProductLink({
    warningCodes: ["CLIENT_PREVIEW_FALLBACK_USED"],
    missingFields: [],
    hasTitle: true,
    hasImage: true,
  });
  const importImageFailure = productLinkFailureCodeForError(
    new ProductLinkError("No product image found.", "no_images"),
    "import",
  );
  const noHtmlInPayload = !JSON.stringify({
    ...safeLog,
    html: undefined,
  }).includes("<html");
  const hmPreview: AuraLinkPreview = {
    sourceUrl: hmUrl,
    title: "Loose Straight Jeans",
    imageUrl: "https://image.hm.com/assets/hm/38/bd/38bd797400d45df21dba6ffd60b7482019a3a4c0.jpg?imwidth=1260",
    imageUrls: [
      "https://image.hm.com/assets/hm/38/bd/38bd797400d45df21dba6ffd60b7482019a3a4c0.jpg?imwidth=1260",
      "https://cdn.example.com/not-hm.jpg",
    ],
    description: "Product 1288186012",
    brand: "H&M",
  };
  const sanitizedHmPreview = hmSanitizedClientPreview(hmPreview);
  const invalidHmPreview: AuraLinkPreview = {
    ...hmPreview,
    imageUrl: "https://cdn.example.com/not-hm.jpg",
    imageUrls: ["https://cdn.example.com/not-hm.jpg"],
  };
  const blockedFallbackStatus = resultStatusForProductLink({
    warningCodes: ["FETCH_BLOCKED", "CLIENT_PREVIEW_FALLBACK_USED"],
    missingFields: [],
    hasTitle: true,
    hasImage: true,
  });
  const nikeFixture = runNikeFootwearImageRankingFixture();
  const hmPreviewMetadata = productUrlMetadataFromProductExtraction(hmExtraction);

  const results: FixtureResult[] = [
    pass("Feature flag defaults off", withTemporaryFlag(undefined, () => isProductLinkExtractionV2Enabled() === false)),
    pass("Feature flag enabled value", withTemporaryFlag("true", () => isProductLinkExtractionV2Enabled() === true)),
    pass("Feature flag disabled value", withTemporaryFlag("0", () => isProductLinkExtractionV2Enabled() === false)),
    pass("Feature flag on uses normalized closet category", v2Draft.category === "footwear" && v2Draft.subCategory === "sneaker"),
    pass("Feature flag off compatibility draft preserves old category shape", compatDraft.category === "top" && compatDraft.subCategory === "" && !!compatDraft.photoUrl),
    pass("Preview partial fallback status", fallbackStatus === "partial"),
    pass("Import missing image failure code", importImageFailure === "IMPORT_REQUIRES_IMAGE"),
    pass("Missing image fallback message", productLinkUserMessageForFailure(importImageFailure, "import").includes("usable product image")),
    pass("Blocked-like page warning code", blocked.diagnostics?.warningCodes.includes("FETCH_BLOCKED") === true),
    pass("Amazon unavailable price warning", amazon.diagnostics?.warningCodes.includes("AMAZON_PRICE_UNAVAILABLE") === true),
    pass("StockX unavailable market warning", stockX.diagnostics?.warningCodes.includes("STOCKX_MARKET_PRICE_UNAVAILABLE") === true),
    pass("Nike selectedImageReason preservation", nike.selectedImageReason === NIKE_FOOTWEAR_LEFT_PROFILE_REASON),
    pass("Non-Nike does not use Nike reason", extraction.selectedImageReason !== NIKE_FOOTWEAR_LEFT_PROFILE_REASON),
    pass("Diagnostics/log payload safe fields only", noHtmlInPayload && safeLog.normalizedDomain === "example.com"),
    pass("Backward compatible response fields", ["category", "subCategory", "sourceUrl", "photoUrl", "linkMetadata"].every((key) => key in compatDraft)),
    pass("Safe warning code normalization", warningCodesForProductLinkDiagnostics(blocked.diagnostics).includes("FETCH_BLOCKED")),
    pass("H&M blocked_store with sanitized preview can fall back", !!sanitizedHmPreview && canUseHmBlockedStorePreviewFallback(hmUrl, sanitizedHmPreview) && blockedFallbackStatus === "partial"),
    pass("H&M blocked_store without image.hm.com image stays terminal", hmSanitizedClientPreview(invalidHmPreview) === null && !canUseHmBlockedStorePreviewFallback(hmUrl, invalidHmPreview)),
    pass("Non-H&M blocked_store cannot use H&M fallback", !canUseHmBlockedStorePreviewFallback("https://example.com/products/1288186012", sanitizedHmPreview)),
    pass("H&M www2 product URL recognized", isHmProductUrl(hmUrl)),
    pass("H&M product ID extracted", hmProductIdFromUrl(hmUrl) === "1288186012"),
    pass("H&M single-image fallback rejects non-H&M images", hmSingleImageClientPreview(invalidHmPreview) === null),
    pass("H&M structured product title beats generic app-state title", hmExtraction.metadata.title === "Loose Straight Jeans" && hmExtraction.metadata.priceAmount === 2699 && hmExtraction.metadata.currency === "INR"),
    pass("H&M preview metadata bypass preserves dedicated extraction", hmPreviewMetadata.title === "Loose Straight Jeans" && hmPreviewMetadata.imageUrl?.includes("image.hm.com") === true),
    pass("Nike image ranking regression fixture", nikeFixture.passed),
  ];

  return {
    passed: results.every((result) => result.passed),
    results,
  };
}
