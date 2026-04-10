import { router } from "expo-router";
import { collection, doc, increment, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from "firebase/firestore";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import AgendaCard from "@/src/components/AgendaCard";
import DailyOutfitCard from "@/src/components/DailyOutfitCard";
import WhyModal from "@/src/components/WhyModal";
import CalendarHeader from "@/src/components/calendar/CalendarHeader";
import DateRail from "@/src/components/calendar/DateRail";
import DayContextCard from "@/src/components/calendar/DayContextCard";
import SwapSheet from "@/src/components/calendar/SwapSheet";
import TimelineCard from "@/src/components/calendar/TimelineCard";
import WeatherStrip from "@/src/components/calendar/WeatherStrip";
import { useDayEvents } from "@/src/hooks/useDayEvents";
import { useDayWeather } from "@/src/hooks/useDayWeather";
import { useNow } from "@/src/hooks/useNow";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { useSelectedDate } from "@/src/hooks/useSelectedDate";
import { addDays, formatHeaderDate, parseDateValue, toDayKey } from "@/src/utils/date";
import {
  DailyOutfitRecord,
  OutfitItemsByCategory,
  PlannedOutfit,
  clearPlan,
  copyPlan,
  setPlanned,
  setWorn,
  subscribeOutfitByDate,
  subscribeOutfitsInRange,
} from "@/src/utils/dailyOutfits";
import { generateDailyPlan, inferTimelineVibe, PlannedLook, weatherSuggestion } from "@/src/utils/outfitPlanning";
import { getDailyWeather } from "@/src/utils/weatherDaily";
import { getLoggedOutfitDays, getOutfitStreak } from "@/src/utils/streak";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useAuth } from "@/src/hooks/useAuth";
import { db } from "@/src/lib/firebase";
import { MAX_WEARS_BEFORE_WASH, isVisibleWardrobeItem, toCanonicalCategory } from "@/src/lib/items";
import type { ClothingItem } from "@/src/types/ClothingItem";

type SectionIconName = "calendar" | "sparkles" | "chart.bar.xaxis";
type SlotKey = keyof OutfitItemsByCategory;

const DateTimePickerModule = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-community/datetimepicker");
  } catch {
    return null;
  }
})();
const NativeDatePicker = DateTimePickerModule?.default ?? null;

function iconFallback(name: SectionIconName): keyof typeof Ionicons.glyphMap {
  if (name === "calendar") return "calendar-outline";
  if (name === "sparkles") return "sparkles-outline";
  return "stats-chart-outline";
}

function SectionHeader({ icon, title }: { icon: SectionIconName; title: string }) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={iconFallback(icon)} size={17} color={colors.text} />
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );
}

function isPastDate(date: Date) {
  return toDayKey(date) < toDayKey(new Date());
}

function slotToCategory(slot: SlotKey) {
  if (slot === "outerwear") return "outerwear";
  if (slot === "top") return "top";
  if (slot === "bottom") return "bottom";
  return "shoes";
}

function computeDaysSinceLastWorn(item: ClothingItem) {
  const date = parseDateValue(item.lastWornDate);
  if (!date) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

async function hapticLight() {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // no-op
  }
}

function lookToPlanned(look: PlannedLook): PlannedOutfit {
  return {
    itemsByCategory: {
      outerwear: look.slotItemIds.outerwear ?? undefined,
      top: look.slotItemIds.top ?? undefined,
      bottom: look.slotItemIds.bottom ?? undefined,
      shoes: look.slotItemIds.shoes ?? undefined,
    },
    score: look.score,
    reasons: look.reasons,
    createdAt: Date.now(),
  };
}

function buildRailDateKeys(anchor: Date) {
  return Array.from({ length: 121 }, (_, i) => toDayKey(addDays(anchor, i - 60)));
}

