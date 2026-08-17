import React from "react";
import { Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { homeTypography } from "@/src/components/home/homeTypography";
import { auraSurfaceTiers } from "@/src/components/ui/auraStylePrimitives";
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
    <AuraPressable
      onPress={onPress}
      haptic="selection"
      hapticTrigger="press"
      pressedScale={0.985}
      pressedOpacity={0.88}
      style={{
        borderRadius: layout.largeRadius,
        padding: layout.cardPadding,
        ...auraSurfaceTiers.surfaceInteractive,
        gap: 12,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text style={[homeTypography.label, { color: colors.lightPurple }]}>
          PICK UP WHERE YOU LEFT OFF
        </Text>
        <Text style={[homeTypography.titleMedium, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
          Continue your styling thread
        </Text>
      </View>

      <Text style={[homeTypography.body, { color: colors.textSecondary, opacity: 0.8 }]} numberOfLines={2} ellipsizeMode="tail">
        {cleanPreview}
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={[homeTypography.caption, { color: colors.textSecondary }]}>
          {formatRelativeTime(updatedAt)}
        </Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: colors.purpleSurface,
            borderWidth: 1,
            borderColor: colors.purpleBorder,
          }}
        >
          <Text style={[homeTypography.caption, { color: colors.text, fontWeight: "600" }]}>Continue in AURA</Text>
        </View>
      </View>
    </AuraPressable>
  );
}
