import { Timestamp } from "firebase/firestore";
import type { VisualNormalization } from "../lib/visualNormalization";
import {
  AllowedFormality,
  AllowedLayerRole,
  AllowedVisualWeight,
  AllowedWarmth,
  Category,
} from "../shared/wardrobeTaxonomy";

export type ClothingStatus = "AVAILABLE" | "WORN" | "IN_LAUNDRY";
export type ClothingPattern =
  | "solid"
  | "striped"
  | "plaid"
  | "graphic"
  | "checked"
  | "logo"
  | "text"
  | "floral"
  | "dots"
  | "camouflage"
  | "other"
  | "textured"
  | "unknown";

export type ClothingItem = {
  id: string;
  images?: {
    originalUrl: string;
    cleanedUrl?: string | null;
    isPrimary: boolean;
  }[] | null;
  originalImageUrl?: string | null;
  cleanedImageUrl?: string | null;

  // core
  brand: string;
  category?: Category | "shoes" | string;
  subCategory?: string;
  type?: string | null;
  wearSlot?: "core" | "accessory";
  pattern?: ClothingPattern;
  material?: string;
  materialConfidence?: number | null;
  style?: string | null;
  formality?: AllowedFormality | null;
  warmth?: AllowedWarmth | null;
  layerRole?: AllowedLayerRole | null;
  visualWeight?: AllowedVisualWeight | null;
  versatilityScore?: number | null;
  aestheticTags?: string[] | null;
  formalityScore?: number;
  warmthScore?: number;
  ingestion?: {
    status: "pending" | "processing" | "done" | "failed";
    lastRunAt?: Timestamp | number | null;
    error?: { message: string; code?: string };
    lastProcessedPhotoHash?: string;
    lastProcessedSourceHash?: string;
    runId?: string;
  };
  ingestionStatus?: "pending" | "processing" | "done" | "failed" | null;
  embeddings?: { image?: number[] };
  photos?: {
    originalUrl?: string | null;
    primaryUrl?: string | null;
    images?: {
      originalUrl?: string | null;
      cleanedUrl?: string | null;
      isPrimary?: boolean;
    }[] | null;
    normalizedUrl?: string | null;
    previewUrl?: string | null;
    urls?: string[];
    croppedUrl?: string;
    thumbUrl?: string;
    cleanedUrl?: string;
    cleanedPhotoUrl?: string;
    cleanedThumbUrl?: string;
    cleanedSource?: "placeholder" | "onnx" | "vision";
    cleanedFromHash?: string;
    forceCleaned?: boolean;
  };

  // new (safe + optional)
  name?: string;
  colors?: string[];
  colorLabel?: string;
  primaryColor?: string;
  displayColor?: string | null;
  displayColors?: string[] | null;
  colorSource?: "ai" | "user";
  colorUpdatedAt?: number;
  aiColorLabel?: string;
  aiColors?: string[];
  pixelColors?: string[];
  pixelColorHex?: string;
  colorConfidence?: number;
  confidenceSummary?: {
    overall: number;
    notes: string;
  } | null;
  colorNeedsReview?: boolean;
  detailTags?: string[] | null;
  crop?: { x: number; y: number; w: number; h: number; source: "ai" };
  cleanedUpdatedAt?: number;
  aiDebug?: {
    brandEvidence?: string | null;
    brandCandidates?: string[] | null;
    aiColors?: string[] | null;
    aiPrimaryColor?: string | null;
    aiColorLabel?: string | null;
    pixelColors?: string[] | null;
    pixelColorHex?: string | null;
    colorConfidence?: number | null;
    colorNeedsReview?: boolean | null;
  } | null;

  size?: string | null;
  notes?: string | null;
  price?: number | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  purchaseDate?: string | null;
  occasionTags?: string[] | null;
  seasonTags?: string[] | null;
  fit?: "slim" | "regular" | "oversized" | "relaxed" | "unknown" | null;
  rise?: "low" | "mid" | "high" | "unknown" | null;
  legShape?: "skinny" | "tapered" | "straight" | "wide" | "flare" | "unknown" | null;
  warmthPreference?: number | null;
  photoUrl?: string | null;
  photoUri?: string | null;
  visualNormalization?: VisualNormalization | null;
  isDraft?: boolean;
  draftState?: "draft" | "photo_uploaded" | "ingesting" | "ready" | "failed" | null;

  // lifecycle
  status: ClothingStatus;
  wearCountSinceWash: number;

  createdAt: number;
  lastWornDate?: number | null;
  lastWashedDate?: number | null;
  lastWashedAt?: number | null;
};
