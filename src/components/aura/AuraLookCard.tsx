import AppImage from "@/src/components/common/AppImage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { memo, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageStyle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { auraColors, type AppColors } from "@/constants/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { ItemDetailSheet } from "@/src/components/aura/ItemDetailSheet";
import { AccessoryStrip } from "@/src/components/outfit/AccessoryStrip";
import {
  ACTION_GAP,
  CHIP_BORDER_WIDTH,
  CHIP_HEIGHT,
  CHIP_HORIZONTAL_PADDING,
  CTA_HEIGHT,
  CTA_HORIZONTAL_PADDING,
  HOME_CTA_HEIGHT,
  PILL_RADIUS,
} from "@/src/constants/auraControls";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  buildRenderPlan,
  type AuraLayoutItem,
  type AuraLayoutVariant,
} from "@/src/lib/auraLookLayouts";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type {
  AuraLook,
  AuraLookAction,
  AuraLookOptionMeta,
} from "@/src/types/aura";

type Props = {
  look: AuraLook;
  colors?: AppColors;
  itemsById?: Map<string, ClothingItem>;
  style?: StyleProp<ViewStyle>;
  onAction?: (
    action: AuraLookAction,
    look: AuraLook,
    option?: AuraLookOptionMeta,
  ) => void;
  onPressSave?: () => void;
  onPressPlan?: () => void;
  onPressRegenerate?: () => void;
  regenerating?: boolean;
  option?: AuraLookOptionMeta | null;
  viewportWidth?: number;
  hideActions?: boolean;
  compact?: boolean;
  swipeVariant?: boolean;
  boardVariant?: AuraLayoutVariant;
  boardOnly?: boolean;
};

const BOARD_MAX_WIDTH = 760;
const HOME_BOARD_MAX_WIDTH = 520;
const BOARD_ASPECT_RATIO = 1;
const HOME_BOARD_ASPECT_RATIO = 0.72;
const ACTION_HIT_SLOP = 6;

type AccessoryImageSlot =
  | "top-left-chain"
  | "top-center-glasses"
  | "top-right-hat"
  | "belt-zone"
  | "bag-zone"
  | "perfume-zone"
  | "accessory-grid-1"
  | "accessory-grid-2"
  | "accessory-grid-3"
  | "accessory-grid-4";

type AccessoryImageVariant = AuraLayoutVariant | "default";
type AccessoryImageStyle = Pick<ImageStyle, "width" | "height">;

// Layout zones control placement/container size; this map only controls how accessory images fill those zones.
// Keep home tunings separate so landscape boards can size belts/glasses/bags without affecting chat boards.
const ACCESSORY_IMAGE_STYLE_BY_VARIANT: Partial<
  Record<
    AccessoryImageVariant,
    Partial<Record<AccessoryImageSlot, AccessoryImageStyle>>
  >
> = {
  default: {
    "top-left-chain": { width: "100%", height: "100%" },
    "top-center-glasses": { width: "100%", height: "100%" },
    "top-right-hat": { width: "100%", height: "100%" },
    "belt-zone": { width: "20%", height: "420%" },
    "bag-zone": { width: "100%", height: "100%" },
    "perfume-zone": { width: "100%", height: "100%" },
    "accessory-grid-1": { width: "100%", height: "100%" },
    "accessory-grid-2": { width: "100%", height: "100%" },
    "accessory-grid-3": { width: "100%", height: "100%" },
    "accessory-grid-4": { width: "100%", height: "100%" },
  },
  home: {
    "top-left-chain": { width: "100%", height: "100%" },
    "top-center-glasses": { width: "150%", height: "150%" },
    "top-right-hat": { width: "100%", height: "100%" },
    "belt-zone": { width: "700%", height: "700%" },
    "bag-zone": { width: "100%", height: "100%" },
    "perfume-zone": { width: "100%", height: "100%" },
    "accessory-grid-1": { width: "100%", height: "100%" },
    "accessory-grid-2": { width: "100%", height: "100%" },
    "accessory-grid-3": { width: "100%", height: "100%" },
    "accessory-grid-4": { width: "100%", height: "100%" },
  },
};

function firstNonEmpty<T>(...values: (T | null | undefined)[]): T | undefined {
  return values.find(Boolean) as T | undefined;
}

function getAccessoryImageStyle(
  variant: AuraLayoutVariant,
  slotName: string,
  item?: AuraLayoutItem | null,
): AccessoryImageStyle | null {
  if (item?.role !== "accessory") return null;
  const slot = slotName as AccessoryImageSlot;
  return (
    ACCESSORY_IMAGE_STYLE_BY_VARIANT[variant]?.[slot] ??
    ACCESSORY_IMAGE_STYLE_BY_VARIANT.default?.[slot] ??
    null
  );
}

