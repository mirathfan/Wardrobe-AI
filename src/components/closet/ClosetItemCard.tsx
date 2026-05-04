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
import { auraTypography } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getBestThumbnailImageSource, getItemImagePresentation } from "@/src/lib/itemImage";
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
  const title = useMemo(() => titleFor(item), [item]);
  const brand = useMemo(() => sanitizeDisplayText(item.brand), [item.brand]);
  const colorLabel = useMemo(
    () => sanitizeDisplayText(item.primaryColor) || sanitizeDisplayText(item.displayColor),
    [item.displayColor, item.primaryColor],
  );
  const cardWidth = width ?? (layout.screenSize === "compact" ? 132 : 144);
  const imageBoardSize = cardWidth;
  const titleLineHeight = 16;
  const titleSlotHeight = titleLineHeight * 2;
  const metadataLineHeight = 14;
  const textBlockHeight = 60;
  const imageSurfaceColor = colors.outfitBoardBackground;
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
          backgroundColor: "transparent",
          borderRadius: 22,
          overflow: "visible",
        }}
      >
      <View
        style={{
          width: imageBoardSize,
          height: imageBoardSize,
          backgroundColor: imageSurfaceColor,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          padding: 10,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: selected ? "rgba(223,182,178,0.42)" : "rgba(25,0,25,0.055)",
          boxShadow: selected ? "0 10px 24px rgba(223,182,178,0.10)" : "0 6px 16px rgba(0,0,0,0.05)",
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
            <Text style={{ color: colors.textOnLightSecondary, fontSize: 12, fontWeight: "800" }}>
              No image yet
            </Text>
            <Text
              style={{ color: colors.textOnLightSecondary, fontSize: 11, textAlign: "center" }}
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
          height: textBlockHeight,
          paddingHorizontal: 2,
          paddingTop: 9,
          paddingBottom: 5,
        }}
      >
        <View style={{ height: titleSlotHeight, justifyContent: "flex-start" }}>
          <Text
            style={[auraTypography.chipLabel, { color: colors.text, fontSize: 12.25, lineHeight: titleLineHeight, fontWeight: "700" }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        </View>
        <View
          style={{
            height: metadataLineHeight,
            marginTop: 4,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          {brand ? (
            <Text
              style={{ flex: 1, color: colors.textSecondary, opacity: 0.74, fontSize: 10.5, lineHeight: metadataLineHeight, fontWeight: "700", letterSpacing: 0 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {brand}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {colorLabel ? (
            <Text
              style={{ color: colors.textSecondary, opacity: 0.78, fontSize: 10.25, lineHeight: metadataLineHeight, fontWeight: "700", maxWidth: cardWidth * 0.46, textAlign: "right" }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {colorLabel}
            </Text>
          ) : null}
        </View>
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
