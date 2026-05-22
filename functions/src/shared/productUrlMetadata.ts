import * as cheerio from "cheerio";
import { logger } from "firebase-functions/v2";
import {
  BLOCKED_STORE_MESSAGE,
  ProductLinkError,
  extractAmazonLinkData,
  filterSafeExternalImageUrls,
  extractNikeSelectedVariantData,
  extractProductImagesFromHtml,
  extractProductMetadataFromHtml,
  isAmazonProductUrl,
  validateProductUrl,
} from "./productLinkExtractor";
import { redactUrlForLogs, safeFetch, SafeFetchExpectedKind } from "./safeFetch";

export type ProductUrlMetadata = {
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
  confidence?: number | null;
  status?: "ready" | "needs_review";
};

const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const PRODUCT_PAGE_FAILURE_MESSAGE =
  "I couldn't read this product page. Try another link, upload a screenshot, or add manually.";

function isHmHost(url: URL) {
  const hostname = url.hostname.toLowerCase();
  return hostname === "hm.com" || hostname.endsWith(".hm.com");
}

function isZaraHost(url: URL) {
  const hostname = url.hostname.toLowerCase();
  return hostname === "zara.com" || hostname.endsWith(".zara.com");
}

function zaraProductIdFromUrl(url: URL) {
  const v1 = url.searchParams.get("v1");
  if (v1 && /^\d+$/.test(v1)) return v1;
  return url.pathname.match(/-p0*(\d+)\.html$/i)?.[1] ?? null;
}

function hmContentFallbackUrls(url: URL) {
  if (!isHmHost(url) || !/\/productpage\.\d+\.html$/i.test(url.pathname)) {
    return [];
  }
  return [
    new URL(`${url.pathname}/_jcr_content.product.json`, url).toString(),
    new URL(`${url.pathname}/_jcr_content/product.json`, url).toString(),
  ];
}

async function fetchTextWithTimeout(
  url: string,
  headers: HeadersInit,
  expectedKind: SafeFetchExpectedKind,
) {
  const response = await safeFetch(url, {
    expectedKind,
    headers,
    maxRedirects: 3,
  });
  return {
    response,
    text: response.text,
  };
}

function cleanText(value: unknown, maxLength = 300) {
  const text = String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, maxLength) : null;
}

