import React from "react";
import { Image, Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImageUrl } from "@/src/lib/itemImage";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { DailyOutfitRecord } from "@/src/utils/dailyOutfits";

type SlotKey = "outerwear" | "top" | "bottom" | "shoes";

function itemForSlot(record: DailyOutfitRecord | null, itemsById: Map<string, ClothingItem>, slot: SlotKey) {
  const itemId = record?.plannedOutfit?.itemsByCategory?.[slot] ?? record?.wornOutfit?.itemsByCategory?.[slot] ?? null;
  return itemId ? itemsById.get(itemId) ?? null : null;
}

function slotLabel(slot: SlotKey) {
  if (slot === "shoes") return "Shoes";
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

export default function TodayOutfitCard({
  colors,
  record,
  itemsById,
  onPlanToday,
  onOpenCalendar,
  onAskStylist,
}: {
  colors: AppColors;
  record: DailyOutfitRecord | null;
  itemsById: Map<string, ClothingItem>;
  onPlanToday: () => void;
  onOpenCalendar: () => void;
  onAskStylist: () => void;
}) {
  const layout = useResponsiveLayout();
  const hasPlan = !!record?.plannedOutfit;
  const hasWorn = !!record?.wornOutfit;
  const reasons = record?.plannedOutfit?.reasons?.slice(0, 2) ?? [];
  const slots: SlotKey[] = ["outerwear", "top", "bottom", "shoes"];

  return (
    <View
      style={{
        borderRadius: layout.largeRadius,
        padding: layout.cardPadding,
        backgroundColor: "rgba(255,255,255,0.035)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        gap: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800", letterSpacing: 0.8 }}>
            TODAY’S OUTFIT
          </Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "900" }} numberOfLines={1} ellipsizeMode="tail">
            {hasWorn ? "Already worn" : hasPlan ? "Ready to go" : "Not planned yet"}
          </Text>
        </View>
        <Pressable onPress={onOpenCalendar}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "800" }} numberOfLines={1} ellipsizeMode="tail">
            Open day
          </Text>
        </Pressable>
      </View>

      {hasPlan || hasWorn ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {slots.map((slot) => {
            const item = itemForSlot(record, itemsById, slot);
            const imageUri = item ? getItemImageUrl(item, { variant: "thumb" }) : null;
            return (
              <View key={slot} style={{ flex: 1, gap: 6 }}>
                <View
                  style={{
                    height: 92,
                    borderRadius: layout.mediumRadius,
                    backgroundColor: colors.surface,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 8,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                  ) : null}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "center" }}>
                  {slotLabel(slot)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 22 }} numberOfLines={3} ellipsizeMode="tail">
          Build a look from your wardrobe, save it to today, and come back here when you need it fast.
        </Text>
      )}

      {reasons.length ? (
        <View style={{ gap: 4 }}>
          {reasons.map((reason) => (
            <Text key={reason} style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={2} ellipsizeMode="tail">
              • {reason}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={hasPlan || hasWorn ? onOpenCalendar : onPlanToday}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: layout.mediumRadius,
            paddingVertical: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.accent,
            opacity: pressed ? 0.88 : 1,
          })}
        >
          <Text style={{ color: "#fff", fontWeight: "900" }} numberOfLines={1} ellipsizeMode="tail">
            {hasPlan || hasWorn ? "View in Calendar" : "Plan Today"}
          </Text>
        </Pressable>
        <Pressable
          onPress={onAskStylist}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: layout.mediumRadius,
            paddingVertical: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.05)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1} ellipsizeMode="tail">Ask Stylist</Text>
        </Pressable>
      </View>
    </View>
  );
}
