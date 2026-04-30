import AppImage from "@/src/components/common/AppImage";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
import { getItemImageUrl } from "@/src/lib/itemImage";
import type { ClothingItem } from "@/src/types/ClothingItem";

type SlotKey = "outerwear" | "top" | "bottom" | "shoes";

type Props = {
  items: Record<SlotKey, ClothingItem | null>;
};

const LAYOUT: Record<SlotKey, { left: `${number}%`; top: `${number}%`; width: `${number}%`; height: `${number}%` }> = {
  outerwear: { left: "8%", top: "8%", width: "38%", height: "48%" },
  top: { left: "44%", top: "6%", width: "38%", height: "42%" },
  bottom: { left: "23%", top: "43%", width: "38%", height: "48%" },
  shoes: { left: "61%", top: "53%", width: "30%", height: "34%" },
};

function Piece({ item, slot }: { item: ClothingItem | null; slot: SlotKey }) {
  const uri = item ? getItemImageUrl(item, { variant: "thumb" }) : null;
  const frame = LAYOUT[slot];

  return (
    <View pointerEvents="none" style={[styles.piece, frame]}>
      {uri ? (
        <AppImage
          source={{
            uri,
          }}
          resizeMode="contain"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Text style={styles.placeholder}>{slot}</Text>
      )}
    </View>
  );
}

export default function FlatLayCanvas({ items }: Props) {
  return (
    <View style={styles.canvas}>
      <Piece slot="outerwear" item={items.outerwear} />
      <Piece slot="top" item={items.top} />
      <Piece slot="bottom" item={items.bottom} />
      <Piece slot="shoes" item={items.shoes} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: "100%",
    aspectRatio: 1.35,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: Colors.dark.outfitBoardBackground,
    borderWidth: 1,
    borderColor: "rgba(17,19,26,0.08)",
  },
  piece: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
