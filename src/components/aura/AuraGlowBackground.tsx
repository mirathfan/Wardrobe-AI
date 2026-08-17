import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";

import { ThemeTokens } from "@/constants/theme";

const palette = ThemeTokens.dark;

function GlowBlob({
  size,
  color,
  top,
  left,
  right,
  bottom,
  opacity = 1,
}: {
  size: number;
  color: string;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  opacity?: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        top,
        left,
        right,
        bottom,
        opacity,
        shadowColor: color,
        shadowOpacity: 0.34,
        shadowRadius: size * 0.32,
        shadowOffset: { width: 0, height: 0 },
      }}
    />
  );
}

export default function AuraGlowBackground({
  children,
  contentStyle,
}: {
  children?: React.ReactNode;
  contentStyle?: object;
}) {
  return (
    <View style={[styles.container, contentStyle]}>
      <LinearGradient
        colors={palette.gradients.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <GlowBlob size={220} color={palette.colors.auraPink} top={110} left={-30} opacity={0.026} />
      <GlowBlob size={260} color={palette.colors.auraBlue} top={190} right={-50} opacity={0.022} />
      <GlowBlob size={220} color={palette.colors.auraLavender} bottom={160} left={10} opacity={0.024} />
      <LinearGradient
        pointerEvents="none"
        colors={["rgba(251,228,216,0.014)", "transparent"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.45 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.colors.background,
  },
});
