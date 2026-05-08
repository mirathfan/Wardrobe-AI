import { createHash } from "node:crypto";

import { isDirectMerchantUrl } from "../affiliate/affiliateLinks";
import type { ProductCategory, ProductOption } from "./types";

export type RawSerpProduct = {
  title?: unknown;
  source?: unknown;
  name?: unknown;
  merchant?: unknown;
  extracted_price?: unknown;
  price?: unknown;
  currency?: unknown;
  thumbnail?: unknown;
  serpapi_thumbnail?: unknown;
  rating?: unknown;
  reviews?: unknown;
  link?: unknown;
  product_link?: unknown;
  serpapi_product_api?: unknown;
  serpapi_immersive_product_api?: unknown;
  immersive_product_page_token?: unknown;
  position?: unknown;
};

const KNOWN_BRANDS = [
  "Nike",
  "Adidas",
  "New Balance",
  "Converse",
  "Vans",
  "Levi's",
  "Uniqlo",
  "Zara",
  "H&M",
  "Gap",
  "Banana Republic",
  "J.Crew",
  "COS",
  "Mango",
  "Nordstrom",
  "Everlane",
  "Abercrombie",
  "ASOS",
  "SSENSE",
  "Farfetch",
];

function stripControlCharacters(value: string) {
  return value
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
}

function clean(value: unknown, max = 180) {
  return stripControlCharacters(String(value ?? ""))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = clean(value, 80);
  if (!raw) return null;
  const match = raw.match(/\d+(?:[,.]\d{3})*(?:[.,]\d{1,2})?|\d+/);
  if (!match) return null;
  const normalized = match[0].replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : null;
}

function integer(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const parsed = Number(clean(value, 40).replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function inferCurrency(rawPrice: unknown, rawCurrency: unknown) {
  const explicit = clean(rawCurrency, 8).toUpperCase();
  if (/^[A-Z]{3}$/.test(explicit)) return explicit;
  const text = clean(rawPrice, 80);
  if (text.includes("$")) return "USD";
  if (text.includes("£")) return "GBP";
  if (text.includes("€")) return "EUR";
  return "USD";
}

function inferTier(price: number | undefined, category?: ProductCategory): ProductOption["tier"] {
  if (typeof price !== "number") return "mid";
  if (category === "accessories") {
    if (price < 50) return "budget";
    if (price <= 160) return "mid";
    return "premium";
  }
  if (category === "footwear") {
    if (price < 80) return "budget";
    if (price <= 180) return "mid";
    return "premium";
  }
  if (price < 75) return "budget";
  if (price <= 200) return "mid";
  return "premium";
}

function directUrlFromRaw(raw: RawSerpProduct) {
  const candidates = [raw.link, raw.product_link].map((value) => clean(value, 1000));
  return candidates.find((url) => isDirectMerchantUrl(url)) ?? "";
}

function imageUrlFromRaw(raw: RawSerpProduct) {
  const thumbnail = clean(raw.thumbnail, 1000);
  if (/^https?:\/\//i.test(thumbnail)) return thumbnail;
  const serpapiThumbnail = clean(raw.serpapi_thumbnail, 1000);
  return /^https?:\/\//i.test(serpapiThumbnail) ? serpapiThumbnail : undefined;
}

function inferBrand(title: string, merchant: string) {
  const lowerTitle = title.toLowerCase();
  const matched = KNOWN_BRANDS.find((brand) => lowerTitle.includes(brand.toLowerCase()));
  if (matched) return matched;
  return merchant || "Retailer";
}

function productId(productUrl: string, title: string, merchant: string) {
  return `live-${createHash("sha256")
    .update(`${productUrl}|${title}|${merchant}`)
    .digest("hex")
    .slice(0, 18)}`;
}

export function normalizeSerpApiProduct(
  raw: RawSerpProduct,
  category?: ProductCategory,
): ProductOption | null {
  const title = clean(raw.title, 220);
  const merchant = clean(raw.source ?? raw.merchant ?? raw.name, 120);
  const productUrl = directUrlFromRaw(raw);
  const affiliateEligible = isDirectMerchantUrl(productUrl);

  if (!title || !merchant) return null;
  if (!productUrl) return null;

  const price = numeric(raw.extracted_price) ?? numeric(raw.price) ?? undefined;
  const currency = price ? inferCurrency(raw.price, raw.currency) : undefined;
  const rating = numeric(raw.rating) ?? undefined;
  const reviews = integer(raw.reviews);
  const imageUrl = imageUrlFromRaw(raw);
  const tier = inferTier(price, category);

  return {
    id: productId(productUrl, title, merchant),
    title,
    brand: inferBrand(title, merchant),
    merchant,
    price,
    currency,
    imageUrl,
    productUrl,
    tier,
    source: "live",
    affiliateEligible,
    rating,
    reviews,
    lastUpdatedAt: new Date().toISOString(),
  };
}
