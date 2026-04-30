import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
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
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 12,
      }}
    >
      <Text style={{ color: colors.softPurple, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }} numberOfLines={1} ellipsizeMode="tail">
        {eyebrow}
      </Text>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 }} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
      <Text style={{ color: colors.textSecondary, opacity: 0.86, fontSize: 13, lineHeight: 21 }} numberOfLines={2} ellipsizeMode="tail">{body}</Text>
      {ctaLabel ? (
        <View
          style={{
            alignSelf: "flex-start",
            marginTop: 2,
            borderRadius: layout.pillRadius,
            backgroundColor: colors.ctaCream,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: colors.ctaText, fontSize: 13, fontWeight: "900" }} numberOfLines={1} ellipsizeMode="tail">{ctaLabel} →</Text>
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}>{content}</Pressable>;
}
