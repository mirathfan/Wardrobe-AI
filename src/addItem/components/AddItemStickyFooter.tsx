import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";

import { auraButtonStyle, auraButtonTextStyle } from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const AddItemStickyFooter = React.memo(function AddItemStickyFooter({
  currentStep,
  bottomPadding,
  statusText,
  buttonText,
  canContinue,
  onBack,
  onForward,
}: {
  currentStep: number;
  bottomPadding: number;
  statusText: string;
  buttonText: string;
  canContinue: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: "rgba(251,228,216,0.10)",
        backgroundColor: "rgba(9,0,11,0.88)",
        paddingHorizontal: 16,
        paddingTop: 10,
        paddingBottom: bottomPadding,
        gap: 9,
      }}
    >
      <Text
        style={{
          color: canContinue ? colors.textSecondary : colors.warning,
          fontSize: 12,
          lineHeight: 17,
          fontWeight: "700",
        }}
        numberOfLines={2}
      >
        {statusText}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {currentStep > 0 ? (
          <Pressable
            onPress={onBack}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: "rgba(43,18,76,0.42)",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name="chevron-back" size={19} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onForward}
          disabled={!canContinue}
          style={({ pressed }) => [
            auraButtonStyle(colors, "primary", !canContinue),
            {
              flex: 1,
              minHeight: 56,
              opacity: canContinue && pressed ? 0.86 : !canContinue ? 0.58 : 1,
            },
          ]}
        >
          <Text style={auraButtonTextStyle(colors, "primary", !canContinue)} numberOfLines={1}>
            {buttonText}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});
