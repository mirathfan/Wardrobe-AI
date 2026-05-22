import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { router, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { signOut } from "firebase/auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
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
import { getCachedProfilePreferences } from "../src/lib/localCache";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors } from "@/constants/theme";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AuraRing, { RING_SIZE_LG } from "@/src/components/brand/AuraRing";
import BrandedLoadingAnimation from "@/src/components/brand/BrandedLoadingAnimation";
import { configureGoogleSignIn } from "@/src/auth/googleAuth";
import { logDeviceSecurityContext } from "@/src/lib/security";
import { auth, hasFirebaseServices } from "@/src/lib/firebase";
import { firebaseEnvDiagnostics } from "@/src/lib/firebaseConfig";
import { installGlobalErrorTracking, trackLaunchEvent } from "@/src/lib/analytics";

export const unstable_settings = {
  anchor: "(tabs)",
};

const LOADING_MESSAGES = [
  "Reading your style profile...",
  "Mapping your wardrobe preferences...",
  "Calibrating your AURA...",
  "Almost ready...",
];

type ProfileGateState = "idle" | "loading" | "onboarded" | "needs_onboarding" | "error";

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
        <BrandedLoadingAnimation animated={!reducedMotion} style={loadingStyles.lottie} />
      </View>
    </View>
  );
}

function ProfileLoadErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={loadingStyles.container}>
      <View style={loadingStyles.errorPanel}>
        <Text style={loadingStyles.errorTitle}>Couldn&apos;t load your profile</Text>
        <Text style={loadingStyles.errorCopy}>
          Check your connection and try again. Your account is still signed in.
        </Text>
        <Pressable accessibilityRole="button" onPress={onRetry} style={loadingStyles.retryButton}>
          <Text style={loadingStyles.retryText}>Retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AuthLoadTimeoutScreen({
  onRetry,
  onSignInAgain,
}: {
  onRetry: () => void;
  onSignInAgain: () => void;
}) {
  return (
    <View style={loadingStyles.container}>
      <View style={loadingStyles.errorPanel}>
        <Text style={loadingStyles.errorTitle}>Still checking your session…</Text>
        <Text style={loadingStyles.errorCopy}>
          Your connection may be offline or Firebase is taking longer than usual.
        </Text>
        <View style={loadingStyles.errorActions}>
          <Pressable accessibilityRole="button" onPress={onRetry} style={loadingStyles.retryButton}>
            <Text style={loadingStyles.retryText}>Retry</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onSignInAgain} style={loadingStyles.secondaryButton}>
            <Text style={loadingStyles.secondaryText}>Sign in again</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ConfigurationErrorScreen() {
  return (
    <View style={loadingStyles.container}>
      <View style={[loadingStyles.errorPanel, loadingStyles.configErrorPanel]}>
        <Text style={loadingStyles.errorTitle}>Configuration Error</Text>
        <Text style={loadingStyles.errorCopy}>
          AURA is missing required app configuration. Please install the latest build or contact support.
        </Text>
        <View style={loadingStyles.configDiagnostics}>
          <Text style={loadingStyles.configDiagnosticTitle}>
            Build diagnostics: Firebase env validation failed
          </Text>
          {firebaseEnvDiagnostics.map((diagnostic) => (
            <Text key={diagnostic.name} style={loadingStyles.configDiagnosticText}>
              {diagnostic.name}: required {String(diagnostic.requiredForLaunch)}, present{" "}
              {String(diagnostic.present)}, length {diagnostic.length}, valid{" "}
              {String(diagnostic.valid)}, checks {JSON.stringify(diagnostic.checks)}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function AuthGate() {
  const { user, loading, authCheckTimedOut, retryAuthCheck } = useAuth();
  const segments = useSegments();
  const [profileState, setProfileState] = useState<ProfileGateState>("loading");
  const [profileRetryKey, setProfileRetryKey] = useState(0);
  const routedRef = useRef<string | null>(null);
  const appOpenTrackedForUidRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (loading) return () => { cancelled = true; };

    if (!user?.uid) {
      setProfileState("idle");
      return () => {
        cancelled = true;
      };
    }

    setProfileState("loading");
    void (async () => {
      const cached = await getCachedProfilePreferences(user.uid).catch(() => null);
      const cachedOnboarded = Boolean(cached?.data?.onboardingCompleted);
      if (cachedOnboarded && !cancelled) {
        setProfileState("onboarded");
      }
      try {
        const profile = await loadUserProfilePreferences(user.uid);
        if (cancelled) return;
        setProfileState(profile.onboardingCompleted ? "onboarded" : "needs_onboarding");
      } catch {
        if (cancelled) return;
        setProfileState(cachedOnboarded ? "onboarded" : "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loading, profileRetryKey, user?.uid]);

  useEffect(() => {
    if (loading || profileState === "loading" || profileState === "error") return;
    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";

    if (!user && !inAuthGroup) {
      if (routedRef.current !== "auth") {
        routedRef.current = "auth";
        router.replace("/(auth)/welcome");
      }
      return;
    }

    if (user && profileState === "needs_onboarding" && !inOnboardingGroup) {
      if (routedRef.current !== "onboarding") {
        routedRef.current = "onboarding";
        router.replace("/(onboarding)");
      }
      return;
    }

    if (user && profileState === "onboarded" && (inAuthGroup || inOnboardingGroup)) {
      if (routedRef.current !== "tabs") {
        routedRef.current = "tabs";
        router.replace("/(tabs)");
      }
    }
  }, [loading, profileState, segments, user]);

  useEffect(() => {
    if (loading || profileState === "loading" || profileState === "error") return;
    if (!user?.uid || appOpenTrackedForUidRef.current === user.uid) return;
    appOpenTrackedForUidRef.current = user.uid;
    void trackLaunchEvent({
      userId: user.uid,
      eventName: "app_opened",
      properties: {
        onboardingState: profileState,
      },
    });
  }, [loading, profileState, user?.uid]);

  if (loading && authCheckTimedOut) {
    return (
      <AuthLoadTimeoutScreen
        onRetry={retryAuthCheck}
        onSignInAgain={() => {
          void signOut(auth).finally(() => {
            retryAuthCheck();
            router.replace("/(auth)/login");
          });
        }}
      />
    );
  }

  if (loading || (user && profileState === "loading")) {
    return <BrandedLoadingScreen />;
  }
  if (user && profileState === "error") {
    return <ProfileLoadErrorScreen onRetry={() => setProfileRetryKey((value) => value + 1)} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="aura/swipe" options={{ headerShown: false }} />
      <Stack.Screen name="dev/analytics" options={{ headerShown: false }} />
    </Stack>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: Colors.dark.background,
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
    color: Colors.dark.textPrimary,
    fontSize: 16,
    letterSpacing: 1,
    textAlign: "center",
    fontWeight: "700",
  },
  lottie: {
    width: 40,
    height: 40,
  },
  errorPanel: {
    position: "absolute",
    top: "38%",
    width: "82%",
    maxWidth: 360,
    alignItems: "center",
    gap: 14,
    transform: [{ translateY: -60 }],
  },
  configErrorPanel: {
    top: "24%",
    width: "88%",
    maxWidth: 430,
    transform: [{ translateY: -32 }],
  },
  errorTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  errorCopy: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  retryButton: {
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 18,
  },
  retryText: {
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: "800",
  },
  errorActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  secondaryButton: {
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 18,
  },
  secondaryText: {
    color: Colors.dark.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  configDiagnostics: {
    width: "100%",
    gap: 6,
    marginTop: 10,
  },
  configDiagnosticTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  configDiagnosticText: {
    color: Colors.dark.textSecondary,
    fontSize: 10,
    lineHeight: 14,
    textAlign: "left",
  },
});

export default function RootLayout() {
  useColorScheme();
  const palette = Colors.dark;
  const firebaseReady = hasFirebaseServices();
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
    if (!firebaseReady) return;
    installGlobalErrorTracking();
    configureGoogleSignIn();
    void logDeviceSecurityContext();
  }, [firebaseReady]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !__DEV__) return;
    console.log(
      `[VisionBG] native module available: ${isVisionBackgroundRemovalAvailable()}`
    );
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navigationTheme}>
        {firebaseReady ? (
          <AuthProvider>
            <View style={{ flex: 1, backgroundColor: palette.background }}>
              <AuthGate />
            </View>
          </AuthProvider>
        ) : (
          <View style={{ flex: 1, backgroundColor: palette.background }}>
            <ConfigurationErrorScreen />
          </View>
        )}

        <StatusBar style="light" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
