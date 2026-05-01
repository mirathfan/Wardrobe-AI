import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export function ClosetControlsRow({
  sortLabel,
  statusLabel,
  onOpenFilters,
}: {
  sortLabel: string;
  statusLabel: string;
  onOpenFilters: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View style={{ flexDirection: "row", gap: 11 }}>
      <AuraPressable
        onPress={onOpenFilters}
        haptic="selection"
        hapticTrigger="press"
        pressedScale={0.97}
        pressedOpacity={0.88}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: layout.pillRadius,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          height: 42,
        }}
      >
        <Ionicons name="options-outline" size={16} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>Filters</Text>
      </AuraPressable>

      <View
        style={{
          flex: 1,
          borderRadius: layout.pillRadius,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          justifyContent: "center",
          height: 42,
        }}
      >
        <Text
          style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {statusLabel} · {sortLabel}
        </Text>
      </View>
    </View>
  );
}
