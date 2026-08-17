import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import {
  auraChipStyle,
  auraChipTextStyle,
  auraSpacing,
} from "@/src/components/ui/auraStylePrimitives";
import type { AuraAgentSuggestedAction } from "@/src/types/auraAgent";

function iconForAction(action: AuraAgentSuggestedAction): keyof typeof Ionicons.glyphMap {
  const label = `${action.id} ${action.label}`.toLowerCase();
  if (action.type === "explain") return "information-circle-outline";
  if (action.type === "refine") return "options-outline";
  if (action.type === "generate") return "sparkles-outline";
  if (action.payload?.action === "plan_outfit") return "calendar-outline";
  if (/\bwear|wore|worn\b/.test(label)) return "shirt-outline";
  if (/\bsave|preference|like|heart\b/.test(label)) return "heart-outline";
  if (/\bless|dislike|not\s+my\s+vibe\b/.test(label)) return "thumbs-down-outline";
  return "chatbubble-ellipses-outline";
}

export default function AuraAgentActionRail({
  actions,
  colors,
  disabled = false,
  loadingActionId = null,
  onAction,
}: {
  actions: AuraAgentSuggestedAction[];
  colors: AppColors;
  disabled?: boolean;
  loadingActionId?: string | null;
  onAction: (action: AuraAgentSuggestedAction) => void;
}) {
  if (!actions.length) return null;

  return (
    <View
      style={{
        alignSelf: "stretch",
        flexDirection: "row",
        flexWrap: "wrap",
        gap: auraSpacing.sm,
        width: "100%",
      }}
    >
      {actions.map((action) => {
        const isLoading = loadingActionId === action.id;
        const isDisabled =
          disabled || action.disabled === true || action.type === "debug" || (!!loadingActionId && !isLoading);
        return (
          <AuraPressable
            key={action.id}
            disabled={isDisabled}
            onPress={() => onAction(action)}
            haptic="selection"
            hapticTrigger="press"
            pressedOpacity={0.84}
            pressedScale={0.98}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ busy: isLoading, disabled: isDisabled }}
            style={{
              ...auraChipStyle(colors, isDisabled ? "disabled" : "unselected"),
              flexDirection: "row",
              flexShrink: 1,
              gap: 6,
              minHeight: 36,
              paddingHorizontal: 12,
            }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Ionicons
                name={iconForAction(action)}
                size={14}
                color={isDisabled ? colors.textMuted : colors.textSecondary}
              />
            )}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                auraChipTextStyle(colors, isDisabled ? "disabled" : "unselected"),
                { maxWidth: 168 },
              ]}
            >
              {action.label}
            </Text>
          </AuraPressable>
        );
      })}
    </View>
  );
}
