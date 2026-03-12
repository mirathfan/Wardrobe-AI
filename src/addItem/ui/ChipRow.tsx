import React from "react";
import { View } from "react-native";

export const ChipRow = React.memo(function ChipRow({
  children,
}: {
  children: React.ReactNode;
}) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
});
