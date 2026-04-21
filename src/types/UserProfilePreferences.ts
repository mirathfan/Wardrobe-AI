export type LengthUnit = "cm" | "in";
export type WeightUnit = "kg" | "lb";
export type ShoeRegion = "US" | "UK" | "EU";
export type ClothingRegion = "US" | "UK" | "EU" | "INTL";
export type UnitsPreference = "imperial" | "metric";
export type WardrobeMode = "masculine" | "feminine" | "neutral" | "mixed" | "custom";
export type PreferredFit = "slim" | "regular" | "relaxed" | "oversized";

export type UserProfilePreferences = {
  onboardingCompleted: boolean;
  firstName?: string | null;
  region?: string | null;
  unitsPreference: UnitsPreference;
  wardrobeMode: WardrobeMode;
  selectedCategories: string[];
  styleAesthetics: string[];
  preferredFit?: PreferredFit | null;
  favoriteColors: string[];
  avoidedColors: string[];
  accessoryPreferences: string[];
  occasionPriority: string[];
  goals: string[];
  height: {
    value: number | null;
    unit: "cm" | "ft_in";
  };
  weight: {
    value: number | null;
    unit: "kg" | "lb";
  };
  createdAt?: number | null;
  updatedAt?: number | null;
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
    tops?: string | null;
    top?: string | null;
    outerwear?: string | null;
    hoodie?: string | null;
    formalShirt?: string | null;
    bottoms?: string | null;
    bottomWaist?: string | null;
    bottomsLength?: string | null;
    bottomLength?: string | null;
    jeans?: string | null;
    dresses?: string | null;
    skirts?: string | null;
    bottomsWaist?: string | null;
    shoes?: string | null;
  };
  advancedFit: {
    bust?: string | null;
    waistMeasurement?: string | null;
    hips?: string | null;
    inseam?: string | null;
    shoulderWidth?: string | null;
    sleeveLength?: string | null;
    braSize?: string | null;
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
