import { ThemeTokens } from "@/constants/theme";

const palette = ThemeTokens.dark;

export const auraTheme = {
  backgroundTop: palette.gradients.background[0],
  backgroundMid: palette.gradients.background[1],
  backgroundBottom: palette.gradients.background[2],
  gradientAura: palette.gradients.aura,
  surface: palette.colors.surfaceGlass,
  surfaceStrong: palette.colors.surfaceElevated,
  surfaceSoft: palette.colors.surfaceMuted,
  surfaceSofter: palette.colors.surfaceMuted,
  border: palette.colors.border,
  borderSoft: palette.colors.borderSoft,
  borderAccent: palette.colors.purpleBorder,
  accent: palette.colors.lightPurple,
  accentStrong: palette.colors.textPrimary,
  accentTint: palette.colors.purpleSurface,
  accentTintStrong: palette.colors.purpleSurfaceStrong,
  glow: palette.colors.purpleGlow,
  textMuted: palette.colors.textSecondary,
  textFaint: palette.colors.textMuted,
  userBubble: palette.colors.surfaceElevated,
  userBubbleEdge: palette.colors.borderStrong,
  danger: palette.colors.dangerSurface,
  dangerBorder: palette.colors.dangerBorder,
};

export function auraShadow(opacity = 0.22) {
  return {
    shadowColor: "#000",
    shadowOpacity: opacity,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  } as const;
}
