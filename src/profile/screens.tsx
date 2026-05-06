import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import { sendEmailVerification, sendPasswordResetEmail, signOut, updateProfile } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Pill } from "@/src/addItem/ui/Pill";
import { SafeScreen } from "@/src/components/SafeScreen";
import AuraPressable from "@/src/components/aura/AuraPressable";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  auraSheetBackdropStyle,
  auraSurfaceTiers,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  SUPPORTED_CURRENCIES,
  formatMoney,
  resolveUserCurrency,
  type SupportedCurrencyCode,
} from "@/src/lib/currency";
import { app, auth, db, storage } from "@/src/lib/firebase";
import { signOutGoogle } from "@/src/auth/googleAuth";
import { Storage } from "@/src/lib/storage";
import { clearAssistantMemory, buildCompactMemorySummary, loadAssistantProfile, loadBehaviorProfile } from "@/src/lib/assistantMemory";
import { loadStyleProfile, loadLearnedStyleMemory, saveLearnedStyleMemory, saveStyleProfile } from "@/src/lib/auraMemory";
import { getCachedProfilePreferences, setCachedProfilePreferences } from "@/src/lib/localCache";
import {
  EMPTY_USER_ACCOUNT_PROFILE,
  EMPTY_USER_PROFILE_PREFERENCES,
  loadUserAccountProfile,
  loadUserProfilePreferences,
  saveUserAccountProfile,
  saveUserProfilePreferences,
} from "@/src/lib/userProfile";
import type { UserAccountProfile } from "@/src/lib/userProfile";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";
import { emptyLearnedStyleMemory, emptyStyleProfile, type StyleProfile } from "@/shared/auraMemory";

const BODY_FIELDS: { key: keyof UserProfilePreferences["body"]; label: string }[] = [
  { key: "height", label: "Height" },
  { key: "weight", label: "Weight" },
  { key: "chest", label: "Chest" },
  { key: "shoulders", label: "Shoulders" },
  { key: "neck", label: "Neck" },
  { key: "sleeve", label: "Sleeve" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "inseam", label: "Inseam" },
  { key: "thigh", label: "Thigh" },
  { key: "footLength", label: "Foot length" },
];

const DEFAULT_SIZE_FIELDS: {
  key: keyof UserProfilePreferences["defaultSizes"];
  label: string;
  placeholder: string;
}[] = [
  { key: "top", label: "Tops size", placeholder: "e.g., M" },
  { key: "outerwear", label: "Outerwear size", placeholder: "e.g., L" },
  { key: "hoodie", label: "Hoodie / sweatshirt", placeholder: "e.g., L" },
  { key: "formalShirt", label: "Formal shirt", placeholder: "e.g., 15.5 or M" },
  { key: "bottomWaist", label: "Bottom waist", placeholder: "e.g., 32" },
  { key: "bottomLength", label: "Bottom length", placeholder: "e.g., 30" },
  { key: "jeans", label: "Jeans size", placeholder: "e.g., 32 / 30" },
  { key: "shoes", label: "Shoe size", placeholder: "e.g., US 10 or EU 43" },
];

const ALPHA_SIZE_OPTIONS = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
const BOTTOM_WAIST_OPTIONS = Array.from({ length: 17 }, (_, index) => String(index + 26));
const BOTTOM_LENGTH_OPTIONS = ["28", "30", "32", "34", "36"];
const SHOE_SIZE_OPTIONS = {
  US: ["US 5", "US 5.5", "US 6", "US 6.5", "US 7", "US 7.5", "US 8", "US 8.5", "US 9", "US 9.5", "US 10", "US 10.5", "US 11", "US 11.5", "US 12", "US 13"],
  UK: ["UK 4", "UK 4.5", "UK 5", "UK 5.5", "UK 6", "UK 6.5", "UK 7", "UK 7.5", "UK 8", "UK 8.5", "UK 9", "UK 9.5", "UK 10", "UK 11", "UK 12"],
  EU: ["EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43", "EU 44", "EU 45", "EU 46", "EU 47"],
} as const;

type DeleteAccountDataResult = {
  ok: boolean;
  firestoreDocumentsDeleted: number;
  storageFilesDeleted: number;
  rateLimitDocumentsDeleted?: number;
  authUserDeleted: boolean;
};

const TOP_FIT_OPTIONS = ["slim", "regular", "relaxed", "oversized"] as const;
const OUTERWEAR_FIT_OPTIONS = ["slim", "regular", "roomy"] as const;
const BOTTOM_RISE_OPTIONS = ["low", "mid", "high"] as const;
const BOTTOM_LEG_OPTIONS = ["skinny", "slim", "straight", "tapered", "wide"] as const;
const SHOE_FIT_OPTIONS = ["true_to_size", "half_up", "half_down"] as const;
const LENGTH_UNIT_OPTIONS = ["cm", "in"] as const;
const WEIGHT_UNIT_OPTIONS = ["kg", "lb"] as const;
const SHOE_REGION_OPTIONS = ["US", "UK", "EU"] as const;
const CLOTHING_REGION_OPTIONS = ["US", "UK", "EU", "INTL"] as const;
const CURRENCY_MODE_OPTIONS = ["auto", "manual"] as const;
const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES.map((currency) => currency.code) as SupportedCurrencyCode[];

function commaText(values?: string[]) {
  return Array.isArray(values) && values.length ? values.join(", ") : "";
}

