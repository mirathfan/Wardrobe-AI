import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import AppImage from "@/src/components/common/AppImage";
import FlatLayCanvas from "@/src/components/outfit/FlatLayCanvas";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  auraSheetBackdropStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { FLOATING_TAB_BAR_HEIGHT } from "@/src/constants/dock";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import {
  outfitCalendarItemCount,
  outfitCalendarSourceLabel,
  outfitCalendarStatusLabel,
  type OutfitCalendarEvent,
} from "@/src/lib/outfitCalendar";
import type { ClothingItem } from "@/src/types/ClothingItem";

type Props = {
  visible: boolean;
  event: OutfitCalendarEvent | null;
  dateLabel: string;
  itemsById: Map<string, ClothingItem>;
  busy?: boolean;
  onClose: () => void;
  onMarkWorn?: () => void;
  onCancel?: () => void;
  onPlanAgain?: () => void;
  onRemix?: () => void;
};

function canvasItems(event: OutfitCalendarEvent, itemsById: Map<string, ClothingItem>) {
  return {
    outerwear: event.itemsByCategory.outerwear ? itemsById.get(event.itemsByCategory.outerwear) ?? null : null,
    top: event.itemsByCategory.top ? itemsById.get(event.itemsByCategory.top) ?? null : null,
    bottom: event.itemsByCategory.bottom ? itemsById.get(event.itemsByCategory.bottom) ?? null : null,
    shoes: event.itemsByCategory.shoes ? itemsById.get(event.itemsByCategory.shoes) ?? null : null,
  };
}

function itemTitle(item: ClothingItem) {
  return item.name || item.subCategory || item.category || "Closet item";
}

function itemMeta(item: ClothingItem) {
  return [
    item.brand,
    item.subCategory || item.category,
    item.primaryColor || item.colorLabel || item.colors?.[0],
  ].filter(Boolean).join(" - ");
}

