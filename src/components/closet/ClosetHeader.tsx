import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { auraTypography } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export function ClosetHeader({
  totalCount,
  onOpenOrganize,
  hasActiveOrganizeState = false,
}: {
  totalCount: number;
  onOpenOrganize: () => void;
  hasActiveOrganizeState?: boolean;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <View style={{ gap: 3, flex: 1 }}>
        <Text
          style={[
            auraTypography.screenTitle,
            {
              color: colors.text,
              fontSize: 27 * layout.titleScale,
              lineHeight: 32 * layout.titleScale,
            },
          ]}
        >
          Closet
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 17, fontWeight: "700" }}>
          {totalCount} piece{totalCount === 1 ? "" : "s"}
        </Text>
      </View>
      <Pressable
        onPress={onOpenOrganize}
        accessibilityRole="button"
        accessibilityLabel="Organize closet"
        style={({ pressed }) => ({
          width: 42,
          height: 42,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: pressed ? "rgba(251,228,216,0.10)" : "rgba(251,228,216,0.055)",
          borderWidth: 1,
          borderColor: "rgba(251,228,216,0.12)",
          opacity: pressed ? 0.82 : 1,
        })}
      >
        <Ionicons name="options-outline" size={19} color={colors.text} />
        {hasActiveOrganizeState ? (
          <View
            style={{
              position: "absolute",
              top: 9,
              right: 9,
              width: 7,
              height: 7,
              borderRadius: 999,
              backgroundColor: colors.ctaCream,
            }}
          />
        ) : null}
      </Pressable>
    </View>
  );
}
