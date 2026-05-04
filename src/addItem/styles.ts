import { StyleSheet } from "react-native";
import type { AppColors } from "@/constants/theme";
import { auraButtonStyle, auraButtonTextStyle, auraSpacing } from "@/src/components/ui/auraStylePrimitives";

export function createStyles(colors: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    listContent: { paddingHorizontal: auraSpacing.md, paddingTop: auraSpacing.sm, paddingBottom: 160 },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: "rgba(9,0,11,0.90)",
      paddingHorizontal: auraSpacing.md,
      paddingTop: auraSpacing.xs,
      gap: auraSpacing.xs,
    },
    ctaStatus: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
    btnPrimary: {
      ...auraButtonStyle(colors, "primary"),
      marginTop: 4,
      shadowColor: colors.ctaCream,
      shadowOpacity: 0.1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    btnSecondary: {
      ...auraButtonStyle(colors, "secondary", false, "compact"),
      minHeight: 44,
    },
    btnSecondaryText: { ...auraButtonTextStyle(colors, "secondary"), fontSize: 13, lineHeight: 17 },
    inlineInfo: {
      gap: auraSpacing.xs,
      padding: auraSpacing.sm,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceInteractive,
    },
  });
}
