import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ThemeTokens } from "@/constants/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import AuraPressable from "@/src/components/aura/AuraPressable";

const palette = ThemeTokens.dark;
const USE_WEB_BLUR_FALLBACK = Platform.OS === "web";

function CardBackdrop({ intensity, warmHero }: { intensity: number; warmHero?: boolean }) {
  if (USE_WEB_BLUR_FALLBACK && !warmHero) {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: warmHero
              ? "rgba(43,18,76,0.16)"
              : intensity >= 26
                ? palette.colors.surfaceBase
                : palette.colors.surfaceSoft,
          },
        ]}
      />
    );
  }

  return (
    <BlurView
      pointerEvents="none"
      intensity={intensity}
      tint="dark"
      style={StyleSheet.absoluteFill}
    />
  );
}

export default function AuraGlassCard({
  children,
  style,
  contentStyle,
  auraBorder = false,
  iridescentBorder = false,
  warmHero = false,
  intensity = 28,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  auraBorder?: boolean;
  iridescentBorder?: boolean;
  warmHero?: boolean;
  intensity?: number;
  onPress?: () => void;
}) {
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 8);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withTiming(1, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
    translateY.value = withTiming(0, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [opacity, reduceMotion, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
  const showGradientBorder = auraBorder || iridescentBorder;
  const borderColors: readonly [string, string, string] = iridescentBorder
    ? [
        palette.colors.iridescentStart,
        palette.colors.iridescentMid,
        palette.colors.iridescentEnd,
      ]
    : [
        "rgba(223,182,178,0.22)",
        "rgba(82,43,91,0.18)",
        "rgba(251,228,216,0.12)",
      ];

  return (
    <Animated.View style={[animatedStyle, style]}>
      {onPress ? (
        <AuraPressable
          onPress={onPress}
          pressedScale={0.985}
          pressedOpacity={0.98}
          style={[styles.shell, warmHero ? styles.warmShell : null]}
        >
          {showGradientBorder ? (
            <LinearGradient
              colors={borderColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientBorder}
            />
          ) : null}
          <View
            style={[
              styles.inner,
              showGradientBorder ? styles.innerInset : null,
              warmHero ? styles.warmInner : null,
              contentStyle,
            ]}
          >
            <CardBackdrop intensity={intensity} warmHero={warmHero} />
            {warmHero ? <View pointerEvents="none" style={styles.warmGlow} /> : null}
            <LinearGradient
              pointerEvents="none"
              colors={
                warmHero
                  ? ["rgba(251,228,216,0.035)", "rgba(251,228,216,0.006)"]
                  : ["rgba(251,228,216,0.05)", "rgba(251,228,216,0.012)"]
              }
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {children}
          </View>
        </AuraPressable>
      ) : (
        <View style={[styles.shell, warmHero ? styles.warmShell : null]}>
          {showGradientBorder ? (
            <LinearGradient
              colors={borderColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradientBorder}
            />
          ) : null}
          <View
            style={[
              styles.inner,
              showGradientBorder ? styles.innerInset : null,
              warmHero ? styles.warmInner : null,
              contentStyle,
            ]}
          >
            <CardBackdrop intensity={intensity} warmHero={warmHero} />
            {warmHero ? <View pointerEvents="none" style={styles.warmGlow} /> : null}
            <LinearGradient
              pointerEvents="none"
              colors={
                warmHero
                  ? ["rgba(251,228,216,0.035)", "rgba(251,228,216,0.006)"]
                  : ["rgba(251,228,216,0.05)", "rgba(251,228,216,0.012)"]
              }
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {children}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: palette.radii.card,
    overflow: "hidden",
    backgroundColor: palette.colors.surfaceBase,
    borderWidth: 1,
    borderColor: palette.colors.borderSoft,
  },
  warmShell: {
    backgroundColor: "rgba(9,0,11,0.04)",
    borderColor: "rgba(251,228,216,0.12)",
  },
  gradientBorder: {
    ...StyleSheet.absoluteFillObject,
    padding: 1,
    borderRadius: palette.radii.card,
  },
  inner: {
    overflow: "hidden",
    backgroundColor: palette.colors.surfaceBase,
  },
  warmInner: {
    backgroundColor: "rgba(9,0,11,0.08)",
  },
  innerInset: {
    margin: 1,
    borderRadius: palette.radii.card - 1,
    backgroundColor: palette.colors.surfaceBase,
  },
  warmGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(223,182,178,0.012)",
  },
});
