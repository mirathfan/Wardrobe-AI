import React from "react";
import { Text, View } from "react-native";

export const RequiredBadge = React.memo(function RequiredBadge() {
  return (
    <View
      style={{
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 999,
        backgroundColor: "#f4f4f5",
        borderWidth: 1,
        borderColor: "#e4e4e7",
      }}
    >
      <Text style={{ color: "#444", fontSize: 11, fontWeight: "800" }}>Required</Text>
    </View>
  );
});
