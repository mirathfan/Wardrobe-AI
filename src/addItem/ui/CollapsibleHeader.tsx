import React from "react";
import { Pressable, Text } from "react-native";

export const CollapsibleHeader = React.memo(function CollapsibleHeader({
  title,
  expanded,
  onPress,
}: {
  title: string;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "800" }}>{title}</Text>
      <Text style={{ color: "#666", fontWeight: "800" }}>{expanded ? "⌃" : "⌄"}</Text>
    </Pressable>
  );
});
