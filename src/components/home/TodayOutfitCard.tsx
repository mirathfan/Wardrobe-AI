import AppImage from "@/src/components/common/AppImage";
import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraGlassCard from "@/src/components/aura/AuraGlassCard";
import AuraGradientButton from "@/src/components/aura/AuraGradientButton";
import { homeTypography } from "@/src/components/home/homeTypography";
import { auraButtonStyle, auraButtonTextStyle } from "@/src/components/ui/auraStylePrimitives";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImagePresentation } from "@/src/lib/itemImage";
import { logResolvedItemImageLoadFailure, resolveItemImage } from "@/src/lib/resolveItemImage";
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
          <Text style={[homeTypography.label, { color: colors.textSecondary }]}>
            TODAY’S OUTFIT
          </Text>
          <Text style={[homeTypography.titleMedium, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
            {hasWorn ? "Already worn" : hasPlan ? "Ready to go" : "Not planned yet"}
          </Text>
        </View>
        <Pressable onPress={onOpenCalendar}>
          <Text style={[homeTypography.caption, { color: colors.textSecondary, fontWeight: "600" }]} numberOfLines={1} ellipsizeMode="tail">
            Open day
          </Text>
        </Pressable>
      </View>

      {hasPlan || hasWorn ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          {slots.map((slot) => {
            const item = itemForSlot(record, itemsById, slot);
            const resolvedImage = item ? resolveItemImage(item, { variant: "thumb", surface: "home_today" }) : null;
            const imageUri = resolvedImage?.uri ?? null;
            const imagePresentation = getItemImagePresentation(item, {
              surface: "home_today",
            });
            return (
              <View key={slot} style={{ flex: 1, gap: 6 }}>
                <View
                  style={{
                    height: 92,
                    borderRadius: layout.mediumRadius,
                    backgroundColor: colors.boardLight,
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 8,
                    borderWidth: 1,
                    borderColor: colors.borderWarm,
                  }}
                >
                  {imageUri ? (
                    <AppImage
                      source={{
                        uri: imageUri,
                      }}
                      style={[{ width: "100%", height: "100%" }, imagePresentation.imageStyle]}
                      resizeMode="contain"
                      onError={() =>
                        resolvedImage ? logResolvedItemImageLoadFailure(resolvedImage) : undefined
                      }
                    />
                  ) : null}
                </View>
                <Text style={[homeTypography.caption, { color: colors.textSecondary, textAlign: "center" }]}>
                  {slotLabel(slot)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={[homeTypography.body, { color: colors.textSecondary }]} numberOfLines={3} ellipsizeMode="tail">
          Build a look from your wardrobe, save it to today, and come back here when you need it fast.
        </Text>
      )}

      {reasons.length ? (
        <View style={{ gap: 4 }}>
          {reasons.map((reason) => (
            <Text key={reason} style={[homeTypography.bodySmall, { color: colors.textSecondary }]} numberOfLines={2} ellipsizeMode="tail">
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
            ...auraButtonStyle(colors, "secondary"),
            flex: 1,
            borderRadius: layout.mediumRadius,
            paddingVertical: 13,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={auraButtonTextStyle(colors, "secondary")} numberOfLines={1} ellipsizeMode="tail">Ask Stylist</Text>
        </Pressable>
      </View>
      </View>
    </AuraGlassCard>
  );
}
