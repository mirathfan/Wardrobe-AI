import { Colors, ThemeTokens, type AppColors, type AppThemeTokens } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function useAppTheme() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  const colors: AppColors = Colors[scheme];
  const theme: AppThemeTokens = ThemeTokens[scheme];

  return {
    scheme,
    isDark,
    colors,
    theme,
  };
}
