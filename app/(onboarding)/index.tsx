import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeScreen } from "@/src/components/SafeScreen";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  getAdaptiveSizeFields,
  normalizeProfileSizePayload,
  ONBOARDING_CATEGORY_OPTIONS,
  shouldShowAdvancedBraSize,
} from "@/src/lib/adaptiveSizing";
import {
  EMPTY_USER_PROFILE_PREFERENCES,
  loadUserProfilePreferences,
  saveUserAccountProfile,
  saveUserProfilePreferences,
} from "@/src/lib/userProfile";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";

const WARDROBE_MODES = ["masculine", "feminine", "neutral", "mixed", "custom"] as const;
const STYLE_OPTIONS = [
  "streetwear",
  "casual",
  "smart_casual",
  "formal",
  "minimal",
  "sporty",
  "luxury",
  "modest",
  "vintage",
  "edgy",
] as const;
const FIT_OPTIONS = ["slim", "regular", "relaxed", "oversized"] as const;
const ACCESSORY_OPTIONS = [
  "watches",
  "jewelry",
  "handbags",
  "caps",
  "belts",
  "scarves",
  "perfumes",
  "sunglasses",
] as const;
const OCCASION_OPTIONS = [
  "daily",
  "work",
  "college",
  "gym",
  "party",
  "date_night",
  "travel",
  "formal_events",
] as const;
const GOAL_OPTIONS = [
  "outfit_suggestions",
  "shopping_suggestions",
  "packing_help",
  "laundry_reminders",
  "styling_confidence",
] as const;
const COLOR_OPTIONS = [
  "black",
  "white",
  "navy",
  "blue",
  "grey",
  "brown",
  "beige",
  "green",
  "olive",
  "red",
  "pink",
  "cream",
] as const;

type StepKey =
  | "basics"
  | "wardrobeMode"
  | "categories"
  | "style"
  | "body"
  | "sizes"
  | "preferences"
  | "goals";

type Step = {
  key: StepKey;
  title: string;
  subtitle: string;
};

const STEPS: Step[] = [
  {
    key: "basics",
    title: "Set your foundation",
    subtitle: "Tell Wardrobe AI how to size, greet, and localize your experience.",
  },
  {
    key: "wardrobeMode",
    title: "Choose your wardrobe mode",
    subtitle: "This shapes organization, sizing emphasis, and styling logic, not a separate UI.",
  },
  {
    key: "categories",
    title: "Choose what you actually wear",
    subtitle: "We’ll only ask size questions for categories that matter to your real wardrobe.",
  },
  {
    key: "style",
    title: "Define your style direction",
    subtitle: "Pick the aesthetics you want AURA to lean into most.",
  },
  {
    key: "body",
    title: "Add body & fit context",
    subtitle: "This helps with fit-based sizing and better silhouette recommendations.",
  },
  {
    key: "sizes",
    title: "Save your default sizes",
    subtitle: "These defaults prefill new items and make shopping guidance more useful.",
  },
  {
    key: "preferences",
    title: "Tune preferences",
    subtitle: "Set colors, accessories, and occasions so recommendations feel more personal.",
  },
  {
    key: "goals",
    title: "Choose what Wardrobe AI should help with first",
    subtitle: "This changes what shows up first in Home, Closet, and AURA.",
  },
];

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function chipSelected(selected: string[] | undefined, value: string) {
  return Array.isArray(selected) && selected.includes(value);
}

function sizeSectionTitle(key: string) {
  if (key === "tops") return "Tops";
  if (key === "outerwear") return "Outerwear";
  if (key === "bottoms" || key === "bottomsWaist" || key === "bottomsLength") return "Bottoms";
  if (key === "dresses") return "Dresses";
  if (key === "skirts") return "Skirts";
  if (key === "shoes") return "Footwear";
  return "Sizing";
}

