import React, { useEffect, useRef, useState } from "react";
import AppImage from "@/src/components/common/AppImage";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
import type { BoardPiece } from "@/src/lib/auraLookLayouts";

type Props = {
  item: BoardPiece | null;
  visible: boolean;
  editable?: boolean;
  onDismiss: () => void;
  onViewInCloset?: (item: BoardPiece) => void;
  onRemove?: (item: BoardPiece) => void;
};

function imageFor(item: BoardPiece) {
  return item.image ?? item.cleanedImageUrl ?? item.imageUrl ?? null;
}

function formatDate(value?: number | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(item: BoardPiece) {
  return item.status ?? "AVAILABLE";
}

export function ItemDetailSheet({
  item,
  visible,
  editable = false,
  onDismiss,
  onViewInCloset,
  onRemove,
}: Props) {
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(400)).current;
  const image = item ? imageFor(item) : null;
  const colorLabel = item?.colorLabel ?? item?.colors?.[0] ?? item?.primaryColor ?? "";
  const lastWorn = formatDate(item?.lastWornDate);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.setValue(400);
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [translateY, visible]);

  function closeWithAnimation() {
    Animated.timing(translateY, {
      toValue: 400,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        onDismiss();
      }
    });
  }

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={closeWithAnimation}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeWithAnimation} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />
          {item ? (
            <>
              <View style={styles.header}>
                <View style={styles.imageFrame}>
                  {image ? (
                    <AppImage
                      source={{
                        uri: image,
                      }}
                      resizeMode="contain"
                      style={styles.image}
                    />
                  ) : (
                    <Text style={styles.imageFallbackText}>{item.itemName.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                <View style={styles.headerCopy}>
                  <Text style={styles.name}>{item.itemName}</Text>
                  {!!item.brand && <Text style={styles.brand}>{item.brand}</Text>}
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{statusLabel(item)}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.detailGrid}>
                {!!colorLabel && (
                  <View style={styles.detailCell}>
                    <View style={[styles.colorChip, item.primaryColor ? { backgroundColor: item.primaryColor } : null]} />
                    <Text numberOfLines={1} style={styles.detailText}>{colorLabel}</Text>
                  </View>
                )}
                <View style={styles.detailCell}>
                  <Text numberOfLines={1} style={styles.detailText}>
                    {[item.category, item.subCategory].filter(Boolean).join(" / ") || "Wardrobe"}
                  </Text>
                </View>
                {!!item.size && (
                  <View style={styles.detailCell}>
                    <Text numberOfLines={1} style={styles.detailText}>Size {item.size}</Text>
                  </View>
                )}
                {!!lastWorn && (
                  <View style={styles.detailCell}>
                    <Text numberOfLines={1} style={styles.detailText}>Last worn {lastWorn}</Text>
                  </View>
                )}
              </View>

              {!!item.stylingNote && (
                <View style={styles.auraNote}>
                  <Text style={styles.auraEyebrow}>AURA NOTE</Text>
                  <Text style={styles.auraText}>AURA chose this because {item.stylingNote}</Text>
                </View>
              )}

              <View style={styles.actions}>
                {!!item.itemId && (
                  <Pressable
                    style={[styles.actionButton, styles.primaryAction]}
                    onPress={() => {
                      closeWithAnimation();
                      onViewInCloset?.(item);
                    }}
                  >
                    <Text style={styles.primaryActionText}>View in closet</Text>
                  </Pressable>
                )}
                {editable && onRemove ? (
                  <Pressable
                    style={[styles.actionButton, styles.secondaryAction]}
                    onPress={() => {
                      closeWithAnimation();
                      onRemove(item);
                    }}
                  >
                    <Text style={styles.secondaryActionText}>Remove from outfit</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const colors = Colors.dark;

const styles = StyleSheet.create({
  root: {
    backgroundColor: "rgba(0,0,0,0.54)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    height: 4,
    marginBottom: 16,
    width: 36,
  },
  header: {
    flexDirection: "row",
    gap: 16,
  },
  imageFrame: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: 18,
    height: 120,
    justifyContent: "center",
    width: 120,
  },
  image: {
    height: "100%",
    width: "100%",
  },
  imageFallbackText: {
    color: colors.textSecondary,
    fontSize: 32,
    fontWeight: "800",
  },
  headerCopy: {
    flex: 1,
    gap: 7,
    justifyContent: "center",
  },
  name: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    lineHeight: 24,
  },
  brand: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  statusBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(192,132,252,0.16)",
    borderColor: "rgba(192,132,252,0.42)",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    color: colors.iridescentStart,
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 18,
  },
  detailCell: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: 999,
    flexDirection: "row",
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  detailText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  colorChip: {
    backgroundColor: colors.iridescentStart,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    width: 14,
  },
  auraNote: {
    backgroundColor: "rgba(192,132,252,0.10)",
    borderColor: "rgba(192,132,252,0.22)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    marginTop: 18,
    padding: 14,
  },
  auraEyebrow: {
    color: colors.iridescentStart,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  auraText: {
    color: colors.text,
    fontSize: 13.5,
    fontWeight: "600",
    lineHeight: 19,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: 16,
    flex: 1,
    minHeight: 50,
    justifyContent: "center",
  },
  primaryAction: {
    backgroundColor: "rgba(192,132,252,0.24)",
    borderColor: "rgba(192,132,252,0.34)",
    borderWidth: 1,
  },
  secondaryAction: {
    backgroundColor: colors.surface2,
    borderColor: colors.borderSoft,
    borderWidth: 1,
  },
  primaryActionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryActionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "800",
  },
});

export default ItemDetailSheet;
