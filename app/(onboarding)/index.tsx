import Slider from "@react-native-community/slider";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { Easing, FadeInUp, runOnJS } from "react-native-reanimated";

import { SafeScreen } from "@/src/components/SafeScreen";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  ONBOARDING_CATEGORY_OPTIONS,
  normalizeProfileSizePayload,
} from "@/src/lib/adaptiveSizing";
import {
  EMPTY_USER_PROFILE_PREFERENCES,
  loadUserProfilePreferences,
  saveUserAccountProfile,
  saveUserProfilePreferences,
} from "@/src/lib/userProfile";
import type {
  UnitsPreference,
  UserProfilePreferences,
  WardrobeMode,
} from "@/src/types/UserProfilePreferences";

const WARDROBE_MODE_CARDS: {
  value: Exclude<WardrobeMode, "custom">;
  icon: string;
  label: string;
  description: string;
}[] = [
  {
    value: "masculine",
    icon: "M",
    label: "Masculine",
    description: "Menswear cuts and silhouettes",
  },
  {
    value: "feminine",
    icon: "F",
    label: "Feminine",
    description: "Womenswear cuts and silhouettes",
  },
  {
    value: "neutral",
    icon: "N",
    label: "Neutral",
    description: "Unisex and gender-neutral pieces",
  },
  {
    value: "mixed",
    icon: "A",
    label: "Mixed",
    description: "Across all categories freely",
  },
];

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

const FIT_OPTIONS = ["slim", "regular", "relaxed", "oversized"] as const;
const SHOE_SIZES_EU = Array.from({ length: 14 }, (_, index) => 35 + index);
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"]);

type StepKey = "wardrobeMode" | "style" | "categories" | "profile";

type Step = {
  key: StepKey;
  title: string;
  subtitle: string;
};

const STEPS: Step[] = [
  {
    key: "wardrobeMode",
    title: "How do you dress?",
    subtitle: "Choose the wardrobe language AURA should use for silhouettes and styling.",
  },
  {
    key: "style",
    title: "What's your style?",
    subtitle: "Pick up to three aesthetics, then add where you usually dress up.",
  },
  {
    key: "categories",
    title: "What's in your wardrobe?",
    subtitle: "AURA will only suggest items in these categories.",
  },
  {
    key: "profile",
    title: "Quick profile",
    subtitle: "A few fit basics so AURA can personalize recommendations without the long form.",
  },
];

