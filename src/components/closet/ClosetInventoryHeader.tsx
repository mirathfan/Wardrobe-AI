import React from "react";
import { Pressable, ScrollView, View } from "react-native";

import type { CategoryKey } from "@/src/closet/closetListModel";
import { AuraText } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type InventoryCategoryKey = "ALL" | CategoryKey;

export type ClosetInventoryCategoryTab = {
  key: InventoryCategoryKey;
  label: string;
};

export function ClosetInventoryHeader({
  activeCategory,
  categoryTabs,
  onSelectCategory,
}: {
  activeCategory: InventoryCategoryKey;
  categoryTabs: ClosetInventoryCategoryTab[];
  onSelectCategory: (category: InventoryCategoryKey) => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const compactTabs = categoryTabs.length > 6 || layout.width < 390;
  const tabFontSize = compactTabs ? 12 : 12.5;
  const tabLineHeight = compactTabs ? 15 : 16;

  return (
    <View style={{ zIndex: 10 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 18, paddingRight: layout.horizontalPadding * 0.5 }}
      >
        {categoryTabs.map((tab) => {
          const active = activeCategory === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelectCategory(tab.key)}
              style={({ pressed }) => ({
                minHeight: 28,
                paddingHorizontal: 0,
                paddingTop: 4,
                paddingBottom: 4,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.76 : 1,
              })}
            >
              <AuraText
                numberOfLines={1}
                variant="metadata"
                tone={active ? "accent" : "secondary"}
                style={{
                  fontSize: tabFontSize,
                  lineHeight: tabLineHeight,
                  fontWeight: active ? "500" : "400",
                  letterSpacing: 1.2,
                }}
              >
                {tab.label}
              </AuraText>
              <View
                style={{
                  height: 2,
                  width: "100%",
                  marginTop: 4,
                  borderRadius: 999,
                  backgroundColor: colors.ctaCream,
                  opacity: active ? 0.86 : 0,
                }}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
