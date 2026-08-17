import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { ThemeTokens } from "@/constants/theme";

const palette = ThemeTokens.dark;

export default function AnimatedAuraRing({
  size = 220,
  stroke = 2,
  animated = true,
  rotationDuration,
}: {
  size?: number;
  stroke?: number;
  animated?: boolean;
  rotationDuration?: number;
}) {
  const pulse = useSharedValue(animated ? 0 : 1);
  const rotation = useSharedValue(0);

  React.useEffect(() => {
    if (!animated) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    if (rotationDuration) {
      rotation.value = withRepeat(
        withTiming(360, { duration: rotationDuration, easing: Easing.linear }),
        -1,
        false,
      );
    }
  }, [animated, pulse, rotation, rotationDuration]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.22, 0.42]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.98, 1.04]) }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.82, 1]),
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: interpolate(pulse.value, [0, 1], [1, 1.012]) },
    ],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            borderRadius: size / 2,
            shadowColor: palette.colors.auraLavender,
            shadowOpacity: 0.32,
            shadowRadius: 34,
            shadowOffset: { width: 0, height: 0 },
            elevation: 0,
          },
          glowStyle,
        ]}
      />
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: "hidden",
          },
          ringStyle,
        ]}
      >
        <LinearGradient
          colors={palette.gradients.aura}
          start={{ x: 0.04, y: 0.16 }}
          end={{ x: 0.94, y: 0.92 }}
          style={{ flex: 1 }}
        />
        <View
          style={{
            position: "absolute",
            inset: stroke,
            borderRadius: size / 2,
            backgroundColor: palette.colors.background,
          }}
        />
      </Animated.View>
    </View>
  );
}
