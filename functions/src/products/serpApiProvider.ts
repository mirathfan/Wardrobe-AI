import { logger } from "firebase-functions/v2";

import {
  normalizeSerpApiProduct,
  type RawSerpProduct,
} from "./productNormalizer";
import type { NormalizedSearchRequest, ProductOption } from "./types";

type SerpShoppingResponse = {
  shopping_results?: RawSerpProduct[];
  error?: string;
};

type SerpImmersiveResponse = {
  product_results?: {
    stores?: RawSerpProduct[];
  };
  error?: string;
};

const SERPAPI_TIMEOUT_MS = 9000;

function envString(key: string, fallback = "") {
  const value = String(process.env[key] ?? "").trim();
  return value || fallback;
}

async function fetchJson<T>(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERPAPI_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`provider_http_${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function shoppingUrl(request: NormalizedSearchRequest, apiKey: string) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", request.query);
  url.searchParams.set("gl", request.country);
  url.searchParams.set("hl", request.language);
  url.searchParams.set("api_key", apiKey);
  return url;
}

function immersiveUrl(token: string, request: NormalizedSearchRequest, apiKey: string) {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_immersive_product");
  url.searchParams.set("page_token", token);
  url.searchParams.set("more_stores", "true");
  url.searchParams.set("gl", request.country);
  url.searchParams.set("hl", request.language);
  url.searchParams.set("api_key", apiKey);
  return url;
}

function immersiveToken(raw: RawSerpProduct) {
  const directToken = String(raw.immersive_product_page_token ?? "").trim();
  if (directToken) return directToken;
  const apiUrl = String(raw.serpapi_immersive_product_api ?? raw.serpapi_product_api ?? "").trim();
  if (!apiUrl) return "";
  try {
    return new URL(apiUrl).searchParams.get("page_token") ?? "";
  } catch {
    return "";
  }
}

async function fetchImmersiveStores(
  raw: RawSerpProduct,
  request: NormalizedSearchRequest,
  apiKey: string,
) {
  const token = immersiveToken(raw);
  if (!token) return [];
  try {
    const data = await fetchJson<SerpImmersiveResponse>(immersiveUrl(token, request, apiKey));
    const stores = data.product_results?.stores ?? [];
    const fallbackTitle = String(raw.title ?? "").trim();
    return stores
      .map((store) =>
        normalizeSerpApiProduct(
          {
            ...store,
            title: store.title ?? fallbackTitle,
            source: store.source ?? store.merchant ?? store.name,
          },
          request.category,
        ),
      )
      .filter((product): product is ProductOption => !!product);
  } catch (error) {
    logger.info("[PRODUCT_SEARCH] immersive lookup skipped", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

function dedupeProducts(products: ProductOption[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = `${product.productUrl}|${product.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchSerpApiProducts(
  request: NormalizedSearchRequest,
): Promise<ProductOption[]> {
  const apiKey = envString("SERPAPI_API_KEY");
  if (!apiKey) {
    throw new Error("serpapi_key_missing");
  }

  const data = await fetchJson<SerpShoppingResponse>(shoppingUrl(request, apiKey));
  if (data.error) {
    throw new Error("serpapi_error");
  }

  const shoppingResults = (data.shopping_results ?? []).slice(0, 20);
  const directProducts = shoppingResults
    .map((raw) => normalizeSerpApiProduct(raw, request.category))
    .filter((product): product is ProductOption => !!product);

  const immersiveProducts: ProductOption[] = [];
  if (directProducts.length < request.maxResults) {
    const immersiveCandidates = shoppingResults
      .filter((raw) => !normalizeSerpApiProduct(raw, request.category))
      .slice(0, 4);
    for (const raw of immersiveCandidates) {
      const stores = await fetchImmersiveStores(raw, request, apiKey);
      immersiveProducts.push(...stores);
      if (directProducts.length + immersiveProducts.length >= request.maxResults * 2) break;
    }
  }

  return dedupeProducts([...directProducts, ...immersiveProducts]);
}
