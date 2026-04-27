import FastImage from "@d11/react-native-fast-image";
import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraGlassCard from "@/src/components/aura/AuraGlassCard";
import AuraGradientButton from "@/src/components/aura/AuraGradientButton";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImagePresentation, getItemImageUrl } from "@/src/lib/itemImage";
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
    <AuraGlassCard
      auraBorder
      style={{
        borderRadius: layout.largeRadius,
        gap: 16,
      }}
    >
      <View style={{ padding: layout.cardPadding, gap: 16 }}>
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
            const imagePresentation = getItemImagePresentation(item, {
              surface: "home_today",
            });
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
                    <FastImage
                      source={{
                        uri: imageUri,
                        priority: FastImage.priority.normal,
                        cache: FastImage.cacheControl.immutable,
                      }}
                      style={[{ width: "100%", height: "100%" }, imagePresentation.imageStyle]}
                      resizeMode={FastImage.resizeMode.contain}
                    />
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
        <View style={{ flex: 1 }}>
          <AuraGradientButton
            label={hasPlan || hasWorn ? "View in Calendar" : "Plan Today"}
            onPress={hasPlan || hasWorn ? onOpenCalendar : onPlanToday}
          />
        </View>
        <Pressable
          onPress={onAskStylist}
          style={({ pressed }) => ({
            flex: 1,
            borderRadius: layout.mediumRadius,
            paddingVertical: 13,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(255,255,255,0.04)",
            borderWidth: 1,
            borderColor: "rgba(243,223,195,0.14)",
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontWeight: "900" }} numberOfLines={1} ellipsizeMode="tail">Ask Stylist</Text>
        </Pressable>
      </View>
      </View>
    </AuraGlassCard>
  );
}
