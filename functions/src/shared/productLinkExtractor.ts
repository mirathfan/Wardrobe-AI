import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import {
  SafeFetchError,
  redactUrlForLogs,
  safeFetch,
  validateSafeUrlForFetch,
} from "./safeFetch";
import { redactUid } from "./rateLimit";

export type ProductMetadata = {
  sourceUrl: string;
  domain: string;
  retailer: string;
  merchantBrand?: string | null;
  brand?: string | null;
  brandSource?: "json_ld" | "merchant" | "site_name" | "meta" | "title" | null;
  title?: string | null;
  price?: string | null;
  currency?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceDisplay?: string | null;
  salePrice?: number | null;
  originalPrice?: number | null;
  priceExtractionSource?: "json_ld" | "meta" | "visible_text" | null;
  color?: string | null;
  displayColor?: string | null;
  displayColors?: string[] | null;
  description?: string | null;
  productDescription?: string | null;
  categoryHints?: string[];
  material?: string | null;
  materials?: string[];
  fit?: string | null;
  sleeveLength?: string | null;
  collar?: string | null;
  length?: string | null;
  pattern?: string | null;
  sizeOptions?: string[];
  availableSizes?: string[];
  careInstructions?: string[];
  graphicText?: string | null;
  motif?: string | null;
  collaborationName?: string | null;
  sizeHints?: string[];
  sku?: string | null;
};

