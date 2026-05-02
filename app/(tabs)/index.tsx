import { router, useFocusEffect } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  InteractionManager,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import ContinueSection from "@/src/components/home/ContinueSection";
import ContinueChatCard from "@/src/components/home/ContinueChatCard";
import MinimumClosetProgressCard from "@/src/components/closet/MinimumClosetProgressCard";
import AuraLookModule from "@/src/components/home/AuraLookModule";
import HomeHero from "@/src/components/home/HomeHero";
import InsightCard from "@/src/components/home/InsightCard";
import QuickActionRail, { type QuickActionItem } from "@/src/components/home/QuickActionRail";
import SmartToolsGrid, { type SmartTool } from "@/src/components/home/SmartToolsGrid";
import { HOME_DEFERRED_FEATURES } from "@/src/components/home/homeDeferredFeatures";
import { homeTypography } from "@/src/components/home/homeTypography";
import AuraTrainingCard from "@/src/components/aura/AuraTrainingCard";
import { AURA_TRAINING_ROUTE } from "@/src/constants/routes";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useLocalWeather } from "@/src/hooks/useLocalWeather";
import { useNow } from "@/src/hooks/useNow";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { buildVisiblePreferenceHint, loadAssistantProfile } from "@/src/lib/assistantMemory";
import { loadChatMessages, loadLatestChatThread, type AIChatThread } from "@/src/lib/aiChats";
import { logAuraLookStyleEvent } from "@/src/lib/auraMemory";
import { auraLookToPlannedOutfit, loadLatestSavedAuraLook, saveAuraLook } from "@/src/lib/auraLooks";
import { listenToItems, normalizeLaundryStatus } from "@/src/lib/items";
import { getMinimumClosetProgress, getSuggestedAddItemCategory } from "@/src/lib/minimumCloset";
import { getStyleProfileConfig } from "@/src/lib/styleProfile";
import { Toast } from "@/src/lib/toast";
import { loadUserProfilePreferences } from "@/src/lib/userProfile";
import {
  getCachedChatList,
  getCachedHomeSnapshot,
  getCachedProfilePreferences,
  setCachedHomeSnapshot,
} from "@/src/lib/localCache";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLookAction, AuraResponse } from "@/src/types/aura";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";
import { savePlannedRecord, subscribeOutfitByDate, type DailyOutfitRecord } from "@/src/utils/dailyOutfits";

function toMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date?.getTime?.()) ? date.getTime() : 0;
  }
  return 0;
}

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

