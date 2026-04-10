import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export default function HomeHero({
  colors,
  greeting,
  weatherLabel,
  personalHint,
  onAskStylist,
  onPlanToday,
}: {
  colors: AppColors;
  greeting: string;
  weatherLabel: string;
  personalHint?: string | null;
  onAskStylist: () => void;
  onPlanToday: () => void;
}) {
  const layout = useResponsiveLayout();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "700" }} numberOfLines={1} ellipsizeMode="tail">
          {greeting}
        </Text>
        <Text style={{ color: colors.text, fontSize: 34 * layout.titleScale, fontWeight: "900", letterSpacing: -1.2 }} numberOfLines={1} ellipsizeMode="tail">
          Home
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14 }} numberOfLines={1} ellipsizeMode="tail">
          {weatherLabel}
        </Text>
      </View>

      <BlurView
        intensity={22}
        tint="dark"
        style={{
          borderRadius: layout.largeRadius,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.03)",
        }}
      >
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(102,120,168,0.24)", "rgba(32,36,46,0.06)", "rgba(214,197,161,0.10)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
        <View style={{ minHeight: layout.heroHeight, padding: layout.cardPadding, gap: 16, justifyContent: "space-between" }}>
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 28 * layout.titleScale, fontWeight: "900", letterSpacing: -1 }} numberOfLines={2} ellipsizeMode="tail">
              Your wardrobe, ready for today.
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }} numberOfLines={3} ellipsizeMode="tail">
              Start with what you should wear now, then branch into planning, care, and wardrobe tools.
            </Text>
            {personalHint ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  marginTop: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: layout.pillRadius,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.07)",
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 12.5 }} numberOfLines={2} ellipsizeMode="tail">
                  {personalHint}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={onAskStylist}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: layout.mediumRadius,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.accent,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "900" }}>Ask Stylist</Text>
            </Pressable>
            <Pressable
              onPress={onPlanToday}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: layout.mediumRadius,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.05)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "900" }}>Plan Today</Text>
            </Pressable>
          </View>
        </View>
      </BlurView>
    </View>
  );
}
