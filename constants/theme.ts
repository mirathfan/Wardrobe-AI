/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

const tintColor = "#E9E3D5";

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
    background: "#080808",
    surface: "rgba(15, 17, 22, 0.92)",
    surfaceGlass: "rgba(24, 28, 36, 0.62)",
    surface1: "#111111",
    surface2: "#1A1A1A",
    surface3: "#222222",
    surfaceWarm: "#130F0A",
    warmGlow: "rgba(200,160,120,0.04)",
    textPrimary: "#F7F1E8",
    textSecondary: "#AEA9B3",
    borderSoft: "rgba(255, 245, 234, 0.11)",
    auraPink: "#F3BEDD",
    auraChampagne: "#F3DFC3",
    auraBlue: "#B8D9FF",
    auraLavender: "#D8C8FF",
    iridescentStart: "#C084FC",
    iridescentMid: "#A78BFA",
    iridescentEnd: "#818CF8",
  },
  gradients: {
    aura: ["#F3DFC3", "#F3BEDD", "#D8C8FF", "#B8D9FF"] as const,
    background: ["#020304", "#06080D", "#0A0D14"] as const,
  },
  shadows: {
    auraGlow: "rgba(214, 199, 255, 0.24)",
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
    surface: "#11141A",
    surfaceGlass: auraTokens.colors.surfaceGlass,
    card: "rgba(16,18,24,0.92)",
    input: "rgba(14,17,24,0.94)",
    surface1: auraTokens.colors.surface1,
    surface2: auraTokens.colors.surface2,
    surface3: auraTokens.colors.surface3,
    surfaceWarm: auraTokens.colors.surfaceWarm,
    warmGlow: auraTokens.colors.warmGlow,
    text: auraTokens.colors.textPrimary,
    textPrimary: auraTokens.colors.textPrimary,
    textSecondary: auraTokens.colors.textSecondary,
    border: "rgba(255,245,234,0.09)",
    borderSoft: auraTokens.colors.borderSoft,
    tint: tintColor,
    accent: "#EDE6D8",
    accentSoft: "rgba(227,216,198,0.12)",
    auraPink: auraTokens.colors.auraPink,
    auraChampagne: auraTokens.colors.auraChampagne,
    auraBlue: auraTokens.colors.auraBlue,
    auraLavender: auraTokens.colors.auraLavender,
    iridescentStart: auraTokens.colors.iridescentStart,
    iridescentMid: auraTokens.colors.iridescentMid,
    iridescentEnd: auraTokens.colors.iridescentEnd,
    success: "#7BC8A4",
    warning: "#D7B47E",
    danger: "#F19999",
    muted: "#1E232C",
    shadow: "rgba(0,0,0,0.42)",
    overlay: "rgba(7,9,13,0.58)",
    glassBorder: "rgba(255,245,234,0.12)",
    glassInnerBorder: "rgba(255,255,255,0.05)",
    glassEdge: "rgba(255,255,255,0.14)",
    lens: "rgba(255,255,255,0.10)",
    lensInner: "rgba(255,255,255,0.04)",
    scrimTop: "rgba(5,6,8,0)",
    scrimMid: "rgba(5,6,8,0.22)",
    scrimBottom: "rgba(5,6,8,0.46)",
    dockIcon: "rgba(247,241,232,0.72)",
    aiAccent: "#D9CFFF",
    icon: "#B7B0BA",
    tabIconDefault: "#9F99A2",
    tabIconSelected: tintColor,
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
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
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
