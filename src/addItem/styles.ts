import { StyleSheet } from "react-native";
import type { AppColors } from "@/constants/theme";

export function createStyles(colors: AppColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    listContent: { padding: 16, paddingBottom: 180 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    footer: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingTop: 10,
      gap: 8,
    },
    ctaStatus: { color: colors.textSecondary, fontSize: 13 },
    btnPrimary: {
      marginTop: 6,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: "center",
    },
    btnSecondary: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      backgroundColor: colors.surface,
    },
    btnSecondaryText: { fontWeight: "800", color: colors.text },
    inlineInfo: {
      gap: 6,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
  });
}
