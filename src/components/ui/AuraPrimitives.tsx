import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Text,
  type TextProps,
  type TextStyle,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { AppColors } from "@/constants/theme";
import { Fonts } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { SafeScreen } from "@/src/components/SafeScreen";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const auraDesignTokens = {
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
  },
  radii: {
    sm: 12,
    md: 18,
    lg: 24,
    xl: 28,
    xxl: 32,
    full: 999,
  },
  shadows: {
    subtle: {
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    } satisfies ViewStyle,
    elevated: {
      shadowColor: "#000",
      shadowOpacity: 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 16 },
      elevation: 6,
    } satisfies ViewStyle,
  },
  motion: {
    fast: 120,
    normal: 180,
    slow: 280,
    pressScale: 0.97,
  },
} as const;

export type AuraTextVariant =
  | "hero"
  | "title"
  | "heading"
  | "section"
  | "body"
  | "bodyStrong"
  | "caption"
  | "metadata"
  | "button";

export type AuraTextTone =
  | "primary"
  | "secondary"
  | "muted"
  | "accent"
  | "destructive"
  | "success";

const auraTextVariants: Record<AuraTextVariant, TextStyle> = {
  hero: {
    fontSize: 38,
    lineHeight: 45,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 30,
    lineHeight: 37,
    fontWeight: "700",
    letterSpacing: -0.45,
  },
  heading: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  section: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "600",
    letterSpacing: -0.15,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "400",
    letterSpacing: 0,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400",
    letterSpacing: 0,
  },
  metadata: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    letterSpacing: 1.25,
  },
  button: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
};

function auraToneColor(colors: AppColors, tone: AuraTextTone) {
  if (tone === "secondary") return colors.textSecondary;
  if (tone === "muted") return colors.textMuted;
  if (tone === "accent") return colors.accent;
  if (tone === "destructive") return colors.destructive;
  if (tone === "success") return colors.success;
  return colors.textPrimary;
}

export function auraTextStyle(
  colors: AppColors,
  variant: AuraTextVariant = "body",
  tone: AuraTextTone = "primary",
): TextStyle {
  return {
    ...(Fonts.sans ? { fontFamily: Fonts.sans } : null),
    color: auraToneColor(colors, tone),
    ...auraTextVariants[variant],
  };
}

export function AuraText({
  variant = "body",
  tone = "primary",
  style,
  children,
  ...props
}: TextProps & {
  variant?: AuraTextVariant;
  tone?: AuraTextTone;
}) {
  const { colors } = useAppTheme();

  return (
    <Text {...props} style={[auraTextStyle(colors, variant, tone), style]}>
      {children}
    </Text>
  );
}

type AuraPressableProps = React.ComponentProps<typeof AuraPressable>;

export type AuraButtonVariant = "primary" | "secondary" | "tertiary" | "ghost" | "destructive";
export type AuraButtonSize = "default" | "compact" | "small";

function buttonHeight(size: AuraButtonSize) {
  if (size === "small") return 34;
  if (size === "compact") return 42;
  return 52;
}

function buttonPadding(size: AuraButtonSize) {
  if (size === "small") return 10;
  if (size === "compact") return 14;
  return 18;
}

function auraButtonColors(colors: AppColors, variant: AuraButtonVariant, disabled?: boolean) {
  if (disabled) {
    return {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.borderSoft,
      textColor: colors.textMuted,
      iconColor: colors.textMuted,
    };
  }

  if (variant === "primary") {
    return {
      backgroundColor: colors.accent,
      borderColor: colors.borderStrong,
      textColor: colors.primaryText,
      iconColor: colors.primaryText,
    };
  }

  if (variant === "secondary") {
    return {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.borderStrong,
      textColor: colors.textPrimary,
      iconColor: colors.textPrimary,
    };
  }

  if (variant === "destructive") {
    return {
      backgroundColor: colors.dangerSurface,
      borderColor: colors.dangerBorder,
      textColor: colors.destructive,
      iconColor: colors.destructive,
    };
  }

  if (variant === "ghost") {
    return {
      backgroundColor: "transparent",
      borderColor: "transparent",
      textColor: colors.textSecondary,
      iconColor: colors.textSecondary,
    };
  }

  return {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    textColor: colors.textSecondary,
    iconColor: colors.textSecondary,
  };
}

