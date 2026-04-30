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

function CardBackdrop({ intensity }: { intensity: number }) {
  if (USE_WEB_BLUR_FALLBACK) {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              intensity >= 26 ? "rgba(10,10,15,0.9)" : "rgba(10,10,15,0.84)",
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
        "rgba(243,223,195,0.34)",
        "rgba(243,190,221,0.18)",
        "rgba(184,217,255,0.24)",
      ];

  return (
    <Animated.View style={[animatedStyle, style]}>
      {onPress ? (
        <AuraPressable
          onPress={onPress}
          pressedScale={0.985}
          pressedOpacity={0.98}
          style={styles.shell}
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
            <CardBackdrop intensity={intensity} />
            {warmHero ? <View pointerEvents="none" style={styles.warmGlow} /> : null}
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.015)"]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {children}
          </View>
        </AuraPressable>
      ) : (
        <View style={styles.shell}>
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
            <CardBackdrop intensity={intensity} />
            {warmHero ? <View pointerEvents="none" style={styles.warmGlow} /> : null}
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.015)"]}
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
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: palette.colors.borderSoft,
  },
  gradientBorder: {
    ...StyleSheet.absoluteFillObject,
    padding: 1,
    borderRadius: palette.radii.card,
  },
  inner: {
    overflow: "hidden",
    backgroundColor: palette.colors.surfaceGlass,
  },
  warmInner: {
    backgroundColor: palette.colors.surfaceWarm,
  },
  innerInset: {
    margin: 1,
    borderRadius: palette.radii.card - 1,
    backgroundColor: palette.colors.surface1,
  },
  warmGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: palette.colors.warmGlow,
  },
});
