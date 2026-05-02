import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, Text, View } from "react-native";

import { Fonts, type AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

import AuraOrb from "./AuraOrb";
import { auraTheme } from "./aiTheme";

export default function AuraHeader({
  colors,
  recentThreadsCount,
  onOpenRecent,
  onReset,
  orbScale,
  orbGlow,
  activityGlow,
  streaming,
}: {
  colors: AppColors;
  recentThreadsCount: number;
  onOpenRecent: () => void;
  onReset: () => void;
  orbScale: Animated.AnimatedInterpolation<number>;
  orbGlow: Animated.AnimatedInterpolation<number>;
  activityGlow: Animated.AnimatedInterpolation<number>;
  streaming: boolean;
}) {
  const layout = useResponsiveLayout();

  return (
    <View
      style={{
        paddingHorizontal: layout.horizontalPadding,
        paddingTop: 0,
        paddingBottom: 0,
      }}
    >
      <View
        style={{
          minHeight: 32,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <HeaderAction
          colors={colors}
          icon="time-outline"
          label={recentThreadsCount ? "Recent" : "History"}
          onPress={onOpenRecent}
        />
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <AuraOrb scale={orbScale} glow={orbGlow} activityGlow={activityGlow} />
            <Text
              style={{
                color: streaming ? auraTheme.accentStrong : colors.text,
                fontSize: 12.5 * layout.titleScale,
                lineHeight: 15 * layout.titleScale,
                fontWeight: "600",
                letterSpacing: 2.4,
                fontFamily: Fonts.sans,
              }}
            >
              AURA
            </Text>
          </View>
        </View>
        <HeaderAction colors={colors} icon="create-outline" label="New chat" onPress={onReset} />
      </View>
    </View>
  );
}

function HeaderAction({
  colors,
  icon,
  label,
  onPress,
}: {
  colors: AppColors;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        paddingHorizontal: 9,
        paddingVertical: 6,
        backgroundColor: pressed ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.015)",
        borderWidth: 1,
        borderColor: auraTheme.borderSoft,
      })}
    >
      <Ionicons name={icon} size={13} color={colors.textSecondary} />
      <Text
        style={{
          color: auraTheme.textMuted,
          fontSize: 11,
          fontWeight: "600",
          fontFamily: Fonts.sans,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
