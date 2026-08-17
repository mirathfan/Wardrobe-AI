import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { SafeScreen } from "@/src/components/SafeScreen";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export function ToolScreenScaffold({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <SafeScreen backgroundColor={colors.background} includeTopInset={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          gap: layout.sectionGap,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 30 * layout.titleScale, fontWeight: "900", letterSpacing: 0 }}>
            {title}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22 }}>
            {subtitle}
          </Text>
        </View>
        {children}
      </ScrollView>
    </SafeScreen>
  );
}

export function ToolCard({
  title,
  subtitle,
  children,
  onPress,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const content = (
    <View
      style={{
        borderRadius: layout.largeRadius,
        padding: layout.cardPadding,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 10,
      }}
    >
      <View style={{ gap: subtitle ? 4 : 0 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "900" }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.86 : 1 })}>
      {content}
    </Pressable>
  );
}

export function ToolPrimaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress?: () => void;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: layout.mediumRadius,
        paddingVertical: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.ctaCream,
        opacity: pressed ? 0.88 : 1,
      })}
    >
      <Text style={{ color: colors.ctaText, fontSize: 15, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
}

export function ToolChip({
  label,
}: {
  label: string;
}) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();

  return (
    <View
      style={{
        paddingHorizontal: 13,
        paddingVertical: 9,
        borderRadius: layout.pillRadius,
        backgroundColor: colors.chipBackground,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}
