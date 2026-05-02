import { router } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import React, { useState } from "react";
import { Alert, Text, View } from "react-native";

import {
  AuthInlineLink,
  AuthInput,
  AuthScaffold,
  PrimaryAuthButton,
} from "@/src/components/auth/AuthScaffold";
import { getAuthErrorMessage } from "@/src/auth/authErrors";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { auth } from "@/src/lib/firebase";

export default function ForgotPasswordScreen() {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onReset() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return Alert.alert("Missing email", "Enter your email.");

    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, normalizedEmail);
      setSent(true);
    } catch (error: any) {
      Alert.alert("Reset failed", getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      eyebrow="RESET ACCESS"
      title="Get back in"
      subtitle="We’ll email you a secure link so you can reset your password without losing your wardrobe."
      footer={
        <View style={{ alignItems: "flex-start" }}>
          <AuthInlineLink label="Back to sign in" onPress={() => router.replace("/(auth)/login")} />
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
        returnKeyType="done"
        onSubmitEditing={onReset}
      />
      <PrimaryAuthButton label={loading ? "Sending..." : "Send reset email"} onPress={onReset} disabled={loading} />
      {sent ? (
        <Text style={{ color: colors.lightPurple, fontSize: 14, lineHeight: 20 }}>
          Reset link sent. Check your inbox and spam folder.
        </Text>
      ) : null}
    </AuthScaffold>
  );
}
