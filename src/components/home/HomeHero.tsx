import { LinearGradient } from "expo-linear-gradient";
import FastImage from "@d11/react-native-fast-image";
import React, { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import type { AppColors } from "@/constants/theme";
import { useReduceMotion } from "@/hooks/useReduceMotion";
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

function slotVerb(slot: SlotKey) {
  if (slot === "outerwear") return "Layer";
  if (slot === "top") return "Anchor";
  if (slot === "bottom") return "Ground";
  return "Finish";
}

function IridecentHeroLine({ colors }: { colors: AppColors }) {
  const reduceMotion = useReduceMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    progress.value = reduceMotion
      ? 1
      : withDelay(
          300,
          withTiming(1, {
            duration: 600,
            easing: Easing.out(Easing.cubic),
          }),
        );
  }, [progress, reduceMotion]);

  const lineStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          height: 1,
          overflow: "hidden",
          zIndex: 4,
        },
        lineStyle,
      ]}
    >
      <LinearGradient
        colors={[
          "transparent",
          colors.iridescentStart,
          colors.iridescentEnd,
          "transparent",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

export default function HomeHero({
  colors,
  greeting,
  weatherLabel,
  personalHint,
  stylistNote,
  guidancePhrases,
  record,
  itemsById,
  onPrimaryAction,
  onSecondaryAction,
  onOpenDay,
}: {
  colors: AppColors;
  greeting: string;
  weatherLabel: string;
  personalHint?: string | null;
  stylistNote?: string | null;
  guidancePhrases: string[];
  record: DailyOutfitRecord | null;
  itemsById: Map<string, ClothingItem>;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onOpenDay: () => void;
}) {
  const layout = useResponsiveLayout();
  const hasPlan = !!record?.plannedOutfit;
  const hasWorn = !!record?.wornOutfit;
  const reasons = record?.plannedOutfit?.reasons?.slice(0, 2) ?? [];
  const slots: SlotKey[] = ["outerwear", "top", "bottom", "shoes"];
  const primaryLabel = hasPlan || hasWorn ? "Wear this" : "Style me now";
  const secondaryLabel = hasPlan || hasWorn ? "Fix it" : "3 directions";
  const statusEyebrow = hasWorn ? "ON YOU TODAY" : hasPlan ? "PLANNED FOR TODAY" : "AURA READY";
  const title = hasWorn ? "Today's look is locked." : hasPlan ? "Today's look is ready." : "Your next look starts here.";
  const subtitle = hasWorn
    ? "Everything is already lined up. Reopen the look fast, refine it, or push it in a sharper direction."
    : hasPlan
      ? "A polished outfit is already waiting. Wear it as-is or have AURA tighten the direction."
      : "Open Wardrobe AI like your personal fitting room. Get a wearable look for right now, not another generic plan.";

  const previewSlots = slots
    .map((slot) => ({ slot, item: itemForSlot(record, itemsById, slot) }))
    .filter((entry) => !!entry.item);
  const leadPreview = previewSlots[0] ?? null;
  const secondaryPreview = previewSlots.slice(1, 4);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "700" }} numberOfLines={1} ellipsizeMode="tail">
          {greeting}
        </Text>
        <Text style={{ color: colors.text, fontSize: 34 * layout.titleScale, fontWeight: "900", letterSpacing: -1 }} numberOfLines={1} ellipsizeMode="tail">
          Today&apos;s Look
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }} numberOfLines={1} ellipsizeMode="tail">
          {weatherLabel}
        </Text>
      </View>

      <AuraGlassCard
        iridescentBorder
        warmHero
        intensity={22}
        style={{
          borderRadius: layout.largeRadius,
        }}
      >
        <IridecentHeroLine colors={colors} />
        <LinearGradient
          pointerEvents="none"
          colors={[colors.warmGlow, "transparent", colors.accentSoft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
        <View style={{ minHeight: layout.heroHeight + 28, padding: layout.cardPadding, gap: 18, justifyContent: "space-between" }}>
          <View style={{ gap: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: layout.pillRadius,
                  backgroundColor: "rgba(255,255,255,0.08)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.09)",
                }}
              >
                <Text style={{ color: "#F2E8D1", fontSize: 11, fontWeight: "900", letterSpacing: 0.9 }}>
                  {statusEyebrow}
                </Text>
              </View>
              <Pressable onPress={onOpenDay}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "800" }} numberOfLines={1} ellipsizeMode="tail">
                  Open day
                </Text>
              </Pressable>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.text, fontSize: 30 * layout.titleScale, fontWeight: "900", letterSpacing: -1 }} numberOfLines={2} ellipsizeMode="tail">
                {title}
              </Text>
              <Text style={{ color: colors.textSecondary, opacity: 0.65, fontSize: 14.5, lineHeight: 23 }} numberOfLines={3} ellipsizeMode="tail">
                {subtitle}
              </Text>
              {stylistNote ? (
                <Text style={{ color: "#E6D7B8", fontSize: 12.5, fontWeight: "800" }} numberOfLines={2} ellipsizeMode="tail">
                  {stylistNote}
                </Text>
              ) : null}
            </View>

            {hasPlan || hasWorn ? (
              leadPreview ? (
                <View
                  style={{
                    flexDirection: layout.screenSize === "compact" ? "column" : "row",
                    gap: 10,
                    alignItems: "stretch",
                  }}
                >
                  <View
                    style={{
                      flex: layout.screenSize === "compact" ? undefined : 1.2,
                      minHeight: layout.screenSize === "compact" ? 180 : 208,
                      borderRadius: layout.largeRadius - 4,
                      backgroundColor: "rgba(255,255,255,0.045)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.08)",
                      overflow: "hidden",
                    }}
                  >
                    {(() => {
                      const imageUri = getItemImageUrl(leadPreview.item, { variant: "thumb" });
                      const imagePresentation = getItemImagePresentation(leadPreview.item, {
                        surface: "home_today",
                      });

                      return (
                        <>
                          <LinearGradient
                            pointerEvents="none"
                            colors={["rgba(255,255,255,0.04)", "rgba(255,255,255,0.00)", "rgba(10,10,12,0.30)"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={{ position: "absolute", inset: 0, zIndex: 1 }}
                          />
                          <View
                            style={{
                              position: "absolute",
                              left: 12,
                              top: 12,
                              zIndex: 2,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 999,
                              backgroundColor: "rgba(13,13,16,0.58)",
                              borderWidth: 1,
                              borderColor: "rgba(255,255,255,0.09)",
                            }}
                          >
                            <Text style={{ color: "#F2E8D1", fontSize: 11, fontWeight: "900", letterSpacing: 0.8 }}>
                              {slotVerb(leadPreview.slot)}
                            </Text>
                          </View>
                          <View style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, alignItems: "center", justifyContent: "center" }}>
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
                          <View
                            style={{
                              position: "absolute",
                              left: 14,
                              right: 14,
                              bottom: 12,
                              zIndex: 2,
                            }}
                          >
                            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }} numberOfLines={1} ellipsizeMode="tail">
                              {slotLabel(leadPreview.slot)}
                            </Text>
                          </View>
                        </>
                      );
                    })()}
                  </View>

                  <View style={{ flex: 1, gap: 10 }}>
                    {secondaryPreview.map(({ slot, item }) => {
                      const imageUri = getItemImageUrl(item, { variant: "thumb" });
                      const imagePresentation = getItemImagePresentation(item, {
                        surface: "home_today",
                      });

                      return (
                        <View
                          key={slot}
                          style={{
                            flex: 1,
                            minHeight: 88,
                            borderRadius: layout.mediumRadius,
                            backgroundColor: "rgba(255,255,255,0.04)",
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.07)",
                            overflow: "hidden",
                            flexDirection: "row",
                            alignItems: "center",
                          }}
                        >
                          <View style={{ flex: 0.9, paddingHorizontal: 10, paddingVertical: 10, alignItems: "center", justifyContent: "center" }}>
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
                          <View style={{ flex: 1.1, paddingRight: 12, gap: 4 }}>
                            <Text style={{ color: "#F2E8D1", fontSize: 11, fontWeight: "900", letterSpacing: 0.7 }}>
                              {slotVerb(slot)}
                            </Text>
                            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }} numberOfLines={1}>
                              {slotLabel(slot)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null
            ) : (
              <View style={{ gap: 10, paddingTop: 2 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {guidancePhrases.map((phrase) => (
                    <View
                      key={phrase}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: "rgba(255,255,255,0.055)",
                        borderWidth: 1,
                        borderColor: "rgba(255,255,255,0.08)",
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "800" }}>
                        {phrase}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={{ color: colors.textSecondary, opacity: 0.65, fontSize: 13, lineHeight: 21 }}>
                  AURA can start from what is ready now and push it in a cleaner direction from there.
                </Text>
              </View>
            )}

            {reasons.length ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {reasons.map((reason) => (
                  <View
                    key={reason}
                    style={{
                      paddingHorizontal: 11,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: "rgba(255,255,255,0.05)",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.07)",
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "700" }} numberOfLines={2} ellipsizeMode="tail">
                      {reason}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {personalHint ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 11,
                  paddingVertical: 7,
                  borderRadius: layout.pillRadius,
                  backgroundColor: "rgba(255,255,255,0.045)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.06)",
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 12.5 }} numberOfLines={2} ellipsizeMode="tail">
                  {personalHint}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <AuraGradientButton
              label={primaryLabel}
              onPress={onPrimaryAction}
              gradientColors={[colors.iridescentStart, colors.iridescentEnd]}
              labelColor={colors.background}
              style={{ flex: 1, minHeight: 50, borderRadius: layout.mediumRadius }}
            />
            <Pressable
              onPress={onSecondaryAction}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: layout.mediumRadius,
                paddingVertical: 15,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>{secondaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </AuraGlassCard>
    </View>
  );
}
