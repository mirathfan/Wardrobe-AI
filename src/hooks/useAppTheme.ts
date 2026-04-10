import { Colors, type AppColors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export function useAppTheme() {
  const scheme = useColorScheme() ?? "light";
  const isDark = scheme === "dark";
  const colors: AppColors = Colors[scheme];

  return {
    scheme,
    isDark,
    colors,
  };
}
