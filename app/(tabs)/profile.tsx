import { router } from "expo-router";
import { signOut } from "firebase/auth";
import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { useAuth } from "../../src/hooks/useAuth";
import { auth } from "../../src/lib/firebase";

export default function ProfileScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    try {
      setLoading(true);
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (err: any) {
      Alert.alert("Logout failed", err?.message ?? "Unable to sign out.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: "900" }}>Profile</Text>
      <Text style={{ color: "#444" }}>{user?.email ?? "No email found."}</Text>

      <Pressable onPress={onLogout} style={[btn, loading ? { opacity: 0.6 } : null]} disabled={loading}>
        <Text style={btnText}>{loading ? "Signing out..." : "Log out"}</Text>
      </Pressable>
    </View>
  );
}

const btn = {
  marginTop: 6,
  paddingVertical: 14,
  borderRadius: 12,
  backgroundColor: "#111",
  alignItems: "center",
} as const;

const btnText = {
  color: "#fff",
  fontWeight: "900",
} as const;
