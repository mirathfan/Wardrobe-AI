import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { AuraIconButton, AuraText } from "@/src/components/ui/auraStylePrimitives";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

import { auraTheme } from "./aiTheme";

export default function AuraHeader({
  colors,
  recentThreadsCount,
  onOpenRecent,
  onReset,
  streaming,
}: {
  colors: AppColors;
  recentThreadsCount: number;
  onOpenRecent: () => void;
  onReset: () => void;
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
          minHeight: 30,
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
              gap: 7,
            }}
          >
            <View
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                backgroundColor: streaming ? auraTheme.accentStrong : colors.textSecondary,
                opacity: streaming ? 1 : 0.62,
              }}
            />
            <AuraText
              variant="metadata"
              style={{
                color: streaming ? auraTheme.accentStrong : colors.text,
                fontSize: 12 * layout.titleScale,
                lineHeight: 14 * layout.titleScale,
                fontWeight: "500",
                letterSpacing: 1.75,
              }}
            >
              AURA
            </AuraText>
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
    <AuraIconButton
      icon={icon}
      label={label}
      onPress={onPress}
      variant="tertiary"
      size="small"
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.96}
      pressedOpacity={0.88}
      accessibilityLabel={label}
      style={{
        width: 32,
        height: 32,
        backgroundColor: colors.surfaceGlass,
        borderWidth: 1,
        borderColor: colors.borderSoft,
      }}
    />
  );
}
