import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  InteractionManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import ContinueChatCard from "@/src/components/home/ContinueChatCard";
import AuraPressable from "@/src/components/aura/AuraPressable";
import AuraLookModule from "@/src/components/home/AuraLookModule";
import HomeHero from "@/src/components/home/HomeHero";
import QuickActionRail, { type QuickActionItem } from "@/src/components/home/QuickActionRail";
import ShopOptionsSheet from "@/src/components/shop/ShopOptionsSheet";
import SmartToolsGrid, { type SmartTool } from "@/src/components/home/SmartToolsGrid";
import { AuraSkeleton, AuraSkeletonLine } from "@/src/components/ui/AuraSkeleton";
import { AuraTopSafeAreaScrim, auraButtonStyle, auraButtonTextStyle, auraSurfaceTiers } from "@/src/components/ui/auraStylePrimitives";
import { HOME_DEFERRED_FEATURES } from "@/src/components/home/homeDeferredFeatures";
import { homeTypography } from "@/src/components/home/homeTypography";
import type { AppColors } from "@/constants/theme";
import { CTA_HEIGHT, CTA_HORIZONTAL_PADDING, PILL_RADIUS } from "@/src/constants/auraControls";
import { AURA_TRAINING_ROUTE } from "@/src/constants/routes";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useLocalWeather } from "@/src/hooks/useLocalWeather";
import { useNow } from "@/src/hooks/useNow";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { buildVisiblePreferenceHint, loadAssistantProfile } from "@/src/lib/assistantMemory";
import { loadChatMessages, loadLatestChatThread, type AIChatThread } from "@/src/lib/aiChats";
import { askAuraStream, isAuraStreamAbortError } from "@/src/lib/aura";
import { handleSharedAuraLookAction } from "@/src/lib/auraActions";
import { loadLatestSavedAuraLook } from "@/src/lib/auraLooks";
import { generateAuraSwipeBatch } from "@/src/lib/auraSwipe";
import { listenToItems, normalizeLaundryStatus } from "@/src/lib/items";
import {
  buildMinimumClosetSummary,
  getMinimumClosetProgress,
} from "@/src/lib/minimumCloset";
import {
  trackSuggestionEvent,
} from "@/src/lib/suggestionAnalytics";
import { getStyleProfileConfig } from "@/src/lib/styleProfile";
import { Toast } from "@/src/lib/toast";
import { loadUserProfilePreferences } from "@/src/lib/userProfile";
import { markOutfitWorn } from "@/src/lib/wearOutfit";
import {
  buildAdHocWardrobeSuggestion,
  buildWardrobeSuggestions,
  type WardrobeSuggestion,
} from "@/src/lib/wardrobeSuggestions";
import {
  getCachedChatList,
  getCachedHomeSnapshot,
  getCachedProfilePreferences,
  setCachedHomeSnapshot,
} from "@/src/lib/localCache";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook, AuraLookAction, AuraResponse } from "@/src/types/aura";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";
import { subscribeOutfitByDate, type DailyOutfitRecord } from "@/src/utils/dailyOutfits";

const HOME_BACKGROUND_BASE = "#080709";
const HOME_BACKGROUND_GRADIENT = ["#080709", "#080709", "#111014"] as const;
const HOME_SECTION_GAP = 24;
const HOME_SECTION_CONTENT_GAP = 16;
const HOME_CARD_GAP = 12;
const HOME_TIGHT_GAP = 4;
const HOME_BOTTOM_BREATHING_ROOM = 24;