export type ProductExtraction = {
  metadata: ProductMetadata;
  imageUrls: string[];
  imageExtractionSource?: ProductImageExtractionSource | null;
  imageCandidateCount?: number | null;
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

const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_HTML_CHARS = 1_500_000;
const USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
export const BLOCKED_STORE_MESSAGE = "This store blocked automatic reading. Paste another link or add from screenshot/photo.";
const BLOCKED_STORE_SUBTEXT = "You can try again, paste another link, or add the item from a screenshot.";
const DEBUG_PRODUCT_LINK_LOGS =
  process.env.DEBUG_AURA_CANDIDATE_LOGS === "1" ||
  process.env.DEBUG_AURA_CANDIDATE_LOGS === "true" ||
  process.env.AURA_DEBUG === "1" ||
  process.env.AURA_DEBUG === "true";

export type ProductImageExtractionSource =
  | "json_ld"
  | "og_image"
  | "twitter"
  | "html_image"
  | "fallback";

type ProductImageExtraction = {
  urls: string[];
  source: ProductImageExtractionSource | null;
  candidateCount: number;
};

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
      | "blocked_store"
      | "no_metadata"
      | "no_images"
      | "draft_failed",
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function debugProductLinkInfo(message: string, data: Record<string, unknown>) {
  if (DEBUG_PRODUCT_LINK_LOGS) {
    logger.info(message, data);
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

const RETAILER_BRAND_BY_HOST: Array<[RegExp, string]> = [
  [/(^|\.)hm\.com$/i, "H&M"],
  [/(^|\.)zara\.com$/i, "Zara"],
  [/(^|\.)uniqlo\.com$/i, "Uniqlo"],
  [/(^|\.)nike\.com$/i, "Nike"],
  [/(^|\.)adidas\.com$/i, "Adidas"],
];

const LICENSED_GRAPHIC_TERMS = [
  "kodak",
  "barbie",
  "disney",
  "ferrari",
  "proshots",
  "camera club",
  "nasa",
  "warner bros",
  "marvel",
  "dc comics",
  "star wars",
  "pokemon",
  "hello kitty",
  "snoopy",
  "peanuts",
  "coca-cola",
  "coca cola",
];

const MATERIAL_ALIASES: Array<[RegExp, string]> = [
  [/\bcotton\b/i, "cotton"],
  [/\bpolyester\b/i, "polyester"],
  [/\belastane\b|\bspandex\b|\blycra\b/i, "elastane"],
  [/\bviscose\b|\brayon\b/i, "viscose"],
  [/\blinen\b/i, "linen"],
  [/\bleather\b|\bsuede\b/i, "leather"],
  [/\bwool\b|\bmerino\b|\bcashmere\b/i, "wool"],
  [/\bnylon\b|\bpolyamide\b/i, "nylon"],
  [/\bacrylic\b/i, "acrylic"],
  [/\bmodal\b/i, "modal"],
  [/\blyocell\b|\btencel\b/i, "lyocell"],
  [/\bsilk\b/i, "silk"],
  [/\bdenim\b/i, "denim"],
];

function normalizedHost(host: string) {
  return host.toLowerCase().replace(/^www\d*\./, "");
}

function normalizedDomain(host: string) {
  return normalizedHost(host);
}

function merchantBrandFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  for (const [pattern, brand] of RETAILER_BRAND_BY_HOST) {
    if (pattern.test(host)) return brand;
  }
  return null;
}

function merchantLabelFromUrl(url: URL) {
  const mapped = merchantBrandFromUrl(url);
  if (mapped) return mapped;
  const domain = normalizedDomain(url.hostname);
  const first = domain.split(".")[0] ?? "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : domain;
}

function sameBrand(a?: string | null, b?: string | null) {
  const normalize = (value?: string | null) => String(value ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const left = normalize(a);
  const right = normalize(b);
  return !!left && !!right && left === right;
}

function isLicensedGraphicText(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (!text) return false;
  return LICENSED_GRAPHIC_TERMS.some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

function licensedGraphicFromText(...values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  for (const term of LICENSED_GRAPHIC_TERMS) {
    if (new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
      return term
        .split(" ")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }
  return null;
}

function reliableJsonLdBrand(url: URL, brand?: string | null) {
  const cleaned = cleanText(brand, 120);
  if (!cleaned) return null;
  if (isHmProductUrl(url)) {
    return sameBrand(cleaned, "H&M") ? "H&M" : null;
  }
  if (isLicensedGraphicText(cleaned)) return null;
  return cleaned;
}

type ExtractedProductPrice = {
  amount: number;
  currency: string | null;
  display: string;
  source: "json_ld" | "meta" | "visible_text";
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "US$": "USD",
  "CA$": "CAD",
  "C$": "CAD",
  "AU$": "AUD",
  "A$": "AUD",
  "₹": "INR",
  "€": "EUR",
  "£": "GBP",
  "د.إ": "AED",
};

const ISO_CURRENCY_ALIASES: Record<string, string> = {
  USD: "USD",
  INR: "INR",
  EUR: "EUR",
  GBP: "GBP",
  CAD: "CAD",
  AUD: "AUD",
  AED: "AED",
};

function normalizeCurrencyCode(value: unknown): string | null {
  const raw = cleanText(value, 24);
  if (!raw) return null;
  const symbol = CURRENCY_SYMBOLS[raw] ?? CURRENCY_SYMBOLS[raw.toUpperCase()];
  if (symbol) return symbol;
  const normalized = raw.replace(/[^a-z]/gi, "").toUpperCase();
  if (ISO_CURRENCY_ALIASES[normalized]) return ISO_CURRENCY_ALIASES[normalized];
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function currencyFromPriceText(text: string): string | null {
  const compact = text.replace(/\s+/g, " ").trim();
  const upper = compact.toUpperCase();
  for (const [symbol, currency] of Object.entries(CURRENCY_SYMBOLS).sort((a, b) => b[0].length - a[0].length)) {
    if (compact.includes(symbol)) return currency;
  }
  const isoMatch = upper.match(/\b(USD|INR|EUR|GBP|CAD|AUD|AED)\b/);
  if (isoMatch?.[1]) return isoMatch[1];
  if (/\bRS\.?\s*\d/i.test(compact)) return "INR";
  return null;
}

function parsePriceAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
  }
  const text = cleanText(value, 120);
  if (!text) return null;
  const match = text.match(/\d[\d,.]*/);
  if (!match) return null;
  let numeric = match[0];
  const lastComma = numeric.lastIndexOf(",");
  const lastDot = numeric.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    numeric =
      lastComma > lastDot
        ? numeric.replace(/\./g, "").replace(",", ".")
        : numeric.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimalDigits = numeric.length - lastComma - 1;
    numeric = decimalDigits === 2 ? numeric.replace(",", ".") : numeric.replace(/,/g, "");
  }
  numeric = numeric.replace(/[^0-9.]/g, "");
  const amount = Number(numeric);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return null;
  return Math.round(amount * 100) / 100;
}

function normalizePriceCandidate(params: {
  amount: unknown;
  currency?: unknown;
  source: ExtractedProductPrice["source"];
  display?: string | null;
}): ExtractedProductPrice | null {
  const amount = parsePriceAmount(params.amount);
  if (amount == null) return null;
  const amountText = cleanText(params.amount, 120) ?? String(amount);
  const currency =
    normalizeCurrencyCode(params.currency) ??
    currencyFromPriceText(amountText) ??
    null;
  const display =
    cleanText(params.display, 120) ??
    (currencyFromPriceText(amountText) ? amountText : currency ? `${currency} ${amountText}` : amountText);
  return {
    amount,
    currency,
    display,
    source: params.source,
  };
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

function getOfferCandidates(node: JsonObject): JsonObject[] {
  const offers = node.offers;
  const values = Array.isArray(offers) ? offers : [offers];
  return values
    .map((offer) => (offer && typeof offer === "object" ? (offer as JsonObject) : null))
    .filter((offer): offer is JsonObject => !!offer);
}

function extractPriceFromJsonLdProduct(product: JsonObject): ExtractedProductPrice | null {
  const offers = getOfferCandidates(product);
  const offerCandidates = offers.length ? offers : [product];
  for (const offer of offerCandidates) {
    const currency = offer.priceCurrency ?? product.priceCurrency;
    const direct = normalizePriceCandidate({
      amount: offer.price ?? product.price,
      currency,
      source: "json_ld",
    });
    if (direct) return direct;

    const lowPrice = normalizePriceCandidate({
      amount: offer.lowPrice,
      currency,
      source: "json_ld",
      display:
        offer.lowPrice != null && offer.highPrice != null
          ? `${cleanText(offer.lowPrice, 40) ?? ""}-${cleanText(offer.highPrice, 40) ?? ""}`
          : null,
    });
    if (lowPrice) return lowPrice;

    const highPrice = normalizePriceCandidate({
      amount: offer.highPrice,
      currency,
      source: "json_ld",
    });
    if (highPrice) return highPrice;
  }
  return normalizePriceCandidate({
    amount: product.price,
    currency: product.priceCurrency,
    source: "json_ld",
  });
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
  const productPrice = extractPriceFromJsonLdProduct(product);
  const additional = additionalPropertiesFromJsonLd(product);
  const materialValues = normalizeMaterials([
    cleanText(product.material, 240),
    propertyValueFromAdditionalProperties(additional, ["material", "composition", "fabric"]),
  ]);
  const sizeOptions = extractSizesFromValues([
    product.size,
    propertyValueFromAdditionalProperties(additional, ["size", "available size", "sizes"]),
  ]);
  const careInstructions = cleanList([
    product.careInstructions,
    propertyValueFromAdditionalProperties(additional, ["care", "care instructions", "washing instructions"]),
  ], 6);
  return {
    brand: getBrand(product),
    title: cleanText(product.name, 180),
    description: cleanText(product.description, 700),
    productDescription: cleanText(product.description, 700),
    price: productPrice?.display ?? cleanText(offer?.price ?? product.price, 60),
    currency: productPrice?.currency ?? cleanText(offer?.priceCurrency ?? product.priceCurrency, 12),
    priceAmount: productPrice?.amount ?? null,
    priceCurrency: productPrice?.currency ?? null,
    priceDisplay: productPrice?.display ?? null,
    priceExtractionSource: productPrice?.source ?? null,
    color: cleanText(product.color, 80),
    displayColor: cleanText(product.color, 80),
    displayColors: cleanList(Array.isArray(product.color) ? product.color : [product.color], 6),
    categoryHints: cleanList(
      [
        product.category,
        product.audience,
        product.additionalType,
        product.itemCondition,
      ].filter(Boolean),
    ),
    material: materialValues[0] ?? cleanText(product.material, 160),
    materials: materialValues,
    fit: normalizeFit(propertyValueFromAdditionalProperties(additional, ["fit"])),
    sleeveLength: normalizeSleeveLength(propertyValueFromAdditionalProperties(additional, ["sleeve", "sleeve length"])),
    collar: normalizeCollar(propertyValueFromAdditionalProperties(additional, ["collar", "neckline"])),
    length: normalizeLength(propertyValueFromAdditionalProperties(additional, ["length"])),
    pattern: normalizePattern(propertyValueFromAdditionalProperties(additional, ["pattern", "print"])),
    sizeHints: sizeOptions,
    sizeOptions,
    availableSizes: sizeOptions,
    careInstructions,
    sku: cleanText(product.sku ?? product.mpn ?? product.productID, 120),
  };
}

function parseJsonPayload(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function flattenObjects(value: unknown): JsonObject[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(flattenObjects);
  const object = value as JsonObject;
  return [
    object,
    ...Object.values(object).flatMap((entry) => flattenObjects(entry)),
  ];
}

function additionalPropertiesFromJsonLd(product: JsonObject): JsonObject[] {
  const values = [
    product.additionalProperty,
    product.additionalProperties,
    product.properties,
  ];
  return values.flatMap((value) => asObjectArrayLoose(value));
}

function asObjectArrayLoose(value: unknown): JsonObject[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (entry && typeof entry === "object" ? (entry as JsonObject) : null))
      .filter((entry): entry is JsonObject => !!entry);
  }
  return value && typeof value === "object" ? [value as JsonObject] : [];
}

function propertyValueFromAdditionalProperties(properties: JsonObject[], names: string[]) {
  const normalizedNames = names.map((name) => name.toLowerCase());
  for (const property of properties) {
    const name = cleanText(property.name ?? property.propertyID ?? property.label, 120)?.toLowerCase();
    if (!name) continue;
    if (!normalizedNames.some((candidate) => name.includes(candidate))) continue;
    const value = cleanText(property.value ?? property.valueReference ?? property.description, 240);
    if (value) return value;
  }
  return null;
}

function firstStringFromKeys(object: JsonObject, keys: string[], maxLength = 220) {
  for (const key of keys) {
    const value = object[key];
    const text = cleanText(value, maxLength);
    if (text) return text;
  }
  return null;
}

function objectContainsText(object: JsonObject, needle: string) {
  if (!needle) return false;
  return Object.values(object).some((value) => String(value ?? "").includes(needle));
}

function extractHmJsonMetadata(url: URL, html: string): Partial<ProductMetadata> {
  if (!isHmProductUrl(url)) return {};
  const parsed = parseJsonPayload(html);
  if (!parsed) return {};
  const articleId = hmArticleIdFromUrl(url);
  const objects = flattenObjects(parsed);
  const candidates = [
    ...objects.filter((object) => !!articleId && objectContainsText(object, articleId)),
    ...objects,
  ];
  const selected = candidates.find((object) =>
    firstStringFromKeys(object, ["productName", "name", "title", "formattedName"]) ||
    firstStringFromKeys(object, ["articleCode", "sku", "code", "id"]),
  );
  if (!selected) return {};
  const flattenedText = JSON.stringify(selected);
  const materialValues = normalizeMaterials([
    firstStringFromKeys(selected, ["material", "composition", "materials", "compositionText"], 500),
    flattenedText,
  ]);
  const sizes = extractSizesFromValues([
    selected.sizes,
    selected.availableSizes,
    selected.variants,
    flattenedText,
  ]);
  const rawTitle = firstStringFromKeys(selected, ["productName", "name", "title", "formattedName"], 180);
  const rawDescription = firstStringFromKeys(selected, ["description", "productDescription", "shortDescription"], 700);
  const rawColor = firstStringFromKeys(selected, ["colorName", "colourName", "color", "colour"], 80);
  const hints = extractAttributeHintsFromText(`${rawTitle ?? ""} ${rawDescription ?? ""} ${flattenedText}`);
  return {
    title: rawTitle,
    brand: firstStringFromKeys(selected, ["brandName", "brand"], 120) ?? "H&M",
    color: rawColor,
    displayColor: rawColor,
    displayColors: rawColor ? [rawColor] : [],
    description: rawDescription,
    productDescription: rawDescription,
    material: materialValues[0] ?? hints.material ?? null,
    materials: materialValues.length ? materialValues : hints.materials,
    fit: hints.fit,
    sleeveLength: hints.sleeveLength,
    collar: hints.collar,
    length: hints.length,
    pattern: hints.pattern,
    sizeHints: sizes.length ? sizes : hints.sizeHints,
    sizeOptions: sizes.length ? sizes : hints.sizeOptions,
    availableSizes: sizes.length ? sizes : hints.availableSizes,
    careInstructions: hints.careInstructions,
    sku: firstStringFromKeys(selected, ["articleCode", "sku", "code", "id"], 120) ?? articleId,
  };
}

function extractJsonLdPrice(html: string): ExtractedProductPrice | null {
  const nodes = parseJsonLdBlocks(html).flatMap(flattenJsonLd);
  for (const product of nodes.filter(isProductNode)) {
    const price = extractPriceFromJsonLdProduct(product);
    if (price) return price;
  }
  return null;
}

function extractMetaPrice(html: string): ExtractedProductPrice | null {
  const amount =
    extractMeta(html, "product:price:amount") ??
    extractMeta(html, "og:price:amount");
  if (!amount) return null;
  return normalizePriceCandidate({
    amount,
    currency:
      extractMeta(html, "product:price:currency") ??
      extractMeta(html, "og:price:currency"),
    source: "meta",
  });
}

function extractMetaPriceByKeys(html: string, amountKeys: string[], currencyKeys: string[]): ExtractedProductPrice | null {
  const amount = amountKeys.map((key) => extractMeta(html, key)).find(Boolean);
  if (!amount) return null;
  return normalizePriceCandidate({
    amount,
    currency: currencyKeys.map((key) => extractMeta(html, key)).find(Boolean),
    source: "meta",
  });
}

function stripVisibleText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<(?:header|footer|nav|aside)[\s\S]*?<\/(?:header|footer|nav|aside)>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractOriginalPriceFromVisibleText(html: string, currentAmount?: number | null): ExtractedProductPrice | null {
  const text = stripVisibleText(html).slice(0, 80_000);
  const match = text.match(/\b(?:regular|original|was|list)\s+price\s*[:-]?\s*((?:USD|INR|EUR|GBP|CAD|AUD|AED)\s+|(?:US\$|CA\$|C\$|AU\$|A\$|\$|₹|€|£|د\.إ)\s*)\d[\d,.]*/i);
  const display = cleanText(match?.[1] ? match[0].replace(/^[^$€£₹A-Z]*(?=(?:USD|INR|EUR|GBP|CAD|AUD|AED|US\$|CA\$|C\$|AU\$|A\$|\$|₹|€|£|د\.إ))/i, "") : null, 80);
  if (!display) return null;
  const candidate = normalizePriceCandidate({
    amount: display,
    currency: currencyFromPriceText(display),
    source: "visible_text",
    display,
  });
  if (!candidate) return null;
  if (typeof currentAmount === "number" && candidate.amount <= currentAmount) return null;
  return candidate;
}

function normalizeMaterials(values: Array<unknown>): string[] {
  const text = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => cleanText(value, 700))
    .filter((value): value is string => !!value)
    .join(" ");
  const found: string[] = [];
  for (const [pattern, material] of MATERIAL_ALIASES) {
    if (pattern.test(text) && !found.includes(material)) found.push(material);
  }
  return found.slice(0, 8);
}

function normalizeFit(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (/\bloose\s+fit\b|\bloose\b/.test(text)) return "loose";
  if (/\brelaxed\s+fit\b|\brelaxed\b/.test(text)) return "relaxed";
  if (/\boversized\b/.test(text)) return "oversized";
  if (/\bslim\s+fit\b|\bslim\b/.test(text)) return "slim";
  if (/\bregular\s+fit\b|\bregular\b/.test(text)) return "regular";
  if (/\bstraight\s+fit\b/.test(text)) return "straight";
  return null;
}

function normalizeSleeveLength(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (/\blong[-\s]?sleeved?\b|\blong sleeves?\b/.test(text)) return "long sleeve";
  if (/\bshort[-\s]?sleeved?\b|\bshort sleeves?\b/.test(text)) return "short sleeve";
  if (/\bsleeveless\b/.test(text)) return "sleeveless";
  if (/\b3\/4\b|\bthree-quarter\b/.test(text)) return "three-quarter sleeve";
  return null;
}

function normalizeCollar(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (/\bpolo collar\b|\bturn-down collar\b|\bcollar\b/.test(text)) return "collared";
  if (/\bcrew neck\b|\bcrewneck\b/.test(text)) return "crew neck";
  if (/\bv-neck\b|\bv neck\b/.test(text)) return "v-neck";
  if (/\bmock neck\b/.test(text)) return "mock neck";
  return null;
}

function normalizeLength(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (/\bcropped\b/.test(text)) return "cropped";
  if (/\blongline\b|\blong length\b/.test(text)) return "long";
  if (/\bregular length\b|\bregular\b/.test(text)) return "regular";
  if (/\bshort length\b|\bshort\b/.test(text)) return "short";
  return null;
}

function normalizePattern(value?: string | null) {
  const text = String(value ?? "").toLowerCase();
  if (/\bstriped?\b|\bstripe\b/.test(text)) return "striped";
  if (/\bplaid\b|\bchecked?\b|\bcheck\b/.test(text)) return "checked";
  if (/\bgraphic\b|\bmotif\b|\bprinted graphic\b/.test(text)) return "graphic";
  if (/\bprint(?:ed)?\b/.test(text)) return "printed";
  if (/\bfloral\b/.test(text)) return "floral";
  if (/\bsolid\b|\bplain\b/.test(text)) return "solid";
  return null;
}

function extractSizesFromValues(values: unknown[]) {
  const text = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value) => cleanText(value, 500))
    .filter((value): value is string => !!value)
    .join(" ");
  const ordered = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];
  const found = ordered.filter((size) => new RegExp(`\\b${size}\\b`, "i").test(text));
  const numeric = Array.from(text.matchAll(/\b(?:US\s*)?(\d{1,2}(?:\.\d)?)\b/g))
    .map((match) => match[1])
    .filter((value): value is string => !!value)
    .slice(0, 12);
  return Array.from(new Set([...found, ...numeric])).slice(0, 16);
}

