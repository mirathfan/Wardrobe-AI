import React from "react";
import { View } from "react-native";

export const SectionCard = React.memo(function SectionCard({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        gap: 12,
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#ececec",
        backgroundColor: "#fff",
      }}
    >
      {children}
    </View>
  );
});
