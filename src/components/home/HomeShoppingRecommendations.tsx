import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import AppImage from "@/src/components/common/AppImage";
import { homeTypography } from "@/src/components/home/homeTypography";
import { AuraSkeletonLine } from "@/src/components/ui/AuraSkeleton";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraSurfaceTiers,
} from "@/src/components/ui/auraStylePrimitives";
import { CTA_HEIGHT, CTA_HORIZONTAL_PADDING, PILL_RADIUS } from "@/src/constants/auraControls";
import { formatMoney } from "@/src/lib/currency";
import type { ShoppingRecommendationCandidate } from "@/src/types/shoppingRecommendations";

type HomeShoppingRecommendationsProps = {
  colors: AppColors;
  recommendations: ShoppingRecommendationCandidate[];
  savedProductIds?: string[] | null;
  preferencesSparse?: boolean;
  loading: boolean;
  error: boolean;
  onOpen: () => void;
  onRetry: () => void;
};

function productPriceLabel(recommendation: ShoppingRecommendationCandidate) {
  const { price, currency } = recommendation.product;
  if (typeof price !== "number") return null;
  return formatMoney(price, currency);
}

function RecommendationThumb({
  recommendation,
  colors,
}: {
  recommendation: ShoppingRecommendationCandidate;
  colors: AppColors;
}) {
  const imageUrl = recommendation.product.imageUrl?.trim();
  return (
    <View
      style={{
        width: 52,
        height: 58,
        borderRadius: 15,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surfaceSoft,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {imageUrl ? (
        <AppImage
          source={{ uri: imageUrl }}
          resizeMode="cover"
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <Ionicons name="shirt-outline" size={22} color={colors.textSecondary} />
      )}
    </View>
  );
}

function RecommendationRow({
  recommendation,
  colors,
  isSaved,
  onPress,
}: {
  recommendation: ShoppingRecommendationCandidate;
  colors: AppColors;
  isSaved: boolean;
  onPress: () => void;
}) {
  const price = productPriceLabel(recommendation);

  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.98}
      style={{
        minHeight: 74,
        borderRadius: 18,
        padding: 9,
        backgroundColor: colors.surfaceSoft,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <RecommendationThumb recommendation={recommendation} colors={colors} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text
          style={[homeTypography.bodySmall, { color: colors.text, fontWeight: "800" }]}
          numberOfLines={1}
        >
          {recommendation.product.title}
        </Text>
        {price ? (
          <Text
            selectable
            style={{
              color: colors.ctaCream,
              fontSize: 11.5,
              lineHeight: 15,
              fontWeight: "800",
              letterSpacing: 0,
              fontVariant: ["tabular-nums"],
            }}
            numberOfLines={1}
          >
            {price}
          </Text>
        ) : null}
        <Text
          style={[homeTypography.caption, { color: colors.textSecondary, opacity: 0.84 }]}
          numberOfLines={2}
        >
          {recommendation.explanation}
        </Text>
      </View>
      <Ionicons
        name={isSaved ? "bookmark" : "chevron-forward"}
        size={isSaved ? 15 : 16}
        color={isSaved ? colors.ctaCream : colors.textMuted}
      />
    </AuraPressable>
  );
}

function recommendationKey(recommendation: ShoppingRecommendationCandidate) {
  return (
    recommendation.product.id ||
    recommendation.product.providerProductId ||
    recommendation.product.url ||
    recommendation.id ||
    recommendation.product.title
  );
}

function dedupeRecommendations(recommendations: ShoppingRecommendationCandidate[]) {
  const seen = new Set<string>();
  return recommendations.filter((recommendation) => {
    const key = recommendationKey(recommendation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function HomeShoppingRecommendations({
  colors,
  recommendations,
  savedProductIds,
  preferencesSparse = false,
  loading,
  error,
  onOpen,
  onRetry,
}: HomeShoppingRecommendationsProps) {
  const savedProductIdSet = React.useMemo(
    () => new Set(savedProductIds ?? []),
    [savedProductIds],
  );
  const visibleRecommendations = React.useMemo(
    () => dedupeRecommendations(recommendations).slice(0, 3),
    [recommendations],
  );
  const hasRecommendations = visibleRecommendations.length > 0;

  return (
    <View
      style={{
        borderRadius: 22,
        padding: 14,
        ...auraSurfaceTiers.surfaceBase,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 11 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.purpleSurface,
            borderWidth: 1,
            borderColor: colors.purpleBorder,
          }}
        >
          <Ionicons name="bag-handle-outline" size={18} color={colors.ctaCream} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[homeTypography.titleSmall, { color: colors.text }]} numberOfLines={2}>
            Recommended for your wardrobe
          </Text>
          <Text style={[homeTypography.bodySmall, { color: colors.textSecondary, opacity: 0.78 }]} numberOfLines={2}>
            Shopping suggestions are based on your wardrobe and preferences.
          </Text>
        </View>
      </View>

      {preferencesSparse ? (
        <View
          style={{
            borderRadius: 16,
            paddingHorizontal: 11,
            paddingVertical: 9,
            backgroundColor: colors.surfaceSoft,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={[homeTypography.caption, { color: colors.textSecondary, fontWeight: "700" }]}>
            Add your sizes and budget to improve recommendations.
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={{ gap: 8 }}>
          <AuraSkeletonLine width="74%" height={13} />
          <AuraSkeletonLine width="58%" height={11} />
        </View>
      ) : null}

      {!loading && error ? (
        <View style={{ gap: 10 }}>
          <Text style={[homeTypography.bodySmall, { color: colors.textSecondary }]}>
            Shopping recommendations could not be loaded right now.
          </Text>
          <AuraPressable
            onPress={onRetry}
            haptic="selection"
            hapticTrigger="press"
            pressedScale={0.97}
            style={{
              alignSelf: "flex-start",
              minHeight: 36,
              borderRadius: PILL_RADIUS,
              paddingHorizontal: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.chipBackground,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={[homeTypography.caption, { color: colors.textSecondary, fontWeight: "800" }]}>
              Try again
            </Text>
          </AuraPressable>
        </View>
      ) : null}

      {!loading && !error && hasRecommendations ? (
        <View style={{ gap: 9 }}>
          {visibleRecommendations.map((recommendation) => (
            <RecommendationRow
              key={recommendation.id ?? recommendation.product.id}
              recommendation={recommendation}
              colors={colors}
              isSaved={savedProductIdSet.has(recommendation.product.id)}
              onPress={onOpen}
            />
          ))}
        </View>
      ) : null}

      {!loading && !error && !hasRecommendations ? (
        <Text style={[homeTypography.bodySmall, { color: colors.textSecondary }]}>
          Add more closet items or shopping preferences to improve recommendations.
        </Text>
      ) : null}

      {hasRecommendations ? (
        <AuraPressable
          onPress={onOpen}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.97}
          style={{
            alignSelf: "flex-start",
            ...auraButtonStyle(colors, "primary"),
            minHeight: CTA_HEIGHT,
            borderRadius: PILL_RADIUS,
            paddingHorizontal: CTA_HORIZONTAL_PADDING,
            flexDirection: "row",
            gap: 8,
          }}
        >
          <Ionicons name="arrow-forward" size={16} color={colors.ctaText} />
          <Text style={[auraButtonTextStyle(colors, "primary"), { fontSize: 13, lineHeight: 17 }]}>
            View picks
          </Text>
        </AuraPressable>
      ) : null}
    </View>
  );
}