function getImageSourceForBoardItem(item?: AuraLayoutItem | null) {
  const uri = firstNonEmpty(item?.image, item?.cleanedImageUrl, item?.imageUrl);
  return uri ? { uri } : null;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function cleanShortLabel(value?: string | null) {
  const normalized = (value ?? "")
    .replace(/\bdirection\b/gi, "")
    .replace(/\blook\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";

  return titleCase(
    normalized
      .split(/[,/]/g)
      .flatMap((part) => part.trim().split(/\s+/))
      .filter(Boolean)
      .slice(0, 3)
      .join(" "),
    );
}

function normalizeLabelForComparison(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDirectionLabel(...values: (string | null | undefined)[]) {
  const joined = values.filter(Boolean).join(" ").toLowerCase();
  if (joined.includes("safe")) return "Safe";
  if (joined.includes("balanced")) return "Balanced";
  if (joined.includes("bold")) return "Bold";
  return "";
}

function shouldShowVibeLabel(
  vibeLabel: string,
  directionLabel: string,
) {
  if (!vibeLabel) return false;
  if (!directionLabel) return true;

  const normalizedVibe = normalizeLabelForComparison(vibeLabel);
  const normalizedDirection = normalizeLabelForComparison(directionLabel);

  if (normalizedVibe === normalizedDirection) return false;
  if (normalizedVibe.startsWith(`${normalizedDirection} `)) return false;
  if (
    normalizedVibe.includes(normalizedDirection) &&
    normalizedVibe.includes("closet")
  ) {
    return false;
  }

  return true;
}

function looksLikeRawOutfitTitle(value?: string | null) {
  const title = (value ?? "").trim();
  if (!title) return true;
  if (title.length > 34) return true;
  if (/[,:;]/.test(title)) return true;
  if (title.split(/\s+/).length > 4) return true;
  return /\b(shirt|tee|t-shirt|jeans|pants|trousers|sneaker|shoe|loafer|watch|glasses|jacket|hoodie|shorts)\b/i.test(
    title,
  );
}

function deriveEditorialLookTitle(look: AuraLook) {
  const explicit = (look.lookTitle ?? "").trim();
  if (explicit && !looksLikeRawOutfitTitle(explicit)) {
    return titleCase(explicit);
  }
  const base =
    cleanShortLabel(look.vibe) || cleanShortLabel(look.personalizationLabel);
  if (!base) return "Aura Edit";
  if (/\b(reset|edit|uniform|casual)\b/i.test(base)) return base;
  if (base.split(/\s+/).length <= 2) return `${base} Reset`;
  return base;
}

function deriveEditorialSubtitle(look: AuraLook) {
  const source = [
    look.shortExplanation,
    look.stylingNote,
    look.personalizationNote,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return "";
  if (source.length <= 88) return source;
  return `${source.slice(0, 85).trimEnd()}...`;
}

function getItemLabel(item?: AuraLayoutItem | null) {
  return item?.itemName ?? "";
}

function getCategoryPadding(
  category?: string | null,
  subCategory?: string | null,
  accessoryType?: string | null,
) {
  if (!category) return 10;
  const normalizedCategory = String(category).trim().toLowerCase();
  const normalizedSubCategory = String(subCategory ?? "")
    .trim()
    .toLowerCase();
  const normalizedAccessoryType = String(accessoryType ?? "")
    .trim()
    .toLowerCase();
  const accessoryDescriptor = `${normalizedSubCategory} ${normalizedAccessoryType}`;
  const matchesAccessory = (values: string[]) =>
    values.some((value) => accessoryDescriptor.includes(value));

  switch (normalizedCategory) {
    case "top":
      return 10;
    case "outerwear":
      return 8;
    case "bottom":
      return 6;
    case "footwear":
    case "shoes":
      return 8;
    case "one_piece":
      return 6;
    case "accessory":
      if (
        matchesAccessory([
          "bag",
          "backpack",
          "tote_bag",
          "tote",
          "clutch",
          "crossbody",
          "shoulder_bag",
          "mini_bag",
        ])
      )
        return 10;
      if (matchesAccessory(["sunglasses", "glasses"])) return 12;
      if (matchesAccessory(["cap", "hat", "beanie", "bucket_hat"])) return 10;
      if (matchesAccessory(["perfume", "cologne", "fragrance"])) return 10;
      if (
        matchesAccessory([
          "necklace",
          "chain",
          "chain_belt",
          "jewelry",
          "jewellery",
        ])
      )
        return 14;
      if (matchesAccessory(["belt"])) return 4;
      return 12;
    default:
      return 10;
  }
}

function BoardImage({
  item,
  leftPct,
  topPct,
  widthPct,
  heightPct,
  zIndex,
  shadowIntensity,
  rotation,
  slotName,
  layoutVariant,
  animationIndex,
  animationKey,
  reduceMotion,
  onPress,
  homeScale = false,
}: {
  item?: AuraLayoutItem | null;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
  shadowIntensity: number;
  rotation: number;
  slotName: string;
  layoutVariant: AuraLayoutVariant;
  animationIndex: number;
  animationKey: string;
  reduceMotion: boolean;
  onPress: (item: AuraLayoutItem) => void;
  homeScale?: boolean;
}) {
  const source = getImageSourceForBoardItem(item);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 20);
  const accessoryImageStyle = getAccessoryImageStyle(
    layoutVariant,
    slotName,
    item,
  );

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }

    const delay = Math.min(animationIndex, 4) * 80;
    opacity.value = 0;
    translateY.value = 20;
    opacity.value = withDelay(
      delay,
      withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      }),
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [animationIndex, animationKey, opacity, reduceMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!item || !source) return null;

  return (
    <Animated.View
      style={[
        styles.animatedPiece,
        {
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          zIndex,
        },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        hitSlop={16}
        style={[
          styles.absolutePiece,
          Platform.OS === "android" ? styles.absolutePieceAndroid : null,
          {
            padding: homeScale
              ? Math.max(
                  3,
                  getCategoryPadding(
                    item.role,
                    item.subCategory,
                    item.accessoryType,
                  ) - 3,
                )
              : getCategoryPadding(
                  item.role,
                  item.subCategory,
                  item.accessoryType,
                ),
          },
        ]}
        onPress={() => onPress(item)}
      >
        <View
          pointerEvents="none"
          style={[
            styles.photoShadow,
            item.role === "footwear"
              ? styles.photoShadowFootwear
              : styles.photoShadowGarment,
            item.role === "accessory" ? styles.photoShadowAccessory : null,
            {
              opacity:
                item.role === "footwear"
                  ? 0.08 * shadowIntensity
                  : item.role === "accessory"
                    ? 0.04 * shadowIntensity
                    : 0.055 * shadowIntensity,
            },
          ]}
        />
        <AppImage
          source={{
            uri: source.uri,
          }}
          // Accessories still use contain; per-variant width/height only controls visual fill inside the zone.
          resizeMode="contain"
          style={[
            styles.image,
            accessoryImageStyle,
            {
              transform: [{ rotate: `${rotation}deg` }],
            },
          ]}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

export const AuraLookCard = memo(function AuraLookCard({
  look,
  colors: providedColors,
  itemsById,
  style,
  onAction,
  onPressSave,
  onPressPlan,
  onPressRegenerate,
  regenerating = false,
  option,
  viewportWidth,
  hideActions = false,
  compact = false,
  swipeVariant = false,
  boardVariant,
  boardOnly = false,
}: Props) {
  const router = useRouter();
  const { colors: appColors } = useAppTheme();
  const colors = providedColors ?? appColors;
  const { width: screenWidth } = useWindowDimensions();
  const [selectedItem, setSelectedItem] = useState<AuraLayoutItem | null>(null);
  const [closetExpanded, setClosetExpanded] = useState(false);
  const [closetSheetVisible, setClosetSheetVisible] = useState(false);
  const reduceMotion = useReduceMotion();
  const canLikeLook = look.actions.includes("likeLook");
  const canNotMyVibe = look.actions.includes("notMyVibe");
  const canShowMoreLikeThis = look.actions.includes("showMoreLikeThis");
  const canLessLikeThis = look.actions.includes("lessLikeThis");
  const canShopMissingPieces = look.actions.includes("shopMissingPieces");
  const canUseOnlyMyCloset = look.actions.includes("useOnlyMyCloset");
  const canMakeItDressier = look.actions.includes("makeItDressier");

  const effectiveVariant = boardVariant ?? (swipeVariant ? "swipe" : "chat");
  const isStudio = effectiveVariant === "studio";
  const isHome = effectiveVariant === "home";
  const isCondensed = compact || isHome;
  const cardHorizontalPadding =
    isCondensed || swipeVariant || isStudio ? 12 : 14;
  const availableBoardWidth = Math.max(
    1,
    (viewportWidth ?? screenWidth) -
      cardHorizontalPadding * 2 -
      (isHome ? 28 : 0),
  );
  const boardWidth = Math.min(
    availableBoardWidth,
    isHome ? HOME_BOARD_MAX_WIDTH : BOARD_MAX_WIDTH,
  );
  const boardHeight = Math.round(
    boardWidth * (isHome ? HOME_BOARD_ASPECT_RATIO : BOARD_ASPECT_RATIO),
  );
  const displayTitle = deriveEditorialLookTitle(look);
  const displayReason = deriveEditorialSubtitle(look);
  const directionLabel = normalizeDirectionLabel(
    option?.optionLabel,
    look.personalizationLabel,
    look.vibe,
  );
  const vibeLabelSource =
    cleanShortLabel(look.vibe) || cleanShortLabel(look.personalizationLabel);
  const vibeLabel = shouldShowVibeLabel(vibeLabelSource, directionLabel)
    ? vibeLabelSource
    : "";
  const closetItems = useMemo(
    () => Array.from(new Set((look.fromCloset ?? []).filter(Boolean))),
    [look.fromCloset],
  );
  const visibleClosetLimit = isCondensed ? (swipeVariant ? 2 : 3) : 5;
  const visibleClosetItems =
    closetExpanded && !swipeVariant
      ? closetItems
      : closetItems.slice(0, visibleClosetLimit);
  const hiddenClosetCount = Math.max(
    0,
    closetItems.length - visibleClosetLimit,
  );
  const showClosetToggle = closetItems.length > visibleClosetLimit;

  const renderPlan = useMemo(
    () => buildRenderPlan(look, itemsById, { variant: effectiveVariant }),
    [effectiveVariant, itemsById, look],
  );
  const animationKey = useMemo(() => {
    const maybeLookId = (look as AuraLook & { id?: string | null }).id;
    return (
      maybeLookId ??
      `${look.lookTitle}|${look.vibe}|${look.pieces
        .map(
          (piece) =>
            `${piece.itemId ?? piece.itemName}:${piece.role}:${piece.imageUrl ?? ""}`,
        )
        .join("|")}`
    );
  }, [look]);

  useEffect(() => {
    setClosetExpanded(false);
    setClosetSheetVisible(false);
  }, [animationKey]);
  const overflowLabels = Array.from(
    new Set(
      renderPlan.overflowItems
        .map((item) => getItemLabel(item))
        .filter(Boolean),
    ),
  ).slice(0, isCondensed ? 2 : 3);

  const boardContent = (
    <View
      style={[
        styles.board,
        compact ? styles.boardCompact : null,
        isHome ? styles.boardHome : null,
        swipeVariant ? styles.boardSwipe : null,
        isStudio ? styles.boardStudio : null,
        {
          width: boardWidth,
          height: boardHeight,
          backgroundColor: colors.boardLight,
          borderColor: colors.borderWarm,
          shadowColor: colors.ctaCream,
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        },
      ]}
    >
      <AccessoryStrip
        accessories={renderPlan.stripItems}
        hiddenAccessories={renderPlan.hiddenStripItems}
        onItemPress={setSelectedItem}
      />
      {renderPlan.placedItems.map((entry, index) => (
        <BoardImage
          key={entry.key}
          item={entry.item}
          leftPct={entry.leftPct}
          topPct={entry.topPct}
          widthPct={entry.widthPct}
          heightPct={entry.heightPct}
          zIndex={entry.zIndex}
          shadowIntensity={entry.shadowIntensity}
          rotation={entry.rotation}
          slotName={entry.slotName}
          layoutVariant={effectiveVariant}
          animationIndex={index}
          animationKey={animationKey}
          reduceMotion={reduceMotion}
          onPress={setSelectedItem}
          homeScale={isHome}
        />
      ))}
    </View>
  );

  if (boardOnly) {
    return <View style={[styles.boardOnlyCard, style]}>{boardContent}</View>;
  }

  return (
    <View
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        isHome ? styles.cardHome : null,
        swipeVariant ? styles.cardSwipe : null,
        isStudio ? styles.cardStudio : null,
        {
          backgroundColor: isStudio ? colors.surfaceElevated : colors.surface,
          borderColor: isStudio ? colors.purpleBorder : colors.border,
        },
        style,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.labelRow}>
          {!!directionLabel && (
            <View
              style={[
                styles.headerChip,
                isHome ? styles.headerChipHome : null,
                styles.directionChip,
                {
                  backgroundColor: colors.purpleSurface,
                  borderColor: colors.purpleBorder,
                },
              ]}
            >
              <View
                style={[
                  styles.directionDot,
                  isHome ? styles.directionDotHome : null,
                  { backgroundColor: colors.softPurple },
                ]}
              />
              <Text
                style={[
                  styles.directionChipText,
                  { color: colors.lightPurple },
                ]}
              >
                {directionLabel}
              </Text>
            </View>
          )}
          {!!vibeLabel && (
            <View
              style={[
                styles.headerChip,
                isHome ? styles.headerChipHome : null,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.vibeChipText, { color: colors.textSecondary }]}
              >
                {vibeLabel}
              </Text>
            </View>
          )}
        </View>
      </View>

      {boardContent}

      <View
        style={[
          styles.copyBlock,
          isHome ? styles.copyBlockHome : null,
          swipeVariant ? styles.copyBlockSwipe : null,
          isStudio ? styles.copyBlockStudio : null,
        ]}
      >
        {!!displayTitle && (
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              compact ? styles.titleCompact : null,
              isHome ? styles.titleHome : null,
              swipeVariant ? styles.titleSwipe : null,
              { color: colors.textPrimary },
            ]}
          >
            {displayTitle}
          </Text>
        )}

        {!!displayReason && (
          <Text
            numberOfLines={swipeVariant ? 2 : isHome ? 1 : 2}
            style={[
              styles.subtitle,
              compact ? styles.subtitleCompact : null,
              isHome ? styles.subtitleHome : null,
              swipeVariant ? styles.subtitleSwipe : null,
              { color: colors.textSecondary },
            ]}
          >
            {displayReason}
          </Text>
        )}
      </View>

      {!!visibleClosetItems.length && (
        <View style={[styles.metaBlock, isHome ? styles.metaBlockHome : null]}>
          <Text style={[styles.metaLabel, { color: colors.softPurple }]}>
            From your closet
          </Text>
          <View style={styles.closetChips}>
            {visibleClosetItems.map((item, index) => (
              <View
                key={`${look.lookTitle}-${item}-${index}`}
                style={[
                  styles.closetChip,
                  isHome ? styles.closetChipHome : null,
                  {
                    backgroundColor: colors.purpleSurface,
                    borderColor: colors.purpleBorder,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.closetChipText, { color: colors.textPrimary }]}
                >
                  {item}
                </Text>
              </View>
            ))}
            {showClosetToggle ? (
              <AuraPressable
                onPress={() => {
                  if (swipeVariant) {
                    setClosetSheetVisible(true);
                    return;
                  }
                  setClosetExpanded((value) => !value);
                }}
                haptic="selection"
                hapticTrigger="press"
                pressedScale={0.96}
                pressedOpacity={0.88}
                style={[
                  styles.closetChip,
                  isHome ? styles.closetChipHome : null,
                  styles.moreChip,
                  {
                    backgroundColor: colors.purpleSurface,
                    borderColor: colors.purpleBorder,
                  },
                ]}
              >
                <Text
                  style={[styles.closetChipText, { color: colors.lightPurple }]}
                >
                  {closetExpanded ? "Show less" : `+${hiddenClosetCount} more`}
                </Text>
              </AuraPressable>
            ) : null}
          </View>
        </View>
      )}

      <Modal
        visible={closetSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setClosetSheetVisible(false)}
      >
        <View style={styles.closetSheetRoot}>
          <Pressable
            accessibilityLabel="Close closet items"
            style={StyleSheet.absoluteFill}
            onPress={() => setClosetSheetVisible(false)}
          />
          <View
            style={[
              styles.closetSheetCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.closetSheetHeader}>
              <View>
                <Text style={[styles.closetSheetEyebrow, { color: colors.softPurple }]}>
                  From your closet
                </Text>
                <Text style={[styles.closetSheetTitle, { color: colors.textPrimary }]}>
                  Included pieces
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close included pieces"
                onPress={() => setClosetSheetVisible(false)}
                style={[
                  styles.closetSheetClose,
                  {
                    backgroundColor: colors.surfaceSoft,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.closetSheetCloseText, { color: colors.textPrimary }]}>
                  Close
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.closetSheetScroll}
              contentContainerStyle={styles.closetSheetList}
              showsVerticalScrollIndicator={false}
            >
              {closetItems.map((item, index) => (
                <View
                  key={`${look.lookTitle}-sheet-${item}-${index}`}
                  style={[
                    styles.closetSheetRow,
                    {
                      backgroundColor: colors.surfaceSoft,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.closetSheetIndex, { color: colors.softPurple }]}>
                    {String(index + 1).padStart(2, "0")}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.closetSheetItem, { color: colors.textPrimary }]}
                  >
                    {item}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {!!overflowLabels.length && (
        <View style={[styles.metaBlock, isHome ? styles.metaBlockHome : null]}>
          <Text style={[styles.metaLabel, { color: colors.softPurple }]}>
            Also included
          </Text>
          <View style={styles.closetChips}>
            {overflowLabels.map((item) => (
              <View
                key={`${look.lookTitle}-extra-${item}`}
                style={[
                  styles.closetChip,
                  isHome ? styles.closetChipHome : null,
                  {
                    backgroundColor: colors.chipBackground,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.closetChipText, { color: colors.textPrimary }]}
                >
                  {item}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!hideActions ? (
        <View style={[styles.actions, isHome ? styles.actionsHome : null]}>
          <AuraPressable
            hitSlop={ACTION_HIT_SLOP}
            style={[
              styles.actionButton,
              isHome ? styles.actionButtonHome : null,
              styles.primaryButton,
              { backgroundColor: colors.ctaCream, borderColor: "transparent" },
            ]}
            haptic="light"
            hapticTrigger="press"
            pressedScale={0.97}
            pressedOpacity={0.92}
            onPress={
              onPressSave ??
              (onAction
                ? () => onAction("saveLook", look, option ?? undefined)
                : undefined)
            }
          >
            <Text style={[styles.primaryButtonText, { color: colors.ctaText }]}>
              Save look
            </Text>
          </AuraPressable>

          <AuraPressable
            hitSlop={ACTION_HIT_SLOP}
            style={[
              styles.actionButton,
              isHome ? styles.actionButtonHome : null,
              styles.secondaryButton,
              {
                backgroundColor: isHome
                  ? "rgba(9,0,11,0.22)"
                  : colors.surfaceSoft,
                borderColor: "rgba(251,228,216,0.14)",
              },
            ]}
            haptic="light"
            hapticTrigger="press"
            pressedScale={0.97}
            pressedOpacity={0.92}
            onPress={
              onPressPlan ??
              (onAction
                ? () => onAction("planForToday", look, option ?? undefined)
                : undefined)
            }
          >
            <Text
              style={[
                styles.secondaryButtonText,
                { color: colors.textPrimary },
              ]}
            >
              Plan for today
            </Text>
          </AuraPressable>

          {onPressRegenerate ? (
            <AuraPressable
              hitSlop={ACTION_HIT_SLOP}
              disabled={regenerating}
              style={[
                styles.actionButton,
                isHome ? styles.actionButtonHome : null,
                styles.secondaryButton,
                styles.regenerateButton,
                {
                  backgroundColor: isHome
                    ? "rgba(9,0,11,0.22)"
                    : colors.surfaceSoft,
                  borderColor: "rgba(251,228,216,0.14)",
                  opacity: regenerating ? 0.72 : 1,
                },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.97}
              pressedOpacity={0.92}
              onPress={onPressRegenerate}
            >
              {regenerating ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={14}
                  color={colors.textPrimary}
                />
              )}
              <Text
                numberOfLines={1}
                style={[
                  styles.secondaryButtonText,
                  styles.regenerateButtonText,
                  { color: colors.textPrimary },
                ]}
              >
                {regenerating ? "Regenerating" : "Regenerate"}
              </Text>
            </AuraPressable>
          ) : null}
        </View>
      ) : null}

      {!hideActions &&
      (canLikeLook ||
        canNotMyVibe ||
        canShowMoreLikeThis ||
        canLessLikeThis) ? (
        <View
          style={[
            styles.tertiaryActions,
            isHome ? styles.tertiaryActionsHome : null,
          ]}
        >
          {canLikeLook ? (
            <AuraPressable
              hitSlop={ACTION_HIT_SLOP}
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={
                onAction
                  ? () => onAction("likeLook", look, option ?? undefined)
                  : undefined
              }
            >
              <Text
                style={[
                  styles.tertiaryActionText,
                  { color: colors.textSecondary },
                ]}
              >
                Like
              </Text>
            </AuraPressable>
          ) : null}
          {canNotMyVibe ? (
            <AuraPressable
              hitSlop={ACTION_HIT_SLOP}
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={
                onAction
                  ? () => onAction("notMyVibe", look, option ?? undefined)
                  : undefined
              }
            >
              <Text
                style={[
                  styles.tertiaryActionText,
                  { color: colors.textSecondary },
                ]}
              >
                Not my vibe
              </Text>
            </AuraPressable>
          ) : null}
          {canShowMoreLikeThis ? (
            <AuraPressable
              hitSlop={ACTION_HIT_SLOP}
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={
                onAction
                  ? () =>
                      onAction("showMoreLikeThis", look, option ?? undefined)
                  : undefined
              }
            >
              <Text
                style={[
                  styles.tertiaryActionText,
                  { color: colors.textSecondary },
                ]}
              >
                More like this
              </Text>
            </AuraPressable>
          ) : null}
          {canLessLikeThis ? (
            <AuraPressable
              hitSlop={ACTION_HIT_SLOP}
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={
                onAction
                  ? () => onAction("lessLikeThis", look, option ?? undefined)
                  : undefined
              }
            >
              <Text
                style={[
                  styles.tertiaryActionText,
                  { color: colors.textSecondary },
                ]}
              >
                Less like this
              </Text>
            </AuraPressable>
          ) : null}
        </View>
      ) : null}

      {!hideActions &&
      (canShopMissingPieces || canUseOnlyMyCloset || canMakeItDressier) ? (
        <View
          style={[
            styles.tertiaryActions,
            isHome ? styles.tertiaryActionsHome : null,
          ]}
        >
          {canUseOnlyMyCloset ? (
            <AuraPressable
              hitSlop={ACTION_HIT_SLOP}
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={
                onAction
                  ? () => onAction("useOnlyMyCloset", look, option ?? undefined)
                  : undefined
              }
            >
              <Text
                style={[
                  styles.tertiaryActionText,
                  { color: colors.textSecondary },
                ]}
              >
                Use only my closet
              </Text>
            </AuraPressable>
          ) : null}
          {canMakeItDressier ? (
            <AuraPressable
              hitSlop={ACTION_HIT_SLOP}
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={
                onAction
                  ? () => onAction("makeItDressier", look, option ?? undefined)
                  : undefined
              }
            >
              <Text
                style={[
                  styles.tertiaryActionText,
                  { color: colors.textSecondary },
                ]}
              >
                Make it dressier
              </Text>
            </AuraPressable>
          ) : null}
          {canShopMissingPieces ? (
            <AuraPressable
              hitSlop={ACTION_HIT_SLOP}
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.border,
                },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={
                onAction
                  ? () =>
                      onAction("shopMissingPieces", look, option ?? undefined)
                  : undefined
              }
            >
              <Text
                style={[
                  styles.tertiaryActionText,
                  { color: colors.textSecondary },
                ]}
              >
                What am I missing?
              </Text>
            </AuraPressable>
          ) : null}
        </View>
      ) : null}

      <ItemDetailSheet
        item={selectedItem}
        visible={Boolean(selectedItem)}
        onDismiss={() => setSelectedItem(null)}
        onViewInCloset={(item) => {
          if (!item.itemId) return;
          router.push({
            pathname: "/(tabs)/item/[id]",
            params: {
              id: item.itemId,
              sourceTab: "aura",
              sourceRoute: "/(tabs)/ai",
            },
          });
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 13,
    borderRadius: 24,
    backgroundColor: auraColors.surface,
    borderWidth: CHIP_BORDER_WIDTH,
    borderColor: auraColors.borderDark,
  },
  cardCompact: {
    gap: 7,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 22,
  },
  cardHome: {
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 24,
  },
  cardSwipe: {
    gap: 7,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 22,
  },
  cardStudio: {
    gap: 14,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 16,
    borderRadius: 30,
    backgroundColor: auraColors.surfaceRaised,
    borderColor: "rgba(223,182,178,0.18)",
  },
  boardOnlyCard: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  labelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  headerChip: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: auraColors.surface,
    borderWidth: CHIP_BORDER_WIDTH,
    borderColor: auraColors.borderDark,
  },
  headerChipHome: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  directionChip: {
    backgroundColor: "rgba(223,182,178,0.12)",
    borderColor: "rgba(223,182,178,0.22)",
  },
  directionDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: auraColors.accentRose,
  },
  directionDotHome: {
    width: 6,
    height: 6,
  },
  directionChipText: {
    color: auraColors.accentRose,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
  vibeChipText: {
    color: "#E8EDF3",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
  },
  board: {
    alignSelf: "center",
    position: "relative",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: auraColors.boardLight,
    borderWidth: 1,
    borderColor: auraColors.borderWarm,
  },
  boardCompact: {
    borderRadius: 16,
  },
  boardHome: {
    borderRadius: 14,
  },
  boardSwipe: {
    borderRadius: 16,
  },
  boardStudio: {
    borderRadius: 16,
  },
  animatedPiece: {
    position: "absolute",
    overflow: "visible",
  },
  absolutePiece: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    overflow: "visible",
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    elevation: 3,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    zIndex: 1,
  },
  absolutePieceAndroid: {
    elevation: 0,
  },
  photoShadow: {
    position: "absolute",
    left: "18%",
    right: "18%",
    bottom: "5%",
    borderRadius: 999,
    backgroundColor: "rgba(18, 26, 34, 0.08)",
    transform: [{ scaleY: 0.72 }],
  },
  photoShadowGarment: {
    height: "5%",
  },
  photoShadowFootwear: {
    left: "14%",
    right: "14%",
    bottom: "2%",
    height: "9%",
    transform: [{ scaleY: 0.6 }],
  },
  photoShadowAccessory: {
    left: "24%",
    right: "24%",
    bottom: "8%",
    height: "10%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  copyBlock: {
    gap: 5,
  },
  copyBlockHome: {
    gap: 3,
  },
  copyBlockSwipe: {
    gap: 3,
  },
  copyBlockStudio: {
    gap: 6,
    paddingHorizontal: 2,
  },
  title: {
    color: "#FAFBFC",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: 0,
  },
  titleCompact: {
    fontSize: 19,
    lineHeight: 23,
    letterSpacing: 0,
  },
  titleHome: {
    fontSize: 20,
    lineHeight: 24,
  },
  titleSwipe: {
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: 0,
  },
  subtitle: {
    color: "rgba(223, 231, 241, 0.78)",
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "500",
  },
  subtitleCompact: {
    color: "rgba(223, 231, 241, 0.7)",
    fontSize: 12.5,
    lineHeight: 17,
  },
  subtitleHome: {
    color: "rgba(223, 231, 241, 0.72)",
    fontSize: 12.5,
    lineHeight: 17,
  },
  subtitleSwipe: {
    color: "rgba(223, 231, 241, 0.66)",
    fontSize: 11.5,
    lineHeight: 16,
  },
  metaBlock: {
    gap: 6,
  },
  metaBlockHome: {
    gap: 5,
  },
  metaLabel: {
    color: auraColors.accentRose,
    fontSize: 11.25,
    fontWeight: "800",
    letterSpacing: 0,
  },
  closetChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  closetChip: {
    maxWidth: "100%",
    borderRadius: 999,
    minHeight: 28,
    paddingHorizontal: 9,
    paddingVertical: 0,
    backgroundColor: auraColors.surface,
    borderWidth: CHIP_BORDER_WIDTH,
    borderColor: auraColors.borderDark,
    justifyContent: "center",
  },
  closetChipHome: {
    minHeight: 26,
    paddingHorizontal: 8,
    paddingVertical: 0,
  },
  moreChip: {
    backgroundColor: "rgba(223,182,178,0.12)",
    borderColor: "rgba(223,182,178,0.22)",
  },
  closetChipText: {
    color: "#E7EDF4",
    fontSize: 11.25,
    lineHeight: 14,
    fontWeight: "600",
  },
  closetSheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.58)",
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  closetSheetCard: {
    borderRadius: 24,
    borderWidth: CHIP_BORDER_WIDTH,
    padding: 16,
    gap: 14,
  },
  closetSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  closetSheetEyebrow: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  closetSheetTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
  },
  closetSheetClose: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: CHIP_BORDER_WIDTH,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  closetSheetCloseText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
  },
  closetSheetScroll: {
    maxHeight: 280,
  },
  closetSheetList: {
    gap: 7,
  },
  closetSheetRow: {
    minHeight: 40,
    borderRadius: 14,
    borderWidth: CHIP_BORDER_WIDTH,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  closetSheetIndex: {
    width: 24,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  closetSheetItem: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: ACTION_GAP,
    paddingTop: 2,
  },
  actionsHome: {
    gap: ACTION_GAP,
    paddingTop: 0,
  },
  actionButton: {
    flex: 1,
    height: CTA_HEIGHT,
    minHeight: CTA_HEIGHT,
    borderRadius: PILL_RADIUS,
    paddingHorizontal: CTA_HORIZONTAL_PADDING,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: CHIP_BORDER_WIDTH,
  },
  actionButtonHome: {
    height: HOME_CTA_HEIGHT,
    minHeight: HOME_CTA_HEIGHT,
    borderRadius: PILL_RADIUS,
  },
  primaryButton: {
    backgroundColor: auraColors.accentRose,
    borderColor: "transparent",
  },
  secondaryButton: {
    backgroundColor: auraColors.surface,
    borderColor: auraColors.borderDark,
  },
  regenerateButton: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 12,
  },
  primaryButtonText: {
    color: auraColors.textOnLight,
    fontSize: 13.5,
    fontWeight: "800",
  },
  secondaryButtonText: {
    color: auraColors.textPrimary,
    fontSize: 13.5,
    fontWeight: "800",
  },
  regenerateButtonText: {
    fontSize: 12.5,
  },
  tertiaryActions: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: ACTION_GAP,
  },
  tertiaryActionsHome: {
    gap: ACTION_GAP,
  },
  tertiaryAction: {
    height: CHIP_HEIGHT,
    minHeight: CHIP_HEIGHT,
    paddingHorizontal: CHIP_HORIZONTAL_PADDING,
    paddingVertical: 0,
    borderRadius: PILL_RADIUS,
    borderWidth: CHIP_BORDER_WIDTH,
    borderColor: auraColors.borderDark,
    backgroundColor: auraColors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tertiaryActionHome: {
    paddingHorizontal: CHIP_HORIZONTAL_PADDING,
    paddingVertical: 0,
  },
  tertiaryActionText: {
    color: auraColors.textSecondary,
    fontSize: 11.75,
    lineHeight: 16,
    fontWeight: "700",
  },
});

export default AuraLookCard;
