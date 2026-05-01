import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";

import { Fonts, ThemeTokens } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";

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
      "rgba(243,223,195,0.45)",
      "rgba(243,190,221,0.28)",
      "rgba(184,217,255,0.34)",
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
            colors={innerOverlayColors ?? ["rgba(255,255,255,0.07)", "rgba(255,255,255,0.03)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <Text style={[styles.label, labelColor ? { color: labelColor } : null, labelStyle]}>{label}</Text>
      </View>
    </AuraPressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 58,
    borderRadius: palette.radii.button,
    overflow: "hidden",
    shadowColor: palette.colors.auraLavender,
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  disabled: {
    opacity: 0.5,
  },
  inner: {
    flex: 1,
    margin: 1,
    borderRadius: palette.radii.button - 1,
    backgroundColor: "rgba(16,18,24,0.86)",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: palette.colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Fonts.sans,
    letterSpacing: 0.4,
  },
});
