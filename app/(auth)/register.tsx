import { Link, router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { auth } from "../../src/lib/firebase";

function norm(value: string) {
  return value.trim();
}

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    const e = norm(email).toLowerCase();
    const p = password;
    const cp = confirmPassword;

    if (!e) return Alert.alert("Missing email", "Enter your email.");
    if (!p) return Alert.alert("Missing password", "Enter a password.");
    if (p.length < 6) return Alert.alert("Weak password", "Use at least 6 characters.");
    if (p !== cp) return Alert.alert("Password mismatch", "Passwords do not match.");

    try {
      setLoading(true);
      await createUserWithEmailAndPassword(auth, e, p);
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Registration failed", err?.message ?? "Unable to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "900", textAlign: "center" }}>
        Register
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Email"
        style={input}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
        style={input}
      />

      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholder="Confirm password"
        style={input}
      />

      <Pressable onPress={onRegister} style={[btnPrimary, loading ? { opacity: 0.6 } : null]} disabled={loading}>
        <Text style={btnPrimaryText}>{loading ? "Creating..." : "Create account"}</Text>
      </Pressable>

      <Link href="/(auth)/login" asChild>
        <Pressable style={btnSecondary}>
          <Text style={btnSecondaryText}>Back to login</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const input = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 12,
  fontSize: 16,
} as const;

const btnPrimary = {
  marginTop: 4,
  paddingVertical: 14,
  borderRadius: 12,
  backgroundColor: "#111",
  alignItems: "center",
} as const;

const btnPrimaryText = {
  color: "#fff",
  fontWeight: "900",
} as const;

const btnSecondary = {
  paddingVertical: 12,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#ddd",
  alignItems: "center",
} as const;

const btnSecondaryText = {
  color: "#111",
  fontWeight: "800",
} as const;
