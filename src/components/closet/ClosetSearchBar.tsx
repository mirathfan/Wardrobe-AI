import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { TextInput, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export function ClosetSearchBar({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: layout.pillRadius + 2,
        borderWidth: 1,
        borderColor: "rgba(251,228,216,0.065)",
        backgroundColor: "rgba(251,228,216,0.04)",
        paddingHorizontal: 12,
        height: 41,
      }}
    >
      <Ionicons name="search-outline" size={17} color="rgba(251,228,216,0.58)" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search by item, brand, category, color"
        placeholderTextColor="rgba(251,228,216,0.50)"
        numberOfLines={1}
        style={{
          flex: 1,
          color: colors.text,
          fontSize: 13.5,
          fontWeight: "600",
          paddingVertical: 0,
          includeFontPadding: false,
        }}
      />
    </View>
  );
}