function parseCommaText(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toInputNumber(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function parseInputNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstSupportedPreferredFit(
  values: string[]
): UserProfilePreferences["preferredFit"] {
  const next = values.find((value) =>
    value === "slim" ||
    value === "regular" ||
    value === "relaxed" ||
    value === "oversized"
  );
  return (next as UserProfilePreferences["preferredFit"]) ?? null;
}

export function useProfilePreferencesState() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfilePreferences>(EMPTY_USER_PROFILE_PREFERENCES);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      setProfile(EMPTY_USER_PROFILE_PREFERENCES);
      setLoading(false);
      return;
    }
    setProfile(EMPTY_USER_PROFILE_PREFERENCES);
    setLoading(true);
    void getCachedProfilePreferences(user.uid).then((cached) => {
      if (!cancelled && cached?.data) {
        setProfile(cached.data);
        setLoading(false);
      }
    });
    void loadUserProfilePreferences(user.uid)
      .then((nextProfile) => {
        if (!cancelled) setProfile(nextProfile);
      })
      .catch((error: any) => {
        if (!cancelled) {
          Alert.alert("Profile", error?.message ?? "Unable to load profile.");
          setProfile(EMPTY_USER_PROFILE_PREFERENCES);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const save = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert("Profile", "Please sign in first.");
      return;
    }
    try {
      setSaving(true);
      await saveUserProfilePreferences(user.uid, profile);
      void setCachedProfilePreferences(user.uid, profile);
      Alert.alert("Saved", "Profile updated.");
    } catch (error: any) {
      Alert.alert("Save failed", error?.message ?? "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }, [profile, user?.uid]);

  return { user, loading, saving, profile, setProfile, save };
}

export function useAccountProfileState() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accountProfile, setAccountProfile] = useState<UserAccountProfile>(EMPTY_USER_ACCOUNT_PROFILE);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      setAccountProfile(EMPTY_USER_ACCOUNT_PROFILE);
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadUserAccountProfile(user.uid)
      .then((nextProfile) => {
        if (!cancelled) setAccountProfile(nextProfile);
      })
      .catch((error: any) => {
        if (!cancelled) {
          Alert.alert("Account", error?.message ?? "Unable to load account.");
          setAccountProfile(EMPTY_USER_ACCOUNT_PROFILE);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const save = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert("Account", "Please sign in first.");
      return;
    }
    try {
      setSaving(true);
      await saveUserAccountProfile(user.uid, accountProfile);
      Alert.alert("Saved", "Account updated.");
    } catch (error: any) {
      Alert.alert("Save failed", error?.message ?? "Unable to save account.");
    } finally {
      setSaving(false);
    }
  }, [accountProfile, user?.uid]);

  return { user, loading, saving, accountProfile, setAccountProfile, save };
}

export function formatBodyFitSummary(profile: UserProfilePreferences) {
  const parts = [
    profile.body.height != null ? `${profile.body.height} ${profile.units.length}` : "",
    profile.body.weight != null ? `${profile.body.weight} ${profile.units.weight}` : "",
    profile.fitPreferences.tops ? humanize(profile.fitPreferences.tops) : "",
  ].filter(Boolean);
  return parts.join(" • ") || "Not set";
}

export function formatDefaultSizesSummary(profile: UserProfilePreferences) {
  const parts = [
    profile.defaultSizes.top ? `Top ${profile.defaultSizes.top}` : "",
    profile.defaultSizes.bottomWaist || profile.defaultSizes.bottomLength
      ? `Bottom ${[profile.defaultSizes.bottomWaist, profile.defaultSizes.bottomLength]
          .filter(Boolean)
          .join("/")}`
      : "",
    profile.defaultSizes.shoes ? `Shoes ${profile.defaultSizes.shoes}` : "",
  ].filter(Boolean);
  return parts.join(" • ") || "Not set";
}

export function formatUnitsSummary(profile: UserProfilePreferences) {
  const currency = resolveUserCurrency(profile);
  const currencyMode = profile.currencyMode === "manual" ? "Manual" : "Auto";
  return [
    profile.units.length,
    profile.units.weight,
    profile.units.shoeRegion,
    profile.units.clothingRegion,
    `${currencyMode} ${currency}`,
  ]
    .filter(Boolean)
    .join(" • ");
}

export function formatStyleSummary(profile: UserProfilePreferences) {
  const parts = [
    ...(profile.stylePreferences.preferredStyles ?? []).slice(0, 1),
    ...(profile.stylePreferences.favoriteColors ?? []).slice(0, 1),
    ...(profile.stylePreferences.preferredBrands ?? []).slice(0, 1),
  ];
  return parts.join(" • ") || "Not set";
}

export function formatClosetSummary(profile: UserProfilePreferences) {
  const parts = [
    profile.closetPreferences.prioritizeUnderused ? "Prioritize underused" : "",
    profile.closetPreferences.hideLaundryByDefault ? "Hide laundry" : "",
    profile.closetPreferences.defaultSort ? humanize(profile.closetPreferences.defaultSort) : "",
  ].filter(Boolean);
  return parts.join(" • ") || "Not set";
}

export function formatNotificationsSummary(profile: UserProfilePreferences) {
  const enabled = [
    profile.notifications.laundryReminders,
    profile.notifications.outfitReminders,
    profile.notifications.underusedItemNudges,
  ].filter(Boolean).length;
  return enabled ? `${enabled} enabled` : "All off";
}

export function ProfileHubRow({
  title,
  summary,
  onPress,
}: {
  title: string;
  summary: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.985}
      pressedOpacity={0.88}
      style={{
        ...auraSurfaceTiers.surfaceInteractive,
        borderRadius: 18,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[auraTypography.cardTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{summary}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 18 }}>›</Text>
    </AuraPressable>
  );
}

export function ProfileSectionScreen({
  title,
  children,
  onSave,
  saving,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onSave?: () => void;
  saving?: boolean;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <SafeScreen backgroundColor={colors.background} includeTopInset={false} includeBottomInset={false} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <AuraSubpageHeader title={title} eyebrow="PROFILE" fallbackRoute="/(tabs)/profile" />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 14, paddingBottom: onSave ? 24 : insets.bottom + 24 }}>
          <View
            style={{
              ...auraCardStyle(colors, "card"),
              padding: 16,
              gap: 14,
            }}
          >
            {children}
          </View>
        </ScrollView>
        {onSave ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: insets.bottom + 10,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: "rgba(9,0,11,0.88)",
            }}
          >
            <PrimaryButton label={saving ? "Saving..." : "Save"} onPress={onSave} disabled={saving} />
          </View>
        ) : null}
      </View>
    </SafeScreen>
  );
}

