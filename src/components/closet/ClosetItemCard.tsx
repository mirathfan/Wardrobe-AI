import React from "react";
import { Image, Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImageUrl } from "@/src/lib/itemImage";
import type { ClosetItem } from "@/src/lib/items";
import { sanitizeDisplayText } from "@/src/lib/text";

function titleFor(item: ClosetItem) {
  return (
    sanitizeDisplayText(item.name) ||
    sanitizeDisplayText(item.subCategory) ||
    sanitizeDisplayText(item.category) ||
    "Wardrobe item"
  );
}

export function ClosetItemCard({
  item,
  onPress,
}: {
  item: ClosetItem;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const imageUrl = getItemImageUrl(item, { variant: "thumb" });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: layout.screenSize === "compact" ? 130 : 142,
        borderRadius: 18,
        backgroundColor: "rgba(255,255,255,0.02)",
        overflow: "hidden",
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          aspectRatio: 1,
          backgroundColor: "transparent",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          paddingHorizontal: 8,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        ) : (
          <View
            style={{
              width: "82%",
              height: "82%",
              borderRadius: 16,
              backgroundColor: "rgba(255,255,255,0.025)",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
              No image yet
            </Text>
            <Text
              style={{ color: colors.textSecondary, fontSize: 11, textAlign: "center" }}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {sanitizeDisplayText(item.category) || "Wardrobe piece"}
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          gap: 3,
          paddingHorizontal: 8,
          paddingTop: 6,
          paddingBottom: 10,
        }}
      >
        <Text
          style={{ color: colors.text, fontSize: 12.5, fontWeight: "800" }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {titleFor(item)}
        </Text>
        <Text
          style={{ color: "rgba(255,255,255,0.64)", fontSize: 10.5, fontWeight: "700", letterSpacing: 0.2 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {sanitizeDisplayText(item.brand) || "No brand"}
        </Text>
        <Text
          style={{ color: colors.textSecondary, fontSize: 10 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.status.replace(/_/g, " ")}
          {item.primaryColor ? ` · ${sanitizeDisplayText(item.primaryColor)}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}
