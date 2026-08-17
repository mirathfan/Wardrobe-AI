export type RenderSlotType =
  | "top"
  | "outerwear"
  | "bottom"
  | "footwear"
  | "accessory";

export type RenderAnchor = "top" | "center" | "waist" | "foot";

export type RenderProfile = {
  slotType: RenderSlotType;
  anchor: RenderAnchor;
  defaultScale: number;
  defaultTranslateY: number;
  slotFillBias?: "tight" | "balanced" | "loose";
  overlapPriority?: number;
  minScale?: number;
  maxScale?: number;
};

function normalizeText(value?: string | null) {
  return String(value ?? "").trim().toLowerCase();
}

const GENERIC_PROFILE: RenderProfile = {
  slotType: "accessory",
  anchor: "center",
  defaultScale: 1,
  defaultTranslateY: 0,
  slotFillBias: "balanced",
  overlapPriority: 0,
  minScale: 0.82,
  maxScale: 1.2,
};

const PROFILES: Record<string, RenderProfile> = {
  shirt: {
    slotType: "top",
    anchor: "top",
    defaultScale: 1.02,
    defaultTranslateY: 2,
    slotFillBias: "balanced",
    overlapPriority: 2,
    minScale: 0.88,
    maxScale: 1.14,
  },
  "t-shirt": {
    slotType: "top",
    anchor: "top",
    defaultScale: 0.98,
    defaultTranslateY: 3,
    slotFillBias: "balanced",
    overlapPriority: 2,
    minScale: 0.86,
    maxScale: 1.12,
  },
  tee: {
    slotType: "top",
    anchor: "top",
    defaultScale: 0.98,
    defaultTranslateY: 3,
    slotFillBias: "balanced",
    overlapPriority: 2,
    minScale: 0.86,
    maxScale: 1.12,
  },
  hoodie: {
    slotType: "outerwear",
    anchor: "top",
    defaultScale: 1.02,
    defaultTranslateY: 0,
    slotFillBias: "loose",
    overlapPriority: 3,
    minScale: 0.88,
    maxScale: 1.14,
  },
  jacket: {
    slotType: "outerwear",
    anchor: "top",
    defaultScale: 1.03,
    defaultTranslateY: -2,
    slotFillBias: "balanced",
    overlapPriority: 4,
    minScale: 0.9,
    maxScale: 1.16,
  },
  coat: {
    slotType: "outerwear",
    anchor: "top",
    defaultScale: 1.05,
    defaultTranslateY: -3,
    slotFillBias: "loose",
    overlapPriority: 4,
    minScale: 0.9,
    maxScale: 1.18,
  },
  blazer: {
    slotType: "outerwear",
    anchor: "top",
    defaultScale: 1.01,
    defaultTranslateY: -1,
    slotFillBias: "tight",
    overlapPriority: 4,
    minScale: 0.88,
    maxScale: 1.12,
  },
  blouse: {
    slotType: "top",
    anchor: "top",
    defaultScale: 1.03,
    defaultTranslateY: 3,
    slotFillBias: "balanced",
    overlapPriority: 2,
    minScale: 0.9,
    maxScale: 1.14,
  },
  "crop top": {
    slotType: "top",
    anchor: "top",
    defaultScale: 0.96,
    defaultTranslateY: 1,
    slotFillBias: "tight",
    overlapPriority: 2,
    minScale: 0.84,
    maxScale: 1.08,
  },
  jeans: {
    slotType: "bottom",
    anchor: "waist",
    defaultScale: 1,
    defaultTranslateY: 0,
    slotFillBias: "balanced",
    overlapPriority: 1,
    minScale: 0.9,
    maxScale: 1.12,
  },
  pants: {
    slotType: "bottom",
    anchor: "waist",
    defaultScale: 1,
    defaultTranslateY: 0,
    slotFillBias: "balanced",
    overlapPriority: 1,
    minScale: 0.9,
    maxScale: 1.12,
  },
  trousers: {
    slotType: "bottom",
    anchor: "waist",
    defaultScale: 1.01,
    defaultTranslateY: -1,
    slotFillBias: "tight",
    overlapPriority: 1,
    minScale: 0.9,
    maxScale: 1.1,
  },
  shorts: {
    slotType: "bottom",
    anchor: "waist",
    defaultScale: 0.94,
    defaultTranslateY: -2,
    slotFillBias: "tight",
    overlapPriority: 1,
    minScale: 0.84,
    maxScale: 1.05,
  },
  skirt: {
    slotType: "bottom",
    anchor: "waist",
    defaultScale: 0.98,
    defaultTranslateY: -2,
    slotFillBias: "balanced",
    overlapPriority: 1,
    minScale: 0.86,
    maxScale: 1.08,
  },
  sneaker: {
    slotType: "footwear",
    anchor: "foot",
    defaultScale: 1.04,
    defaultTranslateY: 3,
    slotFillBias: "balanced",
    overlapPriority: 1,
    minScale: 0.9,
    maxScale: 1.12,
  },
  boot: {
    slotType: "footwear",
    anchor: "foot",
    defaultScale: 1.02,
    defaultTranslateY: 1,
    slotFillBias: "balanced",
    overlapPriority: 1,
    minScale: 0.86,
    maxScale: 1.08,
  },
  loafer: {
    slotType: "footwear",
    anchor: "foot",
    defaultScale: 0.96,
    defaultTranslateY: 2,
    slotFillBias: "tight",
    overlapPriority: 1,
    minScale: 0.82,
    maxScale: 1.04,
  },
  heel: {
    slotType: "footwear",
    anchor: "foot",
    defaultScale: 0.94,
    defaultTranslateY: 1,
    slotFillBias: "tight",
    overlapPriority: 1,
    minScale: 0.8,
    maxScale: 1.04,
  },
  watch: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.16,
    defaultTranslateY: 0,
    slotFillBias: "balanced",
    overlapPriority: 0,
    minScale: 0.96,
    maxScale: 1.24,
  },
  glasses: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.08,
    defaultTranslateY: 0,
    slotFillBias: "balanced",
    overlapPriority: 0,
    minScale: 0.92,
    maxScale: 1.14,
  },
  bag: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.14,
    defaultTranslateY: 0,
    slotFillBias: "loose",
    overlapPriority: 0,
    minScale: 0.9,
    maxScale: 1.18,
  },
  handbag: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.16,
    defaultTranslateY: 0,
    slotFillBias: "loose",
    overlapPriority: 0,
    minScale: 0.9,
    maxScale: 1.2,
  },
  perfume: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.04,
    defaultTranslateY: 0,
    slotFillBias: "tight",
    overlapPriority: 0,
    minScale: 0.8,
    maxScale: 1.02,
  },
  chain: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.08,
    defaultTranslateY: 0,
    slotFillBias: "loose",
    overlapPriority: 0,
    minScale: 0.86,
    maxScale: 1.08,
  },
  necklace: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.08,
    defaultTranslateY: 0,
    slotFillBias: "loose",
    overlapPriority: 0,
    minScale: 0.86,
    maxScale: 1.08,
  },
  bracelet: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.04,
    defaultTranslateY: 0,
    slotFillBias: "balanced",
    overlapPriority: 0,
    minScale: 0.82,
    maxScale: 1.02,
  },
  cap: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.08,
    defaultTranslateY: 0,
    slotFillBias: "balanced",
    overlapPriority: 0,
    minScale: 0.86,
    maxScale: 1.08,
  },
  headwear: {
    slotType: "accessory",
    anchor: "center",
    defaultScale: 1.08,
    defaultTranslateY: 0,
    slotFillBias: "balanced",
    overlapPriority: 0,
    minScale: 0.86,
    maxScale: 1.08,
  },
  generic: GENERIC_PROFILE,
};

const MATCH_ORDER = [
  "shirt",
  "t-shirt",
  "tee",
  "blouse",
  "crop top",
  "hoodie",
  "jacket",
  "coat",
  "blazer",
  "jeans",
  "pants",
  "trousers",
  "shorts",
  "skirt",
  "sneaker",
  "boot",
  "loafer",
  "heel",
  "watch",
  "glasses",
  "handbag",
  "bag",
  "perfume",
  "chain",
  "necklace",
  "bracelet",
  "cap",
  "headwear",
];

export function getRenderProfile(input: {
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
}): RenderProfile {
  const tokens = [
    normalizeText(input.category),
    normalizeText(input.subCategory),
    normalizeText(input.type),
  ]
    .filter(Boolean)
    .join(" ");

  const match = MATCH_ORDER.find((key) => tokens.includes(key));
  return match ? PROFILES[match] : PROFILES.generic;
}
