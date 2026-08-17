import React from "react";
import { Text } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";
import { auraChipStyle, auraChipTextStyle } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const Pill = React.memo(function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.96}
      pressedOpacity={0.88}
      style={{
        ...auraChipStyle(colors, active ? "selected" : "unselected"),
        paddingHorizontal: 14,
      }}
    >
      <Text
        style={[
          auraChipTextStyle(colors, active ? "selected" : "unselected"),
          { fontSize: 13, lineHeight: 17 },
        ]}
      >
        {label}
      </Text>
    </AuraPressable>
  );
});
