import { useCallback, useEffect, useMemo, useState } from "react";

import { ClothingItem } from "../../src/types/ClothingItem";
import { buildPlannedOutfit, EventLike, PlannedOutfit } from "../utils/outfitPlanner";
import { dateKeyOf } from "../utils/streak";
import { getStoredJson, setStoredJson } from "../utils/storage";

type CachePayload = {
  version: 1;
  dayKey: string;
  itemIds: string[];
  reasons: string[];
  variation: number;
};

type Input = {
  items: ClothingItem[];
  selectedDate: Date;
  weatherLabel?: string;
  tempC?: number;
  events?: EventLike[];
};

const CACHE_PREFIX = "wardrobe_ai_calendar_outfit_v1";

export function usePlannedOutfit({ items, selectedDate, weatherLabel, tempC, events }: Input) {
  const [variation, setVariation] = useState(0);
  const [planned, setPlanned] = useState<PlannedOutfit | null>(null);
  const [loading, setLoading] = useState(true);

  const dayKey = useMemo(() => dateKeyOf(selectedDate), [selectedDate]);
  const cacheKey = `${CACHE_PREFIX}:${dayKey}`;

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const buildAndStore = useCallback(
    async (nextVariation: number) => {
      const generated = buildPlannedOutfit(items, {
        dayKey,
        variation: nextVariation,
        weatherLabel,
        tempC,
        events,
      });

      setPlanned(generated);
      await setStoredJson<CachePayload>(cacheKey, {
        version: 1,
        dayKey,
        itemIds: generated.itemIds,
        reasons: generated.reasons,
        variation: nextVariation,
      });
    },
    [cacheKey, dayKey, events, items, tempC, weatherLabel]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const cached = await getStoredJson<CachePayload>(cacheKey);
      if (cancelled) return;

      if (cached?.version === 1 && cached.dayKey === dayKey && cached.itemIds?.length) {
        const cachedItems = cached.itemIds
          .map((id) => itemById.get(id))
          .filter(Boolean) as ClothingItem[];

        if (cachedItems.length > 0) {
          const regenerated = buildPlannedOutfit(items, {
            dayKey,
            variation: cached.variation ?? 0,
            weatherLabel,
            tempC,
            events,
          });

          const reasons = cached.reasons?.length ? cached.reasons : regenerated.reasons;
          setVariation(cached.variation ?? 0);
          setPlanned({ ...regenerated, reasons });
          setLoading(false);
          return;
        }
      }

      await buildAndStore(0);
      if (!cancelled) setVariation(0);
      if (!cancelled) setLoading(false);
    }

    load().catch(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [buildAndStore, cacheKey, dayKey, events, itemById, items, tempC, weatherLabel]);

  const regenerate = useCallback(async () => {
    const next = variation + 1;
    setVariation(next);
    await buildAndStore(next);
  }, [buildAndStore, variation]);

  return {
    dayKey,
    loading,
    planned,
    regenerate,
  };
}
