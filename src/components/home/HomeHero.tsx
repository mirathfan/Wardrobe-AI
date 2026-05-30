import { LinearGradient } from "expo-linear-gradient";
import AppImage from "@/src/components/common/AppImage";
import React, { useEffect } from "react";
import { View } from "react-native";
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
import { homeTypography } from "@/src/components/home/homeTypography";
import { AuraText } from "@/src/components/ui/auraStylePrimitives";
import { ACTION_GAP, HOME_CTA_HEIGHT, PILL_RADIUS } from "@/src/constants/auraControls";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImagePresentation } from "@/src/lib/itemImage";
import { logResolvedItemImageLoadFailure, resolveItemImage } from "@/src/lib/resolveItemImage";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { DailyOutfitRecord } from "@/src/utils/dailyOutfits";

type SlotKey = "outerwear" | "top" | "bottom" | "shoes";

const HERO_SECTION_GAP = 16;
const HERO_CARD_GAP = 12;
const HERO_STACK_GAP = 10;
const HERO_TIGHT_GAP = 8;

function itemForSlot(record: DailyOutfitRecord | null, itemsById: Map<string, ClothingItem>, slot: SlotKey) {
  const itemId = record?.plannedOutfit?.itemsByCategory?.[slot] ?? record?.wornOutfit?.itemsByCategory?.[slot] ?? null;
  return itemId ? itemsById.get(itemId) ?? null : null;
}

