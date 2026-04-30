import React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";

import { Fonts } from "@/constants/theme";
import AuraGlassCard from "@/src/components/aura/AuraGlassCard";
import AuraGlowBackground from "@/src/components/aura/AuraGlowBackground";
import AuraGradientButton from "@/src/components/aura/AuraGradientButton";
import { SafeScreen } from "@/src/components/SafeScreen";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export function AuthScaffold({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { colors, theme } = useAppTheme();
  const { width, height } = useWindowDimensions();
  const compactAuth = width < 390 || height < 760;
  const titleSize = compactAuth ? 34 : 38;
  const titleLineHeight = compactAuth ? 38 : 42;
  const contentGap = compactAuth ? 22 : 28;
  const headerGap = compactAuth ? 8 : 10;

  return (
    <AuraGlowBackground>
      <SafeScreen backgroundColor="transparent" includeBottomInset={false} style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 20,
              paddingBottom: compactAuth ? 28 : 36,
              justifyContent: "center",
              gap: contentGap,
            }}
          >
            <View style={{ gap: headerGap }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: theme.typography.eyebrow.fontSize,
                  fontWeight: theme.typography.eyebrow.fontWeight,
                  letterSpacing: theme.typography.eyebrow.letterSpacing,
                  fontFamily: Fonts.sans,
                }}
              >
                {eyebrow}
              </Text>
              <Text style={{ color: colors.text, fontSize: titleSize, fontWeight: "700", lineHeight: titleLineHeight, fontFamily: Fonts.sans }}>
                {title}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 24, fontFamily: Fonts.sans }}>
                {subtitle}
              </Text>
            </View>

            <AuraGlassCard contentStyle={{ padding: 18, gap: 14 }}>
              {children}
            </AuraGlassCard>

            {footer ? <View style={{ gap: 10 }}>{footer}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeScreen>
    </AuraGlowBackground>
  );
}

export function AuthInput(props: React.ComponentProps<typeof TextInput>) {
  const { colors } = useAppTheme();
  const isWeb = Platform.OS === "web";
  const webInputStyle = isWeb
    ? ({
        outlineStyle: "none",
        boxShadow: "none",
        WebkitTextFillColor: colors.background,
        opacity: 1,
      } as const)
    : null;
  return (
    <TextInput
      placeholderTextColor={isWeb ? "rgba(10,10,15,0.42)" : colors.textMuted}
      selectionColor={colors.softPurple}
      {...props}
      style={[
        {
          borderWidth: 1,
          borderColor: isWeb ? "rgba(237,233,227,0.7)" : colors.border,
          borderRadius: 18,
          backgroundColor: isWeb ? colors.ctaCream : colors.inputBackground,
          color: isWeb ? colors.background : colors.textPrimary,
          paddingHorizontal: 16,
          paddingVertical: 16,
          fontSize: 17,
          fontWeight: "700",
          textShadowColor: "transparent",
        },
        webInputStyle as React.ComponentProps<typeof TextInput>["style"],
        props.style,
      ]}
    />
  );
}

export function PrimaryAuthButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  useAppTheme();
  return <AuraGradientButton label={label} onPress={onPress} disabled={disabled} />;
}

export function SecondaryAuthButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 18,
        paddingVertical: 15,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSoft,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

export function AuthInlineLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}>
      <Text style={{ color: colors.softPurple, fontSize: 14, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
