import type { FieldValue, Timestamp } from "firebase-admin/firestore";

export type ClosetItemIntelligenceCategory =
  | "top"
  | "bottom"
  | "shoes"
  | "outerwear"
  | "accessory"
  | "one_piece"
  | "unknown";

export type ClosetItemIntelligenceFit =
  | "slim"
  | "regular"
  | "relaxed"
  | "oversized"
  | "unknown";

export type ClosetItemMetadataSource = "deterministic" | "ai" | "mixed";

export type NormalizedClosetItemMetadata = {
  category: ClosetItemIntelligenceCategory;
  subcategory?: string;
  brand?: string;
  colors: string[];
  material?: string;
  fit: ClosetItemIntelligenceFit;
  formality: number;
  warmth: number;
  styleTags: string[];
  occasionTags: string[];
  seasonTags: string[];
  weatherTags: string[];
  searchAliases: string[];
  confidence: number;
  source: ClosetItemMetadataSource;
  updatedAt: Timestamp | FieldValue | null;
};

export type ClosetItemDocument = Record<string, unknown> & {
  id?: string;
  aiMetadata?: Partial<NormalizedClosetItemMetadata> | null;
  aiMetadataVersion?: number | null;
  embeddingHash?: string | null;
  embeddingVector?: unknown;
  embeddingRaw?: unknown;
  embeddingText?: string | null;
};

export type IndexClosetItemStatus = "indexed" | "skipped";

export type IndexClosetItemResult = {
  itemId: string;
  status: IndexClosetItemStatus;
  embeddingText: string;
  embeddingTextPreview: string;
  aiMetadata: NormalizedClosetItemMetadata;
  embeddingHash: string;
  reason: string;
};

export type BackfillItemEntry = {
  itemId: string;
  name: string;
  category: string;
  reason: string;
};
