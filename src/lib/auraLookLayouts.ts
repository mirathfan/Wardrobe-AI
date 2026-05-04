import { getItemImageUrl } from "@/src/lib/itemImage";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook, AuraLookPiece } from "@/src/types/aura";

export type AuraLayoutVariant = "chat" | "swipe" | "home" | "studio";

export type OutfitLayoutType =
  | "classic_full"
  | "no_jacket"
  | "shorts_outfit"
  | "layered_tops"
  | "dress_centered"
  | "jumpsuit"
  | "coord_set"
  | "abaya_saree"
  | "two_items"
  | "single_item"
  | "accessories_heavy"
  | "accessories_only";

export type AuraLayoutType = OutfitLayoutType;

export type AuraAccessoryType =
  | "watch"
  | "glasses"
  | "bag"
  | "necklace"
  | "bracelet"
  | "earrings"
  | "belt"
  | "hat"
  | "scarf"
  | "fragrance"
  | "jewelry"
  | "socks"
  | "other_accessory";

export type AuraLayoutRole =
  | "top"
  | "outerwear"
  | "bottom"
  | "footwear"
  | "one_piece"
  | "accessory"
  | "unknown";

export type AuraLayoutItem = {
  key: string;
  itemId?: string | null;
  role: AuraLayoutRole;
  accessoryType?: AuraAccessoryType | null;
  itemName: string;
  source: "closet" | "suggested";
  imageUrl?: string | null;
  cleanedImageUrl?: string | null;
  image?: string | null;
  brand?: string | null;
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
  style?: string | null;
  fit?: string | null;
  size?: string | null;
  status?: ClothingItem["status"] | null;
  colors?: string[] | null;
  colorLabel?: string | null;
  primaryColor?: string | null;
  lastWornDate?: number | null;
  stylingNote?: string | null;
  layerRole?: string | null;
  visualNormalization?: ClothingItem["visualNormalization"] | null;
  searchTokens: string;
};

export type BoardPiece = AuraLayoutItem;

export type AuraPlacedItem = {
  key: string;
  item: AuraLayoutItem;
  slotKind: "top" | "outerwear" | "bottom" | "footwear" | "accessory";
  slotName: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
  shadowIntensity: number;
  rotation: number;
};

export type PlacedBoardItem = AuraPlacedItem;

export type AuraRenderPlan = {
  layoutType: AuraLayoutType;
  variant: AuraLayoutVariant;
  placedItems: AuraPlacedItem[];
  stripItems: AuraLayoutItem[];
  hiddenStripItems: AuraLayoutItem[];
  overflowItems: AuraLayoutItem[];
};

type ClassifiedItems = {
  top: AuraLayoutItem[];
  outerwear: AuraLayoutItem[];
  bottom: AuraLayoutItem[];
  footwear: AuraLayoutItem[];
  onePiece: AuraLayoutItem[];
  accessories: AuraLayoutItem[];
  unknown: AuraLayoutItem[];
};

type ZoneSpec = {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  zIndex: number;
  slotName: string;
  shadowIntensity?: number;
  rotation?: number;
};

const DEBUG_AURA_LAYOUT =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_BOARD_DEBUG === "1";

const LEFT_TOP: ZoneSpec = {
  centerX: 24,
  centerY: 32,
  width: 40,
  height: 48,
  zIndex: 20,
  slotName: "left-top",
  shadowIntensity: 0.92,
};

const LAYERED_SIDE_BY_SIDE = {
  shirt: {
    centerX: 20,
    centerY: 35,
    width: 38,
    height: 46,
    zIndex: 20,
    slotName: "layered-shirt",
    shadowIntensity: 0.86,
    rotation: 10,
  },
  jacket: {
    centerX: 80,
    centerY: 35,
    width: 38,
    height: 50,
    zIndex: 30,
    slotName: "layered-jacket",
    shadowIntensity: 0.96,
    rotation: -10,
  },
} satisfies Record<string, ZoneSpec>;

const TOP_LEFT_STACKED = {
  jacket: {
    centerX: 70,
    centerY: 28,
    width: 38,
    height: 46,
    zIndex: 30,
    slotName: "stacked-jacket",
    shadowIntensity: 0.95,
    rotation: -1,
  },
  hoodie: {
    centerX: 22,
    centerY: 30,
    width: 38,
    height: 46,
    zIndex: 20,
    slotName: "stacked-hoodie",
    shadowIntensity: 0.88,
    rotation: 0.8,
  },
  tee: {
    centerX: 24,
    centerY: 32,
    width: 32,
    height: 38,
    zIndex: 10,
    slotName: "stacked-tee",
    shadowIntensity: 0.78,
    rotation: 1.4,
  },
} satisfies Record<string, ZoneSpec>;