function providerName(providerId: string) {
  if (providerId === "password") return "Email & Password";
  if (providerId === "google.com") return "Google";
  if (providerId === "apple.com") return "Apple";
  return providerId;
}

function getAccountInitials(name: string, email?: string | null) {
  const source = name.trim() || email?.split("@")[0] || "AURA";
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "A";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : parts[0]?.[1];
  return `${first}${second ?? ""}`.toUpperCase();
}

function appVersionLabel() {
  const version = Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? "Unknown";
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    Constants.nativeBuildVersion ??
    null;
  return build ? `${version} (${build})` : String(version);
}

function cleanExportValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(cleanExportValue);
  if (typeof value === "object") {
    if ("toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/image|photo|url|embedding/i.test(key))
      .map(([key, entry]) => [key, cleanExportValue(entry)]);
    return Object.fromEntries(entries);
  }
  return String(value);
}

function summarizeClosetItem(data: Record<string, unknown>, id: string) {
  return {
    id,
    name: data.name ?? null,
    brand: data.brand ?? null,
    category: data.category ?? null,
    subCategory: data.subCategory ?? null,
    colors: data.colors ?? data.displayColors ?? [],
    status: data.status ?? null,
    wearCountSinceWash: data.wearCountSinceWash ?? 0,
    createdAt: cleanExportValue(data.createdAt),
    lastWornDate: cleanExportValue(data.lastWornDate),
  };
}

async function readCollectionSummary(uid: string, collectionName: string, max = 100) {
  const snap = await getDocs(query(collection(db, "users", uid, collectionName), limit(max)));
  return snap.docs.map((entry) => ({
    id: entry.id,
    ...(cleanExportValue(entry.data()) as Record<string, unknown>),
  }));
}

async function buildAccountExport(uid: string, profilePreferences: UserProfilePreferences, accountProfile: UserAccountProfile) {
  const [userSnap, itemsSnap, savedLooks, savedOutfits, feedbackLooks, assistantMain, assistantBehavior, learnedStyle] =
    await Promise.all([
      getDoc(doc(db, "users", uid)),
      getDocs(query(collection(db, "users", uid, "items"), orderBy("createdAt", "desc"), limit(250))),
      readCollectionSummary(uid, "savedLooks", 100),
      readCollectionSummary(uid, "savedOutfits", 100),
      readCollectionSummary(uid, "outfitFeedback", 100),
      loadAssistantProfile(uid),
      loadBehaviorProfile(uid),
      loadLearnedStyleMemory(uid),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      uid,
      name: accountProfile.name,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? false,
      memberSince: auth.currentUser?.metadata?.creationTime ?? null,
      profileUpdatedAt: cleanExportValue(userSnap.data()?.profileUpdatedAt),
    },
    profilePreferences,
    closetItems: itemsSnap.docs.map((entry) => summarizeClosetItem(entry.data(), entry.id)),
    savedLooks: {
      savedLooks,
      savedOutfits,
      outfitFeedback: feedbackLooks,
    },
    auraMemory: {
      summary: buildCompactMemorySummary(assistantMain, assistantBehavior),
      assistantProfile: assistantMain,
      learnedStyle,
    },
  };
}

async function blobFromUri(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error("Unable to read selected image."));
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.responseType = "blob";
    xhr.open("GET", uri, true);
    xhr.send(null);
  });
}

async function uploadAccountPhoto(uid: string, uri: string) {
  const blob = await blobFromUri(uri);
  const fileRef = ref(storage, `users/${uid}/profile/avatar.jpg`);
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
  return getDownloadURL(fileRef);
}

function AccountSection({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={[auraTypography.eyebrow, { color: colors.iridescentStart }]}>{title}</Text>
      <View
        style={{
          ...auraCardStyle(colors, "card"),
          padding: 16,
          gap: 14,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function AccountActionRow({
  title,
  subtitle,
  onPress,
  disabled,
  danger,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 50,
        ...(danger ? auraButtonStyle(colors, "danger", disabled, "compact") : auraCardStyle(colors, "inset")),
        alignItems: "stretch",
        paddingHorizontal: 14,
        paddingVertical: 12,
        opacity: disabled ? 0.55 : 1,
        gap: 4,
      }}
    >
      <Text style={[auraTypography.body, { color: danger ? colors.danger : colors.text, fontWeight: "800" }]}>{title}</Text>
      {subtitle ? <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary, fontSize: 13, lineHeight: 18 }]}>{subtitle}</Text> : null}
    </Pressable>
  );
}

