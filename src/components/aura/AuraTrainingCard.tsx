import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraGlassCard from "@/src/components/aura/AuraGlassCard";

export default function AuraTrainingCard({
  colors,
  variant = "home",
  onPress,
}: {
  colors: AppColors;
  variant?: "compact" | "home";
  onPress: () => void;
}) {
  if (variant === "compact") {
    return (
      <AuraGlassCard
        onPress={onPress}
        intensity={20}
        style={{ borderRadius: 18 }}
        contentStyle={{
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderRadius: 18,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={{
                color: colors.lightPurple,
                fontSize: 12.5,
                fontWeight: "600",
                letterSpacing: 0,
              }}
            >
              Train AURA faster
            </Text>
            <Text
              style={{
                color: colors.textSecondary,
                fontSize: 12.5,
                lineHeight: 17,
                opacity: 0.85,
              }}
            >
              Swipe outfit edits →
            </Text>
          </View>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 5,
              backgroundColor: colors.purpleSurface,
              borderWidth: 1,
              borderColor: colors.purpleBorder,
            }}
          >
            <Text style={{ color: colors.lightPurple, fontSize: 10.5, fontWeight: "600" }}>
              TRAIN
            </Text>
          </View>
        </View>
      </AuraGlassCard>
    );
  }

  return (
    <AuraGlassCard
      onPress={onPress}
      auraBorder
      intensity={24}
      style={{ borderRadius: 26 }}
      contentStyle={{
        paddingHorizontal: 18,
        paddingVertical: 18,
        gap: 14,
        borderRadius: 26,
      }}
    >
      <View style={{ gap: 5 }}>
        <Text
          style={{
            color: colors.auraChampagne,
            fontSize: 10.5,
            fontWeight: "600",
            letterSpacing: 1.2,
          }}
        >
          AURA TRAINING
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 22,
            lineHeight: 27,
            fontWeight: "600",
            letterSpacing: 0,
          }}
        >
          Train your style faster
        </Text>
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 13.5,
            lineHeight: 20,
            opacity: 0.88,
            maxWidth: "92%",
          }}
        >
          Swipe through outfit edits so AURA learns what you actually like.
        </Text>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.04)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              backgroundColor: colors.lightPurple,
            }}
          />
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
            Swipe training
          </Text>
        </View>

        <Pressable
          onPress={onPress}
          style={({ pressed }) => ({
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: pressed ? colors.purpleSurfaceStrong : colors.purpleSurface,
            borderWidth: 1,
            borderColor: colors.purpleBorder,
          })}
        >
          <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "600" }}>Open</Text>
        </Pressable>
      </View>
    </AuraGlassCard>
  );
}