function toggleValue(list: string[], value: string) {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function getLocaleParts() {
  const locale =
    Intl.DateTimeFormat().resolvedOptions().locale ||
    (typeof navigator !== "undefined" ? navigator.language : "") ||
    "en-US";
  const region = locale.split("-").find((part) => part.length === 2)?.toUpperCase() ?? "US";
  const unitsPreference: UnitsPreference = IMPERIAL_REGIONS.has(region) ? "imperial" : "metric";
  return { locale, region, unitsPreference };
}

function unitsForPreference(unitsPreference: UnitsPreference) {
  if (unitsPreference === "imperial") {
    return { length: "in", weight: "lb", shoeRegion: "US", clothingRegion: "US" } as const;
  }
  return { length: "cm", weight: "kg", shoeRegion: "EU", clothingRegion: "INTL" } as const;
}

function formatHeight(value: number, unitsPreference: UnitsPreference) {
  if (unitsPreference === "imperial") {
    const feet = Math.floor(value / 12);
    const inches = value % 12;
    return `${feet}'${inches}"`;
  }
  return `${value} cm`;
}

function euShoeConversion(euSize: number) {
  const usMen = Math.max(1, euSize - 33.5);
  const usWomen = Math.max(1, euSize - 31);
  const uk = Math.max(1, euSize - 34);
  return `US M ${formatShoeHalf(usMen)} / US W ${formatShoeHalf(usWomen)} / UK ${formatShoeHalf(uk)}`;
}

function formatShoeHalf(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function messageForOnboardingSaveError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (code === "permission-denied" || code === "unauthenticated") {
    return "We couldn't save your setup because your session expired. Please sign in again and retry.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "We couldn't save your setup because the network is unavailable. Check your connection and try again.";
  }
  return "We couldn't save your setup. Please try again.";
}

function shoeValueFromDraft(draft: UserProfilePreferences) {
  const raw = String(draft.defaultSizes.shoes ?? "").match(/\d+/)?.[0];
  const next = raw ? Number(raw) : 42;
  return SHOE_SIZES_EU.includes(next) ? next : 42;
}

export default function OnboardingScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<UserProfilePreferences>(EMPTY_USER_PROFILE_PREFERENCES);
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);

  const detected = useMemo(() => getLocaleParts(), []);
  const step = STEPS[stepIndex];
  const progress = (stepIndex + 1) / STEPS.length;
  const isFirstStep = step.key === "wardrobeMode";
  const canContinue =
    step.key === "style"
      ? draft.styleAesthetics.length > 0
      : step.key === "categories"
        ? draft.selectedCategories.length > 0
        : step.key === "profile"
          ? Boolean((draft.firstName ?? "").trim()) && Boolean(draft.preferredFit)
          : true;

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      router.replace("/(auth)/welcome");
      return;
    }

    void loadUserProfilePreferences(user.uid)
      .then((profile) => {
        if (cancelled) return;
        const unitsPreference = profile.onboardingCompleted
          ? profile.unitsPreference
          : detected.unitsPreference;
        const heightDefault = unitsPreference === "imperial" ? 67 : 170;
        setDraft({
          ...EMPTY_USER_PROFILE_PREFERENCES,
          ...profile,
          region: profile.region ?? detected.region,
          unitsPreference,
          units: unitsForPreference(unitsPreference),
          firstName:
            profile.firstName ??
            user.displayName?.split(" ")[0] ??
            user.email?.split("@")[0] ??
            "",
          body: {
            ...profile.body,
            height: profile.body.height ?? profile.height.value ?? heightDefault,
          },
          height: {
            value: profile.height.value ?? profile.body.height ?? heightDefault,
            unit: unitsPreference === "imperial" ? "ft_in" : "cm",
          },
          defaultSizes: {
            ...profile.defaultSizes,
            shoes: profile.defaultSizes.shoes ?? "EU 42",
          },
          preferredFit: profile.preferredFit ?? "regular",
        });
      })
      .catch(() => {
        if (cancelled) return;
        const units = unitsForPreference(detected.unitsPreference);
        const heightDefault = detected.unitsPreference === "imperial" ? 67 : 170;
        setDraft({
          ...EMPTY_USER_PROFILE_PREFERENCES,
          region: detected.region,
          unitsPreference: detected.unitsPreference,
          units,
          firstName:
            user.displayName?.split(" ")[0] ??
            user.email?.split("@")[0] ??
            "",
          body: {
            height: heightDefault,
          },
          height: {
            value: heightDefault,
            unit: detected.unitsPreference === "imperial" ? "ft_in" : "cm",
          },
          defaultSizes: {
            shoes: "EU 42",
          },
          preferredFit: "regular",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, [detected.region, detected.unitsPreference, user?.displayName, user?.email, user?.uid]);

  const units = useMemo(
    () => unitsForPreference(draft.unitsPreference),
    [draft.unitsPreference],
  );

  function goToStep(nextIndex: number) {
    setStepIndex(Math.max(0, Math.min(nextIndex, STEPS.length - 1)));
  }

  function goBack() {
    if (stepIndex > 0) goToStep(stepIndex - 1);
  }

  function selectWardrobeMode(value: Exclude<WardrobeMode, "custom">) {
    setDraft((prev) => ({ ...prev, wardrobeMode: value }));
    setAutoAdvancing(true);
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      setAutoAdvancing(false);
      goToStep(1);
    }, 400);
  }

  async function onFinish() {
    if (saveInFlightRef.current) return;
    if (!user?.uid) {
      const message = "Please sign in again before finishing setup.";
      setSaveError(message);
      Alert.alert("Couldn't finish setup", message);
      return;
    }
    saveInFlightRef.current = true;
    try {
      setSaving(true);
      setSaveError(null);
      const normalizedSizingDraft = normalizeProfileSizePayload({
        ...draft,
        region: draft.region ?? detected.region,
        units,
        defaultSizes: {
          ...draft.defaultSizes,
          shoes: draft.defaultSizes.shoes ?? "EU 42",
        },
      });

      const heightValue =
        normalizedSizingDraft.body.height ??
        normalizedSizingDraft.height.value ??
        (draft.unitsPreference === "imperial" ? 67 : 170);
      const goals = normalizedSizingDraft.goals.length
        ? normalizedSizingDraft.goals
        : ["outfit_suggestions"];
      const favoriteColors =
        normalizedSizingDraft.favoriteColors.length > 0
          ? normalizedSizingDraft.favoriteColors
          : (normalizedSizingDraft.stylePreferences.favoriteColors ?? []);
      const avoidedColors =
        normalizedSizingDraft.avoidedColors.length > 0
          ? normalizedSizingDraft.avoidedColors
          : (normalizedSizingDraft.stylePreferences.avoidedColors ?? []);

      const profileToSave: UserProfilePreferences = {
        ...normalizedSizingDraft,
        onboardingCompleted: true,
        region: normalizedSizingDraft.region ?? detected.region,
        unitsPreference: draft.unitsPreference,
        units,
        favoriteColors,
        avoidedColors,
        accessoryPreferences: normalizedSizingDraft.accessoryPreferences,
        goals,
        defaultSizes: {
          ...normalizedSizingDraft.defaultSizes,
          shoes: normalizedSizingDraft.defaultSizes.shoes ?? "EU 42",
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
          value: heightValue,
          unit: draft.unitsPreference === "imperial" ? "ft_in" : "cm",
        },
        weight: {
          value: normalizedSizingDraft.weight.value,
          unit: draft.unitsPreference === "imperial" ? "lb" : "kg",
        },
        body: {
          ...normalizedSizingDraft.body,
          height: heightValue,
          weight: normalizedSizingDraft.weight.value ?? normalizedSizingDraft.body.weight ?? null,
        },
        advancedFit: {
          ...normalizedSizingDraft.advancedFit,
        },
        stylePreferences: {
          ...normalizedSizingDraft.stylePreferences,
          preferredStyles: normalizedSizingDraft.styleAesthetics,
          favoriteColors,
          avoidedColors,
        },
        fitPreferences: {
          ...normalizedSizingDraft.fitPreferences,
          tops:
            normalizedSizingDraft.preferredFit ??
            normalizedSizingDraft.fitPreferences.tops ??
            null,
        },
      };

      await saveUserAccountProfile(user.uid, {
        name:
          (draft.firstName ?? "").trim() ||
          user.displayName ||
          user.email?.split("@")[0] ||
          null,
      });
      await saveUserProfilePreferences(user.uid, profileToSave);
      router.replace("/(tabs)");
    } catch (error) {
      const message = messageForOnboardingSaveError(error);
      setSaveError(message);
      Alert.alert("Couldn't finish setup", message);
    } finally {
      setSaving(false);
      saveInFlightRef.current = false;
    }
  }

  async function nextStep() {
    if (saving) return;
    if (!canContinue) {
      if (step.key === "style") {
        Alert.alert("Choose your style", "Pick at least one style aesthetic.");
      } else if (step.key === "categories") {
        Alert.alert("Choose categories", "Pick the categories you actually wear.");
      } else if (step.key === "profile") {
        Alert.alert("Finish your profile", "Add your name and choose a preferred fit.");
      }
      return;
    }

    if (stepIndex === STEPS.length - 1) {
      await onFinish();
      return;
    }
    setSaveError(null);
    goToStep(stepIndex + 1);
  }

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-999, 24])
    .failOffsetY([-18, 18])
    .onEnd((event) => {
      if (event.translationX > 84 && event.velocityX > 250) {
        runOnJS(goBack)();
      }
    });

  if (loading) {
    return (
      <SafeScreen backgroundColor={colors.background} style={styles.loadingScreen}>
        <ActivityIndicator color={colors.aiAccent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Preparing your style profile...
        </Text>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={styles.screen}>
      <GestureDetector gesture={swipeGesture}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: colors.aiAccent }]}>AURA SETUP</Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${progress * 100}%`, backgroundColor: colors.aiAccent },
                ]}
              />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>{step.title}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{step.subtitle}</Text>
          </View>

          <ScrollView
            key={step.key}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: isFirstStep ? 28 : 18 },
            ]}
          >
            <Animated.View
              entering={FadeInUp.duration(300).easing(Easing.out(Easing.cubic))}
              style={styles.stepBody}
            >
              {step.key === "wardrobeMode" ? (
                <WardrobeModeStep
                  selected={draft.wardrobeMode}
                  onSelect={selectWardrobeMode}
                  disabled={autoAdvancing}
                />
              ) : null}

              {step.key === "style" ? (
                <StyleStep
                  styleAesthetics={draft.styleAesthetics}
                  occasionPriority={draft.occasionPriority}
                  onStyleToggle={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      styleAesthetics: toggleValue(prev.styleAesthetics, value),
                    }))
                  }
                  onOccasionToggle={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      occasionPriority: toggleValue(prev.occasionPriority, value),
                    }))
                  }
                />
              ) : null}

              {step.key === "categories" ? (
                <CategoriesStep
                  selected={draft.selectedCategories}
                  onToggle={(value) =>
                    setDraft((prev) => ({
                      ...prev,
                      selectedCategories: toggleValue(prev.selectedCategories, value),
                    }))
                  }
                  onSetAll={(selectedCategories) =>
                    setDraft((prev) => ({ ...prev, selectedCategories }))
                  }
                />
              ) : null}

              {step.key === "profile" ? (
                <QuickProfileStep
                  draft={draft}
                  width={width}
                  onDraftChange={setDraft}
                />
              ) : null}
            </Animated.View>
          </ScrollView>

          {!isFirstStep ? (
            <View style={[styles.footer, { backgroundColor: colors.background }]}>
              {saveError ? (
                <Text style={styles.saveErrorText}>{saveError}</Text>
              ) : null}
              <Pressable
                onPress={nextStep}
                disabled={saving || !canContinue}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.aiAccent,
                    opacity: saving || !canContinue ? 0.45 : pressed ? 0.86 : 1,
                  },
                ]}
              >
                <Text style={styles.primaryButtonText}>
                  {stepIndex === STEPS.length - 1
                    ? saving
                      ? "Saving..."
                      : "Finish setup"
                    : "Continue"}
                </Text>
              </Pressable>
              <Pressable
                onPress={goBack}
                style={({ pressed }) => [
                  styles.backButton,
                  { opacity: pressed ? 0.72 : 1 },
                ]}
              >
                <Text style={[styles.backButtonText, { color: colors.textSecondary }]}>Back</Text>
              </Pressable>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </GestureDetector>
    </SafeScreen>
  );
}

function WardrobeModeStep({
  selected,
  disabled,
  onSelect,
}: {
  selected: WardrobeMode;
  disabled: boolean;
  onSelect: (value: Exclude<WardrobeMode, "custom">) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.cardGrid}>
      {WARDROBE_MODE_CARDS.map((card) => {
        const active = selected === card.value;
        return (
          <Pressable
            key={card.value}
            onPress={() => onSelect(card.value)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.modeCard,
              {
                backgroundColor: active ? "rgba(255,255,255,0.05)" : "#1A1A1A",
                borderColor: active ? "rgba(255,255,255,0.92)" : "transparent",
                borderWidth: active ? 2 : 0,
                opacity: pressed ? 0.86 : 1,
              },
            ]}
          >
            <Text style={[styles.modeIcon, { color: colors.aiAccent }]}>{card.icon}</Text>
            <Text style={[styles.modeLabel, { color: colors.text }]}>{card.label}</Text>
            <Text style={[styles.modeDescription, { color: colors.textSecondary }]}>
              {card.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StyleStep({
  styleAesthetics,
  occasionPriority,
  onStyleToggle,
  onOccasionToggle,
}: {
  styleAesthetics: string[];
  occasionPriority: string[];
  onStyleToggle: (value: string) => void;
  onOccasionToggle: (value: string) => void;
}) {
  const capped = styleAesthetics.length >= 3;
  return (
    <View style={styles.sectionStack}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionKicker}>{styleAesthetics.length}/3 selected</Text>
      </View>
      <ChipGroup
        label="Style aesthetics"
        values={STYLE_OPTIONS as unknown as string[]}
        selected={styleAesthetics}
        onToggle={onStyleToggle}
        disabledValue={(value) => capped && !styleAesthetics.includes(value)}
      />
      <View style={styles.sectionDivider} />
      <ChipGroup
        label="When do you dress up?"
        values={OCCASION_OPTIONS as unknown as string[]}
        selected={occasionPriority}
        onToggle={onOccasionToggle}
      />
    </View>
  );
}

function CategoriesStep({
  selected,
  onToggle,
  onSetAll,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  onSetAll: (value: string[]) => void;
}) {
  const { colors } = useAppTheme();
  const allSelected = selected.length === ONBOARDING_CATEGORY_OPTIONS.length;
  return (
    <View style={styles.sectionStack}>
      <View style={styles.categoryHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            What do you actually wear?
          </Text>
          <Text style={[styles.sectionSubtext, { color: colors.textSecondary }]}>
            AURA will only suggest items in these categories
          </Text>
        </View>
        <Pressable
          onPress={() => onSetAll(allSelected ? [] : [...ONBOARDING_CATEGORY_OPTIONS])}
          style={({ pressed }) => [
            styles.selectAllButton,
            {
              borderColor: "rgba(255,255,255,0.12)",
              opacity: pressed ? 0.72 : 1,
            },
          ]}
        >
          <Text style={[styles.selectAllText, { color: colors.aiAccent }]}>
            {allSelected ? "Clear all" : "Select all"}
          </Text>
        </Pressable>
      </View>
      <ChipGroup
        values={ONBOARDING_CATEGORY_OPTIONS as unknown as string[]}
        selected={selected}
        onToggle={onToggle}
      />
    </View>
  );
}

function QuickProfileStep({
  draft,
  width,
  onDraftChange,
}: {
  draft: UserProfilePreferences;
  width: number;
  onDraftChange: React.Dispatch<React.SetStateAction<UserProfilePreferences>>;
}) {
  const { colors } = useAppTheme();
  const heightMin = draft.unitsPreference === "imperial" ? 55 : 140;
  const heightMax = draft.unitsPreference === "imperial" ? 84 : 215;
  const heightValue =
    draft.body.height ??
    draft.height.value ??
    (draft.unitsPreference === "imperial" ? 67 : 170);
  const shoeValue = shoeValueFromDraft(draft);

  return (
    <View style={styles.sectionStack}>
      <OnboardingInput
        label="Name"
        value={draft.firstName ?? ""}
        onChangeText={(value) =>
          onDraftChange((prev) => ({ ...prev, firstName: value }))
        }
        placeholder="First name"
      />

      <View style={styles.controlSection}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>Height</Text>
        <HeightSlider
          min={heightMin}
          max={heightMax}
          value={heightValue}
          unitsPreference={draft.unitsPreference}
          onChange={(value) =>
            onDraftChange((prev) => ({
              ...prev,
              body: { ...prev.body, height: value },
              height: {
                value,
                unit: prev.unitsPreference === "imperial" ? "ft_in" : "cm",
              },
            }))
          }
        />
      </View>

      <View style={styles.controlSection}>
        <Text style={[styles.sectionLabel, { color: colors.text }]}>Shoe size</Text>
        <ShoeSizePicker
          width={width}
          value={shoeValue}
          onChange={(value) =>
            onDraftChange((prev) => ({
              ...prev,
              defaultSizes: { ...prev.defaultSizes, shoes: `EU ${value}` },
            }))
          }
        />
      </View>

      <ChipGroup
        label="Preferred fit"
        values={FIT_OPTIONS as unknown as string[]}
        selected={draft.preferredFit ? [draft.preferredFit] : []}
        onToggle={(value) =>
          onDraftChange((prev) => ({
            ...prev,
            preferredFit: value as UserProfilePreferences["preferredFit"],
          }))
        }
        singleSelect
      />
    </View>
  );
}

function HeightSlider({
  min,
  max,
  value,
  unitsPreference,
  onChange,
}: {
  min: number;
  max: number;
  value: number;
  unitsPreference: UnitsPreference;
  onChange: (value: number) => void;
}) {
  const { colors } = useAppTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const clamped = Math.max(min, Math.min(max, Math.round(value)));
  const progress = (clamped - min) / (max - min);
  const pillLeft = trackWidth > 0 ? progress * Math.max(trackWidth - 64, 1) : 0;

  return (
    <View
      style={styles.sliderWrap}
      onLayout={(event: LayoutChangeEvent) => setTrackWidth(event.nativeEvent.layout.width)}
    >
      <View
        pointerEvents="none"
        style={[
          styles.heightPill,
          {
            left: pillLeft,
            backgroundColor: "rgba(255,255,255,0.08)",
            borderColor: "rgba(255,255,255,0.13)",
          },
        ]}
      >
        <Text style={[styles.heightPillText, { color: colors.text }]}>
          {formatHeight(clamped, unitsPreference)}
        </Text>
      </View>
      <Slider
        minimumValue={min}
        maximumValue={max}
        step={1}
        value={clamped}
        minimumTrackTintColor={colors.aiAccent}
        maximumTrackTintColor="rgba(255,255,255,0.14)"
        thumbTintColor="#FFFFFF"
        onValueChange={(next) => onChange(Math.round(next))}
        style={styles.slider}
      />
    </View>
  );
}

function ShoeSizePicker({
  value,
  width,
  onChange,
}: {
  value: number;
  width: number;
  onChange: (value: number) => void;
}) {
  const { colors } = useAppTheme();
  const itemWidth = 64;
  const pickerWidth = Math.min(width - 40, 360);
  const sidePadding = Math.max((pickerWidth - itemWidth) / 2, 0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const index = SHOE_SIZES_EU.indexOf(value);
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: Math.max(index, 0) * itemWidth, animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [itemWidth, value]);

  function updateFromOffset(offsetX: number) {
    const index = Math.max(
      0,
      Math.min(SHOE_SIZES_EU.length - 1, Math.round(offsetX / itemWidth)),
    );
    const next = SHOE_SIZES_EU[index];
    if (next !== value) onChange(next);
  }

  return (
    <View style={[styles.pickerShell, { width: pickerWidth }]}>
      <View
        pointerEvents="none"
        style={[
          styles.pickerCenter,
          {
            left: sidePadding,
            width: itemWidth,
            borderColor: "rgba(255,255,255,0.18)",
            backgroundColor: "rgba(255,255,255,0.05)",
          },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={itemWidth}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: sidePadding }}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) =>
          updateFromOffset(event.nativeEvent.contentOffset.x)
        }
        onMomentumScrollEnd={(event) => updateFromOffset(event.nativeEvent.contentOffset.x)}
        scrollEventThrottle={16}
      >
        {SHOE_SIZES_EU.map((size) => {
          const active = size === value;
          return (
            <View key={size} style={[styles.shoeItem, { width: itemWidth }]}>
              <Text
                style={[
                  styles.shoeValue,
                  {
                    color: active ? colors.text : colors.textSecondary,
                    opacity: active ? 1 : 0.5,
                    fontSize: active ? 24 : 18,
                  },
                ]}
              >
                {size}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <Text style={[styles.shoeConversion, { color: colors.textSecondary }]}>
        EU {value} · {euShoeConversion(value)}
      </Text>
    </View>
  );
}

function OnboardingInput({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.sectionLabel, { color: colors.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize="words"
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.03)",
            color: colors.text,
          },
        ]}
      />
    </View>
  );
}

function ChipGroup({
  label,
  values,
  selected,
  onToggle,
  disabledValue,
  singleSelect,
}: {
  label?: string;
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
  disabledValue?: (value: string) => boolean;
  singleSelect?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 10 }}>
      {label ? <Text style={[styles.sectionLabel, { color: colors.text }]}>{label}</Text> : null}
      <View style={styles.chipWrap}>
        {values.map((value) => {
          const active = selected.includes(value);
          const disabled = disabledValue?.(value) ?? false;
          return (
            <Pressable
              key={value}
              disabled={disabled}
              onPress={() => {
                if (singleSelect && active) return;
                onToggle(value);
              }}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: active ? "rgba(217,207,255,0.17)" : "rgba(255,255,255,0.04)",
                  borderColor: active ? "rgba(217,207,255,0.52)" : "rgba(255,255,255,0.08)",
                  opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? colors.aiAccent : colors.text },
                ]}
              >
                {humanize(value)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "700",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  stepBody: {
    flex: 1,
  },
  cardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  modeCard: {
    width: "48%",
    minHeight: 158,
    borderRadius: 8,
    padding: 16,
    justifyContent: "space-between",
  },
  modeIcon: {
    fontSize: 24,
    fontWeight: "900",
  },
  modeLabel: {
    fontSize: 19,
    fontWeight: "900",
  },
  modeDescription: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  sectionStack: {
    gap: 22,
  },
  sectionHeader: {
    alignItems: "flex-start",
  },
  sectionKicker: {
    color: "rgba(255,255,255,0.54)",
    fontSize: 12,
    fontWeight: "800",
  },
  sectionDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "800",
  },
  sectionSubtext: {
    fontSize: 13,
    lineHeight: 19,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  selectAllButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: "900",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontWeight: "800",
    fontSize: 13,
  },
  controlSection: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
  },
  sliderWrap: {
    paddingTop: 34,
  },
  heightPill: {
    position: "absolute",
    top: 0,
    minWidth: 64,
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heightPillText: {
    fontSize: 12,
    fontWeight: "900",
  },
  slider: {
    width: "100%",
    height: 44,
  },
  pickerShell: {
    alignSelf: "center",
    gap: 8,
  },
  pickerCenter: {
    position: "absolute",
    top: 0,
    height: 56,
    borderRadius: 8,
    borderWidth: 1,
  },
  shoeItem: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  shoeValue: {
    fontWeight: "900",
  },
  shoeConversion: {
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  saveErrorText: {
    color: "#FFB4A8",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    textAlign: "center",
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#071018",
    fontSize: 16,
    fontWeight: "900",
  },
  backButton: {
    alignItems: "center",
    paddingVertical: 8,
  },
  backButtonText: {
    fontWeight: "800",
  },
});
