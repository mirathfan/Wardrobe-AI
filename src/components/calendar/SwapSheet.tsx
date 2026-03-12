import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

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
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          {options.length === 0 ? <Text style={styles.empty}>No matching items yet.</Text> : null}
          {options.map((option) => (
            <Pressable key={option.id} style={styles.option} onPress={() => onSelect(option.id)}>
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          ))}
          {onClear ? (
            <Pressable style={styles.clear} onPress={onClear}>
              <Text style={styles.clearText}>Clear slot</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: "800", marginBottom: 8 },
  option: { paddingVertical: 10 },
  optionText: { color: "#111", fontWeight: "600" },
  empty: { color: "#666", marginBottom: 8 },
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
    borderColor: "#ddd",
    alignItems: "center",
    paddingVertical: 10,
  },
  closeText: { fontWeight: "700", color: "#111" },
});
