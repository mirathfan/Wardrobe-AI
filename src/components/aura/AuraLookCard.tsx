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
  AuraButton,
  AuraIconButton,
  AuraSheetBackdrop,
  AuraSheetSurface,
  AuraText,
  auraDesignTokens,
} from "@/src/components/ui/auraStylePrimitives";
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

function labelFromStyleIdentity(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return titleCase(normalized.replace(/_/g, " "));
}

function colorBalanceLabel(score?: number) {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "Color balance";
  }
  if (score >= 82) return "Strong color balance";
  if (score >= 68) return "Balanced color";
  return "Needs color edit";
}

function deriveStylingIntelligenceLine(look: AuraLook) {
  const intelligence = look.stylingIntelligence;
  const score = intelligence?.overallScore;
  if (typeof score !== "number" || !Number.isFinite(score)) return "";
  const styleLabel =
    labelFromStyleIdentity(intelligence?.styleIdentity) ||
    cleanShortLabel(look.vibe);
  const colorLabel = colorBalanceLabel(intelligence?.colorScore);
  return [styleLabel, colorLabel, String(Math.round(score))]
    .filter(Boolean)
    .join(" · ");
}

function formatListSummary(values: string[], limit = 2) {
  const visible = values.slice(0, limit);
  const hiddenCount = Math.max(0, values.length - visible.length);
  if (!visible.length) return "";
  return `${visible.join(", ")}${hiddenCount ? ` +${hiddenCount}` : ""}`;
}

function deriveOwnershipSummary(closetItems: string[], missingPieces: string[], totalPieces: number) {
  const ownedLabel =
    closetItems.length > 0
      ? `${closetItems.length} closet ${closetItems.length === 1 ? "piece" : "pieces"}`
      : totalPieces > 0
        ? `${totalPieces} styled ${totalPieces === 1 ? "piece" : "pieces"}`
        : "";
  const missingLabel = missingPieces.length
    ? `Missing: ${formatListSummary(missingPieces)}`
    : closetItems.length
      ? "Complete from your closet"
      : "";
  return [ownedLabel, missingLabel].filter(Boolean).join(" · ");
}

