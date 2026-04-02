/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#8bd3ff';

export const Colors = {
  light: {
    background: '#f7f7f8',
    surface: '#ffffff',
    card: '#ffffff',
    input: '#ffffff',
    text: '#11181C',
    textSecondary: '#64748b',
    border: '#e5e7eb',
    tint: tintColorLight,
    accent: '#111827',
    accentSoft: '#f5f8ff',
    success: '#0a7a5a',
    warning: '#b7791f',
    danger: '#c0392b',
    muted: '#f3f4f6',
    shadow: 'rgba(15,23,42,0.12)',
    overlay: 'rgba(255,255,255,0.16)',
    glassBorder: 'rgba(255,255,255,0.30)',
    glassInnerBorder: 'rgba(0,0,0,0.06)',
    glassEdge: 'rgba(255,255,255,0.60)',
    lens: 'rgba(255,255,255,0.22)',
    lensInner: 'rgba(255,255,255,0.10)',
    scrimTop: 'rgba(255,255,255,0)',
    scrimMid: 'rgba(255,255,255,0.20)',
    scrimBottom: 'rgba(255,255,255,0.36)',
    dockIcon: 'rgba(15,23,42,0.55)',
    aiAccent: '#6366f1',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    background: '#101215',
    surface: '#171a1f',
    card: '#1a1e24',
    input: '#171a1f',
    text: '#ECEDEE',
    textSecondary: '#9aa4b2',
    border: '#2b313a',
    tint: tintColorDark,
    accent: '#e5e7eb',
    accentSoft: '#182233',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    muted: '#222833',
    shadow: 'rgba(0,0,0,0.35)',
    overlay: 'rgba(12,16,24,0.56)',
    glassBorder: 'rgba(255,255,255,0.10)',
    glassInnerBorder: 'rgba(255,255,255,0.05)',
    glassEdge: 'rgba(255,255,255,0.12)',
    lens: 'rgba(255,255,255,0.08)',
    lensInner: 'rgba(255,255,255,0.04)',
    scrimTop: 'rgba(16,18,21,0)',
    scrimMid: 'rgba(16,18,21,0.26)',
    scrimBottom: 'rgba(16,18,21,0.44)',
    dockIcon: 'rgba(236,237,238,0.70)',
    aiAccent: '#8b9dff',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export type AppColors = typeof Colors.light;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
