import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";

import AuraInsightsDashboard, {
  type InsightPeriodKey,
} from "@/src/components/insights/AuraInsightsDashboard";
import { useAuth } from "@/src/hooks/useAuth";
import { listenToItems } from "@/src/lib/items";
import {
  buildWardrobeInsights,
  type MissingPieceInsight,
} from "@/src/lib/wardrobeInsights";
import { safeGoBack } from "@/src/lib/navigation";
import type { ClothingItem } from "@/src/types/ClothingItem";
import { addDays, toDayKey } from "@/src/utils/date";
import {
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

export default function InsightsScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [period, setPeriod] = useState<InsightPeriodKey>("30d");
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [outfitRecords, setOutfitRecords] = useState<DailyOutfitRecord[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);

  useEffect(() => {
    if (!uid) {
      setItems([]);
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
        onError: (message) => {
          setLoadingItems(false);
          Alert.alert("Firestore error", message);
        },
      }
    );

    return () => unsubscribe();
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

  return (
    <AuraInsightsDashboard
      insights={insights}
      loading={loadingItems}
      period={period}
      onPeriodChange={setPeriod}
      onBack={() => safeGoBack("/")}
      onStyleItem={handleStyleItem}
      onAskAuraWhatToBuy={handleAskAuraWhatToBuy}
    />
  );
}
