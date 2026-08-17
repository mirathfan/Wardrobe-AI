import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { Colors } from "@/constants/theme";

type BrandedLoadingAnimationProps = {
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function BrandedLoadingAnimation({
  style,
}: BrandedLoadingAnimationProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        {
          borderRadius: 999,
          borderWidth: 1,
          borderColor: Colors.dark.borderSoft,
          backgroundColor: Colors.dark.surfaceMuted,
        },
        style,
      ]}
    />
  );
}
