import { router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { Alert, View } from "react-native";

import {
  AuthInlineLink,
  AuthInput,
  AuthScaffold,
  PrimaryAuthButton,
} from "@/src/components/auth/AuthScaffold";
import { auth } from "@/src/lib/firebase";
import { EMPTY_USER_PROFILE_PREFERENCES, saveUserAccountProfile, saveUserProfilePreferences } from "@/src/lib/userProfile";

function normalize(value: string) {
  return value.trim();
}

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    const normalizedName = normalize(name);
    const normalizedEmail = normalize(email).toLowerCase();
    if (!normalizedName) return Alert.alert("Missing name", "Enter your first name.");
    if (!normalizedEmail) return Alert.alert("Missing email", "Enter your email.");
    if (!password) return Alert.alert("Missing password", "Enter a password.");
    if (password.length < 6) return Alert.alert("Weak password", "Use at least 6 characters.");
    if (password !== confirmPassword) {
      return Alert.alert("Password mismatch", "Passwords do not match.");
    }

    try {
      setLoading(true);
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      await Promise.all([
        saveUserAccountProfile(credential.user.uid, { name: normalizedName }),
        saveUserProfilePreferences(credential.user.uid, {
          ...EMPTY_USER_PROFILE_PREFERENCES,
          firstName: normalizedName,
          onboardingCompleted: false,
        }),
      ]);
      router.replace("/(onboarding)");
    } catch (error: any) {
      Alert.alert("Create account failed", error?.message ?? "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      eyebrow="NEW ACCOUNT"
      title="Create your wardrobe profile"
      subtitle="Set up Wardrobe AI so AURA can personalize from your first session."
      footer={
        <View style={{ alignItems: "flex-start" }}>
          <AuthInlineLink label="Already have an account? Sign in" onPress={() => router.replace("/(auth)/login")} />
        </View>
      }
    >
      <AuthInput value={name} onChangeText={setName} autoComplete="name" placeholder="First name" />
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
        autoComplete="new-password"
        placeholder="Password"
      />
      <AuthInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
        placeholder="Confirm password"
      />
      <PrimaryAuthButton label={loading ? "Creating..." : "Create Account"} onPress={onRegister} disabled={loading} />
    </AuthScaffold>
  );
}