export function AccountScreen() {
  const { user, loading: profileLoading, accountProfile, setAccountProfile } = useAccountProfileState();
  const { profile, loading: preferencesLoading } = useProfilePreferencesState();
  const { colors } = useAppTheme();
  const [loggingOut, setLoggingOut] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [workingAction, setWorkingAction] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedSnapshot, setSavedSnapshot] = useState<UserAccountProfile>(EMPTY_USER_ACCOUNT_PROFILE);
  const [snapshotHydrated, setSnapshotHydrated] = useState(false);
  const providerIds = user?.providerData?.map((provider) => provider.providerId).filter(Boolean) ?? [];
  const isPasswordUser = providerIds.includes("password");
  const displayName = accountProfile.name ?? user?.displayName ?? user?.email?.split("@")[0] ?? "AURA member";
  const photoURL = accountProfile.photoURL ?? user?.photoURL ?? null;
  const accountChanged =
    (accountProfile.name ?? "") !== (savedSnapshot.name ?? "") ||
    (accountProfile.photoURL ?? "") !== (savedSnapshot.photoURL ?? "");

  useEffect(() => {
    if (!profileLoading && !snapshotHydrated) {
      setSavedSnapshot(accountProfile);
      setSnapshotHydrated(true);
    }
  }, [accountProfile, profileLoading, snapshotHydrated]);

  const runAction = useCallback(async (label: string, action: () => Promise<void>) => {
    try {
      setWorkingAction(label);
      await action();
    } catch (error: any) {
      Alert.alert(label, error?.message ?? "Unable to complete this action.");
    } finally {
      setWorkingAction(null);
    }
  }, []);

  const saveAccount = useCallback(async () => {
    if (!user?.uid || savingAccount || !accountChanged) return;
    try {
      setSavingAccount(true);
      await saveUserAccountProfile(user.uid, accountProfile);
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: accountProfile.name ?? undefined,
          photoURL: accountProfile.photoURL ?? undefined,
        });
      }
      setSavedSnapshot(accountProfile);
      Alert.alert("Saved", "Account updated.");
    } catch (error: any) {
      Alert.alert("Save failed", error?.message ?? "Unable to save account.");
    } finally {
      setSavingAccount(false);
    }
  }, [accountChanged, accountProfile, savingAccount, user?.uid]);

  const pickProfilePhoto = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert("Account", "Please sign in first.");
      return;
    }
    await runAction("Profile photo", async () => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Profile photo", "Please allow photo access to choose an avatar.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const nextPhotoURL = await uploadAccountPhoto(user.uid, result.assets[0].uri);
      setAccountProfile((prev) => ({ ...prev, photoURL: nextPhotoURL }));
      await saveUserAccountProfile(user.uid, { ...accountProfile, photoURL: nextPhotoURL });
      if (auth.currentUser) await updateProfile(auth.currentUser, { photoURL: nextPhotoURL });
      setSavedSnapshot((prev) => ({ ...prev, photoURL: nextPhotoURL }));
      Alert.alert("Profile photo", "Avatar updated.");
    });
  }, [accountProfile, runAction, setAccountProfile, user?.uid]);

  const onLogout = useCallback(async () => {
    const uid = auth.currentUser?.uid ?? user?.uid ?? null;
    try {
      setLoggingOut(true);
      await signOutGoogle();
      if (uid) await Storage.clearUserScopedData(uid);
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (err: any) {
      Alert.alert("Logout failed", err?.message ?? "Unable to sign out.");
    } finally {
      setLoggingOut(false);
    }
  }, [user?.uid]);

  const confirmLogout = useCallback(() => {
    Alert.alert("Log out?", "You can sign back in any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void onLogout() },
    ]);
  }, [onLogout]);

  const sendVerification = useCallback(() => {
    void runAction("Email verification", async () => {
      if (!auth.currentUser) throw new Error("Please sign in again first.");
      await sendEmailVerification(auth.currentUser);
      Alert.alert("Email sent", "Check your inbox for the verification link.");
    });
  }, [runAction]);

  const sendReset = useCallback(() => {
    void runAction("Reset password", async () => {
      const email = user?.email;
      if (!email) throw new Error("No email address is attached to this account.");
      await sendPasswordResetEmail(auth, email);
      Alert.alert("Email sent", "Check your inbox for the password reset link.");
    });
  }, [runAction, user?.email]);

  const clearMemory = useCallback(() => {
    Alert.alert(
      "Clear AURA memory?",
      "This clears assistant preference-learning data only. Closet items and saved looks will stay untouched.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear memory",
          style: "destructive",
          onPress: () => {
            void runAction("Clear AURA memory", async () => {
              if (!user?.uid) throw new Error("Please sign in first.");
              await Promise.all([
                clearAssistantMemory(user.uid),
                saveLearnedStyleMemory(user.uid, emptyLearnedStyleMemory(Date.now())),
              ]);
              Alert.alert("AURA memory cleared", "Preference-learning memory was reset.");
            });
          },
        },
      ],
    );
  }, [runAction, user?.uid]);

  const exportData = useCallback(() => {
    void runAction("Export my data", async () => {
      if (!user?.uid) throw new Error("Please sign in first.");
      const payload = await buildAccountExport(user.uid, profile, accountProfile);
      await Share.share({
        title: "AURA data export",
        message: JSON.stringify(payload, null, 2),
      });
    });
  }, [accountProfile, profile, runAction, user?.uid]);

  const exportProfileJson = useCallback(() => {
    void runAction("Download profile JSON", async () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        accountProfile,
        profilePreferences: profile,
      };
      await Share.share({
        title: "AURA profile preferences",
        message: JSON.stringify(payload, null, 2),
      });
    });
  }, [accountProfile, profile, runAction]);

  const copyUserId = useCallback(() => {
    if (!user?.uid) return;
    void Clipboard.setStringAsync(user.uid).then(() => {
      Alert.alert("Copied", "User ID copied to clipboard.");
    });
  }, [user?.uid]);

  const confirmDeleteAccount = useCallback(() => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, closet data, AURA chats, saved looks, and uploaded files.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () => {
            Alert.alert("Final confirmation", "Delete your account and data now?", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  void runAction("Delete account", async () => {
                    const uid = auth.currentUser?.uid ?? user?.uid ?? null;
                    if (!uid) throw new Error("Please sign in again first.");
                    const callable = httpsCallable<{ uid: string }, DeleteAccountDataResult>(
                      getFunctions(app),
                      "deleteAccountData",
                    );
                    await callable({ uid });
                    await signOutGoogle().catch(() => undefined);
                    await Storage.clearUserScopedData(uid).catch(() => undefined);
                    await signOut(auth).catch(() => undefined);
                    router.replace("/(auth)/welcome");
                  });
                },
              },
            ]);
          },
        },
      ],
    );
  }, [runAction, user?.uid]);

  return (
    <SafeScreen backgroundColor={colors.background} includeTopInset={false} includeBottomInset={false} style={{ flex: 1 }}>
      <AuraSubpageHeader
        title="Account"
        eyebrow="PROFILE"
        fallbackRoute="/(tabs)/profile"
      />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, gap: 16, paddingBottom: 32 }}>

        {profileLoading || preferencesLoading ? (
          <View style={{ paddingVertical: 40, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : (
          <>
            <AccountSection title="IDENTITY">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <Pressable
                  onPress={pickProfilePhoto}
                  disabled={workingAction === "Profile photo"}
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    borderWidth: 1,
                    borderColor: colors.glassBorder,
                    backgroundColor: colors.surfaceInteractive,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {photoURL ? (
                    <Image source={{ uri: photoURL }} style={{ width: 76, height: 76 }} />
                  ) : (
                    <Text style={{ color: colors.text, fontSize: 24, fontWeight: "900" }}>
                      {getAccountInitials(displayName, user?.email)}
                    </Text>
                  )}
                </Pressable>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{displayName}</Text>
                  <Pressable onPress={pickProfilePhoto} disabled={workingAction === "Profile photo"}>
                    <Text style={{ color: colors.iridescentStart, fontSize: 13, fontWeight: "900" }}>
                      {workingAction === "Profile photo" ? "Updating photo..." : "Change profile photo"}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <ProfileInputRow
                label="Display name"
                value={accountProfile.name ?? ""}
                placeholder="How should AURA address you?"
                onChangeText={(value) =>
                  setAccountProfile((prev) => ({
                    ...prev,
                    name: value,
                  }))
                }
              />
              {accountChanged ? (
                <PrimaryButton
                  label={savingAccount ? "Saving..." : "Save account changes"}
                  onPress={saveAccount}
                  disabled={savingAccount}
                />
              ) : null}
              <ProfileValueRow label="Email" value={user?.email ?? "No email found."} />
              <ProfileValueRow label="Email status" value={user?.emailVerified ? "Verified" : "Unverified"} />
              {!user?.emailVerified && user?.email ? (
                <AccountActionRow
                  title="Send verification email"
                  subtitle="Send a fresh verification link to your inbox."
                  onPress={sendVerification}
                  disabled={workingAction === "Email verification"}
                />
              ) : null}
              <ProfileValueRow label="Member since" value={user?.metadata?.creationTime ?? "Not available"} />
            </AccountSection>

            <AccountSection title="SECURITY">
              <AccountActionRow
                title="Change password"
                subtitle={isPasswordUser ? "Send a password reset email to change your password." : "Managed by connected sign-in provider."}
                onPress={sendReset}
                disabled={!isPasswordUser || !user?.email || workingAction === "Reset password"}
              />
              <AccountActionRow
                title="Reset password email"
                subtitle="Send a Firebase password reset email to your current address."
                onPress={sendReset}
                disabled={!user?.email || workingAction === "Reset password"}
              />
              <ProfileValueRow
                label="Connected sign-in methods"
                value={providerIds.length ? providerIds.map(providerName).join(" • ") : "Unknown"}
              />
            </AccountSection>

            <AccountSection title="AURA DATA">
              <AccountActionRow
                title="Clear AURA memory"
                subtitle="Reset assistant preference-learning only. Closet and saved looks stay intact."
                onPress={clearMemory}
                danger
                disabled={workingAction === "Clear AURA memory"}
              />
              <AccountActionRow
                title="Export my data"
                subtitle="Share a lightweight JSON export of profile, closet summaries, looks, and AURA memory."
                onPress={exportData}
                disabled={workingAction === "Export my data"}
              />
              <AccountActionRow
                title="Download profile/preferences JSON"
                subtitle="Share only your account profile and profilePreferences JSON."
                onPress={exportProfileJson}
                disabled={workingAction === "Download profile JSON"}
              />
            </AccountSection>

            <AccountSection title="ADVANCED">
              <AccountActionRow
                title={showAdvanced ? "Hide advanced details" : "Show advanced details"}
                onPress={() => setShowAdvanced((prev) => !prev)}
              />
              {showAdvanced ? (
                <>
                  <ProfileValueRow label="User ID" value={user?.uid ?? "Not signed in"} />
                  {user?.uid ? <AccountActionRow title="Copy User ID" onPress={copyUserId} /> : null}
                  <ProfileValueRow label="App version/build" value={appVersionLabel()} />
                </>
              ) : null}
            </AccountSection>

            <AccountSection title="DANGER ZONE">
              <AccountActionRow
                title={loggingOut ? "Signing out..." : "Log out"}
                subtitle="End this session on this device."
                onPress={confirmLogout}
                disabled={loggingOut}
                danger
              />
              <AccountActionRow
                title="Delete account"
                subtitle="Permanently deletes your account data and owned uploads."
                onPress={confirmDeleteAccount}
                disabled={workingAction === "Delete account"}
                danger
              />
            </AccountSection>
          </>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

export function BodyFitScreen() {
  const { profile, setProfile, save, loading, saving } = useProfilePreferencesState();
  const lengthUnit = profile.units.length;
  const weightUnit = profile.units.weight;
  const { colors } = useAppTheme();

  return (
    <ProfileSectionScreen
      title="Body & Fit"
      subtitle="Saved measurements and fit preferences."
      onSave={save}
      saving={saving}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          {BODY_FIELDS.map((field) => (
            <ProfileInputRow
              key={field.key}
              label={field.label}
              suffix={field.key === "weight" ? weightUnit : lengthUnit}
              value={toInputNumber(profile.body[field.key])}
              onChangeText={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  body: { ...prev.body, [field.key]: parseInputNumber(value) },
                }))
              }
              keyboardType="numeric"
            />
          ))}
          <ProfilePillField
            label="Top fit"
            value={profile.fitPreferences.tops ?? ""}
            options={TOP_FIT_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({
                ...prev,
                fitPreferences: { ...prev.fitPreferences, tops: value },
              }))
            }
          />
          <ProfilePillField
            label="Outerwear fit"
            value={profile.fitPreferences.outerwear ?? ""}
            options={OUTERWEAR_FIT_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({
                ...prev,
                fitPreferences: { ...prev.fitPreferences, outerwear: value },
              }))
            }
          />
          <ProfilePillField
            label="Bottom rise"
            value={profile.fitPreferences.bottomsRise ?? ""}
            options={BOTTOM_RISE_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({
                ...prev,
                fitPreferences: { ...prev.fitPreferences, bottomsRise: value },
              }))
            }
          />
          <ProfilePillField
            label="Bottom leg"
            value={profile.fitPreferences.bottomsLeg ?? ""}
            options={BOTTOM_LEG_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({
                ...prev,
                fitPreferences: { ...prev.fitPreferences, bottomsLeg: value },
              }))
            }
          />
          <ProfilePillField
            label="Shoe fit"
            value={profile.fitPreferences.shoes ?? ""}
            options={SHOE_FIT_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({
                ...prev,
                fitPreferences: { ...prev.fitPreferences, shoes: value },
              }))
            }
            labelFormatter={(value) => humanize(value)}
          />
        </>
      )}
    </ProfileSectionScreen>
  );
}

