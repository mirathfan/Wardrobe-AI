export type ClothingStatus = "AVAILABLE" | "WORN" | "IN_LAUNDRY";

export type ClothingItem = {
  id: string;

  // core
  brand: string;
  category: string;

  // new (safe + optional)
  name?: string;
  colors?: string[];
  primaryColor?: string;

  size?: string | null;
  notes?: string | null;
  price?: number | null;
  purchaseDate?: string | null;
  photoUri?: string | null;

  // lifecycle
  status: ClothingStatus;
  wearCountSinceWash: number;

  createdAt: number;
  lastWornDate?: number | null;
  lastWashedDate?: number | null;
};
