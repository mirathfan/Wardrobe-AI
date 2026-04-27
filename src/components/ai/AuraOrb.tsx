import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Animated, View } from "react-native";

import { auraTheme } from "./aiTheme";

export default function AuraOrb({
  scale,
  glow,
  activityGlow,
}: {
  scale: Animated.AnimatedInterpolation<number>;
  glow: Animated.AnimatedInterpolation<number>;
  activityGlow: Animated.AnimatedInterpolation<number>;
}) {
  return (
    <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
      <Animated.View
        style={{
          position: "absolute",
          width: 22,
          height: 22,
          borderRadius: 999,
          backgroundColor: "rgba(216,200,255,0.2)",
          opacity: glow,
          transform: [{ scale }],
          shadowColor: auraTheme.accent,
          shadowOpacity: 0.24,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Animated.View
        style={{
          position: "absolute",
          width: 18,
          height: 18,
          borderRadius: 999,
          backgroundColor: "rgba(184,217,255,0.12)",
          opacity: activityGlow,
          transform: [{ scale }],
        }}
      />
      <Animated.View
        style={{
          width: 15,
          height: 15,
          borderRadius: 999,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,245,234,0.14)",
          transform: [{ scale }],
        }}
      >
        <LinearGradient
          colors={["rgba(243,223,195,0.98)", "rgba(243,190,221,0.75)", "rgba(184,217,255,0.58)"]}
          start={{ x: 0.1, y: 0.08 }}
          end={{ x: 0.88, y: 0.92 }}
          style={{ flex: 1, borderRadius: 999 }}
        />
        <View
          style={{
            position: "absolute",
            inset: 1.4,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(5,6,8,0.76)",
            backgroundColor: "rgba(5,6,8,0.82)",
          }}
        />
        <View
          style={{
            position: "absolute",
            top: 2.4,
            left: 2.4,
            width: 3,
            height: 3,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.68)",
          }}
        />
      </Animated.View>
    </View>
  );
}
