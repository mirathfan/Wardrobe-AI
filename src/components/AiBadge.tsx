import React from "react";
import { Text, View } from "react-native";
import { AI_ACCENT } from "./AiAccent";

export const AiBadge = React.memo(function AiBadge({
  label = "AI",
}: {
  label?: string;
}) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingVertical: 3,
        paddingHorizontal: 8,
        backgroundColor: AI_ACCENT.badgeBg,
        borderWidth: 1,
        borderColor: AI_ACCENT.border,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "800", color: AI_ACCENT.badgeText }}>
        ✨ {label}
      </Text>
    </View>
  );
});
