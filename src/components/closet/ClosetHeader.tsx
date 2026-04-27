import React from "react";
import { Text, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export function ClosetHeader({
  totalCount,
  visibleCount,
  statusFilter,
}: {
  totalCount: number;
  visibleCount: number;
  statusFilter: string;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 7 }}>
        <Text style={{ color: colors.text, fontSize: 28 * layout.titleScale, fontWeight: "900", letterSpacing: -0.5 }}>
          Closet
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>
            {totalCount} pieces
          </Text>
          <View
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              backgroundColor: colors.textSecondary,
              opacity: 0.6,
            }}
          />
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "700" }}>
            {statusFilter === "ALL"
              ? `${visibleCount} visible`
              : `${visibleCount} ${statusFilter.replace(/_/g, " ").toLowerCase()}`}
          </Text>
        </View>
      </View>
    </View>
  );
}
