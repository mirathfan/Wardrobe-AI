import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import { isVisionBackgroundRemovalAvailable } from "../src/bg/removeBackground";
import { loadUserProfilePreferences } from "../src/lib/userProfile";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { SafeAreaProvider } from "react-native-safe-area-context";

export const unstable_settings = {
  anchor: "(tabs)",
};

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === "dark" ? "dark" : "light"];
  const [profileLoading, setProfileLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const isRevalidatingOnboarding = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (loading) return () => { cancelled = true; };

    if (!user?.uid) {
      setOnboardingCompleted(false);
      setProfileLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setProfileLoading(true);
    void loadUserProfilePreferences(user.uid)
      .then((profile) => {
        if (cancelled) return;
        setOnboardingCompleted(Boolean(profile.onboardingCompleted));
      })
      .catch(() => {
        if (cancelled) return;
        setOnboardingCompleted(false);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loading, user?.uid]);

  useEffect(() => {
    if (loading || profileLoading) return;
    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/welcome");
      return;
    }

    if (user && !onboardingCompleted && !inOnboardingGroup && !isRevalidatingOnboarding.current) {
      let cancelled = false;
      isRevalidatingOnboarding.current = true;
      setProfileLoading(true);
      void loadUserProfilePreferences(user.uid)
        .then((profile) => {
          if (cancelled) return;
          const completed = Boolean(profile.onboardingCompleted);
          setOnboardingCompleted(completed);
          if (!completed) {
            router.replace("/(onboarding)");
          }
        })
        .catch(() => {
          if (cancelled) return;
          setOnboardingCompleted(false);
          router.replace("/(onboarding)");
        })
        .finally(() => {
          if (!cancelled) setProfileLoading(false);
          isRevalidatingOnboarding.current = false;
        });
      return () => {
        cancelled = true;
        isRevalidatingOnboarding.current = false;
      };
    }

    if (user && onboardingCompleted && (inAuthGroup || inOnboardingGroup)) {
      router.replace("/(tabs)");
    }
  }, [loading, onboardingCompleted, profileLoading, segments, user]);

  if (loading || profileLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
        <ActivityIndicator />
        <Text style={{ color: palette.text }}>
          {loading ? "Checking session…" : "Preparing your wardrobe profile…"}
        </Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme === "dark" ? "dark" : "light"];
  const navigationTheme =
    colorScheme === "dark"
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            background: palette.background,
            card: palette.surface,
            border: palette.border,
            primary: palette.tint,
            text: palette.text,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: palette.background,
            card: palette.surface,
            border: palette.border,
            primary: palette.tint,
            text: palette.text,
          },
        };

  useEffect(() => {
    if (Platform.OS !== "ios" || !__DEV__) return;
    console.log(
      `[VisionBG] native module available: ${isVisionBackgroundRemovalAvailable()}`
    );
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        <AuthProvider>
          <View style={{ flex: 1, backgroundColor: palette.background }}>
            <AuthGate />
          </View>
        </AuthProvider>

        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
