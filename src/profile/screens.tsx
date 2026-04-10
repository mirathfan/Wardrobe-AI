import { router } from "expo-router";
import { signOut } from "firebase/auth";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { Pill } from "@/src/addItem/ui/Pill";
import { SafeScreen } from "@/src/components/SafeScreen";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { auth } from "@/src/lib/firebase";
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
    setLoading(true);
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
  return [
    profile.units.length,
    profile.units.weight,
    profile.units.shoeRegion,
    profile.units.clothingRegion,
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
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: colors.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>{title}</Text>
        <Text style={{ color: colors.textSecondary }}>{summary}</Text>
      </View>
      <Text style={{ color: colors.textSecondary, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

export function ProfileSectionScreen({
  title,
  subtitle,
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
  return (
    <SafeScreen backgroundColor={colors.background} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 120 }}>
          <View style={{ gap: 8 }}>
            <Pressable
              onPress={() => router.back()}
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: "700" }}>Back</Text>
            </Pressable>
            <Text style={{ fontSize: 28, fontWeight: "900", color: colors.text }}>{title}</Text>
            {subtitle ? <Text style={{ color: colors.textSecondary }}>{subtitle}</Text> : null}
          </View>
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
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
              paddingTop: 12,
              paddingBottom: 12,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.background,
            }}
          >
            <PrimaryButton label={saving ? "Saving..." : "Save"} onPress={onSave} disabled={saving} />
          </View>
        ) : null}
      </View>
    </SafeScreen>
  );
}

export function AccountScreen() {
  const { user, loading: profileLoading, saving, accountProfile, setAccountProfile, save } = useAccountProfileState();
  const { colors } = useAppTheme();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = useCallback(async () => {
    try {
      setLoggingOut(true);
      await signOut(auth);
      router.replace("/(auth)/login");
    } catch (err: any) {
      Alert.alert("Logout failed", err?.message ?? "Unable to sign out.");
    } finally {
      setLoggingOut(false);
    }
  }, []);

  return (
    <ProfileSectionScreen title="Account" subtitle="Personal details and sign-out" onSave={save} saving={saving}>
      {profileLoading ? <ActivityIndicator color={colors.accent} /> : (
        <>
          <ProfileInputRow
            label="Name"
            value={accountProfile.name ?? ""}
            placeholder="How should AURA address you?"
            onChangeText={(value) =>
              setAccountProfile((prev) => ({
                ...prev,
                name: value,
              }))
            }
          />
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            AURA may use your name occasionally in greetings and replies, but it will not overdo it.
          </Text>
        </>
      )}
      <ProfileValueRow label="Email" value={user?.email ?? "No email found."} />
      <PrimaryButton label={loggingOut ? "Signing out..." : "Log out"} onPress={onLogout} disabled={loggingOut} />
    </ProfileSectionScreen>
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
            options={["slim", "regular", "relaxed", "oversized"]}
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
            options={["slim", "regular", "roomy"]}
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
            options={["low", "mid", "high"]}
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
            options={["skinny", "slim", "straight", "tapered", "wide"]}
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
            options={["true_to_size", "half_up", "half_down"]}
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

  const pickerOptions = useMemo(() => {
    switch (activePicker) {
      case "top":
      case "outerwear":
      case "hoodie":
      case "formalShirt":
        return ALPHA_SIZE_OPTIONS;
      case "bottomWaist":
        return BOTTOM_WAIST_OPTIONS;
      case "bottomLength":
        return BOTTOM_LENGTH_OPTIONS;
      case "jeans":
        return jeansOptions;
      case "shoes":
        return SHOE_SIZE_OPTIONS[profile.units.shoeRegion] ?? SHOE_SIZE_OPTIONS.US;
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
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <Pressable
                onPress={closePicker}
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  backgroundColor: "rgba(0,0,0,0.3)",
                }}
              />
              <View
                style={{
                  maxHeight: "78%",
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
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
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: !activeValue ? colors.background : colors.surface,
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
                        borderWidth: 1,
                        borderColor: colors.accent,
                        borderRadius: 14,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: colors.background,
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
                        borderWidth: 1,
                        borderColor: activeValue === option ? colors.accent : colors.border,
                        borderRadius: 14,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: activeValue === option ? colors.background : colors.surface,
                      }}
                    >
                      <Text style={{ color: colors.text, fontWeight: "700" }}>{option}</Text>
                    </Pressable>
                  ))}

                  <Pressable
                    onPress={() => setShowCustomInput((prev) => !prev)}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 14,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      backgroundColor: colors.surface,
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

  return (
    <ProfileSectionScreen
      title="Units & Region"
      subtitle="Measurement labels and size region defaults."
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
            options={["cm", "in"]}
            onSelect={(value) =>
              setProfile((prev) => ({ ...prev, units: { ...prev.units, length: value as any } }))
            }
          />
          <ProfilePillField
            label="Weight"
            value={profile.units.weight}
            options={["kg", "lb"]}
            onSelect={(value) =>
              setProfile((prev) => ({ ...prev, units: { ...prev.units, weight: value as any } }))
            }
          />
          <ProfilePillField
            label="Shoe region"
            value={profile.units.shoeRegion}
            options={["US", "UK", "EU"]}
            onSelect={(value) =>
              setProfile((prev) => ({ ...prev, units: { ...prev.units, shoeRegion: value as any } }))
            }
          />
          <ProfilePillField
            label="Clothing region"
            value={profile.units.clothingRegion}
            options={["US", "UK", "EU", "INTL"]}
            onSelect={(value) =>
              setProfile((prev) => ({
                ...prev,
                units: { ...prev.units, clothingRegion: value as any },
              }))
            }
          />
        </>
      )}
    </ProfileSectionScreen>
  );
}

