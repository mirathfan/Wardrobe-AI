import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AuraPressable from "@/src/components/aura/AuraPressable";
import AppImage from "@/src/components/common/AppImage";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraSurfaceTiers,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { AuraSkeletonLine } from "@/src/components/ui/AuraSkeleton";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { formatMoney } from "@/src/lib/currency";
import {
  getProductRecommendationsForSuggestion,
  type ProductOption,
} from "@/src/lib/productRecommendations";
import {
  trackSuggestionEvent,
  type SuggestionSourceScreen,
} from "@/src/lib/suggestionAnalytics";
import type { WardrobeSuggestion } from "@/src/lib/wardrobeSuggestions";

type ShopOptionsSheetProps = {
  visible: boolean;
  suggestion: WardrobeSuggestion | null;
  userId?: string | null;
  sourceScreen: SuggestionSourceScreen;
  onDismiss: () => void;
};

function tierLabel(tier: ProductOption["tier"]) {
  if (tier === "budget") return "Budget";
  if (tier === "premium") return "Premium";
  return "Mid";
}

function productPrice(product: ProductOption) {
  if (typeof product.price !== "number") return null;
  return formatMoney(product.price, product.currency);
}

function sourceLabel(product: ProductOption) {
  return product.source === "live" ? "Live pick" : "Curated pick";
}

function ratingLabel(product: ProductOption) {
  if (typeof product.rating !== "number") return null;
  const rating = product.rating.toFixed(product.rating % 1 === 0 ? 0 : 1);
  const reviews =
    typeof product.reviews === "number" && product.reviews > 0
      ? ` (${new Intl.NumberFormat(undefined, { notation: product.reviews > 999 ? "compact" : "standard" }).format(product.reviews)})`
      : "";
  return `${rating}★${reviews}`;
}

