import { StyleSheet, type TextStyle, type ViewStyle } from "react-native";

import type { AppColors } from "@/constants/theme";

export const auraSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const auraRadii = {
  sm: 12,
  md: 18,
  lg: 24,
  small: 12,
  medium: 18,
  large: 24,
  xl: 28,
  xxl: 32,
  full: 999,
  pill: 999,
} as const;

export const auraTypography = StyleSheet.create({
  screenTitle: {
    fontSize: 28,
    lineHeight: 35,
    fontWeight: "700",
    letterSpacing: -0.35,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: -0.15,
  },
  body: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "400",
    letterSpacing: 0,
  },
  bodySecondary: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "400",
    letterSpacing: 0,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    letterSpacing: 1.35,
    textTransform: "uppercase",
  },
  chipLabel: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "500",
    letterSpacing: 0,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});

export const auraSurfaceTiers = {
  surfaceBase: {
    backgroundColor: "rgba(24,22,30,0.72)",
    borderColor: "rgba(251,228,216,0.08)",
    borderWidth: 1,
  },
  surfaceRaised: {
    backgroundColor: "rgba(34,31,40,0.86)",
    borderColor: "rgba(251,228,216,0.10)",
    borderWidth: 1,
  },
  surfaceInteractive: {
    backgroundColor: "rgba(42,36,50,0.66)",
    borderColor: "rgba(251,228,216,0.09)",
    borderWidth: 1,
  },
} satisfies Record<string, ViewStyle>;

export type AuraButtonVariant = "primary" | "secondary" | "tertiary" | "danger";
export type AuraButtonSize = "default" | "compact";

export function auraButtonStyle(
  colors: AppColors,
  variant: AuraButtonVariant,
  disabled = false,
  size: AuraButtonSize = "default",
): ViewStyle {
  const isCompact = size === "compact" || variant === "tertiary" || variant === "danger";
  const base: ViewStyle = {
    minHeight: isCompact ? 42 : 52,
    borderRadius: auraRadii.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: isCompact ? auraSpacing.sm : auraSpacing.md,
    paddingVertical: 0,
    borderWidth: 1,
  };

  if (disabled) {
    return {
      ...base,
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.borderSoft,
      opacity: 0.58,
    };
  }

  if (variant === "primary") {
    return {
      ...base,
      backgroundColor: colors.primary,
      borderColor: "rgba(251,228,216,0.14)",
    };
  }

  if (variant === "secondary") {
    return {
      ...base,
      backgroundColor: colors.secondaryCta,
      borderColor: colors.purpleBorder,
    };
  }

  if (variant === "danger") {
    return {
      ...base,
      minHeight: 44,
      backgroundColor: colors.dangerSurface,
      borderColor: colors.dangerBorder,
    };
  }

  return {
    ...base,
    backgroundColor: colors.chipBackground,
    borderColor: colors.border,
  };
}

export function auraButtonTextStyle(
  colors: AppColors,
  variant: AuraButtonVariant,
  disabled = false,
): TextStyle {
  return {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0,
    color: disabled
      ? colors.textMuted
      : variant === "primary"
        ? colors.primaryText
        : variant === "danger"
          ? colors.danger
          : variant === "tertiary"
            ? colors.textSecondary
        : colors.textPrimary,
    textAlign: "center",
  };
}

export {
  AuraButton,
  AuraCard,
  AuraDivider,
  AuraIconButton,
  AuraScreen,
  AuraSectionHeader,
  AuraSheetBackdrop,
  AuraSheetSurface,
  AuraText,
  AuraTopSafeAreaScrim,
  auraDesignTokens,
  auraTextStyle,
  type AuraButtonSize as AuraPrimitiveButtonSize,
  type AuraButtonVariant as AuraPrimitiveButtonVariant,
  type AuraCardPadding,
  type AuraCardVariant as AuraPrimitiveCardVariant,
  type AuraTextTone,
  type AuraTextVariant,
} from "./AuraPrimitives";

export type AuraChipState = "selected" | "unselected" | "disabled" | "metadata" | "filter";

export function auraChipStyle(colors: AppColors, state: AuraChipState = "unselected"): ViewStyle {
  const selected = state === "selected";
  const disabled = state === "disabled";
  const metadata = state === "metadata";
  return {
    minHeight: metadata ? 34 : 40,
    borderRadius: auraRadii.pill,
    paddingHorizontal: metadata ? auraSpacing.sm : auraSpacing.md,
    paddingVertical: 0,
    borderWidth: 1,
    borderColor: selected ? colors.purpleBorder : colors.border,
    backgroundColor: selected
      ? colors.purpleSurface
      : metadata
        ? colors.surfaceInteractive
        : colors.chipBackground,
    alignItems: "center",
    justifyContent: "center",
    opacity: disabled ? 0.5 : 1,
  };
}

export function auraChipTextStyle(colors: AppColors, state: AuraChipState = "unselected"): TextStyle {
  return {
    ...auraTypography.chipLabel,
    color: state === "selected" ? colors.ctaCream : colors.textSecondary,
    textAlign: "center",
  };
}

export type AuraCardVariant = "largeGlass" | "card" | "inset" | "itemTile" | "sheet";

export function auraCardStyle(colors: AppColors, variant: AuraCardVariant = "card"): ViewStyle {
  if (variant === "largeGlass") {
    return {
      borderRadius: auraRadii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.glass,
      padding: auraSpacing.lg,
    };
  }

  if (variant === "inset") {
    return {
      borderRadius: auraRadii.medium,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceInteractive,
      padding: auraSpacing.md,
    };
  }

  if (variant === "itemTile") {
    return {
      borderRadius: auraRadii.large,
      borderWidth: 1,
      borderColor: colors.borderSoft,
      backgroundColor: colors.surfaceBase,
      overflow: "hidden",
    };
  }

  if (variant === "sheet") {
    return {
      borderRadius: auraRadii.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceRaised,
      padding: auraSpacing.md,
    };
  }

  return {
    borderRadius: auraRadii.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceBase,
    padding: auraSpacing.md,
  };
}

export function auraSheetBackdropStyle(colors: AppColors): ViewStyle {
  return {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "flex-end",
  };
}
