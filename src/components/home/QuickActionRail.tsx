import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export type QuickActionItem = {
  key: string;
  label: string;
  prompt: string;
};

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
    <View style={{ gap: 10 }}>
      <Pressable
        onPress={() => onPressAction(primaryAction)}
        style={({ pressed }) => ({
          borderRadius: layout.mediumRadius,
          overflow: "hidden",
          backgroundColor: colors.surface2,
          borderWidth: 1,
          borderColor: colors.iridescentMid,
          opacity: pressed ? 0.84 : 1,
        })}
      >
        <LinearGradient
          colors={[colors.iridescentStart, colors.iridescentEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ paddingHorizontal: 16, paddingVertical: 14, gap: 4 }}
        >
          <Text style={{ color: colors.background, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 }}>
            START HERE
          </Text>
          <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>
            {primaryAction.label}
          </Text>
        </LinearGradient>
      </Pressable>

      {secondaryActions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
          {secondaryActions.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => onPressAction(action)}
              style={({ pressed }) => ({
                borderRadius: layout.pillRadius,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: colors.surface2,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.07)",
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: 999,
                    backgroundColor: colors.iridescentStart,
                  }}
                />
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>
                  {action.label}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
