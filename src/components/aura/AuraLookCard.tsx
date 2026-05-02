import React, { memo, useEffect, useMemo, useState } from "react";
import AppImage from "@/src/components/common/AppImage";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  Platform,
  useWindowDimensions,
} from "react-native";

import type { AppColors } from "@/constants/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { ItemDetailSheet } from "@/src/components/aura/ItemDetailSheet";
import { AccessoryStrip } from "@/src/components/outfit/AccessoryStrip";
import {
  ACTION_GAP,
  CHIP_BORDER_WIDTH,
  CHIP_HEIGHT,
  CHIP_HORIZONTAL_PADDING,
  CTA_HEIGHT,
  CTA_HORIZONTAL_PADDING,
  PILL_RADIUS,
} from "@/src/constants/auraControls";
import { buildRenderPlan, type AuraLayoutItem, type AuraLayoutVariant } from "@/src/lib/auraLookLayouts";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook, AuraLookAction, AuraLookOptionMeta } from "@/src/types/aura";

type Props = {
  look: AuraLook;
  colors?: AppColors;
  itemsById?: Map<string, ClothingItem>;
  style?: StyleProp<ViewStyle>;
  onAction?: (action: AuraLookAction, look: AuraLook, option?: AuraLookOptionMeta) => void;
  onPressSave?: () => void;
  onPressPlan?: () => void;
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

function firstNonEmpty<T>(...values: (T | null | undefined)[]): T | undefined {
  return values.find(Boolean) as T | undefined;
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

function normalizeDirectionLabel(...values: (string | null | undefined)[]) {
  const joined = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (joined.includes("safe")) return "Safe";
  if (joined.includes("balanced")) return "Balanced";
  if (joined.includes("bold")) return "Bold";
  return "";
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
  const base = cleanShortLabel(look.vibe) || cleanShortLabel(look.personalizationLabel);
  if (!base) return "Aura Edit";
  if (/\b(reset|edit|uniform|casual)\b/i.test(base)) return base;
  if (base.split(/\s+/).length <= 2) return `${base} Reset`;
  return base;
}

function deriveEditorialSubtitle(look: AuraLook) {
  const source = [look.shortExplanation, look.stylingNote, look.personalizationNote]
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

function getCategoryPadding(category?: string | null, subCategory?: string | null, accessoryType?: string | null) {
  if (!category) return 8;
  const normalizedCategory = String(category).trim().toLowerCase();
  const normalizedSubCategory = String(subCategory ?? "").trim().toLowerCase();
  const normalizedAccessoryType = String(accessoryType ?? "").trim().toLowerCase();
  const accessoryDescriptor = `${normalizedSubCategory} ${normalizedAccessoryType}`;
  const matchesAccessory = (values: string[]) => values.some((value) => accessoryDescriptor.includes(value));

  switch (normalizedCategory) {
    case "top":
      return 8;
    case "outerwear":
      return 6;
    case "bottom":
      return 4;
    case "footwear":
    case "shoes":
      return 6;
    case "one_piece":
      return 4;
    case "accessory":
      if (matchesAccessory(["bag", "backpack", "tote_bag", "tote", "clutch", "crossbody", "shoulder_bag", "mini_bag"])) return 6;
      if (matchesAccessory(["sunglasses", "glasses"])) return 10;
      if (matchesAccessory(["cap", "hat", "beanie", "bucket_hat"])) return 8;
      if (matchesAccessory(["perfume", "cologne", "fragrance"])) return 8;
      if (matchesAccessory(["necklace", "chain", "chain_belt", "jewelry", "jewellery"])) return 12;
      if (matchesAccessory(["belt"])) return 2;
      return 8;
    default:
      return 8;
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
  animationIndex,
  animationKey,
  reduceMotion,
  onPress,
}: {
  item?: AuraLayoutItem | null;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
  shadowIntensity: number;
  rotation: number;
  animationIndex: number;
  animationKey: string;
  reduceMotion: boolean;
  onPress: (item: AuraLayoutItem) => void;
}) {
  const source = getImageSourceForBoardItem(item);
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 20);
  const isBelt = item?.accessoryType === "belt";

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
            padding: getCategoryPadding(item.role, item.subCategory, item.accessoryType),
          },
        ]}
        onPress={() => onPress(item)}
      >
        <View
          pointerEvents="none"
          style={[
            styles.photoShadow,
            item.role === "footwear" ? styles.photoShadowFootwear : styles.photoShadowGarment,
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
          resizeMode="contain"
          style={[
            styles.image,
            isBelt ? styles.beltImage : null,
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
  const cardHorizontalPadding = isCondensed || swipeVariant || isStudio ? 12 : 14;
  const availableBoardWidth = Math.max(
    1,
    (viewportWidth ?? screenWidth) - cardHorizontalPadding * 2 - (isHome ? 28 : 0),
  );
  const boardWidth = Math.min(
    availableBoardWidth,
    isHome ? HOME_BOARD_MAX_WIDTH : BOARD_MAX_WIDTH,
  );
  const boardHeight = Math.round(boardWidth * (isHome ? HOME_BOARD_ASPECT_RATIO : BOARD_ASPECT_RATIO));
  const displayTitle = deriveEditorialLookTitle(look);
  const displayReason = deriveEditorialSubtitle(look);
  const directionLabel = normalizeDirectionLabel(option?.optionLabel, look.personalizationLabel, look.vibe);
  const vibeLabelSource =
    cleanShortLabel(look.vibe) || cleanShortLabel(look.personalizationLabel);
  const vibeLabel = vibeLabelSource && vibeLabelSource !== directionLabel ? vibeLabelSource : "";
  const visibleClosetItems = isCondensed
    ? (look.fromCloset ?? []).filter(Boolean).slice(0, swipeVariant ? 2 : 3)
    : (look.fromCloset ?? []).filter(Boolean).slice(0, 5);
  const hiddenClosetCount = Math.max(0, (look.fromCloset ?? []).filter(Boolean).length - visibleClosetItems.length);

  const renderPlan = useMemo(
    () => buildRenderPlan(look, itemsById, { variant: effectiveVariant }),
    [effectiveVariant, itemsById, look],
  );
  const animationKey = useMemo(() => {
    const maybeLookId = (look as AuraLook & { id?: string | null }).id;
    return (
      maybeLookId ??
      `${look.lookTitle}|${look.vibe}|${look.pieces
        .map((piece) => `${piece.itemId ?? piece.itemName}:${piece.role}:${piece.imageUrl ?? ""}`)
        .join("|")}`
    );
  }, [look]);
  const overflowLabels = Array.from(
    new Set(renderPlan.overflowItems.map((item) => getItemLabel(item)).filter(Boolean)),
  ).slice(0, isCondensed ? 2 : 3);

  const boardContent = (
    <View
      style={[
        styles.board,
        compact ? styles.boardCompact : null,
        isHome ? styles.boardHome : null,
        swipeVariant ? styles.boardSwipe : null,
        isStudio ? styles.boardStudio : null,
        { width: boardWidth, height: boardHeight, backgroundColor: colors.outfitBoardBackground },
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
          animationIndex={index}
          animationKey={animationKey}
          reduceMotion={reduceMotion}
          onPress={setSelectedItem}
        />
      ))}
    </View>
  );

  if (boardOnly) {
    return (
      <View style={[styles.boardOnlyCard, style]}>
        {boardContent}
      </View>
    );
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
              <View style={[styles.directionDot, isHome ? styles.directionDotHome : null, { backgroundColor: colors.softPurple }]} />
              <Text style={[styles.directionChipText, { color: colors.lightPurple }]}>
                {directionLabel.toUpperCase()}
              </Text>
            </View>
          )}
          {!!vibeLabel && (
            <View
              style={[
                styles.headerChip,
                isHome ? styles.headerChipHome : null,
                { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.vibeChipText, { color: colors.textSecondary }]}>{vibeLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {boardContent}

      <View style={[styles.copyBlock, isHome ? styles.copyBlockHome : null, swipeVariant ? styles.copyBlockSwipe : null, isStudio ? styles.copyBlockStudio : null]}>
        {!!displayTitle && (
          <Text
            numberOfLines={1}
            style={[
              styles.title,
              compact ? styles.titleCompact : null,
              isHome ? styles.titleHome : null,
              swipeVariant ? styles.titleSwipe : null,
            ]}
          >
            {displayTitle}
          </Text>
        )}

        {!!displayReason && (
          <Text
            numberOfLines={swipeVariant || isHome ? 1 : 2}
            style={[
              styles.subtitle,
              compact ? styles.subtitleCompact : null,
              isHome ? styles.subtitleHome : null,
              swipeVariant ? styles.subtitleSwipe : null,
            ]}
          >
            {displayReason}
          </Text>
        )}
      </View>

      {!!visibleClosetItems.length && (
        <View style={[styles.metaBlock, isHome ? styles.metaBlockHome : null]}>
          <Text style={[styles.metaLabel, { color: colors.softPurple }]}>FROM YOUR CLOSET</Text>
          <View style={styles.closetChips}>
            {visibleClosetItems.map((item) => (
              <View
                key={`${look.lookTitle}-${item}`}
                style={[
                  styles.closetChip,
                  isHome ? styles.closetChipHome : null,
                  { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
                ]}
              >
                <Text numberOfLines={1} style={[styles.closetChipText, { color: colors.textPrimary }]}>
                  {item}
                </Text>
              </View>
            ))}
            {hiddenClosetCount > 0 ? (
              <View
                style={[
                  styles.closetChip,
                  isHome ? styles.closetChipHome : null,
                  styles.moreChip,
                  { backgroundColor: colors.purpleSurface, borderColor: colors.purpleBorder },
                ]}
              >
                <Text style={[styles.closetChipText, { color: colors.lightPurple }]}>+{hiddenClosetCount} more</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      {!!overflowLabels.length && (
        <View style={[styles.metaBlock, isHome ? styles.metaBlockHome : null]}>
          <Text style={[styles.metaLabel, { color: colors.softPurple }]}>ALSO INCLUDED</Text>
          <View style={styles.closetChips}>
            {overflowLabels.map((item) => (
              <View
                key={`${look.lookTitle}-extra-${item}`}
                style={[
                  styles.closetChip,
                  isHome ? styles.closetChipHome : null,
                  { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
                ]}
              >
                <Text numberOfLines={1} style={[styles.closetChipText, { color: colors.textPrimary }]}>
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
            style={[
              styles.actionButton,
              isHome ? styles.actionButtonHome : null,
              styles.primaryButton,
              { backgroundColor: colors.ctaCream, borderColor: colors.ctaCream },
            ]}
            haptic="light"
            hapticTrigger="press"
            pressedScale={0.97}
            pressedOpacity={0.92}
            onPress={
              onPressSave ?? (onAction ? () => onAction("saveLook", look, option ?? undefined) : undefined)
            }
          >
            <Text style={[styles.primaryButtonText, { color: colors.ctaText }]}>Save look</Text>
          </AuraPressable>

          <AuraPressable
            style={[
              styles.actionButton,
              isHome ? styles.actionButtonHome : null,
              styles.secondaryButton,
              { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
            ]}
            haptic="light"
            hapticTrigger="press"
            pressedScale={0.97}
            pressedOpacity={0.92}
            onPress={
              onPressPlan ??
              (onAction ? () => onAction("planForToday", look, option ?? undefined) : undefined)
            }
          >
            <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>Plan for today</Text>
          </AuraPressable>
        </View>
      ) : null}

      {!hideActions && (canLikeLook || canNotMyVibe || canShowMoreLikeThis || canLessLikeThis) ? (
        <View style={[styles.tertiaryActions, isHome ? styles.tertiaryActionsHome : null]}>
          {canLikeLook ? (
            <AuraPressable
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={onAction ? () => onAction("likeLook", look, option ?? undefined) : undefined}
            >
              <Text style={[styles.tertiaryActionText, { color: colors.textSecondary }]}>Like</Text>
            </AuraPressable>
          ) : null}
          {canNotMyVibe ? (
            <AuraPressable
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={onAction ? () => onAction("notMyVibe", look, option ?? undefined) : undefined}
            >
              <Text style={[styles.tertiaryActionText, { color: colors.textSecondary }]}>Not my vibe</Text>
            </AuraPressable>
          ) : null}
          {canShowMoreLikeThis ? (
            <AuraPressable
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={onAction ? () => onAction("showMoreLikeThis", look, option ?? undefined) : undefined}
            >
              <Text style={[styles.tertiaryActionText, { color: colors.textSecondary }]}>More like this</Text>
            </AuraPressable>
          ) : null}
          {canLessLikeThis ? (
            <AuraPressable
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={onAction ? () => onAction("lessLikeThis", look, option ?? undefined) : undefined}
            >
              <Text style={[styles.tertiaryActionText, { color: colors.textSecondary }]}>Less like this</Text>
            </AuraPressable>
          ) : null}
        </View>
      ) : null}

      {!hideActions && (canShopMissingPieces || canUseOnlyMyCloset || canMakeItDressier) ? (
        <View style={[styles.tertiaryActions, isHome ? styles.tertiaryActionsHome : null]}>
          {canUseOnlyMyCloset ? (
            <AuraPressable
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={onAction ? () => onAction("useOnlyMyCloset", look, option ?? undefined) : undefined}
            >
              <Text style={[styles.tertiaryActionText, { color: colors.textSecondary }]}>Use only my closet</Text>
            </AuraPressable>
          ) : null}
          {canMakeItDressier ? (
            <AuraPressable
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={onAction ? () => onAction("makeItDressier", look, option ?? undefined) : undefined}
            >
              <Text style={[styles.tertiaryActionText, { color: colors.textSecondary }]}>Make it dressier</Text>
            </AuraPressable>
          ) : null}
          {canShopMissingPieces ? (
            <AuraPressable
              style={[
                styles.tertiaryAction,
                isHome ? styles.tertiaryActionHome : null,
                { backgroundColor: colors.surfaceSoft, borderColor: colors.border },
              ]}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              onPress={onAction ? () => onAction("shopMissingPieces", look, option ?? undefined) : undefined}
            >
              <Text style={[styles.tertiaryActionText, { color: colors.textSecondary }]}>What am I missing?</Text>
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
            params: { id: item.itemId, sourceTab: "aura" },
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
    paddingBottom: 12,
    borderRadius: 28,
    backgroundColor: "#11131A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  cardCompact: {
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 24,
  },
  cardHome: {
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 24,
  },
  cardSwipe: {
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 26,
  },
  cardStudio: {
    gap: 14,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 16,
    borderRadius: 30,
    backgroundColor: "rgba(25,27,38,0.94)",
    borderColor: "rgba(124,92,255,0.25)",
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
    gap: 8,
  },
  headerChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  headerChipHome: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  directionChip: {
    backgroundColor: "rgba(124,92,255,0.12)",
    borderColor: "rgba(124,92,255,0.25)",
  },
  directionDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#7C5CFF",
  },
  directionDotHome: {
    width: 6,
    height: 6,
  },
  directionChipText: {
    color: "#A78BFA",
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.85,
  },
  vibeChipText: {
    color: "#E8EDF3",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
  },
  board: {
    alignSelf: "center",
    position: "relative",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#F5F2ED",
    borderWidth: 0,
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
  beltImage: {
    height: "460%",
    width: "22%",
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
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: 0,
  },
  titleCompact: {
    fontSize: 20,
    lineHeight: 24,
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
    gap: 7,
  },
  metaBlockHome: {
    gap: 5,
  },
  metaLabel: {
    color: "#7C5CFF",
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  closetChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  closetChip: {
    maxWidth: "100%",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(245, 247, 251, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  closetChipHome: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  moreChip: {
    backgroundColor: "rgba(124,92,255,0.12)",
    borderColor: "rgba(124,92,255,0.25)",
  },
  closetChipText: {
    color: "#E7EDF4",
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
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
    minHeight: CTA_HEIGHT,
    borderRadius: PILL_RADIUS,
    paddingHorizontal: CTA_HORIZONTAL_PADDING,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  actionButtonHome: {
    minHeight: CTA_HEIGHT,
    borderRadius: PILL_RADIUS,
  },
  primaryButton: {
    backgroundColor: "#EDE9E3",
    borderColor: "#EDE9E3",
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  primaryButtonText: {
    color: "#F5F8FB",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButtonText: {
    color: "#E7EDF5",
    fontSize: 15,
    fontWeight: "800",
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
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  tertiaryActionHome: {
    paddingHorizontal: CHIP_HORIZONTAL_PADDING,
    paddingVertical: 0,
  },
  tertiaryActionText: {
    color: "rgba(235,240,248,0.86)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
});

export default AuraLookCard;