function RevealSection({
  delay,
  children,
}: {
  delay: number;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 360,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

function CompleteWardrobeCard({
  colors,
  suggestions,
  onPress,
}: {
  colors: AppColors;
  suggestions: WardrobeSuggestion[];
  onPress: () => void;
}) {
  const layout = useResponsiveLayout();
  const topSuggestion = suggestions[0];

  return (
    <View
      style={{
        borderRadius: layout.mediumRadius,
        padding: layout.cardPadding,
        ...auraSurfaceTiers.surfaceBase,
        gap: HOME_CARD_GAP,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: HOME_CARD_GAP }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.surfaceSoft,
            borderWidth: 1,
            borderColor: colors.borderSoft,
          }}
        >
          <Ionicons name="sparkles-outline" size={20} color={colors.ctaCream} />
        </View>
        <View style={{ flex: 1, gap: HOME_TIGHT_GAP }}>
          <Text style={[homeTypography.label, { color: colors.lightPurple }]}>COMPLETE YOUR WARDROBE</Text>
          <Text style={[homeTypography.titleSmall, { color: colors.text }]} numberOfLines={2}>
            {topSuggestion ? `Start with ${topSuggestion.itemType}` : "A few precise pieces would unlock more range"}
          </Text>
          <Text style={[homeTypography.bodySmall, { color: colors.textSecondary, opacity: 0.84 }]} numberOfLines={2}>
            AURA found the quiet gaps that would create more outfit combinations without clutter.
          </Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        {suggestions.slice(0, 2).map((suggestion) => (
          <View
            key={suggestion.id}
            style={{
              minHeight: 42,
              borderRadius: 16,
              paddingHorizontal: 11,
              paddingVertical: 9,
              backgroundColor: colors.surfaceSoft,
              borderWidth: 1,
              borderColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                backgroundColor: suggestion.priority === "high" ? colors.ctaCream : colors.textMuted,
              }}
            />
            <Text
              style={[homeTypography.bodySmall, { flex: 1, color: colors.text }]}
              numberOfLines={1}
            >
              {suggestion.itemType}
            </Text>
            <Text
              selectable
              style={{
                color: colors.textSecondary,
                fontSize: 11.5,
                lineHeight: 15,
                fontWeight: "600",
                letterSpacing: 0,
                fontVariant: ["tabular-nums"],
              }}
              numberOfLines={1}
            >
              +{suggestion.outfitsUnlockedEstimate}
            </Text>
          </View>
        ))}
      </View>

      <AuraPressable
        onPress={onPress}
        haptic="selection"
        hapticTrigger="press"
        pressedScale={0.97}
        style={{
          alignSelf: "flex-start",
          ...auraButtonStyle(colors, "primary"),
          minHeight: CTA_HEIGHT,
          borderRadius: PILL_RADIUS,
          paddingHorizontal: CTA_HORIZONTAL_PADDING,
          flexDirection: "row",
          gap: 8,
        }}
      >
        <Ionicons name="arrow-forward" size={16} color={colors.ctaText} />
        <Text style={[auraButtonTextStyle(colors, "primary"), { fontSize: 13, lineHeight: 17 }]}>
          View suggestions
        </Text>
      </AuraPressable>
    </View>
  );
}

function HomeLoadingSkeleton() {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View style={{ flex: 1, backgroundColor: HOME_BACKGROUND_BASE }}>
      <LinearGradient
        pointerEvents="none"
        colors={HOME_BACKGROUND_GRADIENT}
        locations={[0, 0.56, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          paddingTop: layout.topContentInset,
          paddingHorizontal: layout.horizontalPadding,
          gap: 18,
        }}
      >
        <View style={{ gap: 9 }}>
          <AuraSkeletonLine width="42%" height={13} />
          <AuraSkeletonLine width="68%" height={30} />
          <AuraSkeletonLine width="56%" height={12} />
        </View>
        <View
          style={{
            borderRadius: layout.largeRadius,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceGlass,
            padding: layout.cardPadding,
            gap: 14,
          }}
        >
          <AuraSkeletonLine width="35%" height={12} />
          <AuraSkeletonLine width="70%" height={24} />
          <AuraSkeletonLine width="88%" height={13} />
          <AuraSkeleton height={layout.heroHeight * 0.5} radius={layout.mediumRadius} />
          <AuraSkeletonLine width="100%" height={52} />
        </View>
        <AuraSkeleton height={72} radius={layout.mediumRadius} />
        <AuraSkeleton height={120} radius={layout.mediumRadius} />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const { greeting, timeLabel } = useNow();
  const weather = useLocalWeather();
  const uid = user?.uid ?? null;

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayRecord, setTodayRecord] = useState<DailyOutfitRecord | null>(null);
  const [assistantHint, setAssistantHint] = useState<string | null>(null);
  const [latestChatThread, setLatestChatThread] = useState<AIChatThread | null>(null);
  const [latestAuraLookResponse, setLatestAuraLookResponse] = useState<AuraResponse | null>(null);
  const [latestSavedLook, setLatestSavedLook] = useState<import("@/src/lib/auraLooks").SavedAuraLookRecord | null>(null);
  const [profilePreferences, setProfilePreferences] = useState<UserProfilePreferences | null>(null);
  const [activeShopSuggestion, setActiveShopSuggestion] = useState<WardrobeSuggestion | null>(null);
  const [renderDeferredHomeSections, setRenderDeferredHomeSections] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [regeneratingLook, setRegeneratingLook] = useState(false);
  const homeCacheRefreshingRef = useRef(false);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setLoading(false);
      router.replace("/(auth)/welcome");
      return;
    }

    setItems([]);
    setLoading(true);
    const unsub = listenToItems(
      uid,
      (next) => {
        setItems(next as ClothingItem[]);
        setLoading(false);
      },
      {
        status: "ALL",
        sort: "NEWEST",
        onError: (message) => {
          setLoading(false);
          Alert.alert("Firestore error", message);
        },
      }
    );

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    if (!uid) {
      setLatestChatThread(null);
      setLatestSavedLook(null);
      setTodayRecord(null);
      return () => {
        cancelled = true;
      };
    }

    setLatestChatThread(null);
    setLatestSavedLook(null);
    setTodayRecord(null);

    void getCachedHomeSnapshot(uid).then((cached) => {
      if (cancelled || !cached?.data) return;
      homeCacheRefreshingRef.current = cached.stale;
      setLatestChatThread(cached.data.latestChatPreview);
      setLatestSavedLook(cached.data.latestSavedLookPreview);
      setTodayRecord(cached.data.todayOutfitPreview);
    });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeOutfitByDate(
      uid,
      new Date(),
      (record) => setTodayRecord(record),
      () => setTodayRecord(null)
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (weather.permission === "granted" && weather.state === "idle") {
      void weather.actions.refresh();
    }
  }, [weather.actions, weather.permission, weather.state]);

  useEffect(() => {
    if (loading) return;
    setRenderDeferredHomeSections(false);
    const task = InteractionManager.runAfterInteractions(() => {
      setRenderDeferredHomeSections(true);
    });
    const fallback = setTimeout(() => setRenderDeferredHomeSections(true), 900);
    return () => {
      task.cancel?.();
      clearTimeout(fallback);
    };
  }, [loading]);

  const loadHomeCompanionData = React.useCallback(
    async (isActive: () => boolean) => {
      if (!uid) {
        setAssistantHint(null);
        setLatestChatThread(null);
        setLatestAuraLookResponse(null);
        return;
      }
      try {
        const cachedProfilePreferences = await getCachedProfilePreferences(uid);
        if (isActive() && cachedProfilePreferences?.data) {
          setProfilePreferences(cachedProfilePreferences.data);
        }
        const cachedChats = await getCachedChatList(uid);
        if (isActive() && cachedChats?.data?.[0]) {
          setLatestChatThread(cachedChats.data[0]);
        }
        const [assistantProfile, latestChat, savedLook, userProfilePreferences] = await Promise.all([
          loadAssistantProfile(uid),
          loadLatestChatThread(uid),
          loadLatestSavedAuraLook(uid),
          loadUserProfilePreferences(uid),
        ]);
        if (!isActive()) return;
        setAssistantHint(buildVisiblePreferenceHint(assistantProfile));
        setLatestChatThread(latestChat);
        setLatestSavedLook(savedLook);
        setProfilePreferences(userProfilePreferences);
        if (latestChat?.chatId) {
          const chatMessages = await loadChatMessages(uid, latestChat.chatId);
          if (!isActive()) return;
          const latestAura = [...chatMessages]
            .reverse()
            .find((message) => message.type === "assistant" && message.aura?.look)?.aura ?? null;
          setLatestAuraLookResponse(latestAura);
        } else {
          setLatestAuraLookResponse(null);
        }
      } catch {
        if (!isActive()) return;
        setAssistantHint(null);
      }
    },
    [uid],
  );

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const task = InteractionManager.runAfterInteractions(() => {
        void loadHomeCompanionData(() => active);
      });
      return () => {
        active = false;
        task.cancel?.();
      };
    }, [loadHomeCompanionData])
  );

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const styleProfile = useMemo(
    () => getStyleProfileConfig(profilePreferences),
    [profilePreferences]
  );
  const displayName = (
    profilePreferences?.firstName ??
    user?.displayName ??
    user?.email?.split("@")[0] ??
    "there"
  ).trim();
  const headerGreeting = `${greeting}, ${displayName}`;

  const weatherLabel = useMemo(() => {
    if (weather.permission === "granted" && weather.state === "ready") {
      const city = weather.city ?? "Your city";
      const temp = typeof weather.tempC === "number" ? `${Math.round(weather.tempC)}°C` : null;
      return [city, weather.label ?? null, temp, timeLabel].filter(Boolean).join(" • ");
    }
    if (weather.permission === "blocked") return "Weather available when location access is enabled";
    if (weather.permission === "denied") return "Location denied • enable weather-aware outfit suggestions";
    return `${Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace(/_/g, " ") ?? "Your city"} • ${timeLabel}`;
  }, [timeLabel, weather.city, weather.label, weather.permission, weather.state, weather.tempC]);

  const availableCount = useMemo(
    () => items.filter((item) => normalizeLaundryStatus(item) === "clean").length,
    [items]
  );
  const laundryCount = useMemo(
    () => items.filter((item) => normalizeLaundryStatus(item) === "in_laundry").length,
    [items]
  );
  const needsWashCount = useMemo(
    () => items.filter((item) => normalizeLaundryStatus(item) === "needs_wash").length,
    [items]
  );
  const unwornCount = useMemo(
    () =>
      items.filter((item) => {
        const wearCount =
          typeof item.wearCountSinceWash === "number" ? item.wearCountSinceWash : 0;
        return item.status === "AVAILABLE" && wearCount === 0;
      }).length,
    [items]
  );

  const heroStylistNote = useMemo(() => {
    if (todayRecord?.plannedOutfit || todayRecord?.wornOutfit) {
      return "Built from pieces ready right now.";
    }
    if (unwornCount > 0) {
      return "Ready to pull ignored pieces back in.";
    }
    if (laundryCount > 0) {
      return "Built around what is already wearable now.";
    }
    if (weather.permission === "granted" && weather.state === "ready") {
      if (weather.tempC != null && weather.tempC < 12) return "Cleaner layers will carry this best.";
      if (weather.tempC != null && weather.tempC > 24) return "Keep it light without flattening the look.";
    }
    if (styleProfile.recommendationEmphasis.includes("smart_casual")) {
      return "This stays in your lane without feeling too safe.";
    }
    return "A strong look can start from what you already own.";
  }, [
    laundryCount,
    styleProfile.recommendationEmphasis,
    todayRecord?.plannedOutfit,
    todayRecord?.wornOutfit,
    unwornCount,
    weather.permission,
    weather.state,
    weather.tempC,
  ]);

  const heroGuidancePhrases = useMemo(() => {
    const phrases: string[] = [];
    if (availableCount > 0) phrases.push("Start with what is ready");
    if (unwornCount > 0) phrases.push("Pull one ignored piece back in");
    if (weather.permission === "granted" && weather.state === "ready") {
      if (weather.tempC != null && weather.tempC < 12) {
        phrases.push("Layer it clean");
      } else if (weather.tempC != null && weather.tempC > 24) {
        phrases.push("Keep it lighter");
      } else {
        phrases.push("Keep the balance sharp");
      }
    }
    if (!phrases.length) phrases.push("Start with what is ready");
    return phrases.slice(0, 3);
  }, [availableCount, unwornCount, weather.permission, weather.state, weather.tempC]);

  const hasMinimalWardrobe = availableCount < 4;
  const minimumClosetProgress = useMemo(() => getMinimumClosetProgress(items), [items]);
  const wardrobeSuggestions = useMemo(
    () =>
      buildWardrobeSuggestions({
        items,
        profilePreferences,
        savedLooks: [
          {
            addToComplete: latestAuraLookResponse?.recommendedAdditions ?? [],
            missingPieces: latestAuraLookResponse?.missingPieces ?? [],
            upgradeSuggestions: latestAuraLookResponse?.upgradeSuggestions ?? [],
          },
          ...(latestAuraLookResponse?.look
            ? [{ addToComplete: latestAuraLookResponse.look.addToComplete }]
            : []),
          ...(latestAuraLookResponse?.lookOptions ?? []).map((look) => ({
            addToComplete: look.addToComplete,
          })),
          ...(latestSavedLook?.look
            ? [{ addToComplete: latestSavedLook.look.addToComplete }]
            : []),
        ],
      }),
    [items, latestAuraLookResponse, latestSavedLook?.look, profilePreferences],
  );
  const latestLook = latestAuraLookResponse?.look ?? latestSavedLook?.look ?? null;

  useEffect(() => {
    if (!uid || !wardrobeSuggestions.length) return;
    wardrobeSuggestions.forEach((suggestion) => {
      void trackSuggestionEvent({
        userId: uid,
        eventName: "suggestion_viewed",
        suggestion,
        sourceScreen: "home",
      });
    });
  }, [uid, wardrobeSuggestions]);

  const openWardrobeSuggestions = React.useCallback(() => {
    if (uid) {
      wardrobeSuggestions.forEach((suggestion) => {
        void trackSuggestionEvent({
          userId: uid,
          eventName: "suggestion_clicked",
          suggestion,
          sourceScreen: "home",
        });
      });
    }
    router.push("/insights");
  }, [uid, wardrobeSuggestions]);

  useEffect(() => {
    if (!uid || loading) return;
    homeCacheRefreshingRef.current = false;
    void setCachedHomeSnapshot(uid, {
      closetItemCount: items.length,
      cleanCount: availableCount,
      laundryCount,
      needsWashCount,
      minimumClosetProgress,
      latestSavedLookPreview: latestSavedLook,
      latestChatPreview: latestChatThread,
      todayOutfitPreview: todayRecord,
    });
  }, [
    availableCount,
    items.length,
    latestChatThread,
    latestSavedLook,
    laundryCount,
    loading,
    minimumClosetProgress,
    needsWashCount,
    todayRecord,
    uid,
  ]);
  const proactiveLookMeta = useMemo(() => {
    const leansDressy = styleProfile.recommendationEmphasis.some((value) =>
      ["date_night", "going_out", "dress_styling"].includes(value)
    );
    const leansCasual = styleProfile.recommendationEmphasis.some((value) =>
      ["casual_everyday", "streetwear", "weekend"].includes(value)
    );
    const leansTailored = styleProfile.recommendationEmphasis.some((value) =>
      ["smart_casual", "office", "formal"].includes(value)
    );

    if (latestAuraLookResponse?.look) {
      return {
        eyebrow: latestAuraLookResponse.look.addToComplete.length ? "COMPLETE THE LOOK" : "BUILT FROM YOUR WARDROBE",
        title:
          weather.permission === "granted" && weather.state === "ready"
            ? "Recommended for today"
            : "Built from your wardrobe",
        subtitle:
          latestAuraLookResponse.look.addToComplete.length
            ? "Use what you own and add one or two sharp pieces to finish it."
            : "AURA kept this grounded in pieces you can actually wear now.",
      };
    }
    if (latestSavedLook?.look) {
      return {
        eyebrow: "SAVED LOOK",
        title: latestSavedLook.title || "A look worth keeping",
        subtitle: "A saved AURA look you can keep building on.",
      };
    }
    if (weather.permission === "granted" && weather.state === "ready") {
      if (weather.tempC != null && weather.tempC < 12) {
        return {
          eyebrow: "DRESS FOR WEATHER",
          fallbackTitle: "Layered for today",
          fallbackBody: "The weather is doing more work today, so start with a smart layered base and let AURA build around what is ready in your closet.",
          primaryPrompt: "Build a weather-aware layered look with a visual outfit recommendation.",
          secondaryPrompt: "Build a warm look using only my closet if possible.",
        };
      }
      if (weather.tempC != null && weather.tempC > 24) {
        return {
          eyebrow: "LIGHTER FOR TODAY",
          fallbackTitle: "Clean and easy today",
          fallbackBody: "AURA can keep today lighter, cleaner, and more comfortable without making the look feel flat.",
          primaryPrompt: "Build a light warm-weather look with a visual outfit recommendation.",
          secondaryPrompt: "Build a heat-friendly look using only my closet.",
        };
      }
    }
    if (unwornCount > 0) {
      return {
        eyebrow: "BUILT FROM YOUR WARDROBE",
        fallbackTitle: "Use what’s being ignored",
        fallbackBody: "AURA can pull neglected pieces back into rotation and still make the outfit feel intentional.",
        primaryPrompt: "Build a visual outfit recommendation around my least-worn items.",
        secondaryPrompt: "Show a sharper version using only my closet.",
      };
    }
    if (hasMinimalWardrobe) {
      return {
        eyebrow: "COMPLETE THE LOOK",
        fallbackTitle: "Unlock stronger outfits",
        fallbackBody: "Your closet is still taking shape. AURA can show a hybrid look now and point out the few additions that would unlock more combinations.",
        primaryPrompt: "Show me a hybrid visual look using what I own and what I should add next.",
        secondaryPrompt: "What should I buy first to unlock stronger outfits?",
      };
    }
    if (leansDressy) {
      return {
        eyebrow: "GOOD FOR TONIGHT",
        fallbackTitle: "A polished night direction",
        fallbackBody: "AURA can build around the dressier side of your wardrobe and still keep it closet-first.",
        primaryPrompt: "Plan a date-night or going-out look using the categories I actually wear.",
        secondaryPrompt: "Style a sharper evening outfit from my wardrobe.",
      };
    }
    if (leansTailored) {
      return {
        eyebrow: "SMARTER EVERYDAY",
        fallbackTitle: "Pulled together and sharp",
        fallbackBody: "AURA can lean into blazers, trousers, and cleaner layers for a more polished daily direction.",
        primaryPrompt: "Build a smart casual or office-ready outfit using the categories I wear most.",
        secondaryPrompt: "Show a sharper version that still feels easy.",
      };
    }
    if (leansCasual) {
      return {
        eyebrow: "BUILT FOR EVERYDAY",
        fallbackTitle: "Easy and lived-in",
        fallbackBody: "AURA can lean into your casual rotation and keep it intentional without overcomplicating it.",
        primaryPrompt: "Build a casual everyday look using the categories I wear most.",
        secondaryPrompt: "Give it a streetwear edge using only my closet.",
      };
    }
    return {
      eyebrow: "GOOD FOR TONIGHT",
      fallbackTitle: "A sharper direction",
      fallbackBody: "If you want something more elevated, AURA can build a premium night look instead of another basic outfit suggestion.",
      primaryPrompt: "Plan a sharper look for tonight with a visual outfit recommendation.",
      secondaryPrompt: "Make it dressier and use my best pieces.",
    };
  }, [
    hasMinimalWardrobe,
    latestAuraLookResponse?.look,
    latestSavedLook,
    styleProfile.recommendationEmphasis,
    unwornCount,
    weather.permission,
    weather.state,
    weather.tempC,
  ]);

  const handleRegenerateHomeLook = React.useCallback(async () => {
    if (!uid) {
      Alert.alert("AURA", "Please sign in to regenerate outfits.");
      return;
    }
    if (regeneratingLook) return;

    const previousLookItemIds = Array.from(
      new Set(
        (latestLook?.pieces ?? [])
          .map((piece) => piece.itemId)
          .filter((itemId): itemId is string => !!itemId),
      ),
    );
    const previousLookSignature = previousLookItemIds.length
      ? [...previousLookItemIds].sort().join("|")
      : "";
    const previousLookSummary = latestLook
      ? ` Avoid repeating this current look: ${latestLook.lookTitle}. Current closet pieces: ${(latestLook.fromCloset ?? []).join(", ")}.`
      : "";
    const prompt =
      `Regenerate a fresh closet-first outfit from my wardrobe for today. Make it visually distinct from the current look, use pieces I can wear now, and return one structured visual look.${previousLookSummary}`;
    const pickFreshLook = (looks: AuraLook[]) =>
      looks.find((candidate) => {
        if (!previousLookItemIds.length) return true;
        const candidateIds = new Set(
          (candidate.pieces ?? [])
            .map((piece) => piece.itemId)
            .filter((itemId): itemId is string => !!itemId),
        );
        if (!candidateIds.size) return true;
        const overlap = previousLookItemIds.filter((itemId) => candidateIds.has(itemId)).length;
        return overlap <= 1 || overlap < previousLookItemIds.length;
      }) ?? looks[0] ?? null;

    setRegeneratingLook(true);
    try {
      try {
        const batch = await generateAuraSwipeBatch({
          items,
          numOutfits: 3,
          intentText: prompt,
          excludeItemIds: previousLookItemIds,
          recentItemIds: previousLookItemIds,
          previousLookItemIds,
          previousLookSignatures: previousLookSignature ? [previousLookSignature] : [],
          maxOverlap: 1,
        });
        const batchLooks = batch.lookOptions.map((option) => option.look).filter(Boolean);
        const batchLook = pickFreshLook(batchLooks);

        if (batchLook) {
          const batchReason =
            batch.lookOptions.find((option) => option.look === batchLook)?.reason ||
            batchLook.shortExplanation;
          setLatestAuraLookResponse({
            presentation: "card",
            title: batchLook.lookTitle,
            reply: "I regenerated a fresh closet-first outfit from what is ready now.",
            reason: batchReason,
            outfitItems: batchLook.fromCloset,
            ownedPieces: batchLook.fromCloset,
            recommendedAdditions: batchLook.addToComplete,
            swapSuggestion: "",
            missingPieces: batchLook.addToComplete,
            upgradeSuggestions: [],
            upgradeSuggestionItems: [],
            chips: [],
            look: batchLook,
            lookOptions: batchLooks,
          });
          return;
        }
      } catch {
        // The structured batch path is preferred, but the chat stream can still return a visual look.
      }

      const result = await askAuraStream({
        message: prompt,
        selectedDate: new Date().toISOString().slice(0, 10),
        weather:
          weather.permission === "granted" && weather.state === "ready"
            ? {
                tempF:
                  typeof weather.tempC === "number"
                    ? Math.round((weather.tempC * 9) / 5 + 32)
                    : null,
                condition: weather.label ?? null,
              }
            : null,
        clientIntent: "home_regenerate_look",
        clientContext: {
          minimumCloset: buildMinimumClosetSummary(items),
          outfitDiversity: {
            shouldAvoidRepeats: previousLookItemIds.length > 0,
            reason: previousLookItemIds.length > 0 ? "followup" : "none",
            recentItemIds: previousLookItemIds,
            previousLookItemIds,
            excludedItemIds: previousLookItemIds,
            previousLookSignatures: previousLookSignature ? [previousLookSignature] : [],
            maxOverlap: 1,
          },
        },
      });
      const regeneratedLook = pickFreshLook(
        [result.look, ...(result.lookOptions ?? [])].filter((look): look is AuraLook => !!look),
      );
      if (!regeneratedLook) {
        Alert.alert("AURA", "I couldn't regenerate a visual outfit from the current closet state. Try adding a few more ready pieces.");
        return;
      }
      setLatestAuraLookResponse({
        ...result,
        look: regeneratedLook,
        lookOptions: result.lookOptions?.length ? result.lookOptions : [regeneratedLook],
      });
    } catch (error: any) {
      if (isAuraStreamAbortError(error)) return;
      Alert.alert("AURA", error?.message ?? "Unable to regenerate this outfit right now.");
    } finally {
      setRegeneratingLook(false);
    }
  }, [
    items,
    latestLook,
    regeneratingLook,
    uid,
    weather.label,
    weather.permission,
    weather.state,
    weather.tempC,
  ]);

  const refinementActions = useMemo<QuickActionItem[]>(
    () => [
      {
        key: "dressier",
        label: "Make it dressier",
        prompt: "Elevate one of my casual outfits into something sharper.",
      },
      {
        key: "unworn",
        label: "Use unworn pieces",
        prompt: "Create a look using pieces I have not worn much.",
      },
      {
        key: "fix",
        label: "Fix this outfit",
        prompt: "Fix this outfit. Give me a sharper version, a more wearable version, and a closet-first version.",
      },
    ],
    [],
  );

  const openAIWithPrompt = React.useCallback((prompt?: string) => {
    if (prompt) {
      router.push({
        pathname: "/(tabs)/ai",
        params: {
          prompt,
          promptKey: String(Date.now()),
        },
      });
      return;
    }
    router.push("/(tabs)/ai");
  }, []);

  const openAIChat = React.useCallback((chatId: string) => {
    router.push({
      pathname: "/(tabs)/ai",
      params: {
        chatId,
        chatKey: String(Date.now()),
      },
    });
  }, []);

  const handleRefresh = React.useCallback(async () => {
    if (!uid || refreshing) return;
    setRefreshing(true);
    const startedAt = Date.now();
    let active = true;
    try {
      await Promise.allSettled([
        loadHomeCompanionData(() => active),
        weather.actions.refresh(),
      ]);
    } finally {
      active = false;
      const remaining = Math.max(0, 450 - (Date.now() - startedAt));
      setTimeout(() => setRefreshing(false), remaining);
    }
  }, [loadHomeCompanionData, refreshing, uid, weather.actions]);

  async function handleAuraLookAction(action: AuraLookAction, selectedLook?: AuraLook) {
    const look = selectedLook ?? latestLook;
    if (action === "shopMissingPieces") {
      const missingPieces = look?.addToComplete?.filter(Boolean) ?? [];
      const suggestion = missingPieces[0]
        ? buildAdHocWardrobeSuggestion(missingPieces[0])
        : wardrobeSuggestions[0] ?? null;
      if (suggestion) {
        setActiveShopSuggestion(suggestion);
        return;
      }
    }
    await handleSharedAuraLookAction({
      uid,
      action,
      look,
      promptBase: look?.lookTitle,
      saveTitle: look?.lookTitle,
      onPrompt: openAIWithPrompt,
      onAlert: (title, message, buttons) => Alert.alert(title, message, buttons),
      onSavedLook: setLatestSavedLook,
    });
  }

  async function handleWearTodayFromHome() {
    const plannedOutfit = todayRecord?.plannedOutfit ?? null;
    if (!uid || !plannedOutfit) return;
    try {
      const wornAt = Date.now();
      const result = await markOutfitWorn({
        uid,
        source: "home",
        title: "Today's Look",
        look: plannedOutfit,
        wornAt: new Date(wornAt),
      });
      setTodayRecord((prev) => ({
        ...(prev ?? { dateKey: result.dateKey }),
        plannedOutfit,
        wornOutfit: {
          itemsByCategory: plannedOutfit.itemsByCategory,
          wornAt,
          source: "home",
          title: "Today's Look",
          outfitSnapshot: result.outfitSnapshot,
        },
      }));
      Toast.success(
        result.alreadyMarked ? "Already marked worn today" : "Marked as worn today",
        result.alreadyMarked ? "AURA will not double-count it." : undefined,
      );
    } catch (error: any) {
      Toast.error("Couldn't mark worn. Try again.", error?.message);
    }
  }

  const smartTools = useMemo<SmartTool[]>(
    () => [
      {
        key: "closet",
        title: "Closet",
        subtitle: `${availableCount} clean pieces ready`,
        icon: "wardrobe-outline",
        onPress: () => router.push("/(tabs)/closet"),
      },
      {
        key: "studio",
        title: "Studio",
        subtitle: "Build, refine, save, or plan a look",
        icon: "hanger",
        onPress: () => router.push("/(tabs)/studio"),
      },
      {
        key: "add",
        title: "Add Item",
        subtitle: "Bring a new piece into rotation",
        icon: "plus-circle-outline",
        onPress: () =>
          router.push({ pathname: "/(tabs)/add", params: { addSession: String(Date.now()) } }),
      },
      {
        key: "laundry",
        title: "Laundry",
        subtitle: `${needsWashCount + laundryCount} pieces need care`,
        icon: "washing-machine",
        onPress: () => router.push("/(tabs)/laundry"),
      },
      {
        key: "calendar",
        title: "Calendar",
        subtitle: "Plan the day around real context",
        icon: "calendar-month-outline",
        onPress: () => router.push("/(tabs)/calendar"),
      },
      {
        key: "insights",
        title: "Insights",
        subtitle: "Read rotation, gaps, and closet signals",
        icon: "chart-box-outline",
        onPress: () => router.push("/insights"),
      },
      {
        key: "aura-training",
        title: "AURA Training",
        subtitle: "Swipe outfit edits so AURA learns your taste",
        icon: "gesture-swipe-horizontal",
        onPress: () => router.push(AURA_TRAINING_ROUTE),
      },
    ],
    [availableCount, laundryCount, needsWashCount]
  );

  // Keep the deferred Home feature inventory close to the screen entry point so it is
  // discoverable during future product passes without reintroducing clutter now.
  void HOME_DEFERRED_FEATURES;

  if (loading) {
    return <HomeLoadingSkeleton />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: HOME_BACKGROUND_BASE }}>
      <LinearGradient
        pointerEvents="none"
        colors={HOME_BACKGROUND_GRADIENT}
        locations={[0, 0.56, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <AuraTopSafeAreaScrim color={HOME_BACKGROUND_BASE} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.ctaCream}
            colors={[colors.ctaCream]}
            progressBackgroundColor={HOME_BACKGROUND_BASE}
          />
        }
        contentContainerStyle={{
          paddingTop: layout.topContentInset,
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: layout.bottomDockPadding + HOME_BOTTOM_BREATHING_ROOM,
          gap: HOME_SECTION_GAP,
        }}
      >
        <RevealSection delay={0}>
          <HomeHero
            colors={colors}
            greeting={headerGreeting}
            weatherLabel={weatherLabel}
            personalHint={assistantHint}
            stylistNote={heroStylistNote}
            guidancePhrases={heroGuidancePhrases}
            record={todayRecord}
            itemsById={itemsById}
            onPrimaryAction={() => openAIWithPrompt("Build me a strong outfit from my wardrobe for today.")}
            onWearToday={handleWearTodayFromHome}
          />
        </RevealSection>

        <RevealSection delay={40}>
          <View style={{ gap: HOME_SECTION_CONTENT_GAP }}>
            <View style={{ gap: HOME_TIGHT_GAP }}>
              <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Not feeling it?</Text>
              <Text style={[homeTypography.bodySmall, { color: colors.textSecondary, opacity: 0.78 }]}>
                Shift the direction without leaving the styling flow.
              </Text>
            </View>
            <QuickActionRail
              variant="compact"
              colors={colors}
              actions={refinementActions.slice(0, 1)}
              onPressAction={(action) => openAIWithPrompt(action.prompt)}
            />
          </View>
        </RevealSection>

        {renderDeferredHomeSections ? (
          <>
            <RevealSection delay={80}>
              <AuraLookModule
                colors={colors}
                look={latestLook}
                itemsById={itemsById}
                onAskAura={openAIWithPrompt}
                onAction={handleAuraLookAction}
                onRegenerate={handleRegenerateHomeLook}
                regenerating={regeneratingLook}
                eyebrow="BUILT FROM YOUR WARDROBE"
                title="Built from your wardrobe"
                subtitle={"subtitle" in proactiveLookMeta ? proactiveLookMeta.subtitle : undefined}
                fallbackTitle={"fallbackTitle" in proactiveLookMeta ? proactiveLookMeta.fallbackTitle : undefined}
                fallbackBody={"fallbackBody" in proactiveLookMeta ? proactiveLookMeta.fallbackBody : undefined}
                primaryPrompt={"primaryPrompt" in proactiveLookMeta ? proactiveLookMeta.primaryPrompt : undefined}
                secondaryPrompt={"secondaryPrompt" in proactiveLookMeta ? proactiveLookMeta.secondaryPrompt : undefined}
              />
            </RevealSection>

            {wardrobeSuggestions.length ? (
              <RevealSection delay={120}>
                <CompleteWardrobeCard
                  colors={colors}
                  suggestions={wardrobeSuggestions}
                  onPress={openWardrobeSuggestions}
                />
              </RevealSection>
            ) : null}

            <RevealSection delay={160}>
              <SmartToolsGrid compact colors={colors} tools={smartTools.slice(0, 3)} columns={layout.smartGridColumns} />
            </RevealSection>

            {latestChatThread?.chatId && latestChatThread.lastMessagePreview ? (
              <RevealSection delay={200}>
                <ContinueChatCard
                  colors={colors}
                  title={latestChatThread.title}
                  preview={latestChatThread.lastMessagePreview}
                  updatedAt={latestChatThread.updatedAt}
                  onPress={() => openAIChat(latestChatThread.chatId)}
                />
              </RevealSection>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <ShopOptionsSheet
        visible={Boolean(activeShopSuggestion)}
        suggestion={activeShopSuggestion}
        userId={uid}
        sourceScreen="outfit_card"
        onDismiss={() => setActiveShopSuggestion(null)}
      />
    </View>
  );
}