const RIGHT_OUTERWEAR: ZoneSpec = {
  centerX: 68,
  centerY: 28,
  width: 40,
  height: 48,
  zIndex: 30,
  slotName: "right-outerwear",
  shadowIntensity: 0.96,
  rotation: -1,
};

const BOTTOM_CENTER: ZoneSpec = {
  centerX: 50,
  centerY: 70,
  width: 30,
  height: 60,
  zIndex: 15,
  slotName: "bottom-center",
  shadowIntensity: 0.9,
  rotation: 0,
};

const BOTTOM_CENTER_SHORT: ZoneSpec = {
  centerX: 50,
  centerY: 60,
  width: 34,
  height: 36,
  zIndex: 15,
  slotName: "bottom-center-short",
  shadowIntensity: 0.86,
  rotation: 1,
};

const TOP_LEFT_CHAIN: ZoneSpec = {
  centerX: 12,
  centerY: 8,
  width: 18,
  height: 10,
  zIndex: 50,
  slotName: "top-left-chain",
  shadowIntensity: 0.35,
};

const TOP_CENTER_GLASSES: ZoneSpec = {
  centerX: 50,
  centerY: 10,
  width: 22,
  height: 10,
  zIndex: 50,
  slotName: "top-center-glasses",
  shadowIntensity: 0.35,
};

const TOP_RIGHT_HAT: ZoneSpec = {
  centerX: 90,
  centerY: 10,
  width: 20,
  height: 16,
  zIndex: 50,
  slotName: "top-right-hat",
  shadowIntensity: 0.35,
};

const BOTTOM_LEFT_SHOES: ZoneSpec = {
  centerX: 15,
  centerY: 90,
  width: 28,
  height: 16,
  zIndex: 40,
  slotName: "bottom-left-shoes",
  shadowIntensity: 1.05,
  rotation: 0,
};

const BELT_ZONE: ZoneSpec = {
  centerX: 20,
  centerY: 65,
  width: 30,
  height: 30,
  zIndex: 45,
  slotName: "belt-zone",
  shadowIntensity: 0,
  rotation: 90,
};

const BAG_ZONE: ZoneSpec = {
  centerX: 78,
  centerY: 72,
  width: 26,
  height: 28,
  zIndex: 40,
  slotName: "bag-zone",
  shadowIntensity: 0.8,
  rotation: 2,
};

const PERFUME_ZONE: ZoneSpec = {
  centerX: 88,
  centerY: 90,
  width: 16,
  height: 18,
  zIndex: 45,
  slotName: "perfume-zone",
  shadowIntensity: 0.5,
};

const CENTER_TALL: ZoneSpec = {
  centerX: 44,
  centerY: 46,
  width: 38,
  height: 80,
  zIndex: 20,
  slotName: "center-tall",
  shadowIntensity: 0.96,
};

const CENTER_WIDE: ZoneSpec = {
  centerX: 50,
  centerY: 46,
  width: 58,
  height: 68,
  zIndex: 20,
  slotName: "center-wide",
  shadowIntensity: 0.94,
};

const ACCESSORY_ONLY_GRID: ZoneSpec[] = [
  {
    centerX: 25,
    centerY: 30,
    width: 36,
    height: 32,
    zIndex: 20,
    slotName: "accessory-grid-1",
    shadowIntensity: 0.62,
  },
  {
    centerX: 72,
    centerY: 30,
    width: 34,
    height: 28,
    zIndex: 20,
    slotName: "accessory-grid-2",
    shadowIntensity: 0.62,
  },
  {
    centerX: 25,
    centerY: 68,
    width: 34,
    height: 30,
    zIndex: 20,
    slotName: "accessory-grid-3",
    shadowIntensity: 0.62,
  },
  {
    centerX: 72,
    centerY: 68,
    width: 32,
    height: 28,
    zIndex: 20,
    slotName: "accessory-grid-4",
    shadowIntensity: 0.62,
  },
];

