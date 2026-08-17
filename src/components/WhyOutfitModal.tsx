import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";

const colors = Colors.dark;

type Props = {
  visible: boolean;
  reasons: string[];
  onClose: () => void;
  onRegenerate: () => void;
};

export default function WhyOutfitModal({ visible, reasons, onClose, onRegenerate }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Why this outfit</Text>
          <View style={styles.list}>
            {reasons.length ? (
              reasons.map((reason, index) => (
                <Text key={`${reason}-${index}`} style={styles.reasonText}>
                  • {reason}
                </Text>
              ))
            ) : (
              <Text style={styles.empty}>No reasoning available yet.</Text>
            )}
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>Got it</Text>
            </Pressable>
            <Pressable style={styles.primaryBtn} onPress={onRegenerate}>
              <Text style={styles.primaryBtnText}>Regenerate</Text>
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
  list: {
    gap: 8,
  },
  reasonText: {
    color: colors.textSecondary,
    lineHeight: 20,
  },
  empty: {
    color: colors.textMuted,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.ctaCream,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryBtnText: {
    color: colors.ctaText,
    fontWeight: "800",
  },
});
