import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, Text, View, useWindowDimensions } from "react-native";

import { Fonts } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import AppImage from "@/src/components/common/AppImage";
import ShopOptionsSheet from "@/src/components/shop/ShopOptionsSheet";
import WardrobeSuggestionCard from "@/src/components/suggestions/WardrobeSuggestionCard";
import { AuraButton, AuraText } from "@/src/components/ui/auraStylePrimitives";
import {
  ACTION_GAP,
  CHIP_BORDER_WIDTH,
  CHIP_HEIGHT,
  CHIP_HORIZONTAL_PADDING,
  CTA_HEIGHT,
  CTA_HORIZONTAL_PADDING,
  PILL_RADIUS,
} from "@/src/constants/auraControls";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useAuth } from "@/src/hooks/useAuth";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { formatMoney } from "@/src/lib/currency";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { WardrobeSuggestion } from "@/src/lib/wardrobeSuggestions";
import type { AuraCandidateAction, AuraCandidateItem, AuraLaundryConfirmationAction, AuraLook, AuraLookOptionMeta, AuraOutfitPhotoAction, AuraResponse } from "@/src/types/aura";

import { auraShadow, auraTheme } from "./aiTheme";

const DEBUG_AURA_CLIENT =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<AuraLook>);
const SMART_BUY_CHIP_HEIGHT = 28;
const CARD_SECTION_RADIUS = 18;

function getAuraLookStableKey(look: AuraLook) {
  const pieceKey = (look.pieces ?? [])
    .map((piece) => [piece.role, piece.itemId, piece.itemName].filter(Boolean).join(":"))
    .join("|");
  return [look.lookTitle, look.vibe, pieceKey].filter(Boolean).join("::") || "aura-look";
}

type AuraReplyCardProps = {
  data: AuraResponse;
  itemsById: Map<string, ClothingItem>;
  onAction?: (action: import("@/src/types/aura").AuraLookAction, look: AuraLook, option?: AuraLookOptionMeta) => void;
  onCandidateAction?: (action: AuraCandidateAction) => void;
  onOutfitPhotoAction?: (action: AuraOutfitPhotoAction) => void;
  onLaundryAction?: (action: AuraLaundryConfirmationAction) => void;
};

