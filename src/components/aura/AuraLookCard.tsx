import React, { memo, useEffect, useMemo } from "react";
import {
  DimensionValue,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";

import type { AppColors } from "@/constants/theme";
import { getItemImageUrl } from "@/src/lib/itemImage";
import {
  getRenderProfile,
  type RenderProfile,
  type RenderSlotType,
} from "@/src/lib/renderProfiles";
import {
  getVisualNormalizationDefaults,
  mergeVisualNormalization,
  type VisualNormalization,
} from "@/src/lib/visualNormalization";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook, AuraLookAction, AuraLookPiece } from "@/src/types/aura";

type AuraItem = AuraLookPiece & {
  id?: string;
  name?: string;
  title?: string;
  brand?: string | null;
  category?: string | null;
  subCategory?: string | null;
  type?: string | null;
  cleanedImageUrl?: string | null;
  image?: string | null;
  visualNormalization?: VisualNormalization | null;
};

type Props = {
  look: AuraLook;
  colors?: AppColors;
  itemsById?: Map<string, ClothingItem>;
  style?: StyleProp<ViewStyle>;
  onAction?: (action: AuraLookAction) => void;
  onPressSave?: () => void;
  onPressPlan?: () => void;
};

type AccessorySlots = {
  headwear?: AuraItem | null;
  glasses?: AuraItem | null;
  chain?: AuraItem | null;
  watch?: AuraItem | null;
  bracelet?: AuraItem | null;
  bag?: AuraItem | null;
};

type BoardSlots = {
  top?: AuraItem | null;
  outerwear?: AuraItem | null;
  bottom?: AuraItem | null;
  footwear?: AuraItem | null;
  accessories: AccessorySlots;
};

type UpperLayoutMode = "single-upper" | "layered-upper";

type RectMetrics = {
  left: string;
  top?: string;
  bottom?: string;
  width: string;
  height: string;
  zIndex?: number;
};

const BOARD_MAX_WIDTH = 760;
const BOARD_MIN_HEIGHT = 500;
const BOARD_HEIGHT_RATIO = 1.0;

const ACCESSORY_ORDER: (keyof AccessorySlots)[] = [
  "headwear",
  "glasses",
  "chain",
  "watch",
  "bracelet",
  "bag",
];

const DEBUG_AURA_BOARD =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_BOARD_DEBUG === "1";

