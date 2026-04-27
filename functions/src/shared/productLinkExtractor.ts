import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

export type ProductMetadata = {
  sourceUrl: string;
  domain: string;
  retailer: string;
  brand?: string | null;
  title?: string | null;
  price?: string | null;
  currency?: string | null;
  color?: string | null;
  description?: string | null;
  categoryHints?: string[];
  material?: string | null;
  sizeHints?: string[];
  sku?: string | null;
};

export type ProductExtraction = {
  metadata: ProductMetadata;
  imageUrls: string[];
  confidence?: number | null;
  status?: "ready" | "needs_review";
  partialData?: {
    title?: string | null;
    imageUrls?: string[];
  };
};

export type ProductExtractionOverride = {
  metadata?: Partial<ProductMetadata>;
  imageUrls?: string[];
};

type JsonObject = Record<string, unknown>;

type ProductLinkAdapter = {
  hostMatches: (host: string) => boolean;
  extract?: (params: {
    url: URL;
    html: string;
    metadata: ProductMetadata;
    imageUrls: string[];
  }) => Partial<ProductExtraction>;
};

const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_CHARS = 1_500_000;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const adapters: ProductLinkAdapter[] = [
  {
    hostMatches: (host) =>
      host.endsWith("hm.com") ||
      host.endsWith("zara.com") ||
      host.endsWith("nike.com"),
  },
];

type FetchedProductPage = {
  html: string;
  finalUrl: URL;
};

type AmazonExtractionResult = {
  metadata: ProductMetadata;
  imageUrls: string[];
  confidence: number;
  status: "ready" | "needs_review";
  partialData?: {
    title?: string | null;
    imageUrls?: string[];
  };
};

export class ProductLinkError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_url"
      | "unsafe_url"
      | "fetch_failed"
      | "no_metadata"
      | "no_images"
      | "draft_failed",
  ) {
    super(message);
  }
}

function cleanText(value: unknown, maxLength = 240): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function cleanList(values: unknown, maxItems = 6): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => cleanText(value, 80))
    .filter((value): value is string => !!value)
    .slice(0, maxItems);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ");
}

function extractMeta(html: string, key: string): string | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (match) return cleanText(decodeHtmlEntities(match), 500);
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return match ? cleanText(decodeHtmlEntities(match), 180) : null;
}

function parseJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const scriptRe =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html))) {
    const body = decodeHtmlEntities(match[1] ?? "").trim();
    if (!body) continue;
    try {
      blocks.push(JSON.parse(body));
    } catch {
      const compact = body.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      try {
        blocks.push(JSON.parse(compact));
      } catch {
        // Ignore malformed structured data; meta fallback still runs.
      }
    }
  }
  return blocks;
}

function flattenJsonLd(value: unknown): JsonObject[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (typeof value !== "object") return [];
  const object = value as JsonObject;
  const graph = object["@graph"];
  return [object, ...flattenJsonLd(graph)];
}

function isProductNode(node: JsonObject): boolean {
  const type = node["@type"];
  const values = Array.isArray(type) ? type : [type];
  return values.some((entry) => String(entry).toLowerCase() === "product");
}

function getOffer(node: JsonObject): JsonObject | null {
  const offers = node.offers;
  if (Array.isArray(offers)) {
    return (offers.find((offer) => offer && typeof offer === "object") ??
      null) as JsonObject | null;
  }
  return offers && typeof offers === "object" ? (offers as JsonObject) : null;
}

function getBrand(node: JsonObject): string | null {
  const brand = node.brand;
  if (typeof brand === "object" && brand) {
    return cleanText((brand as JsonObject).name, 120);
  }
  return cleanText(brand, 120);
}

function extractJsonLdProduct(html: string): Partial<ProductMetadata> {
  const nodes = parseJsonLdBlocks(html).flatMap(flattenJsonLd);
  const product = nodes.find(isProductNode);
  if (!product) return {};
  const offer = getOffer(product);
  return {
    brand: getBrand(product),
    title: cleanText(product.name, 180),
    description: cleanText(product.description, 700),
    price: cleanText(offer?.price ?? product.price, 60),
    currency: cleanText(offer?.priceCurrency ?? product.priceCurrency, 12),
    color: cleanText(product.color, 80),
    categoryHints: cleanList(
      [
        product.category,
        product.audience,
        product.additionalType,
        product.itemCondition,
      ].filter(Boolean),
    ),
    material: cleanText(product.material, 160),
    sizeHints: cleanList(product.size),
    sku: cleanText(product.sku ?? product.mpn ?? product.productID, 120),
  };
}

