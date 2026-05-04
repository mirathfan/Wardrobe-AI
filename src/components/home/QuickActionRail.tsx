import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { homeTypography } from "@/src/components/home/homeTypography";
import { auraSurfaceTiers } from "@/src/components/ui/auraStylePrimitives";
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
  if (value.includes("dress")) return "diamond-outline";
  if (value.includes("missing")) return "add-circle-outline";
  if (value.includes("unworn")) return "refresh-circle-outline";
  return "arrow-forward-circle-outline";
}

export default function QuickActionRail({
  colors,
  actions,
  onPressAction,
  variant = "featured",
}: {
  colors: AppColors;
  actions: QuickActionItem[];
  onPressAction: (action: QuickActionItem) => void;
  variant?: "featured" | "compact";
}) {
  const layout = useResponsiveLayout();
  const [primaryAction, ...secondaryActions] = actions;

  if (!primaryAction) return null;

  if (variant === "compact") {
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ACTION_GAP }}>
        {actions.map((action) => (
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
              paddingHorizontal: CHIP_HORIZONTAL_PADDING + 2,
              paddingVertical: 0,
              backgroundColor: colors.chipBackground,
              borderWidth: CHIP_BORDER_WIDTH,
              borderColor: "rgba(251,228,216,0.075)",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={iconForAction(action.key, action.label)}
                size={13}
                color={colors.textSecondary}
              />
              <Text style={[homeTypography.bodySmall, { color: colors.textSecondary, fontSize: 13, fontWeight: "800" }]}>
                {action.label}
              </Text>
            </View>
          </AuraPressable>
        ))}
      </View>
    );
  }

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
          ...auraSurfaceTiers.surfaceRaised,
          shadowColor: colors.ctaCream,
          shadowOpacity: 0.035,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 8 },
        }}
      >
        <LinearGradient
          colors={["rgba(251,228,216,0.025)", "rgba(223,182,178,0.04)", "rgba(9,0,11,0.04)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 18, paddingVertical: 15, gap: 8 }}
        >
          <Text style={[homeTypography.label, { color: colors.ctaCream, letterSpacing: 0.95, opacity: 0.78 }]}>
            START HERE
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: ACTION_GAP }}>
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
                borderColor: "rgba(251,228,216,0.075)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: ACTION_GAP }}>
                <Ionicons
                  name={iconForAction(action.key, action.label)}
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={[homeTypography.bodySmall, { color: colors.textSecondary, fontSize: 13, fontWeight: "800" }]}>
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
