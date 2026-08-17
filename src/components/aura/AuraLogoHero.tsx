import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Fonts, ThemeTokens } from "@/constants/theme";

import AnimatedAuraRing from "./AnimatedAuraRing";

const palette = ThemeTokens.dark;

export function AuraLogoMark({
  size = 220,
  animated = true,
  ringRotationDuration,
}: {
  size?: number;
  animated?: boolean;
  ringRotationDuration?: number;
}) {
  const apexTop = size * 0.28;
  const legHeight = size * 0.42;
  const legWidth = Math.max(18, size * 0.082);

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <AnimatedAuraRing size={size} animated={animated} rotationDuration={ringRotationDuration} />
      <View
        style={{
          position: "absolute",
          top: apexTop,
          width: size * 0.56,
          height: legHeight,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View style={[styles.leg, { width: legWidth, height: legHeight, transform: [{ rotate: "27deg" }, { translateX: -size * 0.1 }] }]} />
        <View style={[styles.leg, { width: legWidth, height: legHeight, transform: [{ rotate: "-27deg" }, { translateX: size * 0.1 }] }]} />
      </View>
    </View>
  );
}

export default function AuraLogoHero({
  size = 220,
  showWordmark = true,
}: {
  size?: number;
  showWordmark?: boolean;
}) {
  return (
    <View style={{ alignItems: "center", gap: 26 }}>
      <AuraLogoMark size={size} />
      {showWordmark ? (
        <View style={{ alignItems: "center", gap: 10 }}>
          <Text
            style={{
              color: palette.colors.textPrimary,
              fontSize: palette.typography.wordmark.fontSize,
              letterSpacing: palette.typography.wordmark.letterSpacing,
              fontWeight: palette.typography.wordmark.fontWeight,
              fontFamily: Fonts.sans,
            }}
          >
            AURA
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  leg: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: "#F7F1E8",
  },
});
