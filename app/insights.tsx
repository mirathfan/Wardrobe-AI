import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

import AuraInsightsDashboard, {
  type InsightPeriodKey,
} from "@/src/components/insights/AuraInsightsDashboard";
import ShopOptionsSheet from "@/src/components/shop/ShopOptionsSheet";
import { useAuth } from "@/src/hooks/useAuth";
import { listenToItems } from "@/src/lib/items";
import { loadUserProfilePreferences } from "@/src/lib/userProfile";
import { getPersonalizedShoppingRecommendationBundle } from "@/src/lib/productRecommendations";
import { detectShoppingWardrobeGaps } from "@/src/lib/shoppingWardrobeGaps";
import {
  buildWardrobeInsights,
  type MissingPieceInsight,
} from "@/src/lib/wardrobeInsights";
import { safeGoBack } from "@/src/lib/navigation";
import {
  buildAdHocWardrobeSuggestion,
  buildWardrobeSuggestions,
  type WardrobeSuggestion,
} from "@/src/lib/wardrobeSuggestions";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type {
  ShoppingFeedbackRecord,
  ShoppingRecommendationCandidate,
  WardrobeGap,
} from "@/src/types/shoppingRecommendations";
import type { UserProfilePreferences } from "@/src/types/UserProfilePreferences";
import { addDays, toDayKey } from "@/src/utils/date";
import {
  type OutfitItemsByCategory,
  subscribeOutfitsInRange,
  type DailyOutfitRecord,
} from "@/src/utils/dailyOutfits";

function rangeForPeriod(period: InsightPeriodKey) {
  const end = new Date();
  const endKey = toDayKey(end);

  if (period === "all") {
    return {
      startKey: "1970-01-01",
      endKey,
    };
  }

  const days = period === "90d" ? 90 : 30;
  return {
    startKey: toDayKey(addDays(end, -(days - 1))),
    endKey,
  };
}

function promptItemLabel(item: ClothingItem) {
  return (
    item.name?.trim() ||
    item.subCategory?.trim() ||
    String(item.category ?? "").trim() ||
    "this piece"
  );
}

function itemIdsFromCategories(categories?: OutfitItemsByCategory | null) {
  if (!categories) return [];
  return [
    categories.outerwear,
    categories.top,
    categories.bottom,
    categories.shoes,
    ...(categories.accessories ?? []),
  ].filter((itemId): itemId is string => Boolean(itemId));
}

function itemIdsFromOutfitRecord(record: DailyOutfitRecord) {
  return Array.from(
    new Set([
      ...itemIdsFromCategories(record.plannedOutfit?.itemsByCategory),
      ...itemIdsFromCategories(record.wornOutfit?.itemsByCategory),
    ]),
  );
}

function titleCaseGapLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function suggestionFromShoppingGap(gap: WardrobeGap): WardrobeSuggestion {
  const categoryLabel = gap.suggestedCategories[0] ?? gap.category ?? gap.type;
  const base = buildAdHocWardrobeSuggestion(categoryLabel);
  const priority =
    gap.priorityScore >= 72 ? "high" : gap.priorityScore >= 42 ? "medium" : "low";

  return {
    ...base,
    id: `shopping-gap-${gap.id}`,
    itemType: titleCaseGapLabel(categoryLabel || "Wardrobe gap"),
    reason: gap.explanation,
    priority,
    impactScore: Math.max(base.impactScore, gap.priorityScore),
    outfitsUnlockedEstimate: Math.max(1, Math.round(gap.priorityScore / 25)),
    preferredColors: gap.suggestedColours?.length ? gap.suggestedColours.slice(0, 3) : base.preferredColors,
    styleTags: gap.suggestedStyleTags?.length ? gap.suggestedStyleTags.slice(0, 6) : base.styleTags,
  };
}

function shoppingRecommendationKey(recommendation: ShoppingRecommendationCandidate) {
  return (
    recommendation.product.id ||
    recommendation.product.providerProductId ||
    recommendation.product.url ||
    recommendation.id ||
    recommendation.product.title
  );
}