function AuraReplyCard({
  data,
  itemsById,
  onAction,
  onCandidateAction,
  onOutfitPhotoAction,
  onLaundryAction,
}: AuraReplyCardProps) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const layout = useResponsiveLayout();
  const { width: windowWidth } = useWindowDimensions();
  const ownedPieces = React.useMemo(() => data.ownedPieces?.filter(Boolean) ?? [], [data.ownedPieces]);
  const recommendedAdditions = React.useMemo(
    () => data.recommendedAdditions?.filter(Boolean) ?? [],
    [data.recommendedAdditions],
  );
  const levelUpSuggestions = React.useMemo(() => buildLevelUpSuggestions(data), [data]);
  const fallbackItems = React.useMemo(
    () =>
      !ownedPieces.length && !recommendedAdditions.length
        ? data.outfitItems?.filter(Boolean).slice(0, 5) ?? []
        : [],
    [data.outfitItems, ownedPieces.length, recommendedAdditions.length],
  );
  const candidateItems = React.useMemo(() => data.candidateItems ?? data.candidates ?? [], [data.candidateItems, data.candidates]);
  const lookOptions = React.useMemo(() => data.lookOptions?.filter(Boolean) ?? [], [data.lookOptions]);
  const wardrobeSuggestions = React.useMemo(
    () => data.wardrobeSuggestions?.filter(Boolean) ?? [],
    [data.wardrobeSuggestions],
  );
  const outfitAnalysis = data.outfitAnalysis ?? null;
  const laundryAction = data.laundryAction ?? null;
  const [selectedLookIndex, setSelectedLookIndex] = React.useState(0);
  const [activeShopSuggestion, setActiveShopSuggestion] = React.useState<WardrobeSuggestion | null>(null);
  const scrollX = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!DEBUG_AURA_CLIENT) return;
    console.log("[AURA_FRONTEND_PAYLOAD]", "AuraReplyCard payload", {
      presentation: data.presentation,
      hasLook: !!data.look,
      lookOptionsCount: lookOptions.length,
      candidateItemsCount: candidateItems.length,
      ownedPiecesCount: ownedPieces.length,
      outfitItemsCount: data.outfitItems?.length ?? 0,
      title: data.title,
    });
  }, [
    candidateItems.length,
    data.look,
    data.outfitItems?.length,
    data.presentation,
    data.title,
    lookOptions.length,
    ownedPieces.length,
  ]);

  React.useEffect(() => {
    if (selectedLookIndex >= lookOptions.length && lookOptions.length > 0) {
      setSelectedLookIndex(0);
    }
  }, [lookOptions.length, selectedLookIndex]);

  if (outfitAnalysis) {
    return (
      <OutfitAnalysisCard
        data={data}
        colors={colors}
        onAction={onOutfitPhotoAction}
      />
    );
  }

  if (data.presentation === "laundry_confirmation" && laundryAction?.matches?.length) {
    return (
      <View
        style={{
          width: "100%",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceGlass,
          padding: 14,
          gap: 10,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600", fontFamily: Fonts.sans }}>
          {sanitizeDisplayText(data.reply) || "Which item did you mean?"}
        </Text>
        {laundryAction.matches.map((match) => {
          const item = itemsById.get(match.itemId);
          return (
            <AuraPressable
              key={match.itemId}
              onPress={() =>
                onLaundryAction?.({
                  type: "confirm_laundry_status",
                  itemId: match.itemId,
                  targetStatus: laundryAction.targetStatus,
                })
              }
              style={{
                borderRadius: 14,
                padding: 12,
                backgroundColor: colors.chipBackground,
                borderWidth: 1,
                borderColor: colors.border,
                gap: 3,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "600", fontFamily: Fonts.sans }}>
                {sanitizeDisplayText(item?.name) || sanitizeDisplayText(match.label) || "Wardrobe item"}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: Fonts.sans }} numberOfLines={1}>
                {sanitizeDisplayText(match.subtitle) || sanitizeDisplayText(item?.brand) || "Tap to update laundry status"}
              </Text>
            </AuraPressable>
          );
        })}
      </View>
    );
  }

  if (candidateItems.length) {
    return (
      <View style={{ gap: 8, width: "100%" }}>
        {candidateItems.length > 1 ? (
          <Pressable
            onPress={() => onCandidateAction?.({ type: "add_all_candidates" })}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 5,
              backgroundColor: pressed ? colors.ctaCream : colors.primaryCta,
              borderWidth: CHIP_BORDER_WIDTH,
              borderColor: colors.borderWarm,
            })}
          >
            <AuraText variant="button" style={{ color: colors.ctaText, fontSize: 11.5, lineHeight: 15 }}>
              Add All
            </AuraText>
          </Pressable>
        ) : null}

        {candidateItems.map((candidate) => (
          <CandidateCard
            key={candidate.candidateId}
            candidate={candidate}
            colors={colors}
            onAction={onCandidateAction}
          />
        ))}
      </View>
    );
  }

  if (data.presentation === "candidate_preview") {
    return (
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: auraTheme.dangerBorder,
          backgroundColor: auraTheme.danger,
          padding: 14,
          width: "100%",
        }}
      >
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", fontFamily: Fonts.sans }}>
          Candidate preview expected but no candidate items were delivered.
        </Text>
      </View>
    );
  }

  if (wardrobeSuggestions.length) {
    return (
      <View style={{ gap: 10, width: "100%" }}>
        <View
          style={{
            paddingHorizontal: 2,
            gap: 5,
            width: "100%",
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 15.5,
              lineHeight: 20,
              fontWeight: "600",
              letterSpacing: 0,
              fontFamily: Fonts.sans,
            }}
          >
            {sanitizeDisplayText(data.title) || "What to add next"}
          </Text>
          {!!data.reason ? (
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12.5,
                lineHeight: 18,
                fontWeight: "600",
                fontFamily: Fonts.sans,
              }}
              numberOfLines={3}
            >
              {sanitizeDisplayText(data.reason)}
            </Text>
          ) : null}
        </View>
        {wardrobeSuggestions.slice(0, 3).map((suggestion) => (
          <WardrobeSuggestionCard
            key={suggestion.id}
            suggestion={suggestion}
            userId={user?.uid ?? null}
            sourceScreen="aura_chat"
            compact
            onFindOptions={setActiveShopSuggestion}
          />
        ))}
        <ShopOptionsSheet
          visible={Boolean(activeShopSuggestion)}
          suggestion={activeShopSuggestion}
          userId={user?.uid ?? null}
          sourceScreen="aura_chat"
          onDismiss={() => setActiveShopSuggestion(null)}
        />
      </View>
    );
  }

  if (data.look || lookOptions.length) {
    const looks = lookOptions.length ? lookOptions : data.look ? [data.look] : [];
    const sidePeek = 10;
    const railWidth = Math.max(
      288,
      Math.min(windowWidth * 0.89, windowWidth - layout.horizontalPadding * 2 - 22),
    );
    const railGap = 10;
    const railStride = railWidth + railGap;
    const effectiveLookIndex = looks[selectedLookIndex] ? selectedLookIndex : 0;
    const selectedLook = looks[effectiveLookIndex] ?? looks[0];
    const selectedMeta = getLookOptionMeta(effectiveLookIndex, selectedLook);
    const horizontalInset = Math.max(0, (windowWidth - railWidth) / 2 - layout.horizontalPadding - sidePeek);
    function handleLookScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
      if (!lookOptions.length) return;
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / railStride);
      if (nextIndex !== selectedLookIndex && nextIndex >= 0 && nextIndex < looks.length) {
        setSelectedLookIndex(nextIndex);
      }
    }

    return (
      <View style={{ gap: 8, width: "100%" }}>
        {looks.length > 1 ? (
          <View style={{ gap: 10 }}>
            <AnimatedFlatList
              data={looks}
              keyExtractor={getAuraLookStableKey}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToAlignment="start"
              snapToInterval={railStride}
              disableIntervalMomentum
              pagingEnabled={false}
              onMomentumScrollEnd={handleLookScroll}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true }
              )}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingLeft: horizontalInset, paddingRight: horizontalInset }}
              renderItem={({ item: look, index }) => {
                const option = getLookOptionMeta(index, look);
                const inputRange = [
                  (index - 1) * railStride,
                  index * railStride,
                  (index + 1) * railStride,
                ];
                const cardScale = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.97, 1, 0.97],
                  extrapolate: "clamp",
                });
                const cardOpacity = scrollX.interpolate({
                  inputRange,
                  outputRange: [0.8, 1, 0.8],
                  extrapolate: "clamp",
                });
                return (
                  <Animated.View
                    style={{
                      width: railWidth,
                      paddingRight: index === looks.length - 1 ? 0 : railGap,
                      gap: 10,
                      opacity: cardOpacity,
                      transform: [{ scale: cardScale }],
                    }}
                  >
                    <AuraLookCard
                      colors={colors}
                      look={look}
                      itemsById={itemsById}
                      onAction={onAction}
                      option={option}
                      viewportWidth={railWidth}
                      hideActions
                      compact
                    />
                  </Animated.View>
                );
              }}
            />
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 }}>
              {looks.map((look, index) => {
                const active = index === selectedLookIndex;
                return (
                  <View
                    key={`look-dot-${getAuraLookStableKey(look)}`}
                    style={{
                      width: active ? 18 : 6,
                      height: 6,
                      borderRadius: 999,
                      backgroundColor: active ? auraTheme.accent : "rgba(255,255,255,0.22)",
                    }}
                  />
                );
              })}
            </View>
            {selectedLook ? (
              <>
                <LookActionRow
                  look={selectedLook}
                  option={selectedMeta}
                  colors={colors}
                  onAction={onAction}
                />
                <AuraText variant="metadata" tone="secondary" style={{ marginLeft: 2, textAlign: "center" }}>
                  Swipe to compare options.
                </AuraText>
              </>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <AuraLookCard
              colors={colors}
              look={looks[0]}
              itemsById={itemsById}
              onAction={onAction}
              option={getLookOptionMeta(0, looks[0])}
              viewportWidth={railWidth}
              hideActions
              compact
            />
            <LookActionRow
              look={looks[0]}
              option={getLookOptionMeta(0, looks[0])}
              colors={colors}
              onAction={onAction}
            />
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: Math.max(20, layout.mediumRadius + 2),
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor: colors.border,
        backgroundColor: colors.surfaceGlass,
        paddingHorizontal: Math.max(13, layout.cardPadding - 5),
        paddingVertical: layout.screenSize === "compact" ? 13 : 15,
        gap: 14,
        width: "100%",
        ...auraShadow(0.07),
      }}
    >
      <View style={{ gap: 5 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 15.5,
            lineHeight: 20,
            fontWeight: "600",
            letterSpacing: 0,
            fontFamily: Fonts.sans,
          }}
        >
          {sanitizeDisplayText(data.title) || "AURA"}
        </Text>
      </View>

      {!!data.reason ? (
        <MetaRow label="Why it works" value={data.reason} colors={colors} />
      ) : null}

      {!!ownedPieces.length && !data.look ? (
        <Group title="From your closet" tone="owned" colors={colors}>
          {ownedPieces.slice(0, 5).map((item) => (
            <Tag key={`owned-${item}`} label={sanitizeDisplayText(item)} colors={colors} tone="owned" />
          ))}
        </Group>
      ) : null}

      {!!recommendedAdditions.length && !data.look ? (
        <Group title="Add to complete it" tone="suggested" colors={colors}>
          {recommendedAdditions.slice(0, 5).map((item) => (
            <Tag key={`add-${item}`} label={sanitizeDisplayText(item)} colors={colors} tone="suggested" />
          ))}
        </Group>
      ) : null}

      {!!fallbackItems.length && !data.look ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
          {fallbackItems.map((item) => (
            <Tag key={`fallback-${item}`} label={sanitizeDisplayText(item)} colors={colors} tone="default" />
          ))}
        </View>
      ) : null}

      {!!data.swapSuggestion && !data.look ? (
        <MetaRow label="Swap idea" value={data.swapSuggestion} colors={colors} emphasis />
      ) : null}

      <LevelThisUpSection suggestions={levelUpSuggestions} colors={colors} />
    </View>
  );
}

