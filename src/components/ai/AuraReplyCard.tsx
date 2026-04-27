import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, FlatList, Image, NativeScrollEvent, NativeSyntheticEvent, Pressable, Text, View, useWindowDimensions } from "react-native";

import { Fonts } from "@/constants/theme";
import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraCandidateAction, AuraCandidateItem, AuraLook, AuraLookOptionMeta, AuraResponse } from "@/src/types/aura";

import { auraShadow, auraTheme } from "./aiTheme";

const DEBUG_AURA_CLIENT =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<AuraLook>);

export default function AuraReplyCard({
  data,
  itemsById,
  onAction,
  onCandidateAction,
}: {
  data: AuraResponse;
  itemsById: Map<string, ClothingItem>;
  onAction?: (action: import("@/src/types/aura").AuraLookAction, look: AuraLook, option?: AuraLookOptionMeta) => void;
  onCandidateAction?: (action: AuraCandidateAction) => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const { width: windowWidth } = useWindowDimensions();
  const ownedPieces = data.ownedPieces?.filter(Boolean) ?? [];
  const recommendedAdditions = data.recommendedAdditions?.filter(Boolean) ?? [];
  const levelUpSuggestions = buildLevelUpSuggestions(data);
  const fallbackItems =
    !ownedPieces.length && !recommendedAdditions.length ? data.outfitItems?.filter(Boolean).slice(0, 5) ?? [] : [];
  const candidateItems = data.candidateItems ?? data.candidates ?? [];
  const lookOptions = data.lookOptions?.filter(Boolean) ?? [];
  const [selectedLookIndex, setSelectedLookIndex] = React.useState(0);
  const [feedbackState, setFeedbackState] = React.useState<Record<string, "like" | "dislike" | null>>({});
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

  if (candidateItems.length) {
    return (
      <View style={{ gap: 8, width: "100%" }}>
        {candidateItems.length > 1 ? (
          <Pressable
            onPress={() => onCandidateAction?.({ type: "add_all_candidates" })}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 6,
              backgroundColor: pressed ? auraTheme.accentTintStrong : auraTheme.accentTint,
              borderWidth: 1,
              borderColor: auraTheme.borderAccent,
            })}
          >
            <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "800", fontFamily: Fonts.sans }}>
              Add All
            </Text>
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
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800", fontFamily: Fonts.sans }}>
          Candidate preview expected but no candidate items were delivered.
        </Text>
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
    const selectedLook = looks[selectedLookIndex] ?? looks[0];
    const selectedMeta = getLookOptionMeta(selectedLookIndex, selectedLook);
    const horizontalInset = Math.max(0, (windowWidth - railWidth) / 2 - layout.horizontalPadding - sidePeek);
    const feedbackKey = String(selectedMeta.optionId ?? `look-option-${selectedLookIndex + 1}`);
    const selectedFeedback = feedbackState[feedbackKey] ?? null;

    function handleFeedback(next: "like" | "dislike") {
      setFeedbackState((prev) => ({
        ...prev,
        [feedbackKey]: prev[feedbackKey] === next ? null : next,
      }));
      if (next === "like") {
        onAction?.("likeLook", selectedLook, selectedMeta);
      } else {
        onAction?.("notMyVibe", selectedLook, selectedMeta);
      }
    }

    function handleTryAgain() {
      onAction?.("showMoreLikeThis", selectedLook, selectedMeta);
    }

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
            {selectedLook ? (
              <FeedbackRail
                colors={colors}
                selected={selectedFeedback}
                onDislike={() => handleFeedback("dislike")}
                onTryAgain={handleTryAgain}
                onLike={() => handleFeedback("like")}
              />
            ) : null}
            <AnimatedFlatList
              data={looks}
              keyExtractor={(look, index) => `${look.lookTitle}-${index}`}
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
                    key={`look-dot-${index}`}
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
                  onAction={onAction}
                />
                <Text style={{ color: auraTheme.textMuted, fontSize: 11, fontFamily: Fonts.sans, marginLeft: 2, textAlign: "center" }}>
                  Swipe to compare options. Actions apply to {selectedMeta.optionLabel?.toLowerCase() ?? "this look"}.
                </Text>
              </>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <FeedbackRail
              colors={colors}
              selected={feedbackState[String(getLookOptionMeta(0, looks[0]).optionId ?? "look-option-1")] ?? null}
              onDislike={() => {
                const option = getLookOptionMeta(0, looks[0]);
                const key = String(option.optionId ?? "look-option-1");
                setFeedbackState((prev) => ({
                  ...prev,
                  [key]: prev[key] === "dislike" ? null : "dislike",
                }));
                onAction?.("notMyVibe", looks[0], option);
              }}
              onTryAgain={() => onAction?.("showMoreLikeThis", looks[0], getLookOptionMeta(0, looks[0]))}
              onLike={() => {
                const option = getLookOptionMeta(0, looks[0]);
                const key = String(option.optionId ?? "look-option-1");
                setFeedbackState((prev) => ({
                  ...prev,
                  [key]: prev[key] === "like" ? null : "like",
                }));
                onAction?.("likeLook", looks[0], option);
              }}
            />
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
              onAction={onAction}
            />
          </View>
        )}
        <LevelThisUpSection suggestions={levelUpSuggestions} colors={colors} />
      </View>
    );
  }

  return (
      <View
        style={{
          borderRadius: layout.mediumRadius + 4,
          borderWidth: 1,
          borderColor: auraTheme.borderSoft,
          backgroundColor: auraTheme.surface,
          paddingHorizontal: layout.cardPadding - 5,
          paddingVertical: layout.screenSize === "compact" ? 9 : 10,
          gap: 7,
          width: "100%",
          ...auraShadow(0.08),
        }}
      >
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 16,
          right: 16,
          height: 1,
          backgroundColor: auraTheme.borderAccent,
        }}
      />

      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: auraTheme.textFaint,
            fontSize: 10.5,
            fontWeight: "700",
            letterSpacing: 0.95,
            fontFamily: Fonts.sans,
          }}
        >
          AURA
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 16,
            lineHeight: 20,
            fontWeight: "700",
            letterSpacing: -0.35,
            fontFamily: Fonts.sans,
          }}
        >
          {sanitizeDisplayText(data.title) || "AURA"}
        </Text>
      </View>

      {!!ownedPieces.length && !data.look ? (
        <Group title="FROM YOUR CLOSET" titleColor={auraTheme.accentStrong}>
          {ownedPieces.slice(0, 5).map((item) => (
            <Tag key={`owned-${item}`} label={sanitizeDisplayText(item)} colors={colors} tone="owned" />
          ))}
        </Group>
      ) : null}

      {!!recommendedAdditions.length && !data.look ? (
        <Group title="ADD TO COMPLETE IT" titleColor={auraTheme.textMuted}>
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

      {!!data.reason ? (
        <MetaRow label="WHY" value={data.reason} colors={colors} />
      ) : null}

      {!!data.swapSuggestion && !data.look ? (
        <MetaRow label="SWAP" value={data.swapSuggestion} colors={colors} emphasis />
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
  ).slice(0, 3);
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
        gap: 8,
        marginTop: 4,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text
        style={{
          color: auraTheme.textMuted,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 0.4,
          fontFamily: Fonts.sans,
        }}
      >
        Level this up
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        {suggestions.map((item) => (
          <View
            key={`level-up-${item.label}`}
            style={{
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 7,
              backgroundColor: "rgba(255,255,255,0.035)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontSize: 12.5,
                fontWeight: "600",
                fontFamily: Fonts.sans,
              }}
            >
              {item.label}
            </Text>
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

function FeedbackRail({
  colors,
  selected,
  onDislike,
  onTryAgain,
  onLike,
}: {
  colors: ReturnType<typeof useAppTheme>["colors"];
  selected: "like" | "dislike" | null;
  onDislike: () => void;
  onTryAgain: () => void;
  onLike: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <FeedbackChip
        label="Not it"
        icon="thumbs-down-outline"
        active={selected === "dislike"}
        colors={colors}
        onPress={onDislike}
      />
      <FeedbackChip
        label="Try again"
        icon="refresh-outline"
        active={false}
        colors={colors}
        onPress={onTryAgain}
      />
      <FeedbackChip
        label="Like"
        icon="thumbs-up-outline"
        active={selected === "like"}
        colors={colors}
        onPress={onLike}
      />
    </View>
  );
}

function FeedbackChip({
  label,
  icon,
  active,
  colors,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onPress: () => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  function animateTo(value: number) {
    Animated.timing(scale, {
      toValue: value,
      duration: 120,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.96)}
        onPressOut={() => animateTo(1)}
        style={({ pressed }) => ({
          flex: 1,
          minHeight: 34,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 7,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          backgroundColor: active
            ? label === "Not it"
              ? "rgba(255,255,255,0.07)"
              : auraTheme.accentTint
            : "rgba(255,255,255,0.02)",
          borderWidth: 1,
          borderColor: active ? auraTheme.borderAccent : "rgba(255,255,255,0.08)",
          opacity: pressed ? 0.88 : 1,
        })}
      >
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.text : auraTheme.textMuted}
        />
        <Text
          style={{
            color: active ? colors.text : auraTheme.textMuted,
            fontSize: 11.5,
            fontWeight: "700",
            fontFamily: Fonts.sans,
          }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function LookActionRow({
  look,
  option,
  onAction,
}: {
  look: AuraLook;
  option: AuraLookOptionMeta;
  onAction?: (action: import("@/src/types/aura").AuraLookAction, look: AuraLook, option?: AuraLookOptionMeta) => void;
}) {
  if (!onAction) return null;

  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <ActionButton
        onPress={() => onAction("saveLook", look, option)}
        pressedBackground={auraTheme.accentTintStrong}
        backgroundColor={auraTheme.accentTint}
        borderColor="rgba(255,255,255,0.12)"
      >
        <Text style={{ color: "#F5F8FB", fontSize: 14, fontWeight: "800", fontFamily: Fonts.sans }}>
          Save look
        </Text>
      </ActionButton>
      <ActionButton
        onPress={() => onAction("planForToday", look, option)}
        pressedBackground="rgba(255,255,255,0.08)"
        backgroundColor={auraTheme.surfaceStrong}
        borderColor={auraTheme.borderSoft}
      >
        <Text style={{ color: "#E7EDF5", fontSize: 14, fontWeight: "800", fontFamily: Fonts.sans }}>
          Plan today
        </Text>
      </ActionButton>
    </View>
  );
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
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        style={({ pressed }) => ({
          minHeight: 52,
          borderRadius: 18,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor,
          backgroundColor: pressed ? pressedBackground : backgroundColor,
          opacity: pressed ? 0.96 : 1,
        })}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function Group({
  title,
  titleColor,
  children,
}: {
  title: string;
  titleColor: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: titleColor,
          fontSize: 10.5,
          fontWeight: "700",
          letterSpacing: 0.8,
          fontFamily: Fonts.sans,
        }}
      >
        {title}
      </Text>
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
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
      <Text style={{ color: auraTheme.textFaint, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.6 }}>
        {label}
      </Text>
      <Text
        style={{
          color: emphasis ? colors.text : colors.textSecondary,
          fontSize: 12,
          lineHeight: 17,
          fontWeight: emphasis ? "500" : "400",
          flex: 1,
          fontFamily: Fonts.sans,
        }}
      >
        {sanitizeDisplayText(value)}
      </Text>
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
    [candidate.color, candidate.subCategory ?? candidate.category].filter(Boolean).join(" ") ||
    "Item preview";
  const fields = [
    ["Category", candidate.category],
    ["Subcategory", candidate.subCategory],
    ["Color", candidate.color],
    ["Brand", candidate.brand],
    ["Material", candidate.material],
    ["Fit", candidate.fit],
    ["Pattern", candidate.pattern],
  ].filter((entry): entry is [string, string] => !!entry[1]);
  const categoryLabel = displayCategory(candidate.category, candidate.subCategory);
  const needsReview = candidate.status === "needs_review";

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: auraTheme.borderSoft,
        backgroundColor: auraTheme.surface,
        padding: 12,
        gap: 10,
        width: "100%",
        ...auraShadow(0.07),
      }}
    >
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Image
          source={{ uri: candidate.imageUrls[0] }}
            style={{
              width: 76,
              height: 94,
              borderRadius: 12,
              backgroundColor: auraTheme.surfaceSoft,
            }}
          resizeMode="cover"
        />
        <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
          <View style={{ gap: 3 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 14,
                lineHeight: 17,
                fontWeight: "800",
                fontFamily: Fonts.sans,
              }}
              numberOfLines={2}
            >
              {title}
            </Text>
            <Text
              style={{
                color: auraTheme.textMuted,
                fontSize: 10,
                fontWeight: "800",
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
            <Text style={{ color: colors.textSecondary, fontSize: 12.5, fontWeight: "700", lineHeight: 17 }}>
              I couldn&apos;t fully read this item. Review the details before adding.
            </Text>
          ) : null}
          {candidate.status === "failed" ? (
            <Text style={{ color: "#ffb6b6", fontSize: 12.5, fontWeight: "700", lineHeight: 17 }}>
              Could not save this item. Retry, edit, or cancel.
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
            {fields.slice(0, 6).map(([label, value]) => (
              <View
                key={`${candidate.candidateId}-${label}`}
                style={{
                  borderRadius: 9,
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  backgroundColor: auraTheme.surfaceSoft,
                }}
              >
                <Text style={{ color: colors.textSecondary, fontSize: 10.5, fontWeight: "700" }}>
                  {label}: <Text style={{ color: colors.text }}>{label === "Category" ? categoryLabel : sanitizeDisplayText(value)}</Text>
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
  const backgroundColor =
    tone === "primary" ? auraTheme.accentTint : tone === "secondary" ? auraTheme.surfaceSoft : "transparent";
  const borderColor =
    tone === "primary" ? auraTheme.borderAccent : tone === "secondary" ? auraTheme.border : auraTheme.borderSoft;
  const scale = React.useRef(new Animated.Value(1)).current;

  function animateTo(value: number) {
    Animated.timing(scale, {
      toValue: value,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        style={({ pressed }) => ({
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: pressed ? "rgba(255,255,255,0.12)" : backgroundColor,
          borderWidth: 1,
          borderColor,
          opacity: disabled ? 0.42 : pressed ? 0.94 : 1,
        })}
      >
        <Text style={{ color: "white", fontSize: 11.5, fontWeight: "800", fontFamily: Fonts.sans }}>{label}</Text>
      </Pressable>
    </Animated.View>
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
    tone === "owned" ? auraTheme.accentTint : tone === "suggested" ? auraTheme.surfaceSoft : auraTheme.surfaceSofter;
  const borderColor = tone === "owned" ? auraTheme.borderAccent : auraTheme.borderSoft;
  const textColor = tone === "owned" ? "#d7f2ff" : colors.text;

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text
        style={{
          color: textColor,
          fontSize: 10,
          fontWeight: "600",
          fontFamily: Fonts.sans,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