function DatePickerSheet({
  visible,
  value,
  title,
  onChange,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  value: Date;
  title: string;
  onChange: (date: Date) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const styles = useMemo(() => createStyles(colors, layout), [colors, layout]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          {NativeDatePicker ? (
            <NativeDatePicker
              value={value}
              mode="date"
              display="spinner"
              onChange={(_: unknown, nextDate?: Date) => {
                if (nextDate) onChange(nextDate);
              }}
            />
          ) : (
            <Text style={styles.muted}>Date picker is unavailable in this client.</Text>
          )}
          <View style={styles.modalActions}>
            <Pressable style={styles.modalSecondary} onPress={onCancel}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.modalPrimary} onPress={onConfirm}>
              <Text style={styles.modalPrimaryText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function CalendarScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const uid = user?.uid ?? null;
  const bottomDockPadding = layout.bottomDockPadding;

  const { greeting, timeLabel } = useNow();
  const day = useSelectedDate();
  const events = useDayEvents(day.selectedDate);
  const weather = useDayWeather(day.selectedDate);
  const selectedDayKey = useMemo(() => toDayKey(day.selectedDate), [day.selectedDate]);
  const isPast = useMemo(() => isPastDate(day.selectedDate), [day.selectedDate]);

  const [items, setItems] = useState<ClothingItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<DailyOutfitRecord | null>(null);
  const [looks, setLooks] = useState<PlannedLook[]>([]);
  const [selectedLookId, setSelectedLookId] = useState<PlannedLook["id"]>("casual");
  const [aiThinking, setAiThinking] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [streak, setStreak] = useState(0);
  const [loggedDaySet, setLoggedDaySet] = useState<Set<string>>(new Set());
  const [railStatuses, setRailStatuses] = useState<Record<string, { planned?: boolean; worn?: boolean; streak?: boolean }>>({});
  const [weeklyFlags, setWeeklyFlags] = useState<number[]>(Array.from({ length: 7 }, () => 0));
  const [weekWeather, setWeekWeather] = useState<{ label: string; high?: number; low?: number; selected: boolean }[]>([]);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapSlot, setSwapSlot] = useState<SlotKey | null>(null);
  const [jumpPickerOpen, setJumpPickerOpen] = useState(false);
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [pickerDate, setPickerDate] = useState(day.selectedDate);

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const selectedDateLabel = useMemo(() => formatHeaderDate(day.selectedDate), [day.selectedDate]);
  const selectedLook = useMemo(
    () => looks.find((look) => look.id === selectedLookId) ?? looks[0] ?? null,
    [looks, selectedLookId]
  );

  const loadStreakData = useCallback(async () => {
    if (!uid) {
      setStreak(0);
      setLoggedDaySet(new Set());
      return;
    }
    const [nextStreak, logged] = await Promise.all([getOutfitStreak(uid), getLoggedOutfitDays(uid)]);
    setStreak(nextStreak);
    setLoggedDaySet(new Set(logged));
  }, [uid]);

  useEffect(() => {
    loadStreakData().catch(() => {
      setStreak(0);
      setLoggedDaySet(new Set());
    });
  }, [loadStreakData]);

  useEffect(() => {
    let unsub: undefined | (() => void);
    if (!uid) {
      setItems([]);
      setLoadingItems(false);
      router.replace("/(auth)/login");
      return;
    }

    const itemsRef = collection(db, "users", uid, "items");
    const qItems = query(itemsRef, orderBy("createdAt", "desc"));
    unsub = onSnapshot(
      qItems,
      (snap) => {
        const next = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ClothingItem, "id">) }))
          .filter((item) => isVisibleWardrobeItem(item));
        setItems(next as ClothingItem[]);
        setLoadingItems(false);
      },
      (err) => {
        console.log(err);
        Alert.alert("Firestore error", err.message);
        setLoadingItems(false);
      }
    );
    return () => unsub?.();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setRecord(null);
      return;
    }

    return subscribeOutfitByDate(
      uid,
      selectedDayKey,
      (next) => setRecord(next),
      () => setRecord(null)
    );
  }, [selectedDayKey, uid]);

  useEffect(() => {
    if (!uid) {
      setRailStatuses({});
      return;
    }

    const keys = buildRailDateKeys(day.selectedDate);
    const startKey = keys[0];
    const endKey = keys[keys.length - 1];

    return subscribeOutfitsInRange(
      uid,
      startKey,
      endKey,
      (records) => {
        const statuses: Record<string, { planned?: boolean; worn?: boolean; streak?: boolean }> = {};
        keys.forEach((key) => {
          statuses[key] = {
            planned: !!records[key]?.plannedOutfit,
            worn: !!records[key]?.wornOutfit,
            streak: !!records[key]?.wornOutfit,
          };
        });
        setRailStatuses(statuses);
      },
      () => setRailStatuses({})
    );
  }, [day.selectedDate, uid]);

  useEffect(() => {
    const weekKeys = day.weekDates.map((date) => toDayKey(date));
    setWeeklyFlags(weekKeys.map((key) => (loggedDaySet.has(key) ? 1 : 0)));
  }, [day.weekDates, loggedDaySet]);

  useEffect(() => {
    let cancelled = false;
    async function buildLooks() {
      setAiThinking(true);
      const generated = generateDailyPlan(items, {
        dayKey: selectedDayKey,
        tempC: weather.weather?.nowC ?? weather.weather?.highC,
        weatherLabel: weather.weather?.conditionLabel,
        events: events.events,
      });
      await new Promise((resolve) => setTimeout(resolve, 550));
      if (cancelled) return;
      setLooks(generated.looks);
      setAiThinking(false);
    }
    buildLooks().catch(() => {
      if (!cancelled) setAiThinking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [events.events, items, selectedDayKey, weather.weather?.conditionLabel, weather.weather?.highC, weather.weather?.nowC]);

  useEffect(() => {
    let cancelled = false;
    async function loadWeekWeather() {
      if (weather.permission !== "granted") {
        setWeekWeather([]);
        return;
      }

      let LocationModule: any = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        LocationModule = require("expo-location");
      } catch {
        LocationModule = null;
      }
      if (!LocationModule) return;

      try {
        let position;
        try {
          position = await LocationModule.getCurrentPositionAsync({ accuracy: LocationModule.Accuracy?.Balanced });
        } catch {
          position = await LocationModule.getLastKnownPositionAsync({});
        }

        const lat = position?.coords?.latitude;
        const lon = position?.coords?.longitude;
        if (typeof lat !== "number" || typeof lon !== "number") return;

        const dates = day.weekDates;
        const values = await Promise.all(dates.map((date) => getDailyWeather(lat, lon, date)));
        if (cancelled) return;

        setWeekWeather(
          values.map((value, index) => ({
            label: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(dates[index]),
            high: value.highC,
            low: value.lowC,
            selected: toDayKey(dates[index]) === selectedDayKey,
          }))
        );
      } catch {
        if (!cancelled) setWeekWeather([]);
      }
    }

    loadWeekWeather().catch(() => {
      if (!cancelled) setWeekWeather([]);
    });
    return () => {
      cancelled = true;
    };
  }, [day.weekDates, selectedDayKey, weather.permission]);

  const weatherSummary = useMemo(() => {
    if (weather.permission === "unknown" || weather.permission === "denied") return "Enable weather insights";
    if (weather.permission === "blocked") return "Enable weather in Settings";
    if (weather.state === "loading") return "Loading weather…";
    if (weather.state === "error") return "Weather unavailable · Retry";
    if (!weather.weather) return "Weather unavailable";
    const high = typeof weather.weather.highC === "number" ? Math.round(weather.weather.highC) : "—";
    const low = typeof weather.weather.lowC === "number" ? Math.round(weather.weather.lowC) : "—";
    const now = typeof weather.weather.nowC === "number" ? ` • Now ${Math.round(weather.weather.nowC)}°` : "";
    return `High ${high}° • Low ${low}° • ${weather.weather.conditionLabel ?? "Weather"}${now}`;
  }, [weather.permission, weather.state, weather.weather]);

  const contextEventSummary = useMemo(() => {
    if (events.events.length === 0) return "No events for this day";
    const next = events.events[0];
    return `Next: ${next.timeLabel} — ${next.title}`;
  }, [events.events]);

  const timelineVibe = useMemo(() => inferTimelineVibe(events.events), [events.events]);
  const daySuggestion = useMemo(
    () => weatherSuggestion(weather.weather?.nowC ?? weather.weather?.highC, weather.weather?.conditionLabel),
    [weather.weather?.conditionLabel, weather.weather?.highC, weather.weather?.nowC]
  );

  const weeklyInsights = useMemo(() => {
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const colorCounts = new Map<string, number>();
    items.forEach((item) => {
      const colors = [...(Array.isArray(item.colors) ? item.colors : []), item.primaryColor ?? ""]
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean);
      new Set(colors).forEach((color) => {
        colorCounts.set(color, (colorCounts.get(color) ?? 0) + Number(item.wearCountSinceWash ?? 0) + 1);
      });
    });
    const mostWornColor = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
    const unusedCount = items.filter((item) => {
      const wears = Number(item.wearCountSinceWash ?? 0);
      const lastWorn = parseDateValue(item.lastWornDate)?.getTime();
      if (wears === 0) return true;
      if (!lastWorn) return true;
      return now - lastWorn > monthMs;
    }).length;
    const mostWornItem = [...items].sort((a, b) => Number(b.wearCountSinceWash ?? 0) - Number(a.wearCountSinceWash ?? 0))[0];
    return [
      mostWornColor ? `Most worn color: ${mostWornColor.replace(/_/g, " ")}` : null,
      `Unused items this month: ${unusedCount}`,
      mostWornItem ? `Most worn item: ${mostWornItem.name || mostWornItem.subCategory || mostWornItem.category}` : null,
    ].filter(Boolean) as string[];
  }, [items]);

  const onWeatherAction = useCallback(async () => {
    if (weather.permission === "unknown" || weather.permission === "denied") return weather.actions.requestPermission();
    if (weather.permission === "blocked") return weather.actions.openSettings();
    if (weather.permission === "granted" && weather.state === "error") return weather.actions.refresh();
  }, [weather.actions, weather.permission, weather.state]);

  const onCalendarAction = useCallback(async () => {
    if (events.permission === "unknown" || events.permission === "denied") return events.actions.requestPermission();
    if (events.permission === "blocked") return events.actions.openSettings();
    if (events.permission === "granted" && events.state === "error") return events.actions.refresh();
  }, [events.actions, events.permission, events.state]);

  const onSelectDate = useCallback(async (date: Date) => {
    day.setSelectedDate(date);
    await hapticLight();
  }, [day]);

  const onSelectLook = useCallback(async (lookId: PlannedLook["id"]) => {
    setSelectedLookId(lookId);
    await hapticLight();
  }, []);

  const ensurePlannedFromSelectedLook = useCallback(async () => {
    if (!uid) return null;
    if (record?.plannedOutfit) return record.plannedOutfit;
    if (!selectedLook) return null;
    const planned = lookToPlanned(selectedLook);
    const next = await setPlanned(uid, selectedDayKey, planned);
    setRecord(next);
    return next.plannedOutfit ?? null;
  }, [record?.plannedOutfit, selectedDayKey, selectedLook, uid]);

  const onUseOutfit = useCallback(async () => {
    if (!uid || !selectedLook) return;
    const planned = lookToPlanned(selectedLook);
    const next = await setPlanned(uid, selectedDayKey, planned);
    setRecord(next);
    setSelectedLookId(selectedLook.id);
    await hapticLight();
  }, [selectedDayKey, selectedLook, uid]);

  const onClearPlan = useCallback(async () => {
    if (!uid) return;
    const next = await clearPlan(uid, selectedDayKey);
    setRecord(next);
  }, [selectedDayKey, uid]);

  const onOpenCopyPicker = useCallback(() => {
    setPickerDate(addDays(day.selectedDate, 1));
    setCopyPickerOpen(true);
  }, [day.selectedDate]);

  const onConfirmCopy = useCallback(async () => {
    if (!uid) return;
    const toDateKey = toDayKey(pickerDate);
    const copied = await copyPlan(uid, selectedDayKey, toDateKey);
    setCopyPickerOpen(false);
    if (copied) {
      Alert.alert("Copied", `Plan copied to ${toDateKey}`);
    } else {
      Alert.alert("No plan", "Save a plan first.");
    }
  }, [pickerDate, selectedDayKey, uid]);

  const onSwapSlot = useCallback(async (slot: SlotKey) => {
    if (isPast) return;
    const planned = await ensurePlannedFromSelectedLook();
    if (!planned) return;
    setSwapSlot(slot);
    setSwapOpen(true);
  }, [ensurePlannedFromSelectedLook, isPast]);

  const onSelectSwapItem = useCallback(async (itemId: string) => {
    if (!uid || !swapSlot) return;
    const planned = await ensurePlannedFromSelectedLook();
    if (!planned) return;
    const next: PlannedOutfit = {
      ...planned,
      itemsByCategory: {
        ...planned.itemsByCategory,
        [swapSlot]: itemId,
      },
      createdAt: Date.now(),
    };
    const saved = await setPlanned(uid, selectedDayKey, next);
    setRecord(saved);
    setSwapOpen(false);
    setSwapSlot(null);
    await hapticLight();
  }, [ensurePlannedFromSelectedLook, selectedDayKey, swapSlot, uid]);

  const onClearSwapSlot = useCallback(async () => {
    if (!uid || !swapSlot) return;
    const planned = await ensurePlannedFromSelectedLook();
    if (!planned) return;
    const next: PlannedOutfit = {
      ...planned,
      itemsByCategory: {
        ...planned.itemsByCategory,
        [swapSlot]: undefined,
      },
      createdAt: Date.now(),
    };
    const saved = await setPlanned(uid, selectedDayKey, next);
    setRecord(saved);
    setSwapOpen(false);
    setSwapSlot(null);
  }, [ensurePlannedFromSelectedLook, selectedDayKey, swapSlot, uid]);

  const onNextSuggestion = useCallback(async () => {
    if (!uid || looks.length === 0) return;
    const currentIdx = looks.findIndex((look) => look.id === selectedLookId);
    const next = looks[(currentIdx + 1) % looks.length];
    if (!next) return;
    setSelectedLookId(next.id);
    if (record?.plannedOutfit) {
      const saved = await setPlanned(uid, selectedDayKey, lookToPlanned(next));
      setRecord(saved);
    }
    await hapticLight();
  }, [looks, record?.plannedOutfit, selectedDayKey, selectedLookId, uid]);

  const onMarkWorn = useCallback(async () => {
    let planned = record?.plannedOutfit ?? null;
    if (!planned && selectedLook) planned = lookToPlanned(selectedLook);
    if (!planned) {
      Alert.alert("No outfit", "Select a look first.");
      return;
    }

    const wornItems = planned.itemsByCategory;
    if (toDayKey(day.selectedDate) === toDayKey(new Date()) && uid) {
      const ids = [wornItems.outerwear, wornItems.top, wornItems.bottom, wornItems.shoes].filter(Boolean) as string[];
      for (const itemId of ids) {
        const item = itemsById.get(itemId);
        if (!item) continue;
        if (item.status === "IN_LAUNDRY") {
          Alert.alert("Cannot mark outfit worn", `${item.name || item.category} is in laundry.`);
          return;
        }
        if ((item.wearCountSinceWash ?? 0) >= MAX_WEARS_BEFORE_WASH) {
          Alert.alert("Wash required", `${item.name || item.category} reached the wear limit.`);
          return;
        }
      }

      try {
        setSaving(true);
        const batch = writeBatch(db);
        ids.forEach((itemId) => {
          const itemRef = doc(db, "users", uid, "items", itemId);
          batch.update(itemRef, {
            status: "WORN",
            wearCountSinceWash: increment(1),
            lastWornDate: serverTimestamp(),
          });
        });
        await batch.commit();
      } catch (e: unknown) {
        const err = e as { message?: string };
        Alert.alert("Error", err.message ?? "Failed to update worn status");
      } finally {
        setSaving(false);
      }
    }

    if (!uid) return;

    const next = await setWorn(uid, selectedDayKey, {
      itemsByCategory: wornItems,
      wornAt: Date.now(),
    });
    setRecord(next);
    await loadStreakData();
    await hapticLight();
  }, [day.selectedDate, itemsById, loadStreakData, record?.plannedOutfit, selectedDayKey, selectedLook, uid]);

  const swapOptions = useMemo(() => {
    if (!swapSlot) return [];
    const wantedCategory = slotToCategory(swapSlot);
    return items
      .filter((item) => toCanonicalCategory(item.category) === wantedCategory)
      .filter((item) => item.status !== "IN_LAUNDRY")
      .sort((a, b) => computeDaysSinceLastWorn(b) - computeDaysSinceLastWorn(a))
      .map((item) => ({
        id: item.id,
        label: `${item.name || item.subCategory || item.category}${item.brand ? ` • ${item.brand}` : ""}`,
      }));
  }, [items, swapSlot]);

  const canClearSwapSlot = useMemo(() => {
    if (!swapSlot) return false;
    return Boolean(record?.plannedOutfit?.itemsByCategory?.[swapSlot]);
  }, [record?.plannedOutfit?.itemsByCategory, swapSlot]);

  const activeWhyReasons = useMemo(() => {
    if (record?.plannedOutfit?.reasons?.length) return record.plannedOutfit.reasons;
    return selectedLook?.reasons ?? [];
  }, [record?.plannedOutfit?.reasons, selectedLook?.reasons]);

  const themedStyles = useMemo(() => createStyles(colors, layout), [colors, layout]);

  return (
    <View style={themedStyles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: layout.topContentInset,
          paddingBottom: Math.max(bottomDockPadding, 120),
        }}
        showsVerticalScrollIndicator={false}
      >
        <CalendarHeader
          selectedDate={day.selectedDate}
          today={day.today}
          onJumpToToday={() => day.setSelectedDate(new Date())}
        />

        <Pressable style={themedStyles.monthPicker} onPress={() => {
          setPickerDate(day.selectedDate);
          setJumpPickerOpen(true);
        }}>
          <Text style={themedStyles.monthPickerText}>
            {new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(day.selectedDate)}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
        </Pressable>

        <DateRail selectedDate={day.selectedDate} onSelectDate={onSelectDate} statuses={railStatuses} />

        <DayContextCard
          greeting={greeting}
          timeLabel={timeLabel}
          eventSummary={contextEventSummary}
          weatherSummary={weatherSummary}
          suggestion={daySuggestion}
          streak={streak}
          weatherPermission={weather.permission}
          weatherState={weather.state}
          onWeatherAction={onWeatherAction}
        />

        {weekWeather.length > 0 ? (
          <View style={themedStyles.weatherStripWrap}>
            <WeatherStrip days={weekWeather} />
          </View>
        ) : null}

        <SectionHeader icon="calendar" title="Agenda" />
        <AgendaCard
          permission={events.permission}
          state={events.state}
          events={events.events}
          moreCount={events.moreCount}
          timelineVibe={timelineVibe}
          onPermissionAction={onCalendarAction}
        />

        <View style={themedStyles.sectionGap} />
        <TimelineCard events={events.events} />

        <View style={themedStyles.sectionGap} />
        <SectionHeader icon="sparkles" title="Outfit for this date" />
        {isPast && !record?.wornOutfit ? (
          <View style={themedStyles.card}>
            <Text style={themedStyles.muted}>No outfit logged for {selectedDateLabel}.</Text>
            <Pressable style={themedStyles.planCta} onPress={() => setSelectedLookId("casual")}>
              <Text style={themedStyles.planCtaText}>Plan an outfit</Text>
            </Pressable>
          </View>
        ) : (
          <DailyOutfitCard
            dateLabel={selectedDateLabel}
            isPastDate={isPast}
            record={record}
            looks={looks}
            selectedLookId={selectedLookId}
            itemsById={itemsById}
            thinking={aiThinking}
            onSelectLook={onSelectLook}
            onUseOutfit={onUseOutfit}
            onWhy={() => setWhyOpen(true)}
            onMarkWorn={onMarkWorn}
            onClearPlan={onClearPlan}
            onCopyPlan={onOpenCopyPicker}
            onSwapSlot={onSwapSlot}
          />
        )}

        <View style={themedStyles.sectionGap} />
        <SectionHeader icon="chart.bar.xaxis" title="Wardrobe Insights" />
        <View style={themedStyles.card}>
          <View style={themedStyles.weekBars}>
            {weeklyFlags.map((value, index) => (
              <View key={`week-${index}`} style={themedStyles.weekBarTrack}>
                <View style={[themedStyles.weekBarFill, { height: value ? 18 : 6 }]} />
              </View>
            ))}
          </View>
          <View style={themedStyles.insightsList}>
            {weeklyInsights.map((line) => (
              <Pressable key={line} onPress={() => router.push("/(tabs)")}>
                <Text style={themedStyles.muted}>• {line}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loadingItems ? <Text style={themedStyles.muted}>Loading wardrobe…</Text> : null}
        {saving ? <Text style={themedStyles.muted}>Saving worn status…</Text> : null}
      </ScrollView>

      <WhyModal
        visible={whyOpen}
        reasons={activeWhyReasons}
        onClose={() => setWhyOpen(false)}
        onNextSuggestion={onNextSuggestion}
      />

      <SwapSheet
        visible={swapOpen}
        title={`Swap ${swapSlot ?? "item"}`}
        options={swapOptions}
        onSelect={onSelectSwapItem}
        onClear={canClearSwapSlot ? onClearSwapSlot : undefined}
        onClose={() => {
          setSwapOpen(false);
          setSwapSlot(null);
        }}
      />

      <DatePickerSheet
        visible={jumpPickerOpen}
        value={pickerDate}
        title="Jump to date"
        onChange={setPickerDate}
        onCancel={() => setJumpPickerOpen(false)}
        onConfirm={async () => {
          setJumpPickerOpen(false);
          await onSelectDate(pickerDate);
        }}
      />

      <DatePickerSheet
        visible={copyPickerOpen}
        value={pickerDate}
        title="Copy plan to date"
        onChange={setPickerDate}
        onCancel={() => setCopyPickerOpen(false)}
        onConfirm={onConfirmCopy}
      />
    </View>
  );
}

function createStyles(
  colors: ReturnType<typeof useAppTheme>["colors"],
  layout: ReturnType<typeof useResponsiveLayout>
) {
return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sectionHeader: {
    marginTop: layout.sectionGap - 4,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  monthPicker: {
    marginTop: 8,
    marginBottom: 4,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  monthPickerText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  weatherStripWrap: {
    marginTop: layout.sectionGap - 10,
  },
  sectionGap: {
    height: layout.sectionGap - 4,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: layout.mediumRadius,
    padding: layout.cardPadding,
    backgroundColor: colors.surface,
  },
  muted: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  planCta: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  planCtaText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
  },
  weekBars: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
    marginBottom: 10,
  },
  weekBarTrack: {
    flex: 1,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
    padding: 1,
  },
  weekBarFill: {
    borderRadius: 5,
    backgroundColor: colors.accent,
    width: "100%",
  },
  insightsList: {
    gap: 5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.24)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: layout.largeRadius,
    borderTopRightRadius: layout.largeRadius,
    padding: layout.cardPadding,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalSecondary: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalSecondaryText: {
    color: colors.text,
    fontWeight: "700",
  },
  modalPrimary: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalPrimaryText: {
    color: "#fff",
    fontWeight: "800",
  },
});
}
