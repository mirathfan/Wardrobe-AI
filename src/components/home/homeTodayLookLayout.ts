import type { ResponsiveSizeCategory } from "@/src/constants/layout";

export type HomeTodayLookSlot = "outerwear" | "top" | "bottom" | "shoes";
export type HomeTodayLookRole = "outerwear" | "top" | "bottom" | "footwear";
export type HomeTodayLookSlotInput = HomeTodayLookSlot | string;

type ImageFrame = {
  width: `${number}%`;
  height: `${number}%`;
};

export const TOP_TILE_HEIGHT: Record<ResponsiveSizeCategory, number> = {
  compact: 132,
  regular: 144,
  large: 152,
};

export const BOTTOM_TILE_HEIGHT: Record<ResponsiveSizeCategory, number> = {
  compact: 134,
  regular: 146,
  large: 154,
};

export const FOOTWEAR_TILE_HEIGHT: Record<ResponsiveSizeCategory, number> = {
  compact: 70,
  regular: 78,
  large: 84,
};

export const OUTERWEAR_TILE_HEIGHT: Record<ResponsiveSizeCategory, number> = {
  compact: 132,
  regular: 144,
  large: 152,
};

const TILE_BASIS = "47.5%" as const;
const FOOTWEAR_SUPPORTING_BASIS = "43%" as const;
const DEFAULT_TILE_GAP = 8;

const IMAGE_FRAMES: Record<HomeTodayLookRole, ImageFrame> = {
  outerwear: { width: "94%", height: "92%" },
  top: { width: "94%", height: "92%" },
  bottom: { width: "92%", height: "96%" },
  footwear: { width: "92%", height: "68%" },
};

export const THREE_ITEM_NO_OUTERWEAR_LAYOUT = {
  gap: DEFAULT_TILE_GAP,
  leftColumnFlex: 1,
  rightColumnFlex: 1,
  topTileHeight: TOP_TILE_HEIGHT,
  shoeTileHeight: FOOTWEAR_TILE_HEIGHT,
  bottomTileHeightMultiplier: 1,
  topImageScale: { width: "94%", height: "92%" } satisfies ImageFrame,
  pantsImageScale: { width: "84%", height: "82%" } satisfies ImageFrame,
  shoeImageScale: { width: "92%", height: "68%" } satisfies ImageFrame,
} as const;

export type HomeTodayLookTileLayout = {
  slot: HomeTodayLookSlot;
  role: HomeTodayLookRole;
  height: number;
  flexBasis: `${number}%`;
  flexGrow: number;
  imageFrame?: ImageFrame;
};

export type HomeTodayLookPreviewRow = {
  key: string;
  alignItems: "flex-end" | "stretch";
  tiles: HomeTodayLookTileLayout[];
};

export type HomeTodayLookPreviewColumn = {
  key: string;
  flex: number;
  tiles: HomeTodayLookTileLayout[];
};

export type HomeTodayLookPreviewLayout =
  | {
      kind: "rows";
      key: "standard";
      gap: number;
      rows: HomeTodayLookPreviewRow[];
    }
  | {
      kind: "splitColumns";
      key: "three-item-no-outerwear";
      gap: number;
      columns: HomeTodayLookPreviewColumn[];
    };

const ROLE_PATTERNS: Record<HomeTodayLookRole, RegExp> = {
  outerwear: /\b(outerwear|jacket|coat|hoodie|blazer|cardigan|overshirt|shacket|parka|puffer|trench)\b/i,
  top: /\b(top|shirt|button[-\s]?up|polo|tee|t[-\s]?shirt|tank|sweater|knit)\b/i,
  bottom: /\b(bottom|pants|trousers|jeans|shorts|skirt|chinos|slacks)\b/i,
  footwear: /\b(footwear|shoes?|sneakers?|loafers?|boots?|sandals?|heels?)\b/i,
};

export function homeTodayLookRoleForSlot(slot: HomeTodayLookSlot): HomeTodayLookRole {
  return slot === "shoes" ? "footwear" : slot;
}

export function normalizeHomeTodayLookSlot(value: unknown): HomeTodayLookSlot | null {
  const text = String(value ?? "").replace(/[_-]+/g, " ").trim().toLowerCase();
  if (!text) return null;
  if (ROLE_PATTERNS.outerwear.test(text)) return "outerwear";
  if (ROLE_PATTERNS.footwear.test(text)) return "shoes";
  if (ROLE_PATTERNS.bottom.test(text)) return "bottom";
  if (ROLE_PATTERNS.top.test(text)) return "top";
  return null;
}

