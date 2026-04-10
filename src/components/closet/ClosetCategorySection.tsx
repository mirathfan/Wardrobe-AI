import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import type { ClosetItem } from "@/src/lib/items";
import { ClosetItemCard } from "./ClosetItemCard";

export function ClosetCategorySection({
  title,
  count,
  expanded,
  subcategories,
  onToggle,
  onPressItem,
}: {
  title: string;
  count: number;
  expanded: boolean;
  subcategories: Array<{ label: string; items: ClosetItem[] }>;
  onToggle: () => void;
  onPressItem: (item: ClosetItem) => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const categoryItems = subcategories.flatMap((group) => group.items);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.055)" }} />
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          paddingVertical: 2,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.2 }}>
            {title}
          </Text>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: colors.overlay,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: "800" }}>{count}</Text>
          </View>
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.overlay,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 18, fontWeight: "700", marginTop: expanded ? -2 : 0 }}>
            {expanded ? "⌃" : "+"}
          </Text>
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ gap: 14 }}>
          {subcategories.map((group) => (
            <View key={group.label} style={{ gap: 10 }}>
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "800", letterSpacing: 0.2 }}>
                    {group.label}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700", opacity: 0.75 }}>
                    {group.items.length}
                  </Text>
                </View>
                <View
                  style={{
                    height: 1,
                    backgroundColor: colors.border,
                    opacity: 0.5,
                    marginRight: layout.horizontalPadding * 0.35,
                  }}
                />
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 2 }}
              >
                {group.items.map((item) => (
                  <ClosetItemCard key={item.id} item={item} onPress={() => onPressItem(item)} />
                ))}
              </ScrollView>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingRight: 2 }}
        >
          {categoryItems.map((item) => (
            <ClosetItemCard key={item.id} item={item} onPress={() => onPressItem(item)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