function extractColorFromText(value?: string | null) {
  const text = String(value ?? "").trim();
  const slashColor = text.match(/^([A-Za-z]+(?:\s+[A-Za-z]+){0,2})\s*\//)?.[1];
  if (slashColor) return cleanText(slashColor.toLowerCase(), 80);
  const known = text.match(/\b(light blue|dark blue|navy blue|sky blue|cream|ecru|beige|black|white|gray|grey|red|green|blue|yellow|pink|purple|orange|brown|khaki|olive|stone|ivory|silver|gold)\b/i)?.[1];
  return known ? known.toLowerCase() : null;
}

function extractAttributeHintsFromText(text: string): Partial<ProductMetadata> {
  const source = cleanText(text, 5000) ?? "";
  const materials = normalizeMaterials([source]);
  const sizes = extractSizesFromValues([source]);
  const care = Array.from(source.matchAll(/\b(?:machine wash|wash with|do not bleach|tumble dry|line dry|dry clean|iron on)[^.]{0,100}/gi))
    .map((match) => cleanText(match[0], 140))
    .filter((value): value is string => !!value)
    .slice(0, 6);
  return {
    material: materials[0] ?? null,
    materials,
    fit: normalizeFit(source),
    sleeveLength: normalizeSleeveLength(source),
    collar: normalizeCollar(source),
    length: normalizeLength(source),
    pattern: normalizePattern(source),
    sizeOptions: sizes,
    availableSizes: sizes,
    sizeHints: sizes,
    careInstructions: care,
  };
}

function inferCategoryHintsFromTitle(title?: string | null): string[] {
  const text = String(title ?? "").toLowerCase();
  if (/\bfootball shirt\b/.test(text)) return ["top", "football shirt"];
  if (/\bpolo\b/.test(text)) return ["top", "polo"];
  if (/\bt-?shirt\b|\btee\b/.test(text)) return ["top", "tshirt"];
  if (/\bshirt\b/.test(text)) return ["top", "shirt"];
  if (/\bhoodie\b/.test(text)) return ["top", "hoodie"];
  if (/\bsweater|jumper|knit\b/.test(text)) return ["top", "sweater"];
  if (/\bracer jacket\b/.test(text)) return ["outerwear", "racer jacket"];
  if (/\bjacket\b/.test(text)) return ["outerwear", "jacket"];
  if (/\bcoat\b/.test(text)) return ["outerwear", "coat"];
  if (/\bblazer\b/.test(text)) return ["outerwear", "blazer"];
  if (/\bjeans?\b/.test(text)) return ["bottom", "jeans"];
  if (/\btrousers?\b|\bpants?\b/.test(text)) return ["bottom", "trousers"];
  if (/\bshorts?\b/.test(text)) return ["bottom", "shorts"];
  if (/\bskirt\b/.test(text)) return ["bottom", "skirt"];
  if (/\bsneakers?\b|\btrainers?\b/.test(text)) return ["footwear", "sneakers"];
  if (/\bboots?\b/.test(text)) return ["footwear", "boots"];
  if (/\bloafers?\b/.test(text)) return ["footwear", "loafers"];
  if (/\bdress\b/.test(text)) return ["one_piece", "dress"];
  return [];
}

function productNounFromHints(hints: string[], fallbackTitle?: string | null) {
  const sub = hints[1];
  if (sub && !/^(tshirt|shirt|top|bottom|outerwear|footwear)$/i.test(sub)) return sub;
  const title = String(fallbackTitle ?? "").toLowerCase();
  return (
    title.match(/\bfootball shirt\b/)?.[0] ??
    title.match(/\bracer jacket\b/)?.[0] ??
    title.match(/\b(?:polo|t-?shirt|shirt|hoodie|sweater|jacket|coat|blazer|jeans|trousers|pants|shorts|skirt|sneakers|trainers|boots|loafers|dress)\b/)?.[0] ??
    sub ??
    "item"
  );
}

function removeBrandWords(title: string, brand?: string | null) {
  let next = title;
  const brands = [brand, "H&M", "Zara", "Uniqlo", "Nike", "Adidas"]
    .map((value) => cleanText(value, 80))
    .filter((value): value is string => !!value);
  for (const candidate of brands) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next
      .replace(new RegExp(`^${escaped}\\s+`, "i"), "")
      .replace(new RegExp(`\\s+[|–-]\\s*${escaped}\\s*$`, "i"), "")
      .replace(new RegExp(`\\b${escaped}\\b`, "i"), "");
  }
  return next.replace(/\s+/g, " ").trim();
}

