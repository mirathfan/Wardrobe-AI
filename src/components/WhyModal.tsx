import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";

const colors = Colors.dark;

type Props = {
  visible: boolean;
  reasons: string[];
  onClose: () => void;
  onNextSuggestion: () => void;
};

export default function WhyModal({ visible, reasons, onClose, onNextSuggestion }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Why this outfit?</Text>
          <View style={styles.reasons}>
            {reasons.length ? (
              reasons.map((reason, index) => (
                <Text key={`${reason}-${index}`} style={styles.reasonLine}>
                  • {reason}
                </Text>
              ))
            ) : (
              <Text style={styles.reasonLine}>• Built from weather, agenda, and rotation context.</Text>
            )}
          </View>
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>Close</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onNextSuggestion}>
              <Text style={styles.primaryBtnText}>Next suggestion</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(9,0,11,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    gap: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  reasons: {
    gap: 8,
  },
  reasonLine: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.ctaCream,
    alignItems: "center",
    paddingVertical: 11,
  },
  primaryBtnText: {
    color: colors.ctaText,
    fontWeight: "800",
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    paddingVertical: 11,
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
});
