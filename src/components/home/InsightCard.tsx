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
        backgroundColor: "rgba(255,255,255,0.045)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        gap: 8,
      }}
    >
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 }} numberOfLines={1} ellipsizeMode="tail">
        {eyebrow}
      </Text>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 20 }} numberOfLines={3} ellipsizeMode="tail">{body}</Text>
      {ctaLabel ? (
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 4 }} numberOfLines={1} ellipsizeMode="tail">{ctaLabel}</Text>
      ) : null}
    </View>
  );

  if (!onPress) return content;
  return <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.84 : 1 })}>{content}</Pressable>;
}
