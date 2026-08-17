import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import { AuraButton, AuraIconButton } from "@/src/components/ui/auraStylePrimitives";
import { useAuth } from "@/src/hooks/useAuth";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import {
  markFeedbackLookLiked,
  removeProfileLook,
  type ProfileLookRecord,
} from "@/src/lib/profileLooks";
import {
  filterOutfitItemsToLiveCloset,
  getMissingClosetItemIds,
} from "@/src/lib/outfitLiveCloset";
import { markOutfitWorn, planOutfitForToday } from "@/src/lib/wearOutfit";
import type { ClothingItem } from "@/src/types/ClothingItem";

type Props = {
  visible: boolean;
  record: ProfileLookRecord | null;
  itemsById?: Map<string, ClothingItem>;
  onClose: () => void;
};

function formatDate(value?: number) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function LookDetailModal({ visible, record, itemsById, onClose }: Props) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
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
  const liveItemIds = useMemo(
    () => (itemsById ? new Set(itemsById.keys()) : null),
    [itemsById],
  );
  const displayLook = useMemo(
    () => (record ? filterOutfitItemsToLiveCloset(record.look, liveItemIds) : null),
    [liveItemIds, record],
  );
  const missingItemIds = useMemo(
    () => (record ? getMissingClosetItemIds(record.look, liveItemIds) : []),
    [liveItemIds, record],
  );
  const hasMissingItems = missingItemIds.length > 0;
  const canUseLook = !!displayLook?.pieces?.some((piece) => piece.source === "closet" && piece.itemId);

  const runAction = async (action: "wear" | "plan" | "remove" | "like") => {
    if (!record || !user?.uid) return;
    try {
      setBusy(true);
      if (action === "wear") {
        await markOutfitWorn({
          uid: user.uid,
          source: "saved_look",
          outfitId: record.id,
          title: record.title,
          look: displayLook ?? record.look,
        });
        Alert.alert("Marked worn", "This look was marked as worn today.");
      } else if (action === "plan") {
        await planOutfitForToday({
          uid: user.uid,
          source: "saved_look",
          outfitId: record.id,
          title: record.title,
          look: displayLook ?? record.look,
        });
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
    } catch {
      Alert.alert("My Looks", "Unable to update this look.");
    } finally {
      setBusy(false);
    }
  };

  if (!record || !displayLook) return null;

  const isDisliked = record.kind === "disliked";

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.screen, { backgroundColor: colors.background }, sheetStyle]}>
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <View style={styles.headerTitleBlock}>
            <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
              {record.title}
            </Text>
            {savedDate ? <Text style={[styles.date, { color: colors.textMuted }]}>{savedDate}</Text> : null}
          </View>
          <AuraIconButton
            icon="close"
            label="Close saved look"
            onPress={onClose}
            variant="tertiary"
            size="compact"
            style={styles.closeButton}
          />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <AuraLookCard
            look={displayLook}
            itemsById={itemsById}
            boardVariant="studio"
            viewportWidth={340}
            hideActions
            style={styles.lookCard}
          />
          {hasMissingItems ? (
            <View style={[styles.removedNotice, { borderColor: colors.border, backgroundColor: colors.surfaceSoft }]}>
              <Text style={[styles.removedTitle, { color: colors.text }]}>Removed from closet</Text>
              <Text style={[styles.removedText, { color: colors.textSecondary }]}>
                {missingItemIds.length === 1
                  ? "1 piece in this look was removed from your closet."
                  : `${missingItemIds.length} pieces in this look were removed from your closet.`}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.actions,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: Math.max(28, insets.bottom + 16),
            },
          ]}
        >
          {isDisliked ? (
            <>
              <AuraButton
                label={busy ? "Updating..." : "Actually I like this"}
                disabled={busy}
                onPress={() => runAction("like")}
                fullWidth
              />
              <AuraButton
                label="Remove"
                disabled={busy}
                onPress={() => runAction("remove")}
                variant="destructive"
                fullWidth
              />
            </>
          ) : (
            <>
              <AuraButton
                label={busy ? "Updating..." : "Wear today"}
                disabled={busy || !canUseLook}
                onPress={() => runAction("wear")}
                fullWidth
              />
              <View style={styles.secondaryActions}>
                <AuraButton
                  label="Plan today"
                  disabled={busy || !canUseLook}
                  onPress={() => runAction("plan")}
                  variant="secondary"
                  size="compact"
                  fullWidth
                  style={styles.secondaryButton}
                />
                <AuraButton
                  label="Remove"
                  disabled={busy}
                  onPress={() => runAction("remove")}
                  variant="destructive"
                  size="compact"
                  fullWidth
                  style={styles.secondaryButton}
                />
              </View>
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
    fontSize: 17,
    fontWeight: "600",
  },
  date: {
    fontSize: 12,
  },
  closeButton: {
    width: 44,
    height: 44,
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
  removedNotice: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    marginTop: 12,
    maxWidth: 380,
    padding: 12,
    width: "100%",
  },
  removedTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  removedText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  actions: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    gap: 10,
  },
  secondaryActions: {
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
  },
});

export default LookDetailModal;