function buildLevelUpSuggestions(data: AuraResponse) {
  const suggestionsFromItems =
    data.upgradeSuggestionItems
      ?.map((item) => ({
        label: sanitizeDisplayText(item.label),
        searchQuery: item.searchQuery ?? undefined,
      }))
      .filter((item) => item.label) ?? [];
  const suggestionsFromStrings = (data.upgradeSuggestions ?? [])
    .map((label) => ({
      label: sanitizeDisplayText(label),
    }))
    .filter((item) => item.label);
  const missingPieces = (data.missingPieces ?? [])
    .map((label) => ({
      label: sanitizeDisplayText(label),
    }))
    .filter((item) => item.label);

  return Array.from(
    new Map(
      [...missingPieces, ...suggestionsFromItems, ...suggestionsFromStrings].map((item) => [
        item.label.toLowerCase(),
        item,
      ])
    ).values()
  ).slice(0, 2);
}

function LevelThisUpSection({
  suggestions,
  colors,
}: {
  suggestions: { label: string; searchQuery?: string }[];
  colors: ReturnType<typeof useAppTheme>["colors"];
}) {
  if (!suggestions.length) return null;

  return (
    <View
      style={{
        gap: 10,
        padding: 11,
        borderRadius: CARD_SECTION_RADIUS,
        backgroundColor: colors.chipBackground,
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor: colors.border,
      }}
    >
      <View style={{ gap: 2 }}>
        <AuraText variant="bodyStrong" style={{ fontSize: 13.25, lineHeight: 17 }}>
          Smart buys
        </AuraText>
        <AuraText variant="metadata" tone="muted" style={{ fontSize: 11.25, lineHeight: 15 }}>
          Small additions that make this easier to finish.
        </AuraText>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {suggestions.map((item) => (
          <View
            key={`level-up-${item.label}`}
            style={{
              borderRadius: 999,
              minHeight: SMART_BUY_CHIP_HEIGHT,
              paddingHorizontal: 9,
              paddingVertical: 0,
              backgroundColor: colors.surfaceMuted,
              borderWidth: CHIP_BORDER_WIDTH,
              borderColor: colors.borderSoft,
              justifyContent: "center",
              maxWidth: "100%",
            }}
          >
            <AuraText variant="metadata" tone="secondary" style={{ fontSize: 11.25, lineHeight: 14 }}>
              {item.label}
            </AuraText>
          </View>
        ))}
      </View>
    </View>
  );
}

