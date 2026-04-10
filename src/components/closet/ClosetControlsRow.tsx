import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

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
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Pressable
        onPress={onOpenFilters}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderRadius: layout.pillRadius,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      >
        <Ionicons name="options-outline" size={16} color={colors.text} />
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>Filters</Text>
      </Pressable>

      <View
        style={{
          flex: 1,
          borderRadius: layout.pillRadius,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: 14,
          paddingVertical: 9,
          justifyContent: "center",
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
