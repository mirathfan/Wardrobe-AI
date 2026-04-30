import React from "react";
import AppImage from "@/src/components/common/AppImage";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getItemImageUrl } from "../../src/lib/itemImage";
import { ClothingItem } from "../../src/types/ClothingItem";
import { formatLastWorn } from "../utils/outfitPlanning";

type SlotKey = "outerwear" | "top" | "bottom" | "shoes";

type Props = {
  items: Record<SlotKey, ClothingItem | null>;
  editable?: boolean;
  onPressSlot?: (slot: SlotKey) => void;
};

function Tile({
  label,
  slot,
  item,
  editable,
  onPressSlot,
}: {
  label: string;
  slot: SlotKey;
  item: ClothingItem | null;
  editable: boolean;
  onPressSlot?: (slot: SlotKey) => void;
}) {
  const uri = item ? getItemImageUrl(item, { variant: "thumb" }) : null;
  const name = item?.name || item?.subCategory || item?.category || "+ Add";

  return (
    <Pressable
      onPress={editable && onPressSlot ? () => onPressSlot(slot) : undefined}
      style={[styles.tile, editable ? styles.tileEditable : null]}
    >
      {uri ? (
        <AppImage
          source={{
            uri,
          }}
          style={styles.image}
          resizeMode="contain"
        />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Pick item</Text>
        </View>
      )}

      <View style={styles.slotHeader}>
        <Text style={styles.label}>{label}</Text>
      </View>

      <Text style={styles.name} numberOfLines={1}>{name}</Text>
      <Text style={styles.meta} numberOfLines={1}>
        {item?.brand ? `${item.brand} • ` : ""}
        {formatLastWorn(item)}
      </Text>
    </Pressable>
  );
}

export default function OutfitGrid({
  items,
  editable = false,
  onPressSlot,
}: Props) {
  return (
    <View style={styles.grid}>
      <Tile label="Outerwear" slot="outerwear" item={items.outerwear} editable={editable} onPressSlot={onPressSlot} />
      <Tile label="Top" slot="top" item={items.top} editable={editable} onPressSlot={onPressSlot} />
      <Tile label="Bottom" slot="bottom" item={items.bottom} editable={editable} onPressSlot={onPressSlot} />
      <Tile label="Shoes" slot="shoes" item={items.shoes} editable={editable} onPressSlot={onPressSlot} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "47%",
    borderWidth: 1,
    borderColor: "#ebebeb",
    borderRadius: 12,
    padding: 8,
    backgroundColor: "#fafafa",
  },
  tileEditable: {
    borderColor: "#d1d5db",
  },
  image: {
    width: "100%",
    height: 60,
  },
  placeholder: {
    width: "100%",
    height: 60,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#999",
    fontSize: 11,
  },
  slotHeader: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    color: "#666",
    fontSize: 11,
    fontWeight: "700",
  },
  name: {
    marginTop: 2,
    fontSize: 13,
    color: "#111",
    fontWeight: "800",
  },
  meta: {
    marginTop: 2,
    fontSize: 11,
    color: "#555",
  },
});
