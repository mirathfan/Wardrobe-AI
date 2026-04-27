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
        backgroundColor: colors.surface1,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        gap: 10,
      }}
    >
      <Text style={{ color: colors.iridescentStart, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }} numberOfLines={1} ellipsizeMode="tail">
        {eyebrow}
      </Text>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.3 }} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
      <Text style={{ color: colors.textSecondary, opacity: 0.65, fontSize: 13, lineHeight: 22 }} numberOfLines={3} ellipsizeMode="tail">{body}</Text>
      {ctaLabel ? (
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 2 }} numberOfLines={1} ellipsizeMode="tail">{ctaLabel} →</Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}>{content}</Pressable>;
}
