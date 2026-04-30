import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export type QuickActionItem = {
  key: string;
  label: string;
  prompt: string;
};

function iconForAction(key: string, label: string): keyof typeof Ionicons.glyphMap {
  const value = `${key} ${label}`.toLowerCase();
  if (value.includes("today")) return "sunny-outline";
  if (value.includes("direction")) return "albums-outline";
  if (value.includes("fix")) return "sparkles-outline";
  if (value.includes("missing")) return "add-circle-outline";
  if (value.includes("unworn")) return "refresh-circle-outline";
  return "arrow-forward-circle-outline";
}

export default function QuickActionRail({
  colors,
  actions,
  onPressAction,
}: {
  colors: AppColors;
  actions: QuickActionItem[];
  onPressAction: (action: QuickActionItem) => void;
}) {
  const layout = useResponsiveLayout();
  const [primaryAction, ...secondaryActions] = actions;

  if (!primaryAction) return null;

  return (
    <View style={{ gap: 12 }}>
      <AuraPressable
        onPress={() => onPressAction(primaryAction)}
        haptic="light"
        hapticTrigger="press"
        pressedScale={0.97}
        pressedOpacity={0.9}
        style={{
          borderRadius: layout.mediumRadius,
          overflow: "hidden",
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <LinearGradient
          colors={[colors.primaryPurple, colors.softPurple]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 18, paddingVertical: 15, gap: 6 }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 }}>
            START HERE
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 }}>
            <Ionicons name={iconForAction(primaryAction.key, primaryAction.label)} size={15} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontWeight: "900", fontSize: 16, textAlign: "center" }}>
              {primaryAction.label}
            </Text>
          </View>
        </LinearGradient>
      </AuraPressable>

      {secondaryActions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
          {secondaryActions.map((action) => (
            <AuraPressable
              key={action.key}
              onPress={() => onPressAction(action)}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              style={{
                borderRadius: layout.pillRadius,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: colors.chipBackground,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.055)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <Ionicons
                  name={iconForAction(action.key, action.label)}
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>
                  {action.label}
                </Text>
              </View>
            </AuraPressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