function normalizeUrl(baseUrl: URL, value: string): string | null {
  const cleaned = decodeHtmlEntities(value).trim();
  if (!cleaned || cleaned.startsWith("data:")) return null;
  try {
    const parsed = new URL(cleaned, baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function scoreImageUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(lower)) score += 3;
  if (/(product|pdp|gallery|image|photo|model|main)/i.test(lower)) score += 4;
  if (/(clean|cutout|transparent|isolated|packshot)/i.test(lower)) score += 6;
  if (/(screenshot|screen[-_ ]?shot|share|social|swatch|color|variant|thumb|thumbnail|detail|icon|sprite|logo|banner|header|footer|ui|nav)/i.test(lower)) {
    score -= 10;
  }
  if (/(logo|icon|sprite|favicon|placeholder|badge|payment|loader)/i.test(lower)) {
    score -= 12;
  }
  const dims = [...lower.matchAll(/(?:_|-|\/)(\d{3,4})(?:x|_|-)(\d{3,4})/g)];
  for (const dim of dims) {
    score += Math.min(6, (Number(dim[1]) + Number(dim[2])) / 500);
  }
  return score;
}

function dedupeStableImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    if (/\s/.test(url)) return false;
    const key = url.replace(/([?&])(imwidth|width|height|w|h)=\d+/gi, "$1").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return scoreImageUrl(url) >= -2;
  });
}

function isHmProductUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  return (
    (host === "hm.com" || host.endsWith(".hm.com")) &&
    /\/productpage\.\d+\.html$/i.test(url.pathname)
  );
}

function isNikeProductUrl(url: URL) {
  return url.hostname.toLowerCase().endsWith("nike.com");
}

export function isAmazonProductUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  return host.includes("amazon.");
}

function nikeStyleColorFromUrl(url: URL) {
  return url.pathname.match(/\/([A-Z0-9]{6,}-\d{3})(?:[/?]|$)/i)?.[1]?.toUpperCase() ?? null;
}

function hmArticleIdFromUrl(url: URL) {
  return url.pathname.match(/\/productpage\.(\d+)\.html$/i)?.[1] ?? null;
}

function imageValuesFromJsonLd(value: unknown, baseUrl: URL) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((entry) => {
      if (typeof entry === "object" && entry) {
        const object = entry as JsonObject;
        return [object.url, object.contentUrl];
      }
      return [entry];
    })
    .map((entry) => (typeof entry === "string" ? normalizeUrl(baseUrl, entry) : null))
    .filter((entry): entry is string => !!entry);
}

function productNodeMatchesArticle(product: JsonObject, articleId: string) {
  const offer = getOffer(product);
  const candidates = [
    product.sku,
    product.mpn,
    product.productID,
    product.productId,
    product.url,
    offer?.url,
  ].map((value) => String(value ?? ""));
  return candidates.some((value) => value.includes(articleId));
}

function extractHmScopedProductImages(html: string, baseUrl: URL): string[] | null {
  if (!isHmProductUrl(baseUrl)) return null;
  const articleId = hmArticleIdFromUrl(baseUrl);
  const products = parseJsonLdBlocks(html).flatMap(flattenJsonLd).filter(isProductNode);
  const scopedProduct = articleId
    ? products.find((product) => productNodeMatchesArticle(product, articleId))
    : products[0];
  const rawImages = scopedProduct ? imageValuesFromJsonLd(scopedProduct.image, baseUrl) : [];
  const scopedImages = dedupeStableImageUrls(rawImages).slice(0, 8);
  logger.info("[LINK_PRODUCT_SCOPE]", {
    sourceUrl: baseUrl.toString(),
    retailer: "hm",
    articleId,
    productNodeCount: products.length,
    matchedSku: scopedProduct ? cleanText(scopedProduct.sku, 120) : null,
    matchedTitle: scopedProduct ? cleanText(scopedProduct.name, 180) : null,
    scopedImageCount: scopedImages.length,
  });
  logger.info("[LINK_IMAGE_CANDIDATES_SCOPED]", {
    sourceUrl: baseUrl.toString(),
    retailer: "hm",
    articleId,
    candidateCount: scopedImages.length,
    urls: scopedImages,
  });
  return scopedImages.length ? scopedImages : null;
}

function extractJsonLdImages(html: string, baseUrl: URL): string[] {
  const nodes = parseJsonLdBlocks(html).flatMap(flattenJsonLd);
  const product = nodes.find(isProductNode);
  if (!product) return [];
  return imageValuesFromJsonLd(product.image, baseUrl);
}

function extractMarkupImages(html: string, baseUrl: URL): string[] {
  const out: string[] = [];
  const imageRe =
    /<(?:img|source)[^>]+(?:src|data-src|data-original|data-zoom-image|srcset)=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imageRe.exec(html))) {
    const attr = match[1] ?? "";
    const candidates = attr
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
    for (const candidate of candidates) {
      const normalized = normalizeUrl(baseUrl, candidate);
      if (normalized) out.push(normalized);
    }
  }

  const quotedUrlRe =
    /["'](https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"']*)?)["']/gi;
  while ((match = quotedUrlRe.exec(html))) {
    const normalized = normalizeUrl(baseUrl, match[1] ?? "");
    if (normalized) out.push(normalized);
  }
  return out;
}

