import React from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";

import { Fonts, type AppColors } from "@/constants/theme";
import AuraAgentOutfitCard from "@/src/components/aura/AuraAgentOutfitCard";
import { getAgentOutfitCardWidth } from "@/src/components/aura/AuraAgentOldStyleOutfitCard";
import type { AuraAgentOutfit, AuraAgentSuggestedAction } from "@/src/types/auraAgent";

const PAGE_GAP = 10;

export type AuraAgentOutfitCarouselProps = {
  outfits: AuraAgentOutfit[];
  colors: AppColors;
  selectedOutfitId?: string | null;
  onSelectedOutfitChange?: (outfit: AuraAgentOutfit, index: number) => void;
  onAction?: (action: AuraAgentSuggestedAction, outfit: AuraAgentOutfit) => void;
  actions?: AuraAgentSuggestedAction[];
  initialIndex?: number;
};

export function shouldRenderAgentOutfitCarousel(outfitCount: number) {
  return outfitCount > 1;
}

export function getAgentCarouselPageLabel(index: number, total: number) {
  const safeTotal = Math.max(0, Math.round(total));
  if (safeTotal <= 1) return "";
  const safeIndex = Math.min(Math.max(0, Math.round(index)), safeTotal - 1);
  return `${safeIndex + 1} of ${safeTotal}`;
}

export function getCurrentAgentCarouselOutfit(
  outfits: AuraAgentOutfit[],
  selectedOutfitId?: string | null,
  activeIndex = 0,
) {
  if (!outfits.length) return null;
  const selected = selectedOutfitId
    ? outfits.find((outfit) => outfit.outfitId === selectedOutfitId)
    : null;
  if (selected) return selected;
  return outfits[Math.min(Math.max(0, Math.round(activeIndex)), outfits.length - 1)] ?? outfits[0] ?? null;
}

export function getAgentCarouselSnapInterval(screenWidth: number) {
  return getAgentOutfitCardWidth(screenWidth) + PAGE_GAP;
}

function selectedIndexForOutfitId(
  outfits: AuraAgentOutfit[],
  selectedOutfitId?: string | null,
  initialIndex = 0,
) {
  const selectedIndex = outfits.findIndex((outfit) => outfit.outfitId === selectedOutfitId);
  if (selectedIndex >= 0) return selectedIndex;
  return Math.min(Math.max(0, Math.round(initialIndex)), Math.max(0, outfits.length - 1));
}

export default function AuraAgentOutfitCarousel(props: AuraAgentOutfitCarouselProps) {
  const {
    outfits,
    colors,
    selectedOutfitId,
    onSelectedOutfitChange,
    initialIndex = 0,
  } = props;
  const { width } = useWindowDimensions();
  const cardWidth = getAgentOutfitCardWidth(width);
  const snapInterval = cardWidth + PAGE_GAP;
  const listRef = React.useRef<FlatList<AuraAgentOutfit>>(null);
  const initialActiveIndex = selectedIndexForOutfitId(outfits, selectedOutfitId, initialIndex);
  const [activeIndex, setActiveIndex] = React.useState(initialActiveIndex);
  const hasMultipleOutfits = shouldRenderAgentOutfitCarousel(outfits.length);

  const selectIndex = React.useCallback(
    (index: number) => {
      if (!outfits.length) return;
      const nextIndex = Math.min(Math.max(0, Math.round(index)), outfits.length - 1);
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
      const nextOutfit = outfits[nextIndex];
      if (nextOutfit) onSelectedOutfitChange?.(nextOutfit, nextIndex);
    },
    [onSelectedOutfitChange, outfits],
  );
  const selectIndexRef = React.useRef(selectIndex);
  React.useEffect(() => {
    selectIndexRef.current = selectIndex;
  }, [selectIndex]);

  React.useEffect(() => {
    const nextIndex = selectedIndexForOutfitId(outfits, selectedOutfitId, activeIndex);
    setActiveIndex(nextIndex);
  }, [activeIndex, outfits, selectedOutfitId]);

  React.useEffect(() => {
    if (!hasMultipleOutfits) return;
    listRef.current?.scrollToOffset({
      animated: false,
      offset: activeIndex * snapInterval,
    });
  }, [activeIndex, hasMultipleOutfits, snapInterval]);

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 62,
    minimumViewTime: 80,
  }).current;
  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: ViewToken<AuraAgentOutfit>[] }) => {
      const firstVisible = viewableItems.find((item) => item.isViewable && item.index != null);
      if (firstVisible?.index != null) selectIndexRef.current(firstVisible.index);
    },
  ).current;

  if (!outfits.length) return null;

  if (!hasMultipleOutfits) {
    return (
      <View testID="aura-agent-outfit-carousel-single" style={styles.singleCard}>
        <AuraAgentOutfitCard
          colors={colors}
          outfit={outfits[0]}
          showSelectedIndicator={false}
          showDetails={false}
          showDevDetails={false}
        />
      </View>
    );
  }

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    selectIndex(event.nativeEvent.contentOffset.x / snapInterval);
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        testID="aura-agent-outfit-carousel"
        data={outfits}
        horizontal
        keyExtractor={(outfit) => outfit.outfitId}
        renderItem={({ item }) => (
          <View style={[styles.page, { width: cardWidth, marginRight: PAGE_GAP }]}>
            <AuraAgentOutfitCard
              colors={colors}
              outfit={item}
              selected={item.outfitId === outfits[activeIndex]?.outfitId}
              showSelectedIndicator={false}
              showDetails={false}
              showDevDetails={false}
            />
          </View>
        )}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews={false}
        getItemLayout={(_, index) => ({
          length: snapInterval,
          offset: snapInterval * index,
          index,
        })}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        style={[styles.list, { width: cardWidth }]}
        contentContainerStyle={styles.content}
      />
      <View testID="aura-agent-carousel-pagination" style={styles.pagination}>
        <Text style={[styles.pageLabel, { color: colors.textMuted }]}>
          {getAgentCarouselPageLabel(activeIndex, outfits.length)}
        </Text>
        <View style={styles.dots}>
          {outfits.map((outfit, index) => {
            const active = index === activeIndex;
            return (
              <View
                key={outfit.outfitId}
                testID={active ? "aura-agent-carousel-dot-active" : "aura-agent-carousel-dot"}
                style={[
                  styles.dot,
                  {
                    backgroundColor: active ? colors.ctaCream : colors.borderSoft,
                    opacity: active ? 0.95 : 0.55,
                    width: active ? 18 : 6,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    alignSelf: "stretch",
    gap: 8,
    overflow: "visible",
    width: "100%",
  },
  singleCard: {
    alignSelf: "stretch",
    width: "100%",
  },
  list: {
    alignSelf: "center",
    overflow: "visible",
  },
  content: {
    alignItems: "stretch",
  },
  page: {
    alignSelf: "stretch",
  },
  pagination: {
    alignItems: "center",
    gap: 5,
    justifyContent: "center",
  },
  pageLabel: {
    fontFamily: Fonts.sans,
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 15,
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
  },
  dot: {
    borderRadius: 999,
    height: 6,
  },
});
