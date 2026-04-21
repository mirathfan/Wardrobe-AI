import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
  AuthInlineLink,
  AuthInput,
  AuthScaffold,
  PrimaryAuthButton,
} from "@/src/components/auth/AuthScaffold";
import { auth } from "@/src/lib/firebase";

function normalize(value: string) {
  return value.trim();
}

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onLogin() {
    const normalizedEmail = normalize(email).toLowerCase();
    if (!normalizedEmail) return Alert.alert("Missing email", "Enter your email.");
    if (!password) return Alert.alert("Missing password", "Enter your password.");

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (error: any) {
      Alert.alert("Sign in failed", error?.message ?? "Unable to sign in right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      eyebrow="WARDROBE AI"
      title="Welcome back"
      subtitle="Sign in to pick up your wardrobe, planner, and AURA recommendations."
      footer={
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <AuthInlineLink label="Create account" onPress={() => router.push("/(auth)/register")} />
          <AuthInlineLink label="Forgot password?" onPress={() => router.push("/(auth)/forgot-password")} />
        </View>
      }
    >
      <AuthInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="Email"
      />
      <AuthInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        placeholder="Password"
      />
      <PrimaryAuthButton label={loading ? "Signing in..." : "Sign In"} onPress={onLogin} disabled={loading} />
      <Text style={{ color: "rgba(255,255,255,0.58)", fontSize: 13, lineHeight: 19 }}>
        Your styling profile, saved looks, and planner stay synced to this account.
      </Text>
    </AuthScaffold>
  );
}

