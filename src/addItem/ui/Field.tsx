import React from "react";
import { Text, View } from "react-native";

import { auraTypography } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const Field = React.memo(function Field({
  label,
  children,
  right,
}: {
  label: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>
          {label}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
});