export function DefaultSizesScreen() {
  const { profile, setProfile, save, loading, saving } = useProfilePreferencesState();
  const { colors } = useAppTheme();
  const [activePicker, setActivePicker] = useState<keyof UserProfilePreferences["defaultSizes"] | null>(null);
  const [customDraft, setCustomDraft] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);

  const jeansOptions = useMemo(
    () =>
      BOTTOM_WAIST_OPTIONS.flatMap((waist) =>
        BOTTOM_LENGTH_OPTIONS.map((length) => `${waist} / ${length}`),
      ),
    [],
  );

  const pickerLabel = useMemo(() => {
    return DEFAULT_SIZE_FIELDS.find((field) => field.key === activePicker)?.label ?? "";
  }, [activePicker]);

  const pickerOptions = useMemo<string[]>(() => {
    switch (activePicker) {
      case "top":
      case "outerwear":
      case "hoodie":
      case "formalShirt":
        return [...ALPHA_SIZE_OPTIONS];
      case "bottomWaist":
        return [...BOTTOM_WAIST_OPTIONS];
      case "bottomLength":
        return [...BOTTOM_LENGTH_OPTIONS];
      case "jeans":
        return jeansOptions;
      case "shoes":
        return [...(SHOE_SIZE_OPTIONS[profile.units.shoeRegion] ?? SHOE_SIZE_OPTIONS.US)];
      default:
        return [];
    }
  }, [activePicker, jeansOptions, profile.units.shoeRegion]);

  const activeValue = activePicker ? profile.defaultSizes[activePicker] ?? "" : "";
  const hasCustomValue = !!activeValue && !pickerOptions.includes(activeValue);

  const applyDefaultSize = useCallback(
    (key: keyof UserProfilePreferences["defaultSizes"], value: string | null) => {
      setProfile((prev) => ({
        ...prev,
        defaultSizes: { ...prev.defaultSizes, [key]: value },
      }));
    },
    [setProfile],
  );

  const openPicker = useCallback(
    (key: keyof UserProfilePreferences["defaultSizes"]) => {
      setActivePicker(key);
      setCustomDraft(profile.defaultSizes[key] ?? "");
      setShowCustomInput(false);
    },
    [profile.defaultSizes],
  );

  const closePicker = useCallback(() => {
    setActivePicker(null);
    setShowCustomInput(false);
    setCustomDraft("");
  }, []);

  return (
    <ProfileSectionScreen
      title="Default Sizes"
      subtitle="Used to prefill new item sizes."
      onSave={save}
      saving={saving}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          {DEFAULT_SIZE_FIELDS.map((field) => (
            <ProfileSelectorRow
              key={field.key}
              label={field.label}
              value={
                field.key === "jeans"
                  ? profile.defaultSizes.jeans ??
                    [profile.defaultSizes.bottomWaist, profile.defaultSizes.bottomLength]
                      .filter(Boolean)
                      .join(" / ")
                  : profile.defaultSizes[field.key] ?? ""
              }
              onPress={() => openPicker(field.key)}
            />
          ))}

          <Modal visible={activePicker != null} transparent animationType="slide" onRequestClose={closePicker}>
            <View style={auraSheetBackdropStyle(colors)}>
              <Pressable
                onPress={closePicker}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                }}
              />
              <View
                style={{
                  maxHeight: "78%",
                  ...auraCardStyle(colors, "sheet"),
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 24,
                  gap: 12,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>
                    {pickerLabel}
                  </Text>
                  <Text style={{ color: colors.textSecondary }}>
                    Select a default size
                  </Text>
                </View>

                <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
                  <Pressable
                    onPress={() => {
                      if (activePicker) applyDefaultSize(activePicker, null);
                      closePicker();
                    }}
                    style={{
                      ...auraCardStyle(colors, !activeValue ? "inset" : "card"),
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "700" }}>Not set</Text>
                  </Pressable>

                  {hasCustomValue ? (
                    <Pressable
                      onPress={() => {
                        if (activePicker) applyDefaultSize(activePicker, activeValue);
                        closePicker();
                      }}
                      style={{
                        ...auraCardStyle(colors, "inset"),
                        borderColor: colors.purpleBorder,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "700" }}>
                        Keep current custom value: {activeValue}
                      </Text>
                    </Pressable>
                  ) : null}

                  {pickerOptions.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => {
                        if (activePicker) applyDefaultSize(activePicker, option);
                        closePicker();
                      }}
                      style={{
                        ...auraCardStyle(colors, activeValue === option ? "inset" : "card"),
                        borderColor: activeValue === option ? colors.purpleBorder : colors.border,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "700" }}>{option}</Text>
                    </Pressable>
                  ))}

                  <Pressable
                    onPress={() => setShowCustomInput((prev) => !prev)}
                    style={{
                      ...auraCardStyle(colors, "card"),
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "700" }}>Custom…</Text>
                  </Pressable>

                  {showCustomInput ? (
                    <View style={{ gap: 8 }}>
                      <TextInput
                        value={customDraft}
                        onChangeText={setCustomDraft}
                        placeholder="Enter custom size"
                        placeholderTextColor={colors.textSecondary}
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 12,
                          paddingHorizontal: 12,
                          paddingVertical: 11,
                          color: colors.text,
                          backgroundColor: colors.background,
                          fontSize: 16,
                        }}
                      />
                      <PrimaryButton
                        label="Use custom size"
                        onPress={() => {
                          if (activePicker) applyDefaultSize(activePicker, customDraft.trim() || null);
                          closePicker();
                        }}
                      />
                    </View>
                  ) : null}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      )}
    </ProfileSectionScreen>
  );
}

