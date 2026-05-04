import React from "react";
import AppImage from "@/src/components/common/AppImage";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/theme";
import { getItemImageUrl } from "../../src/lib/itemImage";
import { ClothingItem } from "../../src/types/ClothingItem";

const colors = Colors.dark;

type SlotName = "outerwear" | "top" | "bottom" | "shoes";

type Props = {
  slots: Record<SlotName, ClothingItem | null>;
  title: string;
  onUse: () => void;
  onWhy: () => void;
};

function slotTitle(item: ClothingItem | null, fallback: string) {
  if (!item) return "+ Add";
  return item.name || item.subCategory || item.category || fallback;
}

function SlotTile({ label, item }: { label: string; item: ClothingItem | null }) {
  const uri = item ? getItemImageUrl(item, { variant: "thumb" }) : null;
  return (
    <View style={styles.tile}>
      {uri ? (
        <AppImage
          source={{
            uri,
          }}
          style={styles.image}
          resizeMode="contain"
        />
      ) : <View style={styles.placeholder} />}
      <Text style={styles.slotLabel}>{label}</Text>
      <Text style={styles.slotValue} numberOfLines={1}>
        {slotTitle(item, label)}
      </Text>
    </View>
  );
}

export default function OutfitPreviewCard({ slots, title, onUse, onWhy }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.grid}>
        <SlotTile label="Outerwear" item={slots.outerwear} />
        <SlotTile label="Top" item={slots.top} />
        <SlotTile label="Bottom" item={slots.bottom} />
        <SlotTile label="Shoes" item={slots.shoes} />
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.primaryBtn} onPress={onUse}>
          <Text style={styles.primaryBtnText}>Use this outfit</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={onWhy}>
          <Text style={styles.secondaryBtnText}>Why?</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "47%",
    borderWidth: 1,
    borderColor: colors.borderWarm,
    borderRadius: 12,
    padding: 8,
    backgroundColor: colors.boardLight,
  },
  image: {
    width: "100%",
    height: 64,
  },
  placeholder: {
    width: "100%",
    height: 64,
    borderRadius: 8,
    backgroundColor: "rgba(25,0,25,0.06)",
  },
  slotLabel: {
    marginTop: 6,
    fontSize: 11,
    color: colors.textOnLightSecondary,
    fontWeight: "700",
  },
  slotValue: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
    color: colors.textOnLight,
  },
  actions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.ctaCream,
    alignItems: "center",
  },
  primaryBtnText: {
    color: colors.ctaText,
    fontWeight: "800",
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryBtnText: {
    color: colors.textPrimary,
    fontWeight: "800",
  },
});
