import { Timestamp } from "firebase/firestore";
import { Category } from "../shared/wardrobeTaxonomy";

export type ClothingStatus = "AVAILABLE" | "WORN" | "IN_LAUNDRY";
export type ClothingPattern =
  | "solid"
  | "striped"
  | "graphic"
  | "checked"
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
  };

  // new (safe + optional)
  name?: string;
  colors?: string[];
  primaryColor?: string;

  size?: string | null;
  notes?: string | null;
  price?: number | null;
  purchaseDate?: string | null;
  photoUrl?: string | null;
  photoUri?: string | null;

  // lifecycle
  status: ClothingStatus;
  wearCountSinceWash: number;

  createdAt: number;
  lastWornDate?: number | null;
  lastWashedDate?: number | null;
};
