import React from "react";
import { Text, View } from "react-native";

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
        <Text style={{ color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: "800" }}>
          {label}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
});
