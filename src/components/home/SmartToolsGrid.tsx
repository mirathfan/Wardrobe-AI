import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
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
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>Support tools</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}>Secondary</Text>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 12.5 }}>
          Care, gaps, and planning support when you want to tighten the system around the look.
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
        {tools.map((tool) => {
          const isSoon = tool.badge === "Soon";
          return (
            <Pressable
              key={tool.key}
              onPress={tool.onPress}
              style={({ pressed }) => ({
                width: tileWidth,
                minHeight: layout.smartToolHeight + (layout.screenSize === "large" ? 10 : 0),
                borderRadius: layout.mediumRadius,
                padding: layout.cardPadding,
                backgroundColor: isSoon ? colors.surfaceSoft : colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? (isSoon ? 0.92 : 0.84) : isSoon ? 0.9 : 1,
                gap: 12,
              })}
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
                    <Text style={{ color: isSoon ? colors.textSecondary : colors.lightPurple, fontSize: 11, fontWeight: "800" }} numberOfLines={1} ellipsizeMode="tail">
                      {tool.badge}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ gap: 4 }}>
                <Text style={{ color: isSoon ? colors.textSecondary : colors.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1} ellipsizeMode="tail">
                  {tool.title}
                </Text>
                <Text style={{ color: colors.textSecondary, opacity: 0.55, fontSize: 12, lineHeight: 20 }} numberOfLines={3} ellipsizeMode="tail">
                  {tool.subtitle}
                </Text>
                <Text style={{ color: isSoon ? colors.textSecondary : colors.text, fontSize: 11.5, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>
                  Open →
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
