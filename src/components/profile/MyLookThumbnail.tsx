import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "@/constants/theme";
import AuraOutfitVisualCard from "@/src/components/aura/AuraOutfitVisualCard";
import type { ProfileLookRecord } from "@/src/lib/profileLooks";
import type { ClothingItem } from "@/src/types/ClothingItem";

const colors = Colors.dark;

type Props = {
  record: ProfileLookRecord;
  width: number;
  itemsById?: Map<string, ClothingItem>;
  height?: number;
  onPress: () => void;
  onLongPress?: () => void;
  showInfo?: boolean;
  showFavouriteStar?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
};

export function MyLookThumbnail({
  record,
  width,
  itemsById,
  height = Math.round((width * 4) / 3),
  onPress,
  onLongPress,
  showInfo = false,
  showFavouriteStar = false,
  selected = false,
  selectionMode = false,
}: Props) {
  const scale = width <= 90 ? 0.26 : 0.5;
  const boardSize = Math.min(width, height) / scale;
  const itemCount = record.look.pieces?.length ?? record.itemIds.length;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={260}
      style={[styles.card, selected ? styles.cardSelected : null, { width, height }]}
      accessibilityRole="button"
      accessibilityLabel={`${record.title} look`}
    >
      <View pointerEvents="none" style={styles.previewClip}>
        <AuraOutfitVisualCard
          accessibilityLabel={`${record.title} outfit preview`}
          look={record.look}
          itemsById={itemsById}
          mode="thumbnail"
          viewportWidth={boardSize + 26}
          style={[
            styles.scaledCard,
            {
              width: boardSize,
              height: boardSize,
              transform: [
                { translateX: -((boardSize - width) / 2) },
                { translateY: -((boardSize - height) / 2) },
                { scale },
              ],
            },
          ]}
        />
      </View>

      {showFavouriteStar ? <Text style={styles.star}>★</Text> : null}

      {selectionMode ? <View pointerEvents="none" style={[styles.selectionOverlay, selected ? styles.selectionOverlayActive : null]} /> : null}
      {selected ? (
        <View pointerEvents="none" style={styles.checkBadge}>
          <Text style={styles.checkText}>✓</Text>
        </View>
      ) : null}

      {showInfo ? (
        <View style={styles.infoBar}>
          <Text numberOfLines={1} style={styles.title}>
            {record.title}
          </Text>
          <Text style={styles.count}>{itemCount} {itemCount === 1 ? "piece" : "pieces"}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function MyLookSkeleton({ width, height = Math.round((width * 4) / 3) }: { width: number; height?: number }) {
  const shimmer = useSharedValue(-1);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value * width }],
  }));

  return (
    <View style={[styles.skeleton, { width, height }]}>
      <Animated.View style={[styles.shimmer, shimmerStyle]}>
        <LinearGradient
          colors={[colors.surface, colors.surfaceElevated, colors.surface]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: colors.boardLight,
    overflow: "hidden",
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderWarm,
  },
  cardSelected: {
    borderColor: colors.borderStrong,
    borderWidth: 2,
  },
  previewClip: {
    flex: 1,
    overflow: "hidden",
  },
  scaledCard: {
    position: "absolute",
    top: 0,
    left: 0,
    borderRadius: 16,
  },
  infoBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "600",
  },
  count: {
    marginTop: 2,
    color: "rgba(255,255,255,0.6)",
    fontSize: 9,
  },
  star: {
    position: "absolute",
    top: 6,
    right: 6,
    color: colors.ctaCream,
    fontSize: 14,
    fontWeight: "700",
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowRadius: 4,
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  selectionOverlayActive: {
    backgroundColor: "rgba(0,0,0,0.26)",
  },
  checkBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ctaCream,
    borderWidth: 1,
    borderColor: colors.borderWarm,
  },
  checkText: {
    color: colors.ctaText,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
  },
  skeleton: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  shimmer: {
    width: "70%",
    height: "100%",
  },
});
