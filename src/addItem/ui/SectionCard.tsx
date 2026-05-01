import React from "react";
import { View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export const SectionCard = React.memo(function SectionCard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View
      style={{
        gap: 12,
        padding: layout.cardPadding,
        borderRadius: layout.mediumRadius,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "rgba(255,255,255,0.045)",
        shadowColor: colors.shadow,
        shadowOpacity: 0.12,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 2,
      }}
    >
      {children}
    </View>
  );
});