type OverflowLookAction = {
  key: string;
  label: string;
  detail?: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

function buildOverflowActions({
  look,
  option,
  onAction,
  onPressPlan,
  onPressRegenerate,
  regenerating,
  missingPiecesCount,
  primaryAction,
}: {
  look: AuraLook;
  option?: AuraLookOptionMeta;
  onAction?: Props["onAction"];
  onPressPlan?: () => void;
  onPressRegenerate?: () => void;
  regenerating: boolean;
  missingPiecesCount: number;
  primaryAction: AuraLookAction;
}): OverflowLookAction[] {
  const supportedActions = new Set(look.actions ?? []);
  const actions: OverflowLookAction[] = [];
  const callAction = (action: AuraLookAction) => () => onAction?.(action, look, option);

  if (primaryAction !== "saveLook" && onAction) {
    actions.push({
      key: "saveLook",
      label: "Save look",
      detail: "Keep this edit in your looks",
      icon: "bookmark-outline",
      onPress: callAction("saveLook"),
    });
  }

  if (primaryAction !== "planForToday" && (onPressPlan || onAction)) {
    actions.push({
      key: "planForToday",
      label: "Plan for today",
      detail: "Attach it to today",
      icon: "calendar-outline",
      onPress: onPressPlan ?? callAction("planForToday"),
    });
  }

  if (primaryAction !== "wearToday" && onAction && supportedActions.has("wearToday")) {
    actions.push({
      key: "wearToday",
      label: "Mark worn today",
      detail: "Log this outfit",
      icon: "checkmark-circle-outline",
      onPress: callAction("wearToday"),
    });
  }

  if (missingPiecesCount > 0 && onAction) {
    actions.push({
      key: "shopMissingPieces",
      label: "Shop missing pieces",
      detail: "Turn gaps into a shopping brief",
      icon: "search-outline",
      onPress: callAction("shopMissingPieces"),
    });
  }

  if (onPressRegenerate) {
    actions.push({
      key: "regenerate",
      label: regenerating ? "Trying another edit" : "Try another edit",
      detail: "Regenerate this outfit",
      icon: "refresh-outline",
      disabled: regenerating,
      loading: regenerating,
      onPress: onPressRegenerate,
    });
  }

  const feedbackActions: {
    action: AuraLookAction;
    label: string;
    detail: string;
    icon: keyof typeof Ionicons.glyphMap;
    destructive?: boolean;
  }[] = [
    {
      action: "likeLook",
      label: "More like this",
      detail: "Teach AURA what works",
      icon: "heart-outline",
    },
    {
      action: "showMoreLikeThis",
      label: "Show similar edits",
      detail: "Keep this direction",
      icon: "albums-outline",
    },
    {
      action: "lessLikeThis",
      label: "Less like this",
      detail: "Move away from this lane",
      icon: "remove-circle-outline",
    },
    {
      action: "notMyVibe",
      label: "Not my vibe",
      detail: "Ask AURA to redirect",
      icon: "close-circle-outline",
      destructive: true,
    },
    {
      action: "useOnlyMyCloset",
      label: "Use only my closet",
      detail: "Remove suggested pieces",
      icon: "shirt-outline",
    },
    {
      action: "makeItDressier",
      label: "Make it dressier",
      detail: "Elevate the same intent",
      icon: "diamond-outline",
    },
  ];

  if (onAction) {
    feedbackActions.forEach((entry) => {
      if (!supportedActions.has(entry.action)) return;
      actions.push({
        key: entry.action,
        label: entry.label,
        detail: entry.detail,
        icon: entry.icon,
        destructive: entry.destructive,
        onPress: callAction(entry.action),
      });
    });
  }

  return actions;
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
        accessibilityRole="button"
        accessibilityLabel={`View ${item.itemName || item.role} details`}
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
  const [closetSheetVisible, setClosetSheetVisible] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const reduceMotion = useReduceMotion();
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
  const stylingIntelligenceLine = deriveStylingIntelligenceLine(look);
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
    setClosetSheetVisible(false);
    setActionSheetVisible(false);
  }, [animationKey]);
  const missingPieces = useMemo(
    () => Array.from(new Set((look.addToComplete ?? []).filter(Boolean))),
    [look.addToComplete],
  );
  const ownershipSummary = deriveOwnershipSummary(
    closetItems,
    missingPieces,
    look.pieces?.length ?? 0,
  );
  const editorialMeta = [directionLabel, vibeLabel].filter(Boolean).join(" / ");
  const primaryAction: AuraLookAction =
    look.actions?.includes("wearToday") && onAction && !onPressSave
      ? "wearToday"
      : "saveLook";
  const primaryLabel = primaryAction === "wearToday" ? "Wear this" : "Save look";
  const primaryPress =
    primaryAction === "wearToday"
      ? onAction
        ? () => onAction("wearToday", look, option ?? undefined)
        : undefined
      : onPressSave ??
        (onAction
          ? () => onAction("saveLook", look, option ?? undefined)
          : undefined);
  const overflowActions = useMemo(
    () =>
      buildOverflowActions({
        look,
        option: option ?? undefined,
        onAction,
        onPressPlan,
        onPressRegenerate,
        regenerating,
        missingPiecesCount: missingPieces.length,
        primaryAction,
      }),
    [
      look,
      missingPieces.length,
      onAction,
      onPressPlan,
      onPressRegenerate,
      option,
      primaryAction,
      regenerating,
    ],
  );
  const hasActionRow = Boolean(primaryPress) || overflowActions.length > 0;
  const isBoardEmpty =
    !renderPlan.placedItems.length && !renderPlan.stripItems.length;

  const boardContent = (
    <View
      accessibilityLabel={`${displayTitle} outfit preview`}
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
      {isBoardEmpty ? (
        <View pointerEvents="none" style={styles.emptyBoardState}>
          <Ionicons name="images-outline" size={22} color={colors.textOnLightSecondary} />
          <Text style={[styles.emptyBoardText, { color: colors.textOnLightSecondary }]}>
            Outfit preview unavailable
          </Text>
        </View>
      ) : null}
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
      {boardContent}

      <View
        style={[
          styles.editorialBlock,
          isHome ? styles.editorialBlockHome : null,
          swipeVariant ? styles.editorialBlockSwipe : null,
          isStudio ? styles.editorialBlockStudio : null,
        ]}
      >
        {!!editorialMeta && (
          <AuraText
            variant="metadata"
            tone="accent"
            numberOfLines={1}
            style={[
              styles.editorialMeta,
              isHome ? styles.editorialMetaHome : null,
            ]}
          >
            {editorialMeta}
          </AuraText>
        )}

        {!!displayTitle && (
          <AuraText
            variant="heading"
            numberOfLines={1}
            style={[
              styles.title,
              compact ? styles.titleCompact : null,
              isHome ? styles.titleHome : null,
              swipeVariant ? styles.titleSwipe : null,
            ]}
          >
            {displayTitle}
          </AuraText>
        )}

        {!!displayReason && (
          <AuraText
            variant="body"
            tone="secondary"
            numberOfLines={swipeVariant ? 2 : isHome ? 1 : 2}
            style={[
              styles.subtitle,
              compact ? styles.subtitleCompact : null,
              isHome ? styles.subtitleHome : null,
              swipeVariant ? styles.subtitleSwipe : null,
            ]}
          >
            {displayReason}
          </AuraText>
        )}

        {!!stylingIntelligenceLine && (
          <AuraText
            variant="metadata"
            tone="accent"
            numberOfLines={1}
            style={[
              styles.stylingIntelligenceLine,
              isHome ? styles.stylingIntelligenceLineHome : null,
              swipeVariant ? styles.stylingIntelligenceLineSwipe : null,
            ]}
          >
            {stylingIntelligenceLine}
          </AuraText>
        )}

        {!!ownershipSummary && (
          closetItems.length ? (
            <AuraPressable
              accessibilityRole="button"
              accessibilityLabel="View included closet pieces"
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.99}
              pressedOpacity={0.82}
              onPress={() => setClosetSheetVisible(true)}
              style={styles.summaryPressable}
            >
              <AuraText
                variant="caption"
                tone="secondary"
                numberOfLines={2}
                style={styles.summaryText}
              >
                {ownershipSummary}
              </AuraText>
            </AuraPressable>
          ) : (
            <AuraText
              variant="caption"
              tone="secondary"
              numberOfLines={2}
              style={styles.summaryText}
            >
              {ownershipSummary}
            </AuraText>
          )
        )}
      </View>

      <Modal
        visible={closetSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setClosetSheetVisible(false)}
      >
        <AuraSheetBackdrop style={styles.sheetRoot}>
          <Pressable
            accessibilityLabel="Close closet items"
            style={StyleSheet.absoluteFill}
            onPress={() => setClosetSheetVisible(false)}
          />
          <AuraSheetSurface style={styles.closetSheetCard}>
            <View style={styles.closetSheetHeader}>
              <View>
                <AuraText variant="metadata" tone="accent" style={styles.closetSheetEyebrow}>
                  From your closet
                </AuraText>
                <AuraText variant="section" style={styles.closetSheetTitle}>
                  Included pieces
                </AuraText>
              </View>
              <AuraIconButton
                icon="close"
                label="Close included pieces"
                onPress={() => setClosetSheetVisible(false)}
                variant="tertiary"
                size="small"
              />
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
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.borderSoft,
                    },
                  ]}
                >
                  <AuraText variant="metadata" tone="accent" style={styles.closetSheetIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </AuraText>
                  <AuraText
                    variant="bodyStrong"
                    numberOfLines={1}
                    style={styles.closetSheetItem}
                  >
                    {item}
                  </AuraText>
                </View>
              ))}
            </ScrollView>
          </AuraSheetSurface>
        </AuraSheetBackdrop>
      </Modal>

      {!hideActions && hasActionRow ? (
        <View style={[styles.actions, isHome ? styles.actionsHome : null]}>
          <AuraButton
            label={primaryLabel}
            iconLeft={primaryAction === "wearToday" ? "checkmark-circle-outline" : "bookmark-outline"}
            onPress={primaryPress}
            disabled={!primaryPress}
            variant="primary"
            size="default"
            haptic="light"
            hapticTrigger="press"
            style={[
              styles.primaryCta,
              isHome ? styles.primaryCtaHome : null,
              { flex: 1 },
            ]}
            textStyle={styles.primaryCtaText}
          />
          {overflowActions.length ? (
            <AuraIconButton
              icon="ellipsis-horizontal"
              label="More outfit actions"
              onPress={() => setActionSheetVisible(true)}
              variant="secondary"
              size="default"
              haptic="selection"
              hapticTrigger="press"
              style={isHome ? styles.overflowButtonHome : undefined}
            />
          ) : null}
        </View>
      ) : null}

      <ActionOverflowSheet
        visible={actionSheetVisible}
        actions={overflowActions}
        onDismiss={() => setActionSheetVisible(false)}
      />

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

