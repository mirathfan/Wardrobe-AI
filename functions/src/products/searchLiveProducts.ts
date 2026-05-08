import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { buildAffiliateUrl } from "../affiliate/affiliateLinks";
import {
  buildProductSearchCacheKey,
  getCachedProductSearch,
  setCachedProductSearch,
} from "./productCache";
import { rankAndFilterProducts } from "./productRanking";
import { searchSerpApiProducts } from "./serpApiProvider";
import type {
  NormalizedSearchRequest,
  ProductCategory,
  ProductSourceScreen,
  ProductTier,
  SearchLiveProductsRequest,
  SearchLiveProductsResponse,
} from "./types";

const PRODUCT_CATEGORIES: ProductCategory[] = [
  "tops",
  "bottoms",
  "footwear",
  "outerwear",
  "accessories",
];
const PRODUCT_TIERS: ProductTier[] = ["budget", "mid", "premium"];
const SOURCE_SCREENS: ProductSourceScreen[] = ["home", "insights", "aura_chat", "outfit_card"];
const GENDER_PRESENTATIONS: NormalizedSearchRequest["genderPresentation"][] = [
  "mens",
  "womens",
  "unisex",
];

function envString(key: string, fallback: string) {
  const value = String(process.env[key] ?? "").trim();
  return value || fallback;
}

function envNumber(key: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function productSearchEnabled() {
  return String(process.env.PRODUCT_SEARCH_ENABLED ?? "").trim().toLowerCase() === "true";
}

function stripControlCharacters(value: string) {
  return value
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
}

function sanitizeText(value: unknown, max = 80) {
  return stripControlCharacters(String(value ?? ""))
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^a-zA-Z0-9\s'&.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeList(values: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const next = sanitizeText(value, maxLength).toLowerCase();
    if (!next || seen.has(next)) return;
    seen.add(next);
    out.push(next);
  });
  return out.slice(0, maxItems);
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[]) {
  const text = String(value ?? "").trim().toLowerCase();
  return allowed.includes(text as T) ? (text as T) : undefined;
}

function categoryHint(category?: ProductCategory) {
  if (category === "footwear") return "shoes";
  if (category === "outerwear") return "jacket";
  if (category === "bottoms") return "pants";
  if (category === "tops") return "shirt";
  if (category === "accessories") return "accessory";
  return "";
}

