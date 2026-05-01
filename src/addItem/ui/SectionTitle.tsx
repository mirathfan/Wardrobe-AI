import React from "react";
import { Text, View } from "react-native";

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
        <Text style={{ color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "900" }}>
          {title}
        </Text>
        {right}
      </View>
      {subtitle ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
});
