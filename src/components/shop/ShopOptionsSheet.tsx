import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  productOptionToShoppingProduct,
  type ProductOption,
} from "@/src/lib/productRecommendations";
import { recordShoppingRecommendationFeedback } from "@/src/lib/shoppingRecommendationFeedback";
import {
  trackSuggestionEvent,
  type SuggestionSourceScreen,
} from "@/src/lib/suggestionAnalytics";
import type { WardrobeSuggestion } from "@/src/lib/wardrobeSuggestions";
import type {
  ShoppingFeedbackRecord,
  ShoppingProduct,
  ShoppingRecommendationCandidate,
  ShoppingRecommendationFeedbackAction,
  ShoppingRecommendationFeedbackReason,
  ShoppingRecommendationReason,
  ShoppingRecommendationSourceSurface,
} from "@/src/types/shoppingRecommendations";

type ShopOptionsSheetProps = {
  visible: boolean;
  suggestion: WardrobeSuggestion | null;
  userId?: string | null;
  sourceScreen: SuggestionSourceScreen;
  onDismiss: () => void;
  shoppingRecommendations?: ShoppingRecommendationCandidate[] | null;
  savedShoppingProductIds?: string[] | null;
  dismissedShoppingProductIds?: string[] | null;
  onShoppingFeedbackRecorded?: (record: ShoppingFeedbackRecord) => void;
};

type DismissReasonOption = {
  reason: ShoppingRecommendationFeedbackReason;
  label: string;
};

type DismissReasonTarget = {
  product: ProductOption;
  recommendation?: ShoppingRecommendationCandidate | null;
};

const DISMISS_REASON_OPTIONS: DismissReasonOption[] = [
  { reason: "too_expensive", label: "Too expensive" },
  { reason: "not_my_style", label: "Not my style" },
  { reason: "wrong_size", label: "Wrong size" },
  { reason: "already_own_similar", label: "Already own similar" },
  { reason: "wrong_colour", label: "Wrong colour" },
  { reason: "wrong_brand", label: "Wrong brand" },
  { reason: "not_relevant", label: "Not relevant" },
  { reason: "other", label: "Other" },
];