function ActionOverflowSheet({
  visible,
  actions,
  onDismiss,
}: {
  visible: boolean;
  actions: OverflowLookAction[];
  onDismiss: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <AuraSheetBackdrop style={styles.sheetRoot}>
        <Pressable
          accessibilityLabel="Close outfit actions"
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
        />
        <AuraSheetSurface style={styles.actionSheetCard}>
          <View style={styles.actionSheetHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <AuraText variant="metadata" tone="accent" style={styles.closetSheetEyebrow}>
                Outfit actions
              </AuraText>
              <AuraText variant="section">More options</AuraText>
            </View>
            <AuraIconButton
              icon="close"
              label="Close outfit actions"
              onPress={onDismiss}
              variant="tertiary"
              size="small"
            />
          </View>

          <View style={styles.actionSheetList}>
            {actions.map((action) => (
              <AuraPressable
                key={action.key}
                disabled={action.disabled}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => {
                  if (action.disabled) return;
                  onDismiss();
                  action.onPress();
                }}
                haptic="selection"
                hapticTrigger="press"
                pressedScale={0.99}
                pressedOpacity={0.86}
                style={({ pressed }) => [
                  styles.actionSheetRow,
                  {
                    backgroundColor: pressed ? colors.surfaceElevated : colors.surfaceMuted,
                    borderColor: colors.borderSoft,
                    opacity: action.disabled ? 0.56 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.actionSheetIcon,
                    {
                      backgroundColor: action.destructive ? colors.dangerSurface : colors.accentSoft,
                      borderColor: action.destructive ? colors.dangerBorder : colors.borderSoft,
                    },
                  ]}
                >
                  {action.loading ? (
                    <ActivityIndicator size="small" color={colors.textSecondary} />
                  ) : (
                    <Ionicons
                      name={action.icon}
                      size={17}
                      color={action.destructive ? colors.destructive : colors.accent}
                    />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AuraText
                    variant="bodyStrong"
                    tone={action.destructive ? "destructive" : "primary"}
                    numberOfLines={1}
                    style={styles.actionSheetTitle}
                  >
                    {action.label}
                  </AuraText>
                  {!!action.detail && (
                    <AuraText variant="caption" tone="secondary" numberOfLines={1}>
                      {action.detail}
                    </AuraText>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </AuraPressable>
            ))}
          </View>
        </AuraSheetSurface>
      </AuraSheetBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 13,
    borderRadius: auraDesignTokens.radii.xl,
    backgroundColor: auraColors.surface,
    borderWidth: CHIP_BORDER_WIDTH,
    borderColor: auraColors.borderDark,
  },
  cardCompact: {
    gap: 11,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: auraDesignTokens.radii.lg,
  },
  cardHome: {
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: auraDesignTokens.radii.lg,
  },
  cardSwipe: {
    gap: 11,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: auraDesignTokens.radii.lg,
  },
  cardStudio: {
    gap: 15,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 16,
    borderRadius: auraDesignTokens.radii.xxl,
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
    fontWeight: "600",
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
    borderRadius: 22,
    backgroundColor: auraColors.boardLight,
    borderWidth: 1,
    borderColor: auraColors.borderWarm,
  },
  boardCompact: {
    borderRadius: 18,
  },
  boardHome: {
    borderRadius: 18,
  },
  boardSwipe: {
    borderRadius: 18,
  },
  boardStudio: {
    borderRadius: 20,
  },
  emptyBoardState: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyBoardText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    textAlign: "center",
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
  editorialBlock: {
    gap: 7,
    paddingHorizontal: 2,
  },
  editorialBlockHome: {
    gap: 5,
  },
  editorialBlockSwipe: {
    gap: 5,
  },
  editorialBlockStudio: {
    gap: 7,
    paddingHorizontal: 2,
  },
  editorialMeta: {
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  editorialMetaHome: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  title: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "600",
    letterSpacing: -0.25,
  },
  titleCompact: {
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.2,
  },
  titleHome: {
    fontSize: 21,
    lineHeight: 26,
  },
  titleSwipe: {
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.15,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
  },
  subtitleCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  subtitleHome: {
    fontSize: 13,
    lineHeight: 18,
  },
  subtitleSwipe: {
    fontSize: 12,
    lineHeight: 17,
  },
  stylingIntelligenceLine: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "500",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  stylingIntelligenceLineHome: {
    fontSize: 11,
    lineHeight: 14,
  },
  stylingIntelligenceLineSwipe: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  summaryPressable: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  summaryText: {
    fontSize: 12.25,
    lineHeight: 18,
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
    fontWeight: "600",
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
  completeLookBlock: {
    borderRadius: 18,
    borderWidth: CHIP_BORDER_WIDTH,
    padding: 10,
  },
  completeLookBlockHome: {
    borderRadius: 16,
    padding: 9,
  },
  completeLookHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  shopMissingButton: {
    minHeight: 34,
    maxWidth: 154,
    borderRadius: PILL_RADIUS,
    borderWidth: CHIP_BORDER_WIDTH,
    paddingHorizontal: 10,
    paddingVertical: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  shopMissingButtonText: {
    fontSize: 10.75,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0,
  },
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
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
    fontWeight: "500",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  closetSheetTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "600",
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
    fontWeight: "600",
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
    fontWeight: "500",
    letterSpacing: 1.2,
  },
  closetSheetItem: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: ACTION_GAP,
    paddingTop: 0,
    alignItems: "stretch",
  },
  actionsHome: {
    gap: ACTION_GAP,
    paddingTop: 0,
  },
  primaryCta: {
    minHeight: CTA_HEIGHT,
    height: CTA_HEIGHT,
  },
  primaryCtaHome: {
    minHeight: HOME_CTA_HEIGHT,
    height: HOME_CTA_HEIGHT,
  },
  primaryCtaText: {
    fontSize: 13.5,
    lineHeight: 18,
  },
  overflowButtonHome: {
    width: HOME_CTA_HEIGHT,
    height: HOME_CTA_HEIGHT,
  },
  actionSheetCard: {
    gap: 14,
  },
  actionSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  actionSheetList: {
    gap: 8,
  },
  actionSheetRow: {
    minHeight: 58,
    borderRadius: auraDesignTokens.radii.md,
    borderWidth: CHIP_BORDER_WIDTH,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  actionSheetIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: CHIP_BORDER_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  actionSheetTitle: {
    fontSize: 13.5,
    lineHeight: 18,
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
    fontWeight: "600",
  },
  secondaryButtonText: {
    color: auraColors.textPrimary,
    fontSize: 13.5,
    fontWeight: "600",
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
    fontWeight: "500",
  },
});

export default AuraLookCard;
