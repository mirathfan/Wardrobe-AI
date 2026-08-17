import { createHash } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import type { NormalizedSearchRequest, ProductOption } from "./types";

type ProductSearchCacheDoc = {
  key: string;
  query: string;
  products: ProductOption[];
  provider: "serpapi";
  createdAt: number;
  expiresAt: number;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildProductSearchCacheKey(request: NormalizedSearchRequest) {
  const payload = {
    query: request.query,
    category: request.category ?? null,
    priceTiers: request.priceTiers.slice().sort(),
    genderPresentation: request.genderPresentation,
    country: request.country,
    language: request.language,
  };
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

export async function getCachedProductSearch(key: string) {
  const snapshot = await getFirestore().collection("productSearchCache").doc(key).get();
  if (!snapshot.exists) return null;
  const data = snapshot.data() as Partial<ProductSearchCacheDoc> | undefined;
  const expiresAt = Number(data?.expiresAt ?? 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return {
    products: Array.isArray(data?.products) ? data.products : [],
    provider: data?.provider === "serpapi" ? data.provider : "serpapi",
  };
}

export async function setCachedProductSearch(params: {
  key: string;
  request: NormalizedSearchRequest;
  products: ProductOption[];
  ttlHours: number;
}) {
  const now = Date.now();
  const ttlMs = Math.max(1, params.ttlHours) * 60 * 60 * 1000;
  await getFirestore()
    .collection("productSearchCache")
    .doc(params.key)
    .set(
      {
        key: params.key,
        query: params.request.query,
        products: params.products,
        provider: "serpapi",
        createdAt: now,
        expiresAt: now + ttlMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}