export function UnitsRegionScreen() {
  const { profile, setProfile, save, loading, saving } = useProfilePreferencesState();
  const { colors } = useAppTheme();
  const resolvedCurrency = resolveUserCurrency(profile);
  const detectedCurrency = profile.detectedCurrency ?? resolvedCurrency;

  return (
    <ProfileSectionScreen
      title="Units & Region"
      subtitle="Measurement labels, size regions, and money display."
      onSave={save}
      saving={saving}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <ProfilePillField
            label="Length"
            value={profile.units.length}
            options={LENGTH_UNIT_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({ ...prev, units: { ...prev.units, length: value } }))
            }
          />
          <ProfilePillField
            label="Weight"
            value={profile.units.weight}
            options={WEIGHT_UNIT_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({ ...prev, units: { ...prev.units, weight: value } }))
            }
          />
          <ProfilePillField
            label="Shoe region"
            value={profile.units.shoeRegion}
            options={SHOE_REGION_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({ ...prev, units: { ...prev.units, shoeRegion: value } }))
            }
          />
          <ProfilePillField
            label="Clothing region"
            value={profile.units.clothingRegion}
            options={CLOTHING_REGION_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({
                ...prev,
                units: { ...prev.units, clothingRegion: value },
              }))
            }
          />
          <ProfilePillField
            label="Currency"
            value={profile.currencyMode ?? "auto"}
            options={CURRENCY_MODE_OPTIONS}
            onSelect={(value) =>
              setProfile((prev) => ({
                ...prev,
                currencyMode: value,
                preferredCurrency: prev.preferredCurrency ?? resolvedCurrency,
                detectedCurrency: detectedCurrency,
              }))
            }
            labelFormatter={(value) => (value === "auto" ? "Auto-detect" : "Manual")}
          />
          {profile.currencyMode === "manual" ? (
            <ProfilePillField
              label="Preferred currency"
              value={(profile.preferredCurrency ?? resolvedCurrency) as SupportedCurrencyCode}
              options={CURRENCY_OPTIONS}
              onSelect={(value) =>
                setProfile((prev) => ({
                  ...prev,
                  currencyMode: "manual",
                  preferredCurrency: value,
                  detectedCurrency: detectedCurrency,
                }))
              }
              labelFormatter={(value) =>
                SUPPORTED_CURRENCIES.find((currency) => currency.code === value)?.label ?? value
              }
            />
          ) : (
            <ProfileValueRow
              label="Detected currency"
              value={`${detectedCurrency} • ${formatMoney(0, detectedCurrency)}`}
            />
          )}
        </>
      )}
    </ProfileSectionScreen>
  );
}

