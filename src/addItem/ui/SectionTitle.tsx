import React from "react";
import { Text, View } from "react-native";

export const SectionTitle = React.memo(function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
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
        <Text style={{ fontSize: 18, fontWeight: "800" }}>{title}</Text>
        {right}
      </View>
      {subtitle ? <Text style={{ color: "#666", lineHeight: 18 }}>{subtitle}</Text> : null}
    </View>
  );
});