function buildAuraLookFeedbackPrompt(action: AuraLookAction, promptBase: string) {
  if (action === "notMyVibe") {
    return `Take this in a different direction from ${promptBase}. Keep it polished, but shift the palette, silhouette, or overall attitude so it feels more like me.`;
  }
  if (action === "showMoreLikeThis") {
    return `Show me 3 more looks in the same lane as ${promptBase}, but vary the styling so they do not feel repetitive.`;
  }
  if (action === "lessLikeThis") {
    return `Pull away from ${promptBase}. Keep the same level of polish, but give me a noticeably different palette, silhouette, or vibe.`;
  }
  return "";
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
  const [renderDeferredHomeSections, setRenderDeferredHomeSections] = useState(false);
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

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      void (async () => {
        if (!uid) {
          setAssistantHint(null);
          setLatestChatThread(null);
          return;
        }
        try {
          const cachedProfilePreferences = await getCachedProfilePreferences(uid);
          if (active && cachedProfilePreferences?.data) {
            setProfilePreferences(cachedProfilePreferences.data);
          }
          const cachedChats = await getCachedChatList(uid);
          if (active && cachedChats?.data?.[0]) {
            setLatestChatThread(cachedChats.data[0]);
          }
          const [assistantProfile, latestChat, savedLook, userProfilePreferences] = await Promise.all([
            loadAssistantProfile(uid),
            loadLatestChatThread(uid),
            loadLatestSavedAuraLook(uid),
            loadUserProfilePreferences(uid),
          ]);
          if (!active) return;
          setAssistantHint(buildVisiblePreferenceHint(assistantProfile));
          setLatestChatThread(latestChat);
          setLatestSavedLook(savedLook);
          setProfilePreferences(userProfilePreferences);
          if (latestChat?.chatId) {
            const chatMessages = await loadChatMessages(uid, latestChat.chatId);
            if (!active) return;
            const latestAura = [...chatMessages]
              .reverse()
              .find((message) => message.type === "assistant" && message.aura?.look)?.aura ?? null;
            setLatestAuraLookResponse(latestAura);
          } else {
            setLatestAuraLookResponse(null);
          }
        } catch {
          if (!active) return;
          setAssistantHint(null);
        }
      })();
      return () => {
        active = false;
      };
    }, [uid])
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

  const recentItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => {
          const aMs = Math.max(
            toMillis(a.createdAt),
            toMillis(a.cleanedUpdatedAt),
            toMillis(a.colorUpdatedAt)
          );
          const bMs = Math.max(
            toMillis(b.createdAt),
            toMillis(b.cleanedUpdatedAt),
            toMillis(b.colorUpdatedAt)
          );
          return bMs - aMs;
        })
        .slice(0, 8),
    [items]
  );

  const heroStylistNote = useMemo(() => {
    if (todayRecord?.plannedOutfit || todayRecord?.wornOutfit) {
      return "Your quickest win is already on deck.";
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
  const showMinimumClosetCard = !minimumClosetProgress.isUnlocked;
  const openAddMissingItem = React.useCallback(() => {
    const suggestedCategory = getSuggestedAddItemCategory(items);
    router.push({
      pathname: "/(tabs)/add",
      params: suggestedCategory ? { suggestedCategory } : {},
    });
  }, [items]);
  const latestLook = latestAuraLookResponse?.look ?? latestSavedLook?.look ?? null;

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

  const starterPrompts = useMemo<QuickActionItem[]>(() => {
    const byKey: Record<string, QuickActionItem> = {
      today: {
        key: "today",
        label: "Style me today",
        prompt: "Build an outfit for today from my wardrobe.",
      },
      weather: {
        key: "weather",
        label: "Dress for weather",
        prompt: "Build me a weather-aware outfit using what I own.",
      },
      unworn: {
        key: "unworn",
        label: "Use unworn items",
        prompt: "Create a look using pieces I have not worn much.",
      },
      closet: {
        key: "closet",
        label: "Use only my closet",
        prompt: "Build a strong outfit using only my closet.",
      },
      elevate: {
        key: "elevate",
        label: "Dress this up",
        prompt: "Elevate one of my casual outfits into something sharper.",
      },
      shopping: {
        key: "shopping",
        label: "Find key gaps",
        prompt: "Review my wardrobe and suggest the smartest missing pieces to buy next.",
      },
      confidence: {
        key: "confidence",
        label: "Build confidence",
        prompt: "Give me an easy, confidence-boosting outfit from my wardrobe.",
      },
      daily: {
        key: "daily",
        label: "Today's outfit",
        prompt: "Build my outfit for today from what I already own.",
      },
      options: {
        key: "options",
        label: "3 directions",
        prompt: "Show me three outfit directions: one safe, one balanced, and one bold.",
      },
      fix: {
        key: "fix",
        label: "Fix this outfit",
        prompt: "Fix this outfit. Give me a sharper version, a more wearable version, and a closet-first version.",
      },
      missing: {
        key: "missing",
        label: "What am I missing?",
        prompt: "What am I missing from my wardrobe based on what I own and the way I like to dress?",
      },
      accessories: {
        key: "accessories",
        label: "Push accessories",
        prompt: `Build an outfit that leans into ${styleProfile.emphasizedAccessories.slice(0, 2).join(" and ") || "my accessories"}.`,
      },
      date_night: {
        key: "date_night",
        label: "Date night",
        prompt: "Build a date-night look using the categories I actually wear.",
      },
      dress_up: {
        key: "dress_up",
        label: "Going out",
        prompt: "Style a more elevated going-out outfit from my wardrobe.",
      },
      streetwear: {
        key: "streetwear",
        label: "More street",
        prompt: "Build a streetwear-leaning look using hoodies, sneakers, and other categories I wear most.",
      },
      casual: {
        key: "casual",
        label: "Casual clean",
        prompt: "Build an easy casual outfit using the categories I actually wear most.",
      },
      office: {
        key: "office",
        label: "Office ready",
        prompt: "Build a smart office-ready outfit using blazers, trousers, and other categories I wear.",
      },
      smart_casual: {
        key: "smart_casual",
        label: "Smart casual",
        prompt: "Build a smart casual outfit that feels polished but wearable.",
      },
    };

    const goalOrder = styleProfile.prioritizedGoals.flatMap((goal) => {
      if (goal === "shopping_suggestions") return ["shopping", "today"];
      if (goal === "packing_help") return ["weather", "closet"];
      if (goal === "laundry_reminders") return ["closet", "unworn"];
      if (goal === "styling_confidence") return ["confidence", "today"];
      return ["today", "elevate"];
    });

    const aestheticOrder = profilePreferences?.styleAesthetics.includes("luxury")
      ? ["elevate", "shopping"]
      : profilePreferences?.styleAesthetics.includes("sporty")
        ? ["weather", "closet"]
        : profilePreferences?.styleAesthetics.includes("minimal")
          ? ["closet", "today"]
          : [];

    const orderedKeys = Array.from(
      new Set([
        "today",
        "options",
        "fix",
        "missing",
        "unworn",
        ...styleProfile.starterPromptPresets,
        ...goalOrder,
        ...aestheticOrder,
        "daily",
        "weather",
        "closet",
        "elevate",
        styleProfile.emphasizedAccessories.length ? "accessories" : "",
        "shopping",
      ].filter(Boolean))
    ).slice(0, 5);

    return orderedKeys.map((key) => byKey[key]).filter(Boolean);
  }, [
    profilePreferences?.styleAesthetics,
    styleProfile.emphasizedAccessories,
    styleProfile.prioritizedGoals,
    styleProfile.starterPromptPresets,
  ]);

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

  async function handleAuraLookAction(action: AuraLookAction, selectedLook?: import("@/src/types/aura").AuraLook) {
    const look = selectedLook ?? latestLook;
    if (!look || !uid) return;
    const promptBase = look.lookTitle;
    if (action === "saveLook") {
      try {
        const saved = await saveAuraLook(uid, look, { title: promptBase });
        setLatestSavedLook(saved);
        Toast.saved();
      } catch (error: any) {
        Toast.error("Save failed", error?.message ?? "Unable to save this look.");
      }
      return;
    }
    if (action === "planForToday") {
      try {
        await savePlannedRecord(uid, new Date(), auraLookToPlannedOutfit(look));
        Toast.success("Planned", "This look is now attached to today.");
      } catch (error: any) {
        Toast.error("Plan failed", error?.message ?? "Unable to plan this look for today.");
      }
      return;
    }
    if (action === "likeLook") {
      await logAuraLookStyleEvent(uid, "outfit_liked", look, { source: "aura" });
      Alert.alert("Noted", "AURA will keep more of this energy in rotation.");
      return;
    }
    if (action === "notMyVibe") {
      await logAuraLookStyleEvent(uid, "outfit_disliked", look, { source: "aura" });
      openAIWithPrompt(buildAuraLookFeedbackPrompt(action, promptBase));
      return;
    }
    if (action === "showMoreLikeThis") {
      void logAuraLookStyleEvent(uid, "more_like_this", look, { source: "aura" });
      openAIWithPrompt(buildAuraLookFeedbackPrompt(action, promptBase));
      return;
    }
    if (action === "lessLikeThis") {
      await logAuraLookStyleEvent(uid, "less_like_this", look, { source: "aura" });
      openAIWithPrompt(buildAuraLookFeedbackPrompt(action, promptBase));
      return;
    }
    if (action === "shopMissingPieces") {
      const missingPieces = look.addToComplete.filter(Boolean);
      Alert.alert(
        "Missing pieces",
        missingPieces.length
          ? missingPieces.join("\n")
          : "AURA does not see any missing pieces in this look yet.",
        missingPieces.length
          ? [
              { text: "Close", style: "cancel" },
              {
                text: "Create shopping brief",
                onPress: () =>
                  openAIWithPrompt(
                    `Turn ${promptBase} into a concise shopping brief. Tell me what is actually missing from my wardrobe, what matters most to buy first, and what can wait.`
                  ),
              },
            ]
          : [{ text: "Close", style: "cancel" }]
      );
      return;
    }
    if (action === "useOnlyMyCloset") {
      openAIWithPrompt(`Fix ${promptBase} using only my closet. Keep the same overall intent, but make it feel more resolved with pieces I already own.`);
      return;
    }
    if (action === "makeItDressier") {
      openAIWithPrompt(`Fix ${promptBase} and make it dressier. Keep it polished, tasteful, and still like me.`);
    }
  }

  const smartTools = useMemo<SmartTool[]>(
    () => [
      {
        key: "aura",
        title: "AURA",
        subtitle: "Ask for a closet-first outfit",
        icon: "assistant",
        onPress: () => router.push("/(tabs)/ai"),
      },
      {
        key: "aura-training",
        title: "AURA Training",
        subtitle: "Swipe outfit edits so AURA learns your taste",
        icon: "gesture-swipe-horizontal",
        onPress: () => router.push(AURA_TRAINING_ROUTE),
      },
      {
        key: "closet",
        title: "Closet",
        subtitle: `${availableCount} clean pieces ready`,
        icon: "wardrobe-outline",
        onPress: () => router.push("/(tabs)/closet"),
      },
      {
        key: "add",
        title: "Add Item",
        subtitle: "Bring a new piece into rotation",
        icon: "plus-circle-outline",
        onPress: () => router.push("/(tabs)/add"),
      },
      {
        key: "studio",
        title: "Studio",
        subtitle: "Build an outfit by hand from your closet",
        icon: "view-dashboard-edit-outline",
        onPress: () => router.push("/(tabs)/studio"),
      },
      {
        key: "calendar",
        title: "Calendar",
        subtitle: "Plan the day around real context",
        icon: "calendar-month-outline",
        onPress: () => router.push("/(tabs)/calendar"),
      },
      {
        key: "laundry",
        title: "Laundry",
        subtitle: `${availableCount} clean · ${laundryCount} in laundry`,
        icon: "washing-machine",
        badge: laundryCount + needsWashCount > 0 ? String(laundryCount + needsWashCount) : undefined,
        onPress: () => router.push("/(tabs)/laundry"),
      },
    ],
    [availableCount, laundryCount, needsWashCount]
  );

  const priorityInsight = useMemo(() => {
    if (hasMinimalWardrobe) {
      return {
        eyebrow: "BUILD THE FOUNDATION",
        title: "A few key pieces will unlock better daily looks",
        body: "Your closet is still taking shape. Add a few versatile pieces and Home will start giving you much sharper styling, rotation, and gap signals.",
        ctaLabel: "Add a piece",
        onPress: () => router.push("/(tabs)/add"),
      };
    }
    if (unwornCount > 0) {
      return {
        eyebrow: "SMART ROTATION",
        title: `${unwornCount} pieces are ready to come back in`,
        body: "Bring neglected pieces back into a stronger outfit today.",
        ctaLabel: "Use unworn pieces",
        onPress: () => openAIWithPrompt("Build a look around pieces I have not worn enough."),
      };
    }
    if (laundryCount > 0) {
      return {
        eyebrow: "KEEP TODAY OPEN",
        title: `${laundryCount} pieces are stuck in laundry`,
        body: "A few blocked items can narrow the best outfit paths. Clear them out so today’s suggestions stay sharper and easier to execute.",
        ctaLabel: "Open laundry",
        onPress: () => router.push("/(tabs)/laundry"),
      };
    }
    return {
      eyebrow: "IN GOOD SHAPE",
      title: "Your wardrobe is ready for a stronger look",
      body: `You have ${availableCount} ready-to-wear pieces available right now. This is a good day to push for a sharper outfit instead of repeating the safe default.`,
      ctaLabel: "Style what is ready",
      onPress: () => openAIWithPrompt("Build me an outfit from the pieces that are ready to wear right now."),
    };
  }, [availableCount, hasMinimalWardrobe, laundryCount, openAIWithPrompt, unwornCount]);

  // Keep the deferred Home feature inventory close to the screen entry point so it is
  // discoverable during future product passes without reintroducing clutter now.
  void HOME_DEFERRED_FEATURES;

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <ActivityIndicator color={colors.text} />
        <Text style={[homeTypography.bodySmall, { color: colors.textSecondary }]}>Building your dashboard…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: layout.topContentInset,
          paddingHorizontal: layout.horizontalPadding,
          paddingBottom: layout.bottomDockPadding + 140,
          gap: layout.sectionGap + 6,
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
            onSecondaryAction={() => openAIWithPrompt("Show me three outfit directions for today: one safe, one balanced, and one bold.")}
          />
        </RevealSection>

        <RevealSection delay={40}>
          <View style={{ gap: 10 }}>
            <View style={{ gap: 2 }}>
              <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Quick outcomes</Text>
              <Text style={[homeTypography.bodySmall, { color: colors.textSecondary, opacity: 0.78 }]}>
                Start from the result you want, not a blank prompt box.
              </Text>
            </View>
            <QuickActionRail
              colors={colors}
              actions={starterPrompts}
              onPressAction={(action) => openAIWithPrompt(action.prompt)}
            />
          </View>
        </RevealSection>

        <RevealSection delay={80}>
          <InsightCard
            colors={colors}
            eyebrow={priorityInsight.eyebrow}
            title={priorityInsight.title}
            body={priorityInsight.body}
            ctaLabel={priorityInsight.ctaLabel}
            onPress={priorityInsight.onPress}
          />
        </RevealSection>

        {renderDeferredHomeSections ? (
          <>
            <RevealSection delay={120}>
              <AuraLookModule
                colors={colors}
                look={latestLook}
                itemsById={itemsById}
                onAskAura={openAIWithPrompt}
                onAction={handleAuraLookAction}
                eyebrow={proactiveLookMeta.eyebrow}
                title={"title" in proactiveLookMeta ? proactiveLookMeta.title : undefined}
                subtitle={"subtitle" in proactiveLookMeta ? proactiveLookMeta.subtitle : undefined}
                fallbackTitle={"fallbackTitle" in proactiveLookMeta ? proactiveLookMeta.fallbackTitle : undefined}
                fallbackBody={"fallbackBody" in proactiveLookMeta ? proactiveLookMeta.fallbackBody : undefined}
                primaryPrompt={"primaryPrompt" in proactiveLookMeta ? proactiveLookMeta.primaryPrompt : undefined}
                secondaryPrompt={"secondaryPrompt" in proactiveLookMeta ? proactiveLookMeta.secondaryPrompt : undefined}
              />
            </RevealSection>

            <RevealSection delay={160}>
              <SmartToolsGrid colors={colors} tools={smartTools} columns={layout.smartGridColumns} />
            </RevealSection>

            <RevealSection delay={200}>
              <AuraTrainingCard
                colors={colors}
                variant="home"
                onPress={() => router.push(AURA_TRAINING_ROUTE)}
              />
            </RevealSection>

            <RevealSection delay={240}>
              {latestChatThread?.chatId && latestChatThread.lastMessagePreview ? (
                <ContinueChatCard
                  colors={colors}
                  title={latestChatThread.title}
                  preview={latestChatThread.lastMessagePreview}
                  updatedAt={latestChatThread.updatedAt}
                  onPress={() => openAIChat(latestChatThread.chatId)}
                />
              ) : null}
            </RevealSection>

            <RevealSection delay={280}>
              {recentItems.length ? (
                <ContinueSection
                  colors={colors}
                  title="Keep the momentum going"
                  subtitle="Fresh pieces worth styling next before they get lost in the closet."
                  items={recentItems}
                  onPressItem={(item) =>
                    router.push({
                      pathname: "/(tabs)/item/[id]",
                      params: { id: item.id, sourceTab: "index" },
                    })
                  }
                />
              ) : (
                <InsightCard
                  colors={colors}
                  eyebrow="NEXT STEP"
                  title="Add a few pieces to unlock better daily styling"
                  body="Once your closet has a bit more depth, Home can give you stronger outfit recommendations, smarter recents, and better rotation cues."
                  ctaLabel="Add item"
                  onPress={() => router.push("/(tabs)/add")}
                />
              )}
            </RevealSection>

            {showMinimumClosetCard ? (
              <RevealSection delay={300}>
                <MinimumClosetProgressCard
                  colors={colors}
                  items={items}
                  onAddMissingItem={openAddMissingItem}
                />
              </RevealSection>
            ) : null}

            <RevealSection delay={320}>
              <Pressable
                onPress={() => router.push("/(tabs)/add")}
                style={({ pressed }) => ({
                  borderRadius: layout.largeRadius,
                  paddingVertical: layout.cardPadding + 2,
                  paddingHorizontal: layout.cardPadding,
                  backgroundColor: "rgba(255,255,255,0.045)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                  opacity: pressed ? 0.86 : 1,
                  gap: 4,
                })}
              >
                <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Bring in something new</Text>
                <Text style={[homeTypography.bodySmall, { color: colors.textSecondary }]}>
                  Add a fresh piece, clean the image, and give AURA more to work with tomorrow.
                </Text>
              </Pressable>
            </RevealSection>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
