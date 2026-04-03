import React, { useMemo } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import type { ClosetItem } from "../../src/lib/items";
import { AiBadge } from "./AiBadge";
import { useAppTheme } from "../hooks/useAppTheme";

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.getTime();
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    const ms = date?.getTime?.();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function pickAiItems(items: ClosetItem[]) {
  const byFreshness = [...items].sort((a, b) => {
    const aWears = Number(a.wearCountSinceWash ?? 0);
    const bWears = Number(b.wearCountSinceWash ?? 0);
    if (aWears !== bWears) return aWears - bWears;
    const aLast = toMillis(a.lastWornDate) ?? 0;
    const bLast = toMillis(b.lastWornDate) ?? 0;
    if (aLast !== bLast) return aLast - bLast;
    return Number((b.createdAt as number) ?? 0) - Number((a.createdAt as number) ?? 0);
  });
  return byFreshness.slice(0, 8);
}

function pickRecentlyWorn(items: ClosetItem[]) {
  const withLastWorn = [...items]
    .filter((item) => !!toMillis(item.lastWornDate))
    .sort((a, b) => (toMillis(b.lastWornDate) ?? 0) - (toMillis(a.lastWornDate) ?? 0))
    .slice(0, 8);

  if (withLastWorn.length > 0) return withLastWorn;
  // TODO(wardrobe-ai): if schema switches to lastWornAt, update this fallback ordering input.
  return [...items]
    .sort((a, b) => Number(b.wearCountSinceWash ?? 0) - Number(a.wearCountSinceWash ?? 0))
    .slice(0, 8);
}

function pickUnderused(items: ClosetItem[]) {
  const now = Date.now();
  const threshold = 30 * 24 * 60 * 60 * 1000;
  return [...items]
    .filter((item) => {
      const wears = Number(item.wearCountSinceWash ?? 0);
      const lastWorn = toMillis(item.lastWornDate);
      if (wears === 0) return true;
      if (!lastWorn) return true;
      return now - lastWorn >= threshold;
    })
    .sort((a, b) => Number((b.createdAt as number) ?? 0) - Number((a.createdAt as number) ?? 0))
    .slice(0, 8);
}

export const AiWardrobeSections = React.memo(function AiWardrobeSections({
  items,
  onPressItem,
  onLongPressItem,
  renderItemCardCompact,
}: {
  items: ClosetItem[];
  onPressItem: (item: ClosetItem) => void;
  onLongPressItem?: (item: ClosetItem) => void;
  renderItemCardCompact: (args: { item: ClosetItem; aiTag: string }) => React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const sections = useMemo(
    () => [
      {
        key: "ai-picks",
        title: "AI Picks for Today",
        subtitle: "Prioritized for rotation and freshness",
        tag: "AI Pick",
        items: pickAiItems(items),
      },
      {
        key: "recent",
        title: "Recently Worn",
        subtitle: "Based on your recent wear history",
        tag: "Recently Worn",
        items: pickRecentlyWorn(items),
      },
      {
        key: "underused",
        title: "Underused",
        subtitle: "Bring these pieces back into rotation",
        tag: "Underused",
        items: pickUnderused(items),
      },
    ],
    [items]
  );

  const nonEmptySections = sections.filter((section) => section.items.length > 0);
  if (nonEmptySections.length === 0) return null;

  return (
    <View style={{ gap: 12 }}>
      {nonEmptySections.map((section) => (
        <View key={section.key} style={{ gap: 7 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: colors.text }}>{section.title}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>{section.subtitle}</Text>
            </View>
            <AiBadge label={section.tag} />
          </View>

          <FlatList
            data={section.items}
            horizontal
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
            initialNumToRender={6}
            windowSize={5}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPressItem(item)}
                onLongPress={onLongPressItem ? () => onLongPressItem(item) : undefined}
                delayLongPress={220}
              >
                {renderItemCardCompact({ item, aiTag: section.tag })}
              </Pressable>
            )}
          />
        </View>
      ))}
    </View>
  );
});