function buildSearchQuery(request: {
  itemType: string;
  category?: ProductCategory;
  preferredColors: string[];
  styleTags: string[];
  genderPresentation: NormalizedSearchRequest["genderPresentation"];
}) {
  const itemLower = request.itemType.toLowerCase();
  const color = request.preferredColors.find((entry) => !itemLower.includes(entry.toLowerCase()));
  const styleTerms = request.styleTags
    .filter((tag) => !/shopping|outfit|closet|wardrobe|piece|base/i.test(tag))
    .slice(0, 2);
  const gender = request.genderPresentation === "unisex" ? "unisex" : request.genderPresentation;
  const category = categoryHint(request.category);
  const suffix = request.category === "accessories" ? "fashion" : "clothing fashion";
  return [color, request.itemType, ...styleTerms, gender, category, suffix]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function normalizeRequest(data: unknown): NormalizedSearchRequest {
  const raw = (data ?? {}) as Partial<SearchLiveProductsRequest>;
  const itemType = sanitizeText(raw.itemType, 80);
  if (!itemType) {
    throw new HttpsError("invalid-argument", "A wardrobe suggestion item type is required.");
  }

  const category = normalizeEnum(raw.category, PRODUCT_CATEGORIES);
  const priceTiers = normalizeList(raw.priceTiers, 3, 12)
    .map((tier) => normalizeEnum(tier, PRODUCT_TIERS))
    .filter((tier): tier is ProductTier => !!tier);
  const genderPresentation =
    normalizeEnum(raw.genderPresentation, GENDER_PRESENTATIONS) ?? "unisex";
  const preferredColors = normalizeList(raw.preferredColors, 3, 24);
  const styleTags = normalizeList(raw.styleTags, 3, 28);
  const maxResults = Math.max(
    1,
    Math.min(
      envNumber("MAX_LIVE_SEARCH_RESULTS", 3, 1, 6),
      typeof raw.maxResults === "number" && Number.isFinite(raw.maxResults)
        ? Math.round(raw.maxResults)
        : 3,
    ),
  );
  const normalized = {
    itemType,
    category,
    styleTags,
    preferredColors,
    priceTiers: priceTiers.length ? priceTiers : PRODUCT_TIERS,
    budgetPreference: normalizeEnum(raw.budgetPreference, PRODUCT_TIERS),
    genderPresentation,
    sourceScreen: normalizeEnum(raw.sourceScreen, SOURCE_SCREENS),
    maxResults,
    country: envString("PRODUCT_SEARCH_COUNTRY", "us").toLowerCase().slice(0, 2) || "us",
    language: envString("PRODUCT_SEARCH_LANGUAGE", "en").toLowerCase().slice(0, 5) || "en",
  };

  return {
    ...normalized,
    query: buildSearchQuery(normalized),
  };
}

function todayUsageDocId() {
  const now = new Date();
  return `productSearch_${now.getUTCFullYear()}_${String(now.getUTCMonth() + 1).padStart(2, "0")}_${String(now.getUTCDate()).padStart(2, "0")}`;
}

async function assertDailyRateLimit(uid: string) {
  const limit = envNumber("PRODUCT_SEARCH_DAILY_LIMIT", 20, 1, 1000);
  const ref = getFirestore()
    .collection("users")
    .doc(uid)
    .collection("usage")
    .doc(todayUsageDocId());

  await getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.data()?.count ?? 0);
    if (count >= limit) {
      throw new HttpsError("resource-exhausted", "Live product search limit reached for today.");
    }
    transaction.set(
      ref,
      {
        count: count + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });
}

function emptyResponse(cacheHit = false): SearchLiveProductsResponse {
  return {
    ok: true,
    products: [],
    provider: "serpapi",
    cacheHit,
  };
}

export const searchLiveProducts = onCall(
  async (request): Promise<SearchLiveProductsResponse> => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Please sign in first.");
    }

    const provider = envString("PRODUCT_SEARCH_PROVIDER", "serpapi").toLowerCase();
    const normalized = normalizeRequest(request.data);
    if (!productSearchEnabled() || provider !== "serpapi") {
      return {
        ...emptyResponse(false),
        disabled: true,
      };
    }

    const cacheKey = buildProductSearchCacheKey(normalized);
    const cached = await getCachedProductSearch(cacheKey);
    if (cached) {
      return {
        ok: true,
        products: cached.products.slice(0, normalized.maxResults),
        provider: "serpapi",
        cacheHit: true,
      };
    }

    await assertDailyRateLimit(uid);

    try {
      const rawProducts = await searchSerpApiProducts(normalized);
      const ranked = rankAndFilterProducts(rawProducts, normalized)
        .slice(0, normalized.maxResults)
        .map((product) => ({
          ...product,
          affiliateUrl: product.affiliateEligible
            ? buildAffiliateUrl(product.productUrl)
            : product.productUrl,
        }));

      await setCachedProductSearch({
        key: cacheKey,
        request: normalized,
        products: ranked,
        ttlHours: envNumber("PRODUCT_SEARCH_CACHE_TTL_HOURS", 24, 1, 168),
      });

      return {
        ok: true,
        products: ranked,
        provider: "serpapi",
        cacheHit: false,
      };
    } catch (error) {
      logger.warn("[PRODUCT_SEARCH] live provider failed", {
        itemTypeLength: normalized.itemType.length,
        category: normalized.category ?? null,
        sourceScreen: normalized.sourceScreen ?? null,
        code: error instanceof Error ? error.message : "unknown",
      });
      throw new HttpsError("unavailable", "Live product search is unavailable right now.");
    }
  },
);
