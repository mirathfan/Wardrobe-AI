import { router } from "expo-router";
import React from "react";
import { Text, View } from "react-native";

import {
  AuthInlineLink,
  AuthScaffold,
  PrimaryAuthButton,
  SecondaryAuthButton,
} from "@/src/components/auth/AuthScaffold";

export default function WelcomeScreen() {
  return (
    <AuthScaffold
      eyebrow="WARDROBE AI"
      title="Your personal styling system"
      subtitle="Build a sharper closet, smarter outfits, and a more personal AURA from day one."
      footer={
        <View style={{ alignItems: "center", gap: 10 }}>
          <AuthInlineLink label="Forgot password" onPress={() => router.push("/(auth)/forgot-password")} />
          <Text style={{ color: "rgba(255,255,255,0.48)", fontSize: 13, textAlign: "center", lineHeight: 19 }}>
            No split UI. One premium experience, adapted through your style profile.
          </Text>
        </View>
      }
    >
      <PrimaryAuthButton label="Sign In" onPress={() => router.push("/(auth)/login")} />
      <SecondaryAuthButton label="Create Account" onPress={() => router.push("/(auth)/register")} />
    </AuthScaffold>
  );
}

