#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

let productLinkExtractor;
let productExtractionPipeline;
let nikeFootwearImageRanking;
let productLinkRelease;
try {
  productLinkExtractor = require("../lib/functions/src/shared/productLinkExtractor.js");
  productExtractionPipeline = require("../lib/functions/src/shared/productExtractionPipeline.js");
  nikeFootwearImageRanking = require("../lib/functions/src/shared/nikeFootwearImageRanking.js");
  productLinkRelease = require("../lib/functions/src/shared/productLinkRelease.js");
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    warnings: [
      "compiled_functions_missing: run npm --prefix functions run build before smoke testing product links",
      error instanceof Error ? error.message : String(error),
    ],
  }, null, 2));
  process.exit(0);
}

const {
  ProductLinkError,
  buildCompatibilityClosetDraftFieldsFromProductExtraction,
  buildClosetDraftFieldsFromProductExtraction,
  extractProductImagesFromHtml,
  extractProductMetadataFromHtml,
  fetchResolvedProductPage,
  filterSafeExternalImageUrls,
  validateProductUrl,
} = productLinkExtractor;
const {
  normalizeProductUrl,
} = productExtractionPipeline;
const {
  applyNikeFootwearImagePreference,
} = nikeFootwearImageRanking;
const {
  isProductLinkExtractionV2Enabled,
  productLinkFailureCodeForError,
  resultStatusForProductLink,
  warningCodesForProductLinkDiagnostics,
} = productLinkRelease;

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}

function warningFor(error) {
  if (error instanceof ProductLinkError) return `${error.code}:${error.message}`;
  return messageFor(error);
}

function parseArgs(argv) {
  const options = {
    json: false,
    saveOutput: null,
    showDiagnostics: false,
    urls: [],
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--show-diagnostics") options.showDiagnostics = true;
    else if (arg === "--save-output") {
      options.saveOutput = argv[index + 1] ?? null;
      index++;
    } else {
      options.urls.push(arg);
    }
  }
  return options;
}