export function StylePreferencesScreen() {
  const { user, profile, loading } = useProfilePreferencesState();
  const { colors } = useAppTheme();
  const [styleProfile, setStyleProfile] = useState<StyleProfile>(emptyStyleProfile());
  const [styleProfileLoading, setStyleProfileLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      setStyleProfile(emptyStyleProfile());
      setStyleProfileLoading(false);
      return;
    }
    setStyleProfileLoading(true);
    void loadStyleProfile(user.uid)
      .then((nextProfile) => {
        if (!cancelled) setStyleProfile(nextProfile);
      })
      .catch((error: any) => {
        if (!cancelled) {
          Alert.alert("Style profile", error?.message ?? "Unable to load style profile.");
          setStyleProfile(emptyStyleProfile());
        }
      })
      .finally(() => {
        if (!cancelled) setStyleProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const handleSave = useCallback(async () => {
    if (!user?.uid) {
      Alert.alert("Profile", "Please sign in first.");
      return;
    }
    try {
      setSavingAll(true);
      const normalizedStyleProfile: StyleProfile = {
        ...styleProfile,
        styleVibes: parseCommaText(commaText(styleProfile.styleVibes)),
        preferredFits: parseCommaText(commaText(styleProfile.preferredFits)),
        favoriteColors: parseCommaText(commaText(styleProfile.favoriteColors)),
        avoidColors: parseCommaText(commaText(styleProfile.avoidColors)),
        dressingGoals: parseCommaText(commaText(styleProfile.dressingGoals)),
        updatedAt: Date.now(),
      };
      const nextProfile: UserProfilePreferences = {
        ...profile,
        styleAesthetics: normalizedStyleProfile.styleVibes,
        preferredFit: firstSupportedPreferredFit(normalizedStyleProfile.preferredFits) ?? profile.preferredFit,
        favoriteColors: normalizedStyleProfile.favoriteColors,
        avoidedColors: normalizedStyleProfile.avoidColors,
        goals: normalizedStyleProfile.dressingGoals,
        stylePreferences: {
          ...profile.stylePreferences,
          preferredStyles: normalizedStyleProfile.styleVibes,
          favoriteColors: normalizedStyleProfile.favoriteColors,
          avoidedColors: normalizedStyleProfile.avoidColors,
        },
      };

      await saveUserProfilePreferences(user.uid, nextProfile);
      await saveStyleProfile(user.uid, normalizedStyleProfile);
      Alert.alert("Saved", "Style preferences updated.");
    } catch (error: any) {
      Alert.alert("Save failed", error?.message ?? "Unable to save style preferences.");
    } finally {
      setSavingAll(false);
    }
  }, [profile, styleProfile, user?.uid]);

  return (
    <ProfileSectionScreen
      title="Style Preferences"
      subtitle="AURA uses these to personalize tone, outfit direction, and how bold to go."
      onSave={handleSave}
      saving={savingAll}
    >
      {loading || styleProfileLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <ProfileInputRow
            label="Style vibes"
            value={commaText(styleProfile.styleVibes)}
            onChangeText={(value) =>
              setStyleProfile((prev) => ({
                ...prev,
                styleVibes: parseCommaText(value),
              }))
            }
            placeholder="clean, layered, relaxed"
          />
          <ProfileInputRow
            label="Preferred fits"
            value={commaText(styleProfile.preferredFits)}
            onChangeText={(value) =>
              setStyleProfile((prev) => ({
                ...prev,
                preferredFits: parseCommaText(value),
              }))
            }
            placeholder="relaxed, regular"
          />
          <ProfileInputRow
            label="Favorite colors"
            value={commaText(styleProfile.favoriteColors)}
            onChangeText={(value) =>
              setStyleProfile((prev) => ({
                ...prev,
                favoriteColors: parseCommaText(value),
              }))
            }
            placeholder="navy, black, olive"
          />
          <ProfileInputRow
            label="Avoid colors"
            value={commaText(styleProfile.avoidColors)}
            onChangeText={(value) =>
              setStyleProfile((prev) => ({
                ...prev,
                avoidColors: parseCommaText(value),
              }))
            }
            placeholder="orange, neon green"
          />
          <ProfileInputRow
            label="Dressing goals"
            value={commaText(styleProfile.dressingGoals)}
            onChangeText={(value) =>
              setStyleProfile((prev) => ({
                ...prev,
                dressingGoals: parseCommaText(value),
              }))
            }
            placeholder="sharper, easier everyday, more polished"
          />
          <ProfilePillField
            label="Experimentation level"
            value={styleProfile.experimentationLevel}
            options={["low", "medium", "high"] as const}
            onSelect={(value) =>
              setStyleProfile((prev) => ({
                ...prev,
                experimentationLevel: value,
              }))
            }
          />
        </>
      )}
    </ProfileSectionScreen>
  );
}

export function ClosetPreferencesScreen() {
  const { profile, setProfile, save, loading, saving } = useProfilePreferencesState();
  const { colors } = useAppTheme();
  return (
    <ProfileSectionScreen
      title="Closet Preferences"
      subtitle="Saved now for later. Not yet wired into sorting/filtering."
      onSave={save}
      saving={saving}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <ProfileBooleanRow
            label="Prioritize underused"
            value={!!profile.closetPreferences.prioritizeUnderused}
            onSet={(value) =>
              setProfile((prev) => ({
                ...prev,
                closetPreferences: { ...prev.closetPreferences, prioritizeUnderused: value },
              }))
            }
          />
          <ProfileBooleanRow
            label="Hide laundry by default"
            value={!!profile.closetPreferences.hideLaundryByDefault}
            onSet={(value) =>
              setProfile((prev) => ({
                ...prev,
                closetPreferences: { ...prev.closetPreferences, hideLaundryByDefault: value },
              }))
            }
          />
          <ProfileInputRow
            label="Default sort"
            value={profile.closetPreferences.defaultSort ?? ""}
            onChangeText={(value) =>
              setProfile((prev) => ({
                ...prev,
                closetPreferences: { ...prev.closetPreferences, defaultSort: value.trim() || null },
              }))
            }
            placeholder="newest"
          />
        </>
      )}
    </ProfileSectionScreen>
  );
}