const REASON_LABELS: Record<ShoppingRecommendationReason, string> = {
  completes_outfit: "Completes outfit",
  fills_wardrobe_gap: "Wardrobe gap",
  matches_colour_palette: "Colour match",
  similar_to_most_worn: "Like favourites",
  within_budget: "Within budget",
  available_in_size: "Size match",
  preferred_brand: "Brand match",
  preferred_style: "Style match",
  seasonally_relevant: "Seasonal",
  avoids_duplicate: "Fresh option",
  matches_occasion: "Occasion fit",
  matches_saved_preference: "Saved preference",
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

function tierFromPrice(price: unknown): ProductOption["tier"] {
  if (typeof price !== "number" || !Number.isFinite(price)) return "mid";
  if (price <= 75) return "budget";
  if (price >= 200) return "premium";
  return "mid";
}

function candidateToProductOption(candidate: ShoppingRecommendationCandidate): ProductOption {
  const product = candidate.product;
  const source = String(product.source ?? "").toLowerCase().includes("curated")
    ? "curated"
    : "live";
  return {
    id: product.id,
    title: product.title,
    brand: product.brand ?? product.retailer ?? "",
    merchant: product.retailer ?? product.source ?? "Shop",
    price: product.price,
    currency: product.currency,
    imageUrl: product.imageUrl,
    productUrl: product.url,
    tier: tierFromPrice(product.price),
    source,
    affiliateEligible: false,
    confidenceScore: candidate.normalizedScore ?? candidate.score,
  };
}

function shoppingRecommendationKey(recommendation: ShoppingRecommendationCandidate) {
  return (
    recommendation.product.id ||
    recommendation.product.providerProductId ||
    recommendation.product.url ||
    recommendation.id ||
    recommendation.product.title
  );
}

function dedupeShoppingRecommendations(
  recommendations?: ShoppingRecommendationCandidate[] | null,
) {
  const seen = new Set<string>();
  return (recommendations ?? []).filter((recommendation) => {
    const key = shoppingRecommendationKey(recommendation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function productOptionKey(product: ProductOption) {
  return product.id || product.productUrl || `${product.merchant}:${product.title}`;
}

function dedupeProductOptions(products: ProductOption[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = productOptionKey(product);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function shoppingSourceSurface(sourceScreen: SuggestionSourceScreen): ShoppingRecommendationSourceSurface {
  if (sourceScreen === "aura_chat") return "aura";
  if (sourceScreen === "outfit_card") return "outfit";
  return sourceScreen;
}

function indexRecommendations(recommendations?: ShoppingRecommendationCandidate[] | null) {
  const byKey = new Map<string, ShoppingRecommendationCandidate>();
  (recommendations ?? []).forEach((recommendation) => {
    [
      recommendation.product.id,
      recommendation.product.providerProductId,
      recommendation.product.url,
    ].forEach((key) => {
      if (key) byKey.set(key, recommendation);
    });
  });
  return byKey;
}

function recommendationForProduct(
  product: ProductOption,
  recommendationsByKey: Map<string, ShoppingRecommendationCandidate>,
) {
  return (
    recommendationsByKey.get(product.id) ??
    recommendationsByKey.get(product.productUrl) ??
    (product.affiliateUrl ? recommendationsByKey.get(product.affiliateUrl) : undefined)
  );
}

function productSnapshotForFeedback(
  product: ProductOption,
  suggestion: WardrobeSuggestion | null,
  recommendation?: ShoppingRecommendationCandidate | null,
): ShoppingProduct {
  return recommendation?.product ?? productOptionToShoppingProduct(product, {
    category: suggestion?.category,
    colours: suggestion?.preferredColors ?? [],
    styleTags: suggestion?.styleTags ?? [],
  });
}

function productFeedbackId(
  product: ProductOption,
  suggestion: WardrobeSuggestion | null,
  recommendation?: ShoppingRecommendationCandidate | null,
) {
  return productSnapshotForFeedback(product, suggestion, recommendation).id || product.id;
}

function reasonLabel(reason: ShoppingRecommendationReason) {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

export default function ShopOptionsSheet({
  visible,
  suggestion,
  userId,
  sourceScreen,
  onDismiss,
  shoppingRecommendations,
  savedShoppingProductIds,
  dismissedShoppingProductIds,
  onShoppingFeedbackRecorded,
}: ShopOptionsSheetProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [savedProductIds, setSavedProductIds] = useState<Set<string>>(new Set());
  const [dismissedProductIds, setDismissedProductIds] = useState<Set<string>>(new Set());
  const [pendingFeedbackIds, setPendingFeedbackIds] = useState<Set<string>>(new Set());
  const [dismissReasonTarget, setDismissReasonTarget] = useState<DismissReasonTarget | null>(null);
  const openedKeyRef = useRef<string | null>(null);
  const renderedLiveKeysRef = useRef(new Set<string>());
  const viewedProductKeysRef = useRef(new Set<string>());
  const pendingFeedbackIdsRef = useRef(new Set<string>());
  const dedupedShoppingRecommendations = useMemo(
    () => dedupeShoppingRecommendations(shoppingRecommendations),
    [shoppingRecommendations],
  );
  const recommendationsByKey = useMemo(
    () => indexRecommendations(dedupedShoppingRecommendations),
    [dedupedShoppingRecommendations],
  );
  const visibleProducts = useMemo(
    () =>
      products.filter((product) => {
        const recommendation = recommendationForProduct(product, recommendationsByKey);
        return !dismissedProductIds.has(productFeedbackId(product, suggestion, recommendation));
      }),
    [dismissedProductIds, products, recommendationsByKey, suggestion],
  );
  const hasAffiliateLinks = visibleProducts.some((product) => product.affiliateEligible);
  const recordFeedbackForProduct = useCallback(
    async (
      product: ProductOption,
      action: ShoppingRecommendationFeedbackAction,
      reason?: ShoppingRecommendationFeedbackReason,
      recommendation?: ShoppingRecommendationCandidate | null,
    ) => {
      const productSnapshot = productSnapshotForFeedback(product, suggestion, recommendation);
      const record = await recordShoppingRecommendationFeedback({
        productId: productSnapshot.id || product.id,
        recommendationId: recommendation?.id ?? suggestion?.id,
        action,
        reason,
        sourceSurface: shoppingSourceSurface(sourceScreen),
        productSnapshot,
      });
      if (record) onShoppingFeedbackRecorded?.(record);
      return record;
    },
    [onShoppingFeedbackRecorded, sourceScreen, suggestion],
  );

  useEffect(() => {
    if (!visible) {
      setDismissReasonTarget(null);
      pendingFeedbackIdsRef.current.clear();
      setPendingFeedbackIds(new Set());
      return;
    }
    setSavedProductIds((current) => new Set([...current, ...(savedShoppingProductIds ?? [])]));
    setDismissedProductIds((current) => new Set([...current, ...(dismissedShoppingProductIds ?? [])]));
  }, [dismissedShoppingProductIds, savedShoppingProductIds, suggestion?.id, visible]);

  useEffect(() => {
    if (!visible || !suggestion) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    if (dedupedShoppingRecommendations.length) {
      setProducts(dedupedShoppingRecommendations.slice(0, 4).map(candidateToProductOption));
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
        setProducts(dedupeProductOptions(nextProducts));
      })
      .catch((error) => {
        if (!active) return;
        if (__DEV__) console.log("[callable error]", error);
        setProducts([]);
      })
      .finally(() => {
        if (active) setLoadingProducts(false);
      });

    return () => {
      active = false;
    };
  }, [dedupedShoppingRecommendations, sourceScreen, suggestion, userId, visible]);

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

  useEffect(() => {
    if (!visible || !suggestion) return;
    visibleProducts.forEach((product) => {
      const recommendation = recommendationForProduct(product, recommendationsByKey);
      const feedbackProductId = productFeedbackId(product, suggestion, recommendation);
      const key = `${suggestion.id}:${feedbackProductId}:viewed`;
      if (viewedProductKeysRef.current.has(key)) return;
      viewedProductKeysRef.current.add(key);
      void recordFeedbackForProduct(product, "viewed", undefined, recommendation).catch(() => undefined);
    });
  }, [recommendationsByKey, recordFeedbackForProduct, suggestion, visible, visibleProducts]);

  function setProductPending(productId: string, pending: boolean) {
    if (pending) pendingFeedbackIdsRef.current.add(productId);
    else pendingFeedbackIdsRef.current.delete(productId);
    setPendingFeedbackIds((current) => {
      const next = new Set(current);
      if (pending) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  async function saveProduct(
    product: ProductOption,
    recommendation?: ShoppingRecommendationCandidate | null,
  ) {
    if (!suggestion) return;
    const feedbackProductId = productFeedbackId(product, suggestion, recommendation);
    if (pendingFeedbackIdsRef.current.has(feedbackProductId) || savedProductIds.has(feedbackProductId)) return;

    setProductPending(feedbackProductId, true);
    setSavedProductIds((current) => {
      const next = new Set(current);
      next.add(feedbackProductId);
      return next;
    });

    void trackSuggestionEvent({
      userId,
      eventName: "suggestion_saved",
      suggestion,
      sourceScreen,
      merchant: product.merchant,
      productSource: product.source,
      affiliateEligible: product.affiliateEligible,
    });

    try {
      await recordFeedbackForProduct(product, "saved", undefined, recommendation);
    } catch {
      setSavedProductIds((current) => {
        const next = new Set(current);
        next.delete(feedbackProductId);
        return next;
      });
      Alert.alert("AURA", "That item could not be saved right now.");
    } finally {
      setProductPending(feedbackProductId, false);
    }
  }

  async function dismissProduct(reason: ShoppingRecommendationFeedbackReason) {
    if (!suggestion || !dismissReasonTarget) return;
    const { product, recommendation } = dismissReasonTarget;
    const feedbackProductId = productFeedbackId(product, suggestion, recommendation);
    if (pendingFeedbackIdsRef.current.has(feedbackProductId)) return;
    setDismissReasonTarget(null);
    setProductPending(feedbackProductId, true);
    setDismissedProductIds((current) => {
      const next = new Set(current);
      next.add(feedbackProductId);
      return next;
    });

    void trackSuggestionEvent({
      userId,
      eventName: "suggestion_dismissed",
      suggestion,
      sourceScreen,
      merchant: product.merchant,
      productSource: product.source,
      affiliateEligible: product.affiliateEligible,
    });

    try {
      await recordFeedbackForProduct(product, "dismissed", reason, recommendation);
    } catch {
      setDismissedProductIds((current) => {
        const next = new Set(current);
        next.delete(feedbackProductId);
        return next;
      });
      Alert.alert("AURA", "That feedback could not be saved right now.");
    } finally {
      setProductPending(feedbackProductId, false);
    }
  }

  async function openProduct(product: ProductOption) {
    if (!suggestion) return;
    const recommendation = recommendationForProduct(product, recommendationsByKey);
    void recordFeedbackForProduct(product, "clicked", undefined, recommendation).catch(() => undefined);
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
    <>
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
            <View style={{ gap: 6 }}>
              <Text
                style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}
                numberOfLines={2}
              >
                {suggestion.reason}
              </Text>
              <Text
                style={{
                  color: colors.textMuted,
                  fontSize: 11.5,
                  lineHeight: 16,
                  fontWeight: "600",
                }}
                numberOfLines={2}
              >
                Shopping suggestions are based on your wardrobe and preferences.
              </Text>
            </View>
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
            {visibleProducts.map((product) => {
              const recommendation = recommendationForProduct(product, recommendationsByKey);
              const feedbackProductId = productFeedbackId(product, suggestion, recommendation);
              const isSaved = savedProductIds.has(feedbackProductId);
              const isPending = pendingFeedbackIds.has(feedbackProductId);
              const price = productPrice(product);
              const rating = ratingLabel(product);
              const reasonChips = recommendation?.reasons.slice(0, 2) ?? [];
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
                    {recommendation?.explanation ? (
                      <Text
                        style={{
                          color: colors.textMuted,
                          fontSize: 11.5,
                          lineHeight: 16,
                          fontWeight: "500",
                          letterSpacing: 0,
                        }}
                        numberOfLines={2}
                      >
                        {recommendation.explanation}
                      </Text>
                    ) : null}
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
                      {reasonChips.map((reason) => (
                        <View
                          key={`${product.id}-${reason}`}
                          style={{
                            minHeight: 24,
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: colors.purpleSurface,
                            borderWidth: 1,
                            borderColor: colors.purpleBorder,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.ctaCream,
                              fontSize: 10.5,
                              lineHeight: 13,
                              fontWeight: "700",
                              letterSpacing: 0,
                            }}
                            numberOfLines={1}
                          >
                            {reasonLabel(reason)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.productActions}>
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
                    <View style={styles.feedbackActions}>
                      <AuraPressable
                        accessibilityLabel={isSaved ? "Saved shopping recommendation" : "Save shopping recommendation"}
                        onPress={() => void saveProduct(product, recommendation)}
                        disabled={isSaved || isPending}
                        haptic="selection"
                        hapticTrigger="press"
                        pressedScale={0.95}
                        style={{
                          minHeight: 32,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                          gap: 5,
                          backgroundColor: isSaved ? colors.purpleSurface : colors.chipBackground,
                          borderWidth: 1,
                          borderColor: isSaved ? colors.purpleBorder : colors.border,
                        }}
                      >
                        <Ionicons
                          name={isSaved ? "bookmark" : "bookmark-outline"}
                          size={13}
                          color={isSaved ? colors.ctaCream : colors.textSecondary}
                        />
                        <Text
                          style={{
                            color: isSaved ? colors.ctaCream : colors.textSecondary,
                            fontSize: 11,
                            lineHeight: 14,
                            fontWeight: "700",
                          }}
                          numberOfLines={1}
                        >
                          {isSaved ? "Saved" : "Save"}
                        </Text>
                      </AuraPressable>
                      <AuraPressable
                        accessibilityLabel="Dismiss shopping recommendation"
                        onPress={() => setDismissReasonTarget({ product, recommendation })}
                        disabled={isPending}
                        haptic="selection"
                        hapticTrigger="press"
                        pressedScale={0.95}
                        style={{
                          minHeight: 32,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "row",
                          gap: 5,
                          backgroundColor: colors.chipBackground,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Ionicons name="close-circle-outline" size={13} color={colors.textSecondary} />
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: 11,
                            lineHeight: 14,
                            fontWeight: "700",
                          }}
                          numberOfLines={1}
                        >
                          Not for me
                        </Text>
                      </AuraPressable>
                    </View>
                  </View>
                </View>
              );
            })}
            {!loadingProducts && !visibleProducts.length ? (
              <View
                style={[
                  styles.loadingCard,
                  {
                    backgroundColor: colors.chipBackground,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 16, fontWeight: "500" }}>
                  No more options in this set.
                </Text>
              </View>
            ) : null}
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
    <Modal
      visible={Boolean(dismissReasonTarget)}
      transparent
      animationType="fade"
      onRequestClose={() => setDismissReasonTarget(null)}
    >
      <View style={[styles.reasonRoot, { backgroundColor: colors.overlay }]}>
        <Pressable
          accessibilityLabel="Cancel dismissal reason"
          style={StyleSheet.absoluteFill}
          onPress={() => setDismissReasonTarget(null)}
        />
        <View
          style={[
            styles.reasonSheet,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.borderStrong,
              paddingBottom: Math.max(16, insets.bottom + 10),
            },
          ]}
        >
          <View style={{ gap: 4 }}>
            <Text style={[auraTypography.cardTitle, { color: colors.text, fontSize: 17, lineHeight: 22 }]}>
              Why not this one?
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: "500" }}>
              This helps tune future shopping suggestions.
            </Text>
          </View>
          <View style={styles.reasonGrid}>
            {DISMISS_REASON_OPTIONS.map((option) => (
              <AuraPressable
                key={option.reason}
                onPress={() => void dismissProduct(option.reason)}
                haptic="selection"
                hapticTrigger="press"
                pressedScale={0.97}
                style={{
                  minHeight: 38,
                  borderRadius: 999,
                  paddingHorizontal: 12,
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
                    fontSize: 12,
                    lineHeight: 15,
                    fontWeight: "700",
                  }}
                  numberOfLines={1}
                >
                  {option.label}
                </Text>
              </AuraPressable>
            ))}
          </View>
          <AuraPressable
            onPress={() => setDismissReasonTarget(null)}
            haptic="selection"
            hapticTrigger="press"
            pressedScale={0.97}
            style={{
              minHeight: 40,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.surfaceSoft,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 16, fontWeight: "700" }}>
              Cancel
            </Text>
          </AuraPressable>
        </View>
      </View>
    </Modal>
    </>
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
    alignItems: "flex-start",
    gap: 11,
  },
  productActions: {
    alignItems: "stretch",
    gap: 7,
    width: 106,
  },
  feedbackActions: {
    gap: 6,
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
  reasonRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  reasonSheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    paddingTop: 18,
    paddingHorizontal: 16,
    gap: 14,
  },
  reasonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
