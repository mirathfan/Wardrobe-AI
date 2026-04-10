import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { dockSpace } from "@/src/constants/dock";
import { layoutTokens, type ResponsiveSizeCategory } from "@/src/constants/layout";
import { SCREEN_BOTTOM_PADDING, SCREEN_TOP_PADDING } from "@/src/components/SafeScreen";

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const shortestSide = Math.min(width, height);
    const screenSize: ResponsiveSizeCategory =
      shortestSide < 375 ? "compact" : shortestSide >= 430 ? "large" : "regular";

    const horizontalPadding = screenSize === "compact" ? 16 : layoutTokens.pagePadding;
    const sectionGap = screenSize === "compact" ? 16 : layoutTokens.sectionGap;
    const cardPadding = screenSize === "compact" ? 14 : layoutTokens.cardPadding;
    const largeRadius = screenSize === "compact" ? 22 : layoutTokens.radii.large;
    const mediumRadius = screenSize === "compact" ? 18 : layoutTokens.radii.medium;
    const pillRadius = screenSize === "compact" ? 20 : layoutTokens.radii.pill;
    const heroHeight = screenSize === "compact" ? 188 : screenSize === "large" ? 216 : 204;
    const smartGridColumns = screenSize === "large" ? 3 : 2;
    const smartToolHeight = screenSize === "compact" ? 108 : 120;
    const continueCardWidth = screenSize === "compact" ? 150 : screenSize === "large" ? 180 : 164;
    const titleScale = screenSize === "compact" ? 0.94 : screenSize === "large" ? 1.05 : 1;
    const topContentInset = insets.top + SCREEN_TOP_PADDING;
    const bottomDockPadding = Math.max(
      insets.bottom + SCREEN_BOTTOM_PADDING,
      dockSpace(insets.bottom) + 24,
      100
    );
    const composerOffset = dockSpace(insets.bottom) + 10;
    const composerHeight = screenSize === "compact" ? 118 : 126;

    return {
      width,
      height,
      screenSize,
      horizontalPadding,
      sectionGap,
      cardPadding,
      largeRadius,
      mediumRadius,
      pillRadius,
      heroHeight,
      smartGridColumns,
      smartToolHeight,
      continueCardWidth,
      titleScale,
      topContentInset,
      bottomDockPadding,
      composerOffset,
      composerHeight,
    };
  }, [height, insets.bottom, insets.top, width]);
}
