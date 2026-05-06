import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { homeTypography } from "@/src/components/home/homeTypography";
import { AuraText } from "@/src/components/ui/auraStylePrimitives";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export type SmartTool = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  badge?: string;
  onPress: () => void;
};

const GRID_GAP = 12;
const HEADER_GAP = 4;
const TILE_GAP = 8;
const COMPACT_GRID_COLUMNS = 3;

export default function SmartToolsGrid({
  colors,
  tools,
  columns,
  compact = false,
}: {
  colors: AppColors;
  tools: SmartTool[];
  columns?: number;
  compact?: boolean;
}) {
  const layout = useResponsiveLayout();
  const preferredColumns = columns ?? layout.smartGridColumns;
  const availableWidth = layout.width - layout.horizontalPadding * 2;
  const minTileWidth = layout.screenSize === "large" ? 168 : 148;
  const maxColumns = Math.max(1, Math.floor((availableWidth + GRID_GAP) / (minTileWidth + GRID_GAP)));
  const gridColumns = Math.min(preferredColumns, maxColumns);
  const tileWidth = (availableWidth - GRID_GAP * (gridColumns - 1)) / gridColumns;
  const tileHeight = compact
    ? layout.screenSize === "compact" ? 82 : layout.screenSize === "large" ? 94 : 88
    : layout.smartToolHeight +
      (layout.screenSize === "compact" ? 40 : layout.screenSize === "large" ? 44 : 38);
  const compactRows = React.useMemo(() => {
    if (!compact) return [];
    const rows: SmartTool[][] = [];
    for (let index = 0; index < tools.length; index += COMPACT_GRID_COLUMNS) {
      rows.push(tools.slice(index, index + COMPACT_GRID_COLUMNS));
    }
    return rows;
  }, [compact, tools]);

  const renderTool = (tool: SmartTool) => {
    const isSoon = tool.badge === "Soon";
    return (
      <AuraPressable
        key={tool.key}
        onPress={tool.onPress}
        haptic="selection"
        hapticTrigger="press"
        pressedScale={0.975}
        pressedOpacity={isSoon ? 0.92 : 0.86}
        containerStyle={
          compact
            ? { flex: 1, height: tileHeight, minWidth: 0 }
            : { width: tileWidth, height: tileHeight }
        }
        style={{
          flex: 1,
          borderRadius: compact ? 18 : layout.mediumRadius,
          padding: compact ? 8 : layout.cardPadding,
          backgroundColor: compact ? "transparent" : colors.surface,
          borderWidth: compact ? 0 : 1,
          borderColor: compact ? "transparent" : colors.border,
          opacity: isSoon ? 0.9 : 1,
          justifyContent: "center",
          alignItems: compact ? "center" : "stretch",
          gap: compact ? TILE_GAP : 0,
        }}
      >
        <View style={{ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: compact ? "center" : "space-between" }}>
          <View
            style={{
              width: compact ? 42 : 38,
              height: compact ? 42 : 38,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: compact ? colors.chipBackground : colors.surfaceSoft,
              borderWidth: compact ? 0.75 : 1,
              borderColor: colors.borderSoft,
            }}
          >
            <MaterialCommunityIcons name={tool.icon} size={compact ? 30 : 22} color={isSoon ? colors.textSecondary : colors.text} />
          </View>
          {tool.badge && !compact ? (
            <View
              style={{
                paddingHorizontal: compact ? 7 : 8,
                paddingVertical: compact ? 3 : 4,
                borderRadius: 999,
                backgroundColor: isSoon ? colors.chipBackground : colors.purpleSurface,
                borderWidth: 1,
                borderColor: isSoon ? colors.border : colors.purpleBorder,
              }}
            >
              <AuraText variant="metadata" tone={isSoon ? "secondary" : "accent"} style={homeTypography.label} numberOfLines={1} ellipsizeMode="tail">
                {tool.badge}
              </AuraText>
            </View>
          ) : null}
        </View>
        <View style={{ gap: compact ? 0 : 4, alignItems: compact ? "center" : "flex-start" }}>
          <AuraText
            variant="section"
            tone={isSoon ? "secondary" : "primary"}
            style={[homeTypography.titleSmall, { fontSize: compact ? 12.5 : 16, lineHeight: compact ? 16 : 21, textAlign: compact ? "center" : "left" }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {tool.title}
          </AuraText>
          {compact ? null : (
            <>
              <AuraText variant="caption" tone="secondary" style={[homeTypography.caption, { opacity: 0.68 }]} numberOfLines={2} ellipsizeMode="tail">
                {tool.subtitle}
              </AuraText>
              <AuraText variant="caption" tone={isSoon ? "secondary" : "primary"} style={[homeTypography.caption, { fontWeight: "500", marginTop: 2 }]} numberOfLines={1}>
                Open →
              </AuraText>
            </>
          )}
        </View>
      </AuraPressable>
    );
  };

  return (
    <View style={{ gap: compact ? GRID_GAP : 16 }}>
      <View style={{ gap: HEADER_GAP }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AuraText variant="section" style={homeTypography.titleSmall}>Support tools</AuraText>
        </View>
        <AuraText variant="caption" tone="secondary" style={homeTypography.caption}>
          Care, gaps, and planning when you need them.
        </AuraText>
      </View>
      {compact ? (
        <View style={{ gap: GRID_GAP }}>
          {compactRows.map((row, rowIndex) => (
            <View key={row.map((tool) => tool.key).join("-")} style={{ flexDirection: "row", gap: GRID_GAP }}>
              {row.map(renderTool)}
              {Array.from({ length: COMPACT_GRID_COLUMNS - row.length }).map((_, spacerIndex) => (
                <View
                  key={`support-tool-spacer-${rowIndex}-${spacerIndex}`}
                  pointerEvents="none"
                  style={{ flex: 1, height: tileHeight, minWidth: 0 }}
                />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP }}>
          {tools.map(renderTool)}
        </View>
      )}
    </View>
  );
}
