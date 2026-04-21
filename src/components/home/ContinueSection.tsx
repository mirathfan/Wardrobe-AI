import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImagePresentation, getItemImageUrl } from "@/src/lib/itemImage";
import type { ClothingItem } from "@/src/types/ClothingItem";

function itemTitle(item: ClothingItem) {
  return item.name || `${item.displayColor ?? item.primaryColor ?? ""} ${item.subCategory ?? item.category ?? "item"}`.trim();
}

export default function ContinueSection({
  colors,
  title,
  subtitle,
  items,
  onPressItem,
}: {
  colors: AppColors;
  title: string;
  subtitle: string;
  items: ClothingItem[];
  onPressItem: (item: ClothingItem) => void;
}) {
  const layout = useResponsiveLayout();
  if (!items.length) return null;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 3 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{subtitle}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
        {items.map((item) => {
          const imageUri = getItemImageUrl(item, { variant: "thumb" });
          const imagePresentation = getItemImagePresentation(item, {
            surface: "home_continue",
          });
          return (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              style={({ pressed }) => ({
                width: layout.continueCardWidth,
                borderRadius: layout.mediumRadius,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.045)",
                opacity: pressed ? 0.84 : 1,
              })}
            >
              <View
                style={{
                  height: (layout.continueCardWidth - 20) / imagePresentation.containerAspectRatio,
                  backgroundColor: colors.surface,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 8,
                  paddingVertical: 6,
                }}
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={[{ width: "100%", height: "100%" }, imagePresentation.imageStyle]}
                    resizeMode={imagePresentation.resizeMode}
                  />
                ) : (
                  <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>No image</Text>
                )}
              </View>
              <View style={{ padding: 12, gap: 4 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }} numberOfLines={1}>
                  {itemTitle(item)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {[item.brand || null, item.status].filter(Boolean).join(" • ")}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
