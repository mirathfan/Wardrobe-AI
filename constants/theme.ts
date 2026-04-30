import { Platform } from "react-native";

const tintColor = "#7C5CFF";

const auraSpacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

const auraTypography = {
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2.4,
    fontWeight: "700" as const,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500" as const,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "500" as const,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  hero: {
    fontSize: 46,
    lineHeight: 52,
    fontWeight: "700" as const,
  },
  wordmark: {
    fontSize: 28,
    letterSpacing: 11,
    fontWeight: "500" as const,
  },
} as const;

const auraTokens = {
  colors: {
    background: "#0A0A0F",
    surface: "#11131A",
    surfaceSoft: "#151826",
    surfaceElevated: "#191B26",
    surfaceGlass: "rgba(10,10,15,0.86)",
    surface1: "#11131A",
    surface2: "#151826",
    surface3: "#191B26",
    surfaceWarm: "#151826",
    warmGlow: "rgba(124,92,255,0.08)",
    textPrimary: "#FFFFFF",
    textSecondary: "#A1A1AA",
    textMuted: "#6B7280",
    primaryPurple: "#5B3FD6",
    softPurple: "#7C5CFF",
    lightPurple: "#A78BFA",
    ctaCream: "#EDE9E3",
    outfitBoardBackground: "#F5F2ED",
    border: "rgba(255,255,255,0.08)",
    borderStrong: "rgba(255,255,255,0.14)",
    purpleBorder: "rgba(124,92,255,0.25)",
    purpleGlow: "rgba(124,92,255,0.18)",
    purpleSurface: "rgba(124,92,255,0.12)",
    purpleSurfaceStrong: "rgba(124,92,255,0.18)",
    chipBackground: "rgba(255,255,255,0.05)",
    inputBackground: "rgba(255,255,255,0.06)",
    dockBackground: "rgba(10,10,15,0.86)",
    danger: "#FF4D4F",
    success: "#22C55E",
    warning: "#F59E0B",
    auraPink: "#A78BFA",
    auraChampagne: "#EDE9E3",
    auraBlue: "#A78BFA",
    auraLavender: "#A78BFA",
    iridescentStart: "#5B3FD6",
    iridescentMid: "#7C5CFF",
    iridescentEnd: "#A78BFA",
    borderSoft: "rgba(255,255,255,0.08)",
  },
  gradients: {
    aura: ["#5B3FD6", "#7C5CFF", "#A78BFA", "#EDE9E3"] as const,
    background: ["#0A0A0F", "#0E1018", "#151826"] as const,
  },
  shadows: {
    auraGlow: "rgba(124,92,255,0.18)",
  },
  radii: {
    card: 28,
    pill: 999,
    button: 20,
  },
  spacing: auraSpacing,
  typography: auraTypography,
} as const;

function buildPalette() {
  return {
    background: auraTokens.colors.background,
    surface: auraTokens.colors.surface,
    surfaceSoft: auraTokens.colors.surfaceSoft,
    surfaceElevated: auraTokens.colors.surfaceElevated,
    surfaceGlass: auraTokens.colors.surfaceGlass,
    card: auraTokens.colors.surface,
    input: auraTokens.colors.inputBackground,
    inputBackground: auraTokens.colors.inputBackground,
    chipBackground: auraTokens.colors.chipBackground,
    surface1: auraTokens.colors.surface1,
    surface2: auraTokens.colors.surface2,
    surface3: auraTokens.colors.surface3,
    surfaceWarm: auraTokens.colors.surfaceWarm,
    warmGlow: auraTokens.colors.warmGlow,
    text: auraTokens.colors.textPrimary,
    textPrimary: auraTokens.colors.textPrimary,
    textSecondary: auraTokens.colors.textSecondary,
    textMuted: auraTokens.colors.textMuted,
    border: auraTokens.colors.border,
    borderStrong: auraTokens.colors.borderStrong,
    borderSoft: auraTokens.colors.borderSoft,
    purpleBorder: auraTokens.colors.purpleBorder,
    purpleGlow: auraTokens.colors.purpleGlow,
    purpleSurface: auraTokens.colors.purpleSurface,
    purpleSurfaceStrong: auraTokens.colors.purpleSurfaceStrong,
    tint: tintColor,
    accent: auraTokens.colors.ctaCream,
    accentSoft: auraTokens.colors.purpleSurface,
    primaryPurple: auraTokens.colors.primaryPurple,
    softPurple: auraTokens.colors.softPurple,
    lightPurple: auraTokens.colors.lightPurple,
    ctaCream: auraTokens.colors.ctaCream,
    ctaText: auraTokens.colors.background,
    outfitBoardBackground: auraTokens.colors.outfitBoardBackground,
    auraPink: auraTokens.colors.auraPink,
    auraChampagne: auraTokens.colors.auraChampagne,
    auraBlue: auraTokens.colors.auraBlue,
    auraLavender: auraTokens.colors.auraLavender,
    iridescentStart: auraTokens.colors.iridescentStart,
    iridescentMid: auraTokens.colors.iridescentMid,
    iridescentEnd: auraTokens.colors.iridescentEnd,
    success: auraTokens.colors.success,
    warning: auraTokens.colors.warning,
    danger: auraTokens.colors.danger,
    muted: auraTokens.colors.surfaceElevated,
    shadow: "rgba(0,0,0,0.42)",
    overlay: "rgba(10,10,15,0.72)",
    glassBorder: auraTokens.colors.border,
    glassInnerBorder: "rgba(255,255,255,0.05)",
    glassEdge: "rgba(255,255,255,0.08)",
    lens: auraTokens.colors.purpleSurfaceStrong,
    lensInner: "rgba(255,255,255,0.05)",
    scrimTop: "rgba(10,10,15,0)",
    scrimMid: "rgba(10,10,15,0.28)",
    scrimBottom: "rgba(10,10,15,0.62)",
    dockBackground: auraTokens.colors.dockBackground,
    dockIcon: auraTokens.colors.textSecondary,
    aiAccent: auraTokens.colors.lightPurple,
    icon: auraTokens.colors.textSecondary,
    tabIconDefault: auraTokens.colors.textMuted,
    tabIconSelected: auraTokens.colors.softPurple,
  };
}

export const ThemeTokens = {
  light: auraTokens,
  dark: auraTokens,
} as const;

export const Colors = {
  light: buildPalette(),
  dark: buildPalette(),
} as const;

export type AppColors = typeof Colors.dark;
export type AppThemeTokens = typeof ThemeTokens.dark;

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