export function StylePreferencesScreen() {
  const { profile, setProfile, save, loading, saving } = useProfilePreferencesState();
  const { colors } = useAppTheme();
  return (
    <ProfileSectionScreen
      title="Style Preferences"
      subtitle="Saved now for later. Not yet wired into outfit logic."
      onSave={save}
      saving={saving}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <ProfileInputRow
            label="Preferred styles"
            value={commaText(profile.stylePreferences.preferredStyles)}
            onChangeText={(value) =>
              setProfile((prev) => ({
                ...prev,
                stylePreferences: { ...prev.stylePreferences, preferredStyles: parseCommaText(value) },
              }))
            }
            placeholder="casual, streetwear, luxury"
          />
          <ProfileInputRow
            label="Favorite colors"
            value={commaText(profile.stylePreferences.favoriteColors)}
            onChangeText={(value) =>
              setProfile((prev) => ({
                ...prev,
                stylePreferences: { ...prev.stylePreferences, favoriteColors: parseCommaText(value) },
              }))
            }
            placeholder="blue, black, olive"
          />
          <ProfileInputRow
            label="Avoided colors"
            value={commaText(profile.stylePreferences.avoidedColors)}
            onChangeText={(value) =>
              setProfile((prev) => ({
                ...prev,
                stylePreferences: { ...prev.stylePreferences, avoidedColors: parseCommaText(value) },
              }))
            }
            placeholder="orange, neon green"
          />
          <ProfileInputRow
            label="Preferred brands"
            value={commaText(profile.stylePreferences.preferredBrands)}
            onChangeText={(value) =>
              setProfile((prev) => ({
                ...prev,
                stylePreferences: { ...prev.stylePreferences, preferredBrands: parseCommaText(value) },
              }))
            }
            placeholder="Moncler, Prada, Stussy"
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
      subtitle="Saved now for later. Not yet wired into reminders."
      onSave={save}
      saving={saving}
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <ProfileBooleanRow
            label="Laundry reminders"
            value={!!profile.notifications.laundryReminders}
            onSet={(value) =>
              setProfile((prev) => ({
                ...prev,
                notifications: { ...prev.notifications, laundryReminders: value },
              }))
            }
          />
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
      <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
      <Text style={{ color: colors.textSecondary }}>{value}</Text>
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
      <Text style={{ color: colors.text, fontWeight: "700" }}>
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
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 11,
          color: colors.text,
          backgroundColor: colors.background,
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
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 13,
        backgroundColor: colors.background,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>{label}</Text>
      <Text style={{ color: value ? colors.text : colors.textSecondary }}>
        {value || "Not set"}  ›
      </Text>
    </Pressable>
  );
}

function ProfilePillField({
  label,
  value,
  options,
  onSelect,
  labelFormatter,
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  labelFormatter?: (value: string) => string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontWeight: "700" }}>{label}</Text>
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
      <Text style={{ fontWeight: "700", color: colors.text }}>{label}</Text>
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: "center",
        backgroundColor: colors.accent,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
