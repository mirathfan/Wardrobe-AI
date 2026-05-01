import React from "react";
import { Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraGlassCard from "@/src/components/aura/AuraGlassCard";
import AuraGradientButton from "@/src/components/aura/AuraGradientButton";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import { homeTypography } from "@/src/components/home/homeTypography";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { AuraLook, AuraLookAction } from "@/src/types/aura";

export default function AuraLookModule({
  colors,
  look,
  itemsById,
  onAskAura,
  onAction,
  eyebrow = "AURA RECOMMENDS",
  title = "Recommended look for today",
  subtitle,
  fallbackTitle = "Complete the look",
  fallbackBody,
  primaryPrompt,
  secondaryPrompt,
}: {
  colors: AppColors;
  look: AuraLook | null;
  itemsById: Map<string, ClothingItem>;
  onAskAura: (prompt?: string) => void;
  onAction?: (action: AuraLookAction, look: AuraLook) => void;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  fallbackTitle?: string;
  fallbackBody?: string;
  primaryPrompt?: string;
  secondaryPrompt?: string;
}) {
  const layout = useResponsiveLayout();

  if (!look) {
    return (
      <AuraGlassCard
        auraBorder
        style={{
          borderRadius: layout.largeRadius,
          gap: 12,
        }}
      >
        <View style={{ padding: layout.cardPadding, gap: 12 }}>
        <View style={{ gap: 4 }}>
          <Text style={[homeTypography.label, { color: colors.lightPurple }]}>
            {eyebrow}
          </Text>
          <Text style={[homeTypography.titleMedium, { color: colors.text }]}>
            {fallbackTitle}
          </Text>
          <Text style={[homeTypography.body, { color: colors.textSecondary, opacity: 0.8 }]}>
            {fallbackBody ?? "Ask AURA for a date look, a casual look, or a sharper outfit and Home will surface the visual recommendation here."}
          </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <AuraGradientButton
              label="Build a look"
              onPress={() => onAskAura(primaryPrompt ?? "Build a casual look with a visual outfit recommendation.")}
            />
          </View>
          <AuraPressable
            onPress={() => onAskAura(secondaryPrompt ?? "Find gaps in my wardrobe and show a hybrid visual look.")}
            haptic="selection"
            hapticTrigger="press"
            pressedScale={0.97}
            pressedOpacity={0.88}
            style={{
              flex: 1,
              borderRadius: layout.mediumRadius,
              paddingVertical: 13,
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.04)",
              borderWidth: 1,
              borderColor: "rgba(243,223,195,0.14)",
            }}
          >
            <Text style={[homeTypography.buttonText, { color: colors.text }]}>Find gaps</Text>
          </AuraPressable>
        </View>
        </View>
      </AuraGlassCard>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 3 }}>
        <Text style={[homeTypography.label, { color: colors.lightPurple }]}>
          {eyebrow}
        </Text>
        <Text style={[homeTypography.titleMedium, { color: colors.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[homeTypography.bodySmall, { color: colors.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <AuraLookCard
        colors={colors}
        look={look}
        itemsById={itemsById}
        onAction={onAction}
        boardVariant="home"
        viewportWidth={layout.width - layout.horizontalPadding * 2}
      />
    </View>
  );
}
