import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { sanitizeDisplayText } from "@/src/lib/text";

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function ContinueChatCard({
  colors,
  preview,
  title,
  updatedAt,
  onPress,
}: {
  colors: AppColors;
  preview: string;
  title?: string | null;
  updatedAt: number;
  onPress: () => void;
}) {
  const layout = useResponsiveLayout();
  const cleanPreview = sanitizeDisplayText(preview);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: layout.largeRadius,
        padding: layout.cardPadding,
        backgroundColor: colors.surface1,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        opacity: pressed ? 0.86 : 1,
        gap: 12,
      })}
    >
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.iridescentStart, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 }}>
          PICK UP THE THREAD
        </Text>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: -0.5 }} numberOfLines={1} ellipsizeMode="tail">
          {title?.trim() || "Resume your last fitting"}
        </Text>
      </View>

      <Text style={{ color: colors.textSecondary, opacity: 0.65, fontSize: 14, lineHeight: 23 }} numberOfLines={2} ellipsizeMode="tail">
        {cleanPreview}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {formatRelativeTime(updatedAt)}
        </Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "800" }}>Continue in AURA</Text>
        </View>
      </View>
    </Pressable>
  );
}
