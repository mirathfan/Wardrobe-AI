import { Ionicons } from "@expo/vector-icons";
import AppImage from "@/src/components/common/AppImage";
import React, { memo, useCallback, useEffect, useMemo } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { useReduceMotion } from "@/hooks/useReduceMotion";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getBestThumbnailImageSource, getItemImagePresentation } from "@/src/lib/itemImage";
import { LAUNDRY_STATUS_LABELS, normalizeLaundryStatus } from "@/src/lib/items";
import type { ClosetItem } from "@/src/lib/items";
import { sanitizeDisplayText } from "@/src/lib/text";

function titleFor(item: ClosetItem) {
  return (
    sanitizeDisplayText(item.name) ||
    sanitizeDisplayText(item.subCategory) ||
    sanitizeDisplayText(item.category) ||
    "Wardrobe item"
  );
}

type ClosetItemCardProps = {
  item: ClosetItem;
  onPress?: () => void;
  onPressItem?: (item: ClosetItem) => void;
  onLongPress?: () => void;
  onLongPressItem?: (item: ClosetItem) => void;
  selected?: boolean;
  width?: number;
  animateIndex?: number;
};

function ClosetItemCardComponent({
  item,
  onPress,
  onPressItem,
  onLongPress,
  onLongPressItem,
  selected = false,
  width,
  animateIndex = 0,
}: ClosetItemCardProps) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const reduceMotion = useReduceMotion();
  const imageSource = useMemo(() => getBestThumbnailImageSource(item), [item]);
  const imagePresentation = useMemo(() => getItemImagePresentation(item, { surface: "closet_card" }), [item]);
  const laundryStatus = useMemo(() => normalizeLaundryStatus(item), [item]);
  const title = useMemo(() => titleFor(item), [item]);
  const cardWidth = width ?? (layout.screenSize === "compact" ? 132 : 144);
  const imageHeight = width ? cardWidth * 1.2 : layout.screenSize === "compact" ? 150 : 160;
  const textBlockHeight = 74;
  const imageSurfaceColor = selected ? "#F8F5EE" : colors.outfitBoardBackground;
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 6);
  const handlePress = useCallback(() => {
    if (onPressItem) {
      onPressItem(item);
      return;
    }
    onPress?.();
  }, [item, onPress, onPressItem]);
  const handleLongPress = useCallback(() => {
    if (onLongPressItem) {
      onLongPressItem(item);
      return;
    }
    onLongPress?.();
  }, [item, onLongPress, onLongPressItem]);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = Math.min(400, animateIndex * 40);
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) }),
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) }),
    );
  }, [animateIndex, opacity, reduceMotion, translateY]);

  const entryStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={entryStyle}>
      <AuraPressable
        onPress={handlePress}
        onLongPress={onLongPress || onLongPressItem ? handleLongPress : undefined}
        haptic="light"
        hapticTrigger="press"
        pressedScale={0.985}
        pressedOpacity={0.94}
        delayLongPress={180}
        style={{
          width: cardWidth,
          borderRadius: 22,
          backgroundColor: colors.surface,
          borderWidth: selected ? 1.5 : 1,
          borderColor: selected ? colors.lightPurple : colors.border,
          overflow: "hidden",
          shadowColor: colors.shadow,
          shadowOpacity: selected ? 0.2 : 0.12,
          shadowRadius: selected ? 18 : 12,
          shadowOffset: { width: 0, height: selected ? 10 : 6 },
          elevation: selected ? 5 : 2,
        }}
      >
      <View
        style={{
          aspectRatio: width ? 1 / 1.2 : imagePresentation.containerAspectRatio,
          minHeight: imageHeight,
          backgroundColor: imageSurfaceColor,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 12,
          margin: 8,
          marginBottom: 0,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: selected ? "rgba(124,92,255,0.16)" : "rgba(10,10,15,0.06)",
        }}
      >
        {imageSource ? (
          <View
            style={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <AppImage
              source={imageSource}
              style={[{ width: "100%", height: "100%" }, imagePresentation.imageStyle]}
              resizeMode="contain"
            />
          </View>
        ) : (
          <View
            style={{
              width: "82%",
              height: "82%",
              borderRadius: 16,
              backgroundColor: "rgba(10,10,15,0.04)",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "800" }}>
              No image yet
            </Text>
            <Text
              style={{ color: colors.textMuted, fontSize: 11, textAlign: "center" }}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {sanitizeDisplayText(item.category) || "Wardrobe piece"}
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          gap: 3,
          minHeight: textBlockHeight,
          paddingHorizontal: 12,
          paddingTop: 9,
          paddingBottom: 12,
        }}
      >
        <Text
          style={{ color: colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: "800" }}
          numberOfLines={width ? 2 : 1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
        <Text
          style={{ color: colors.textSecondary, opacity: 0.6, fontSize: 10.5, lineHeight: 16, fontWeight: "700", letterSpacing: 0.2 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {sanitizeDisplayText(item.brand) || "No brand"}
        </Text>
        <Text
          style={{ color: colors.textSecondary, opacity: 0.6, fontSize: 10, lineHeight: 15 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {LAUNDRY_STATUS_LABELS[laundryStatus]}
          {item.primaryColor ? ` · ${sanitizeDisplayText(item.primaryColor)}` : ""}
        </Text>
      </View>

      {selected ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 22,
            height: 22,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.ctaCream,
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 5,
          }}
        >
          <Ionicons name="checkmark" size={14} color={colors.ctaText} />
        </View>
      ) : null}
      </AuraPressable>
    </Animated.View>
  );
}

export const ClosetItemCard = memo(
  ClosetItemCardComponent,
  (prev, next) =>
    prev.item === next.item &&
    prev.selected === next.selected &&
    prev.width === next.width &&
    prev.animateIndex === next.animateIndex &&
    prev.onPress === next.onPress &&
    prev.onPressItem === next.onPressItem &&
    prev.onLongPress === next.onLongPress &&
    prev.onLongPressItem === next.onLongPressItem,
);
