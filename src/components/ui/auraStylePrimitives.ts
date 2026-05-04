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
} as const;

export const auraRadii = {
  small: 12,
  medium: 18,
  large: 24,
  xl: 28,
  pill: 999,
} as const;

export const auraTypography = StyleSheet.create({
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: 0,
  },
  sectionTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    letterSpacing: 0,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    letterSpacing: 0,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
    letterSpacing: 0,
  },
  bodySecondary: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    letterSpacing: 0,
  },
  eyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  chipLabel: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    letterSpacing: 0,
  },
});

export const auraSurfaceTiers = {
  surfaceBase: {
    backgroundColor: "rgba(43,18,76,0.46)",
    borderColor: "rgba(251,228,216,0.10)",
    borderWidth: 1,
  },
  surfaceRaised: {
    backgroundColor: "rgba(43,18,76,0.55)",
    borderColor: "rgba(251,228,216,0.12)",
    borderWidth: 1,
  },
  surfaceInteractive: {
    backgroundColor: "rgba(82,43,91,0.28)",
    borderColor: "rgba(251,228,216,0.12)",
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
    minHeight: isCompact ? 42 : 56,
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
      backgroundColor: "rgba(82,43,91,0.18)",
      borderColor: "rgba(251,228,216,0.08)",
      opacity: 0.58,
    };
  }

  if (variant === "primary") {
    return {
      ...base,
      backgroundColor: colors.primary,
      borderColor: "rgba(251,228,216,0.18)",
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
    fontWeight: "900",
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
