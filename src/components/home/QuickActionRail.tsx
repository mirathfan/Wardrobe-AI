import React from "react";
import { Pressable, ScrollView, Text } from "react-native";

import type { AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export type QuickActionItem = {
  key: string;
  label: string;
  prompt: string;
};

export default function QuickActionRail({
  colors,
  actions,
  onPressAction,
}: {
  colors: AppColors;
  actions: QuickActionItem[];
  onPressAction: (action: QuickActionItem) => void;
}) {
  const layout = useResponsiveLayout();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
      {actions.map((action) => (
        <Pressable
          key={action.key}
          onPress={() => onPressAction(action)}
          style={({ pressed }) => ({
            borderRadius: layout.pillRadius,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>{action.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
