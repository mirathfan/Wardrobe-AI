export type ProductCategory =
  | "tops"
  | "bottoms"
  | "footwear"
  | "outerwear"
  | "accessories";

export type ProductTier = "budget" | "mid" | "premium";

export type ProductSourceScreen = "home" | "insights" | "aura_chat" | "outfit_card";

export type SearchLiveProductsRequest = {
  itemType: string;
  category?: ProductCategory;
  styleTags?: string[];
  preferredColors?: string[];
  priceTiers?: ProductTier[];
  budgetPreference?: ProductTier;
  genderPresentation?: "mens" | "womens" | "unisex";
  sourceScreen?: ProductSourceScreen;
  maxResults?: number;
};

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
  tier: ProductTier;
  source: "live" | "curated";
  affiliateEligible: boolean;
  rating?: number;
  reviews?: number;
  confidenceScore?: number;
  lastUpdatedAt?: string;
};

export type LiveProductProviderResult = {
  products: ProductOption[];
  provider: "serpapi";
  cacheHit?: boolean;
};

export type SearchLiveProductsResponse = LiveProductProviderResult & {
  ok: boolean;
  disabled?: boolean;
};

export type NormalizedSearchRequest = {
  itemType: string;
  query: string;
  category?: ProductCategory;
  styleTags: string[];
  preferredColors: string[];
  priceTiers: ProductTier[];
  budgetPreference?: ProductTier;
  genderPresentation: "mens" | "womens" | "unisex";
  sourceScreen?: ProductSourceScreen;
  maxResults: number;
  country: string;
  language: string;
};
