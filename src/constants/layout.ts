export const layoutTokens = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
  },
  radii: {
    large: 24,
    medium: 18,
    pill: 999,
    composer: 28,
  },
  icon: {
    sm: 16,
    md: 20,
    lg: 24,
  },
  type: {
    eyebrow: 12,
    body: 14,
    bodyLarge: 16,
    title: 20,
    hero: 34,
  },
  pagePadding: 20,
  sectionGap: 20,
  cardPadding: 16,
} as const;

export type ResponsiveSizeCategory = "compact" | "regular" | "large";