export default function OnboardingScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [advancedFitOpen, setAdvancedFitOpen] = useState(false);
  const [draft, setDraft] = useState<UserProfilePreferences>(EMPTY_USER_PROFILE_PREFERENCES);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      router.replace("/(auth)/welcome");
      return;
    }
    void loadUserProfilePreferences(user.uid)
      .then((profile) => {
        if (cancelled) return;
        setDraft((prev) => ({
          ...prev,
          ...profile,
          firstName: profile.firstName ?? prev.firstName ?? user.displayName ?? "",
        }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.displayName, user?.uid]);

  const step = STEPS[stepIndex];
  const progress = (stepIndex + 1) / STEPS.length;

  const units = useMemo(() => {
    if (draft.unitsPreference === "imperial") {
      return { length: "in", weight: "lb", shoeRegion: "US", clothingRegion: "US" } as const;
    }
    return { length: "cm", weight: "kg", shoeRegion: "EU", clothingRegion: "INTL" } as const;
  }, [draft.unitsPreference]);

  const adaptiveSizeFields = useMemo(
    () => getAdaptiveSizeFields(draft.selectedCategories, draft.wardrobeMode),
    [draft.selectedCategories, draft.wardrobeMode]
  );
  const shouldRenderBraSize = useMemo(
    () => shouldShowAdvancedBraSize(draft.selectedCategories, draft.wardrobeMode),
    [draft.selectedCategories, draft.wardrobeMode]
  );
  const groupedAdaptiveSizeFields = useMemo(() => {
    const groups = new Map<string, typeof adaptiveSizeFields>();
    adaptiveSizeFields.forEach((field) => {
      const section = sizeSectionTitle(field.key);
      const current = groups.get(section) ?? [];
      current.push(field);
      groups.set(section, current);
    });
    return Array.from(groups.entries()).map(([title, fields]) => ({ title, fields }));
  }, [adaptiveSizeFields]);

  async function onFinish() {
    if (!user?.uid) return;
    try {
      setSaving(true);
      const normalizedSizingDraft = normalizeProfileSizePayload(draft);
      const profileToSave: UserProfilePreferences = {
        ...normalizedSizingDraft,
        onboardingCompleted: true,
        units,
        favoriteColors: normalizedSizingDraft.favoriteColors,
        avoidedColors: normalizedSizingDraft.avoidedColors,
        defaultSizes: {
          ...normalizedSizingDraft.defaultSizes,
          top:
            normalizedSizingDraft.defaultSizes.top ??
            normalizedSizingDraft.defaultSizes.tops ??
            null,
          tops:
            normalizedSizingDraft.defaultSizes.tops ??
            normalizedSizingDraft.defaultSizes.top ??
            null,
          bottomWaist:
            normalizedSizingDraft.defaultSizes.bottomWaist ??
            normalizedSizingDraft.defaultSizes.bottomsWaist ??
            normalizedSizingDraft.defaultSizes.bottoms ??
            null,
          bottomsWaist:
            normalizedSizingDraft.defaultSizes.bottomsWaist ??
            normalizedSizingDraft.defaultSizes.bottomWaist ??
            null,
          bottoms:
            normalizedSizingDraft.defaultSizes.bottoms ??
            normalizedSizingDraft.defaultSizes.bottomWaist ??
            null,
          bottomLength:
            normalizedSizingDraft.defaultSizes.bottomLength ??
            normalizedSizingDraft.defaultSizes.bottomsLength ??
            null,
          bottomsLength:
            normalizedSizingDraft.defaultSizes.bottomsLength ??
            normalizedSizingDraft.defaultSizes.bottomLength ??
            null,
        },
        height: {
          value: normalizedSizingDraft.body.height ?? null,
          unit: draft.unitsPreference === "imperial" ? "ft_in" : "cm",
        },
        weight: {
          value: normalizedSizingDraft.body.weight ?? null,
          unit: draft.unitsPreference === "imperial" ? "lb" : "kg",
        },
        stylePreferences: {
          ...normalizedSizingDraft.stylePreferences,
          preferredStyles: normalizedSizingDraft.styleAesthetics,
          favoriteColors: normalizedSizingDraft.favoriteColors,
          avoidedColors: normalizedSizingDraft.avoidedColors,
        },
        fitPreferences: {
          ...normalizedSizingDraft.fitPreferences,
          tops:
            normalizedSizingDraft.preferredFit ??
            normalizedSizingDraft.fitPreferences.tops ??
            null,
        },
      };
      await Promise.all([
        saveUserProfilePreferences(user.uid, profileToSave),
        saveUserAccountProfile(user.uid, {
          name: (draft.firstName ?? "").trim() || user.displayName || user.email?.split("@")[0] || null,
        }),
      ]);
      router.replace("/(tabs)");
    } finally {
      setSaving(false);
    }
  }

  function nextStep() {
    if (step.key === "categories" && draft.selectedCategories.length === 0) {
      Alert.alert(
        "Choose a few categories",
        "Pick the clothing categories you actually wear so we can tailor the size questions."
      );
      return;
    }
    if (step.key === "sizes") {
      const missingRequiredFields = adaptiveSizeFields
        .filter((field) => field.required)
        .filter((field) => {
          const value = draft.defaultSizes[field.key];
          return !String(value ?? "").trim();
        });
      if (missingRequiredFields.length > 0) {
        Alert.alert(
          "Finish the key sizes",
          `Add ${missingRequiredFields[0].label.toLowerCase()} so Wardrobe AI can size recommendations more accurately.`
        );
        return;
      }
    }
    if (stepIndex === STEPS.length - 1) {
      void onFinish();
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  }

  if (loading) {
    return (
      <SafeScreen backgroundColor={colors.background} style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={colors.aiAccent} />
          <Text style={{ color: colors.textSecondary }}>Preparing your style profile…</Text>
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140, gap: 22 }}
        >
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.aiAccent, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 }}>
              WARDROBE AI SETUP
            </Text>
            <View
              style={{
                height: 6,
                borderRadius: 999,
                backgroundColor: "rgba(255,255,255,0.06)",
                overflow: "hidden",
              }}
            >
              <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: colors.aiAccent }} />
            </View>
            <Text style={{ color: colors.text, fontSize: 34, fontWeight: "900" }}>{step.title}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 24 }}>{step.subtitle}</Text>
          </View>

          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 28,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              padding: 18,
              gap: 14,
            }}
          >
            {step.key === "basics" ? (
              <>
                <OnboardingInput
                  label="First name"
                  value={draft.firstName ?? ""}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, firstName: value }))}
                  placeholder="What should AURA call you?"
                />
                <OnboardingInput
                  label="Region / country"
                  value={draft.region ?? ""}
                  onChangeText={(value) => setDraft((prev) => ({ ...prev, region: value }))}
                  placeholder="e.g. United States"
                />
                <ChipGroup
                  label="Units"
                  values={["imperial", "metric"]}
                  selected={[draft.unitsPreference]}
                  onToggle={(value) => setDraft((prev) => ({ ...prev, unitsPreference: value as UserProfilePreferences["unitsPreference"] }))}
                />
              </>
            ) : null}

            {step.key === "wardrobeMode" ? (
              <ChipGroup
                label="Wardrobe mode"
                values={WARDROBE_MODES as unknown as string[]}
                selected={[draft.wardrobeMode]}
                onToggle={(value) => setDraft((prev) => ({ ...prev, wardrobeMode: value as UserProfilePreferences["wardrobeMode"] }))}
              />
            ) : null}

            {step.key === "categories" ? (
              <ChipGroup
                label="Categories worn"
                values={ONBOARDING_CATEGORY_OPTIONS as unknown as string[]}
                selected={draft.selectedCategories}
                onToggle={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    selectedCategories: toggleValue(prev.selectedCategories, value),
                  }))
                }
              />
            ) : null}

            {step.key === "style" ? (
              <ChipGroup
                label="Style aesthetics"
                values={STYLE_OPTIONS as unknown as string[]}
                selected={draft.styleAesthetics}
                onToggle={(value) =>
                  setDraft((prev) => ({
                    ...prev,
                    styleAesthetics: toggleValue(prev.styleAesthetics, value),
                  }))
                }
              />
            ) : null}

            {step.key === "body" ? (
              <>
                <OnboardingInput
                  label={`Height (${draft.unitsPreference === "imperial" ? "ft / in" : "cm"})`}
                  value={draft.body.height == null ? "" : String(draft.body.height)}
                  onChangeText={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      body: { ...prev.body, height: value ? Number(value) : null },
                    }))
                  }
                  keyboardType="numeric"
                />
                <OnboardingInput
                  label={`Weight (${draft.unitsPreference === "imperial" ? "lb" : "kg"})`}
                  value={draft.body.weight == null ? "" : String(draft.body.weight)}
                  onChangeText={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      body: { ...prev.body, weight: value ? Number(value) : null },
                    }))
                  }
                  keyboardType="numeric"
                />
                <ChipGroup
                  label="Preferred fit"
                  values={FIT_OPTIONS as unknown as string[]}
                  selected={draft.preferredFit ? [draft.preferredFit] : []}
                  onToggle={(value) => setDraft((prev) => ({ ...prev, preferredFit: value as UserProfilePreferences["preferredFit"] }))}
                />
              </>
            ) : null}

            {step.key === "sizes" ? (
              <>
                <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }}>
                  We&apos;ll tailor sizing to what you actually wear. Core sizes stay upfront, and deeper fit details are always optional.
                </Text>

                {groupedAdaptiveSizeFields.map((group) => (
                  <View
                    key={group.title}
                    style={{
                      gap: 10,
                      paddingTop: 4,
                      borderTopWidth: 1,
                      borderTopColor: "rgba(255,255,255,0.05)",
                    }}
                  >
                    <Text style={{ color: colors.aiAccent, fontSize: 12, fontWeight: "800", letterSpacing: 1.1 }}>
                      {group.title.toUpperCase()}
                    </Text>
                    {group.fields.map((field) => (
                      <OnboardingInput
                        key={field.key}
                        label={`${field.label}${field.required ? "" : " (optional)"}`}
                        value={String(draft.defaultSizes[field.key] ?? "")}
                        onChangeText={(value) =>
                          setDraft((prev) => {
                            const nextDefaultSizes = { ...prev.defaultSizes, [field.key]: value };
                            if (field.key === "tops") nextDefaultSizes.top = value;
                            if (field.key === "bottoms") {
                              nextDefaultSizes.bottomWaist =
                                nextDefaultSizes.bottomWaist ?? value;
                            }
                            if (field.key === "bottomsWaist") {
                              nextDefaultSizes.bottomWaist = value;
                              nextDefaultSizes.bottomsWaist = value;
                            }
                            if (field.key === "bottomsLength") nextDefaultSizes.bottomLength = value;
                            return {
                              ...prev,
                              defaultSizes: nextDefaultSizes,
                            };
                          })
                        }
                        placeholder={field.placeholder}
                      />
                    ))}
                  </View>
                ))}

                <View
                  style={{
                    marginTop: 4,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.08)",
                    backgroundColor: "rgba(255,255,255,0.025)",
                    overflow: "hidden",
                  }}
                >
                  <Pressable
                    onPress={() => setAdvancedFitOpen((current) => !current)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      opacity: pressed ? 0.84 : 1,
                      gap: 4,
                    })}
                  >
                    <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>
                      Advanced fit details
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                      Optional measurements for more precise tailoring and styling.
                    </Text>
                  </Pressable>

                  {advancedFitOpen ? (
                    <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
                      <OnboardingInput
                        label="Bust (optional)"
                        value={draft.advancedFit.bust ?? ""}
                        onChangeText={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            advancedFit: { ...prev.advancedFit, bust: value },
                          }))
                        }
                      />
                      <OnboardingInput
                        label="Waist measurement (optional)"
                        value={draft.advancedFit.waistMeasurement ?? ""}
                        onChangeText={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            advancedFit: { ...prev.advancedFit, waistMeasurement: value },
                          }))
                        }
                      />
                      <OnboardingInput
                        label="Hips (optional)"
                        value={draft.advancedFit.hips ?? ""}
                        onChangeText={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            advancedFit: { ...prev.advancedFit, hips: value },
                          }))
                        }
                      />
                      <OnboardingInput
                        label="Inseam (optional)"
                        value={draft.advancedFit.inseam ?? ""}
                        onChangeText={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            advancedFit: { ...prev.advancedFit, inseam: value },
                          }))
                        }
                      />
                      <OnboardingInput
                        label="Shoulder width (optional)"
                        value={draft.advancedFit.shoulderWidth ?? ""}
                        onChangeText={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            advancedFit: { ...prev.advancedFit, shoulderWidth: value },
                          }))
                        }
                      />
                      <OnboardingInput
                        label="Sleeve length (optional)"
                        value={draft.advancedFit.sleeveLength ?? ""}
                        onChangeText={(value) =>
                          setDraft((prev) => ({
                            ...prev,
                            advancedFit: { ...prev.advancedFit, sleeveLength: value },
                          }))
                        }
                      />
                      {shouldRenderBraSize ? (
                        <OnboardingInput
                          label="Bra size (optional)"
                          value={draft.advancedFit.braSize ?? ""}
                          onChangeText={(value) =>
                            setDraft((prev) => ({
                              ...prev,
                              advancedFit: { ...prev.advancedFit, braSize: value },
                            }))
                          }
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}

            {step.key === "preferences" ? (
              <>
                <ChipGroup
                  label="Favorite colors"
                  values={COLOR_OPTIONS as unknown as string[]}
                  selected={draft.favoriteColors}
                  onToggle={(value) =>
                    setDraft((prev) => ({ ...prev, favoriteColors: toggleValue(prev.favoriteColors, value) }))
                  }
                />
                <ChipGroup
                  label="Colors to avoid"
                  values={COLOR_OPTIONS as unknown as string[]}
                  selected={draft.avoidedColors}
                  onToggle={(value) =>
                    setDraft((prev) => ({ ...prev, avoidedColors: toggleValue(prev.avoidedColors, value) }))
                  }
                />
                <ChipGroup
                  label="Accessory preferences"
                  values={ACCESSORY_OPTIONS as unknown as string[]}
                  selected={draft.accessoryPreferences}
                  onToggle={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      accessoryPreferences: toggleValue(prev.accessoryPreferences, value),
                    }))
                  }
                />
                <ChipGroup
                  label="Occasions"
                  values={OCCASION_OPTIONS as unknown as string[]}
                  selected={draft.occasionPriority}
                  onToggle={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      occasionPriority: toggleValue(prev.occasionPriority, value),
                    }))
                  }
                />
              </>
            ) : null}

            {step.key === "goals" ? (
              <ChipGroup
                label="Goals"
                values={GOAL_OPTIONS as unknown as string[]}
                selected={draft.goals}
                onToggle={(value) =>
                  setDraft((prev) => ({ ...prev, goals: toggleValue(prev.goals, value) }))
                }
              />
            ) : null}
          </View>
        </ScrollView>

        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 20,
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.06)",
            backgroundColor: colors.background,
          }}
        >
          <Pressable
            onPress={nextStep}
            disabled={saving}
            style={({ pressed }) => ({
              borderRadius: 18,
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.aiAccent,
              opacity: saving ? 0.55 : pressed ? 0.86 : 1,
            })}
          >
            <Text style={{ color: "#071018", fontSize: 16, fontWeight: "900" }}>
              {stepIndex === STEPS.length - 1 ? (saving ? "Saving..." : "Finish setup") : "Continue"}
            </Text>
          </Pressable>
          {stepIndex > 0 ? (
            <Pressable
              onPress={() => setStepIndex((current) => Math.max(current - 1, 0))}
              style={({ pressed }) => ({ alignItems: "center", paddingVertical: 8, opacity: pressed ? 0.72 : 1 })}
            >
              <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>Back</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

function OnboardingInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric";
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        placeholderTextColor={colors.textSecondary}
        style={{
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          borderRadius: 18,
          backgroundColor: "rgba(255,255,255,0.03)",
          color: colors.text,
          paddingHorizontal: 16,
          paddingVertical: 15,
          fontSize: 16,
        }}
      />
    </View>
  );
}

function ChipGroup({
  label,
  values,
  selected,
  onToggle,
}: {
  label: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: "800" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {values.map((value) => {
          const active = chipSelected(selected, value);
          return (
            <Pressable
              key={value}
              onPress={() => onToggle(value)}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: active ? "rgba(143,216,255,0.18)" : "rgba(255,255,255,0.04)",
                borderWidth: 1,
                borderColor: active ? "rgba(143,216,255,0.4)" : "rgba(255,255,255,0.08)",
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={{ color: active ? colors.aiAccent : colors.text, fontWeight: "800", fontSize: 13 }}>
                {humanize(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