function normalizeSlots(slots: HomeTodayLookSlotInput[]) {
  const out: HomeTodayLookSlot[] = [];
  const seen = new Set<HomeTodayLookSlot>();
  for (const slot of slots) {
    const normalized = normalizeHomeTodayLookSlot(slot);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function getHomeTodayLookTileHeight(
  slot: HomeTodayLookSlot,
  screenSize: ResponsiveSizeCategory,
) {
  const role = homeTodayLookRoleForSlot(slot);
  if (role === "outerwear") return OUTERWEAR_TILE_HEIGHT[screenSize];
  if (role === "bottom") return BOTTOM_TILE_HEIGHT[screenSize];
  if (role === "footwear") return FOOTWEAR_TILE_HEIGHT[screenSize];
  return TOP_TILE_HEIGHT[screenSize];
}

export function getHomeTodayLookImageFrame(slot: HomeTodayLookSlot) {
  return IMAGE_FRAMES[homeTodayLookRoleForSlot(slot)];
}

function tileLayout(
  slot: HomeTodayLookSlot,
  screenSize: ResponsiveSizeCategory,
  options?: { flexBasis?: `${number}%`; flexGrow?: number; height?: number; imageFrame?: ImageFrame },
): HomeTodayLookTileLayout {
  return {
    slot,
    role: homeTodayLookRoleForSlot(slot),
    height: options?.height ?? getHomeTodayLookTileHeight(slot, screenSize),
    flexBasis: options?.flexBasis ?? TILE_BASIS,
    flexGrow: options?.flexGrow ?? 1,
    imageFrame: options?.imageFrame,
  };
}

function shouldUseThreeItemNoOuterwearLayout(slots: HomeTodayLookSlot[]) {
  const available = new Set(slots);
  return (
    slots.length === 3 &&
    !available.has("outerwear") &&
    available.has("top") &&
    available.has("bottom") &&
    available.has("shoes")
  );
}

function buildThreeItemNoOuterwearLayout(
  screenSize: ResponsiveSizeCategory,
): HomeTodayLookPreviewLayout {
  const topHeight = THREE_ITEM_NO_OUTERWEAR_LAYOUT.topTileHeight[screenSize];
  const shoeHeight = THREE_ITEM_NO_OUTERWEAR_LAYOUT.shoeTileHeight[screenSize];
  const bottomHeight = Math.round(
    (topHeight + THREE_ITEM_NO_OUTERWEAR_LAYOUT.gap + shoeHeight) *
      THREE_ITEM_NO_OUTERWEAR_LAYOUT.bottomTileHeightMultiplier,
  );

  return {
    kind: "splitColumns",
    key: "three-item-no-outerwear",
    gap: THREE_ITEM_NO_OUTERWEAR_LAYOUT.gap,
    columns: [
      {
        key: "top-footwear",
        flex: THREE_ITEM_NO_OUTERWEAR_LAYOUT.leftColumnFlex,
        tiles: [
          tileLayout("top", screenSize, {
            height: topHeight,
            imageFrame: THREE_ITEM_NO_OUTERWEAR_LAYOUT.topImageScale,
          }),
          tileLayout("shoes", screenSize, {
            height: shoeHeight,
            imageFrame: THREE_ITEM_NO_OUTERWEAR_LAYOUT.shoeImageScale,
          }),
        ],
      },
      {
        key: "bottom-span",
        flex: THREE_ITEM_NO_OUTERWEAR_LAYOUT.rightColumnFlex,
        tiles: [
          tileLayout("bottom", screenSize, {
            height: bottomHeight,
            imageFrame: THREE_ITEM_NO_OUTERWEAR_LAYOUT.pantsImageScale,
          }),
        ],
      },
    ],
  };
}

export function buildHomeTodayLookPreviewRows(
  slots: HomeTodayLookSlotInput[],
  screenSize: ResponsiveSizeCategory,
): HomeTodayLookPreviewRow[] {
  const normalizedSlots = normalizeSlots(slots);
  const available = new Set(normalizedSlots);
  const hasOuterwear = available.has("outerwear");
  const rows: HomeTodayLookPreviewRow[] = [];

  if (hasOuterwear) {
    const upperHeight = Math.max(TOP_TILE_HEIGHT[screenSize], OUTERWEAR_TILE_HEIGHT[screenSize]);
    const upperTiles = (["top", "outerwear"] as const)
      .filter((slot) => available.has(slot))
      .map((slot) => tileLayout(slot, screenSize, {
        height: upperHeight,
        flexBasis: TILE_BASIS,
        flexGrow: 1,
      }));
    if (upperTiles.length) {
      rows.push({ key: "top-outerwear", alignItems: "stretch", tiles: upperTiles });
    }

    const lowerTiles = (["bottom", "shoes"] as const)
      .filter((slot) => available.has(slot))
      .map((slot) =>
        tileLayout(slot, screenSize, {
          flexBasis: slot === "shoes" ? FOOTWEAR_SUPPORTING_BASIS : TILE_BASIS,
          flexGrow: slot === "shoes" ? 0.72 : 1.28,
        })
      );
    if (lowerTiles.length) {
      rows.push({ key: "bottom-footwear", alignItems: "flex-end", tiles: lowerTiles });
    }
    return rows;
  }

  const heroTiles = (["top", "bottom"] as const)
    .filter((slot) => available.has(slot))
    .map((slot) => tileLayout(slot, screenSize, {
      flexBasis: TILE_BASIS,
      flexGrow: 1,
    }));
  if (heroTiles.length) {
    rows.push({ key: "top-bottom", alignItems: "flex-end", tiles: heroTiles });
  }

  if (available.has("shoes")) {
    rows.push({
      key: "supporting-footwear",
      alignItems: "flex-end",
      tiles: [
        tileLayout("shoes", screenSize, {
          flexBasis: FOOTWEAR_SUPPORTING_BASIS,
          flexGrow: 0,
        }),
      ],
    });
  }

  return rows;
}

export function buildHomeTodayLookPreviewLayout(
  slots: HomeTodayLookSlotInput[],
  screenSize: ResponsiveSizeCategory,
): HomeTodayLookPreviewLayout {
  const normalizedSlots = normalizeSlots(slots);
  if (shouldUseThreeItemNoOuterwearLayout(normalizedSlots)) {
    return buildThreeItemNoOuterwearLayout(screenSize);
  }
  return {
    kind: "rows",
    key: "standard",
    gap: DEFAULT_TILE_GAP,
    rows: buildHomeTodayLookPreviewRows(normalizedSlots, screenSize),
  };
}
