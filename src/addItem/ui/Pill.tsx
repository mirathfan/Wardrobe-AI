import React from "react";
import { Text } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";
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
        minHeight: 38,
        justifyContent: "center",
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? colors.ctaCream : colors.border,
        backgroundColor: active ? colors.ctaCream : colors.chipBackground,
      }}
    >
      <Text
        style={{
          color: active ? colors.ctaText : colors.text,
          fontSize: 13,
          lineHeight: 17,
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </AuraPressable>
  );
});
