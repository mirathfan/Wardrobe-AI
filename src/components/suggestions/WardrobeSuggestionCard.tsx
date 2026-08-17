import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Text, View } from "react-native";

import AuraPressable from "@/src/components/aura/AuraPressable";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraSurfaceTiers,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  trackSuggestionEvent,
  type SuggestionSourceScreen,
} from "@/src/lib/suggestionAnalytics";
import type { WardrobeSuggestion } from "@/src/lib/wardrobeSuggestions";

type WardrobeSuggestionCardProps = {
  suggestion: WardrobeSuggestion;
  userId?: string | null;
  sourceScreen: SuggestionSourceScreen;
  compact?: boolean;
  onFindOptions?: (suggestion: WardrobeSuggestion) => void;
  onDismiss?: (suggestion: WardrobeSuggestion) => void;
  onSave?: (suggestion: WardrobeSuggestion) => void;
};

function priorityLabel(priority: WardrobeSuggestion["priority"]) {
  if (priority === "high") return "High impact";
  if (priority === "medium") return "Medium";
  return "Low";
}

function outfitEstimateLabel(value: number) {
  const count = Math.max(0, Math.round(value));
  return `${count} outfit${count === 1 ? "" : "s"} unlocked`;
}

export default function WardrobeSuggestionCard({
  suggestion,
  userId,
  sourceScreen,
  compact = false,
  onFindOptions,
  onDismiss,
  onSave,
}: WardrobeSuggestionCardProps) {
  const { colors } = useAppTheme();
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void trackSuggestionEvent({
      userId,
      eventName: "suggestion_viewed",
      suggestion,
      sourceScreen,
    });
  }, [sourceScreen, suggestion, userId]);

  function handleFindOptions() {
    void trackSuggestionEvent({
      userId,
      eventName: "suggestion_clicked",
      suggestion,
      sourceScreen,
    });
    onFindOptions?.(suggestion);
  }

  function handleSave() {
    void trackSuggestionEvent({
      userId,
      eventName: "suggestion_saved",
      suggestion,
      sourceScreen,
    });
    onSave?.(suggestion);
  }

  function handleDismiss() {
    void trackSuggestionEvent({
      userId,
      eventName: "suggestion_dismissed",
      suggestion,
      sourceScreen,
    });
    onDismiss?.(suggestion);
  }

  return (
    <View
      style={{
        borderRadius: compact ? 18 : 22,
        padding: compact ? 12 : 14,
        ...auraSurfaceTiers.surfaceInteractive,
        gap: compact ? 10 : 12,
      }}
    >
      <View style={{ flexDirection: "row", gap: 11, alignItems: "flex-start" }}>
        <View
          style={{
            width: compact ? 34 : 38,
            height: compact ? 34 : 38,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.purpleSurface,
            borderWidth: 1,
            borderColor: colors.purpleBorder,
          }}
        >
          <Ionicons name="sparkles-outline" size={compact ? 16 : 18} color={colors.ctaCream} />
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={[
                auraTypography.cardTitle,
                {
                  flex: 1,
                  color: colors.text,
                  fontSize: compact ? 15.5 : 18,
                  lineHeight: compact ? 20 : 23,
                },
              ]}
              numberOfLines={1}
            >
              {suggestion.itemType}
            </Text>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 8,
                minHeight: 25,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: suggestion.priority === "high" ? colors.purpleSurfaceStrong : colors.chipBackground,
                borderWidth: 1,
                borderColor: suggestion.priority === "high" ? colors.purpleBorder : colors.border,
              }}
            >
              <Text
                style={{
                  color: suggestion.priority === "high" ? colors.ctaCream : colors.textSecondary,
                  fontSize: 10.5,
                  lineHeight: 13,
                  fontWeight: "900",
                  letterSpacing: 0,
                }}
                numberOfLines={1}
              >
                {priorityLabel(suggestion.priority)}
              </Text>
            </View>
          </View>

          <Text
            style={[
              auraTypography.bodySecondary,
              {
                color: colors.textSecondary,
                fontSize: compact ? 12.5 : 14,
                lineHeight: compact ? 18 : 20,
              },
            ]}
            numberOfLines={compact ? 2 : 3}
          >
            {suggestion.reason}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
        <View
          style={{
            minHeight: 30,
            borderRadius: 999,
            paddingHorizontal: 9,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.chipBackground,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            selectable
            style={{
              color: colors.ctaCream,
              fontSize: 11.5,
              lineHeight: 15,
              fontWeight: "900",
              letterSpacing: 0,
              fontVariant: ["tabular-nums"],
            }}
            numberOfLines={1}
          >
            {outfitEstimateLabel(suggestion.outfitsUnlockedEstimate)}
          </Text>
        </View>
        {suggestion.preferredColors.slice(0, compact ? 2 : 3).map((color) => (
          <View
            key={`${suggestion.id}-${color}`}
            style={{
              minHeight: 30,
              borderRadius: 999,
              paddingHorizontal: 9,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(251,228,216,0.06)",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 11.5,
                lineHeight: 15,
                fontWeight: "800",
                letterSpacing: 0,
              }}
              numberOfLines={1}
            >
              {color}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        {onSave ? (
          <AuraPressable
            accessibilityLabel={`Save ${suggestion.itemType} suggestion`}
            onPress={handleSave}
            haptic="selection"
            hapticTrigger="press"
            pressedScale={0.95}
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.chipBackground,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="bookmark-outline" size={16} color={colors.textSecondary} />
          </AuraPressable>
        ) : null}
        {onDismiss ? (
          <AuraPressable
            accessibilityLabel={`Dismiss ${suggestion.itemType} suggestion`}
            onPress={handleDismiss}
            haptic="selection"
            hapticTrigger="press"
            pressedScale={0.95}
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.chipBackground,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Ionicons name="close" size={17} color={colors.textSecondary} />
          </AuraPressable>
        ) : null}
        <AuraPressable
          onPress={handleFindOptions}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.97}
          style={{
            ...auraButtonStyle(colors, "primary", false, "compact"),
            minHeight: 40,
            paddingHorizontal: 14,
            flexDirection: "row",
            gap: 7,
            alignSelf: "flex-start",
          }}
        >
          <Ionicons name="search-outline" size={14} color={colors.ctaText} />
          <Text
            style={[auraButtonTextStyle(colors, "primary"), { fontSize: 12.5, lineHeight: 16 }]}
            numberOfLines={1}
          >
            Find options
          </Text>
        </AuraPressable>
      </View>
    </View>
  );
}
