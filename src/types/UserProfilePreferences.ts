export type LengthUnit = "cm" | "in";
export type WeightUnit = "kg" | "lb";
export type ShoeRegion = "US" | "UK" | "EU";
export type ClothingRegion = "US" | "UK" | "EU" | "INTL";

export type UserProfilePreferences = {
  units: {
    length: LengthUnit;
    weight: WeightUnit;
    shoeRegion: ShoeRegion;
    clothingRegion: ClothingRegion;
  };
  body: {
    height?: number | null;
    weight?: number | null;
    chest?: number | null;
    shoulders?: number | null;
    neck?: number | null;
    sleeve?: number | null;
    waist?: number | null;
    hips?: number | null;
    inseam?: number | null;
    thigh?: number | null;
    footLength?: number | null;
  };
  defaultSizes: {
    top?: string | null;
    outerwear?: string | null;
    hoodie?: string | null;
    formalShirt?: string | null;
    bottomWaist?: string | null;
    bottomLength?: string | null;
    jeans?: string | null;
    shoes?: string | null;
  };
  fitPreferences: {
    tops?: "slim" | "regular" | "relaxed" | "oversized" | null;
    outerwear?: "slim" | "regular" | "roomy" | null;
    bottomsRise?: "low" | "mid" | "high" | null;
    bottomsLeg?: "skinny" | "slim" | "straight" | "tapered" | "wide" | null;
    shoes?: "true_to_size" | "half_up" | "half_down" | null;
  };
  stylePreferences: {
    preferredStyles?: string[];
    favoriteColors?: string[];
    avoidedColors?: string[];
    preferredBrands?: string[];
  };
  closetPreferences: {
    prioritizeUnderused?: boolean;
    hideLaundryByDefault?: boolean;
    defaultSort?: string | null;
  };
  notifications: {
    laundryReminders?: boolean;
    outfitReminders?: boolean;
    underusedItemNudges?: boolean;
  };
};
