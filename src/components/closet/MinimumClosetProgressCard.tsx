import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { auraButtonStyle, auraButtonTextStyle } from "@/src/components/ui/auraStylePrimitives";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  getClosetUnlockNudge,
  getMinimumClosetProgress,
  type MinimumClosetCategoryProgress,
} from "@/src/lib/minimumCloset";
import type { ClothingItem } from "@/src/types/ClothingItem";

type Props = {
  items: Partial<ClothingItem>[];
  colors: AppColors;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  onAddMissingItem: () => void;
};

function styleInsightSummary(current: number, target: number) {
  if (current >= target) return "Complete core";
  if (current >= target - 1) return "Strong base";
  if (current >= Math.ceil(target * 0.6)) return "Good range";
  if (current > 0) return "Building base";
  return "Starter closet";
}

function ChecklistRow({
  category,
  colors,
}: {
  category: MinimumClosetCategoryProgress;
  colors: AppColors;
}) {
  return (
    <View style={styles.checkRow}>
      <View
        style={[
          styles.checkIcon,
          {
            borderColor: category.complete ? "rgba(214,255,232,0.38)" : "rgba(255,255,255,0.14)",
            backgroundColor: category.complete ? "rgba(92,255,178,0.14)" : "rgba(255,255,255,0.045)",
          },
        ]}
      >
        <Ionicons
          name={category.complete ? "checkmark" : "add"}
          size={13}
          color={category.complete ? "#BFFFE0" : colors.textSecondary}
        />
      </View>
      <Text style={[styles.checkLabel, { color: colors.text }]} numberOfLines={1}>
        {category.label}
      </Text>
      <Text style={[styles.checkCount, { color: colors.textSecondary }]}>
        {category.key === "accessories"
          ? category.count > 0 ? "boost" : "bonus"
          : `${Math.min(category.count, category.target)}/${category.target}`}
      </Text>
    </View>
  );
}

export default function MinimumClosetProgressCard({
  items,
  colors,
  expanded = false,
  onToggleExpanded,
  onAddMissingItem,
}: Props) {
  const layout = useResponsiveLayout();
  const progress = useMemo(() => getMinimumClosetProgress(items), [items]);
  const nudge = useMemo(() => getClosetUnlockNudge(items), [items]);
  const nextBestAdd = progress.categories.find(
    (category) => category.key === progress.suggestedNextCategory,
  )?.label;
  const summary = `${progress.current}/${progress.target} • ${styleInsightSummary(progress.current, progress.target)}`;

  if (!expanded) {
    return (
      <Pressable
        onPress={onToggleExpanded}
        style={({ pressed }) => [
          styles.card,
          styles.collapsedCard,
          {
            borderRadius: layout.mediumRadius,
            paddingVertical: 12,
            paddingHorizontal: Math.max(14, layout.cardPadding - 2),
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <View pointerEvents="none" style={styles.glow} />
        <View style={styles.collapsedText}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Ionicons name="sparkles-outline" size={15} color={colors.iridescentMid} />
            <Text style={[styles.collapsedTitle, { color: colors.text }]}>Style insights</Text>
          </View>
          <Text style={[styles.collapsedSummary, { color: colors.textSecondary }]} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <View style={[styles.viewDetailsPill, { borderColor: colors.border, backgroundColor: colors.chipBackground }]}>
          <Text style={[styles.viewDetailsText, { color: colors.ctaCream }]}>View details</Text>
          <Ionicons name="chevron-down" size={13} color={colors.ctaCream} />
        </View>
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: layout.mediumRadius,
          padding: Math.max(12, layout.cardPadding - 4),
        },
      ]}
    >
      <View pointerEvents="none" style={styles.glow} />
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[styles.eyebrow, { color: colors.iridescentStart }]}>STYLE INSIGHTS</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Build your style core
          </Text>
          <Text style={[styles.nudge, { color: colors.textSecondary }]} numberOfLines={2}>
            {nudge}
          </Text>
        </View>
        <Pressable
          onPress={onToggleExpanded}
          style={({ pressed }) => [
            styles.collapseButton,
            {
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceInteractive : colors.chipBackground,
            },
          ]}
        >
          <Ionicons name="chevron-up" size={14} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.progressBadge}>
          <Text style={[styles.progressText, { color: colors.text }]}>{progress.current}/{progress.target}</Text>
          <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>pieces</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.max(4, progress.percent * 100)}%`,
              backgroundColor: colors.iridescentStart,
            },
          ]}
        />
      </View>

      <View style={styles.checkGrid}>
        {progress.categories.map((category) => (
          <ChecklistRow key={category.key} category={category} colors={colors} />
        ))}
      </View>

      <View style={styles.footerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.metricValue, { color: colors.text }]}>
            {progress.estimatedOutfits}+
          </Text>
          <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>
            unlock more outfit range
          </Text>
        </View>
        <Pressable
          onPress={onAddMissingItem}
          style={({ pressed }) => [
            styles.cta,
            {
              ...auraButtonStyle(colors, "tertiary"),
              borderRadius: 8,
              minHeight: 36,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceInteractive : colors.chipBackground,
              opacity: pressed ? 0.88 : 1,
            },
          ]}
        >
          <Ionicons name="add" size={16} color={colors.text} />
          <Text style={[styles.ctaText, auraButtonTextStyle(colors, "tertiary"), { fontSize: 12 }]} numberOfLines={1}>
            {nextBestAdd ? `Next best add: ${nextBestAdd}` : "Add variety"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(251,228,216,0.10)",
    backgroundColor: "rgba(43,18,76,0.46)",
    gap: 10,
  },
  collapsedCard: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  collapsedText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  collapsedTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },
  collapsedSummary: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "800",
  },
  viewDetailsPill: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
  },
  viewDetailsText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  glow: {
    position: "absolute",
    top: -90,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(223,182,178,0.035)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  eyebrow: {
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  nudge: {
    fontSize: 12,
    lineHeight: 17,
    opacity: 0.72,
  },
  collapseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBadge: {
    minWidth: 56,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(251,228,216,0.10)",
    backgroundColor: "rgba(82,43,91,0.28)",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  progressText: {
    fontSize: 16,
    fontWeight: "900",
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(251,228,216,0.08)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  checkGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  checkRow: {
    minWidth: 108,
    flexGrow: 1,
    flexBasis: "30%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(251,228,216,0.08)",
    backgroundColor: "rgba(82,43,91,0.22)",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  checkIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  checkCount: {
    fontSize: 11,
    fontWeight: "800",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "900",
  },
  metricLabel: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.72,
  },
  cta: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "900",
  },
});
