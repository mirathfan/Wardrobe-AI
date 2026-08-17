import React from "react";
import { Text, View } from "react-native";

import { auraTypography } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const SectionTitle = React.memo(function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={{ gap: subtitle ? 4 : 0 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <Text style={[auraTypography.cardTitle, { color: colors.text }]}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
});