function getLookOptionMeta(index: number, look?: AuraLook | null): AuraLookOptionMeta {
  const preferredLabel = sanitizeDisplayText(look?.personalizationLabel) || sanitizeDisplayText(look?.vibe);
  const normalized = preferredLabel.toLowerCase();
  const derivedLabel =
    normalized.includes("safe")
      ? "Safe"
      : normalized.includes("balanced")
        ? "Balanced"
        : normalized.includes("bold")
          ? "Bold"
          : index === 0
            ? "Safe"
            : index === 1
              ? "Balanced"
              : index === 2
                ? "Bold"
                : `Option ${index + 1}`;
  return {
    optionIndex: index,
    optionLabel: derivedLabel,
    optionId: `look-option-${index + 1}`,
  };
}

function LookActionRow({
  look,
  option,
  colors,
  onAction,
}: {
  look: AuraLook;
  option: AuraLookOptionMeta;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onAction?: (action: import("@/src/types/aura").AuraLookAction, look: AuraLook, option?: AuraLookOptionMeta) => void;
}) {
  if (!onAction) return null;

  return (
    <View style={{ flexDirection: "row", gap: ACTION_GAP }}>
      <ActionButton
        onPress={() => onAction("saveLook", look, option)}
        pressedBackground={colors.ctaCream}
        backgroundColor={colors.ctaCream}
        borderColor={colors.ctaCream}
      >
        <AuraText variant="button" style={{ color: colors.ctaText, fontSize: 13, lineHeight: 18 }}>
          Save look
        </AuraText>
      </ActionButton>
    </View>
  );
}