function normalizeImageUrl(baseUrl: URL, value: string | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const parsed = new URL(raw, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

type ZaraProductDetailsResponse = {
  name?: unknown;
  detail?: {
    description?: unknown;
    colors?: {
      name?: unknown;
      productId?: unknown;
      xmedia?: {
        type?: unknown;
        kind?: unknown;
        order?: unknown;
        url?: unknown;
        extraInfo?: {
          deliveryUrl?: unknown;
        };
      }[];
    }[];
  };
}[];

function zaraImageUrl(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const resolved = raw.replace("{width}", "1200");
  try {
    const url = new URL(resolved);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function extractZaraProductUrlMetadata(url: URL): Promise<ProductUrlMetadata | null> {
  if (!isZaraHost(url)) return null;
  const productId = zaraProductIdFromUrl(url);
  if (!productId) return null;

  const detailsUrl = new URL(`${url.origin}${url.pathname.split("/").slice(0, 3).join("/")}/products-details`);
  detailsUrl.searchParams.set("productIds", productId);
  logger.info("[AURA_URL_FETCH] trying Zara product details API", {
    host: url.hostname,
    productId,
    path: detailsUrl.pathname,
  });

  const { response, text } = await fetchTextWithTimeout(
    detailsUrl.toString(),
    {
      accept: "application/json,text/plain,*/*",
      "accept-language": "en-US,en;q=0.9",
      "user-agent": USER_AGENT,
    },
    "json",
  );
  if (!response.ok) {
    logger.warn("[AURA_URL_FETCH] Zara product details API failed", {
      host: url.hostname,
      productId,
      status: response.status,
      bodyLength: text.length,
    });
    return null;
  }

  let parsed: ZaraProductDetailsResponse;
  try {
    parsed = JSON.parse(text) as ZaraProductDetailsResponse;
  } catch (error) {
    logger.warn("[AURA_URL_FETCH] Zara product details API returned invalid JSON", {
      host: url.hostname,
      productId,
      error,
    });
    return null;
  }

  const product = parsed[0];
  const colors = product?.detail?.colors ?? [];
  const selectedColor =
    colors.find((color) => String(color.productId ?? "") === productId) ??
    colors[0];
  const imageUrls = (selectedColor?.xmedia ?? [])
    .filter((media) => String(media.type ?? "").toLowerCase() === "image")
    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
    .map((media) => zaraImageUrl(media.extraInfo?.deliveryUrl ?? media.url))
    .filter((imageUrl): imageUrl is string => !!imageUrl);
  const deduped = (await filterSafeExternalImageUrls(Array.from(new Set(imageUrls)), {
    domain: url.hostname,
  })).slice(0, 12);
  const metadata = {
    sourceUrl: url.toString(),
    title: cleanText(product?.name, 220),
    imageUrl: deduped[0] ?? null,
    imageUrls: deduped,
    description: cleanText(product?.detail?.description, 500),
  };
  logger.info("[AURA_URL_METADATA] extracted Zara product URL metadata", {
    host: url.hostname,
    productId,
    hasTitle: !!metadata.title,
    imageCount: metadata.imageUrls.length,
    selectedColor: cleanText(selectedColor?.name, 80),
  });
  return metadata.imageUrl || metadata.title || metadata.description ? metadata : null;
}

async function fetchHtml(url: URL) {
  const headers = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    referer: `${url.origin}/`,
    "upgrade-insecure-requests": "1",
    "user-agent": USER_AGENT,
  };

  logger.info("[AURA_URL_FETCH] fetching product URL", {
    host: url.hostname,
    path: url.pathname,
  });
  const fallbackUrls = hmContentFallbackUrls(url);
  if (fallbackUrls.length) {
  const fallbackHtml = await tryHmContentFallback(url, fallbackUrls, headers, null, null);
  if (fallbackHtml) return fallbackHtml;
  }

  let originalStatus: number | null = null;
  let originalError: unknown = null;
  try {
    const { response, text } = await fetchTextWithTimeout(url.toString(), headers, "html");
    originalStatus = response.status;
    if (response.ok) {
      const finalUrl = response.finalUrl;
      logger.info("[AURA_URL_FETCH] fetched product URL", {
        host: url.hostname,
        htmlLength: text.length,
        fallback: null,
        finalUrl: redactUrlForLogs(finalUrl),
      });
      return {
        html: text,
        finalUrl,
      };
    }
  } catch (error) {
    originalError = error;
    if (!isHmHost(url)) {
      throw error;
    }
    logger.warn("[AURA_URL_FETCH] product URL fetch failed; trying retailer fallback", {
      host: url.hostname,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const fallbackHtml = await tryHmContentFallback(
    url,
    fallbackUrls,
    headers,
    originalStatus,
    originalError,
  );
  if (fallbackHtml) return fallbackHtml;

  if (originalError instanceof Error) {
    throw originalError;
  }
  if (originalStatus === 401 || originalStatus === 403 || originalStatus === 429) {
    throw new ProductLinkError(BLOCKED_STORE_MESSAGE, "blocked_store", {
      productLinkCode: "blocked_store",
      blockedStore: true,
      recoverable: true,
      status: originalStatus,
      host: url.hostname,
      title: "This store blocked automatic reading.",
      message: "You can try again, paste another link, or add the item from a screenshot.",
    });
  }
  if (originalStatus === 404) {
    throw new ProductLinkError(PRODUCT_PAGE_FAILURE_MESSAGE, "no_metadata", {
      reason: "http_404",
      status: originalStatus,
      host: url.hostname,
    });
  }
  throw new Error(`Product page returned ${originalStatus ?? "unknown status"}`);
}

async function tryHmContentFallback(
  url: URL,
  fallbackUrls: string[],
  headers: HeadersInit,
  originalStatus: number | null,
  originalError: unknown,
) {
  for (const fallbackUrl of fallbackUrls) {
    try {
      logger.info("[AURA_URL_FETCH] trying H&M content fallback", {
        host: url.hostname,
        fallbackPath: new URL(fallbackUrl).pathname,
        originalStatus,
        originalError: originalError instanceof Error ? originalError.message : null,
      });
      const fallbackResult = await fetchTextWithTimeout(fallbackUrl, headers, "json");
      if (
        fallbackResult.response.ok &&
        /<html|og:image|productArticleDetails/i.test(fallbackResult.text)
      ) {
        const finalUrl = fallbackResult.response.finalUrl;
        logger.info("[AURA_URL_FETCH] fetched H&M content fallback", {
          host: url.hostname,
          htmlLength: fallbackResult.text.length,
          status: fallbackResult.response.status,
          finalUrl: redactUrlForLogs(finalUrl),
        });
        return {
          html: fallbackResult.text,
          finalUrl,
        };
      }
      logger.warn("[AURA_URL_FETCH] H&M content fallback unusable", {
        host: url.hostname,
        status: fallbackResult.response.status,
        htmlLength: fallbackResult.text.length,
      });
    } catch (error) {
      logger.warn("[AURA_URL_FETCH] H&M content fallback failed", {
        host: url.hostname,
        fallbackHost: new URL(fallbackUrl).hostname,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return null;
}

function metaContent($: cheerio.CheerioAPI, key: string) {
  return cleanText(
    $(`meta[property="${key}"]`).attr("content") ??
      $(`meta[name="${key}"]`).attr("content"),
    500,
  );
}

function firstLargeImage($: cheerio.CheerioAPI, baseUrl: URL) {
  let fallback: string | null = null;
  let best: string | null = null;

  $("img").each((_, element) => {
    const img = $(element);
    const src =
      img.attr("src") ??
      img.attr("data-src") ??
      img.attr("data-original") ??
      img.attr("data-zoom-image") ??
      img.attr("srcset")?.split(",").at(-1)?.trim().split(/\s+/)[0];
    const normalized = normalizeImageUrl(baseUrl, src);
    if (!normalized) return;
    const lower = normalized.toLowerCase();
    if (/(logo|icon|sprite|favicon|placeholder|badge|payment|loader)/i.test(lower)) {
      return;
    }
    fallback = fallback ?? normalized;
    const width = Number(img.attr("width") ?? img.attr("data-width") ?? 0);
    const height = Number(img.attr("height") ?? img.attr("data-height") ?? 0);
    const hasProductHint = /(product|pdp|gallery|model|main|image|photo)/i.test(lower);
    if (!best && ((width >= 300 && height >= 300) || hasProductHint)) {
      best = normalized;
    }
  });

  return best ?? fallback;
}

function detectProductPageFailure($: cheerio.CheerioAPI, finalUrl: URL) {
  const title = cleanText($("title").first().text(), 220) ?? "";
  const h1 = cleanText($("h1").first().text(), 220) ?? "";
  const canonical = normalizeImageUrl(finalUrl, $("link[rel='canonical']").first().attr("href") ?? undefined);
  const bodyText = cleanText($("body").text(), 2_000) ?? "";
  const combined = `${title} ${h1} ${bodyText}`.toLowerCase();
  const failureReason =
    /\b(?:404|not\s+found|page\s+not\s+available|page\s+unavailable|we\s+can(?:not|'t)\s+find|does\s+not\s+exist|error\s+page)\b/i.test(combined)
      ? "not_found"
      : /\b(?:access\s+denied|captcha|robot\s+check|bot\s+protection|blocked|forbidden|request\s+unsuccessful)\b/i.test(combined)
        ? "blocked_or_bot_protected"
        : /\/(?:404|not-found|page-not-found)(?:\/|$)/i.test(finalUrl.pathname) ||
          (canonical ? /\/(?:404|not-found|page-not-found)(?:\/|$)/i.test(canonical) : false)
          ? "not_found_route"
          : null;

  if (!failureReason) return;
  throw new ProductLinkError(PRODUCT_PAGE_FAILURE_MESSAGE, "no_metadata", {
    reason: failureReason,
    title,
    finalUrl: redactUrlForLogs(finalUrl.toString()),
  });
}

export async function extractProductUrlMetadata(rawUrl: string): Promise<ProductUrlMetadata> {
  const url = await validateProductUrl(rawUrl);
  const zaraMetadata = await extractZaraProductUrlMetadata(url);
  if (zaraMetadata?.imageUrl) return zaraMetadata;

  const fetched = await fetchHtml(url);
  const html = fetched.html;
  const finalUrl = fetched.finalUrl;
  const page = cheerio.load(html);
  detectProductPageFailure(page, finalUrl);
  if (isAmazonProductUrl(finalUrl)) {
    const amazon = extractAmazonLinkData(finalUrl, html);
    const imageUrls = await filterSafeExternalImageUrls(amazon.imageUrls, {
      domain: finalUrl.hostname,
    });
    return {
      sourceUrl: amazon.metadata.sourceUrl,
      title: amazon.metadata.title ?? amazon.partialData?.title ?? null,
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      description: null,
      brand: amazon.status === "ready" ? amazon.metadata.brand ?? null : null,
      category: amazon.status === "ready" ? amazon.metadata.categoryHints?.[0] ?? null : null,
      subCategory: amazon.status === "ready" ? amazon.metadata.categoryHints?.[1] ?? null : null,
      price: amazon.metadata.price ?? null,
      currency: amazon.metadata.currency ?? null,
      priceAmount: amazon.metadata.priceAmount ?? null,
      priceCurrency: amazon.metadata.priceCurrency ?? null,
      priceDisplay: amazon.metadata.priceDisplay ?? null,
      salePrice: amazon.metadata.salePrice ?? null,
      originalPrice: amazon.metadata.originalPrice ?? null,
      confidence: amazon.confidence,
      status: amazon.status,
    };
  }
  const $ = page;
  const nikeVariant = extractNikeSelectedVariantData(finalUrl.toString(), html);
  const productMetadata = extractProductMetadataFromHtml(finalUrl.toString(), html);
  const imageUrls =
    nikeVariant?.imageUrls?.length
      ? nikeVariant.imageUrls
      : extractProductImagesFromHtml(finalUrl.toString(), html);
  const ogImage = normalizeImageUrl(finalUrl, metaContent($, "og:image") ?? undefined);
  const safeImageUrls = await filterSafeExternalImageUrls(
    (imageUrls.length ? imageUrls : [ogImage ?? firstLargeImage($, finalUrl)].filter((value): value is string => !!value)),
    { domain: finalUrl.hostname },
  );
  const metadata = {
    sourceUrl: nikeVariant?.metadata?.sourceUrl ?? finalUrl.toString(),
    title:
      nikeVariant?.metadata?.title ??
      productMetadata.title ??
      metaContent($, "og:title") ??
      cleanText($("title").first().text(), 220),
    imageUrl: safeImageUrls[0] ?? null,
    imageUrls: safeImageUrls,
    description:
      nikeVariant?.metadata?.description ??
      productMetadata.description ??
      metaContent($, "og:description") ??
      metaContent($, "description"),
    brand: productMetadata.brand ?? null,
    category: productMetadata.categoryHints?.[0] ?? null,
    subCategory: productMetadata.categoryHints?.[1] ?? null,
    color: productMetadata.color ?? null,
    price: productMetadata.price ?? null,
    currency: productMetadata.currency ?? null,
    priceAmount: productMetadata.priceAmount ?? null,
    priceCurrency: productMetadata.priceCurrency ?? null,
    priceDisplay: productMetadata.priceDisplay ?? null,
    salePrice: productMetadata.salePrice ?? null,
    originalPrice: productMetadata.originalPrice ?? null,
    material: productMetadata.material ?? null,
    materials: productMetadata.materials ?? [],
    fit: productMetadata.fit ?? null,
    sleeveLength: productMetadata.sleeveLength ?? null,
    collar: productMetadata.collar ?? null,
    length: productMetadata.length ?? null,
    pattern: productMetadata.pattern ?? null,
    displayColor: productMetadata.displayColor ?? productMetadata.color ?? null,
    displayColors: productMetadata.displayColors ?? [],
    sizeOptions: productMetadata.sizeOptions ?? productMetadata.sizeHints ?? [],
    availableSizes: productMetadata.availableSizes ?? productMetadata.sizeOptions ?? [],
    careInstructions: productMetadata.careInstructions ?? [],
    productDescription: productMetadata.productDescription ?? productMetadata.description ?? null,
    graphicText: productMetadata.graphicText ?? null,
    motif: productMetadata.motif ?? null,
    collaborationName: productMetadata.collaborationName ?? null,
  };
  logger.info("[AURA_URL_METADATA] extracted product URL metadata", {
    host: finalUrl.hostname,
    hasTitle: !!metadata.title,
    hasImageUrl: !!metadata.imageUrl,
    imageCount: metadata.imageUrls.length,
    hasDescription: !!metadata.description,
    hasPrice: typeof metadata.priceAmount === "number",
    imageHost: metadata.imageUrl ? new URL(metadata.imageUrl).hostname : null,
    sourceUrl: redactUrlForLogs(metadata.sourceUrl),
  });
  return metadata;
}
