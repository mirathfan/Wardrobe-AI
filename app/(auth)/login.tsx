import AntDesign from "@expo/vector-icons/AntDesign";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
import {
  AuthInlineLink,
  AuthInput,
  AuthScaffold,
  PrimaryAuthButton,
} from "@/src/components/auth/AuthScaffold";
import { getAuthErrorMessage } from "@/src/auth/authErrors";
import { signInWithApple } from "@/src/auth/appleAuth";
import { signInWithGoogle } from "@/src/auth/googleAuth";
import { auth } from "@/src/lib/firebase";

function normalize(value: string) {
  return value.trim();
}

const WEB_AUTH_INPUT_STYLE_ID = "aura-auth-web-inputs";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const authInProgress = loading || appleLoading || googleLoading;

  useEffect(() => {
    let cancelled = false;
    if (Platform.OS !== "ios") return;
    void AppleAuthentication.isAvailableAsync().then((available) => {
      if (!cancelled) setAppleAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    let styleTag = document.getElementById(WEB_AUTH_INPUT_STYLE_ID) as HTMLStyleElement | null;
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = WEB_AUTH_INPUT_STYLE_ID;
      document.head.appendChild(styleTag);
    }

    styleTag.textContent = `
      input[data-testid="auth-email"],
      input[data-testid="auth-password"],
      #auth-email,
      #auth-password {
        color: #FFFFFF !important;
        -webkit-text-fill-color: #FFFFFF !important;
        caret-color: #7C5CFF !important;
        opacity: 1 !important;
        font-weight: 700 !important;
        background: rgba(25, 27, 38, 0.98) !important;
      }

      input[data-testid="auth-email"]::placeholder,
      input[data-testid="auth-password"]::placeholder,
      #auth-email::placeholder,
      #auth-password::placeholder {
        color: rgba(255, 255, 255, 0.22) !important;
        -webkit-text-fill-color: rgba(255, 255, 255, 0.22) !important;
      }

      input[data-testid="auth-email"]:-webkit-autofill,
      input[data-testid="auth-email"]:-webkit-autofill:hover,
      input[data-testid="auth-email"]:-webkit-autofill:focus,
      #auth-email:-webkit-autofill,
      #auth-email:-webkit-autofill:hover,
      #auth-email:-webkit-autofill:focus,
      input[data-testid="auth-password"]:-webkit-autofill,
      input[data-testid="auth-password"]:-webkit-autofill:hover,
      input[data-testid="auth-password"]:-webkit-autofill:focus {
        -webkit-text-fill-color: #FFFFFF !important;
        -webkit-box-shadow: 0 0 0 1000px rgba(25, 27, 38, 0.98) inset !important;
        box-shadow: 0 0 0 1000px rgba(25, 27, 38, 0.98) inset !important;
        transition: background-color 9999s ease-out 0s !important;
      }

      #auth-password:-webkit-autofill,
      #auth-password:-webkit-autofill:hover,
      #auth-password:-webkit-autofill:focus {
        -webkit-text-fill-color: #FFFFFF !important;
        -webkit-box-shadow: 0 0 0 1000px rgba(25, 27, 38, 0.98) inset !important;
        box-shadow: 0 0 0 1000px rgba(25, 27, 38, 0.98) inset !important;
        transition: background-color 9999s ease-out 0s !important;
      }
    `;
  }, []);

  async function onLogin() {
    const normalizedEmail = normalize(email).toLowerCase();
    if (!normalizedEmail) return Alert.alert("Missing email", "Enter your email.");
    if (!password) return Alert.alert("Missing password", "Enter your password.");

    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (error: any) {
      Alert.alert("Sign in failed", getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function onAppleSignIn() {
    try {
      setAppleLoading(true);
      await signInWithApple();
    } catch (error) {
      const message = getAuthErrorMessage(error);
      if (message !== "Sign in cancelled") Alert.alert("Apple sign in failed", message);
    } finally {
      setAppleLoading(false);
    }
  }

  async function onGoogleSignIn() {
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
    } catch (error) {
      const message = getAuthErrorMessage(error);
      if (message !== "Sign in cancelled") Alert.alert("Google sign in failed", message);
    } finally {
      setGoogleLoading(false);
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
      {Platform.OS === "ios" && appleAvailable ? (
        <View pointerEvents={authInProgress ? "none" : "auto"} style={styles.oauthButtonFrame}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={18}
            style={styles.appleButton}
            onPress={onAppleSignIn}
          />
          {appleLoading ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#000000" />
            </View>
          ) : null}
        </View>
      ) : null}
      <Pressable
        disabled={authInProgress}
        onPress={onGoogleSignIn}
        style={({ pressed }) => [
          styles.googleButton,
          {
            opacity: authInProgress ? 0.62 : pressed ? 0.82 : 1,
          },
        ]}
      >
        {googleLoading ? (
          <ActivityIndicator color="#202124" />
        ) : (
          <>
            <AntDesign name="google" size={20} color="#4285F4" style={styles.googleIcon} />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </>
        )}
      </Pressable>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>
      <AuthInput
        nativeID="auth-email"
        testID="auth-email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        spellCheck={false}
        autoComplete={Platform.OS === "web" ? "off" : "email"}
        placeholder="Email"
      />
      <AuthInput
        nativeID="auth-password"
        testID="auth-password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCorrect={false}
        spellCheck={false}
        autoComplete={Platform.OS === "web" ? "off" : "password"}
        placeholder="Password"
      />
      <PrimaryAuthButton label={loading ? "Signing in..." : "Sign In"} onPress={onLogin} disabled={authInProgress} />
      <Text style={{ color: "rgba(255,255,255,0.58)", fontSize: 13, lineHeight: 19 }}>
        Your styling profile, saved looks, and planner stay synced to this account.
      </Text>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  oauthButtonFrame: {
    borderRadius: 18,
    height: 50,
    overflow: "hidden",
  },
  appleButton: {
    height: 50,
    width: "100%",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(237,233,227,0.72)",
    justifyContent: "center",
  },
  googleButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E0E0E0",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    height: 50,
    justifyContent: "center",
    paddingHorizontal: 16,
    width: "100%",
  },
  googleIcon: {
    left: 18,
    position: "absolute",
  },
  googleButtonText: {
    color: "#202124",
    fontSize: 15,
    fontWeight: "700",
  },
  dividerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 2,
  },
  dividerLine: {
    backgroundColor: Colors.dark.borderStrong,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
});
