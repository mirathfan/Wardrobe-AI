import React from "react";
import { Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { homeTypography } from "@/src/components/home/homeTypography";
import { auraButtonStyle, auraButtonTextStyle, auraSurfaceTiers } from "@/src/components/ui/auraStylePrimitives";
import { CTA_HEIGHT, CTA_HORIZONTAL_PADDING, PILL_RADIUS } from "@/src/constants/auraControls";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export default function InsightCard({
  colors,
  eyebrow,
  title,
  body,
  ctaLabel,
  onPress,
}: {
  colors: AppColors;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel?: string;
  onPress?: () => void;
}) {
  const layout = useResponsiveLayout();
  const content = (
    <View
      style={{
        borderRadius: layout.mediumRadius,
        padding: layout.cardPadding,
        ...auraSurfaceTiers.surfaceBase,
        gap: 12,
      }}
    >
      <Text style={[homeTypography.label, { color: colors.lightPurple }]} numberOfLines={1} ellipsizeMode="tail">
        {eyebrow}
      </Text>
      <Text style={[homeTypography.titleSmall, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
      <Text style={[homeTypography.bodySmall, { color: colors.textSecondary, opacity: 0.86 }]} numberOfLines={2} ellipsizeMode="tail">{body}</Text>
      {ctaLabel ? (
        <View
          style={{
            alignSelf: "flex-start",
            marginTop: 2,
            ...auraButtonStyle(colors, "primary"),
            borderRadius: PILL_RADIUS,
            minHeight: CTA_HEIGHT,
            paddingHorizontal: CTA_HORIZONTAL_PADDING,
            paddingVertical: 0,
          }}
        >
          <Text style={[auraButtonTextStyle(colors, "primary"), { fontSize: 13, lineHeight: 17 }]} numberOfLines={1} ellipsizeMode="tail">{ctaLabel} →</Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.985}
      pressedOpacity={0.88}
    >
      {content}
    </AuraPressable>
  );
}
