import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Colors } from "@/constants/theme";
import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { auraLookToPlannedOutfit } from "@/src/lib/auraLooks";
import {
  markFeedbackLookLiked,
  removeProfileLook,
  type ProfileLookRecord,
} from "@/src/lib/profileLooks";
import { savePlannedRecord } from "@/src/utils/dailyOutfits";

type Props = {
  visible: boolean;
  record: ProfileLookRecord | null;
  onClose: () => void;
};

function formatDate(value?: number) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function LookDetailModal({ visible, record, onClose }: Props) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 42 }],
  }));

  const savedDate = useMemo(() => formatDate(record?.createdAt), [record?.createdAt]);

  const runAction = async (action: "plan" | "remove" | "like") => {
    if (!record || !user?.uid) return;
    try {
      setBusy(true);
      if (action === "plan") {
        await savePlannedRecord(user.uid, new Date(), auraLookToPlannedOutfit(record.look));
        Alert.alert("Planned", "This look is planned for today.");
      } else if (action === "like") {
        await markFeedbackLookLiked(user.uid, record);
        Alert.alert("Updated", "AURA marked this look as liked.");
        onClose();
      } else {
        await removeProfileLook(user.uid, record);
        Alert.alert("Removed", "This look was removed.");
        onClose();
      }
    } catch (error: any) {
      Alert.alert("My Looks", error?.message ?? "Unable to update this look.");
    } finally {
      setBusy(false);
    }
  };

  if (!record) return null;

  const isDisliked = record.kind === "disliked";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.screen, sheetStyle]}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <View style={styles.headerTitleBlock}>
            <Text numberOfLines={1} style={styles.title}>
              {record.title}
            </Text>
            {savedDate ? <Text style={styles.date}>{savedDate}</Text> : null}
          </View>
          <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <AuraLookCard
            look={record.look}
            boardVariant="studio"
            viewportWidth={340}
            hideActions
            style={styles.lookCard}
          />
        </ScrollView>

        <View style={[styles.actions, { borderTopColor: colors.border }]}>
          {isDisliked ? (
            <>
              <Pressable disabled={busy} onPress={() => runAction("like")} style={styles.gradientButton}>
                <LinearGradient
                  colors={[colors.ctaCream, colors.ctaCream]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.gradientFill}
                >
                  <Text style={styles.gradientText}>{busy ? "Updating..." : "Actually I like this"}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable disabled={busy} onPress={() => runAction("remove")} style={styles.darkButton}>
                <Text style={styles.darkButtonText}>Remove</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable disabled={busy} onPress={() => runAction("plan")} style={styles.gradientButton}>
                <LinearGradient
                  colors={[colors.ctaCream, colors.ctaCream]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.gradientFill}
                >
                  <Text style={styles.gradientText}>{busy ? "Planning..." : "Plan for today"}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable disabled={busy} onPress={() => runAction("remove")} style={styles.darkButton}>
                <Text style={styles.darkButtonText}>Remove from saved</Text>
              </Pressable>
            </>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  headerSpacer: {
    width: 44,
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  title: {
    color: Colors.dark.textPrimary,
    fontSize: 17,
    fontWeight: "800",
  },
  date: {
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: Colors.dark.textPrimary,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "300",
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: "center",
  },
  lookCard: {
    width: "100%",
    maxWidth: 380,
  },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    gap: 10,
    backgroundColor: Colors.dark.background,
  },
  gradientButton: {
    minHeight: 50,
    borderRadius: 18,
    overflow: "hidden",
  },
  gradientFill: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  gradientText: {
    color: Colors.dark.ctaText,
    fontSize: 15,
    fontWeight: "900",
  },
  darkButton: {
    minHeight: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.secondaryCta,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  darkButtonText: {
    color: Colors.dark.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
});

export default LookDetailModal;
