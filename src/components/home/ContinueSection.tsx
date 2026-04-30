import AppImage from "@/src/components/common/AppImage";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { getItemImageUrl } from "@/src/lib/itemImage";
import type { ClothingItem } from "@/src/types/ClothingItem";

function itemTitle(item: ClothingItem) {
  return item.name || `${item.displayColor ?? item.primaryColor ?? ""} ${item.subCategory ?? item.category ?? "item"}`.trim();
}

function normalizeToken(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getMomentumBaseScale(item: ClothingItem) {
  const tokens = [
    normalizeToken(item.category),
    normalizeToken(item.subCategory),
    normalizeToken(item.type),
  ].join(" ");

  if (/glasses|sunglasses|eyewear/.test(tokens)) return 70;
  if (/hat|cap|beanie/.test(tokens)) return 72;
  if (/shoe|sneaker|boot|loafer|heel|footwear/.test(tokens)) return 78;
  if (/bag|handbag|backpack|crossbody|purse|tote/.test(tokens)) return 78;
  if (/watch|bracelet|necklace|ring|earring|accessor/.test(tokens)) return 74;
  if (/shirt|blouse|tee|t-shirt|top|sweater|hoodie|jacket|coat|outerwear/.test(tokens)) return 88;
  if (/jeans|pants|trousers|shorts|skirt|bottom/.test(tokens)) return 88;
  if (/dress|jumpsuit|romper/.test(tokens)) return 86;
  return 84;
}

function getMomentumImageStyle(item: ClothingItem): React.ComponentProps<typeof AppImage>["style"] {
  const baseScale = getMomentumBaseScale(item);
  const recommendedScale = item.visualNormalization?.recommendedScale;
  const recommendedTranslateY = item.visualNormalization?.recommendedTranslateY;
  const measuredScale =
    typeof recommendedScale === "number" && Number.isFinite(recommendedScale)
      ? clamp(recommendedScale, 0.92, 1.06)
      : 1;
  const sizePct = clamp(Math.round(baseScale * measuredScale), 68, 90);
  const translateY =
    typeof recommendedTranslateY === "number" && Number.isFinite(recommendedTranslateY)
      ? clamp(recommendedTranslateY * 0.45, -6, 8)
      : 0;

  return {
    width: `${sizePct}%`,
    height: `${sizePct}%`,
    alignSelf: "center",
    transform: [{ translateY }],
  };
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
  const cardWidth = layout.continueCardWidth;
  const imageFrameHeight = Math.round(cardWidth * 0.82);
  const cardHeight = imageFrameHeight + 112;

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 3 }}>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900" }}>{title}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{subtitle}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
        {items.map((item) => {
          const imageUri = getItemImageUrl(item, { variant: "thumb" });
          const momentumImageStyle = getMomentumImageStyle(item);
          return (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              style={({ pressed }) => ({
                width: cardWidth,
                height: cardHeight,
                borderRadius: layout.mediumRadius,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.84 : 1,
              })}
            >
              <View
                style={{
                  height: imageFrameHeight,
                  backgroundColor: colors.surfaceSoft,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderTopLeftRadius: layout.mediumRadius,
                  borderTopRightRadius: layout.mediumRadius,
                }}
              >
                {imageUri ? (
                  <AppImage
                    source={{
                      uri: imageUri,
                    }}
                    style={momentumImageStyle}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>No image</Text>
                )}
              </View>
              <View style={{ flex: 1, padding: 12, gap: 4, justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900", lineHeight: 18 }} numberOfLines={2}>
                  {itemTitle(item)}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={1}>
                  {[item.brand || null, item.status].filter(Boolean).join(" • ")}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }} numberOfLines={1}>
                    Build around this
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
                    →
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