function itemImageUrl(item: ClothingItem) {
  return item.cleanedImageUrl || item.refinedImageUrl || item.originalImageUrl || item.photoUrl || item.photoUri || null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.section}>
      <Text style={[auraTypography.eyebrow, { color: colors.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

function ModalAction({
  label,
  icon,
  variant = "secondary",
  busy = false,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "secondary" | "tertiary" | "danger";
  busy?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={[
        styles.action,
        auraButtonStyle(colors, variant, busy, variant === "primary" ? "default" : "compact"),
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={variant === "primary" ? colors.primaryText : colors.textSecondary} />
      ) : (
        <Ionicons
          name={icon}
          size={16}
          color={variant === "primary" ? colors.primaryText : variant === "danger" ? colors.danger : colors.textSecondary}
        />
      )}
      <Text style={[auraButtonTextStyle(colors, variant, busy), styles.actionText]}>{label}</Text>
    </Pressable>
  );
}

export default function CalendarOutfitEventDetailModal({
  visible,
  event,
  dateLabel,
  itemsById,
  busy = false,
  onClose,
  onMarkWorn,
  onCancel,
  onPlanAgain,
  onRemix,
}: Props) {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const stylesWithTheme = React.useMemo(() => createThemedStyles(colors, layout), [colors, layout]);
  const items = React.useMemo(() => {
    if (!event) return [];
    return event.itemIds.map((itemId) => itemsById.get(itemId)).filter((item): item is ClothingItem => Boolean(item));
  }, [event, itemsById]);

  if (!event) return null;

  const itemCount = outfitCalendarItemCount(event);
  const weatherSummary = event.weatherContext?.rawSummary || event.weatherContext?.condition || "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={stylesWithTheme.backdrop}>
        <View style={stylesWithTheme.sheet}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
                {outfitCalendarStatusLabel(event.status)} - {outfitCalendarSourceLabel(event.source)} - {dateLabel}
              </Text>
              <Text style={[styles.title, { color: colors.text }]}>{event.title}</Text>
              <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
                {itemCount} {itemCount === 1 ? "piece" : "pieces"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close outfit detail"
              hitSlop={8}
              style={[styles.closeButton, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View
              style={[
                styles.detailPreviewFrame,
                {
                  backgroundColor: colors.boardLight,
                  borderColor: colors.borderWarm,
                },
              ]}
            >
              <FlatLayCanvas items={canvasItems(event, itemsById)} />
            </View>

            {event.weatherWarnings.length ? (
              <View style={[styles.warningBox, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
                <View style={styles.warningHeader}>
                  <Ionicons name="warning-outline" size={17} color={colors.textSecondary} />
                  <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Weather note</Text>
                </View>
                {event.weatherWarnings.slice(0, 3).map((warning) => (
                  <Text key={warning.message} style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                    {warning.message}
                  </Text>
                ))}
                {weatherSummary ? (
                  <Text style={[auraTypography.caption, { color: colors.textMuted }]}>{weatherSummary}</Text>
                ) : null}
              </View>
            ) : null}

            <Section title="Pieces">
              <View style={styles.itemsList}>
                {items.map((item) => (
                  <View
                    key={item.id}
                    style={[styles.itemRow, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
                  >
                    <View
                      style={[styles.itemImageFrame, { borderColor: colors.borderSoft, backgroundColor: colors.surfaceBase }]}
                    >
                      {itemImageUrl(item) ? (
                        <AppImage source={{ uri: itemImageUrl(item) ?? "" }} resizeMode="contain" style={styles.itemImage} />
                      ) : (
                        <Ionicons name="shirt-outline" size={17} color={colors.textMuted} />
                      )}
                    </View>
                    <View style={styles.itemCopy}>
                      <Text numberOfLines={2} style={[styles.itemName, { color: colors.text }]}>
                        {itemTitle(item)}
                      </Text>
                      {itemMeta(item) ? (
                        <Text numberOfLines={1} style={[auraTypography.caption, { color: colors.textSecondary }]}>
                          {itemMeta(item)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </Section>

            {event.reasons.length ? (
              <Section title="Styling notes">
                <View style={styles.noteList}>
                  {event.reasons.slice(0, 4).map((reason, index) => (
                    <Text key={`${reason}-${index}`} style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                      {reason}
                    </Text>
                  ))}
                </View>
              </Section>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            {event.status === "planned" && onMarkWorn ? (
              <ModalAction label="Mark as Worn" icon="checkmark-circle-outline" variant="primary" busy={busy} onPress={onMarkWorn} />
            ) : null}
            {event.status === "worn" && onPlanAgain ? (
              <ModalAction label="Plan Again" icon="calendar-outline" variant="primary" busy={busy} onPress={onPlanAgain} />
            ) : null}
            {onRemix ? (
              <ModalAction label="Ask AURA to Remix" icon="sparkles-outline" busy={busy} onPress={onRemix} />
            ) : null}
            {onCancel ? (
              <ModalAction
                label={event.status === "worn" ? "Remove Log" : "Remove Plan"}
                icon="trash-outline"
                variant="danger"
                busy={busy}
                onPress={onCancel}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createThemedStyles(
  colors: ReturnType<typeof useAppTheme>["colors"],
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    backdrop: {
      ...auraSheetBackdropStyle(colors),
      justifyContent: "flex-end",
    },
    sheet: {
      ...auraCardStyle(colors, "sheet"),
      borderColor: colors.borderStrong,
      borderRadius: layout.largeRadius,
      gap: 14,
      marginBottom: layout.floatingDockBottom + FLOATING_TAB_BAR_HEIGHT + 12,
      marginHorizontal: layout.horizontalPadding,
      maxHeight: "86%",
      overflow: "hidden",
      padding: layout.cardPadding,
    },
  });
}

const styles = StyleSheet.create({
  headerRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    lineHeight: 13,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 28,
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  scrollContent: {
    gap: 14,
    paddingBottom: 4,
  },
  detailPreviewFrame: {
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
  },
  section: {
    gap: 9,
  },
  warningBox: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  warningHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  itemsList: {
    gap: 9,
  },
  itemRow: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 9,
  },
  itemImageFrame: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    overflow: "hidden",
    width: 54,
  },
  itemImage: {
    height: "100%",
    width: "100%",
  },
  itemCopy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: "800",
    lineHeight: 18,
  },
  noteList: {
    gap: 7,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  action: {
    flexDirection: "row",
    gap: 8,
    minWidth: 150,
  },
  actionText: {
    fontSize: 13,
  },
});
