import React from "react";
import { type DimensionValue, type StyleProp, type ViewStyle, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";

import { auraDesignTokens } from "./AuraPrimitives";

export function AuraSkeleton({
  width,
  height,
  radius = auraDesignTokens.radii.sm,
  style,
}: {
  width?: DimensionValue;
  height: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.borderSoft,
          opacity: 0.74,
        },
        style,
      ]}
    />
  );
}

export function AuraSkeletonLine({
  width = "100%",
  height = 12,
}: {
  width?: DimensionValue;
  height?: number;
}) {
  return <AuraSkeleton width={width} height={height} radius={999} />;
}
