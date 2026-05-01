import { StyleSheet } from "react-native";
import type { AppColors } from "@/constants/theme";

export function createStyles(colors: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 180 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceGlass,
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 8,
    },
    ctaStatus: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
    btnPrimary: {
      marginTop: 6,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: colors.ctaCream,
      alignItems: "center",
      shadowColor: colors.ctaCream,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    btnSecondary: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      backgroundColor: colors.chipBackground,
    },
    btnSecondaryText: { fontWeight: "800", color: colors.text },
    inlineInfo: {
      gap: 6,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.chipBackground,
    },
  });
}
