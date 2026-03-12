import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 180 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#ececec",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  ctaStatus: { color: "#666", fontSize: 13 },
  btnPrimary: {
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#111",
    alignItems: "center",
  },
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  btnSecondaryText: { fontWeight: "800", color: "#111" },
  inlineInfo: {
    gap: 6,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    backgroundColor: "#fafafa",
  },
});