function previewImageFrame(slot: SlotKey) {
  if (slot === "outerwear") return { width: "94%" as const, height: "92%" as const };
  if (slot === "shoes") return { width: "84%" as const, height: "76%" as const };
  if (slot === "bottom") return { width: "92%" as const, height: "94%" as const };
  return { width: "94%" as const, height: "92%" as const };
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
          opacity: 0.16,
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
  onWearToday,
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
  onWearToday?: () => void;
}) {
  const layout = useResponsiveLayout();
  const hasPlan = !!record?.plannedOutfit;
  const hasWorn = !!record?.wornOutfit;
  const slots: SlotKey[] = ["outerwear", "top", "bottom", "shoes"];
  const previewTileHeight = layout.screenSize === "compact" ? 100 : layout.screenSize === "large" ? 116 : 108;
  const cardPadding = layout.screenSize === "compact" ? 14 : 16;
  const visibleGuidancePhrases = guidancePhrases.slice(0, 1);
  const canWearPlannedLook = hasPlan && !hasWorn && !!onWearToday;
  const primaryLabel = canWearPlannedLook ? "Wear this today" : "Style me today";
  const statusEyebrow = hasWorn ? "ON YOU TODAY" : hasPlan ? "PLANNED FOR TODAY" : "AURA READY";
  const title = hasWorn || hasPlan ? "Your outfit is ready." : "Ready when you are.";
  const subtitle =
    hasWorn || hasPlan
      ? "Wear it, or ask AURA for a new direction when the mood changes."
      : "Start with one strong outfit built from what is wearable now.";

  const previewSlots = slots
    .map((slot) => ({ slot, item: itemForSlot(record, itemsById, slot) }))
    .filter((entry) => !!entry.item);
  const previewEntries = previewSlots.slice(0, 4);

  return (
    <View style={{ gap: HERO_SECTION_GAP }}>
      <View style={{ gap: HERO_TIGHT_GAP }}>
        <AuraText variant="caption" tone="secondary" style={[homeTypography.bodySmall, { fontWeight: "500", opacity: 0.88 }]} numberOfLines={1} ellipsizeMode="tail">
          {greeting}
        </AuraText>
        <AuraText
          variant="title"
          style={[
            homeTypography.titleLarge,
            {
              fontSize: 34 * layout.titleScale,
              lineHeight: 40 * layout.titleScale,
            },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          Today&apos;s Look
        </AuraText>
        <AuraText variant="caption" tone="secondary" style={homeTypography.bodySmall} numberOfLines={1} ellipsizeMode="tail">
          {weatherLabel}
        </AuraText>
      </View>

      <AuraGlassCard
        warmHero
        intensity={29}
        style={{
          borderRadius: layout.largeRadius,
          shadowColor: "#000",
          shadowOpacity: 0.14,
          shadowRadius: 19,
          shadowOffset: { width: 0, height: 14 },
        }}
        contentStyle={{
          backgroundColor: colors.surface,
          borderColor: "rgba(251,228,216,0.035)",
          borderWidth: 1,
        }}
      >
        <IridecentHeroLine colors={colors} />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(251,228,216,0.030)", "rgba(34,31,40,0.025)", "rgba(9,8,10,0.12)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.060)", "rgba(251,228,216,0.010)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 88, opacity: 0.28 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.050)", "rgba(251,228,216,0.010)", "transparent"]}
          start={{ x: 0.05, y: 0.15 }}
          end={{ x: 0.95, y: 0.9 }}
          style={{ position: "absolute", inset: 0, opacity: 0.22 }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 1,
            left: 18,
            right: 18,
            height: 1,
            backgroundColor: "rgba(251,228,216,0.04)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 18,
            bottom: 18,
            left: 1,
            width: 1,
            backgroundColor: "rgba(251,228,216,0.03)",
          }}
        />
        <View style={{ minHeight: layout.heroHeight + 4, padding: cardPadding, gap: HERO_CARD_GAP, justifyContent: "space-between" }}>
          <View style={{ gap: HERO_STACK_GAP }}>
            <AuraText variant="metadata" tone="accent" style={[homeTypography.label, { opacity: 0.7, fontSize: 11.5, lineHeight: 15, letterSpacing: 1.2 }]}>
              {statusEyebrow}
            </AuraText>

            <View style={{ gap: HERO_TIGHT_GAP }}>
              <AuraText
                variant="title"
                style={[
                  homeTypography.titleMedium,
                  {
                    fontSize: 30 * layout.titleScale,
                    lineHeight: 36 * layout.titleScale,
                  },
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {title}
              </AuraText>
              <AuraText variant="body" tone="secondary" style={[homeTypography.body, { opacity: 0.8 }]} numberOfLines={2} ellipsizeMode="tail">
                {subtitle}
              </AuraText>
              {stylistNote ? (
                <AuraText variant="caption" tone="accent" style={[homeTypography.accentNote, { opacity: 0.72 }]} numberOfLines={1} ellipsizeMode="tail">
                  {stylistNote}
                </AuraText>
              ) : null}
            </View>

            {hasPlan || hasWorn ? (
              previewEntries.length ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: HERO_TIGHT_GAP,
                  }}
                >
                  {previewEntries.map(({ slot, item }) => {
                    const resolvedImage = resolveItemImage(item, { variant: "thumb", surface: "home_today" });
                    const imageUri = resolvedImage.uri;
                    const imagePresentation = getItemImagePresentation(item, {
                      surface: "home_today",
                    });
                    return (
                      <View
                        key={slot}
                        style={{
                          flexBasis: "47.5%",
                          flexGrow: 1,
                          minHeight: previewTileHeight,
                          borderRadius: layout.mediumRadius,
                          backgroundColor: colors.boardLight,
                          borderWidth: 1,
                          borderColor: colors.borderWarm,
                          overflow: "hidden",
                          padding: HERO_TIGHT_GAP,
                        }}
                      >
                        <LinearGradient
                          pointerEvents="none"
                          colors={["rgba(255,255,255,0.10)", "rgba(251,228,216,0.00)", "rgba(17,16,20,0.05)"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                          style={{ position: "absolute", inset: 0 }}
                        />
                        <View style={{ flex: 1, paddingHorizontal: 2, alignItems: "center", justifyContent: "center" }}>
                          {imageUri ? (
                            <AppImage
                              source={{
                                uri: imageUri,
                              }}
                              style={[previewImageFrame(slot), imagePresentation.imageStyle]}
                              resizeMode="contain"
                              onError={() => logResolvedItemImageLoadFailure(resolvedImage)}
                            />
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null
            ) : (
              <View style={{ gap: HERO_TIGHT_GAP }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: HERO_TIGHT_GAP }}>
                  {visibleGuidancePhrases.map((phrase) => (
                    <View
                      key={phrase}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: colors.chipBackground,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <AuraText variant="caption" style={homeTypography.chipText}>
                        {phrase}
                      </AuraText>
                    </View>
                  ))}
                </View>
                <AuraText variant="caption" tone="secondary" style={[homeTypography.caption, { opacity: 0.86 }]} numberOfLines={1}>
                  AURA starts with what is wearable now.
                </AuraText>
              </View>
            )}

            {personalHint ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  borderRadius: layout.pillRadius,
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.borderSoft,
                  borderWidth: 1,
                }}
              >
                <AuraText variant="caption" tone="secondary" style={homeTypography.caption} numberOfLines={1} ellipsizeMode="tail">
                  {personalHint}
                </AuraText>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: ACTION_GAP, alignItems: "stretch" }}>
            <View style={{ flex: 1 }}>
              <AuraGradientButton
                label={primaryLabel}
                onPress={canWearPlannedLook ? onWearToday : onPrimaryAction}
                gradientColors={[colors.ctaCream, colors.ctaCream]}
                labelColor={colors.ctaText}
                innerBackgroundColor={colors.ctaCream}
                innerOverlayColors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)"]}
                labelStyle={{ fontSize: 16.5, lineHeight: 21, fontWeight: "600", letterSpacing: 0.1 }}
                style={{
                  height: HOME_CTA_HEIGHT,
                  minHeight: HOME_CTA_HEIGHT,
                  borderRadius: PILL_RADIUS,
                  shadowOpacity: 0.055,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 5 },
                }}
              />
            </View>
          </View>
        </View>
      </AuraGlassCard>
    </View>
  );
}
