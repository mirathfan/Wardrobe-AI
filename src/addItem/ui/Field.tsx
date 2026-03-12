import React from "react";
import { Text, View } from "react-native";

export const Field = React.memo(function Field({
  label,
  children,
  right,
}: {
  label: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
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
        <Text style={{ fontSize: 16, fontWeight: "700" }}>{label}</Text>
        {right}
      </View>
      {children}
    </View>
  );
});
