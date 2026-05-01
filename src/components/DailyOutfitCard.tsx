import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { ClothingItem } from "../../src/types/ClothingItem";
import { DailyOutfitRecord, PlannedOutfit } from "../utils/dailyOutfits";
import { lookToItems, PlannedLook } from "../utils/outfitPlanning";
import FlatLayCanvas from "@/src/components/outfit/FlatLayCanvas";
import { homeTypography } from "@/src/components/home/homeTypography";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import AuraPressable from "@/src/components/aura/AuraPressable";

type SlotKey = "outerwear" | "top" | "bottom" | "shoes";

type Props = {
  dateLabel: string;
  isPastDate: boolean;
  record: DailyOutfitRecord | null;
  looks: PlannedLook[];
  selectedLookId: PlannedLook["id"];
  itemsById: Map<string, ClothingItem>;
  thinking: boolean;
  onSelectLook: (id: PlannedLook["id"]) => void;
  onUseOutfit: () => void;
  onWhy: () => void;
  onMarkWorn: () => void;
  onClearPlan: () => void;
  onCopyPlan: () => void;
  onSwapSlot: (slot: SlotKey) => void;
};

function plannedToLook(planned: PlannedOutfit): PlannedLook {
  return {
    id: "casual",
    label: "Planned",
    slotItemIds: {
      outerwear: planned.itemsByCategory.outerwear ?? null,
      top: planned.itemsByCategory.top ?? null,
      bottom: planned.itemsByCategory.bottom ?? null,
      shoes: planned.itemsByCategory.shoes ?? null,
    },
    score: planned.score,
    reasons: planned.reasons,
  };
}

function PrimaryActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <AuraPressable
      accessibilityRole="button"
      haptic="light"
      pressedScale={0.97}
      pressedOpacity={0.9}
      style={styles.primaryBtn}
      onPress={onPress}
    >
      <LinearGradient
        pointerEvents="none"
        colors={["#7C5CFF", "#5B3BFF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.primaryBtnText}>{label}</Text>
    </AuraPressable>
  );
}

export default function DailyOutfitCard({
  dateLabel,
  isPastDate,
  record,
  looks,
  selectedLookId,
  itemsById,
  thinking,
  onSelectLook,
  onUseOutfit,
  onWhy,
  onMarkWorn,
  onClearPlan,
  onCopyPlan,
  onSwapSlot,
}: Props) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const hasWorn = !!record?.wornOutfit;
  const hasPlanned = !!record?.plannedOutfit;

  const activeLook = hasPlanned
    ? plannedToLook(record?.plannedOutfit as PlannedOutfit)
    : looks.find((look) => look.id === selectedLookId) ?? looks[0] ?? null;

  const gridItems = activeLook
    ? lookToItems(activeLook, itemsById)
    : { outerwear: null, top: null, bottom: null, shoes: null };

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.glassBorder,
          backgroundColor: colors.overlay,
          borderRadius: layout.largeRadius,
          padding: layout.cardPadding,
        },
      ]}
    >
      {hasWorn ? <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Worn on {dateLabel}</Text> : hasPlanned ? <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Planned</Text> : <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Plan outfit for this day</Text>}

      {!hasWorn && !hasPlanned ? (
        <View style={styles.segRow}>
          {looks.map((look) => {
            const active = look.id === selectedLookId;
            return (
              <Pressable
                key={look.id}
                style={[
                  styles.segChip,
                  {
                    borderColor: active ? colors.ctaCream : colors.border,
                    backgroundColor: active ? colors.ctaCream : colors.chipBackground,
                  },
                ]}
                onPress={() => onSelectLook(look.id)}
              >
                <Text style={[homeTypography.caption, { color: active ? colors.ctaText : colors.text }]}>{look.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {thinking ? <Text style={[homeTypography.caption, styles.thinking, { color: colors.textSecondary }]}>✨ Thinking…</Text> : null}
      <View style={{ height: 10 }} />
      <FlatLayCanvas items={gridItems} />

      {activeLook ? (
        <View style={styles.scoreWrap}>
          <Text style={[homeTypography.bodySmall, styles.score, { color: colors.text }]}>Outfit score: {activeLook.score}%</Text>
          {(activeLook.reasons ?? []).slice(0, 2).map((reason) => (
            <Text key={reason} style={[homeTypography.caption, styles.reason, { color: colors.textSecondary }]}>• {reason}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {hasWorn ? (
          <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>Outfit already marked worn.</Text>
        ) : hasPlanned ? (
          <>
            <PrimaryActionButton label="Mark Worn" onPress={onMarkWorn} />
            <Pressable style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.chipBackground }]} onPress={() => Alert.alert("Edit", "Tap a slot to swap an item.") }>
              <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>Edit/Swap</Text>
            </Pressable>
          </>
        ) : (
          <>
            <PrimaryActionButton label="Use this outfit" onPress={onUseOutfit} />
            <Pressable style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.chipBackground }]} onPress={onWhy}>
              <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>Why?</Text>
            </Pressable>
          </>
        )}
      </View>

      {hasPlanned && !hasWorn ? (
        <View style={styles.textActions}>
          <Pressable onPress={onClearPlan}><Text style={[homeTypography.caption, styles.textAction, { color: colors.textSecondary }]}>Clear plan</Text></Pressable>
          <Pressable onPress={onCopyPlan}><Text style={[homeTypography.caption, styles.textAction, { color: colors.textSecondary }]}>Copy this plan to…</Text></Pressable>
        </View>
      ) : null}

      {!hasPlanned && !hasWorn && looks.length === 0 ? (
        <Pressable
          onPress={() => Alert.alert("No plan", "Add more items (top/bottom/shoes) to generate suggestions.")}
          style={[styles.linkBtn, { backgroundColor: colors.chipBackground, borderColor: colors.border }]}
        >
          <Text style={[homeTypography.caption, styles.linkText, { color: colors.textSecondary }]}>No outfit suggestions yet</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0,
  },
  segRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  segChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  segText: {
    fontWeight: "700",
    fontSize: 12,
  },
  thinking: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },
  scoreWrap: {
    marginTop: 10,
    gap: 4,
  },
  score: {
    fontWeight: "700",
  },
  reason: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.65,
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  primaryBtn: {
    height: 56,
    minWidth: 190,
    alignSelf: "flex-start",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    overflow: "hidden",
    shadowColor: "#7C5CFF",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
    letterSpacing: 0,
  },
  secondaryBtn: {
    height: 40,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  textActions: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  textAction: {
    fontWeight: "600",
  },
  muted: {
    color: "#666",
    fontSize: 12,
  },
  linkBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  linkText: {
    fontWeight: "600",
  },
});
