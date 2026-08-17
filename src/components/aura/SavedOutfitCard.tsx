import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import AuraAgentOutfitCard from "@/src/components/aura/AuraAgentOutfitCard";
import {
  auraCardStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  formatSavedOutfitDate,
  savedOutfitItemCount,
  savedOutfitSubtitle,
  savedOutfitToAgentOutfit,
  type SavedOutfitRecord,
} from "@/src/lib/savedOutfits";

type Props = {
  record: SavedOutfitRecord;
  onPress: () => void;
  compact?: boolean;
};

export default function SavedOutfitCard({ record, onPress, compact = false }: Props) {
  const { colors } = useAppTheme();
  const outfit = React.useMemo(() => savedOutfitToAgentOutfit(record), [record]);
  const subtitle = savedOutfitSubtitle(record);
  const itemCount = savedOutfitItemCount(record);
  const date = formatSavedOutfitDate(record.savedAt);
  const sourceLabel = record.source === "aura_agent" ? "AURA" : "Saved";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${record.title} saved outfit`}
      onPress={onPress}
      style={[
        styles.card,
        auraCardStyle(colors, "card"),
        compact ? styles.compactCard : null,
      ]}
    >
      <AuraAgentOutfitCard
        colors={colors}
        outfit={outfit}
        compact={compact}
        showDetails={false}
        showDevDetails={false}
      />
      <View style={styles.metaBlock}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text numberOfLines={2} style={[auraTypography.cardTitle, { color: colors.text }]}>
              {record.title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} style={[auraTypography.caption, { color: colors.textSecondary }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <View style={[styles.badge, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{sourceLabel}</Text>
          </View>
        </View>
        <View style={styles.footerRow}>
          <Text style={[auraTypography.caption, { color: colors.textMuted }]}>
            {itemCount} {itemCount === 1 ? "piece" : "pieces"}{date ? ` · Saved ${date}` : ""}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  compactCard: {
    padding: 10,
  },
  metaBlock: {
    gap: 10,
    paddingHorizontal: 2,
  },
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  footerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
});
