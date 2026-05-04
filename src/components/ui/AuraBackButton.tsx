import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { type StyleProp, type ViewStyle } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";

type AuraBackButtonProps = {
  onPress: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function AuraBackButton({
  onPress,
  size = 42,
  style,
  accessibilityLabel = "Go back",
}: AuraBackButtonProps) {
  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.96}
      pressedOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(43,18,76,0.72)",
          borderWidth: 1,
          borderColor: "rgba(251,228,216,0.12)",
        },
        style,
      ]}
    >
      <Ionicons name="chevron-back" size={Math.round(size * 0.5)} color="#FBE4D8" />
    </AuraPressable>
  );
}
