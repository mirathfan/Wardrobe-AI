import React from "react";
import { View } from "react-native";

import { auraCardStyle } from "@/src/components/ui/auraStylePrimitives";
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
        ...auraCardStyle(colors, "card"),
        padding: layout.cardPadding,
        borderRadius: layout.mediumRadius,
        shadowColor: colors.shadow,
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 1,
      }}
    >
      {children}
    </View>
  );
});
