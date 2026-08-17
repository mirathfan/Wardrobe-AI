export type WardrobeRetrievalFormality = "casual" | "smart_casual" | "formal" | "any";

export type WardrobeRetrievalInput = {
  query: string;
  limit?: number;
  occasion?: string;
  categories?: string[];
  styleTags?: string[];
  colors?: string[];
  weather?: string;
  formality?: WardrobeRetrievalFormality;
  includeDiagnostics?: boolean;
};

export type NormalizedWardrobeRetrievalInput = {
  query: string;
  limit: number;
  occasion?: string;
  categories: string[];
  styleTags: string[];
  colors: string[];
  weather?: string;
  formality: WardrobeRetrievalFormality;
  includeDiagnostics: boolean;
};

export type WardrobeRetrievalCategoryBucket =
  | "top"
  | "bottom"
  | "footwear"
  | "outerwear"
  | "accessory"
  | "one_piece"
  | "unknown";

export type WardrobeRetrievalResult = {
  itemId: string;
  name: string;
  category: WardrobeRetrievalCategoryBucket;
  subcategory?: string;
  brand?: string;
  colors: string[];
  score: number | null;
  vectorScore: number | null;
  finalScore: number | null;
  boostsApplied: string[];
  penaltiesApplied: string[];
  distance: number | null;
  reason: string;
  imageUrl: string | null;
  aiMetadata: Record<string, unknown>;
  embeddingTextPreview: string | null;
  status: string | null;
  itemLifecycleStatus: string | null;
};

export type WardrobeRetrievalCategoryBuckets = Record<
  WardrobeRetrievalCategoryBucket,
  WardrobeRetrievalResult[]
>;

export type WardrobeRetrievalDiagnostics = {
  vectorField: string;
  distanceMeasure: "COSINE";
  distanceResultField: string;
  rawVectorLimit: number;
  rawResultCount: number;
  readyResultCount: number;
  filteredResultCount: number;
  returnedResultCount: number;
  embeddingDimensions: number;
  appliedFilters: {
    categories: string[];
    styleTags: string[];
    colors: string[];
    occasion?: string;
    weather?: string;
    formality: WardrobeRetrievalFormality;
  };
};

export type WardrobeRetrievalResponse = {
  query: string;
  retrievalQueryText: string;
  limit: number;
  results: WardrobeRetrievalResult[];
  categoryBuckets: WardrobeRetrievalCategoryBuckets;
  diagnostics?: WardrobeRetrievalDiagnostics;
};
