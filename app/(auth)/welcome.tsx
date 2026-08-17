import { router } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";

import { Fonts } from "@/constants/theme";
import AuraGlowBackground from "@/src/components/aura/AuraGlowBackground";
import AuraGradientButton from "@/src/components/aura/AuraGradientButton";
import AuraLogoHero from "@/src/components/aura/AuraLogoHero";
import { SafeScreen } from "@/src/components/SafeScreen";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export default function WelcomeScreen() {
  const { colors, theme } = useAppTheme();

  return (
    <AuraGlowBackground>
      <SafeScreen backgroundColor="transparent" includeBottomInset={false} minBottomPadding={24} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 28,
            justifyContent: "space-between",
          }}
        >
          <View />

          <View style={{ alignItems: "center", gap: 22 }}>
            <Animated.View entering={FadeIn.duration(550).easing(Easing.out(Easing.cubic))}>
              <AuraLogoHero size={232} />
            </Animated.View>

            <Animated.View
              entering={FadeInDown.duration(650).delay(120).easing(Easing.out(Easing.cubic))}
              style={{ alignItems: "center", gap: 10 }}
            >
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: theme.typography.subtitle.fontSize,
                  lineHeight: theme.typography.subtitle.lineHeight,
                  fontWeight: theme.typography.subtitle.fontWeight,
                  fontFamily: Fonts.sans,
                  textAlign: "center",
                }}
              >
                Your personal AI stylist.
              </Text>
            </Animated.View>
          </View>

          <Animated.View
            entering={FadeInUp.duration(700).delay(220).easing(Easing.out(Easing.cubic))}
            style={{ gap: 16 }}
          >
            <AuraGradientButton label="Get Started" onPress={() => router.push("/(auth)/register")} />
            <View style={{ alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => router.push("/(auth)/login")} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "600", fontFamily: Fonts.sans }}>
                  Already have an account? Sign In
                </Text>
              </Pressable>
              <Pressable onPress={() => router.push("/(auth)/forgot-password")} style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: Fonts.sans }}>
                  Forgot password
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </SafeScreen>
    </AuraGlowBackground>
  );
}