export default function ShopOptionsSheet({
  visible,
  suggestion,
  userId,
  sourceScreen,
  onDismiss,
}: ShopOptionsSheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const openedKeyRef = useRef<string | null>(null);
  const renderedLiveKeysRef = useRef(new Set<string>());
  const hasAffiliateLinks = products.some((product) => product.affiliateEligible);

  useEffect(() => {
    if (!visible || !suggestion) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    setProducts([]);
    setLoadingProducts(true);
    let active = true;
    void getProductRecommendationsForSuggestion(suggestion, {
      userId,
      sourceScreen,
      maxResults: 3,
    })
      .then((nextProducts) => {
        if (!active) return;
        setProducts(nextProducts);
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });

    return () => {
      active = false;
    };
  }, [sourceScreen, suggestion, userId, visible]);

  useEffect(() => {
    if (!visible || !suggestion) return;
    const key = `${sourceScreen}:${suggestion.id}`;
    if (openedKeyRef.current === key) return;
    openedKeyRef.current = key;
    void trackSuggestionEvent({
      userId,
      eventName: "shop_options_opened",
      suggestion,
      sourceScreen,
    });
  }, [sourceScreen, suggestion, userId, visible]);

  useEffect(() => {
    if (!visible || !suggestion) return;
    products.forEach((product) => {
      if (product.source !== "live") return;
      const key = `${suggestion.id}:${product.id}`;
      if (renderedLiveKeysRef.current.has(key)) return;
      renderedLiveKeysRef.current.add(key);
      void trackSuggestionEvent({
        userId,
        eventName: "live_product_rendered",
        suggestion,
        sourceScreen,
        merchant: product.merchant,
        productSource: product.source,
        affiliateEligible: product.affiliateEligible,
      });
    });
  }, [products, sourceScreen, suggestion, userId, visible]);

  async function openProduct(product: ProductOption) {
    if (!suggestion) return;
    await trackSuggestionEvent({
      userId,
      eventName: "affiliate_product_clicked",
      suggestion,
      sourceScreen,
      merchant: product.merchant,
      productSource: product.source,
      affiliateEligible: product.affiliateEligible,
    });
    const url = product.affiliateUrl || product.productUrl;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert("AURA", "That item link could not be opened on this device.");
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert("AURA", "That item link could not be opened right now.");
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={[styles.root, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityLabel="Close shopping options"
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
        />
        <View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(18, insets.bottom + 14),
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.borderStrong,
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={[auraTypography.eyebrow, { color: colors.textSecondary, letterSpacing: 1.2 }]} numberOfLines={1}>
                {products.some((product) => product.source === "live") ? "Live options" : "Curated options"}
              </Text>
              <Text
                style={[auraTypography.sectionTitle, { color: colors.text }]}
                numberOfLines={2}
              >
                {suggestion ? suggestion.itemType : "Wardrobe options"}
              </Text>
            </View>
            <AuraPressable
              accessibilityLabel="Close shopping options"
              onPress={onDismiss}
              haptic="selection"
              hapticTrigger="press"
              pressedScale={0.94}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.chipBackground,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </AuraPressable>
          </View>

          {suggestion ? (
            <Text
              style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}
              numberOfLines={2}
            >
              {suggestion.reason}
            </Text>
          ) : null}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 10, paddingTop: 2 }}
          >
            {loadingProducts && !products.length ? (
              <View
                style={[
                  styles.loadingCard,
                  {
                    backgroundColor: colors.chipBackground,
                    borderColor: colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 8 }}>
                  <AuraSkeletonLine width="54%" height={12} />
                  <AuraSkeletonLine width="82%" height={10} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: "400" }}>
                    Finding a few wardrobe options.
                  </Text>
                </View>
              </View>
            ) : null}
            {products.map((product) => {
              const price = productPrice(product);
              const rating = ratingLabel(product);
              return (
                <View
                  key={product.id}
                  style={[
                    styles.productRow,
                    {
                      ...auraSurfaceTiers.surfaceInteractive,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View
                    style={{
                      width: 58,
                      height: 64,
                      borderRadius: 15,
                      overflow: "hidden",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.surfaceSoft,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    {product.imageUrl ? (
                      <AppImage
                        source={{ uri: product.imageUrl }}
                        resizeMode="cover"
                        style={{ width: "100%", height: "100%" }}
                      />
                    ) : (
                      <Ionicons name="shirt-outline" size={23} color={colors.textSecondary} />
                    )}
                  </View>

                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 14,
                        lineHeight: 18,
                        fontWeight: "600",
                        letterSpacing: 0,
                      }}
                      numberOfLines={2}
                    >
                      {product.title}
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: 12,
                        lineHeight: 16,
                        fontWeight: "500",
                        letterSpacing: 0,
                      }}
                      numberOfLines={1}
                    >
                      {[product.brand, product.merchant].filter(Boolean).join(" at ")}
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      <View
                        style={{
                          minHeight: 24,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.chipBackground,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: 10.5,
                            lineHeight: 13,
                            fontWeight: "500",
                            letterSpacing: 0,
                          }}
                          numberOfLines={1}
                        >
                          {tierLabel(product.tier)}
                        </Text>
                      </View>
                      <View
                        style={{
                          minHeight: 24,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: product.source === "live" ? colors.accentSoft : colors.surfaceMuted,
                          borderWidth: 1,
                          borderColor: product.source === "live" ? colors.borderStrong : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: 10.5,
                            lineHeight: 13,
                            fontWeight: "500",
                            letterSpacing: 0,
                          }}
                          numberOfLines={1}
                        >
                          {sourceLabel(product)}
                        </Text>
                      </View>
                      {price ? (
                        <Text
                          selectable
                          style={{
                            color: colors.textSecondary,
                            fontSize: 11.5,
                            lineHeight: 22,
                            fontWeight: "500",
                            letterSpacing: 0,
                            fontVariant: ["tabular-nums"],
                          }}
                          numberOfLines={1}
                        >
                          {price}
                        </Text>
                      ) : null}
                      {rating ? (
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: 11.5,
                            lineHeight: 22,
                            fontWeight: "500",
                            letterSpacing: 0,
                            fontVariant: ["tabular-nums"],
                          }}
                          numberOfLines={1}
                        >
                          {rating}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  <AuraPressable
                    onPress={() => void openProduct(product)}
                    haptic="selection"
                    hapticTrigger="press"
                    pressedScale={0.96}
                    style={{
                      ...auraButtonStyle(colors, "primary", false, "compact"),
                      minHeight: 38,
                      paddingHorizontal: 12,
                    }}
                  >
                    <Text
                      style={[auraButtonTextStyle(colors, "primary"), { fontSize: 12, lineHeight: 15 }]}
                      numberOfLines={1}
                    >
                      View item
                    </Text>
                  </AuraPressable>
                </View>
              );
            })}
          </ScrollView>

          {hasAffiliateLinks ? (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: 11,
                lineHeight: 15,
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              Some shopping links may earn AURA a commission.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "82%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    overflow: "hidden",
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 14,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    alignSelf: "center",
    backgroundColor: "rgba(251,228,216,0.22)",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingTop: 2,
  },
  productRow: {
    borderRadius: 20,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  loadingCard: {
    minHeight: 78,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
