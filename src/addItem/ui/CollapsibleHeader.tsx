import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const CollapsibleHeader = React.memo(function CollapsibleHeader({
  title,
  expanded,
  onPress,
}: {
  title: string;
  expanded: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.98}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: 36,
        gap: 12,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: "900" }}>
        {title}
      </Text>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.chipBackground,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textSecondary}
        />
      </View>
    </AuraPressable>
  );
});
