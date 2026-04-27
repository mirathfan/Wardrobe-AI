import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import LottieView from "lottie-react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AuthProvider, useAuth } from "../src/contexts/AuthContext";
import { isVisionBackgroundRemovalAvailable } from "../src/bg/removeBackground";
import { loadUserProfilePreferences } from "../src/lib/userProfile";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuraRing, { RING_SIZE_LG } from "@/src/components/brand/AuraRing";

export const unstable_settings = {
  anchor: "(tabs)",
};

const LOADING_MESSAGES = [
  "Reading your style profile...",
  "Mapping your wardrobe preferences...",
  "Calibrating your AURA...",
  "Almost ready...",
];

function BrandedLoadingScreen() {
  const reducedMotion = useReducedMotion();
  const [messageIndex, setMessageIndex] = useState(0);
  const opacity = useSharedValue(1);
  const advanceMessage = useCallback(() => {
    setMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(() => {
      opacity.value = withTiming(0, { duration: 300, easing: Easing.inOut(Easing.quad) }, (finished) => {
        if (!finished) return;
        runOnJS(advanceMessage)();
        opacity.value = withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) });
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [advanceMessage, opacity, reducedMotion]);

  const messageStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 1 : opacity.value,
  }));

  return (
    <View style={loadingStyles.container}>
      <View style={loadingStyles.loadingStack}>
        <AuraRing size={RING_SIZE_LG} animated={!reducedMotion} />
        <Animated.Text style={[loadingStyles.message, messageStyle]}>
          {LOADING_MESSAGES[messageIndex]}
        </Animated.Text>
        <LottieView
          source={require("../assets/animations/loading.json")}
          autoPlay={!reducedMotion}
          loop={!reducedMotion}
          style={loadingStyles.lottie}
        />
      </View>
    </View>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
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
    return <BrandedLoadingScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="aura/swipe" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Modal" }}
      />
    </Stack>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#080808",
    overflow: "hidden",
  },
  loadingStack: {
    position: "absolute",
    top: "40%",
    alignItems: "center",
    gap: 22,
    transform: [{ translateY: -80 }],
  },
  message: {
    color: "#FFFFFF",
    fontSize: 16,
    letterSpacing: 1,
    textAlign: "center",
    fontWeight: "700",
  },
  lottie: {
    width: 40,
    height: 40,
  },
});

export default function RootLayout() {
  useColorScheme();
  const palette = Colors.dark;
  const navigationTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
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

        <StatusBar style="light" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
