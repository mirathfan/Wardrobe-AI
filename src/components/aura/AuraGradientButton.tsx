import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { Colors, Fonts, ThemeTokens } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { CTA_HEIGHT, PILL_RADIUS } from "@/src/constants/auraControls";

const palette = ThemeTokens.dark;

export default function AuraGradientButton({
  label,
  onPress,
  style,
  disabled = false,
  gradientColors,
  labelColor,
  labelStyle,
  innerBackgroundColor,
  innerOverlayColors,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
  gradientColors?: readonly [string, string, ...string[]];
  labelColor?: string;
  innerBackgroundColor?: string;
  innerOverlayColors?: readonly [string, string, ...string[]] | null;
}) {
  const colors =
    gradientColors ??
    ([
      palette.colors.ctaCream,
      palette.colors.ctaCream,
    ] as const);
  return (
    <AuraPressable
      disabled={disabled}
      onPress={onPress}
      haptic="light"
      pressedScale={0.97}
      pressedOpacity={0.92}
      style={[styles.pressable, style, disabled ? styles.disabled : null]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.inner, innerBackgroundColor ? { backgroundColor: innerBackgroundColor } : null]}>
        {innerOverlayColors === null ? null : (
          <LinearGradient
            pointerEvents="none"
            colors={innerOverlayColors ?? ["rgba(251,228,216,0.08)", "rgba(251,228,216,0.02)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <Text style={[styles.label, disabled ? { color: Colors.dark.textMuted } : null, labelColor && !disabled ? { color: labelColor } : null, labelStyle]}>{label}</Text>
      </View>
    </AuraPressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: CTA_HEIGHT,
    borderRadius: PILL_RADIUS,
    overflow: "hidden",
    shadowColor: palette.colors.ctaCream,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  disabled: {
    opacity: 0.58,
  },
  inner: {
    flex: 1,
    margin: 1,
    borderRadius: PILL_RADIUS,
    backgroundColor: palette.colors.ctaCream,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: Colors.dark.ctaText,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Fonts.sans,
    letterSpacing: 0.4,
  },
});