export function NotificationsScreen() {
  const { profile, setProfile, save, loading, saving } = useProfilePreferencesState();
  const { colors } = useAppTheme();
  return (
    <ProfileSectionScreen
      title="Notifications"
      subtitle="Notification preferences"
      onSave={save}
      saving={saving}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <ProfileBooleanRow
            label="Outfit reminders"
            value={!!profile.notifications.outfitReminders}
            onSet={(value) =>
              setProfile((prev) => ({
                ...prev,
                notifications: { ...prev.notifications, outfitReminders: value },
              }))
            }
          />
          <ProfileBooleanRow
            label="Underused item nudges"
            value={!!profile.notifications.underusedItemNudges}
            onSet={(value) =>
              setProfile((prev) => ({
                ...prev,
                notifications: { ...prev.notifications, underusedItemNudges: value },
              }))
            }
          />
        </>
      )}
    </ProfileSectionScreen>
  );
}

function humanize(value: string) {
  return value.replace(/_/g, " ");
}

function ProfileValueRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[auraTypography.body, { color: colors.text, fontWeight: "700" }]}>{label}</Text>
      <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

function ProfileInputRow({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  suffix,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
  suffix?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[auraTypography.body, { color: colors.text, fontWeight: "700" }]}>
        {label}
        {suffix ? ` (${suffix})` : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 11,
          color: colors.text,
          backgroundColor: colors.inputBackground,
          fontSize: 16,
        }}
      />
    </View>
  );
}

function ProfileSelectorRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        ...auraCardStyle(colors, "inset"),
        paddingHorizontal: 14,
        paddingVertical: 13,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text style={[auraTypography.body, { color: colors.text, fontWeight: "700", flex: 1 }]}>{label}</Text>
      <Text style={{ color: value ? colors.text : colors.textSecondary }}>
        {value || "Not set"}  ›
      </Text>
    </Pressable>
  );
}

function ProfilePillField<T extends string>({
  label,
  value,
  options,
  onSelect,
  labelFormatter,
}: {
  label: string;
  value: T | "";
  options: readonly T[];
  onSelect: (value: T) => void;
  labelFormatter?: (value: string) => string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[auraTypography.body, { color: colors.text, fontWeight: "700" }]}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => (
          <Pill
            key={option}
            label={labelFormatter ? labelFormatter(option) : option}
            active={value === option}
            onPress={() => onSelect(option)}
          />
        ))}
      </View>
    </View>
  );
}

function ProfileBooleanRow({
  label,
  value,
  onSet,
}: {
  label: string;
  value: boolean;
  onSet: (value: boolean) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[auraTypography.body, { fontWeight: "700", color: colors.text }]}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pill label="On" active={value} onPress={() => onSet(true)} />
        <Pill label="Off" active={!value} onPress={() => onSet(false)} />
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <AuraPressable
      onPress={onPress}
      disabled={disabled}
      haptic="light"
      hapticTrigger="press"
      pressedScale={0.98}
      pressedOpacity={0.88}
      disabledOpacity={0.6}
      style={{
        ...auraButtonStyle(colors, "primary", disabled),
      }}
    >
      <Text style={auraButtonTextStyle(colors, "primary", disabled)}>{label}</Text>
    </AuraPressable>
  );
}
