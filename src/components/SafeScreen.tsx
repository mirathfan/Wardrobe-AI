import React from "react";
import {
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { dockSpace } from "@/src/constants/dock";

export const SCREEN_TOP_PADDING = 8;
export const SCREEN_BOTTOM_PADDING = 80;

export function SafeScreen({
  children,
  style,
  contentStyle,
  backgroundColor,
  minTopPadding = 0,
  minBottomPadding = 0,
  includeTopInset = true,
  includeBottomInset = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  minTopPadding?: number;
  minBottomPadding?: number;
  includeTopInset?: boolean;
  includeBottomInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const paddingTop = includeTopInset ? insets.top + SCREEN_TOP_PADDING + minTopPadding : minTopPadding;
  const paddingBottom = includeBottomInset
    ? Math.max(insets.bottom + SCREEN_BOTTOM_PADDING, dockSpace(insets.bottom) + 24, 100) +
      minBottomPadding
    : minBottomPadding;

  return (
    <View style={[{ flex: 1, backgroundColor }, style]}>
      <View
        style={[
          {
            flex: 1,
            paddingTop,
            paddingBottom,
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}
