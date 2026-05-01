import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { homeTypography } from "@/src/components/home/homeTypography";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export type SmartTool = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  badge?: string;
  onPress: () => void;
};

export default function SmartToolsGrid({
  colors,
  tools,
  columns,
}: {
  colors: AppColors;
  tools: SmartTool[];
  columns?: number;
}) {
  const layout = useResponsiveLayout();
  const gap = 12;
  const preferredColumns = columns ?? layout.smartGridColumns;
  const availableWidth = layout.width - layout.horizontalPadding * 2;
  const minTileWidth = layout.screenSize === "large" ? 168 : 148;
  const maxColumns = Math.max(1, Math.floor((availableWidth + gap) / (minTileWidth + gap)));
  const gridColumns = Math.min(preferredColumns, maxColumns);
  const tileWidth = (availableWidth - gap * (gridColumns - 1)) / gridColumns;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[homeTypography.titleSmall, { color: colors.text }]}>Support tools</Text>
          <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>Secondary</Text>
        </View>
        <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>
          Care, gaps, and planning support when you want to tighten the system around the look.
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {tools.map((tool) => {
          const isSoon = tool.badge === "Soon";
          return (
            <AuraPressable
              key={tool.key}
              onPress={tool.onPress}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.975}
              pressedOpacity={isSoon ? 0.92 : 0.86}
              style={{
                width: tileWidth,
                minHeight: layout.smartToolHeight + (layout.screenSize === "large" ? 10 : 0),
                borderRadius: layout.mediumRadius,
                padding: layout.cardPadding,
                backgroundColor: isSoon ? colors.surfaceSoft : colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isSoon ? 0.9 : 1,
                gap: 12,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.surfaceSoft,
                  }}
                >
                  <MaterialCommunityIcons name={tool.icon} size={22} color={isSoon ? colors.textSecondary : colors.text} />
                </View>
                {tool.badge ? (
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: isSoon ? colors.chipBackground : colors.purpleSurface,
                    }}
                  >
                    <Text style={[homeTypography.label, { color: isSoon ? colors.textSecondary : colors.lightPurple }]} numberOfLines={1} ellipsizeMode="tail">
                      {tool.badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ gap: 4 }}>
                <Text style={[homeTypography.titleSmall, { color: isSoon ? colors.textSecondary : colors.text, fontSize: 16, lineHeight: 21 }]} numberOfLines={1} ellipsizeMode="tail">
                  {tool.title}
                </Text>
                <Text style={[homeTypography.caption, { color: colors.textSecondary, opacity: 0.68 }]} numberOfLines={3} ellipsizeMode="tail">
                  {tool.subtitle}
                </Text>
                <Text style={[homeTypography.caption, { color: isSoon ? colors.textSecondary : colors.text, fontWeight: "600", marginTop: 2 }]} numberOfLines={1}>
                  Open →
                </Text>
              </View>
            </AuraPressable>
          );
        })}
      </View>
    </View>
  );
}
