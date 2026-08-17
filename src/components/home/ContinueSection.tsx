import AppImage from "@/src/components/common/AppImage";
import React from "react";
import { ScrollView, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { homeTypography } from "@/src/components/home/homeTypography";
import { auraSurfaceTiers } from "@/src/components/ui/auraStylePrimitives";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { logResolvedItemImageLoadFailure, resolveItemImage } from "@/src/lib/resolveItemImage";
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
  const imageFrameHeight = Math.round(cardWidth * 0.76);
  const cardHeight = imageFrameHeight + 104;

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 3 }}>
        <Text style={[homeTypography.titleMedium, { color: colors.text }]}>{title}</Text>
        <Text style={[homeTypography.bodySmall, { color: colors.textSecondary }]}>{subtitle}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
        {items.map((item) => {
          const resolvedImage = resolveItemImage(item, { variant: "thumb", surface: "home_continue" });
          const imageUri = resolvedImage.uri;
          const momentumImageStyle = getMomentumImageStyle(item);
          return (
            <AuraPressable
              key={item.id}
              onPress={() => onPressItem(item)}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.975}
              pressedOpacity={0.88}
              style={{
                width: cardWidth,
                height: cardHeight,
                borderRadius: layout.mediumRadius,
                overflow: "hidden",
                ...auraSurfaceTiers.surfaceInteractive,
              }}
            >
              <View
                style={{
                  height: imageFrameHeight,
                  margin: 8,
                  marginBottom: 0,
                  borderRadius: layout.mediumRadius - 4,
                  borderWidth: 1,
                  borderColor: colors.borderWarm,
                  backgroundColor: colors.boardLight,
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {imageUri ? (
                  <AppImage
                    source={{
                      uri: imageUri,
                    }}
                    style={momentumImageStyle}
                    resizeMode="contain"
                    onError={() => logResolvedItemImageLoadFailure(resolvedImage)}
                  />
                ) : (
                  <Text style={[homeTypography.caption, { color: colors.textOnLightSecondary }]}>No image</Text>
                )}
              </View>
              <View style={{ flex: 1, padding: 10, gap: 3, justifyContent: "space-between" }}>
                <Text style={[homeTypography.slotTitle, { color: colors.text }]} numberOfLines={2}>
                  {itemTitle(item)}
                </Text>
                <Text style={[homeTypography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[item.brand || null, item.status].filter(Boolean).join(" • ")}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                  <Text style={[homeTypography.caption, { color: colors.text, fontWeight: "600" }]} numberOfLines={1}>
                    Build around this
                  </Text>
                  <Text style={[homeTypography.caption, { color: colors.textSecondary, fontWeight: "600" }]}>
                    →
                  </Text>
                </View>
              </View>
            </AuraPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
