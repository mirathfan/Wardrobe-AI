import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

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
  onLongPressItem,
  selectedItemIds,
}: {
  title: string;
  count: number;
  expanded: boolean;
  subcategories: { label: string; items: ClosetItem[] }[];
  onToggle: () => void;
  onPressItem: (item: ClosetItem) => void;
  onLongPressItem?: (item: ClosetItem) => void;
  selectedItemIds?: Set<string>;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const categoryItems = subcategories.flatMap((group) => group.items);
  const gridGap = 16;
  const gridCardWidth = (layout.width - layout.horizontalPadding * 2 - gridGap) / 2;

  return (
    <View style={{ gap: 14 }}>
      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.055)" }} />
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          paddingVertical: 4,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "600", letterSpacing: 0 }}>
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
            <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: "600" }}>{count}</Text>
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
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textSecondary}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ gap: 18 }}>
          {subcategories.map((group) => (
            <View key={group.label} style={{ gap: 11 }}>
              <View style={{ gap: 9 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "600", letterSpacing: 0.2 }}>
                    {group.label}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "600", opacity: 0.75 }}>
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
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: gridGap,
                }}
              >
                {group.items.map((item, index) => (
                  <ClosetItemCard
                    key={item.id}
                    item={item}
                    onPress={() => onPressItem(item)}
                    onLongPress={onLongPressItem ? () => onLongPressItem(item) : undefined}
                    selected={selectedItemIds?.has(item.id) ?? false}
                    width={gridCardWidth}
                    animateIndex={index}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: gridGap,
          }}
        >
          {categoryItems.map((item, index) => (
            <ClosetItemCard
              key={item.id}
              item={item}
              onPress={() => onPressItem(item)}
              onLongPress={onLongPressItem ? () => onLongPressItem(item) : undefined}
              selected={selectedItemIds?.has(item.id) ?? false}
              width={gridCardWidth}
              animateIndex={index}
            />
          ))}
        </View>
      )}
    </View>
  );
}