function firstNonEmpty<T>(...values: (T | null | undefined)[]): T | undefined {
  return values.find(Boolean) as T | undefined;
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getItemLabel(item?: AuraItem | null) {
  return item?.itemName ?? item?.name ?? item?.title ?? "";
}

function toAuraItem(
  piece: AuraLookPiece,
  itemsById?: Map<string, ClothingItem>,
) {
  const sourceItem =
    piece.itemId && itemsById ? (itemsById.get(piece.itemId) ?? null) : null;

  return {
    ...piece,
    id: piece.itemId ?? undefined,
    name: piece.itemName,
    brand: sourceItem?.brand ?? null,
    category: sourceItem?.category ?? null,
    subCategory: sourceItem?.subCategory ?? null,
    type: sourceItem?.type ?? null,
    cleanedImageUrl:
      getItemImageUrl(sourceItem, { variant: "hero" }) ??
      getItemImageUrl(sourceItem, { variant: "thumb" }) ??
      null,
    imageUrl: piece.imageUrl ?? sourceItem?.photoUrl ?? null,
    image: sourceItem?.photoUri ?? null,
    visualNormalization: sourceItem?.visualNormalization ?? null,
  } satisfies AuraItem;
}

function getImageSourceForBoardItem(item?: AuraItem | null) {
  const uri = firstNonEmpty(item?.cleanedImageUrl, item?.imageUrl, item?.image);
  return uri ? { uri } : null;
}

function isTop(item: AuraItem) {
  const c = normalizeText(item.category);
  const s = normalizeText(item.subCategory);
  const t = normalizeText(item.type);

  return (
    c === "tops" ||
    [
      "shirt",
      "t-shirt",
      "tee",
      "polo",
      "top",
      "button_down",
      "button-down",
      "henley",
    ].includes(s) ||
    ["shirt", "tshirt", "tee", "polo", "top"].includes(t)
  );
}

function isOuterwear(item: AuraItem) {
  const c = normalizeText(item.category);
  const s = normalizeText(item.subCategory);
  const t = normalizeText(item.type);

  return (
    c === "outerwear" ||
    ["jacket", "coat", "overshirt", "blazer", "hoodie", "cardigan"].includes(
      s,
    ) ||
    ["jacket", "coat", "overshirt", "blazer", "hoodie"].includes(t)
  );
}

function isBottom(item: AuraItem) {
  const c = normalizeText(item.category);
  const s = normalizeText(item.subCategory);
  const t = normalizeText(item.type);

  return (
    c === "bottoms" ||
    ["jeans", "pants", "trousers", "cargo", "shorts"].includes(s) ||
    ["jeans", "pants", "trousers", "shorts"].includes(t)
  );
}

function isFootwear(item: AuraItem) {
  const c = normalizeText(item.category);
  const s = normalizeText(item.subCategory);
  const t = normalizeText(item.type);

  return (
    c === "footwear" ||
    [
      "shoe",
      "shoes",
      "sneaker",
      "sneakers",
      "loafer",
      "derby",
      "boot",
      "sandals",
      "formal_shoe",
    ].includes(s) ||
    ["shoe", "sneaker", "loafer", "boot"].includes(t)
  );
}

function classifyAccessory(item: AuraItem): keyof AccessorySlots | null {
  const c = normalizeText(item.category);
  const s = normalizeText(item.subCategory);
  const t = normalizeText(item.type);
  const joined = `${c} ${s} ${t}`;

  if (
    joined.includes("cap") ||
    joined.includes("hat") ||
    joined.includes("headwear")
  ) {
    return "headwear";
  }

  if (
    joined.includes("glasses") ||
    joined.includes("sunglasses") ||
    joined.includes("eyewear")
  ) {
    return "glasses";
  }

  if (joined.includes("chain") || joined.includes("necklace")) {
    return "chain";
  }

  if (joined.includes("watch")) {
    return "watch";
  }

  if (joined.includes("bracelet") || joined.includes("bangle")) {
    return "bracelet";
  }

  if (
    joined.includes("bag") ||
    joined.includes("crossbody") ||
    joined.includes("tote") ||
    joined.includes("backpack")
  ) {
    return "bag";
  }

  return null;
}

function dedupeItems(items: AuraItem[]) {
  const seen = new Set<string>();
  const out: AuraItem[] = [];

  for (const item of items) {
    const key =
      item.id ||
      `${getItemLabel(item)}|${item.category}|${item.subCategory}|${item.cleanedImageUrl}|${item.imageUrl}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function resolveAuraBoardSlots(
  look: AuraLook,
  itemsById?: Map<string, ClothingItem>,
): BoardSlots {
  const pool = dedupeItems(
    (look.pieces ?? []).map((piece) => toAuraItem(piece, itemsById)),
  );

  const slots: BoardSlots = {
    accessories: {},
  };

  for (const item of pool) {
    if (!slots.top && isTop(item)) {
      slots.top = item;
      continue;
    }

    if (!slots.outerwear && isOuterwear(item)) {
      slots.outerwear = item;
      continue;
    }

    if (!slots.bottom && isBottom(item)) {
      slots.bottom = item;
      continue;
    }

    if (!slots.footwear && isFootwear(item)) {
      slots.footwear = item;
      continue;
    }

    const accessoryType = classifyAccessory(item);
    if (accessoryType && !slots.accessories[accessoryType]) {
      slots.accessories[accessoryType] = item;
    }
  }

  return slots;
}

function getUpperLayoutMode(slots: BoardSlots): UpperLayoutMode {
  return slots.outerwear ? "layered-upper" : "single-upper";
}

function getBoardPieceMetrics(mode: UpperLayoutMode): {
  top: RectMetrics;
  outerwear?: RectMetrics;
  bottom: RectMetrics;
  footwear?: RectMetrics;
  accessoryBand: RectMetrics;
} {
  /*const bottom: RectMetrics = {
    left: "38%",
    top: "24%",
    width: "24%",
    height: "38%",
    zIndex: 2,
  };*/

  const footwear: RectMetrics = {
    left: "38%",
    bottom: "18%",
    width: "24%",
    height: "8%",
    zIndex: 5,
  };

  const accessoryBand: RectMetrics = {
    left: "10%",
    top: "85%",
    width: "84%",
    height: "12%",
    zIndex: 4,
  };

  if (mode === "single-upper") {
    return {
      top: {
        left: "28%",
        top: "3%",
        width: "44%",
        height: "30%",
        zIndex: 1,
      },
      bottom: {
        left: "38%",
        top: "30%",
        width: "24%",
        height: "40%",
        zIndex: 2,
      },
      footwear,
      accessoryBand,
    };
  }

  return {
    top: {
      left: "26%",
      top: "5%",
      width: "26%",
      height: "30%",
      zIndex: 1,
    },
    outerwear: {
      left: "45%",
      top: "4%",
      width: "30%",
      height: "32%",
      zIndex: 3,
    },
    bottom: {
      left: "38%",
      top: "31%",
      width: "24%",
      height: "41%",
      zIndex: 2,
    },
    footwear,
    accessoryBand,
  };
}

function getAccessoryRailMetrics(accessories: AccessorySlots) {
  return ACCESSORY_ORDER.filter((key) => Boolean(accessories[key])).map(
    (key) => ({
      key,
      item: accessories[key] as AuraItem,
    }),
  );
}

const SLOT_NORMALIZATION_DEFAULTS: Record<
  RenderSlotType,
  { scale: number; translateY: number }
> = {
  top: { scale: 1, translateY: 0 },
  outerwear: { scale: 1.01, translateY: -2 },
  bottom: { scale: 1, translateY: 0 },
  footwear: { scale: 0.98, translateY: 4 },
  accessory: { scale: 1, translateY: 0 },
};

type BoardImageCompensation = {
  profile: RenderProfile;
  scale: number;
  translateY: number;
  usedItemLevelNormalization: boolean;
  clamped: boolean;
};

function getBoardImageCompensation(
  item: AuraItem | null | undefined,
  slotKind: RenderSlotType,
): BoardImageCompensation {
  const slotDefaults = SLOT_NORMALIZATION_DEFAULTS[slotKind];
  const profile = getRenderProfile({
    category: item?.category,
    subCategory: item?.subCategory,
    type: item?.type,
  });
  const normalization = mergeVisualNormalization(
    getVisualNormalizationDefaults({
      category: item?.category,
      subCategory: item?.subCategory,
      type: item?.type,
    }),
    item?.visualNormalization,
  );

  const rawScale =
    slotDefaults.scale *
    (profile.defaultScale ?? 1) *
    (normalization.recommendedScale ?? 1);
  const minScale = profile.minScale ?? 0.8;
  const maxScale = profile.maxScale ?? 1.2;
  const scale = Number(clamp(rawScale, minScale, maxScale).toFixed(3));

  const rawTranslateY =
    slotDefaults.translateY +
    (profile.defaultTranslateY ?? 0) +
    (normalization.recommendedTranslateY ?? 0);
  const translateY = Math.round(clamp(rawTranslateY, -20, 20));

  return {
    profile,
    scale,
    translateY,
    usedItemLevelNormalization: Boolean(item?.visualNormalization),
    clamped: scale !== Number(rawScale.toFixed(3)) || translateY !== Math.round(rawTranslateY),
  };
}

function getDebugBoardEntry(input: {
  item?: AuraItem | null;
  slotType: RenderSlotType;
  compensation: BoardImageCompensation;
}) {
  return {
    piece: getItemLabel(input.item) || "(unnamed)",
    profile: normalizeText(input.item?.subCategory) || normalizeText(input.item?.type) || "generic",
    chosenSlotType: input.slotType,
    finalScale: input.compensation.scale,
    finalTranslateY: input.compensation.translateY,
    usedItemLevelNormalization: input.compensation.usedItemLevelNormalization,
    clamped: input.compensation.clamped,
  };
}

function getRectStyle(metrics: RectMetrics): ViewStyle {
  return {
    left: metrics.left as DimensionValue,
    ...(metrics.top ? { top: metrics.top as DimensionValue } : {}),
    ...(metrics.bottom ? { bottom: metrics.bottom as DimensionValue } : {}),
    width: metrics.width as DimensionValue,
    height: metrics.height as DimensionValue,
    zIndex: metrics.zIndex ?? 1,
  };
}

function BoardImage({
  item,
  metrics,
  slotKind,
}: {
  item?: AuraItem | null;
  metrics: RectMetrics;
  slotKind: RenderSlotType;
}) {
  const source = getImageSourceForBoardItem(item);
  if (!item || !source) return null;
  const compensation = getBoardImageCompensation(item, slotKind);

  return (
    <View
      style={[
        styles.absolutePiece,
        getRectStyle(metrics),
      ]}
      pointerEvents="none"
    >
      <Image
        source={source}
        resizeMode="contain"
        style={[
          styles.image,
          {
            transform: [
              { translateY: compensation.translateY },
              { scale: compensation.scale },
            ],
          },
        ]}
      />
    </View>
  );
}

export const AuraLookCard = memo(function AuraLookCard({
  look,
  itemsById,
  style,
  onAction,
  onPressSave,
  onPressPlan,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();

  const boardWidth = Math.min(screenWidth - 24, BOARD_MAX_WIDTH);
  const boardHeight = Math.max(
    Math.round(boardWidth * BOARD_HEIGHT_RATIO),
    BOARD_MIN_HEIGHT,
  );

  const slots = useMemo(
    () => resolveAuraBoardSlots(look, itemsById),
    [look, itemsById],
  );
  const upperLayoutMode = useMemo(() => getUpperLayoutMode(slots), [slots]);
  const metrics = useMemo(
    () => getBoardPieceMetrics(upperLayoutMode),
    [upperLayoutMode],
  );
  const accessoryRail = useMemo(
    () => getAccessoryRailMetrics(slots.accessories),
    [slots.accessories],
  );

  const debugEntries = useMemo(() => {
    if (!DEBUG_AURA_BOARD) return [];

    const entries = [
      slots.top
        ? getDebugBoardEntry({
            item: slots.top,
            slotType: "top",
            compensation: getBoardImageCompensation(slots.top, "top"),
          })
        : null,
      slots.outerwear
        ? getDebugBoardEntry({
            item: slots.outerwear,
            slotType: "outerwear",
            compensation: getBoardImageCompensation(slots.outerwear, "outerwear"),
          })
        : null,
      slots.bottom
        ? getDebugBoardEntry({
            item: slots.bottom,
            slotType: "bottom",
            compensation: getBoardImageCompensation(slots.bottom, "bottom"),
          })
        : null,
      slots.footwear
        ? getDebugBoardEntry({
            item: slots.footwear,
            slotType: "footwear",
            compensation: getBoardImageCompensation(slots.footwear, "footwear"),
          })
        : null,
      ...accessoryRail.map((entry) =>
        getDebugBoardEntry({
          item: entry.item,
          slotType: "accessory",
          compensation: getBoardImageCompensation(entry.item, "accessory"),
        }),
      ),
    ].filter(Boolean);

    return entries;
  }, [accessoryRail, slots.bottom, slots.footwear, slots.outerwear, slots.top]);

  useEffect(() => {
    if (!DEBUG_AURA_BOARD || !debugEntries.length) return;
    console.log("[AuraLookCard] board rendering decisions", debugEntries);
  }, [debugEntries]);

  return (
    <View style={[styles.card, style]}>
      {!!look.lookTitle && <Text style={styles.title}>{look.lookTitle}</Text>}

      {!!look.shortExplanation && (
        <Text numberOfLines={2} style={styles.subtitle}>
          {look.shortExplanation}
        </Text>
      )}

      <View style={[styles.board, { width: boardWidth, height: boardHeight }]}>
        <BoardImage item={slots.bottom} metrics={metrics.bottom} slotKind="bottom" />
        <BoardImage item={slots.top} metrics={metrics.top} slotKind="top" />

        {slots.outerwear && metrics.outerwear ? (
          <BoardImage
            item={slots.outerwear}
            metrics={metrics.outerwear}
            slotKind="outerwear"
          />
        ) : null}

        {slots.footwear && metrics.footwear ? (
          <BoardImage
            item={slots.footwear}
            metrics={metrics.footwear}
            slotKind="footwear"
          />
        ) : null}

        {accessoryRail.length ? (
          <View
            pointerEvents="none"
            style={[
              styles.accessoryBand,
              getRectStyle(metrics.accessoryBand),
            ]}
          >
            {accessoryRail.map((entry) => {
              const source = getImageSourceForBoardItem(entry.item);
              if (!source) return null;
              const compensation = getBoardImageCompensation(
                entry.item,
                "accessory",
              );

              const isBag = entry.key === "bag";
              const isChain = entry.key === "chain";

              return (
                <View
                  key={entry.key}
                  style={[
                    styles.accessoryItem,
                    isBag
                      ? styles.accessoryBag
                      : isChain
                        ? styles.accessoryChain
                        : styles.accessoryStandard,
                  ]}
                >
                  <Image
                    source={source}
                    resizeMode="contain"
                    style={[
                      styles.image,
                      {
                        transform: [
                          { translateY: compensation.translateY },
                          { scale: compensation.scale },
                        ],
                      },
                    ]}
                  />
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      <View style={styles.metaBlock}>
        <Text style={styles.metaLabel}>FROM YOUR CLOSET</Text>
        <Text style={styles.metaText}>
          {(look.fromCloset ?? []).filter(Boolean).join(" · ")}
        </Text>
      </View>

      {!!look.stylingNote && (
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>STYLING NOTE</Text>
          <Text style={styles.metaText}>{look.stylingNote}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionButton, styles.primaryButton]}
          onPress={
            onPressSave ?? (onAction ? () => onAction("saveLook") : undefined)
          }
        >
          <Text style={styles.primaryButtonText}>Save look</Text>
        </Pressable>

        <Pressable
          style={[styles.actionButton, styles.secondaryButton]}
          onPress={
            onPressPlan ??
            (onAction ? () => onAction("planForToday") : undefined)
          }
        >
          <Text style={styles.secondaryButtonText}>Plan for today</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  title: {
    color: "#F7F8FA",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: "rgba(235,240,248,0.78)",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
  },
  board: {
    alignSelf: "center",
    position: "relative",
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#ECECEE",
  },
  absolutePiece: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
  },
  accessoryBand: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 18,
  },
  accessoryItem: {
    justifyContent: "flex-end",
    alignItems: "center",
  },
  accessoryStandard: {
    width: "15%",
    height: "100%",
  },
  accessoryChain: {
    width: "16%",
    height: "86%",
    marginBottom: 6,
  },
  accessoryBag: {
    width: "18%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  metaBlock: {
    gap: 8,
  },
  metaLabel: {
    color: "#7CC4FF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.1,
  },
  metaText: {
    color: "#EAF0F6",
    fontSize: 16,
    lineHeight: 28,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: 14,
  },
  actionButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButton: {
    backgroundColor: "rgba(83, 174, 255, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(124, 196, 255, 0.18)",
  },
  secondaryButton: {
    backgroundColor: "rgba(12, 18, 30, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  primaryButtonText: {
    color: "#F6FAFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButtonText: {
    color: "#F6FAFF",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default AuraLookCard;
