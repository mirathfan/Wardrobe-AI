import { LinearGradient } from "expo-linear-gradient";
import AppImage from "@/src/components/common/AppImage";
import React, { useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
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
import AuraPressable from "@/src/components/aura/AuraPressable";
import { homeTypography } from "@/src/components/home/homeTypography";
import { auraButtonStyle, auraButtonTextStyle, auraSurfaceTiers } from "@/src/components/ui/auraStylePrimitives";
import { ACTION_GAP, CTA_HORIZONTAL_PADDING, HOME_CTA_HEIGHT, PILL_RADIUS } from "@/src/constants/auraControls";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImagePresentation, getItemImageUrl } from "@/src/lib/itemImage";
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
          opacity: 0.2,
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
}) {
  const layout = useResponsiveLayout();
  const hasPlan = !!record?.plannedOutfit;
  const hasWorn = !!record?.wornOutfit;
  const slots: SlotKey[] = ["outerwear", "top", "bottom", "shoes"];
  const previewTileHeight = layout.screenSize === "compact" ? 100 : layout.screenSize === "large" ? 116 : 108;
  const cardPadding = layout.screenSize === "compact" ? 14 : 16;
  const visibleGuidancePhrases = guidancePhrases.slice(0, 2);
  const primaryLabel = "Style me today";
  const secondaryLabel = "Show 3 options";
  const statusEyebrow = hasWorn ? "ON YOU TODAY" : hasPlan ? "PLANNED FOR TODAY" : "AURA READY";
  const title = hasWorn ? "Your outfit is ready." : "Ready when you are.";
  const subtitle = "Your look is set. Wear it now, refine the vibe, or ask AURA for another direction.";

  const previewSlots = slots
    .map((slot) => ({ slot, item: itemForSlot(record, itemsById, slot) }))
    .filter((entry) => !!entry.item);
  const previewEntries = previewSlots.slice(0, 4);

  return (
    <View style={{ gap: HERO_SECTION_GAP }}>
      <View style={{ gap: HERO_TIGHT_GAP }}>
        <Text style={[homeTypography.bodySmall, { color: colors.textSecondary, fontWeight: "700" }]} numberOfLines={1} ellipsizeMode="tail">
          {greeting}
        </Text>
        <Text
          style={[
            homeTypography.titleLarge,
            {
              color: colors.text,
              fontSize: 34 * layout.titleScale,
              lineHeight: 40 * layout.titleScale,
            },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          Today&apos;s Look
        </Text>
        <Text style={[homeTypography.bodySmall, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
          {weatherLabel}
        </Text>
      </View>

      <AuraGlassCard
        warmHero
        intensity={36}
        style={{
          borderRadius: layout.largeRadius,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 18 },
        }}
        contentStyle={{
          backgroundColor: "rgba(9,0,11,0.34)",
          borderColor: "rgba(251,228,216,0.05)",
          borderWidth: 1,
        }}
      >
        <IridecentHeroLine colors={colors} />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(251,228,216,0.040)", "rgba(82,43,91,0.024)", "rgba(9,0,11,0.12)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.060)", "rgba(251,228,216,0.010)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 88, opacity: 0.36 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.050)", "rgba(251,228,216,0.010)", "transparent"]}
          start={{ x: 0.05, y: 0.15 }}
          end={{ x: 0.95, y: 0.9 }}
          style={{ position: "absolute", inset: 0, opacity: 0.28 }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 1,
            left: 18,
            right: 18,
            height: 1,
            backgroundColor: "rgba(251,228,216,0.05)",
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
            backgroundColor: "rgba(251,228,216,0.04)",
          }}
        />
        <View style={{ minHeight: layout.heroHeight + 4, padding: cardPadding, gap: HERO_CARD_GAP, justifyContent: "space-between" }}>
          <View style={{ gap: HERO_STACK_GAP }}>
            <Text style={[homeTypography.label, { color: colors.lightPurple, opacity: 0.7, fontSize: 11.5, lineHeight: 15, letterSpacing: 1.2 }]}>
              {statusEyebrow}
            </Text>

            <View style={{ gap: HERO_TIGHT_GAP }}>
              <Text
                style={[
                  homeTypography.titleMedium,
                  {
                    color: colors.text,
                    fontSize: 30 * layout.titleScale,
                    lineHeight: 36 * layout.titleScale,
                  },
                ]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {title}
              </Text>
              <Text style={[homeTypography.body, { color: colors.textSecondary, opacity: 0.76 }]} numberOfLines={2} ellipsizeMode="tail">
                {subtitle}
              </Text>
              {stylistNote ? (
                <Text style={[homeTypography.accentNote, { color: colors.lightPurple, opacity: 0.74 }]} numberOfLines={1} ellipsizeMode="tail">
                  {stylistNote}
                </Text>
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
                    const imageUri = getItemImageUrl(item, { variant: "thumb" });
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
                          colors={["rgba(255,255,255,0.10)", "rgba(251,228,216,0.00)", "rgba(25,0,25,0.05)"]}
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
                      <Text style={[homeTypography.chipText, { color: colors.text }]}>
                        {phrase}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text style={[homeTypography.caption, { color: colors.textSecondary, opacity: 0.82 }]} numberOfLines={1}>
                  AURA starts with what is wearable now.
                </Text>
              </View>
            )}

            {personalHint ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  borderRadius: layout.pillRadius,
                  ...auraSurfaceTiers.surfaceInteractive,
                }}
              >
                <Text style={[homeTypography.caption, { color: colors.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                  {personalHint}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: ACTION_GAP, alignItems: "stretch" }}>
            <View style={{ flex: 1 }}>
              <AuraGradientButton
                label={primaryLabel}
                onPress={onPrimaryAction}
                gradientColors={[colors.ctaCream, colors.ctaCream]}
                labelColor={colors.ctaText}
                innerBackgroundColor={colors.ctaCream}
                innerOverlayColors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)"]}
                labelStyle={{ fontSize: 16.5, lineHeight: 21, fontWeight: "900" }}
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
            <AuraPressable
              onPress={onSecondaryAction}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.97}
              pressedOpacity={0.9}
              containerStyle={{ flex: 1 }}
              style={{
                ...auraButtonStyle(colors, "secondary"),
                borderRadius: PILL_RADIUS,
                height: HOME_CTA_HEIGHT,
                minHeight: HOME_CTA_HEIGHT,
                paddingHorizontal: CTA_HORIZONTAL_PADDING,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(9,0,11,0.22)",
                borderWidth: 1,
                borderColor: "rgba(251,228,216,0.20)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Ionicons name="git-branch-outline" size={15} color={colors.text} />
                <Text style={auraButtonTextStyle(colors, "secondary")} numberOfLines={1}>
                  {secondaryLabel}
                </Text>
              </View>
            </AuraPressable>
          </View>
        </View>
      </AuraGlassCard>
    </View>
  );
}
