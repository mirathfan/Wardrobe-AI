import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import type { ClosetItem } from "../../src/lib/items";
import { useLocalWeather } from "../hooks/useLocalWeather";
import { useNow } from "../hooks/useNow";
import { useTodayCalendarEvents } from "../hooks/useTodayCalendarEvents";
import { getStoredJson, setStoredJson } from "../utils/storage";
import {
  InsightCandidate,
  buildInsightCandidates,
  chooseDailyInsightId,
} from "../utils/insights";
import { AI_ACCENT } from "./AiAccent";
import { useAppTheme } from "../hooks/useAppTheme";

type StoredInsight = {
  dayKey: string;
  insightId: string;
};

const STORAGE_KEY = "wardrobe_ai_last_insight_v1";

type WhyPayload = {
  title: string;
  reasons: string[];
};

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export const AiInsightCard = React.memo(function AiInsightCard({
  items,
  onPressBuildOutfit,
  onPressViewSuggestion,
}: {
  items: ClosetItem[];
  onPressBuildOutfit: () => void;
  onPressViewSuggestion?: (payload: WhyPayload) => void;
}) {
  const { colors } = useAppTheme();
  const { greeting, timeLabel } = useNow();
  const weather = useLocalWeather();
  const calendar = useTodayCalendarEvents();

  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  const candidates = useMemo(() => {
    return buildInsightCandidates({
      items,
      weather:
        weather.permission === "granted" && weather.state === "ready"
          ? { label: weather.label, tempC: weather.tempC }
          : null,
      calendar:
        calendar.permission === "granted" && calendar.events[0]
          ? {
              eventTitle: calendar.events[0].title,
              eventTime: calendar.events[0].timeLabel,
            }
          : null,
    });
  }, [
    calendar.events,
    calendar.permission,
    items,
    weather.label,
    weather.permission,
    weather.state,
    weather.tempC,
  ]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (candidates.length === 0) return;
      const dayKey = todayKey();
      const saved = await getStoredJson<StoredInsight>(STORAGE_KEY);

      if (!active) return;

      if (saved && saved.dayKey === dayKey) {
        const existing = candidates.find((candidate) => candidate.id === saved.insightId);
        if (existing) {
          setSelectedInsightId(existing.id);
          return;
        }
      }

      const nextId = chooseDailyInsightId(candidates, saved?.insightId);
      if (!nextId) return;
      setSelectedInsightId(nextId);
      await setStoredJson<StoredInsight>(STORAGE_KEY, { dayKey, insightId: nextId });
    })();

    return () => {
      active = false;
    };
  }, [candidates]);

  const selectedInsight = useMemo<InsightCandidate>(() => {
    if (candidates.length === 0) {
      return {
        id: "fallback",
        title: "Try a fresh outfit",
        body: "Build an outfit from your newest pieces and let AI do the heavy lifting.",
        reasons: ["No strong signal yet."],
        priority: 0,
      };
    }
    const found = candidates.find((candidate) => candidate.id === selectedInsightId);
    return found ?? candidates[0];
  }, [candidates, selectedInsightId]);

  const onPressWhy = useCallback(() => {
    setWhyOpen(true);
    onPressViewSuggestion?.({
      title: selectedInsight.title,
      reasons: selectedInsight.reasons,
    });
  }, [onPressViewSuggestion, selectedInsight.reasons, selectedInsight.title]);

  const onPressNextInsight = useCallback(async () => {
    if (candidates.length <= 1) return;
    const currentIndex = candidates.findIndex((candidate) => candidate.id === selectedInsight.id);
    const next = candidates[(currentIndex + 1) % candidates.length];
    setSelectedInsightId(next.id);
    await setStoredJson<StoredInsight>(STORAGE_KEY, {
      dayKey: todayKey(),
      insightId: next.id,
    });
  }, [candidates, selectedInsight.id]);

  const weatherRow = useMemo(() => {
    if (weather.permission === "blocked") {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Weather off</Text>
          <Pressable onPress={weather.actions.openSettings}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
              Enable weather in Settings
            </Text>
          </Pressable>
        </View>
      );
    }

    if (weather.permission === "unknown" || weather.permission === "denied") {
      return (
        <Pressable onPress={weather.actions.requestPermission}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
            Enable weather insights
          </Text>
        </Pressable>
      );
    }

    if (weather.state === "loading") {
      return <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Weather: loading…</Text>;
    }

    if (weather.state === "error") {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Weather unavailable</Text>
          <Pressable onPress={weather.actions.refresh}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700" }} numberOfLines={1}>
        {weather.tempC != null ? `${Math.round(weather.tempC)}°C` : "--°C"} • {weather.label || "Weather"}
      </Text>
    );
  }, [
    colors.text,
    colors.textSecondary,
    weather.actions.openSettings,
    weather.actions.refresh,
    weather.actions.requestPermission,
    weather.label,
    weather.permission,
    weather.state,
    weather.tempC,
  ]);

  const calendarRow = useMemo(() => {
    if (calendar.permission === "blocked") {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Calendar off</Text>
          <Pressable onPress={calendar.actions.openSettings}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>
              Enable calendar in Settings
            </Text>
          </Pressable>
        </View>
      );
    }

    if (calendar.permission === "unknown" || calendar.permission === "denied") {
      return (
        <Pressable onPress={calendar.actions.requestPermission}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>Connect calendar</Text>
        </Pressable>
      );
    }

    if (calendar.state === "loading") {
      return <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Today: loading…</Text>;
    }

    if (calendar.state === "error") {
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Calendar unavailable</Text>
          <Pressable onPress={calendar.actions.refresh}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12 }}>Retry</Text>
          </Pressable>
        </View>
      );
    }

    if (calendar.events.length === 0) {
      return <Text style={{ color: colors.textSecondary, fontSize: 12 }}>No events today</Text>;
    }

    return (
      <View style={{ gap: 1 }}>
        {calendar.events.map((event) => (
          <Text key={event.id} style={{ color: colors.text, fontSize: 12 }} numberOfLines={1}>
            {event.timeLabel} — {event.title}
          </Text>
        ))}
        {calendar.moreCount > 0 ? (
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>+{calendar.moreCount} more</Text>
        ) : null}
      </View>
    );
  }, [
    calendar.actions.openSettings,
    calendar.actions.refresh,
    calendar.actions.requestPermission,
    calendar.events,
    calendar.moreCount,
    calendar.permission,
    calendar.state,
    colors.text,
    colors.textSecondary,
  ]);

  return (
    <>
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: colors.card,
          overflow: "hidden",
        }}
      >
        <View style={{ height: 3, backgroundColor: AI_ACCENT.gradientStart, opacity: 0.9 }} />
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 9 }}>
          <Text style={{ color: colors.textSecondary, fontWeight: "700", fontSize: 12 }}>
            {greeting} • {timeLabel}
          </Text>
          <Text style={{ fontSize: 18, fontWeight: "900", color: colors.text }}>
            {selectedInsight.title}
          </Text>
          <Text style={{ color: colors.textSecondary, lineHeight: 20, fontSize: 14 }}>
            {selectedInsight.body}
          </Text>

          <View style={{ gap: 4, marginTop: 1 }}>
            {weatherRow}
            {calendarRow}
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: 11, opacity: 0.8 }}>
            Based on your closet history • On-device context
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
            <Pressable
              onPress={onPressBuildOutfit}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                paddingVertical: 11,
                backgroundColor: "#0f172a",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Build Outfit</Text>
            </Pressable>
            <Pressable
              onPress={onPressWhy}
              style={{
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 11,
                backgroundColor: "rgba(255,255,255,0.04)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Text style={{ fontWeight: "800", color: colors.text, fontSize: 13 }}>Why?</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Modal visible={whyOpen} transparent animationType="fade" onRequestClose={() => setWhyOpen(false)}>
        <Pressable
          onPress={() => setWhyOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(15,23,42,0.35)",
            padding: 24,
            justifyContent: "center",
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              padding: 16,
              gap: 10,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "900", color: colors.text }}>Why this suggestion</Text>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{selectedInsight.title}</Text>
            <View style={{ gap: 6 }}>
              {selectedInsight.reasons.map((reason) => (
                <Text key={reason} style={{ color: colors.textSecondary }}>
                  • {reason}
                </Text>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Pressable
                onPress={() => void onPressNextInsight()}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "800", color: colors.text }}>Next</Text>
              </Pressable>
              <Pressable
                onPress={() => setWhyOpen(false)}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  backgroundColor: "#0f172a",
                  paddingVertical: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
});