function titleDerivedBrand(title?: string | null) {
  const text = cleanText(title, 220);
  if (!text) return null;
  const firstSegment = text.split(/\s+[|–-]\s+|:/)[0]?.trim();
  if (!firstSegment) return null;
  if (isLicensedGraphicText(firstSegment)) return null;
  const words = firstSegment.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 3) return null;
  if (/\b(light|dark|blue|black|white|cream|loose|regular|slim|fit|shirt|jacket|dress|pants|trousers|sneakers?)\b/i.test(firstSegment)) {
    return null;
  }
  return cleanText(firstSegment, 120);
}

function cleanRetailProductTitle(params: {
  rawTitle?: string | null;
  brand?: string | null;
  color?: string | null;
  fit?: string | null;
  pattern?: string | null;
  categoryHints?: string[];
  graphicText?: string | null;
}) {
  const raw = cleanText(params.rawTitle, 260);
  if (!raw) return null;
  let title = raw
    .replace(/\s*\|\s*H\s*&\s*M(?:\s+[A-Z]{2})?\s*$/i, "")
    .replace(/\s*\|\s*Zara\s*$/i, "")
    .replace(/\s*\|\s*Nike\s*$/i, "")
    .replace(/^Men[’']s\s+/i, "")
    .replace(/^Women[’']s\s+/i, "")
    .replace(/^Ladies[’']?\s+/i, "")
    .trim();

  title = title.replace(/^([^/]{2,36})\/([A-Za-z0-9&'.-]+)\s+/i, (_match, colorPart: string, slashPart: string) => {
    if (isLicensedGraphicText(slashPart)) return `${colorPart} `;
    return `${colorPart} ${slashPart} `;
  });

  const graphicText = params.graphicText ?? licensedGraphicFromText(title);
  if (graphicText) {
    title = title.replace(new RegExp(`\\b${graphicText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), "");
  }
  title = removeBrandWords(title, params.brand)
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const color = cleanText(params.color ?? extractColorFromText(raw), 80)?.toLowerCase() ?? null;
  const fit = params.fit ?? normalizeFit(title);
  const pattern = params.pattern ?? normalizePattern(title);
  const noun = productNounFromHints(params.categoryHints ?? inferCategoryHintsFromTitle(title), title);
  const lowerTitle = title.toLowerCase();
  const shouldRebuild =
    isLicensedGraphicText(raw) ||
    /\/[A-Za-z0-9&'.-]+/.test(raw) ||
    (color && fit && !lowerTitle.includes(`${color} ${fit}`));
  if (!shouldRebuild) {
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  const parts = [color, fit, pattern && pattern !== "solid" ? pattern : null, noun]
    .filter((value): value is string => !!value)
    .filter((value, index, array) => array.findIndex((entry) => sameBrand(entry, value)) === index);
  const rebuilt = parts.join(" ").replace(/\s+/g, " ").trim();
  return rebuilt ? rebuilt.charAt(0).toUpperCase() + rebuilt.slice(1) : title || raw;
}

function hasUnsafePriceContext(context: string): boolean {
  return /\b(?:shipping|delivery|returns?|tax|subtotal|cart|bag|checkout|installments?|instalments?|payments?|per\s+month|monthly|\/mo|klarna|afterpay|affirm|sezzle|zip|reward|rewards|points?|cash\s*back|coupon|promo|newsletter|gift\s*card|save|discount|off|minimum|free|was|original|regular|compare\s+at|list\s+price|msrp)\b/i.test(context);
}

function extractVisibleTextPrice(html: string): ExtractedProductPrice | null {
  const text = stripVisibleText(html).slice(0, 80_000);
  if (!text) return null;
  const priceRe =
    /(?:\b(?:USD|INR|EUR|GBP|CAD|AUD|AED)\s+|(?:US\$|CA\$|C\$|AU\$|A\$|\$|₹|€|£|د\.إ)\s*)\d[\d,.]*(?:\.\d{1,2})?/gi;
  const matches: ExtractedProductPrice[] = [];
  let match: RegExpExecArray | null;
  while ((match = priceRe.exec(text))) {
    const display = cleanText(match[0], 80);
    if (!display) continue;
    const context = text.slice(Math.max(0, match.index - 70), match.index + display.length + 70);
    if (hasUnsafePriceContext(context)) continue;
    const candidate = normalizePriceCandidate({
      amount: display,
      currency: currencyFromPriceText(display),
      source: "visible_text",
      display,
    });
    if (!candidate) continue;
    if (candidate.amount < 3) continue;
    matches.push(candidate);
    if (matches.length > 8) break;
  }
  const unique = new Map<string, ExtractedProductPrice>();
  for (const candidate of matches) {
    unique.set(`${candidate.currency ?? "UNK"}:${candidate.amount.toFixed(2)}`, candidate);
  }
  if (unique.size !== 1) return null;
  return Array.from(unique.values())[0] ?? null;
}

export function extractProductPriceFromHtml(_url: string, html: string): ExtractedProductPrice | null {
  return extractJsonLdPrice(html) ?? extractMetaPrice(html) ?? extractVisibleTextPrice(html);
}

function extractProductPriceSetFromHtml(url: string, html: string) {
  const current = extractProductPriceFromHtml(url, html);
  const sale =
    extractMetaPriceByKeys(
      html,
      ["product:sale_price:amount", "og:sale_price:amount", "sale_price", "salePrice"],
      ["product:sale_price:currency", "og:sale_price:currency", "product:price:currency", "og:price:currency"],
    ) ?? null;
  const original =
    extractMetaPriceByKeys(
      html,
      [
        "product:original_price:amount",
        "product:price:original_amount",
        "og:price:standard_amount",
        "original_price",
        "regular_price",
      ],
      ["product:original_price:currency", "product:price:currency", "og:price:currency"],
    ) ?? extractOriginalPriceFromVisibleText(html, current?.amount ?? sale?.amount ?? null);
  const salePrice =
    sale?.amount ??
    (original?.amount && current?.amount && current.amount < original.amount ? current.amount : null);
  return {
    current,
    salePrice,
    originalPrice: original?.amount ?? null,
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

function imageDedupKey(url: string) {
  return url.replace(/([?&])(imwidth|width|height|w|h|sw|sh|q|quality)=\d+/gi, "$1").toLowerCase();
}

function productIdHintsFromUrl(url: URL) {
  const values = [
    ...url.pathname.matchAll(/[A-Z0-9]{5,}-\d{2,}|\b\d{5,}\b/gi),
    ...url.search.matchAll(/[A-Z0-9]{5,}-\d{2,}|\b\d{5,}\b/gi),
  ]
    .map((match) => match[0]?.toLowerCase())
    .filter((value): value is string => !!value && value.length >= 5);
  return Array.from(new Set(values)).slice(0, 6);
}

function imageSourceWeight(source: ProductImageExtractionSource) {
  switch (source) {
    case "json_ld":
      return 42;
    case "og_image":
      return 30;
    case "twitter":
      return 22;
    case "html_image":
      return 8;
    case "fallback":
    default:
      return 0;
  }
}

function contextualImageScore(url: string, source: ProductImageExtractionSource, sourceUrl: URL) {
  const lower = url.toLowerCase();
  const productIdBoost = productIdHintsFromUrl(sourceUrl).some((id) => lower.includes(id)) ? 20 : 0;
  return scoreImageUrl(url) + imageSourceWeight(source) + productIdBoost;
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

function scoreImageUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(lower)) score += 8;
  if (/(product|pdp|gallery|image|photo|model|main|packshot|studio)/i.test(lower)) score += 12;
  if (/(clean|cutout|transparent|isolated|packshot|studio)/i.test(lower)) score += 18;
  if (/^image\.hm\.com$/i.test(safeHost(url))) score += 10;
  const dims = imageDimensionHints(url);
  const largestDim = dims.length ? Math.max(...dims) : 0;
  if (largestDim >= 1000) score += 18;
  else if (largestDim >= 700) score += 12;
  else if (largestDim > 0 && largestDim < 220) score -= 35;
  else if (largestDim > 0 && largestDim < 420) score -= 12;
  if (/(detail|close[-_ ]?up|zoom|macro|fabric|texture|material|crop|cropped|graphic|logo[-_ ]?shot|chest[-_ ]?graphic|print[-_ ]?detail)/i.test(lower)) {
    score -= 55;
  }
  if (/(screenshot|screen[-_ ]?shot|share|social|swatch|colorchip|variant|thumb|thumbnail|icon|sprite|logo|banner|header|footer|ui|nav)/i.test(lower)) {
    score -= 45;
  }
  if (/(logo|icon|sprite|favicon|placeholder|badge|payment|loader)/i.test(lower)) {
    score -= 70;
  }
  return score;
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function imageScoreReasons(url: string): string[] {
  const lower = url.toLowerCase();
  const reasons: string[] = [];
  const dims = imageDimensionHints(url);
  const largestDim = dims.length ? Math.max(...dims) : 0;
  if (/(product|pdp|gallery|image|photo|model|main|packshot|studio)/i.test(lower)) {
    reasons.push("product/gallery URL hint");
  }
  if (/^image\.hm\.com$/i.test(safeHost(url))) reasons.push("H&M product image host");
  if (largestDim >= 700) reasons.push(`large image hint ${largestDim}px`);
  if (/(detail|close[-_ ]?up|zoom|macro|fabric|texture|material|crop|cropped|graphic|logo[-_ ]?shot|chest[-_ ]?graphic|print[-_ ]?detail)/i.test(lower)) {
    reasons.push("detail/close-up URL penalty");
  }
  if (/(share|social|swatch|thumb|thumbnail|icon|sprite|logo|banner|header|footer|ui|nav)/i.test(lower)) {
    reasons.push("thumbnail/social URL penalty");
  }
  return reasons.length ? reasons : ["generic URL and resolution heuristic"];
}

function dedupeStableImageUrls(urls: string[]): string[] {
  const byKey = new Map<string, { url: string; firstIndex: number; score: number }>();
  urls.forEach((url, index) => {
    if (/\s/.test(url)) return;
    const key = imageDedupKey(url);
    const score = scoreImageUrl(url);
    if (score < -2) return;
    const existing = byKey.get(key);
    if (!existing || score > existing.score || (score === existing.score && url.localeCompare(existing.url) < 0)) {
      byKey.set(key, {
        url,
        firstIndex: existing?.firstIndex ?? index,
        score,
      });
    }
  });
  return Array.from(byKey.values())
    .sort((a, b) => a.firstIndex - b.firstIndex || a.url.localeCompare(b.url))
    .map((entry) => entry.url);
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

function hmContentFallbackUrls(url: URL) {
  if (!isHmProductUrl(url)) return [];
  return [
    new URL(`${url.pathname}/_jcr_content.product.json`, url).toString(),
    new URL(`${url.pathname}/_jcr_content/product.json`, url).toString(),
  ];
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

function rankImageUrlsByUrlHeuristic(urls: string[], sourceUrl: string, label: string) {
  const ranked = urls
    .map((url, index) => ({ url, index, score: scoreImageUrl(url), reasons: imageScoreReasons(url) }))
    .sort((a, b) => b.score - a.score || a.index - b.index || a.url.localeCompare(b.url));
  ranked.forEach((entry, rank) => {
    logger.info("[LINK_IMAGE_SCORE] URL heuristic score", {
      sourceUrl: redactUrlForLogs(sourceUrl),
      source: label,
      sourceIndex: entry.index,
      rank,
      url: redactUrlForLogs(entry.url),
      score: entry.score,
      reasons: entry.reasons,
    });
  });
  return ranked.map((entry) => entry.url);
}

function extractHmScopedProductImages(html: string, baseUrl: URL): string[] | null {
  if (!isHmProductUrl(baseUrl)) return null;
  const articleId = hmArticleIdFromUrl(baseUrl);
  const products = parseJsonLdBlocks(html).flatMap(flattenJsonLd).filter(isProductNode);
  const scopedProduct = articleId
    ? products.find((product) => productNodeMatchesArticle(product, articleId))
    : products[0];
  const rawImages = scopedProduct ? imageValuesFromJsonLd(scopedProduct.image, baseUrl) : [];
  const scopedImages = rankImageUrlsByUrlHeuristic(
    dedupeStableImageUrls(rawImages),
    baseUrl.toString(),
    "hm_scoped_json_ld",
  ).slice(0, 8);
  logger.info("[LINK_PRODUCT_SCOPE]", {
    sourceUrl: redactUrlForLogs(baseUrl.toString()),
    retailer: "hm",
    articleId,
    productNodeCount: products.length,
    matchedSku: scopedProduct ? cleanText(scopedProduct.sku, 120) : null,
    matchedTitleLength: scopedProduct ? String(cleanText(scopedProduct.name, 180) ?? "").length : 0,
    scopedImageCount: scopedImages.length,
  });
  logger.info("[LINK_IMAGE_CANDIDATES_SCOPED]", {
    sourceUrl: redactUrlForLogs(baseUrl.toString()),
    retailer: "hm",
    articleId,
    candidateCount: scopedImages.length,
    urls: scopedImages.map((url) => redactUrlForLogs(url)),
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
    /["']((?:https?:)?\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)(?:\?[^\s"']*)?)["']/gi;
  while ((match = quotedUrlRe.exec(html))) {
    const normalized = normalizeUrl(baseUrl, match[1] ?? "");
    if (normalized) out.push(normalized);
  }
  return out;
}

function rankImageCandidatesBySource(
  candidates: { url: string; source: ProductImageExtractionSource; index: number }[],
  sourceUrl: URL,
) {
  const byKey = new Map<string, { url: string; source: ProductImageExtractionSource; index: number; score: number }>();
  for (const candidate of candidates) {
    if (/\s/.test(candidate.url)) continue;
    const score = contextualImageScore(candidate.url, candidate.source, sourceUrl);
    if (score < 8) continue;
    const key = imageDedupKey(candidate.url);
    const existing = byKey.get(key);
    if (!existing || score > existing.score || (score === existing.score && candidate.index < existing.index)) {
      byKey.set(key, { ...candidate, index: existing?.index ?? candidate.index, score });
    }
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.score - a.score || a.index - b.index || a.url.localeCompare(b.url));
}

function extractProductImagesWithSource(url: string, html: string): ProductImageExtraction {
  const baseUrl = new URL(url);
  if (isAmazonProductUrl(baseUrl)) {
    return { urls: [], source: null, candidateCount: 0 };
  }
  const scopedHmImages = extractHmScopedProductImages(html, baseUrl);
  if (scopedHmImages) {
    return {
      urls: scopedHmImages,
      source: "json_ld",
      candidateCount: scopedHmImages.length,
    };
  }
  const nikeVariantImages = extractNikeSelectedVariantData(baseUrl.toString(), html)?.imageUrls;
  if (nikeVariantImages?.length) {
    return {
      urls: nikeVariantImages,
      source: "fallback",
      candidateCount: nikeVariantImages.length,
    };
  }

  let sourceIndex = 0;
  const withSource = (
    source: ProductImageExtractionSource,
    urls: Array<string | null | undefined>,
  ) =>
    urls
      .filter((entry): entry is string => !!entry)
      .map((entry) => ({
        url: entry,
        source,
        index: sourceIndex++,
      }));
  const candidates = [
    ...withSource("json_ld", extractJsonLdImages(html, baseUrl)),
    ...withSource(
      "og_image",
      [extractMeta(html, "og:image"), extractMeta(html, "og:image:secure_url")]
        .map((value) => (value ? normalizeUrl(baseUrl, value) : null)),
    ),
    ...withSource(
      "twitter",
      [extractMeta(html, "twitter:image"), extractMeta(html, "twitter:image:src")]
        .map((value) => (value ? normalizeUrl(baseUrl, value) : null)),
    ),
    ...withSource("html_image", extractMarkupImages(html, baseUrl)),
  ];
  const ranked = rankImageCandidatesBySource(candidates, baseUrl);
  const urls = ranked.slice(0, 12).map((entry) => entry.url);
  const source = ranked[0]?.source ?? null;
  debugProductLinkInfo("[AURA_LINK_DEBUG] image extraction source", {
    host: baseUrl.hostname,
    path: baseUrl.pathname,
    extractionSource: source,
    candidateCount: ranked.length,
    selectedImageHost: urls[0] ? safeHost(urls[0]) : null,
  });
  logger.info("[LINK_IMAGE_CANDIDATES] extracted product image candidates", {
    sourceUrl: redactUrlForLogs(url),
    extractionSource: source,
    candidateCount: ranked.length,
    urls: urls.slice(0, 20).map((entry) => redactUrlForLogs(entry)),
  });
  ranked.slice(0, 12).forEach((entry, rank) => {
    logger.info("[LINK_IMAGE_SCORE] URL heuristic score", {
      sourceUrl: redactUrlForLogs(url),
      source: entry.source,
      sourceIndex: entry.index,
      rank,
      url: redactUrlForLogs(entry.url),
      score: entry.score,
      reasons: imageScoreReasons(entry.url),
    });
  });
  logger.info("[LINK_IMAGE_PRIMARY] generic primary image selected", {
    sourceUrl: redactUrlForLogs(url),
    extractionSource: source,
    primaryImageUrl: redactUrlForLogs(urls[0]),
  });
  logger.info("[LINK_IMAGE_SECONDARY] generic secondary images selected", {
    sourceUrl: redactUrlForLogs(url),
    secondaryImageUrls: urls.slice(1).map((entry) => redactUrlForLogs(entry)),
  });
  return {
    urls,
    source,
    candidateCount: ranked.length,
  };
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
    sourceUrl: redactUrlForLogs(sourceUrl),
    finalResolvedUrl: redactUrlForLogs(canonicalUrl.toString()),
  });
  logger.info("[NIKE_LINK] selected variant detected", {
    sourceUrl: redactUrlForLogs(canonicalUrl.toString()),
    titleLength: String(title ?? "").length,
    colorwayLength: String(colorDescription ?? "").length,
    styleColor,
  });
  logger.info("[NIKE_LINK] image candidates before filtering", {
    sourceUrl: redactUrlForLogs(canonicalUrl.toString()),
    styleColor,
    candidateCount: genericCandidates.length,
  });
  logger.info("[NIKE_LINK] image candidates after filtering", {
    sourceUrl: redactUrlForLogs(canonicalUrl.toString()),
    styleColor,
    candidateCount: imageUrls.length,
    chosenPrimaryImage: redactUrlForLogs(imageUrls[0] ?? null),
  });
  if (rejected.length) {
    logger.info("[NIKE_LINK] rejected image candidates", {
      sourceUrl: redactUrlForLogs(canonicalUrl.toString()),
      styleColor,
      rejectedCount: rejected.length,
    });
  }

  const domain = normalizedDomain(canonicalUrl.hostname);
  const retailer = merchantLabelFromUrl(canonicalUrl);
  return {
    metadata: {
      sourceUrl: canonicalUrl.toString(),
      domain,
      retailer,
      merchantBrand: merchantBrandFromUrl(canonicalUrl),
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
  return extractProductImagesWithSource(url, html).urls;
}

export function extractProductMetadataFromHtml(
  url: string,
  html: string,
): ProductMetadata {
  const parsed = new URL(url);
  const extractedPrices = extractProductPriceSetFromHtml(parsed.toString(), html);
  const extractedPrice = extractedPrices.current;
  if (isAmazonProductUrl(parsed)) {
    return {
      sourceUrl: parsed.toString(),
      domain: normalizedDomain(parsed.hostname),
      retailer: "amazon",
      merchantBrand: "Amazon",
      price: extractedPrice?.display ?? null,
      currency: extractedPrice?.currency ?? null,
      priceAmount: extractedPrice?.amount ?? null,
      priceCurrency: extractedPrice?.currency ?? null,
      priceDisplay: extractedPrice?.display ?? null,
      salePrice: extractedPrices.salePrice,
      originalPrice: extractedPrices.originalPrice,
      priceExtractionSource: extractedPrice?.source ?? null,
    };
  }
  const domain = normalizedDomain(parsed.hostname);
  const retailer = merchantLabelFromUrl(parsed);
  const merchantBrand = merchantBrandFromUrl(parsed);
  const jsonLd = extractJsonLdProduct(html);
  const hmJson = extractHmJsonMetadata(parsed, html);
  const nikeVariant = extractNikeSelectedVariantData(parsed.toString(), html);
  const nikeMetadata: Partial<ProductMetadata> = nikeVariant?.metadata ?? {};
  const rawTitle =
    nikeMetadata.title ??
    jsonLd.title ??
    hmJson.title ??
    extractMeta(html, "og:title") ??
    extractMeta(html, "twitter:title") ??
    extractTitle(html);
  const rawDescription =
    nikeMetadata.description ??
    jsonLd.description ??
    hmJson.description ??
    extractMeta(html, "og:description") ??
    extractMeta(html, "description") ??
    extractMeta(html, "twitter:description");
  const siteName =
    extractMeta(html, "og:site_name") ??
    extractMeta(html, "application-name") ??
    extractMeta(html, "apple-mobile-web-app-title");
  const metaBrand = extractMeta(html, "product:brand") ?? extractMeta(html, "brand");
  const jsonLdBrand = reliableJsonLdBrand(parsed, jsonLd.brand);
  const resolvedBrand =
    nikeMetadata.brand ??
    jsonLdBrand ??
    merchantBrand ??
    cleanText(siteName, 120) ??
    cleanText(metaBrand, 120) ??
    titleDerivedBrand(rawTitle) ??
    null;
  const brandSource: ProductMetadata["brandSource"] =
    nikeMetadata.brand || jsonLdBrand
      ? "json_ld"
      : merchantBrand
        ? "merchant"
        : siteName
          ? "site_name"
          : metaBrand
            ? "meta"
            : titleDerivedBrand(rawTitle)
              ? "title"
              : null;
  const graphicText = licensedGraphicFromText(rawTitle, rawDescription);
  const textAttributes = extractAttributeHintsFromText(`${rawTitle ?? ""} ${rawDescription ?? ""} ${stripVisibleText(html).slice(0, 30_000)}`);
  const color =
    nikeMetadata.color ??
    jsonLd.color ??
    hmJson.color ??
    extractMeta(html, "product:color") ??
    extractMeta(html, "color") ??
    extractColorFromText(rawTitle);
  const displayColors = Array.from(new Set([
    ...cleanList(jsonLd.displayColors, 8),
    ...cleanList(hmJson.displayColors, 8),
    color,
  ].filter((value): value is string => !!cleanText(value, 80))));
  const categoryHints = Array.from(new Set([
    ...(nikeMetadata.categoryHints ?? []),
    ...(jsonLd.categoryHints ?? []),
    ...(hmJson.categoryHints ?? []),
    ...inferCategoryHintsFromTitle(rawTitle),
  ].filter(Boolean)));
  const materials = Array.from(new Set([
    ...(nikeMetadata.materials ?? []),
    ...(jsonLd.materials ?? []),
    ...(hmJson.materials ?? []),
    ...(textAttributes.materials ?? []),
    ...normalizeMaterials([
      extractMeta(html, "product:material"),
      extractMeta(html, "material"),
    ]),
  ]));
  const fit = nikeMetadata.fit ?? jsonLd.fit ?? hmJson.fit ?? textAttributes.fit ?? normalizeFit(rawTitle);
  const pattern = nikeMetadata.pattern ?? jsonLd.pattern ?? hmJson.pattern ?? textAttributes.pattern ?? normalizePattern(rawTitle);
  const cleanTitle = cleanRetailProductTitle({
    rawTitle,
    brand: resolvedBrand,
    color,
    fit,
    pattern,
    categoryHints,
    graphicText,
  });
  const sizeOptions = Array.from(new Set([
    ...(nikeMetadata.sizeOptions ?? nikeMetadata.sizeHints ?? []),
    ...(jsonLd.sizeOptions ?? jsonLd.sizeHints ?? []),
    ...(hmJson.sizeOptions ?? hmJson.sizeHints ?? []),
    ...(textAttributes.sizeOptions ?? textAttributes.sizeHints ?? []),
  ])).slice(0, 16);
  const careInstructions = Array.from(new Set([
    ...(nikeMetadata.careInstructions ?? []),
    ...(jsonLd.careInstructions ?? []),
    ...(hmJson.careInstructions ?? []),
    ...(textAttributes.careInstructions ?? []),
  ])).slice(0, 6);
  const metadata: ProductMetadata = {
    sourceUrl: nikeMetadata.sourceUrl ?? parsed.toString(),
    domain: nikeMetadata.domain ?? domain,
    retailer: nikeMetadata.retailer ?? retailer,
    merchantBrand,
    brand: resolvedBrand,
    brandSource,
    title: cleanTitle,
    price:
      extractedPrice?.display ??
      jsonLd.price ??
      extractMeta(html, "product:price:amount") ??
      extractMeta(html, "og:price:amount") ??
      extractMeta(html, "price") ??
      extractMeta(html, "twitter:data1"),
    currency:
      extractedPrice?.currency ??
      jsonLd.currency ??
      extractMeta(html, "product:price:currency") ??
      extractMeta(html, "og:price:currency") ??
      extractMeta(html, "currency"),
    priceAmount: extractedPrice?.amount ?? jsonLd.priceAmount ?? null,
    priceCurrency: extractedPrice?.currency ?? jsonLd.priceCurrency ?? null,
    priceDisplay: extractedPrice?.display ?? jsonLd.priceDisplay ?? null,
    salePrice: extractedPrices.salePrice,
    originalPrice: extractedPrices.originalPrice,
    priceExtractionSource: extractedPrice?.source ?? jsonLd.priceExtractionSource ?? null,
    color,
    displayColor: color,
    displayColors,
    description: rawDescription,
    productDescription: rawDescription,
    categoryHints,
    material: materials[0] ?? jsonLd.material ?? hmJson.material ?? textAttributes.material ?? null,
    materials,
    fit,
    sleeveLength: nikeMetadata.sleeveLength ?? jsonLd.sleeveLength ?? hmJson.sleeveLength ?? textAttributes.sleeveLength ?? normalizeSleeveLength(rawTitle),
    collar: nikeMetadata.collar ?? jsonLd.collar ?? hmJson.collar ?? textAttributes.collar ?? normalizeCollar(rawTitle),
    length: nikeMetadata.length ?? jsonLd.length ?? hmJson.length ?? textAttributes.length ?? normalizeLength(rawTitle),
    pattern,
    sizeHints: sizeOptions,
    sizeOptions,
    availableSizes: sizeOptions,
    careInstructions,
    graphicText,
    motif: graphicText,
    collaborationName: graphicText && /\bcollab|collaboration\b/i.test(`${rawTitle ?? ""} ${rawDescription ?? ""}`) ? graphicText : null,
    sku:
      nikeMetadata.sku ??
      jsonLd.sku ??
      hmJson.sku ??
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
  const domain = normalizedDomain(url.hostname);
  const title = cleanAmazonTitle(extractMeta(html, "og:title") ?? extractTitle(html));
  const imageUrls = amazonImagesFromStructuredHtml(url, html);
  const brand = extractAmazonBrandFromTitle(title);
  const inferred = inferAmazonCategoryFromTitle(title);
  const extractedPrice = extractProductPriceFromHtml(url.toString(), html);
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
    merchantBrand: "Amazon",
    title,
    brand: status === "ready" ? brand : null,
    categoryHints: status === "ready" && inferred.category ? [inferred.category, inferred.subCategory ?? ""].filter(Boolean) : [],
    sku: asin,
    price: extractedPrice?.display ?? null,
    currency: extractedPrice?.currency ?? null,
    priceAmount: extractedPrice?.amount ?? null,
    priceCurrency: extractedPrice?.currency ?? null,
    priceDisplay: extractedPrice?.display ?? null,
    priceExtractionSource: extractedPrice?.source ?? null,
  };
  logger.info("[AMAZON_LINK] extraction", {
    asin,
    sourceUrl: redactUrlForLogs(url.toString()),
    success: !!title || imageUrls.length > 0,
    confidence,
    status,
    titleLength: String(title ?? "").length,
    hasBrand: !!brand,
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

export async function validateProductUrl(rawUrl: string): Promise<URL> {
  try {
    return await validateSafeUrlForFetch(rawUrl);
  } catch (error) {
    if (error instanceof SafeFetchError) {
      if (error.code === "invalid_url") {
        throw new ProductLinkError("Invalid product link.", "invalid_url");
      }
      if (error.code === "unsafe_url") {
        throw new ProductLinkError("That link is not safe to fetch.", "unsafe_url");
      }
    }
    throw new ProductLinkError("Could not validate that product link.", "fetch_failed");
  }
}

export async function filterSafeExternalImageUrls(imageUrls: string[], context: { domain: string }) {
  const safeUrls: string[] = [];
  for (const imageUrl of imageUrls) {
    try {
      safeUrls.push((await validateSafeUrlForFetch(imageUrl)).toString());
    } catch (error) {
      logger.warn("[AURA_LINK_SECURITY] rejected unsafe product image URL", {
        domain: context.domain,
        imageUrl: redactUrlForLogs(imageUrl),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return Array.from(new Set(safeUrls));
}

function browserProductHeaders(url: URL, expectedKind: "html" | "json" = "html"): HeadersInit {
  return {
    "user-agent": USER_AGENT,
    accept:
      expectedKind === "json"
        ? "application/json,text/plain,*/*"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    pragma: "no-cache",
    referer: `${url.origin}/`,
    "upgrade-insecure-requests": "1",
  };
}

function isBlockedHttpStatus(status: number) {
  return status === 401 || status === 403 || status === 429;
}

async function tryHmProductContentFallback(
  url: URL,
  originalStatus: number | null,
  originalError: unknown,
): Promise<FetchedProductPage | null> {
  const fallbackUrls = hmContentFallbackUrls(url);
  for (const fallbackUrl of fallbackUrls) {
    const fallbackParsed = new URL(fallbackUrl);
    try {
      debugProductLinkInfo("[AURA_LINK_DEBUG] trying H&M content fallback", {
        host: url.hostname,
        fallbackPath: fallbackParsed.pathname,
        originalStatus,
        originalError: originalError instanceof Error ? originalError.message : null,
      });
      const response = await safeFetch(fallbackParsed, {
        expectedKind: "json",
        maxBytes: MAX_HTML_BYTES,
        maxRedirects: 3,
        headers: browserProductHeaders(url, "json"),
      });
      debugProductLinkInfo("[AURA_LINK_DEBUG] H&M content fallback status", {
        host: url.hostname,
        fallbackPath: fallbackParsed.pathname,
        status: response.status,
      });
      if (
        response.ok &&
        /<html|og:image|twitter:image|productArticleDetails|image\.hm\.com|productName/i.test(response.text)
      ) {
        logger.info("[AURA_LINK_EXTRACT] fetched H&M content fallback", {
          host: url.hostname,
          fallbackPath: fallbackParsed.pathname,
          status: response.status,
          textLength: response.text.length,
          finalUrl: redactUrlForLogs(response.finalUrl),
        });
        return {
          html: response.text.slice(0, MAX_HTML_CHARS),
          finalUrl: url,
        };
      }
    } catch (error) {
      debugProductLinkInfo("[AURA_LINK_DEBUG] H&M content fallback failed", {
        host: url.hostname,
        fallbackPath: fallbackParsed.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return null;
}

function blockedStoreError(status: number | null, host: string) {
  return new ProductLinkError(BLOCKED_STORE_MESSAGE, "blocked_store", {
    productLinkCode: "blocked_store",
    blockedStore: true,
    recoverable: true,
    status,
    host,
    title: "This store blocked automatic reading.",
    message: BLOCKED_STORE_SUBTEXT,
    actions: ["try_again", "add_from_screenshot", "open_link_manually"],
  });
}

export async function fetchResolvedProductPage(url: URL): Promise<FetchedProductPage> {
  let originalStatus: number | null = null;
  let originalError: unknown = null;
  try {
    const response = await safeFetch(url, {
      expectedKind: "html",
      maxBytes: MAX_HTML_BYTES,
      maxRedirects: 3,
      headers: browserProductHeaders(url, "html"),
    });
    originalStatus = response.status;
    debugProductLinkInfo("[AURA_LINK_DEBUG] product fetch status", {
      host: url.hostname,
      path: url.pathname,
      status: response.status,
      finalHost: response.finalUrl.hostname,
    });
    if (!response.ok) {
      const fallback = await tryHmProductContentFallback(url, response.status, null);
      if (fallback) return fallback;
      if (isBlockedHttpStatus(response.status)) {
        debugProductLinkInfo("[AURA_LINK_DEBUG] blocked-store fallback used", {
          host: url.hostname,
          path: url.pathname,
          status: response.status,
        });
        throw blockedStoreError(response.status, url.hostname);
      }
      throw new ProductLinkError("That product page could not be read. Paste another link or add from screenshot/photo.", "fetch_failed");
    }
    return {
      html: response.text.slice(0, MAX_HTML_CHARS),
      finalUrl: response.finalUrl,
    };
  } catch (error) {
    if (error instanceof ProductLinkError) throw error;
    originalError = error;
    const fallback = await tryHmProductContentFallback(url, originalStatus, originalError);
    if (fallback) return fallback;
    if (error instanceof SafeFetchError) {
      if (error.code === "unsafe_url") {
        throw new ProductLinkError("That link is not safe to fetch.", "unsafe_url");
      }
      if (error.code === "invalid_url") {
        throw new ProductLinkError("Invalid product link.", "invalid_url");
      }
      if (error.code === "unsupported_format") {
        throw new ProductLinkError("That link did not return a product page.", "fetch_failed");
      }
    }
    throw new ProductLinkError("Could not fetch that product link. Paste another link or add from screenshot/photo.", "fetch_failed");
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
    imageExtractionSource: extraction.imageExtractionSource,
    imageCandidateCount: extraction.imageCandidateCount,
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
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  logger.info("[AURA_LINK_EXTRACT] page fetch success", {
    domain: url.hostname,
    htmlLength: html.length,
  });

  if (isAmazonProductUrl(finalUrl)) {
    const amazonExtraction = extractAmazonLinkData(finalUrl, html);
    const imageUrls = await filterSafeExternalImageUrls(amazonExtraction.imageUrls, {
      domain: finalUrl.hostname,
    });
    if (!amazonExtraction.metadata.title && !imageUrls.length) {
      throw new ProductLinkError("No usable Amazon product metadata found.", "no_metadata");
    }
    return {
      ...amazonExtraction,
      imageUrls,
      partialData: amazonExtraction.partialData
        ? {
            ...amazonExtraction.partialData,
            imageUrls: amazonExtraction.partialData.imageUrls
              ? await filterSafeExternalImageUrls(amazonExtraction.partialData.imageUrls, {
                  domain: finalUrl.hostname,
                })
              : undefined,
          }
        : undefined,
    };
  }

  const metadata = extractProductMetadataFromHtml(finalUrl.toString(), html);
  const imageExtraction = extractProductImagesWithSource(finalUrl.toString(), html);
  const rawExtraction = applyAdapter(finalUrl, html, {
    metadata,
    imageUrls: imageExtraction.urls,
    imageExtractionSource: imageExtraction.source,
    imageCandidateCount: imageExtraction.candidateCount,
  });
  const extraction = {
    ...rawExtraction,
    imageUrls: await filterSafeExternalImageUrls(rawExtraction.imageUrls, {
      domain: metadata.domain,
    }),
  };

  logger.info("[AURA_LINK_EXTRACT] extraction complete", {
    domain: metadata.domain,
    hasTitle: !!metadata.title,
    hasBrand: !!metadata.brand,
    hasPrice: typeof metadata.priceAmount === "number",
    imageExtractionSource: extraction.imageExtractionSource,
    imageCandidateCount: extraction.imageCandidateCount,
    imageCount: extraction.imageUrls.length,
  });
  debugProductLinkInfo("[AURA_LINK_DEBUG] final product image selected", {
    host: metadata.domain,
    extractionSource: extraction.imageExtractionSource ?? null,
    candidateCount: extraction.imageCandidateCount ?? extraction.imageUrls.length,
    finalImageHost: extraction.imageUrls[0] ? safeHost(extraction.imageUrls[0]) : null,
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

function priceFieldsFromMetadata(metadata: ProductMetadata): Record<string, unknown> | null {
  const amount =
    typeof metadata.salePrice === "number" && Number.isFinite(metadata.salePrice)
      ? metadata.salePrice
      : typeof metadata.priceAmount === "number" && Number.isFinite(metadata.priceAmount)
      ? metadata.priceAmount
      : parsePriceAmount(metadata.price);
  if (amount == null) return null;
  const currency =
    normalizeCurrencyCode(metadata.priceCurrency) ??
    normalizeCurrencyCode(metadata.currency) ??
    currencyFromPriceText(metadata.priceDisplay ?? metadata.price ?? "");
  const priceDisplay =
    cleanText(metadata.priceDisplay ?? metadata.price, 120) ??
    (currency ? `${currency} ${amount}` : String(amount));
  return {
    retailPrice: amount,
    purchasePrice: amount,
    estimatedValue: amount,
    ...(currency ? { currency, originalCurrency: currency, priceCurrency: currency } : {}),
    originalPrice: metadata.originalPrice ?? amount,
    salePrice: metadata.salePrice ?? null,
    priceSource: "product_link",
    priceDisplay,
    priceAmount: amount,
    price: amount,
    productUrl: metadata.sourceUrl,
  };
}

function hasExistingManualPrice(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.priceSource === "manual") return true;
  if (Array.isArray(data.userEditedFields) && data.userEditedFields.includes("price")) return true;
  return [
    data.purchasePrice,
    data.retailPrice,
    data.estimatedValue,
    data.priceAmount,
    data.price,
  ].some((value) => value != null && data.priceSource !== "product_link");
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
    const priceFields = priceFieldsFromMetadata(extraction.metadata);
    let shouldWritePriceFields = !!priceFields && !itemId;
    if (priceFields && itemId) {
      const existingSnap = await getFirestore()
        .collection("users")
        .doc(uid)
        .collection("items")
        .doc(itemId)
        .get();
      const existingData = existingSnap.exists ? existingSnap.data() : undefined;
      shouldWritePriceFields = !hasExistingManualPrice(existingData);
    }
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
        productUrl: extraction.metadata.sourceUrl,
        retailer: extraction.metadata.retailer,
        domain: extraction.metadata.domain,
        auraPrompt: prompt,
        linkMetadata: extraction.metadata,
        ...(extraction.metadata.title ? { name: extraction.metadata.title } : {}),
        ...(extraction.metadata.brand ? { brand: extraction.metadata.brand } : {}),
        ...(extraction.metadata.color ? { colorLabel: extraction.metadata.color, displayColor: extraction.metadata.displayColor ?? extraction.metadata.color } : {}),
        ...(extraction.metadata.displayColors?.length ? { displayColors: extraction.metadata.displayColors, colors: extraction.metadata.displayColors } : {}),
        ...(extraction.metadata.material ? { material: extraction.metadata.material } : {}),
        ...(extraction.metadata.materials?.length ? { materials: extraction.metadata.materials } : {}),
        ...(extraction.metadata.fit ? { fit: extraction.metadata.fit } : {}),
        ...(extraction.metadata.pattern ? { pattern: extraction.metadata.pattern } : {}),
        ...(extraction.metadata.sleeveLength ? { sleeveLength: extraction.metadata.sleeveLength } : {}),
        ...(extraction.metadata.collar ? { collar: extraction.metadata.collar } : {}),
        ...(extraction.metadata.length ? { length: extraction.metadata.length } : {}),
        ...(extraction.metadata.sizeOptions?.length ? { sizeOptions: extraction.metadata.sizeOptions, availableSizes: extraction.metadata.availableSizes ?? extraction.metadata.sizeOptions } : {}),
        ...(extraction.metadata.careInstructions?.length ? { careInstructions: extraction.metadata.careInstructions } : {}),
        ...(extraction.metadata.productDescription ? { productDescription: extraction.metadata.productDescription } : {}),
        ...(extraction.metadata.graphicText ? { graphicText: extraction.metadata.graphicText, motif: extraction.metadata.motif ?? extraction.metadata.graphicText } : {}),
        ...(extraction.metadata.collaborationName ? { collaborationName: extraction.metadata.collaborationName } : {}),
        ...(shouldWritePriceFields ? priceFields : {}),
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
      uidHash: redactUid(uid),
      itemId: createdItemId,
      domain: extraction.metadata.domain,
      imageCount: images.length,
      triggerCompatible: true,
      sourceType: "aura_product_link",
      hasPhotosUrls: extraction.imageUrls.length > 0,
      hasPhotoUrl: !!primaryUrl,
    });
    logger.info("[LINK_IMAGE_SAVE] product link draft image fields", {
      uidHash: redactUid(uid),
      itemId: createdItemId,
      sourceUrl: redactUrlForLogs(extraction.metadata.sourceUrl),
      primaryUrl: redactUrlForLogs(primaryUrl),
      imageUrls: extraction.imageUrls.map((imageUrl) => redactUrlForLogs(imageUrl)),
      savedFields: {
        originalImageUrl: redactUrlForLogs(primaryUrl),
        photoUrl: redactUrlForLogs(primaryUrl),
        photosPrimaryUrl: redactUrlForLogs(primaryUrl),
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
      uidHash: redactUid(uid),
      domain: extraction.metadata.domain,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ProductLinkError("Could not create wardrobe draft.", "draft_failed");
  }
}