function OutfitAnalysisCard({
  data,
  colors,
  onAction,
}: {
  data: AuraResponse;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onAction?: (action: AuraOutfitPhotoAction) => void;
}) {
  const analysis = data.outfitAnalysis;
  if (!analysis) return null;
  const pieces = analysis.detectedPieces ?? [];
  const missing = analysis.missingToComplete ?? [];

  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor: colors.border,
        backgroundColor: colors.surfaceGlass,
        padding: 14,
        gap: 12,
        width: "100%",
        ...auraShadow(0.07),
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: "600", fontFamily: Fonts.sans }}>
          I found this outfit
        </Text>
        {analysis.outfitVibe ? (
          <Text style={{ color: auraTheme.textMuted, fontSize: 12.5, lineHeight: 17, fontWeight: "600", fontFamily: Fonts.sans }}>
            {sanitizeDisplayText(analysis.outfitVibe)}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {pieces.map((piece, index) => (
          <View
            key={`${piece.role}-${piece.label}-${index}`}
            style={{
              borderRadius: 14,
              paddingHorizontal: 9,
              paddingVertical: 7,
              backgroundColor: colors.chipBackground,
              borderWidth: CHIP_BORDER_WIDTH,
              borderColor: colors.border,
              maxWidth: "100%",
            }}
          >
            <Text style={{ color: auraTheme.textFaint, fontSize: 10, fontWeight: "600", letterSpacing: 0.8, fontFamily: Fonts.sans }}>
              {displayOutfitRole(piece.role)}
              {typeof piece.confidence === "number" ? ` · ${Math.round(piece.confidence * 100)}%` : ""}
            </Text>
            <Text style={{ color: colors.text, fontSize: 13, lineHeight: 18, fontWeight: "600", fontFamily: Fonts.sans }}>
              {[piece.color, piece.label].filter(Boolean).map(sanitizeDisplayText).join(" ")}
            </Text>
            {piece.notes ? (
              <Text style={{ color: colors.textSecondary, fontSize: 11.5, lineHeight: 16, fontWeight: "500", fontFamily: Fonts.sans }}>
                {sanitizeDisplayText(piece.notes)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {missing.length ? (
        <MetaRow label="Not visible" value={missing.map(sanitizeDisplayText).join(", ")} colors={colors} />
      ) : null}

      {(analysis.stylingNotes ?? []).length ? (
        <View style={{ gap: 6 }}>
          {(analysis.stylingNotes ?? []).slice(0, 3).map((note) => (
            <Text key={note} style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17, fontWeight: "600", fontFamily: Fonts.sans }}>
              {sanitizeDisplayText(note)}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: ACTION_GAP }}>
          <ActionButton
            onPress={() => onAction?.({ type: "save_worn_outfit" })}
            pressedBackground={colors.ctaCream}
            backgroundColor={colors.ctaCream}
            borderColor={colors.borderWarm}
          >
            <AuraText variant="button" style={{ color: colors.ctaText, fontSize: 13, lineHeight: 18 }}>
              Save as worn
            </AuraText>
          </ActionButton>
          <ActionButton
            onPress={() => onAction?.({ type: "add_pieces_to_closet" })}
            pressedBackground={colors.surfaceElevated}
            backgroundColor={auraTheme.surfaceStrong}
            borderColor={auraTheme.borderSoft}
          >
            <AuraText variant="button" style={{ color: colors.text, fontSize: 13, lineHeight: 18 }}>
              Add pieces
            </AuraText>
          </ActionButton>
        </View>
      </View>
    </View>
  );
}

function displayOutfitRole(role: string) {
  if (role === "footwear") return "Shoes";
  if (role === "outerwear") return "Outerwear";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function ActionButton({
  children,
  onPress,
  backgroundColor,
  pressedBackground,
  borderColor,
}: {
  children: React.ReactNode;
  onPress: () => void;
  backgroundColor: string;
  pressedBackground: string;
  borderColor: string;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  function animateTo(value: number) {
    Animated.timing(scale, {
      toValue: value,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <AuraPressable
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        haptic="light"
        hapticTrigger="press"
        pressedScale={0.97}
        pressedOpacity={0.96}
        style={({ pressed }) => ({
          minHeight: CTA_HEIGHT,
          borderRadius: PILL_RADIUS,
          paddingHorizontal: CTA_HORIZONTAL_PADDING,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: CHIP_BORDER_WIDTH,
          borderColor,
          backgroundColor: pressed ? pressedBackground : backgroundColor,
          opacity: pressed ? 0.96 : 1,
        })}
      >
        {children}
      </AuraPressable>
    </Animated.View>
  );
}

function Group({
  title,
  tone,
  colors,
  children,
}: {
  title: string;
  tone: "owned" | "suggested";
  colors: ReturnType<typeof useAppTheme>["colors"];
  children: React.ReactNode;
}) {
  const titleTone = tone === "owned" ? "accent" : "secondary";
  const sectionBackground = tone === "owned" ? colors.accentSoft : colors.surfaceMuted;
  const sectionBorder = tone === "owned" ? colors.purpleBorder : colors.borderSoft;

  return (
    <View
      style={{
        gap: 8,
        padding: 10,
        borderRadius: CARD_SECTION_RADIUS,
        backgroundColor: sectionBackground,
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor: sectionBorder,
      }}
    >
      <AuraText variant="caption" tone={titleTone} style={{ fontSize: 12.5, lineHeight: 15, fontWeight: "600" }}>
        {title}
      </AuraText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{children}</View>
    </View>
  );
}

function MetaRow({
  label,
  value,
  colors,
  emphasis,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useAppTheme>["colors"];
  emphasis?: boolean;
}) {
  return (
    <View style={{ gap: 5 }}>
      <AuraText variant="metadata" tone="secondary" style={{ fontSize: 11.5, lineHeight: 15 }}>
        {label}
      </AuraText>
      <AuraText
        variant={emphasis ? "bodyStrong" : "body"}
        tone={emphasis ? "primary" : "secondary"}
        style={{
          color: emphasis ? colors.text : colors.textSecondary,
          fontSize: 13.25,
          lineHeight: 20,
        }}
      >
        {sanitizeDisplayText(value)}
      </AuraText>
    </View>
  );
}

function CandidateCard({
  candidate,
  colors,
  onAction,
}: {
  candidate: AuraCandidateItem;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onAction?: (action: AuraCandidateAction) => void;
}) {
  const disabled = candidate.status === "added" || candidate.status === "cancelled";
  const title =
    sanitizeDisplayText(candidate.title ?? "") ||
    [candidate.displayColor ?? candidate.color, candidate.subCategory ?? candidate.category].filter(Boolean).join(" ") ||
    "Item preview";
  const priceText =
    candidate.priceDisplay ??
    (typeof candidate.salePrice === "number"
      ? formatMoney(candidate.salePrice, candidate.currency)
      : typeof candidate.estimatedValue === "number"
        ? formatMoney(candidate.estimatedValue, candidate.currency)
        : null);
  const categoryLabel = displayCategory(candidate.category, candidate.subCategory);
  const chipFields = [
    ["Category", candidate.category ? categoryLabel : null],
    ["Color", candidate.displayColor ?? candidate.color],
    ["Fit", candidate.fit],
    ["Material", candidate.material ?? candidate.materials?.[0]],
    ["Pattern", candidate.pattern],
    ["Price", priceText && !candidate.priceDisplay ? priceText : null],
  ].filter((entry): entry is [string, string] => !!entry[1]).slice(0, 3);
  const needsReview = candidate.status === "needs_review";
  const previewImageUrl = candidate.primaryImageUrl ?? candidate.imageUrls[0] ?? "";

  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor: colors.border,
        backgroundColor: colors.surfaceGlass,
        padding: 12,
        gap: 10,
        width: "100%",
        ...auraShadow(0.07),
      }}
    >
      <View style={{ flexDirection: "row", gap: 10 }}>
        {previewImageUrl ? (
          <AppImage
            source={{ uri: previewImageUrl }}
            style={{
              width: 76,
              height: 94,
              borderRadius: 12,
              backgroundColor: colors.boardLight,
              borderWidth: CHIP_BORDER_WIDTH,
              borderColor: colors.borderWarm,
            }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: 76,
              height: 94,
              borderRadius: 12,
              backgroundColor: colors.boardLight,
              borderWidth: CHIP_BORDER_WIDTH,
              borderColor: colors.borderWarm,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="link-outline" size={24} color={auraTheme.textMuted} />
          </View>
        )}
        <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <View style={{ gap: 3 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 14,
                lineHeight: 17,
                fontWeight: "600",
                fontFamily: Fonts.sans,
              }}
              numberOfLines={2}
            >
              {title}
            </Text>
            {[candidate.brand, priceText].filter(Boolean).length ? (
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: 12,
                  lineHeight: 16,
                  fontWeight: "600",
                  fontFamily: Fonts.sans,
                }}
                numberOfLines={1}
              >
                {[sanitizeDisplayText(candidate.brand ?? ""), sanitizeDisplayText(priceText ?? "")].filter(Boolean).join(" • ")}
              </Text>
            ) : null}
            <Text
              style={{
                color: auraTheme.textMuted,
                fontSize: 10,
                fontWeight: "600",
                letterSpacing: 1.05,
                fontFamily: Fonts.sans,
              }}
            >
              {candidate.status === "added"
                ? "ADDED"
                : candidate.status === "cancelled"
                  ? "CANCELLED"
                  : candidate.status === "needs_review"
                    ? "NEEDS REVIEW"
                  : candidate.status === "failed"
                    ? "COULDN'T SAVE THIS ITEM"
                    : "REVIEW ITEM"}
            </Text>
          </View>
          {needsReview ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "600", lineHeight: 17 }}>
              I couldn&apos;t fully read this item. Review the details before adding.
            </Text>
          ) : null}
          {candidate.status === "failed" ? (
            <Text style={{ color: colors.destructive, fontSize: 12.5, fontWeight: "600", lineHeight: 17 }}>
              Could not save this item. Retry, edit, or cancel.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
            {chipFields.map(([label, value]) => (
              <View
                key={`${candidate.candidateId}-${label}`}
                style={{
                  borderRadius: 9,
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  backgroundColor: colors.chipBackground,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 10.5, fontWeight: "600" }}>
                  {label}: <Text style={{ color: colors.text }}>{sanitizeDisplayText(value)}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
        <CandidateButton
          label={candidate.status === "failed" ? "Retry" : "Add to Wardrobe"}
          tone="primary"
          disabled={disabled}
          onPress={() => onAction?.({ type: "add_candidate", candidateId: candidate.candidateId })}
        />
        <CandidateButton
          label="Edit"
          tone="secondary"
          disabled={disabled}
          onPress={() => onAction?.({ type: "edit_candidate", candidateId: candidate.candidateId })}
        />
        <CandidateButton
          label="Cancel"
          tone="ghost"
          disabled={disabled}
          onPress={() => onAction?.({ type: "cancel_candidate", candidateId: candidate.candidateId })}
        />
      </View>
    </View>
  );
}

function displayCategory(category?: string | null, subCategory?: string | null) {
  const raw = String(category ?? "").trim().toLowerCase();
  const sub = String(subCategory ?? "").trim().toLowerCase();
  const combined = `${raw} ${sub}`;
  if (raw === "clothing" || raw === "apparel" || !raw) {
    if (/\b(shirt|tee|tshirt|t-shirt|polo|blouse|tank|top|hoodie|sweater)\b/.test(combined)) return "Top";
    if (/\b(jacket|coat|blazer)\b/.test(combined)) return "Outerwear";
    if (/\b(pant|trouser|jean|short|skirt)\b/.test(combined)) return "Bottom";
    if (/\b(shoe|sneaker|boot|loafer|heel|sandal)\b/.test(combined)) return "Footwear";
    if (/\b(dress|jumpsuit|romper)\b/.test(combined)) return "One piece";
    if (/\b(watch|bag|cap|hat|glasses|necklace|bracelet|ring|belt|scarf|perfume)\b/.test(combined)) return "Accessory";
  }
  if (raw === "tops") return "Top";
  if (raw === "bottoms") return "Bottom";
  if (raw === "shoes") return "Footwear";
  return sanitizeDisplayText(category);
}

function CandidateButton({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  onPress: () => void;
}) {
  const variant = tone === "primary" ? "primary" : tone === "secondary" ? "tertiary" : "ghost";

  return (
    <AuraButton
      label={label}
      disabled={disabled}
      onPress={onPress}
      variant={variant}
      size="small"
      haptic="selection"
      hapticTrigger="press"
      hitSlop={6}
      style={{
        minHeight: CHIP_HEIGHT,
        paddingHorizontal: CHIP_HORIZONTAL_PADDING,
      }}
      textStyle={{ fontSize: 11.25, lineHeight: 15 }}
    />
  );
}

function Tag({
  label,
  colors,
  tone,
}: {
  label: string;
  colors: ReturnType<typeof useAppTheme>["colors"];
  tone: "owned" | "suggested" | "default";
}) {
  const backgroundColor =
    tone === "owned"
      ? colors.purpleSurface
      : tone === "suggested"
        ? colors.chipBackground
        : auraTheme.surfaceSofter;
  const borderColor =
    tone === "owned"
      ? colors.purpleBorder
      : colors.border;
  const textColor = tone === "owned" ? colors.ctaCream : colors.textSecondary;

  return (
    <View
      style={{
        minHeight: SMART_BUY_CHIP_HEIGHT,
        paddingHorizontal: 9,
        paddingVertical: 0,
        borderRadius: 999,
        backgroundColor,
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor,
        justifyContent: "center",
        maxWidth: "100%",
      }}
    >
      <AuraText
        variant="metadata"
        style={{
          color: textColor,
          fontSize: 11,
          lineHeight: 14,
          fontWeight: "500",
        }}
      >
        {label}
      </AuraText>
    </View>
  );
}

export default React.memo(
  AuraReplyCard,
  (prev, next) =>
    prev.data === next.data &&
    prev.itemsById === next.itemsById &&
    prev.onAction === next.onAction &&
    prev.onCandidateAction === next.onCandidateAction &&
    prev.onOutfitPhotoAction === next.onOutfitPhotoAction &&
    prev.onLaundryAction === next.onLaundryAction,
);
