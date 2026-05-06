import { getFunctions, httpsCallable } from "firebase/functions";

import { app } from "@/src/lib/firebase";
import {
  trackSuggestionEvent,
  type SuggestionSourceScreen,
} from "@/src/lib/suggestionAnalytics";
import type { WardrobeSuggestion } from "@/src/lib/wardrobeSuggestions";

export type ProductOption = {
  id: string;
  title: string;
  brand: string;
  merchant: string;
  price?: number;
  currency?: string;
  imageUrl?: string;
  productUrl: string;
  affiliateUrl?: string;
  tier: "budget" | "mid" | "premium";
  source: "live" | "curated";
  affiliateEligible: boolean;
  rating?: number;
  reviews?: number;
  confidenceScore?: number;
  lastUpdatedAt?: string;
};

export type ProductRecommendationInput = Pick<
  WardrobeSuggestion,
  "itemType" | "category" | "styleTags" | "preferredColors" | "priceTiers"
>;

type CuratedProductOption = Omit<ProductOption, "source" | "affiliateEligible"> & {
  category: WardrobeSuggestion["category"];
  keywords: string[];
  colors?: string[];
  styleTags?: string[];
};

type AffiliateLinksResponse = {
  ok: boolean;
  links: {
    productUrl: string;
    affiliateUrl: string;
  }[];
};

type SearchLiveProductsResponse = {
  ok: boolean;
  products: ProductOption[];
  provider: "serpapi";
  cacheHit?: boolean;
  disabled?: boolean;
};

type ProductRecommendationOptions = {
  userId?: string | null;
  sourceScreen: SuggestionSourceScreen;
  maxResults?: number;
  timeoutMs?: number;
};

const TIER_ORDER: ProductOption["tier"][] = ["budget", "mid", "premium"];

