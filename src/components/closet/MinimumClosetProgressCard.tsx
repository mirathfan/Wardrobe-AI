import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
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
  onAddMissingItem: () => void;
};

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
  onAddMissingItem,
}: Props) {
  const layout = useResponsiveLayout();
  const progress = useMemo(() => getMinimumClosetProgress(items), [items]);
  const nudge = useMemo(() => getClosetUnlockNudge(items), [items]);
  const nextBestAdd = progress.categories.find(
    (category) => category.key === progress.suggestedNextCategory,
  )?.label;

  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: layout.mediumRadius,
          padding: layout.cardPadding,
        },
      ]}
    >
      <View pointerEvents="none" style={styles.glow} />
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[styles.eyebrow, { color: colors.iridescentStart }]}>STYLE CORE</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            Build your style core
          </Text>
          <Text style={[styles.nudge, { color: colors.textSecondary }]} numberOfLines={2}>
            {nudge}
          </Text>
        </View>
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
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: pressed ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.1)",
              opacity: pressed ? 0.88 : 1,
            },
          ]}
        >
          <Ionicons name="add" size={16} color={colors.text} />
          <Text style={[styles.ctaText, { color: colors.text }]} numberOfLines={1}>
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
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(14,14,20,0.76)",
    gap: 14,
  },
  glow: {
    position: "absolute",
    top: -90,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(241,210,255,0.08)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  nudge: {
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.72,
  },
  progressBadge: {
    minWidth: 64,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  progressText: {
    fontSize: 18,
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
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
  },
  checkGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  checkRow: {
    minWidth: 118,
    flexGrow: 1,
    flexBasis: "30%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  checkIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
    gap: 12,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "900",
  },
  metricLabel: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: "700",
    opacity: 0.72,
  },
  cta: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: "900",
  },
});
