import React from "react";
import {
  SafeAreaView,
  type Edge,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { View, type StyleProp, type ViewStyle } from "react-native";

export function SafeScreen({
  children,
  edges = ["top", "bottom"],
  style,
  contentStyle,
  backgroundColor,
  minTopPadding = 0,
  minBottomPadding = 0,
}: {
  children: React.ReactNode;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  minTopPadding?: number;
  minBottomPadding?: number;
}) {
  const insets = useSafeAreaInsets();
  const includesTop = edges.includes("top");
  const includesBottom = edges.includes("bottom");

  return (
    <SafeAreaView
      edges={edges}
      style={[{ flex: 1, backgroundColor }, style]}
    >
      <View
        style={[
          {
            flex: 1,
            paddingTop: (includesTop ? 0 : insets.top) + minTopPadding,
            paddingBottom: (includesBottom ? 0 : insets.bottom) + minBottomPadding,
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}