async function inspectUrl(rawUrl, options) {
  const startedAt = Date.now();
  const featureFlagEnabled = isProductLinkExtractionV2Enabled();
  let normalized;
  try {
    const validated = await validateProductUrl(rawUrl);
    normalized = normalizeProductUrl(validated);
  } catch (error) {
    const failureCode = productLinkFailureCodeForError(error, "preview");
    return {
      inputUrl: rawUrl,
      ok: false,
      durationMs: Date.now() - startedAt,
      resultStatus: "failed",
      failureCode,
      warningCodes: warningCodesForProductLinkDiagnostics(null, [failureCode]),
      featureFlagEnabled,
      importWouldRequireManualImage: true,
      importWouldRequireManualPrice: true,
      warnings: [`url_validation_failed:${warningFor(error)}`],
    };
  }

  let page;
  try {
    page = await fetchResolvedProductPage(normalized.url);
  } catch (error) {
    const failureCode = productLinkFailureCodeForError(error, "preview");
    return {
      inputUrl: rawUrl,
      ok: false,
      normalizedUrl: normalized.normalizedUrl,
      detectedRetailer: normalized.retailer,
      sourceDomain: normalized.canonicalDomain,
      durationMs: Date.now() - startedAt,
      resultStatus: "failed",
      failureCode,
      warningCodes: warningCodesForProductLinkDiagnostics(null, [failureCode], {
        domain: normalized.canonicalDomain,
        retailer: normalized.retailer,
      }),
      featureFlagEnabled,
      importWouldRequireManualImage: true,
      importWouldRequireManualPrice: true,
      warnings: [`fetch_failed:${warningFor(error)}`],
    };
  }

  const warnings = [];
  let metadata = null;
  let imageUrls = [];
  try {
    metadata = extractProductMetadataFromHtml(page.finalUrl.toString(), page.html);
  } catch (error) {
    warnings.push(`metadata_failed:${warningFor(error)}`);
  }
  try {
    imageUrls = extractProductImagesFromHtml(page.finalUrl.toString(), page.html);
  } catch (error) {
    warnings.push(`images_failed:${warningFor(error)}`);
  }

  let safeImageUrls = imageUrls;
  try {
    safeImageUrls = await filterSafeExternalImageUrls(imageUrls, {
      domain: page.finalUrl.hostname,
    });
  } catch (error) {
    warnings.push(`image_url_validation_failed:${warningFor(error)}`);
  }

  const diagnostics = metadata?.extractionDiagnostics ?? null;
  let selectedImageReason = metadata?.selectedImageReason ?? null;
  if (metadata && safeImageUrls.length) {
    const nikePreference = applyNikeFootwearImagePreference(
      safeImageUrls.map((url, index) => ({
        url,
        sourceIndex: index,
      })),
      {
        sourceUrl: metadata.sourceUrl,
        title: metadata.title,
        description: metadata.description,
        categoryHints: [
          metadata.category,
          metadata.subCategory,
          ...(metadata.categoryHints ?? []),
        ],
      },
    );
    if (nikePreference.selectedImageReason) {
      safeImageUrls = nikePreference.candidates.map((candidate) => candidate.url);
      selectedImageReason = nikePreference.selectedImageReason;
    }
  }
  const extraction = {
    metadata: metadata ?? {
      sourceUrl: normalized.normalizedUrl,
      domain: normalized.canonicalDomain,
      retailer: normalized.retailer ?? normalized.canonicalDomain,
    },
    imageUrls: safeImageUrls,
    selectedImageReason,
  };
  const closetDraft = metadata
    ? (featureFlagEnabled
      ? buildClosetDraftFieldsFromProductExtraction(extraction, {
        includePriceFields: true,
      })
      : buildCompatibilityClosetDraftFieldsFromProductExtraction(extraction, {
        includePriceFields: true,
      }))
    : null;
  const warningCodes = warningCodesForProductLinkDiagnostics(diagnostics, warnings, metadata
    ? {
      ...metadata,
      imageUrl: safeImageUrls[0] ?? null,
      imageUrls: safeImageUrls,
    }
    : null);
  const resultStatus = resultStatusForProductLink({
    warningCodes,
    missingFields: diagnostics?.missingFields ?? [],
    hasTitle: !!(closetDraft?.name ?? metadata?.title),
    hasImage: safeImageUrls.length > 0,
  });
  const importWouldRequireManualPrice =
    metadata?.priceUnavailable === true ||
    metadata?.marketPriceUnavailable === true ||
    !(
      typeof metadata?.priceAmount === "number" ||
      typeof metadata?.salePrice === "number" ||
      metadata?.price
    );
  const result = {
    inputUrl: rawUrl,
    ok: !!(metadata?.title || safeImageUrls.length),
    durationMs: Date.now() - startedAt,
    resultStatus,
    failureCode: null,
    warningCodes,
    featureFlagEnabled,
    normalizedUrl: metadata?.sourceUrl ?? normalized.normalizedUrl,
    canonicalUrl: metadata?.canonicalUrl ?? metadata?.sourceUrl ?? normalized.normalizedUrl,
    finalUrl: page.finalUrl.toString(),
    detectedRetailer: metadata?.retailer ?? normalized.retailer,
    sourceDomain: metadata?.domain ?? normalized.canonicalDomain,
    title: metadata?.title ?? null,
    cleanedTitle: closetDraft?.name ?? metadata?.title ?? null,
    brand: metadata?.brand ?? null,
    category: closetDraft?.category ?? metadata?.category ?? null,
    subCategory: closetDraft?.subCategory ?? metadata?.subCategory ?? null,
    color: closetDraft?.displayColor ?? metadata?.displayColor ?? metadata?.color ?? null,
    price: metadata?.price ?? null,
    priceAmount: metadata?.priceAmount ?? null,
    salePrice: metadata?.salePrice ?? null,
    originalPrice: metadata?.originalPrice ?? null,
    currency: metadata?.currency ?? metadata?.priceCurrency ?? null,
    primaryImage: safeImageUrls[0] ?? null,
    imageCount: safeImageUrls.length,
    importWouldRequireManualImage: safeImageUrls.length === 0,
    importWouldRequireManualPrice,
    selectedImageReason,
    extractionSource: metadata?.extractionSource ?? null,
    adapterName: metadata?.adapterName ?? null,
    titleConfidence: metadata?.titleConfidence ?? null,
    brandConfidence: metadata?.brandConfidence ?? null,
    categoryConfidence: metadata?.categoryConfidence ?? null,
    subcategoryConfidence: metadata?.subcategoryConfidence ?? null,
    colorConfidence: metadata?.colorConfidence ?? null,
    priceConfidence: metadata?.priceConfidence ?? null,
    imageConfidence: metadata?.imageConfidence ?? null,
    missingFields: diagnostics?.missingFields ?? [],
    warnings: Array.from(new Set([...(diagnostics?.extractionWarnings ?? []), ...warnings])),
  };
  if (options.showDiagnostics) {
    result.diagnostics = diagnostics;
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2).filter(Boolean));
  if (!options.urls.length) {
    console.log("Usage: npm --prefix functions run smoke:product-links -- [--json] [--show-diagnostics] [--save-output ./tmp/product-link-smoke.json] <url> [url...]");
    console.log("No URLs supplied; nothing to smoke test.");
    return;
  }

  const results = [];
  for (const rawUrl of options.urls) {
    const result = await inspectUrl(rawUrl, options);
    results.push(result);
    if (!options.json) {
      console.log([
        `URL: ${result.inputUrl}`,
        `  status: ${result.resultStatus}${result.failureCode ? ` (${result.failureCode})` : ""} duration=${result.durationMs}ms flagV2=${result.featureFlagEnabled ? "on" : "off"}`,
        `  normalized: ${result.normalizedUrl}`,
        `  canonical: ${result.canonicalUrl ?? "n/a"}`,
        `  retailer: ${result.detectedRetailer ?? "unknown"} (${result.adapterName ?? "no adapter"})`,
        `  title: ${result.cleanedTitle ?? result.title ?? "missing"}`,
        `  brand: ${result.brand ?? "missing"}`,
        `  category: ${result.category ?? "missing"}${result.subCategory ? ` / ${result.subCategory}` : ""}`,
        `  color: ${result.color ?? "missing"}`,
        `  price: ${result.priceAmount ?? result.price ?? "missing"}${result.salePrice ? ` sale=${result.salePrice}` : ""}${result.currency ? ` ${result.currency}` : ""}`,
        `  image: ${result.primaryImage ?? "missing"} (${result.imageCount})`,
        `  selectedImageReason: ${result.selectedImageReason ?? "none"}`,
        `  confidence: title=${result.titleConfidence ?? "n/a"} brand=${result.brandConfidence ?? "n/a"} category=${result.categoryConfidence ?? "n/a"} color=${result.colorConfidence ?? "n/a"} price=${result.priceConfidence ?? "n/a"} image=${result.imageConfidence ?? "n/a"}`,
        `  missing: ${result.missingFields.join(", ") || "none"}`,
        `  warningCodes: ${result.warningCodes.join(", ") || "none"}`,
        `  importNeedsManual: image=${result.importWouldRequireManualImage ? "yes" : "no"} price=${result.importWouldRequireManualPrice ? "yes" : "no"}`,
        `  warnings: ${result.warnings.join(", ") || "none"}`,
      ].join("\n"));
    }
  }
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  }
  if (options.saveOutput) {
    const outputPath = path.resolve(process.cwd(), options.saveOutput);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`);
    if (!options.json) {
      console.log(`Saved smoke output to ${outputPath}`);
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    warnings: [`unexpected_error:${messageFor(error)}`],
  }, null, 2));
  process.exitCode = 0;
});