function normalizeText(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function buildTokens(parts: (string | null | undefined)[]) {
  return parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(" ");
}

function containsAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

function normalizedSubCategory(
  item?: Pick<AuraLayoutItem, "subCategory" | "type" | "searchTokens"> | null,
) {
  return (
    normalizeText(item?.subCategory) ||
    normalizeText(item?.type) ||
    normalizeText(item?.searchTokens)
  );
}

function isShortBottom(item?: AuraLayoutItem | null) {
  const sub = normalizedSubCategory(item);
  return containsAny(sub, ["shorts", "cargo", "trackpants"]);
}

function isSmallAccessory(item: AuraLayoutItem) {
  if (item.role !== "accessory") return false;
  return containsAny(item.searchTokens, [
    "watch",
    "smartwatch",
    "bracelet",
    "ring",
    "earring",
    "earrings",
    "anklet",
    "scarf",
    "bandana",
    "hair_clip",
    "hair clip",
    "sock",
    "socks",
    "no_show_socks",
    "no show socks",
    "knee_socks",
    "knee socks",
    "glove",
    "gloves",
    "tie",
    "pocket_square",
    "pocket square",
  ]);
}

function isBagAccessory(item: AuraLayoutItem) {
  if (item.role !== "accessory") return false;
  return (
    item.accessoryType === "bag" ||
    containsAny(item.searchTokens, [
      "bag",
      "backpack",
      "handbag",
      "tote_bag",
      "tote bag",
      "tote",
      "clutch",
      "crossbody",
      "shoulder_bag",
      "shoulder bag",
      "mini_bag",
      "mini bag",
    ])
  );
}

function isBackpackAccessory(item: AuraLayoutItem) {
  if (item.role !== "accessory") return false;
  return containsAny(item.searchTokens, ["backpack"]);
}

function isBeltAccessory(item: AuraLayoutItem) {
  if (item.role !== "accessory") return false;
  if (containsAny(item.searchTokens, ["chain_belt", "chain belt"]))
    return false;
  return (
    item.accessoryType === "belt" || containsAny(item.searchTokens, ["belt"])
  );
}

function isGlassesAccessory(item: AuraLayoutItem) {
  if (item.role !== "accessory") return false;
  return (
    item.accessoryType === "glasses" ||
    containsAny(item.searchTokens, ["glasses", "sunglasses"])
  );
}

function isHatAccessory(item: AuraLayoutItem) {
  if (item.role !== "accessory") return false;
  return (
    item.accessoryType === "hat" ||
    containsAny(item.searchTokens, [
      "cap",
      "hat",
      "beanie",
      "bucket_hat",
      "bucket hat",
    ])
  );
}

function isPerfumeAccessory(item: AuraLayoutItem) {
  if (item.role !== "accessory") return false;
  return (
    item.accessoryType === "fragrance" ||
    containsAny(item.searchTokens, ["perfume", "cologne", "fragrance"])
  );
}

function isNecklaceAccessory(item: AuraLayoutItem) {
  if (item.role !== "accessory") return false;
  if (
    containsAny(item.searchTokens, [
      "ring",
      "bracelet",
      "earring",
      "earrings",
      "anklet",
    ])
  )
    return false;
  return (
    item.accessoryType === "necklace" ||
    containsAny(item.searchTokens, [
      "necklace",
      "chain_belt",
      "chain belt",
      "chain",
      "jewelry",
      "jewellery",
    ])
  );
}

function inferLayoutRole(piece: AuraLookPiece, tokens: string): AuraLayoutRole {
  if (piece.role === "outerwear") return "outerwear";
  if (piece.role === "top") return "top";
  if (piece.role === "bottom") return "bottom";
  if (piece.role === "shoes") return "footwear";
  if (piece.role === "accessory") return "accessory";
  if (
    containsAny(tokens, [
      "dress",
      "jumpsuit",
      "romper",
      "one piece",
      "one-piece",
      "saree",
      "abaya",
      "kurta set",
      "kurta_set",
    ])
  ) {
    return "one_piece";
  }
  if (
    containsAny(tokens, [
      "jacket",
      "coat",
      "blazer",
      "outerwear",
      "shacket",
      "parka",
      "bomber",
      "trench",
      "overshirt",
    ])
  ) {
    return "outerwear";
  }
  if (
    containsAny(tokens, [
      "shirt",
      "tee",
      "t-shirt",
      "blouse",
      "crop top",
      "tank",
      "polo",
      "top",
      "sweater",
      "sweatshirt",
      "hoodie",
      "knit",
      "kurta",
    ])
  ) {
    return "top";
  }
  if (
    containsAny(tokens, [
      "jeans",
      "trousers",
      "pants",
      "cargo",
      "shorts",
      "skirt",
      "bottom",
      "joggers",
      "trackpants",
      "chinos",
    ])
  ) {
    return "bottom";
  }
  if (
    containsAny(tokens, [
      "shoe",
      "sneaker",
      "loafer",
      "boot",
      "heel",
      "flat",
      "sandal",
      "slide",
    ])
  ) {
    return "footwear";
  }
  if (
    containsAny(tokens, [
      "watch",
      "glasses",
      "sunglasses",
      "bag",
      "handbag",
      "backpack",
      "necklace",
      "bracelet",
      "earrings",
      "belt",
      "hat",
      "cap",
      "scarf",
      "fragrance",
      "perfume",
      "cologne",
      "jewelry",
      "jewellery",
      "socks",
    ])
  ) {
    return "accessory";
  }
  return "unknown";
}

function classifyAccessoryType(tokens: string): AuraAccessoryType | null {
  if (containsAny(tokens, ["watch", "smartwatch"])) return "watch";
  if (containsAny(tokens, ["glasses", "sunglasses"])) return "glasses";
  if (
    containsAny(tokens, [
      "bag",
      "handbag",
      "crossbody",
      "backpack",
      "tote_bag",
      "tote bag",
      "clutch",
      "shoulder_bag",
      "shoulder bag",
      "mini_bag",
      "mini bag",
    ])
  )
    return "bag";
  if (containsAny(tokens, ["necklace", "chain", "chain_belt", "chain belt"]))
    return "necklace";
  if (containsAny(tokens, ["bracelet"])) return "bracelet";
  if (containsAny(tokens, ["earrings", "earring"])) return "earrings";
  if (containsAny(tokens, ["belt"])) return "belt";
  if (containsAny(tokens, ["hat", "cap", "beanie", "bucket_hat", "bucket hat"]))
    return "hat";
  if (containsAny(tokens, ["scarf", "bandana"])) return "scarf";
  if (containsAny(tokens, ["perfume", "fragrance", "cologne"]))
    return "fragrance";
  if (
    containsAny(tokens, [
      "socks",
      "sock",
      "no_show_socks",
      "no show socks",
      "knee_socks",
      "knee socks",
    ])
  )
    return "socks";
  if (containsAny(tokens, ["ring", "jewelry", "jewellery"])) return "jewelry";
  return "other_accessory";
}

function toLayoutItem(
  piece: AuraLookPiece,
  index: number,
  itemsById?: Map<string, ClothingItem>,
): AuraLayoutItem {
  const item = piece.itemId ? itemsById?.get(piece.itemId) : undefined;
  const tokens = buildTokens([
    piece.role,
    piece.itemName,
    item?.name,
    item?.brand,
    item?.category,
    item?.subCategory,
    item?.type,
    item?.style,
    item?.fit,
  ]);
  const role = inferLayoutRole(piece, tokens);
  const accessoryType =
    role === "accessory" ? classifyAccessoryType(tokens) : null;
  const normalizedImage = item
    ? (getItemImageUrl(item, { variant: "thumb" }) ?? piece.imageUrl ?? null)
    : (piece.imageUrl ?? null);

  return {
    key: `${piece.itemId ?? piece.itemName}-${piece.role}-${index}`,
    itemId: piece.itemId ?? null,
    role,
    accessoryType,
    itemName: piece.itemName || item?.name || "Wardrobe item",
    source: piece.source,
    imageUrl: piece.imageUrl ?? normalizedImage ?? null,
    cleanedImageUrl:
      item?.cleanedImageUrl ??
      item?.photos?.cleanedUrl ??
      item?.photos?.cleanedPhotoUrl ??
      null,
    image: normalizedImage,
    brand: item?.brand ?? null,
    category: item?.category ?? null,
    subCategory: item?.subCategory ?? null,
    type: item?.type ?? null,
    style: item?.style ?? null,
    fit: item?.fit ?? null,
    size: item?.size ?? null,
    status: item?.status ?? null,
    colors: item?.displayColors ?? item?.colors ?? item?.aiColors ?? null,
    colorLabel:
      item?.displayColor ??
      item?.colorLabel ??
      item?.aiColorLabel ??
      item?.primaryColor ??
      null,
    primaryColor: item?.primaryColor ?? item?.pixelColorHex ?? null,
    lastWornDate: item?.lastWornDate ?? null,
    stylingNote: item?.notes ?? null,
    layerRole: item?.layerRole ?? null,
    visualNormalization: item?.visualNormalization ?? null,
    searchTokens: tokens,
  };
}

function classifyItemsFromPieces(pieces: AuraLayoutItem[]): ClassifiedItems {
  const grouped: ClassifiedItems = {
    top: [],
    outerwear: [],
    bottom: [],
    footwear: [],
    onePiece: [],
    accessories: [],
    unknown: [],
  };

  for (const item of pieces) {
    if (item.role === "top") grouped.top.push(item);
    else if (item.role === "outerwear") grouped.outerwear.push(item);
    else if (item.role === "bottom") grouped.bottom.push(item);
    else if (item.role === "footwear") grouped.footwear.push(item);
    else if (item.role === "one_piece") grouped.onePiece.push(item);
    else if (item.role === "accessory") grouped.accessories.push(item);
    else grouped.unknown.push(item);
  }

  return grouped;
}

function buildBoardPieces(
  look: AuraLook,
  itemsById?: Map<string, ClothingItem>,
) {
  return (look.pieces ?? []).map((piece, index) =>
    toLayoutItem(piece, index, itemsById),
  );
}

export function detectOutfitLayoutType(pieces: BoardPiece[]): OutfitLayoutType {
  const classified = classifyItemsFromPieces(pieces);
  const corePieces = pieces.filter(
    (piece) => piece.role !== "accessory" && piece.role !== "unknown",
  );
  const top = classified.top[0] ?? null;
  const bottom = classified.bottom[0] ?? null;
  const onePiece = classified.onePiece[0] ?? null;

  if (pieces.length === 1) return "single_item";
  if (pieces.length > 0 && pieces.every((piece) => piece.role === "accessory"))
    return "accessories_only";
  if (onePiece) {
    const sub = normalizedSubCategory(onePiece);
    if (containsAny(sub, ["jumpsuit"])) return "jumpsuit";
    if (containsAny(sub, ["set", "matching_set"])) return "coord_set";
    if (containsAny(sub, ["abaya", "saree", "kurta_set", "kurta set"]))
      return "abaya_saree";
    return "dress_centered";
  }
  if (bottom && isShortBottom(bottom)) return "shorts_outfit";
  if (
    classified.outerwear.length > 0 &&
    top &&
    containsAny(normalizedSubCategory(top), ["hoodie", "sweater", "sweatshirt"])
  ) {
    return "layered_tops";
  }
  if (classified.outerwear.length > 0) return "classic_full";
  if (corePieces.length <= 2) return "two_items";
  if (classified.accessories.length >= 4) return "accessories_heavy";
  return "no_jacket";
}

export function detectLayoutType(
  _look: AuraLook,
  items: ClassifiedItems,
): AuraLayoutType {
  return detectOutfitLayoutType([
    ...items.outerwear,
    ...items.top,
    ...items.bottom,
    ...items.footwear,
    ...items.onePiece,
    ...items.accessories,
    ...items.unknown,
  ]);
}

function slotKindForRole(role: AuraLayoutRole): AuraPlacedItem["slotKind"] {
  if (role === "top" || role === "one_piece") return "top";
  if (role === "outerwear") return "outerwear";
  if (role === "bottom") return "bottom";
  if (role === "footwear") return "footwear";
  return "accessory";
}

function maxSizeForItem(item: AuraLayoutItem) {
  if (item.role === "top") return { width: 44, height: 52 };
  if (item.role === "outerwear") return { width: 40, height: 50 };
  if (item.role === "bottom") return { width: 34, height: 62 };
  if (item.role === "footwear") return { width: 30, height: 18 };
  if (item.role === "one_piece") return { width: 40, height: 82 };
  if (item.role === "accessory") {
    if (isBeltAccessory(item)) return { width: 32, height: 8 };
    if (isPerfumeAccessory(item)) return { width: 18, height: 20 };
    if (isGlassesAccessory(item)) return { width: 24, height: 12 };
    if (isHatAccessory(item)) return { width: 22, height: 18 };
    if (isNecklaceAccessory(item)) return { width: 20, height: 12 };
    return isBagAccessory(item)
      ? { width: 28, height: 30 }
      : { width: 24, height: 18 };
  }
  return { width: 92, height: 92 };
}

function zoneToPlacedItem(
  item: AuraLayoutItem,
  zone: ZoneSpec,
): AuraPlacedItem {
  const maxSize = maxSizeForItem(item);
  const widthPct = Math.min(clamp(zone.width, 4, 92), maxSize.width);
  const heightPct = Math.min(clamp(zone.height, 4, 92), maxSize.height);
  const leftPct = clamp(zone.centerX - widthPct / 2, 2, 98 - widthPct);
  const topPct = clamp(zone.centerY - heightPct / 2, 2, 98 - heightPct);

  return {
    key: item.key,
    item,
    slotKind: slotKindForRole(item.role),
    slotName: zone.slotName,
    leftPct: Number(leftPct.toFixed(2)),
    topPct: Number(topPct.toFixed(2)),
    widthPct: Number(widthPct.toFixed(2)),
    heightPct: Number(heightPct.toFixed(2)),
    zIndex: zone.zIndex,
    shadowIntensity: zone.shadowIntensity ?? 0.8,
    rotation: zone.rotation ?? 0,
  };
}

function withZone(zone: ZoneSpec, overrides: Partial<ZoneSpec>): ZoneSpec {
  return { ...zone, ...overrides };
}

function variantZone(zone: ZoneSpec, variant: string): ZoneSpec {
  if (variant !== "home") return zone;

  // Zones control board placement/container bounds only. Accessory image fill is tuned in AuraLookCard.
  switch (zone.slotName) {
    case "layered-shirt":
      return withZone(zone, {
        centerX: 20,
        centerY: 40,
        width: 45,
        height: 55,
        rotation: 0,
      });
    case "layered-jacket":
      return withZone(zone, {
        centerX: 80,
        centerY: 40,
        width: 50,
        height: 60,
        rotation: 0,
      });
    case "right-outerwear":
      return withZone(zone, {
        centerX: 75,
        centerY: 35,
        width: 39,
        height: 50,
      });
    case "left-top":
    case "left-top-alone":
      return withZone(zone, {
        centerX: zone.slotName === "left-top-alone" ? 30 : 28,
        centerY: 34,
        width: 42,
        height: 50,
      });
    case "bottom-center":
    case "bottom-no-jacket":
      return withZone(zone, {
        centerX: zone.slotName === "bottom-no-jacket" ? 70 : 50,
        centerY: 70,
        width: 100,
        height: 100,
      });
    case "bottom-center-short":
      return withZone(zone, {
        centerY: 59,
        width: 30,
        height: 32,
      });
    case "bottom-left-shoes":
      return withZone(zone, {
        centerX: 20,
        centerY: 90,
        width: 60,
        height: 40,
      });
    case "bag-zone":
      return withZone(zone, {
        centerX: 78,
        centerY: 71,
        width: 28,
        height: 30,
      });
    case "top-center-glasses":
      return withZone(zone, {
        centerX: 50,
        centerY: 15,
        width: 60,
        height: 20,
      });

    case "belt-zone":
      return withZone(zone, {
        centerX: 78,
        centerY: 60,
        width: 60,
        height: 50,
      });
    default:
      return zone;
  }
}

function addPlaced(
  placedItems: AuraPlacedItem[],
  item: AuraLayoutItem | null | undefined,
  zone: ZoneSpec,
  variant: string,
) {
  if (!item) return;
  placedItems.push(zoneToPlacedItem(item, variantZone(zone, variant)));
}

function addAccessoryZones(
  placedItems: AuraPlacedItem[],
  items: ClassifiedItems,
  variant: string,
) {
  const placedAccessoryKeys = new Set<string>();
  const addUnique = (item: AuraLayoutItem | null, zone: ZoneSpec) => {
    if (!item || placedAccessoryKeys.has(item.key)) return;
    placedAccessoryKeys.add(item.key);
    addPlaced(placedItems, item, zone, variant);
  };
  const chain = items.accessories.find(isNecklaceAccessory) ?? null;
  const glasses = items.accessories.find(isGlassesAccessory) ?? null;
  const hat = items.accessories.find(isHatAccessory) ?? null;
  const belt = items.accessories.find(isBeltAccessory) ?? null;
  const bag = items.accessories.find(isBagAccessory) ?? null;
  const perfume = items.accessories.find(isPerfumeAccessory) ?? null;

  addUnique(chain, TOP_LEFT_CHAIN);
  addUnique(glasses, TOP_CENTER_GLASSES);
  addUnique(hat, TOP_RIGHT_HAT);
  addUnique(belt, BELT_ZONE);
  addUnique(
    bag,
    bag && isBackpackAccessory(bag)
      ? withZone(BAG_ZONE, { width: 28, height: 30 })
      : BAG_ZONE,
  );
  addUnique(perfume, PERFUME_ZONE);
}

function orderedCoreItems(items: AuraLayoutItem[]) {
  const priority: Record<AuraLayoutRole, number> = {
    outerwear: 0,
    top: 1,
    bottom: 2,
    footwear: 3,
    one_piece: 1,
    accessory: 4,
    unknown: 5,
  };
  return [...items].sort((a, b) => priority[a.role] - priority[b.role]);
}

export function resolveOutfitLayout(
  pieces: BoardPiece[],
  layoutType: OutfitLayoutType,
  variant: string,
): PlacedBoardItem[] {
  const items = classifyItemsFromPieces(pieces);
  const placedItems: AuraPlacedItem[] = [];
  const top = items.top[0] ?? null;
  const secondTop = items.top[1] ?? null;
  const outerwear = items.outerwear[0] ?? null;
  const bottom = items.bottom[0] ?? null;
  const footwear = items.footwear[0] ?? null;
  const onePiece = items.onePiece[0] ?? null;
  const bottomZone = isShortBottom(bottom)
    ? BOTTOM_CENTER_SHORT
    : BOTTOM_CENTER;

  if (layoutType === "classic_full") {
    if (outerwear && top) {
      addPlaced(placedItems, top, LAYERED_SIDE_BY_SIDE.shirt, variant);
      addPlaced(placedItems, outerwear, LAYERED_SIDE_BY_SIDE.jacket, variant);
    } else if (outerwear) {
      addPlaced(placedItems, outerwear, RIGHT_OUTERWEAR, variant);
    } else {
      addPlaced(placedItems, top, LEFT_TOP, variant);
    }
    addPlaced(placedItems, bottom, bottomZone, variant);
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "no_jacket") {
    addPlaced(
      placedItems,
      top,
      withZone(LEFT_TOP, {
        centerX: 30,
        centerY: 32,
        width: 50,
        height: 60,
        slotName: "left-top-alone",
      }),
      variant,
    );
    addPlaced(
      placedItems,
      bottom,
      withZone(BOTTOM_CENTER, {
        centerX: 70,
        centerY: 60,
        width: 50,
        height: 70,
        slotName: "bottom-no-jacket",
      }),
      variant,
    );
    /*addPlaced(placedItems, bottom, BOTTOM_CENTER, variant);*/
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "shorts_outfit") {
    addPlaced(placedItems, top, LEFT_TOP, variant);
    addPlaced(placedItems, bottom, BOTTOM_CENTER_SHORT, variant);
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "layered_tops") {
    addPlaced(placedItems, outerwear, TOP_LEFT_STACKED.jacket, variant);
    addPlaced(placedItems, top, TOP_LEFT_STACKED.hoodie, variant);
    addPlaced(placedItems, secondTop, TOP_LEFT_STACKED.tee, variant);
    addPlaced(placedItems, bottom, BOTTOM_CENTER, variant);
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "dress_centered") {
    addPlaced(placedItems, onePiece, CENTER_TALL, variant);
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "jumpsuit") {
    addPlaced(
      placedItems,
      onePiece,
      withZone(CENTER_TALL, { width: 36, slotName: "jumpsuit" }),
      variant,
    );
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "coord_set") {
    addPlaced(
      placedItems,
      top ?? onePiece,
      withZone(LEFT_TOP, {
        centerX: 24,
        centerY: 30,
        width: 38,
        height: 40,
        slotName: "coord-top",
      }),
      variant,
    );
    addPlaced(placedItems, bottom, BOTTOM_CENTER, variant);
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "abaya_saree") {
    addPlaced(
      placedItems,
      onePiece,
      {
        centerX: 44,
        centerY: 46,
        width: 40,
        height: 82,
        zIndex: 20,
        slotName: "abaya-saree",
        shadowIntensity: 0.96,
      },
      variant,
    );
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "two_items") {
    const ordered = orderedCoreItems([
      ...items.outerwear,
      ...items.top,
      ...items.bottom,
      ...items.footwear,
      ...items.accessories,
      ...items.unknown,
    ]);
    addPlaced(
      placedItems,
      ordered[0],
      {
        centerX: 26,
        centerY: 35,
        width: 44,
        height: 56,
        zIndex: 20,
        slotName: "two-primary",
        shadowIntensity: 0.9,
        rotation: -0.8,
      },
      variant,
    );
    addPlaced(
      placedItems,
      ordered[1],
      {
        centerX: 72,
        centerY: 50,
        width: 36,
        height: 70,
        zIndex: 22,
        slotName: "two-secondary",
        shadowIntensity: 0.88,
        rotation: 1,
      },
      variant,
    );
  } else if (layoutType === "single_item") {
    addPlaced(placedItems, pieces[0], CENTER_WIDE, variant);
  } else if (layoutType === "accessories_heavy") {
    if (outerwear && top) {
      addPlaced(placedItems, top, LAYERED_SIDE_BY_SIDE.shirt, variant);
      addPlaced(placedItems, outerwear, LAYERED_SIDE_BY_SIDE.jacket, variant);
    } else if (outerwear) {
      addPlaced(placedItems, outerwear, RIGHT_OUTERWEAR, variant);
    } else {
      addPlaced(placedItems, top, LEFT_TOP, variant);
    }
    addPlaced(placedItems, bottom, BOTTOM_CENTER, variant);
    addPlaced(placedItems, footwear, BOTTOM_LEFT_SHOES, variant);
    addAccessoryZones(placedItems, items, variant);
  } else if (layoutType === "accessories_only") {
    pieces
      .slice(0, 4)
      .forEach((piece, index) =>
        addPlaced(placedItems, piece, ACCESSORY_ONLY_GRID[index], variant),
      );
  }

  const placedKeys = new Set(placedItems.map((entry) => entry.item.key));
  const fallbackZones = [
    {
      centerX: 50,
      centerY: 46,
      width: 36,
      height: 48,
      zIndex: 25,
      slotName: "fallback-center",
    },
    {
      centerX: 28,
      centerY: 70,
      width: 30,
      height: 34,
      zIndex: 26,
      slotName: "fallback-left",
    },
    {
      centerX: 74,
      centerY: 70,
      width: 30,
      height: 34,
      zIndex: 27,
      slotName: "fallback-right",
    },
  ] satisfies ZoneSpec[];
  pieces
    .filter(
      (piece) =>
        !placedKeys.has(piece.key) &&
        !isSmallAccessory(piece) &&
        (piece.role === "accessory" || piece.role === "unknown"),
    )
    .forEach((piece, index) => {
      addPlaced(
        placedItems,
        piece,
        fallbackZones[index % fallbackZones.length],
        variant,
      );
    });

  return placedItems.sort((a, b) => a.zIndex - b.zIndex);
}

export function buildRenderPlan(
  look: AuraLook,
  itemsById?: Map<string, ClothingItem>,
  options?: { variant?: AuraLayoutVariant },
): AuraRenderPlan {
  const variant = options?.variant ?? "chat";
  const pieces = buildBoardPieces(look, itemsById);
  const layoutType = detectOutfitLayoutType(pieces);
  const placedItems = resolveOutfitLayout(pieces, layoutType, variant);
  const placedKeys = new Set(placedItems.map((entry) => entry.item.key));
  const smallAccessories = pieces.filter(
    (piece) => isSmallAccessory(piece) && !placedKeys.has(piece.key),
  );
  const stripItems = smallAccessories.slice(0, 4);
  const hiddenStripItems =
    layoutType === "accessories_only"
      ? pieces.slice(4)
      : smallAccessories.slice(4);
  const overflowItems = pieces.filter(
    (piece) =>
      !placedKeys.has(piece.key) &&
      !stripItems.some((stripItem) => stripItem.key === piece.key) &&
      !hiddenStripItems.some((hiddenItem) => hiddenItem.key === piece.key),
  );

  const finalPlan: AuraRenderPlan = {
    layoutType,
    variant,
    placedItems,
    stripItems,
    hiddenStripItems,
    overflowItems,
  };

  if (DEBUG_AURA_LAYOUT) {
    console.log("[AURA_LAYOUT]", "render plan", {
      layoutType,
      variant,
      placedItems: finalPlan.placedItems.map((item) => ({
        role: item.item.role,
        itemName: item.item.itemName,
        x: item.leftPct,
        y: item.topPct,
        width: item.widthPct,
        height: item.heightPct,
      })),
      stripCount: finalPlan.stripItems.length,
      hiddenStripCount: finalPlan.hiddenStripItems.length,
      overflowCount: finalPlan.overflowItems.length,
    });
  }

  return finalPlan;
}