export function AuraButton({
  label,
  children,
  iconLeft,
  iconRight,
  variant = "primary",
  size = "default",
  fullWidth = false,
  disabled,
  style,
  textStyle,
  ...props
}: Omit<AuraPressableProps, "children" | "style"> & {
  label?: string;
  children?: React.ReactNode;
  iconLeft?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  variant?: AuraButtonVariant;
  size?: AuraButtonSize;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { colors } = useAppTheme();
  const isDisabled = !!disabled;
  const palette = auraButtonColors(colors, variant, isDisabled);
  const minHeight = buttonHeight(size);
  const horizontalPadding = buttonPadding(size);

  return (
    <AuraPressable
      {...props}
      disabled={disabled}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityLabel={props.accessibilityLabel ?? label}
      pressedScale={props.pressedScale ?? auraDesignTokens.motion.pressScale}
      style={[
        {
          minHeight,
          borderRadius: auraDesignTokens.radii.full,
          paddingHorizontal: horizontalPadding,
          paddingVertical: 0,
          borderWidth: 1,
          borderColor: palette.borderColor,
          backgroundColor: palette.backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: auraDesignTokens.spacing.xs,
          alignSelf: fullWidth ? "stretch" : "auto",
          opacity: isDisabled ? 0.62 : 1,
        },
        style,
      ]}
    >
      {iconLeft ? <Ionicons name={iconLeft} size={size === "small" ? 13 : 16} color={palette.iconColor} /> : null}
      {children ?? (
        <Text
          numberOfLines={1}
          style={[
            auraTextStyle(colors, "button"),
            {
              color: palette.textColor,
              fontSize: size === "small" ? 12 : 15,
              lineHeight: size === "small" ? 16 : 20,
            },
            textStyle,
          ]}
        >
          {label}
        </Text>
      )}
      {iconRight ? <Ionicons name={iconRight} size={size === "small" ? 13 : 16} color={palette.iconColor} /> : null}
    </AuraPressable>
  );
}

export function AuraIconButton({
  icon,
  label,
  variant = "tertiary",
  size = "compact",
  disabled,
  style,
  ...props
}: Omit<AuraPressableProps, "children" | "style"> & {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  variant?: AuraButtonVariant;
  size?: AuraButtonSize;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const isDisabled = !!disabled;
  const palette = auraButtonColors(colors, variant, isDisabled);
  const dimension = size === "small" ? 34 : size === "compact" ? 42 : 52;

  return (
    <AuraPressable
      {...props}
      hitSlop={props.hitSlop ?? (dimension < 44 ? 8 : 4)}
      disabled={disabled}
      accessibilityRole={props.accessibilityRole ?? "button"}
      accessibilityLabel={props.accessibilityLabel ?? label}
      pressedScale={props.pressedScale ?? auraDesignTokens.motion.pressScale}
      style={[
        {
          width: dimension,
          height: dimension,
          borderRadius: auraDesignTokens.radii.full,
          borderWidth: 1,
          borderColor: palette.borderColor,
          backgroundColor: palette.backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          opacity: isDisabled ? 0.62 : 1,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={size === "small" ? 15 : 18} color={palette.iconColor} />
    </AuraPressable>
  );
}

export type AuraCardVariant = "solid" | "elevated" | "muted" | "glass" | "inset" | "sheet";
export type AuraCardPadding = "none" | "sm" | "md" | "lg";

function cardPadding(padding: AuraCardPadding) {
  if (padding === "none") return 0;
  if (padding === "sm") return auraDesignTokens.spacing.sm;
  if (padding === "lg") return auraDesignTokens.spacing.lg;
  return auraDesignTokens.spacing.md;
}

function auraCardBase(colors: AppColors, variant: AuraCardVariant): ViewStyle {
  if (variant === "elevated") {
    return {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.borderStrong,
      ...auraDesignTokens.shadows.subtle,
    };
  }

  if (variant === "muted" || variant === "inset") {
    return {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
    };
  }

  if (variant === "glass") {
    return {
      backgroundColor: colors.glass,
      borderColor: colors.border,
    };
  }

  if (variant === "sheet") {
    return {
      backgroundColor: colors.surfaceElevated,
      borderColor: colors.borderStrong,
      ...auraDesignTokens.shadows.elevated,
    };
  }

  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };
}

export function AuraCard({
  variant = "solid",
  padding = "md",
  radius = "lg",
  style,
  children,
  ...props
}: ViewProps & {
  variant?: AuraCardVariant;
  padding?: AuraCardPadding;
  radius?: keyof typeof auraDesignTokens.radii;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      {...props}
      style={[
        {
          borderRadius: auraDesignTokens.radii[radius],
          borderWidth: 1,
          padding: cardPadding(padding),
        },
        auraCardBase(colors, variant),
        variant === "inset" ? { borderRadius: auraDesignTokens.radii.md } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AuraDivider({
  inset = 0,
  style,
}: {
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        {
          height: 1,
          marginHorizontal: inset,
          backgroundColor: colors.borderSoft,
        },
        style,
      ]}
    />
  );
}

export function AuraSectionHeader({
  title,
  eyebrow,
  subtitle,
  actionLabel,
  actionIcon,
  onAction,
  style,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  actionLabel?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: auraDesignTokens.spacing.xs }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: auraDesignTokens.spacing.md }}>
        <View style={{ flex: 1, gap: 3 }}>
          {eyebrow ? (
            <AuraText variant="metadata" tone="accent" numberOfLines={1} style={{ textTransform: "uppercase" }}>
              {eyebrow}
            </AuraText>
          ) : null}
          <AuraText variant="section" numberOfLines={1}>
            {title}
          </AuraText>
        </View>
        {actionLabel && onAction ? (
          <AuraButton
            label={actionLabel}
            iconRight={actionIcon}
            onPress={onAction}
            variant="ghost"
            size="small"
            haptic="selection"
            hapticTrigger="press"
          />
        ) : null}
      </View>
      {subtitle ? (
        <AuraText variant="caption" tone="secondary">
          {subtitle}
        </AuraText>
      ) : null}
    </View>
  );
}

export function AuraSheetBackdrop({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={[{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }, style]}>
      {children}
    </View>
  );
}

export function AuraSheetSurface({
  style,
  children,
  ...props
}: ViewProps) {
  return (
    <AuraCard {...props} variant="sheet" radius="xl" padding="md" style={style}>
      {children}
    </AuraCard>
  );
}

export function AuraTopSafeAreaScrim({
  color,
  heightOffset = 0,
  style,
}: {
  color?: string;
  heightOffset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: Math.max(0, insets.top + heightOffset),
          backgroundColor: color ?? colors.background,
          zIndex: 100,
        },
        style,
      ]}
    />
  );
}

export function AuraScreen({
  backgroundColor,
  children,
  ...props
}: React.ComponentProps<typeof SafeScreen>) {
  const { colors } = useAppTheme();

  return (
    <SafeScreen {...props} backgroundColor={backgroundColor ?? colors.background}>
      {children}
    </SafeScreen>
  );
}
