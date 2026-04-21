import React from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

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
  const { colors } = useAppTheme();

  return (
    <SafeScreen backgroundColor={colors.background} includeBottomInset={false} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
            paddingBottom: 36,
            justifyContent: "center",
            gap: 28,
          }}
        >
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.aiAccent, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 }}>
              {eyebrow}
            </Text>
            <Text style={{ color: colors.text, fontSize: 38, fontWeight: "900", lineHeight: 42 }}>
              {title}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 16, lineHeight: 24 }}>
              {subtitle}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.04)",
              borderRadius: 28,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              padding: 18,
              gap: 14,
            }}
          >
            {children}
          </View>

          {footer ? <View style={{ gap: 10 }}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

export function AuthInput(props: React.ComponentProps<typeof TextInput>) {
  const { colors } = useAppTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textSecondary}
      {...props}
      style={[
        {
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          borderRadius: 18,
          backgroundColor: "rgba(255,255,255,0.03)",
          color: colors.text,
          paddingHorizontal: 16,
          paddingVertical: 15,
          fontSize: 16,
        },
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
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        borderRadius: 18,
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.aiAccent,
        opacity: disabled ? 0.55 : pressed ? 0.86 : 1,
      })}
    >
      <Text style={{ color: "#071018", fontSize: 16, fontWeight: "900" }}>{label}</Text>
    </Pressable>
  );
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
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.03)",
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
      <Text style={{ color: colors.aiAccent, fontSize: 14, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}

