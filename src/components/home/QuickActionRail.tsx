import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { homeTypography } from "@/src/components/home/homeTypography";
import { ACTION_GAP, CHIP_BORDER_WIDTH, CHIP_HEIGHT, CHIP_HORIZONTAL_PADDING, PILL_RADIUS } from "@/src/constants/auraControls";
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
          borderRadius: layout.largeRadius,
          overflow: "hidden",
          backgroundColor: "rgba(18,18,28,0.76)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          shadowColor: colors.lightPurple,
          shadowOpacity: 0.1,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 12 },
        }}
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.08)", "rgba(124,92,255,0.06)", "rgba(237,233,227,0.024)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 18, paddingVertical: 15, gap: 8 }}
        >
          <Text style={[homeTypography.label, { color: colors.ctaCream, letterSpacing: 0.95, opacity: 0.78 }]}>
            START HERE
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
            <Ionicons name={iconForAction(primaryAction.key, primaryAction.label)} size={17} color={colors.textPrimary} />
            <Text style={[homeTypography.titleSmall, { color: colors.textPrimary }]}>
              {primaryAction.label}
            </Text>
          </View>
        </LinearGradient>
      </AuraPressable>

      {secondaryActions.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ACTION_GAP }}>
          {secondaryActions.map((action) => (
            <AuraPressable
              key={action.key}
              onPress={() => onPressAction(action)}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.96}
              pressedOpacity={0.88}
              style={{
                borderRadius: PILL_RADIUS,
                height: CHIP_HEIGHT,
                minHeight: CHIP_HEIGHT,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: CHIP_HORIZONTAL_PADDING,
                paddingVertical: 0,
                backgroundColor: colors.chipBackground,
                borderWidth: CHIP_BORDER_WIDTH,
                borderColor: "rgba(255,255,255,0.055)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                <Ionicons
                  name={iconForAction(action.key, action.label)}
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={[homeTypography.bodySmall, { color: colors.text, fontSize: 13, fontWeight: "800" }]}>
                  {action.label}
                </Text>
              </View>
            </AuraPressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
