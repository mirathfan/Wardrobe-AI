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
import { ACTION_GAP, CTA_HEIGHT, CTA_HORIZONTAL_PADDING, PILL_RADIUS } from "@/src/constants/auraControls";
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

function previewImageFrame(slot: SlotKey) {
  if (slot === "outerwear") return { width: "108%" as const, height: "104%" as const };
  if (slot === "shoes") return { width: "84%" as const, height: "76%" as const };
  return { width: "106%" as const, height: "102%" as const };
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
  const previewTileHeight = layout.screenSize === "compact" ? 104 : layout.screenSize === "large" ? 120 : 112;
  const cardPadding = layout.screenSize === "compact" ? 16 : 18;
  const visibleGuidancePhrases = guidancePhrases.slice(0, 2);
  const primaryLabel = "Style me now";
  const secondaryLabel = "3 directions";
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
  const previewEntries = previewSlots.slice(0, 4);

  return (
      <View style={{ gap: 12 }}>
      <View style={{ gap: 7 }}>
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
          intensity={34}
          style={{
            borderRadius: layout.largeRadius,
            shadowColor: colors.lightPurple,
            shadowOpacity: 0.16,
            shadowRadius: 34,
            shadowOffset: { width: 0, height: 18 },
          }}
          contentStyle={{
            backgroundColor: "rgba(18,18,28,0.74)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
          }}
        >
        <IridecentHeroLine colors={colors} />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(124,92,255,0.12)", "rgba(255,255,255,0.025)", "rgba(18,18,28,0.02)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(255,255,255,0.12)", "rgba(255,255,255,0.02)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 72, opacity: 0.48 }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 1,
            left: 18,
            right: 18,
            height: 1,
            backgroundColor: "rgba(255,255,255,0.12)",
          }}
        />
        <View style={{ minHeight: layout.heroHeight + 18, padding: cardPadding, gap: 18, justifyContent: "space-between" }}>
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: layout.pillRadius,
                  backgroundColor: colors.chipBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text style={[homeTypography.label, { color: colors.lightPurple, opacity: 0.7 }]}>
                  {statusEyebrow}
                </Text>
              </View>
            </View>

            <View style={{ gap: 8 }}>
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
                    gap: 10,
                  }}
                >
                  {previewEntries.map(({ slot, item }) => {
                      const imageUri = getItemImageUrl(item, { variant: "thumb" });
                      const imagePresentation = getItemImagePresentation(item, {
                        surface: "home_today",
                      });
                      const featured = slot === "outerwear";

                      return (
                        <View
                          key={slot}
                          style={{
                            flexBasis: "47.5%",
                            flexGrow: 1,
                            minHeight: previewTileHeight,
                            borderRadius: layout.mediumRadius,
                            backgroundColor: featured ? colors.surface : colors.surfaceSoft,
                            borderWidth: 1,
                            borderColor: featured ? colors.borderStrong : colors.border,
                            overflow: "hidden",
                          }}
                        >
                          <LinearGradient
                            pointerEvents="none"
                            colors={["rgba(255,255,255,0.04)", "rgba(255,255,255,0.00)", "rgba(0,0,0,0.10)"]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                            style={{ position: "absolute", inset: 0 }}
                          />
                          <View
                            style={{
                              position: "absolute",
                              left: 10,
                              top: 9,
                              zIndex: 2,
                              paddingHorizontal: 9,
                              paddingVertical: 4,
                              borderRadius: 999,
                              backgroundColor: colors.dockBackground,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
                          >
                            <Text style={[homeTypography.label, { color: featured ? colors.lightPurple : colors.textSecondary, opacity: featured ? 0.78 : 0.72 }]}>
                              {slotVerb(slot)}
                            </Text>
                          </View>
                          <View style={{ flex: 1, paddingHorizontal: 0, paddingTop: 20, paddingBottom: 14, alignItems: "center", justifyContent: "center" }}>
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
                          <View style={{ position: "absolute", left: 12, right: 12, bottom: 10 }}>
                            <Text style={[homeTypography.slotTitle, { color: colors.text }]} numberOfLines={1}>
                              {slotLabel(slot)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                </View>
              ) : null
            ) : (
              <View style={{ gap: 8, paddingTop: 1 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
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
                  backgroundColor: colors.surfaceSoft,
                  borderWidth: 1,
                  borderColor: colors.border,
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
                style={{ minHeight: CTA_HEIGHT, borderRadius: PILL_RADIUS }}
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
                borderRadius: PILL_RADIUS,
                minHeight: CTA_HEIGHT,
                paddingHorizontal: CTA_HORIZONTAL_PADDING,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surfaceSoft,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <Ionicons name="git-branch-outline" size={15} color={colors.text} />
                <Text style={[homeTypography.buttonText, { color: colors.text, textAlign: "center" }]} numberOfLines={1}>
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
