import { router } from "expo-router";
import { createUserWithEmailAndPassword } from "firebase/auth";
import React, { useRef, useState } from "react";
import { Alert, TextInput, View } from "react-native";

import {
  AuthInlineLink,
  AuthInput,
  AuthScaffold,
  PrimaryAuthButton,
} from "@/src/components/auth/AuthScaffold";
import { getAuthErrorMessage } from "@/src/auth/authErrors";
import { getRegisterValidationError } from "@/src/auth/registerValidation";
import { auth } from "@/src/lib/firebase";
import { trackLaunchEvent } from "@/src/lib/analytics";
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
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  async function onRegister() {
    const normalizedName = normalize(name);
    const normalizedEmail = normalize(email).toLowerCase();
    const validationError = getRegisterValidationError({
      name,
      email,
      password,
      confirmPassword,
    });
    if (validationError) {
      return Alert.alert(validationError.title, validationError.message);
    }

    try {
      setLoading(true);
      const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
      await Promise.all([
        saveUserAccountProfile(credential.user.uid, {
          name: normalizedName,
          displayName: normalizedName,
        }),
        saveUserProfilePreferences(credential.user.uid, {
          ...EMPTY_USER_PROFILE_PREFERENCES,
          firstName: normalizedName,
          onboardingCompleted: false,
        }),
      ]);
      void trackLaunchEvent({
        userId: credential.user.uid,
        eventName: "auth_signed_up",
        properties: {
          provider: "password",
        },
      });
      router.replace("/(onboarding)");
    } catch (error: any) {
      Alert.alert("Create account failed", getAuthErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScaffold
      eyebrow="YOUR AI WARDROBE STYLIST"
      title="Create your AURA profile"
      subtitle="Set up your wardrobe profile so AURA can personalize from day one."
      footer={
        <View style={{ alignItems: "flex-start" }}>
          <AuthInlineLink label="Already have an account? Sign in" onPress={() => router.replace("/(auth)/login")} />
        </View>
      }
    >
      <AuthInput
        value={name}
        onChangeText={setName}
        autoComplete="name"
        maxLength={100}
        placeholder="First name"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <AuthInput
        ref={emailRef}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        maxLength={254}
        placeholder="Email"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <AuthInput
        ref={passwordRef}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        maxLength={128}
        placeholder="Password"
        returnKeyType="next"
        blurOnSubmit={false}
        onSubmitEditing={() => confirmPasswordRef.current?.focus()}
      />
      <AuthInput
        ref={confirmPasswordRef}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
        maxLength={128}
        placeholder="Confirm password"
        returnKeyType="done"
        onSubmitEditing={onRegister}
      />
      <PrimaryAuthButton label={loading ? "Creating..." : "Create Account"} onPress={onRegister} disabled={loading} />
    </AuthScaffold>
  );
}
