import { router, useFocusEffect } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import ContinueSection from "@/src/components/home/ContinueSection";
import ContinueChatCard from "@/src/components/home/ContinueChatCard";
import AuraLookModule from "@/src/components/home/AuraLookModule";
import HomeHero from "@/src/components/home/HomeHero";
import InsightCard from "@/src/components/home/InsightCard";
import QuickActionRail, { type QuickActionItem } from "@/src/components/home/QuickActionRail";
import SmartToolsGrid, { type SmartTool } from "@/src/components/home/SmartToolsGrid";
import TodayOutfitCard from "@/src/components/home/TodayOutfitCard";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useLocalWeather } from "@/src/hooks/useLocalWeather";
import { useNow } from "@/src/hooks/useNow";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { buildVisiblePreferenceHint, loadAssistantProfile } from "@/src/lib/assistantMemory";
import { loadChatMessages, loadLatestChatThread, type AIChatThread } from "@/src/lib/aiChats";
import { auraLookToPlannedOutfit, loadLatestSavedAuraLook, saveAuraLook } from "@/src/lib/auraLooks";
import { listenToItems } from "@/src/lib/items";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLookAction, AuraResponse } from "@/src/types/aura";
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

  useEffect(() => {
    if (!uid) {
      router.replace("/(auth)/login");
      return;
    }

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
          const [profile, latestChat, savedLook] = await Promise.all([
            loadAssistantProfile(uid),
            loadLatestChatThread(uid),
            loadLatestSavedAuraLook(uid),
          ]);
          if (!active) return;
          setAssistantHint(buildVisiblePreferenceHint(profile));
          setLatestChatThread(latestChat);
          setLatestSavedLook(savedLook);
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
          setLatestChatThread(null);
          setLatestAuraLookResponse(null);
          setLatestSavedLook(null);
        }
      })();
      return () => {
        active = false;
      };
    }, [uid])
  );

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const displayName = (user?.displayName ?? user?.email?.split("@")[0] ?? "there").trim();
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
    () => items.filter((item) => item.status === "AVAILABLE").length,
    [items]
  );
  const laundryCount = useMemo(
    () => items.filter((item) => item.status === "IN_LAUNDRY").length,
    [items]
  );
  const unwornCount = useMemo(
    () =>
      items.filter((item) => {
        const wearCount = typeof item.wearCount === "number" ? item.wearCount : 0;
        return item.status === "AVAILABLE" && wearCount === 0;
      }).length,
    [items]
  );

  const recentItems = useMemo(
    () =>
      [...items]
        .sort((a, b) => {
          const aMs = Math.max(toMillis(a.updatedAt), toMillis(a.createdAt));
          const bMs = Math.max(toMillis(b.updatedAt), toMillis(b.createdAt));
          return bMs - aMs;
        })
        .slice(0, 8),
    [items]
  );

  const hasMinimalWardrobe = availableCount < 4;
  const latestLook = latestAuraLookResponse?.look ?? latestSavedLook?.look ?? null;
  const proactiveLookMeta = useMemo(() => {
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
    unwornCount,
    weather.permission,
    weather.state,
    weather.tempC,
  ]);

  const starterPrompts = useMemo<QuickActionItem[]>(
    () => [
      { key: "today", label: "Build today’s look", prompt: "Build an outfit for today from my wardrobe." },
      { key: "weather", label: "Dress for weather", prompt: "Build me a weather-aware outfit using what I own." },
      { key: "unworn", label: "Use unworn items", prompt: "Create a look using pieces I have not worn much." },
      { key: "trip", label: "Pack a trip", prompt: "Help me plan a compact travel wardrobe from my closet." },
      { key: "elevate", label: "Dress this up", prompt: "Elevate one of my casual outfits into something sharper." },
    ],
    []
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

  const openSoonTool = React.useCallback((title: string, prompt: string) => {
    Alert.alert(
      `${title} is coming soon`,
      "We haven’t built the dedicated tool yet, but the stylist can still help right now.",
      [
        { text: "Not now", style: "cancel" },
        {
          text: "Ask Stylist",
          onPress: () => openAIWithPrompt(prompt),
        },
      ]
    );
  }, [openAIWithPrompt]);

  async function handleAuraLookAction(action: AuraLookAction) {
    const look = latestLook;
    if (!look || !uid) return;
    const promptBase = look.lookTitle;
    if (action === "saveLook") {
      try {
        const saved = await saveAuraLook(uid, look, { title: promptBase });
        setLatestSavedLook(saved);
        Alert.alert("Saved", "Look saved to your profile.");
      } catch (error: any) {
        Alert.alert("Save failed", error?.message ?? "Unable to save this look.");
      }
      return;
    }
    if (action === "planForToday") {
      try {
        await savePlannedRecord(uid, new Date(), auraLookToPlannedOutfit(look));
        Alert.alert("Planned", "This look is now attached to today.");
      } catch (error: any) {
        Alert.alert("Plan failed", error?.message ?? "Unable to plan this look for today.");
      }
      return;
    }
    if (action === "showMoreLikeThis") {
      openAIWithPrompt(`Show me 3 more looks like ${promptBase}.`);
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
                onPress: () => openAIWithPrompt(`Turn ${promptBase} into a concise shopping brief for the missing pieces.`),
              },
            ]
          : [{ text: "Close", style: "cancel" }]
      );
      return;
    }
    if (action === "useOnlyMyCloset") {
      openAIWithPrompt(`Rebuild ${promptBase} using only my closet.`);
      return;
    }
    if (action === "makeItDressier") {
      openAIWithPrompt(`Make ${promptBase} dressier.`);
    }
  }

  const smartTools = useMemo<SmartTool[]>(
    () => [
      {
        key: "laundry",
        title: "Laundry",
        subtitle: laundryCount > 0 ? `${laundryCount} items need attention` : "Check care flow and refresh pieces",
        icon: "washing-machine",
        badge: laundryCount > 0 ? String(laundryCount) : undefined,
        onPress: () => router.push("/(tabs)/laundry"),
      },
      {
        key: "shopping",
        title: "Shopping",
        subtitle: "Turn wardrobe gaps into a cleaner wish list",
        icon: "shopping-outline",
        badge: "Soon",
        onPress: () =>
          openSoonTool(
            "Shopping",
            "Review my wardrobe and suggest a short shopping list of meaningful gaps."
          ),
      },
      {
        key: "favorites",
        title: "Favorites",
        subtitle: "Surface the pieces worth building around",
        icon: "heart-outline",
        badge: "Soon",
        onPress: () =>
          openSoonTool(
            "Favorites",
            "Show me the standout pieces in my wardrobe and what to build around them."
          ),
      },
      {
        key: "insights",
        title: "Insights",
        subtitle: "See what you wear most, least, and should rotate next",
        icon: "chart-line",
        onPress: () => openAIWithPrompt("Give me a concise wardrobe insight summary from what I own."),
      },
      {
        key: "packing",
        title: "Packing",
        subtitle: "Build short trip capsules without overpacking",
        icon: "bag-suitcase-outline",
        onPress: () => openAIWithPrompt("Help me pack for a weekend trip using only my wardrobe."),
      },
      {
        key: "recent",
        title: "Recently worn",
        subtitle: "Review what has been in rotation lately",
        icon: "history",
        onPress: () => router.push("/(tabs)/calendar"),
      },
      {
        key: "unworn",
        title: "Unworn items",
        subtitle: unwornCount > 0 ? `${unwornCount} items deserve airtime` : "Everything is getting some rotation",
        icon: "hanger",
        badge: unwornCount > 0 ? String(unwornCount) : undefined,
        onPress: () => openAIWithPrompt("Build an outfit around my least-worn items."),
      },
      {
        key: "gaps",
        title: "Wardrobe gaps",
        subtitle: "Find what is missing before you buy the wrong thing",
        icon: "vector-square-plus",
        onPress: () => openAIWithPrompt("What wardrobe gaps should I actually fill next based on what I own?"),
      },
    ],
    [laundryCount, openAIWithPrompt, openSoonTool, unwornCount]
  );

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
        <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Building your dashboard…</Text>
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
          paddingBottom: layout.bottomDockPadding,
          gap: layout.sectionGap,
        }}
      >
        <RevealSection delay={0}>
          <HomeHero
            colors={colors}
            greeting={headerGreeting}
            weatherLabel={weatherLabel}
            personalHint={assistantHint}
            onAskStylist={() => openAIWithPrompt("Build me a strong outfit from my wardrobe for today.")}
            onPlanToday={() => router.push("/(tabs)/calendar")}
          />
        </RevealSection>

        <RevealSection delay={40}>
          <TodayOutfitCard
            colors={colors}
            record={todayRecord}
            itemsById={itemsById}
            onPlanToday={() => openAIWithPrompt("Plan my outfit for today using what I already own.")}
            onOpenCalendar={() => router.push("/(tabs)/calendar")}
            onAskStylist={() => openAIWithPrompt("Refine or improve my outfit plan for today.")}
          />
        </RevealSection>

        <RevealSection delay={80}>
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
          <View style={{ gap: 10 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>Ask faster</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                Start the stylist with a focused prompt instead of a blank thread.
              </Text>
            </View>
            <QuickActionRail
              colors={colors}
              actions={starterPrompts}
              onPressAction={(action) => openAIWithPrompt(action.prompt)}
            />
          </View>
        </RevealSection>

        <RevealSection delay={200}>
          <SmartToolsGrid colors={colors} tools={smartTools} columns={layout.smartGridColumns} />
        </RevealSection>

        <RevealSection delay={240}>
          <View style={{ gap: 12 }}>
            <InsightCard
              colors={colors}
              eyebrow="ROTATION"
              title={
                hasMinimalWardrobe
                  ? "Start with a few strong core pieces"
                  : unwornCount > 0
                    ? `${unwornCount} pieces are ready for a comeback`
                    : "Your wardrobe is staying in motion"
              }
              body={
                hasMinimalWardrobe
                  ? "Once you add a few more available items, the stylist can build stronger rotations, gap analysis, and smarter daily suggestions."
                  : unwornCount > 0
                  ? "Use the stylist to pull neglected items back into rotation before they disappear into the background."
                  : "You do not have obvious dead stock right now. A few targeted outfit prompts can keep that momentum going."
              }
              ctaLabel={hasMinimalWardrobe ? "Add another item" : "Use unworn pieces"}
              onPress={() =>
                hasMinimalWardrobe
                  ? router.push("/(tabs)/add")
                  : openAIWithPrompt("Build a look around pieces I have not worn enough.")
              }
            />

            <InsightCard
              colors={colors}
              eyebrow="CARE"
              title={
                availableCount === 0
                  ? "Your wardrobe is still taking shape"
                  : laundryCount > 0
                    ? `${laundryCount} items are sitting in laundry`
                    : "Care flow is under control"
              }
              body={
                availableCount === 0
                  ? "Add a few pieces first, then Home will start surfacing stronger outfit planning and rotation insights."
                  : laundryCount > 0
                  ? "Push those pieces back to available once they are clean so your daily outfit options stay full."
                  : `You have ${availableCount} available pieces ready to wear, so planning can stay focused on choice instead of recovery.`
              }
              ctaLabel={
                availableCount === 0
                  ? "Add first item"
                  : laundryCount > 0
                    ? "Open Laundry"
                    : "Plan around what is ready"
              }
              onPress={() =>
                availableCount === 0
                  ? router.push("/(tabs)/add")
                  : laundryCount > 0
                  ? router.push("/(tabs)/laundry")
                  : openAIWithPrompt("Build me an outfit from the pieces that are ready to wear right now.")
              }
            />
          </View>
        </RevealSection>

        <RevealSection delay={280}>
          {recentItems.length ? (
            <ContinueSection
              colors={colors}
              title="Continue where you left off"
              subtitle="Recently added and recently updated pieces worth acting on next."
              items={recentItems}
              onPressItem={(item) =>
                router.push({
                  pathname: "/(tabs)/item/[id]",
                  params: { id: item.id },
                })
              }
            />
          ) : (
            <InsightCard
              colors={colors}
              eyebrow="NEXT STEP"
              title="Add a few pieces to unlock the dashboard"
              body="Once your closet has a bit more depth, Home will start feeling much more personal with stronger recents, smarter prompts, and better planning cues."
              ctaLabel="Add item"
              onPress={() => router.push("/(tabs)/add")}
            />
          )}
        </RevealSection>

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
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>Add something new</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }}>
              Bring in a new piece, clean its image, and let the assistant classify it in the background.
            </Text>
          </Pressable>
        </RevealSection>
      </ScrollView>
    </View>
  );
}
