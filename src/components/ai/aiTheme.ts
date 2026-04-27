import { ThemeTokens } from "@/constants/theme";

const palette = ThemeTokens.dark;

export const auraTheme = {
  backgroundTop: palette.gradients.background[0],
  backgroundMid: palette.gradients.background[1],
  backgroundBottom: palette.gradients.background[2],
  gradientAura: palette.gradients.aura,
  surface: "rgba(13,16,22,0.84)",
  surfaceStrong: "rgba(16,19,26,0.94)",
  surfaceSoft: "rgba(255,255,255,0.05)",
  surfaceSofter: "rgba(255,255,255,0.028)",
  border: "rgba(255,245,234,0.09)",
  borderSoft: palette.colors.borderSoft,
  borderAccent: "rgba(220,210,255,0.18)",
  accent: palette.colors.auraLavender,
  accentStrong: palette.colors.textPrimary,
  accentTint: "rgba(216,200,255,0.12)",
  accentTintStrong: "rgba(216,200,255,0.18)",
  glow: "rgba(216,200,255,0.18)",
  textMuted: "rgba(247,241,232,0.68)",
  textFaint: "rgba(247,241,232,0.42)",
  userBubble: "rgba(232,222,208,0.15)",
  userBubbleEdge: "rgba(243,223,195,0.18)",
  danger: "rgba(255,120,120,0.16)",
  dangerBorder: "rgba(255,120,120,0.26)",
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
