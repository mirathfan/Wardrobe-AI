import React from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import { ClothingItem } from "../../src/types/ClothingItem";
import { DailyOutfitRecord, PlannedOutfit } from "../utils/dailyOutfits";
import { lookToItems, PlannedLook } from "../utils/outfitPlanning";
import OutfitGrid from "./OutfitGrid";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

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
      {hasWorn ? <Text style={[styles.title, { color: colors.text }]}>Worn on {dateLabel}</Text> : hasPlanned ? <Text style={[styles.title, { color: colors.text }]}>Planned</Text> : <Text style={[styles.title, { color: colors.text }]}>Plan outfit for this day</Text>}

      {!hasWorn && !hasPlanned ? (
        <View style={styles.segRow}>
          {looks.map((look) => {
            const active = look.id === selectedLookId;
            return (
              <Pressable
                key={look.id}
                style={[
                  styles.segChip,
                  { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : colors.surface },
                ]}
                onPress={() => onSelectLook(look.id)}
              >
                <Text style={[styles.segText, { color: active ? "#fff" : colors.text }]}>{look.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {thinking ? <Text style={[styles.thinking, { color: colors.textSecondary }]}>✨ Thinking…</Text> : null}
      <View style={{ height: 10 }} />
      <OutfitGrid
        items={gridItems}
        editable={!hasWorn && !isPastDate}
        onPressSlot={onSwapSlot}
      />

      {activeLook ? (
        <View style={styles.scoreWrap}>
          <Text style={[styles.score, { color: colors.text }]}>Outfit score: {activeLook.score}%</Text>
          {(activeLook.reasons ?? []).slice(0, 2).map((reason) => (
            <Text key={reason} style={[styles.reason, { color: colors.textSecondary }]}>• {reason}</Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        {hasWorn ? (
          <Text style={[styles.muted, { color: colors.textSecondary }]}>Outfit already marked worn.</Text>
        ) : hasPlanned ? (
          <>
            <Pressable style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={onMarkWorn}>
              <Text style={styles.primaryBtnText}>Mark Worn</Text>
            </Pressable>
            <Pressable style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => Alert.alert("Edit", "Tap a slot to swap an item.") }>
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Edit/Swap</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={onUseOutfit}>
              <Text style={styles.primaryBtnText}>Use this outfit</Text>
            </Pressable>
            <Pressable style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={onWhy}>
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Why?</Text>
            </Pressable>
          </>
        )}
      </View>

      {hasPlanned && !hasWorn ? (
        <View style={styles.textActions}>
          <Pressable onPress={onClearPlan}><Text style={[styles.textAction, { color: colors.textSecondary }]}>Clear plan</Text></Pressable>
          <Pressable onPress={onCopyPlan}><Text style={[styles.textAction, { color: colors.textSecondary }]}>Copy this plan to…</Text></Pressable>
        </View>
      ) : null}

      {!hasPlanned && !hasWorn && looks.length === 0 ? (
        <Pressable
          onPress={() => Alert.alert("No plan", "Add more items (top/bottom/shoes) to generate suggestions.")}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>No outfit suggestions yet</Text>
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
    fontSize: 16,
    fontWeight: "800",
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
    fontWeight: "800",
    fontSize: 13,
  },
  reason: {
    fontSize: 12,
  },
  actionsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    alignItems: "center",
    paddingVertical: 11,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryBtnText: {
    fontWeight: "800",
  },
  textActions: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  textAction: {
    fontSize: 12,
    fontWeight: "700",
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
    backgroundColor: "#f3f4f6",
  },
  linkText: {
    color: "#111",
    fontWeight: "700",
  },
});
