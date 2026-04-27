import { Ionicons } from "@expo/vector-icons";
import FastImage from "@d11/react-native-fast-image";
import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImagePresentation, getItemImageUrl } from "@/src/lib/itemImage";
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

export function ClosetItemCard({
  item,
  onPress,
  onLongPress,
  selected = false,
  width,
  animateIndex = 0,
}: {
  item: ClosetItem;
  onPress: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  width?: number;
  animateIndex?: number;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const reduceMotion = useReduceMotion();
  const imageUrl = getItemImageUrl(item, { variant: "thumb" });
  const imagePresentation = getItemImagePresentation(item, { surface: "closet_card" });
  const cardWidth = width ?? (layout.screenSize === "compact" ? 132 : 144);
  const imageHeight = width ? cardWidth * 1.2 : layout.screenSize === "compact" ? 150 : 160;
  const textBlockHeight = 70;
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 6);

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
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={180}
        style={({ pressed }) => ({
          width: cardWidth,
          borderRadius: 20,
          backgroundColor: colors.surface2,
          borderWidth: selected ? 1.5 : 1,
          borderColor: selected ? colors.iridescentStart : "rgba(243,223,195,0.1)",
          overflow: "hidden",
          shadowColor: colors.shadow,
          shadowOpacity: 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 6,
          opacity: pressed ? 0.9 : 1,
        })}
      >
      <View
        style={{
          aspectRatio: width ? 1 / 1.2 : imagePresentation.containerAspectRatio,
          minHeight: imageHeight,
          backgroundColor: "transparent",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          paddingHorizontal: 12,
          paddingTop: 12,
          paddingBottom: 10,
        }}
      >
        {imageUrl ? (
          <View
            style={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <FastImage
              source={{
                uri: imageUrl,
                priority: FastImage.priority.normal,
                cache: FastImage.cacheControl.immutable,
              }}
              style={[{ width: "100%", height: "100%" }, imagePresentation.imageStyle]}
              resizeMode={FastImage.resizeMode.contain}
            />
          </View>
        ) : (
          <View
            style={{
              width: "82%",
              height: "82%",
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.03)",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
              No image yet
            </Text>
            <Text
              style={{ color: colors.textSecondary, fontSize: 11, textAlign: "center" }}
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
          paddingHorizontal: 9,
          paddingTop: 7,
          paddingBottom: 10,
        }}
      >
        <Text
          style={{ color: colors.text, fontSize: 12.5, lineHeight: 16, fontWeight: "800" }}
          numberOfLines={width ? 2 : 1}
          ellipsizeMode="tail"
        >
          {titleFor(item)}
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
          {item.status.replace(/_/g, " ")}
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
            backgroundColor: "rgba(243,223,195,0.18)",
            shadowColor: "#000",
            shadowOpacity: 0.18,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 5,
          }}
        >
          <Ionicons name="checkmark" size={14} color={colors.text} />
        </View>
      ) : null}
      </Pressable>
    </Animated.View>
  );
}
