export const AI_METADATA_VERSION = 3;
export const EMBEDDING_TEXT_VERSION = 3;
export const EMBEDDING_VERSION = 1;
export const STYLE_PROFILE_VERSION = 1;

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large";
export const DEFAULT_EMBEDDING_DIMENSIONS = 2048;
export const EMBEDDING_ENCODING_FORMAT = "float";
export const DEFAULT_OUTFIT_GENERATION_MODEL = "gpt-5.4-mini";
export const DEFAULT_OUTFIT_GENERATION_MAX_CANDIDATES_PER_CATEGORY = 8;
export const DEFAULT_OUTFIT_GENERATION_MAX_OUTFITS = 3;
export const CLOSET_ITEM_COLLECTION_GROUP = "items";
export const CLOSET_ITEM_DOCUMENT_PATH = "users/{uid}/items/{itemId}";
export const EMBEDDING_VECTOR_FIELD = "embeddingVector";

export type WardrobeIntelligenceConfig = {
  embeddingModel: string;
  embeddingDimensions: number;
  enableAiMetadataEnrichment: boolean;
};

export type OutfitGenerationConfig = {
  model: string;
  maxCandidatesPerCategory: number;
  maxOutfits: number;
  enableRepair: boolean;
};

function parseEmbeddingDimensions(value: string | undefined): number {
  if (!value) return DEFAULT_EMBEDDING_DIMENSIONS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > DEFAULT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `AURA_EMBEDDING_DIMENSIONS must be an integer between 1 and ${DEFAULT_EMBEDDING_DIMENSIONS}.`,
    );
  }
  return parsed;
}

export function wardrobeIntelligenceConfig(): WardrobeIntelligenceConfig {
  return {
    embeddingModel: String(process.env.AURA_EMBEDDING_MODEL ?? "").trim() || DEFAULT_EMBEDDING_MODEL,
    embeddingDimensions: parseEmbeddingDimensions(process.env.AURA_EMBEDDING_DIMENSIONS),
    enableAiMetadataEnrichment:
      String(process.env.AURA_ENABLE_AI_METADATA_ENRICHMENT ?? "").trim().toLowerCase() === "true",
  };
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function outfitGenerationConfig(): OutfitGenerationConfig {
  return {
    model: String(process.env.AURA_OUTFIT_GENERATION_MODEL ?? "").trim() || DEFAULT_OUTFIT_GENERATION_MODEL,
    maxCandidatesPerCategory: parsePositiveInt(
      process.env.AURA_OUTFIT_GENERATION_MAX_CANDIDATES_PER_CATEGORY,
      DEFAULT_OUTFIT_GENERATION_MAX_CANDIDATES_PER_CATEGORY,
      20,
    ),
    maxOutfits: parsePositiveInt(
      process.env.AURA_OUTFIT_GENERATION_MAX_OUTFITS,
      DEFAULT_OUTFIT_GENERATION_MAX_OUTFITS,
      5,
    ),
    enableRepair:
      String(process.env.AURA_OUTFIT_GENERATION_ENABLE_REPAIR ?? "true").trim().toLowerCase() !== "false",
  };
}
