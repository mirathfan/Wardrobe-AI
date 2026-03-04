import { Timestamp } from "firebase/firestore";
import { Category } from "../shared/wardrobeTaxonomy";

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

  // core
  brand: string;
  category?: Category | "shoes" | string;
  subCategory?: string;
  wearSlot?: "core" | "accessory";
  pattern?: ClothingPattern;
  material?: string;
  formalityScore?: number;
  warmthScore?: number;
  ingestion?: {
    status: "pending" | "processing" | "done" | "failed";
    lastRunAt?: Timestamp | number | null;
    error?: { message: string; code?: string };
    lastProcessedPhotoHash?: string;
  };
  embeddings?: { image?: number[] };
  photos?: {
    primaryUrl?: string | null;
    urls?: string[];
    croppedUrl?: string;
    thumbUrl?: string;
    cleanedUrl?: string;
    cleanedPhotoUrl?: string;
    cleanedThumbUrl?: string;
    cleanedSource?: "placeholder" | "onnx" | "ios_vision";
    cleanedFromHash?: string;
    forceCleaned?: boolean;
  };

  // new (safe + optional)
  name?: string;
  colors?: string[];
  colorLabel?: string;
  primaryColor?: string;
  colorSource?: "ai" | "user";
  colorUpdatedAt?: number;
  aiColorLabel?: string;
  aiColors?: string[];
  pixelColors?: string[];
  pixelColorHex?: string;
  colorConfidence?: number;
  colorNeedsReview?: boolean;
  crop?: { x: number; y: number; w: number; h: number; source: "ai" };
  cleanedUpdatedAt?: number;

  size?: string | null;
  notes?: string | null;
  price?: number | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  purchaseDate?: string | null;
  photoUrl?: string | null;
  photoUri?: string | null;

  // lifecycle
  status: ClothingStatus;
  wearCountSinceWash: number;

  createdAt: number;
  lastWornDate?: number | null;
  lastWashedDate?: number | null;
  lastWashedAt?: number | null;
};