function envFlagEnabled(value: unknown) {
  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function frontendAffiliateShoppingEnabled() {
  return envFlagEnabled(process.env.EXPO_PUBLIC_AFFILIATE_SHOPPING_ENABLED);
}

function frontendLiveSearchEnabled() {
  return envFlagEnabled(process.env.EXPO_PUBLIC_LIVE_PRODUCT_SEARCH_ENABLED);
}

const CURATED_PRODUCTS: CuratedProductOption[] = [
  {
    id: "budget-white-sneakers-hm",
    title: "White sneaker options",
    brand: "H&M",
    merchant: "H&M",
    productUrl: "https://www2.hm.com/en_us/search-results.html?q=white%20sneakers",
    tier: "budget",
    category: "footwear",
    keywords: ["white sneakers", "sneakers", "clean everyday sneakers"],
    colors: ["white", "cream"],
    styleTags: ["everyday", "casual", "minimal"],
  },
  {
    id: "mid-white-sneakers-adidas",
    title: "Clean white sneaker edit",
    brand: "Adidas",
    merchant: "Adidas",
    productUrl: "https://www.adidas.com/us/search?q=white%20sneakers",
    tier: "mid",
    category: "footwear",
    keywords: ["white sneakers", "sneakers", "clean everyday sneakers"],
    colors: ["white"],
    styleTags: ["everyday", "sport", "streetwear"],
  },
  {
    id: "premium-white-sneakers-nordstrom",
    title: "Premium white sneaker edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=white%20sneakers",
    tier: "premium",
    category: "footwear",
    keywords: ["white sneakers", "sneakers", "minimal sneakers"],
    colors: ["white"],
    styleTags: ["premium", "minimal", "smart casual"],
  },
  {
    id: "budget-black-loafers-zara",
    title: "Black loafer options",
    brand: "Zara",
    merchant: "Zara",
    productUrl: "https://www.zara.com/us/en/search?searchTerm=black%20loafers",
    tier: "budget",
    category: "footwear",
    keywords: ["black loafers", "loafers", "dress shoes"],
    colors: ["black"],
    styleTags: ["smart casual", "office", "tailored"],
  },
  {
    id: "mid-black-loafers-nordstrom",
    title: "Smart black loafers",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=black%20loafers",
    tier: "mid",
    category: "footwear",
    keywords: ["black loafers", "loafers", "dress shoes"],
    colors: ["black"],
    styleTags: ["smart casual", "office", "classic"],
  },
  {
    id: "premium-black-loafers-mrporter",
    title: "Premium loafer edit",
    brand: "MR PORTER",
    merchant: "MR PORTER",
    productUrl: "https://www.mrporter.com/en-us/mens/search/black%20loafers",
    tier: "premium",
    category: "footwear",
    keywords: ["black loafers", "loafers", "dress shoes"],
    colors: ["black"],
    styleTags: ["premium", "tailored", "classic"],
  },
  {
    id: "budget-oxford-gap",
    title: "Oxford shirt options",
    brand: "Gap",
    merchant: "Gap",
    productUrl: "https://www.gap.com/browse/search.do?searchText=oxford%20shirt",
    tier: "budget",
    category: "tops",
    keywords: ["oxford shirt", "button down", "shirt"],
    colors: ["white", "blue", "light blue"],
    styleTags: ["smart casual", "classic", "office"],
  },
  {
    id: "mid-oxford-jcrew",
    title: "Classic oxford shirts",
    brand: "J.Crew",
    merchant: "J.Crew",
    productUrl: "https://www.jcrew.com/search?Ntrm=oxford%20shirt",
    tier: "mid",
    category: "tops",
    keywords: ["oxford shirt", "button down", "shirt"],
    colors: ["white", "blue"],
    styleTags: ["smart casual", "classic", "preppy"],
  },
  {
    id: "premium-oxford-nordstrom",
    title: "Premium oxford shirt edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=oxford%20shirt",
    tier: "premium",
    category: "tops",
    keywords: ["oxford shirt", "button down", "shirt"],
    colors: ["white", "blue"],
    styleTags: ["premium", "classic", "office"],
  },
  {
    id: "budget-heavyweight-tee-uniqlo",
    title: "Clean heavyweight tees",
    brand: "UNIQLO",
    merchant: "UNIQLO",
    productUrl: "https://www.uniqlo.com/us/en/search?q=heavyweight%20t-shirt",
    tier: "budget",
    category: "tops",
    keywords: ["clean heavyweight tee", "tee", "t shirt", "t-shirt"],
    colors: ["white", "black", "cream"],
    styleTags: ["everyday", "minimal", "streetwear"],
  },
  {
    id: "mid-heavyweight-tee-everlane",
    title: "Everyday tee edit",
    brand: "Everlane",
    merchant: "Everlane",
    productUrl: "https://www.everlane.com/search?q=tee",
    tier: "mid",
    category: "tops",
    keywords: ["clean heavyweight tee", "tee", "t shirt", "t-shirt"],
    colors: ["white", "black", "cream"],
    styleTags: ["everyday", "minimal"],
  },
  {
    id: "premium-heavyweight-tee-nordstrom",
    title: "Premium tee edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=heavyweight%20t-shirt",
    tier: "premium",
    category: "tops",
    keywords: ["clean heavyweight tee", "tee", "t shirt", "t-shirt"],
    colors: ["white", "black", "cream"],
    styleTags: ["premium", "everyday"],
  },
  {
    id: "budget-neutral-trousers-uniqlo",
    title: "Neutral trouser options",
    brand: "UNIQLO",
    merchant: "UNIQLO",
    productUrl: "https://www.uniqlo.com/us/en/search?q=trousers",
    tier: "budget",
    category: "bottoms",
    keywords: ["neutral trousers", "trousers", "pants", "chinos"],
    colors: ["black", "navy", "charcoal", "beige"],
    styleTags: ["smart casual", "office", "versatile"],
  },
  {
    id: "mid-neutral-trousers-everlane",
    title: "Everyday trouser edit",
    brand: "Everlane",
    merchant: "Everlane",
    productUrl: "https://www.everlane.com/search?q=trousers",
    tier: "mid",
    category: "bottoms",
    keywords: ["neutral trousers", "trousers", "pants"],
    colors: ["black", "navy", "khaki"],
    styleTags: ["minimal", "smart casual", "work"],
  },
  {
    id: "premium-neutral-trousers-nordstrom",
    title: "Premium trouser edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=neutral%20trousers",
    tier: "premium",
    category: "bottoms",
    keywords: ["neutral trousers", "trousers", "pants"],
    colors: ["black", "navy", "charcoal"],
    styleTags: ["premium", "tailored", "office"],
  },
  {
    id: "budget-dark-denim-gap",
    title: "Straight-leg dark denim",
    brand: "Gap",
    merchant: "Gap",
    productUrl: "https://www.gap.com/browse/search.do?searchText=straight%20dark%20jeans",
    tier: "budget",
    category: "bottoms",
    keywords: ["straight-leg dark denim", "dark denim", "jeans"],
    colors: ["dark blue", "black", "indigo"],
    styleTags: ["casual", "streetwear", "everyday"],
  },
  {
    id: "mid-dark-denim-levis",
    title: "Straight-leg jean edit",
    brand: "Levi's",
    merchant: "Levi's",
    productUrl: "https://www.levi.com/US/en_US/search/straight%20dark%20jeans",
    tier: "mid",
    category: "bottoms",
    keywords: ["straight-leg dark denim", "dark denim", "jeans"],
    colors: ["dark blue", "black", "indigo"],
    styleTags: ["classic", "casual", "streetwear"],
  },
  {
    id: "premium-dark-denim-nordstrom",
    title: "Premium dark denim edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=straight%20dark%20jeans",
    tier: "premium",
    category: "bottoms",
    keywords: ["straight-leg dark denim", "dark denim", "jeans"],
    colors: ["dark blue", "black"],
    styleTags: ["premium", "casual"],
  },
  {
    id: "budget-black-bomber-zara",
    title: "Black bomber jacket options",
    brand: "Zara",
    merchant: "Zara",
    productUrl: "https://www.zara.com/us/en/search?searchTerm=black%20bomber%20jacket",
    tier: "budget",
    category: "outerwear",
    keywords: ["black bomber jacket", "bomber", "jacket"],
    colors: ["black"],
    styleTags: ["streetwear", "casual", "layering"],
  },
  {
    id: "mid-black-bomber-nordstrom",
    title: "Black bomber edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=black%20bomber%20jacket",
    tier: "mid",
    category: "outerwear",
    keywords: ["black bomber jacket", "bomber", "jacket"],
    colors: ["black"],
    styleTags: ["streetwear", "casual", "layering"],
  },
  {
    id: "premium-black-bomber-mrporter",
    title: "Premium bomber edit",
    brand: "MR PORTER",
    merchant: "MR PORTER",
    productUrl: "https://www.mrporter.com/en-us/mens/search/black%20bomber%20jacket",
    tier: "premium",
    category: "outerwear",
    keywords: ["black bomber jacket", "bomber", "jacket"],
    colors: ["black"],
    styleTags: ["premium", "streetwear", "layering"],
  },
  {
    id: "budget-versatile-blazer-mango",
    title: "Versatile blazer options",
    brand: "Mango",
    merchant: "Mango",
    productUrl: "https://shop.mango.com/us/search?kw=blazer",
    tier: "budget",
    category: "outerwear",
    keywords: ["versatile blazer", "blazer", "jacket"],
    colors: ["black", "navy", "grey"],
    styleTags: ["tailored", "office", "smart casual"],
  },
  {
    id: "mid-versatile-blazer-jcrew",
    title: "Smart blazer edit",
    brand: "J.Crew",
    merchant: "J.Crew",
    productUrl: "https://www.jcrew.com/search?Ntrm=blazer",
    tier: "mid",
    category: "outerwear",
    keywords: ["versatile blazer", "blazer", "sport coat"],
    colors: ["black", "navy", "grey"],
    styleTags: ["tailored", "office", "classic"],
  },
  {
    id: "premium-versatile-blazer-nordstrom",
    title: "Premium blazer edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=versatile%20blazer",
    tier: "premium",
    category: "outerwear",
    keywords: ["versatile blazer", "blazer", "sport coat"],
    colors: ["black", "navy", "grey"],
    styleTags: ["premium", "tailored", "office"],
  },
  {
    id: "budget-belt-target",
    title: "Everyday belt options",
    brand: "Target",
    merchant: "Target",
    productUrl: "https://www.target.com/s?searchTerm=everyday%20belt",
    tier: "budget",
    category: "accessories",
    keywords: ["everyday belt", "belt", "minimal leather belt"],
    colors: ["black", "brown"],
    styleTags: ["everyday", "polished", "finishing piece"],
  },
  {
    id: "mid-belt-nordstrom",
    title: "Minimal leather belt edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=minimal%20leather%20belt",
    tier: "mid",
    category: "accessories",
    keywords: ["everyday belt", "belt", "minimal leather belt"],
    colors: ["black", "brown"],
    styleTags: ["smart casual", "polished", "classic"],
  },
  {
    id: "premium-belt-mrporter",
    title: "Premium belt edit",
    brand: "MR PORTER",
    merchant: "MR PORTER",
    productUrl: "https://www.mrporter.com/en-us/mens/search/leather%20belt",
    tier: "premium",
    category: "accessories",
    keywords: ["everyday belt", "belt", "minimal leather belt"],
    colors: ["black", "brown"],
    styleTags: ["premium", "polished", "classic"],
  },
  {
    id: "budget-structured-bag-zara",
    title: "Structured everyday bag",
    brand: "Zara",
    merchant: "Zara",
    productUrl: "https://www.zara.com/us/en/search?searchTerm=structured%20bag",
    tier: "budget",
    category: "accessories",
    keywords: ["structured everyday bag", "bag", "tote"],
    colors: ["black", "brown", "cream"],
    styleTags: ["polished", "everyday", "finishing piece"],
  },
  {
    id: "mid-structured-bag-nordstrom",
    title: "Structured bag edit",
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: "https://www.nordstrom.com/sr?origin=keywordsearch&keyword=structured%20bag",
    tier: "mid",
    category: "accessories",
    keywords: ["structured everyday bag", "bag", "tote"],
    colors: ["black", "brown", "cream"],
    styleTags: ["polished", "everyday"],
  },
  {
    id: "premium-structured-bag-netaporter",
    title: "Premium structured bag edit",
    brand: "NET-A-PORTER",
    merchant: "NET-A-PORTER",
    productUrl: "https://www.net-a-porter.com/en-us/shop/search/structured%20bag",
    tier: "premium",
    category: "accessories",
    keywords: ["structured everyday bag", "bag", "tote"],
    colors: ["black", "brown", "cream"],
    styleTags: ["premium", "polished"],
  },
];

function clean(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function scoreProduct(product: CuratedProductOption, input: ProductRecommendationInput) {
  const itemType = clean(input.itemType);
  const styleText = (input.styleTags ?? []).map(clean).join(" ");
  const colorText = (input.preferredColors ?? []).map(clean).join(" ");
  let score = product.category === input.category ? 16 : -20;

  product.keywords.forEach((keyword) => {
    const cleanKeyword = clean(keyword);
    if (itemType.includes(cleanKeyword) || cleanKeyword.includes(itemType)) score += 18;
    cleanKeyword.split(" ").forEach((token) => {
      if (token.length > 3 && itemType.includes(token)) score += 3;
    });
  });
  product.colors?.forEach((color) => {
    if (colorText.includes(clean(color))) score += 4;
  });
  product.styleTags?.forEach((tag) => {
    if (styleText.includes(clean(tag))) score += 3;
  });
  if (input.priceTiers.includes(product.tier)) score += 5;

  return score;
}

function productPublicFields(product: CuratedProductOption): ProductOption {
  const { category: _category, keywords: _keywords, colors: _colors, styleTags: _styleTags, ...publicFields } = product;
  return {
    ...publicFields,
    source: "curated",
    affiliateEligible: true,
  };
}

function fallbackSearchOption(input: ProductRecommendationInput): ProductOption {
  const query = encodeURIComponent(input.itemType);
  return {
    id: `fallback-${clean(input.itemType).replace(/[^a-z0-9]+/g, "-") || "wardrobe-piece"}`,
    title: `${input.itemType} options`,
    brand: "Nordstrom",
    merchant: "Nordstrom",
    productUrl: `https://www.nordstrom.com/sr?origin=keywordsearch&keyword=${query}`,
    tier: input.priceTiers[0] ?? "mid",
    source: "curated",
    affiliateEligible: true,
  };
}

export function getRecommendedProducts(
  input: ProductRecommendationInput,
  maxProducts = 3,
): ProductOption[] {
  const scored = CURATED_PRODUCTS.map((product) => ({
    product,
    score: scoreProduct(product, input),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (scoreDelta !== 0) return scoreDelta;
      return TIER_ORDER.indexOf(a.product.tier) - TIER_ORDER.indexOf(b.product.tier);
    });

  const selected: CuratedProductOption[] = [];
  const requestedTiers = input.priceTiers.length ? input.priceTiers : TIER_ORDER;
  requestedTiers.forEach((tier) => {
    if (selected.length >= maxProducts) return;
    const match = scored.find((entry) => entry.product.tier === tier && !selected.includes(entry.product));
    if (match) selected.push(match.product);
  });
  scored.forEach((entry) => {
    if (selected.length >= maxProducts || selected.includes(entry.product)) return;
    selected.push(entry.product);
  });

  const products = selected.slice(0, maxProducts).map(productPublicFields);
  return products.length ? products : [fallbackSearchOption(input)];
}

export async function fetchAffiliateProductOptions(products: ProductOption[]) {
  if (!products.length) return products;
  if (!frontendAffiliateShoppingEnabled()) {
    return products.map((product) => ({
      ...product,
      affiliateEligible: false,
      affiliateUrl: product.productUrl,
    }));
  }
  const functions = getFunctions(app);
  const callable = httpsCallable<
    { productUrls: string[] },
    AffiliateLinksResponse
  >(functions, "wrapAffiliateLinks");

  try {
    const result = await callable({
      productUrls: products.map((product) => product.productUrl),
    });
    const affiliateByUrl = new Map(
      result.data.links.map((link) => [link.productUrl, link.affiliateUrl]),
    );
    return products.map((product) => ({
      ...product,
      affiliateEligible: Boolean(affiliateByUrl.get(product.productUrl)),
      affiliateUrl: affiliateByUrl.get(product.productUrl) ?? product.affiliateUrl ?? product.productUrl,
    }));
  } catch {
    return products.map((product) => ({
      ...product,
      affiliateEligible: false,
      affiliateUrl: product.affiliateUrl ?? product.productUrl,
    }));
  }
}

function errorCode(error: unknown) {
  const raw = error as { code?: unknown; message?: unknown };
  const code = typeof raw?.code === "string" ? raw.code : "";
  if (code) return code.replace(/^functions\//, "");
  const message = String(raw?.message ?? "");
  if (/timeout/i.test(message)) return "timeout";
  if (/resource-exhausted/i.test(message)) return "resource-exhausted";
  return "unknown";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("product_search_timeout")), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
}

function strongLiveProducts(products: ProductOption[]) {
  return products.filter((product) => {
    if (product.source !== "live") return false;
    if (!product.productUrl || !product.merchant || !product.title) return false;
    if (typeof product.confidenceScore === "number" && product.confidenceScore < 30) return false;
    return true;
  });
}

async function curatedFallback(input: ProductRecommendationInput, maxResults: number) {
  return fetchAffiliateProductOptions(getRecommendedProducts(input, maxResults));
}

export async function getProductRecommendationsForSuggestion(
  suggestion: WardrobeSuggestion,
  options: ProductRecommendationOptions,
) {
  const maxResults = Math.max(1, Math.min(6, options.maxResults ?? 3));
  if (!frontendLiveSearchEnabled()) {
    return curatedFallback(suggestion, maxResults);
  }

  await trackSuggestionEvent({
    userId: options.userId,
    eventName: "product_search_requested",
    suggestion,
    sourceScreen: options.sourceScreen,
  });

  const functions = getFunctions(app);
  const callable = httpsCallable<
    ProductRecommendationInput & {
      sourceScreen: SuggestionSourceScreen;
      maxResults: number;
    },
    SearchLiveProductsResponse
  >(functions, "searchLiveProducts");

  try {
    const result = await withTimeout(
      callable({
        itemType: suggestion.itemType,
        category: suggestion.category,
        styleTags: suggestion.styleTags,
        preferredColors: suggestion.preferredColors,
        priceTiers: suggestion.priceTiers,
        sourceScreen: options.sourceScreen,
        maxResults,
      }),
      options.timeoutMs ?? 6500,
    );
    const data = result.data;
    const liveProducts = strongLiveProducts(data.products ?? []).slice(0, maxResults);

    await trackSuggestionEvent({
      userId: options.userId,
      eventName: data.cacheHit ? "product_search_cache_hit" : "product_search_cache_miss",
      suggestion,
      sourceScreen: options.sourceScreen,
      provider: data.provider,
      resultCount: data.products?.length ?? 0,
      cacheHit: !!data.cacheHit,
    });

    if (liveProducts.length) {
      await trackSuggestionEvent({
        userId: options.userId,
        eventName: "product_search_succeeded",
        suggestion,
        sourceScreen: options.sourceScreen,
        provider: data.provider,
        resultCount: liveProducts.length,
        cacheHit: !!data.cacheHit,
      });
      return liveProducts;
    }

    await trackSuggestionEvent({
      userId: options.userId,
      eventName: "product_search_failed",
      suggestion,
      sourceScreen: options.sourceScreen,
      provider: data.provider,
      errorCode: data.disabled ? "disabled" : "empty",
      cacheHit: !!data.cacheHit,
    });
    return curatedFallback(suggestion, maxResults);
  } catch (error) {
    await trackSuggestionEvent({
      userId: options.userId,
      eventName: "product_search_failed",
      suggestion,
      sourceScreen: options.sourceScreen,
      errorCode: errorCode(error),
    });
    return curatedFallback(suggestion, maxResults);
  }
}