function parseNextDataPageProps(html: string): JsonObject | null {
  const match = html.match(
    /<script id=["']__NEXT_DATA__["'] type=["']application\/json["']>([\s\S]*?)<\/script>/i,
  )?.[1];
  if (!match) return null;
  try {
    const parsed = JSON.parse(match) as JsonObject;
    const props = parsed.props;
    if (!props || typeof props !== "object") return null;
    const pageProps = (props as JsonObject).pageProps;
    return pageProps && typeof pageProps === "object" ? (pageProps as JsonObject) : null;
  } catch {
    return null;
  }
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asObjectArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value
        .map((entry) => asObject(entry))
        .filter((entry): entry is JsonObject => !!entry)
    : [];
}

function nikePdpPathFor(product: JsonObject): string | null {
  const pdpUrl = asObject(product.pdpUrl);
  return cleanText(pdpUrl?.path ?? pdpUrl?.url ?? product.url, 240);
}

function nikeCanonicalUrl(product: JsonObject, fallbackUrl: URL): URL {
  const pdpUrl = asObject(product.pdpUrl);
  const directUrl = cleanText(pdpUrl?.url, 1000);
  if (directUrl) {
    const normalized = normalizeUrl(fallbackUrl, directUrl);
    if (normalized) return new URL(normalized);
  }
  const path = cleanText(pdpUrl?.path, 240);
  if (path) {
    const normalized = normalizeUrl(new URL("https://www.nike.com"), path);
    if (normalized) return new URL(normalized);
  }
  return fallbackUrl;
}

function nikeSelectedStyleColor(pageProps: JsonObject, url: URL): string | null {
  return (
    cleanText(pageProps.styleColor, 40)?.toUpperCase() ??
    nikeStyleColorFromUrl(url) ??
    null
  );
}

function nikeProductMatchesStyleColor(product: JsonObject, styleColor: string | null) {
  if (!styleColor) return false;
  const candidates = [
    product.styleColor,
    product.displayStyle,
    product.merchProductId,
    nikePdpPathFor(product),
  ]
    .map((value) => cleanText(value, 120)?.toUpperCase() ?? "")
    .filter(Boolean);
  return candidates.some((value) => value.includes(styleColor));
}

function nikeSelectedProduct(pageProps: JsonObject, url: URL): JsonObject | null {
  const styleColor = nikeSelectedStyleColor(pageProps, url);
  const selected = asObject(pageProps.selectedProduct);
  if (selected && nikeProductMatchesStyleColor(selected, styleColor)) {
    return selected;
  }
  for (const group of asObjectArray(pageProps.productGroups)) {
    const products = asObject(group.products);
    if (!products) continue;
    if (styleColor) {
      const direct = asObject(products[styleColor]);
      if (direct) return direct;
    }
    for (const product of Object.values(products)) {
      const candidate = asObject(product);
      if (candidate && nikeProductMatchesStyleColor(candidate, styleColor)) {
        return candidate;
      }
    }
  }
  return selected;
}

function nikePreferredImageUrl(card: JsonObject): string | null {
  const properties = asObject(card.properties);
  if (!properties) return null;
  const squarish = asObject(properties.squarish)?.url;
  const portrait = asObject(properties.portrait)?.url;
  return cleanText(squarish ?? portrait, 1000);
}

function nikeSelectedVariantImageUrls(pageProps: JsonObject, product: JsonObject, url: URL): string[] {
  const fromContentImages = asObjectArray(product.contentImages)
    .filter((card) => String(card.cardType ?? "").toLowerCase() === "image")
    .map((card) => nikePreferredImageUrl(card))
    .filter((entry): entry is string => !!entry)
    .map((entry) => normalizeUrl(url, entry))
    .filter((entry): entry is string => !!entry);

  const styleColor = nikeSelectedStyleColor(pageProps, url);
  const fromColorway = asObjectArray(pageProps.colorwayImages)
    .filter((entry) => {
      const entryStyleColor = cleanText(entry.styleColor, 40)?.toUpperCase() ?? null;
      return !!styleColor && entryStyleColor === styleColor;
    })
    .flatMap((entry) => [entry.squarishImg, entry.portraitImg])
    .map((entry) => cleanText(entry, 1000))
    .filter((entry): entry is string => !!entry)
    .map((entry) => normalizeUrl(url, entry))
    .filter((entry): entry is string => !!entry);

  return dedupeStableImageUrls([...fromContentImages, ...fromColorway]).slice(0, 12);
}

function nikeProductTitle(product: JsonObject): string | null {
  const info = asObject(product.productInfo);
  return (
    cleanText(info?.fullTitle, 220) ??
    ([cleanText(info?.title, 140), cleanText(info?.subtitle, 80)]
      .filter((entry): entry is string => !!entry)
      .join(" ")
      .trim() || null)
  );
}

function nikeProductDescription(product: JsonObject): string | null {
  const info = asObject(product.productInfo);
  return cleanText(info?.productDescription, 700);
}

function nikeProductBrand(product: JsonObject): string | null {
  const brands = Array.isArray(product.brands) ? product.brands : [];
  return cleanText(brands[0], 120) ?? "Nike";
}

function nikeCategoryHints(product: JsonObject): string[] {
  const hints = [
    cleanText(product.productType, 80),
    ...cleanList(asObject(product.taxonomyLabels)?.["Product Type"] ?? []),
    ...cleanList(asObject(product.taxonomyLabels)?.Collections ?? []),
  ];
  return Array.from(new Set(hints.filter((entry): entry is string => !!entry)));
}

export function extractNikeSelectedVariantData(
  sourceUrl: string,
  html: string,
): ProductExtractionOverride | null {
  const url = new URL(sourceUrl);

  const pageProps = parseNextDataPageProps(html);
  if (!pageProps) return null;

  const product = nikeSelectedProduct(pageProps, url);
  if (!product) return null;
  const canonicalUrl = nikeCanonicalUrl(product, url);
  if (!isNikeProductUrl(canonicalUrl)) return null;

  const genericCandidates = dedupeStableImageUrls([
    ...extractJsonLdImages(html, canonicalUrl),
    ...[extractMeta(html, "og:image"), extractMeta(html, "og:image:secure_url")]
      .map((value) => (value ? normalizeUrl(canonicalUrl, value) : null))
      .filter((value): value is string => !!value),
    ...extractMarkupImages(html, canonicalUrl),
  ]);
  const imageUrls = nikeSelectedVariantImageUrls(pageProps, product, canonicalUrl);
  const selectedSet = new Set(imageUrls.map((entry) => entry.toLowerCase()));
  const rejected = genericCandidates
    .filter((entry) => !selectedSet.has(entry.toLowerCase()))
    .slice(0, 24)
    .map((entry) => ({
      url: entry,
      reason: "not in selected Nike variant media set",
    }));

  const styleColor =
    cleanText(product.styleColor ?? product.displayStyle, 40)?.toUpperCase() ??
    nikeStyleColorFromUrl(canonicalUrl);
  const title = nikeProductTitle(product);
  const colorDescription = cleanText(product.colorDescription, 120);

  logger.info("[NIKE_LINK] final resolved URL", {
    sourceUrl,
    finalResolvedUrl: canonicalUrl.toString(),
  });
  logger.info("[NIKE_LINK] selected variant detected", {
    sourceUrl: canonicalUrl.toString(),
    title,
    colorway: colorDescription,
    styleColor,
  });
  logger.info("[NIKE_LINK] image candidates before filtering", {
    sourceUrl: canonicalUrl.toString(),
    styleColor,
    candidateCount: genericCandidates.length,
  });
  logger.info("[NIKE_LINK] image candidates after filtering", {
    sourceUrl: canonicalUrl.toString(),
    styleColor,
    candidateCount: imageUrls.length,
    chosenPrimaryImage: imageUrls[0] ?? null,
  });
  if (rejected.length) {
    logger.info("[NIKE_LINK] rejected image candidates", {
      sourceUrl: canonicalUrl.toString(),
      styleColor,
      rejected,
    });
  }

  const domain = canonicalUrl.hostname.replace(/^www\./, "");
  const retailer = domain.split(".")[0] ?? domain;
  return {
    metadata: {
      sourceUrl: canonicalUrl.toString(),
      domain,
      retailer,
      brand: nikeProductBrand(product),
      title,
      color: colorDescription,
      description: nikeProductDescription(product),
      categoryHints: nikeCategoryHints(product),
      sku: styleColor,
    },
    imageUrls,
  };
}

export function extractProductImagesFromHtml(url: string, html: string): string[] {
  const baseUrl = new URL(url);
  if (isAmazonProductUrl(baseUrl)) {
    return [];
  }
  const scopedHmImages = extractHmScopedProductImages(html, baseUrl);
  if (scopedHmImages) {
    return scopedHmImages;
  }
  const nikeVariantImages = extractNikeSelectedVariantData(baseUrl.toString(), html)?.imageUrls;
  if (nikeVariantImages?.length) {
    return nikeVariantImages;
  }
  const candidates = [
    ...extractJsonLdImages(html, baseUrl),
    ...[extractMeta(html, "og:image"), extractMeta(html, "og:image:secure_url")]
      .map((value) => (value ? normalizeUrl(baseUrl, value) : null))
      .filter((value): value is string => !!value),
    ...extractMarkupImages(html, baseUrl),
  ];
  const deduped = dedupeStableImageUrls(candidates);
  logger.info("[LINK_IMAGE_CANDIDATES] extracted product image candidates", {
    sourceUrl: url,
    candidateCount: deduped.length,
    urls: deduped.slice(0, 20),
  });
  const ranked = deduped
    .sort((a, b) => scoreImageUrl(b) - scoreImageUrl(a))
    .slice(0, 8);
  ranked.forEach((imageUrl, index) => {
    logger.info("[LINK_IMAGE_SCORE] URL heuristic score", {
      sourceUrl: url,
      index,
      url: imageUrl,
      score: scoreImageUrl(imageUrl),
      reasons: ["generic URL and resolution heuristic"],
    });
  });
  logger.info("[LINK_IMAGE_PRIMARY] generic primary image selected", {
    sourceUrl: url,
    primaryImageUrl: ranked[0] ?? null,
  });
  logger.info("[LINK_IMAGE_SECONDARY] generic secondary images selected", {
    sourceUrl: url,
    secondaryImageUrls: ranked.slice(1),
  });
  return ranked;
}

export function extractProductMetadataFromHtml(
  url: string,
  html: string,
): ProductMetadata {
  const parsed = new URL(url);
  if (isAmazonProductUrl(parsed)) {
    return {
      sourceUrl: parsed.toString(),
      domain: parsed.hostname.replace(/^www\./, ""),
      retailer: "amazon",
    };
  }
  const domain = parsed.hostname.replace(/^www\./, "");
  const retailer = domain.split(".")[0] ?? domain;
  const jsonLd = extractJsonLdProduct(html);
  const nikeVariant = extractNikeSelectedVariantData(parsed.toString(), html);
  const nikeMetadata: Partial<ProductMetadata> = nikeVariant?.metadata ?? {};
  const metadata: ProductMetadata = {
    sourceUrl: nikeMetadata.sourceUrl ?? parsed.toString(),
    domain: nikeMetadata.domain ?? domain,
    retailer: nikeMetadata.retailer ?? retailer,
    brand:
      nikeMetadata.brand ??
      jsonLd.brand ??
      extractMeta(html, "product:brand") ??
      extractMeta(html, "brand"),
    title:
      nikeMetadata.title ??
      jsonLd.title ??
      extractMeta(html, "og:title") ??
      extractMeta(html, "twitter:title") ??
      extractTitle(html),
    price:
      jsonLd.price ??
      extractMeta(html, "product:price:amount") ??
      extractMeta(html, "price") ??
      extractMeta(html, "twitter:data1"),
    currency:
      jsonLd.currency ??
      extractMeta(html, "product:price:currency") ??
      extractMeta(html, "currency"),
    color:
      nikeMetadata.color ??
      jsonLd.color ??
      extractMeta(html, "product:color") ??
      extractMeta(html, "color"),
    description:
      nikeMetadata.description ??
      jsonLd.description ??
      extractMeta(html, "og:description") ??
      extractMeta(html, "description") ??
      extractMeta(html, "twitter:description"),
    categoryHints: nikeMetadata.categoryHints ?? jsonLd.categoryHints ?? [],
    material:
      jsonLd.material ??
      extractMeta(html, "product:material") ??
      extractMeta(html, "material"),
    sizeHints: jsonLd.sizeHints ?? [],
    sku:
      nikeMetadata.sku ??
      jsonLd.sku ??
      extractMeta(html, "product:retailer_item_id") ??
      extractMeta(html, "sku"),
  };
  return metadata;
}

function amazonAsinFromUrl(url: URL) {
  const match = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function cleanAmazonTitle(value: string | null) {
  const text = cleanText(value, 260);
  if (!text) return null;
  return text
    .replace(/^Amazon\.[A-Za-z.]+\s*:\s*/i, "")
    .replace(/\s*:\s*(?:Clothing,\s*Shoes\s*&\s*Jewelry|Beauty\s*&\s*Personal\s*Care|Health\s*&\s*Household|Home\s*&\s*Kitchen|Sports\s*&\s*Outdoors|Cell\s*Phones\s*&\s*Accessories|Electronics|Books)\s*$/i, "")
    .replace(/\s*:\s*Amazon\.[A-Za-z.]+.*$/i, "")
    .replace(/\s*[-|]\s*Amazon\.[A-Za-z.]+.*$/i, "")
    .replace(/\s*-\s*Amazon(?:\.[A-Za-z.]+)?\s*$/i, "")
    .replace(/\s*\|\s*Amazon(?:\.[A-Za-z.]+)?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const AMAZON_CATEGORY_MAP: Array<{
  category: string;
  subCategory: string;
  patterns: RegExp[];
}> = [
  { category: "beauty", subCategory: "perfume", patterns: [/\b(perfume|parfum|eau de parfum|eau de toilette|cologne|fragrance|body mist)\b/i] },
  { category: "beauty", subCategory: "lipstick", patterns: [/\b(lipstick|lip gloss|lip balm|lip liner)\b/i] },
  { category: "beauty", subCategory: "serum", patterns: [/\b(serum|essence|ampoule)\b/i] },
  { category: "beauty", subCategory: "moisturizer", patterns: [/\b(moisturizer|cream|lotion)\b/i] },
  { category: "accessory", subCategory: "cap", patterns: [/\b(baseball cap|cap|hat|beanie)\b/i] },
  { category: "accessory", subCategory: "bag", patterns: [/\b(handbag|crossbody|shoulder bag|bag|backpack|tote)\b/i] },
  { category: "footwear", subCategory: "sneakers", patterns: [/\b(sneaker|running shoe|trainer|shoe|boot|loafer|heel|sandal)\b/i] },
  { category: "top", subCategory: "shirt", patterns: [/\b(shirt|tee|t-shirt|polo|blouse|tank top|sweater|hoodie)\b/i] },
  { category: "bottom", subCategory: "pants", patterns: [/\b(pants|trousers|jeans|shorts|skirt|leggings)\b/i] },
];

function inferAmazonCategoryFromTitle(title: string | null) {
  const normalized = String(title ?? "").toLowerCase();
  for (const entry of AMAZON_CATEGORY_MAP) {
    if (entry.patterns.some((pattern) => pattern.test(normalized))) {
      return { category: entry.category, subCategory: entry.subCategory };
    }
  }
  return { category: null, subCategory: null };
}

const AMAZON_STOP_TOKENS = new Set([
  "amazon",
  "amazon.com",
  "visit",
  "the",
  "store",
  "by",
  "for",
  "with",
  "and",
  "men",
  "mens",
  "women",
  "womens",
  "unisex",
  "pack",
  "size",
  "ml",
  "oz",
]);

function extractAmazonBrandFromTitle(title: string | null) {
  const text = String(title ?? "").trim();
  if (!text) return null;
  const visitMatch = text.match(/^Visit the\s+(.+?)\s+Store\b/i);
  if (visitMatch?.[1]) {
    const brand = cleanText(visitMatch[1], 120);
    return brand && !/^amazon(?:\.[a-z.]+)?$/i.test(brand) ? brand : null;
  }
  const separators = text.split(/[|,:-]/).map((entry) => entry.trim()).filter(Boolean);
  for (const part of separators.slice(0, 2)) {
    const words = part.split(/\s+/).filter(Boolean);
    const filtered = words.filter((word) => {
      const normalized = word.toLowerCase();
      return !AMAZON_STOP_TOKENS.has(normalized) && /^[a-z0-9&'.-]+$/i.test(word);
    });
    const candidate = cleanText(filtered.slice(0, 3).join(" "), 120);
    if (candidate && candidate.split(/\s+/).length <= 3 && !/^amazon(?:\.[a-z.]+)?$/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function amazonImageLooksUsable(url: string) {
  const lower = url.toLowerCase();
  if (/(logo|icon|sprite|nav|header|footer|pixel|spacer|loading|signin|wishlist|prime)/i.test(lower)) {
    return false;
  }
  const sizeMatch = lower.match(/(?:[._-]|\/)(\d{2,4})[x_](\d{2,4})(?:[._-]|\/)/i);
  if (sizeMatch) {
    const width = Number(sizeMatch[1]);
    const height = Number(sizeMatch[2]);
    if (width < 200 || height < 200) return false;
  }
  return true;
}

function amazonImagesFromStructuredHtml(url: URL, html: string) {
  const candidates = [
    extractMeta(html, "og:image"),
    extractMeta(html, "og:image:secure_url"),
  ]
    .map((entry) => (entry ? normalizeUrl(url, entry) : null))
    .filter((entry): entry is string => !!entry)
    .filter((entry) => amazonImageLooksUsable(entry));
  return dedupeStableImageUrls(candidates).slice(0, 6);
}

function amazonConfidence(params: {
  title: string | null;
  imageUrls: string[];
  brand: string | null;
  category: string | null;
  subCategory: string | null;
}) {
  let score = 0;
  if (params.title) score += 0.3;
  if (params.imageUrls.length) score += 0.4;
  if (params.brand) score += 0.15;
  if (params.category && params.subCategory) score += 0.15;
  if (!params.imageUrls.length) score = Math.min(score, 0.55);
  return Number(score.toFixed(2));
}

export function handleAmazonLink(url: URL, html: string): AmazonExtractionResult {
  const asin = amazonAsinFromUrl(url);
  const domain = url.hostname.replace(/^www\./, "");
  const title = cleanAmazonTitle(extractMeta(html, "og:title") ?? extractTitle(html));
  const imageUrls = amazonImagesFromStructuredHtml(url, html);
  const brand = extractAmazonBrandFromTitle(title);
  const inferred = inferAmazonCategoryFromTitle(title);
  const confidence = amazonConfidence({
    title,
    imageUrls,
    brand,
    category: inferred.category,
    subCategory: inferred.subCategory,
  });
  const status = confidence < 0.6 ? "needs_review" : "ready";
  const metadata: ProductMetadata = {
    sourceUrl: url.toString(),
    domain,
    retailer: "amazon",
    title,
    brand: status === "ready" ? brand : null,
    categoryHints: status === "ready" && inferred.category ? [inferred.category, inferred.subCategory ?? ""].filter(Boolean) : [],
    sku: asin,
  };
  logger.info("[AMAZON_LINK] extraction", {
    asin,
    sourceUrl: url.toString(),
    success: !!title || imageUrls.length > 0,
    confidence,
    status,
    title,
    brand,
    category: inferred.category,
    subCategory: inferred.subCategory,
    imageCount: imageUrls.length,
  });
  return {
    metadata,
    imageUrls,
    confidence,
    status,
    partialData: status === "needs_review" ? {
      title,
      imageUrls,
    } : undefined,
  };
}

export const extractAmazonLinkData = handleAmazonLink;

function isPrivateIp(address: string): boolean {
  if (address === "127.0.0.1" || address === "::1") return true;
  if (address.startsWith("10.")) return true;
  if (address.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return true;
  if (address.startsWith("169.254.")) return true;
  if (address.startsWith("fc") || address.startsWith("fd")) return true;
  return false;
}

export async function validateProductUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ProductLinkError("Invalid product link.", "invalid_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProductLinkError("Only http and https links are supported.", "invalid_url");
  }
  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    isPrivateIp(host)
  ) {
    throw new ProductLinkError("That link is not safe to fetch.", "unsafe_url");
  }
  if (isIP(host) && isPrivateIp(host)) {
    throw new ProductLinkError("That link is not safe to fetch.", "unsafe_url");
  }
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new ProductLinkError("That link is not safe to fetch.", "unsafe_url");
  }
  parsed.hash = "";
  return parsed;
}

export async function fetchResolvedProductPage(url: URL): Promise<FetchedProductPage> {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    const response = await fetchProductHtmlOnce(currentUrl);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new ProductLinkError("Product page redirected without a location.", "fetch_failed");
      }
      currentUrl = await validateProductUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (!response.ok) {
      throw new ProductLinkError(`Product page returned ${response.status}.`, "fetch_failed");
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html")) {
      throw new ProductLinkError("That link did not return a product page.", "fetch_failed");
    }
    return {
      html: (await response.text()).slice(0, MAX_HTML_CHARS),
      finalUrl: currentUrl,
    };
  }
  throw new ProductLinkError("Product page redirected too many times.", "fetch_failed");
}

async function fetchProductHtmlOnce(url: URL): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (error) {
    if (error instanceof ProductLinkError) throw error;
    throw new ProductLinkError("Could not fetch that product link.", "fetch_failed");
  } finally {
    clearTimeout(timeout);
  }
}

function applyAdapter(
  url: URL,
  html: string,
  extraction: ProductExtraction,
): ProductExtraction {
  const adapter = adapters.find((entry) => entry.hostMatches(url.hostname));
  if (!adapter?.extract) return extraction;
  const overrides = adapter.extract({
    url,
    html,
    metadata: extraction.metadata,
    imageUrls: extraction.imageUrls,
  });
  return {
    metadata: { ...extraction.metadata, ...(overrides.metadata ?? {}) },
    imageUrls: overrides.imageUrls ?? extraction.imageUrls,
  };
}

export async function extractProductFromUrl(rawUrl: string): Promise<ProductExtraction> {
  const url = await validateProductUrl(rawUrl);
  logger.info("[AURA_LINK_EXTRACT] fetching product page", {
    domain: url.hostname,
  });
  let html: string;
  let finalUrl = url;
  try {
    const page = await fetchResolvedProductPage(url);
    html = page.html;
    finalUrl = page.finalUrl;
  } catch (error) {
    logger.error("[AURA_LINK_ERROR] page fetch failed", {
      domain: url.hostname,
      error,
    });
    throw error;
  }
  logger.info("[AURA_LINK_EXTRACT] page fetch success", {
    domain: url.hostname,
    htmlLength: html.length,
  });

  if (isAmazonProductUrl(finalUrl)) {
    const amazonExtraction = extractAmazonLinkData(finalUrl, html);
    if (!amazonExtraction.metadata.title && !amazonExtraction.imageUrls.length) {
      throw new ProductLinkError("No usable Amazon product metadata found.", "no_metadata");
    }
    return amazonExtraction;
  }

  const metadata = extractProductMetadataFromHtml(finalUrl.toString(), html);
  const imageUrls = extractProductImagesFromHtml(finalUrl.toString(), html);
  const extraction = applyAdapter(finalUrl, html, { metadata, imageUrls });

  logger.info("[AURA_LINK_EXTRACT] extraction complete", {
    domain: metadata.domain,
    hasTitle: !!metadata.title,
    hasBrand: !!metadata.brand,
    imageCount: extraction.imageUrls.length,
  });

  if (!metadata.title && !metadata.description && !metadata.brand) {
    logger.warn("[AURA_LINK_ERROR] metadata extraction failed", {
      domain: metadata.domain,
      imageCount: extraction.imageUrls.length,
    });
    throw new ProductLinkError("No usable product metadata found.", "no_metadata");
  }
  if (!extraction.imageUrls.length) {
    logger.warn("[AURA_LINK_ERROR] image extraction failed", {
      domain: metadata.domain,
      hasTitle: !!metadata.title,
    });
    throw new ProductLinkError("No usable product images found.", "no_images");
  }
  return extraction;
}

function sourceHashFor(urls: string[]): string {
  return createHash("sha1").update(urls.join("|")).digest("hex");
}

export async function createDraftItemFromProductLink(params: {
  uid: string;
  prompt: string;
  extraction: ProductExtraction;
  itemId?: string;
  draftState?: "photo_uploaded" | "awaiting_confirmation";
  ingestionStatus?: "pending" | "awaiting_confirmation";
}): Promise<{ itemId: string; imageCount: number; metadata: ProductMetadata }> {
  const {
    uid,
    prompt,
    extraction,
    itemId,
    draftState = "photo_uploaded",
    ingestionStatus = "pending",
  } = params;
  const now = Date.now();
  const images = extraction.imageUrls.map((url, index) => ({
    originalUrl: url,
    isPrimary: index === 0,
  }));
  const primaryUrl = images[0]?.originalUrl;
  if (!primaryUrl) {
    throw new ProductLinkError("No product image found.", "no_images");
  }

  try {
    const itemData = {
        isDraft: true,
        draftState,
        itemLifecycleStatus: draftState === "awaiting_confirmation" ? "needs_review" : "processing",
        status: "AVAILABLE",
        category: "top",
        subCategory: "",
        wearCountSinceWash: 0,
        ingestionStatus,
        ingestion: {
          status: ingestionStatus,
          lastRunAt: FieldValue.serverTimestamp(),
        },
        ingestionSource: {
          sourceHash: sourceHashFor(extraction.imageUrls),
          sourceType: "aura_product_link",
          sourceUrl: extraction.metadata.sourceUrl,
          domain: extraction.metadata.domain,
        },
        source: "aura_product_link",
        sourceUrl: extraction.metadata.sourceUrl,
        retailer: extraction.metadata.retailer,
        domain: extraction.metadata.domain,
        auraPrompt: prompt,
        linkMetadata: extraction.metadata,
        ...(extraction.metadata.title ? { name: extraction.metadata.title } : {}),
        ...(extraction.metadata.brand ? { brand: extraction.metadata.brand } : {}),
        ...(extraction.metadata.color ? { colorLabel: extraction.metadata.color } : {}),
        ...(extraction.metadata.material ? { material: extraction.metadata.material } : {}),
        images,
        imageUrls: extraction.imageUrls,
        originalImageUrl: primaryUrl,
        cleanedImageUrl: null,
        photoUrl: primaryUrl,
        photos: {
          primaryUrl,
          urls: extraction.imageUrls,
          images,
        },
        createdAt: now,
        updatedAt: now,
      };
    let createdItemId = itemId;
    if (itemId) {
      await getFirestore()
        .collection("users")
        .doc(uid)
        .collection("items")
        .doc(itemId)
        .set(itemData, { merge: true });
    } else {
      const docRef = await getFirestore()
        .collection("users")
        .doc(uid)
        .collection("items")
        .add(itemData);
      createdItemId = docRef.id;
    }
    logger.info("[AURA_LINK_DRAFT] draft item created", {
      uid,
      itemId: createdItemId,
      domain: extraction.metadata.domain,
      imageCount: images.length,
      triggerCompatible: true,
      sourceType: "aura_product_link",
      hasPhotosUrls: extraction.imageUrls.length > 0,
      hasPhotoUrl: !!primaryUrl,
    });
    logger.info("[LINK_IMAGE_SAVE] product link draft image fields", {
      uid,
      itemId: createdItemId,
      sourceUrl: extraction.metadata.sourceUrl,
      primaryUrl,
      imageUrls: extraction.imageUrls,
      savedFields: {
        originalImageUrl: primaryUrl,
        photoUrl: primaryUrl,
        photosPrimaryUrl: primaryUrl,
        cleanedImageUrl: null,
      },
    });
    return {
      itemId: createdItemId ?? "",
      imageCount: images.length,
      metadata: extraction.metadata,
    };
  } catch (error) {
    logger.error("[AURA_LINK_DRAFT] draft item creation failed", {
      uid,
      domain: extraction.metadata.domain,
      error,
    });
    throw new ProductLinkError("Could not create wardrobe draft.", "draft_failed");
  }
}