function dedupeShoppingRecommendations(recommendations: ShoppingRecommendationCandidate[]) {
  const seen = new Set<string>();
  return recommendations.filter((recommendation) => {
    const key = shoppingRecommendationKey(recommendation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function appendUniqueId(ids: string[], nextId: string) {
  return ids.includes(nextId) ? ids : [...ids, nextId];
}

export default function InsightsScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [period, setPeriod] = useState<InsightPeriodKey>("30d");
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [outfitRecords, setOutfitRecords] = useState<DailyOutfitRecord[]>([]);
  const [profilePreferences, setProfilePreferences] = useState<UserProfilePreferences | null>(null);
  const [activeShopSuggestion, setActiveShopSuggestion] = useState<WardrobeSuggestion | null>(null);
  const [activeShopRecommendations, setActiveShopRecommendations] = useState<ShoppingRecommendationCandidate[] | null>(null);
  const [preparingShoppingGapId, setPreparingShoppingGapId] = useState<string | null>(null);
  const [savedShoppingProductIds, setSavedShoppingProductIds] = useState<string[]>([]);
  const [dismissedShoppingProductIds, setDismissedShoppingProductIds] = useState<string[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const gapRequestIdRef = useRef(0);

  useEffect(() => {
    if (!uid) {
      setItems([]);
      setSavedShoppingProductIds([]);
      setDismissedShoppingProductIds([]);
      setLoadingItems(false);
      router.replace("/(auth)/welcome");
      return;
    }

    setItems([]);
    setLoadingItems(true);
    const unsubscribe = listenToItems(
      uid,
      (next) => {
        setItems(next as ClothingItem[]);
        setLoadingItems(false);
      },
      {
        status: "ALL",
        sort: "NEWEST",
        onError: () => {
          setLoadingItems(false);
          Alert.alert("Insights", "Unable to load your wardrobe insights. Please try again.");
        },
      }
    );

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    let active = true;
    if (!uid) {
      setProfilePreferences(null);
      return () => {
        active = false;
      };
    }
    void loadUserProfilePreferences(uid)
      .then((preferences) => {
        if (active) setProfilePreferences(preferences);
      })
      .catch(() => {
        if (active) setProfilePreferences(null);
      });
    return () => {
      active = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setOutfitRecords([]);
      return;
    }

    let active = true;
    const { startKey, endKey } = rangeForPeriod(period);
    setOutfitRecords([]);

    const unsubscribe = subscribeOutfitsInRange(
      uid,
      startKey,
      endKey,
      (recordsByDate) => {
        if (!active) return;
        setOutfitRecords(
          Object.values(recordsByDate).filter(
            (record): record is DailyOutfitRecord => Boolean(record)
          )
        );
      },
      () => {
        if (!active) return;
        setOutfitRecords([]);
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [period, uid]);

  const insights = useMemo(
    () => buildWardrobeInsights({ items, outfitRecords }),
    [items, outfitRecords]
  );
  const wardrobeSuggestions = useMemo(
    () =>
      buildWardrobeSuggestions({
        items,
        profilePreferences,
        savedLooks: outfitRecords.map(() => ({})),
      }),
    [items, outfitRecords, profilePreferences],
  );
  const shoppingWardrobeGaps = useMemo(
    () =>
      detectShoppingWardrobeGaps({
        wardrobeItems: items,
        profilePreferences,
        recentOutfits: outfitRecords.map((record) => ({
          itemIds: itemIdsFromOutfitRecord(record),
        })),
        savedLooks: wardrobeSuggestions.map((suggestion) => ({
          missingPieces: [suggestion.itemType],
          styleTags: suggestion.styleTags,
        })),
      }),
    [items, outfitRecords, profilePreferences, wardrobeSuggestions],
  );

  const openAuraWithPrompt = useCallback((prompt: string) => {
    router.push({
      pathname: "/(tabs)/ai",
      params: {
        prompt,
        promptKey: String(Date.now()),
      },
    });
  }, []);

  const handleStyleItem = useCallback(
    (item: ClothingItem) => {
      const label = promptItemLabel(item);
      openAuraWithPrompt(
        `Style ${label} from my wardrobe. Build a wearable outfit around it and explain why it works.`
      );
    },
    [openAuraWithPrompt]
  );

  const handleAskAuraWhatToBuy = useCallback(
    (missingPieces: MissingPieceInsight[]) => {
      const missingSummary = missingPieces.length
        ? missingPieces
            .map((piece) => `${piece.label} (${piece.missingCount})`)
            .join(", ")
        : "no foundational gaps";
      openAuraWithPrompt(
        `Review my wardrobe insights and tell me what to buy next to unlock more outfits. Current gaps: ${missingSummary}. Keep it concise and prioritize versatile pieces.`
      );
    },
    [openAuraWithPrompt]
  );

  const handleFindSuggestionOptions = useCallback((suggestion: WardrobeSuggestion) => {
    gapRequestIdRef.current += 1;
    setPreparingShoppingGapId(null);
    setActiveShopRecommendations(null);
    setActiveShopSuggestion(suggestion);
  }, []);

  const handleFindShoppingGapOptions = useCallback(
    async (gap: WardrobeGap) => {
      const requestId = gapRequestIdRef.current + 1;
      gapRequestIdRef.current = requestId;
      const suggestion = suggestionFromShoppingGap(gap);
      setPreparingShoppingGapId(gap.id);
      setActiveShopRecommendations(null);

      try {
        const result = await getPersonalizedShoppingRecommendationBundle({
          wardrobeItems: items,
          profilePreferences,
          wardrobeGaps: [gap],
          context: {
            sourceSurface: "insights",
            limit: 4,
          },
          limit: 4,
        });
        if (gapRequestIdRef.current !== requestId) return;
        const dedupedRecommendations = dedupeShoppingRecommendations(result.recommendations).slice(0, 4);
        setSavedShoppingProductIds(result.savedProductIds);
        setDismissedShoppingProductIds(result.dismissedProductIds);
        setActiveShopRecommendations(dedupedRecommendations.length ? dedupedRecommendations : null);
        setActiveShopSuggestion(suggestion);
      } catch {
        if (gapRequestIdRef.current !== requestId) return;
        setActiveShopRecommendations(null);
        setActiveShopSuggestion(suggestion);
      } finally {
        if (gapRequestIdRef.current === requestId) {
          setPreparingShoppingGapId(null);
        }
      }
    },
    [items, profilePreferences],
  );

  const handleShoppingFeedbackRecorded = useCallback((record: ShoppingFeedbackRecord) => {
    if (record.action === "saved" || record.action === "purchased") {
      setSavedShoppingProductIds((current) => appendUniqueId(current, record.productId));
    }
    if (record.action === "dismissed") {
      setDismissedShoppingProductIds((current) => appendUniqueId(current, record.productId));
      setActiveShopRecommendations((current) =>
        current?.filter((recommendation) => recommendation.product.id !== record.productId) ?? null,
      );
    }
  }, []);

  return (
    <>
      <AuraInsightsDashboard
        insights={insights}
        loading={loadingItems}
        period={period}
        userId={uid}
        wardrobeSuggestions={wardrobeSuggestions}
        shoppingWardrobeGaps={shoppingWardrobeGaps}
        preparingShoppingGapId={preparingShoppingGapId}
        onPeriodChange={setPeriod}
        onBack={() => safeGoBack("/")}
        onStyleItem={handleStyleItem}
        onAskAuraWhatToBuy={handleAskAuraWhatToBuy}
        onFindSuggestionOptions={handleFindSuggestionOptions}
        onFindShoppingGapOptions={handleFindShoppingGapOptions}
      />
      <ShopOptionsSheet
        visible={Boolean(activeShopSuggestion)}
        suggestion={activeShopSuggestion}
        userId={uid}
        sourceScreen="insights"
        shoppingRecommendations={activeShopRecommendations}
        savedShoppingProductIds={savedShoppingProductIds}
        dismissedShoppingProductIds={dismissedShoppingProductIds}
        onShoppingFeedbackRecorded={handleShoppingFeedbackRecorded}
        onDismiss={() => {
          gapRequestIdRef.current += 1;
          setPreparingShoppingGapId(null);
          setActiveShopSuggestion(null);
          setActiveShopRecommendations(null);
        }}
      />
    </>
  );
}
