import React, { useState } from "react";
import AppImage from "@/src/components/common/AppImage";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
import type { BoardPiece } from "@/src/lib/auraLookLayouts";
import { logResolvedItemImageLoadFailure, resolveItemImage } from "@/src/lib/resolveItemImage";

type Props = {
  accessories: BoardPiece[];
  hiddenAccessories?: BoardPiece[];
  onItemPress: (item: BoardPiece) => void;
};

function firstImage(item: BoardPiece) {
  const resolved = resolveItemImage(item, { variant: "thumb", surface: "aura_look_card" });
  return resolved.uri ? { uri: resolved.uri, resolved } : null;
}

function pillStyle(item: BoardPiece) {
  return item.accessoryType === "fragrance" ? styles.perfumePill : styles.defaultPill;
}

export function AccessoryStrip({ accessories, hiddenAccessories = [], onItemPress }: Props) {
  const [showHidden, setShowHidden] = useState(false);
  if (accessories.length === 0) return null;

  const visible = accessories.slice(0, 4);
  const overflow = hiddenAccessories.length + Math.max(accessories.length - visible.length, 0);

  return (
    <View pointerEvents="box-none" style={styles.wrapper}>
      <View style={styles.strip}>
        {visible.map((item) => {
          const image = firstImage(item);
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              style={[
                styles.pill,
                pillStyle(item),
                item.accessoryType === "belt" ? styles.beltPill : null,
              ]}
              onPress={() => onItemPress(item)}
            >
              {image ? (
                <AppImage
                  source={{
                    uri: image.uri,
                  }}
                  resizeMode="contain"
                  style={[styles.thumb, item.accessoryType === "belt" ? styles.beltThumb : null]}
                  onError={() => logResolvedItemImageLoadFailure(image.resolved)}
                />
              ) : null}
            </Pressable>
          );
        })}
        {overflow > 0 ? (
          <Pressable accessibilityRole="button" style={[styles.pill, styles.morePill]} onPress={() => setShowHidden(true)}>
            <Text style={styles.moreText}>+{overflow}</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={showHidden} transparent animationType="fade" onRequestClose={() => setShowHidden(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowHidden(false)} />
          <View style={styles.popover}>
            {[...accessories.slice(4), ...hiddenAccessories].map((item) => (
              <Pressable
                key={item.key}
                style={styles.popoverRow}
                onPress={() => {
                  setShowHidden(false);
                  onItemPress(item);
                }}
              >
                <View style={styles.popoverMark} />
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const colors = Colors.dark;

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "flex-end",
    position: "absolute",
    right: "1.5%",
    top: "2%",
    zIndex: 90,
  },
  strip: {
    alignItems: "center",
    alignSelf: "flex-end",
    backgroundColor: "transparent",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  pill: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 999,
    borderWidth: 0,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: 2,
  },
  defaultPill: {
    backgroundColor: "transparent",
  },
  perfumePill: {
    backgroundColor: "transparent",
  },
  thumb: {
    height: 30,
    width: 30,
  },
  beltPill: {
    minHeight: 54,
    minWidth: 132,
  },
  beltThumb: {
    height: 118,
    transform: [{ rotate: "90deg" }],
    width: 38,
  },
  morePill: {
    backgroundColor: "rgba(25,0,25,0.08)",
    justifyContent: "center",
  },
  moreText: {
    color: colors.textOnLightSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  modalRoot: {
    backgroundColor: "rgba(25,0,25,0.32)",
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 24,
    paddingTop: 120,
  },
  popover: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 190,
    padding: 8,
  },
  popoverRow: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  popoverMark: {
    backgroundColor: colors.purpleSurfaceStrong,
    borderRadius: 8,
    height: 16,
    width: 72,
  },
});

export default AccessoryStrip;
