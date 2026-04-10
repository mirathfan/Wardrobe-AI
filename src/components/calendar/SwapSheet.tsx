import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

type Option = { id: string; label: string };

type Props = {
  visible: boolean;
  title: string;
  options: Option[];
  onSelect: (id: string) => void;
  onClear?: () => void;
  onClose: () => void;
};

export default function SwapSheet({ visible, title, options, onSelect, onClear, onClose }: Props) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: layout.largeRadius,
              borderTopRightRadius: layout.largeRadius,
              padding: layout.cardPadding,
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {options.length === 0 ? <Text style={[styles.empty, { color: colors.textSecondary }]}>No matching items yet.</Text> : null}
          {options.map((option) => (
            <Pressable
              key={option.id}
              style={[styles.option, { borderColor: colors.border, backgroundColor: colors.overlay }]}
              onPress={() => onSelect(option.id)}
            >
              <Text style={[styles.optionText, { color: colors.text }]}>{option.label}</Text>
            </Pressable>
          ))}
          {onClear ? (
            <Pressable style={[styles.clear, { borderColor: "#ef4444" }]} onPress={onClear}>
              <Text style={styles.clearText}>Clear slot</Text>
            </Pressable>
          ) : null}
          <Pressable style={[styles.close, { borderColor: colors.border, backgroundColor: colors.background }]} onPress={onClose}>
            <Text style={[styles.closeText, { color: colors.text }]}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" },
  sheet: {
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  optionText: { fontWeight: "600" },
  empty: { marginBottom: 8 },
  clear: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ef4444",
    alignItems: "center",
    paddingVertical: 10,
  },
  clearText: { fontWeight: "700", color: "#b91c1c" },
  close: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  closeText: { fontWeight: "700" },
});
