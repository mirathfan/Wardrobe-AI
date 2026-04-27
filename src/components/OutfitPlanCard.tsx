import React from "react";
import FastImage from "@d11/react-native-fast-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { getItemImageUrl } from "../../src/lib/itemImage";
import { ClothingItem } from "../../src/types/ClothingItem";
import { formatLastWorn, PlannedLook } from "../utils/outfitPlanning";

type Props = {
  looks: PlannedLook[];
  selectedLookId: PlannedLook["id"];
  lookItems: {
    outerwear: ClothingItem | null;
    top: ClothingItem | null;
    bottom: ClothingItem | null;
    shoes: ClothingItem | null;
  };
  thinking: boolean;
  onSelectLook: (id: PlannedLook["id"]) => void;
  onUseOutfit: () => void;
  onWhy: () => void;
};

function slotTitle(label: string, item: ClothingItem | null) {
  if (!item) return "+ Add";
  return item.name || item.subCategory || item.category || label;
}

function SlotCard({ label, item }: { label: string; item: ClothingItem | null }) {
  const uri = item ? getItemImageUrl(item, { variant: "thumb" }) : null;
  return (
    <View style={styles.slotCard}>
      {uri ? (
        <FastImage
          source={{
            uri,
            priority: FastImage.priority.normal,
            cache: FastImage.cacheControl.immutable,
          }}
          style={styles.slotImage}
          resizeMode={FastImage.resizeMode.contain}
        />
      ) : (
        <View style={styles.slotPlaceholder}>
          <Text style={styles.placeholderText}>No photo</Text>
        </View>
      )}
      <Text style={styles.slotCategory}>{label}</Text>
      <Text style={styles.slotName} numberOfLines={1}>
        {slotTitle(label, item)}
      </Text>
      <Text style={styles.slotMeta} numberOfLines={1}>
        {item?.brand ? `${item.brand} • ` : ""}
        {formatLastWorn(item)}
      </Text>
    </View>
  );
}

export default function OutfitPlanCard({
  looks,
  selectedLookId,
  lookItems,
  thinking,
  onSelectLook,
  onUseOutfit,
  onWhy,
}: Props) {
  const selectedLook = looks.find((look) => look.id === selectedLookId) ?? looks[0] ?? null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>AI Outfit Plan</Text>

      <View style={styles.segRow}>
        {looks.map((look) => {
          const active = look.id === selectedLookId;
          return (
            <Pressable
              key={look.id}
              style={[styles.segChip, active ? styles.segChipActive : null]}
              onPress={() => onSelectLook(look.id)}
            >
              <Text style={[styles.segChipText, active ? styles.segChipTextActive : null]}>{look.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {thinking ? <Text style={styles.thinking}>✨ Thinking…</Text> : null}

      <View style={styles.grid}>
        <SlotCard label="Outerwear" item={lookItems.outerwear} />
        <SlotCard label="Top" item={lookItems.top} />
        <SlotCard label="Bottom" item={lookItems.bottom} />
        <SlotCard label="Shoes" item={lookItems.shoes} />
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.scoreText}>Outfit score: {selectedLook?.score ?? 0}%</Text>
      </View>

      <View style={styles.reasons}>
        {(selectedLook?.reasons ?? []).slice(0, 2).map((reason) => (
          <Text key={reason} style={styles.reasonLine}>
            • {reason}
          </Text>
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryBtn} onPress={onUseOutfit}>
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
    borderWidth: 1,
    borderColor: "#dedede",
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
  },
  segRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  segChip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  segChipActive: {
    backgroundColor: "#111",
    borderColor: "#111",
  },
  segChipText: {
    color: "#333",
    fontWeight: "700",
    fontSize: 12,
  },
  segChipTextActive: {
    color: "#fff",
  },
  thinking: {
    marginTop: 8,
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "600",
  },
  grid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  slotCard: {
    width: "47%",
    borderWidth: 1,
    borderColor: "#ebebeb",
    borderRadius: 12,
    padding: 8,
    backgroundColor: "#fafafa",
  },
  slotImage: {
    width: "100%",
    height: 60,
  },
  slotPlaceholder: {
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
  slotCategory: {
    marginTop: 6,
    color: "#666",
    fontSize: 11,
    fontWeight: "700",
  },
  slotName: {
    marginTop: 2,
    fontSize: 13,
    color: "#111",
    fontWeight: "800",
  },
  slotMeta: {
    marginTop: 2,
    fontSize: 11,
    color: "#555",
  },
  scoreRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e8e8e8",
  },
  scoreText: {
    fontSize: 13,
    color: "#111",
    fontWeight: "800",
  },
  reasons: {
    marginTop: 6,
    gap: 3,
  },
  reasonLine: {
    color: "#555",
    fontSize: 12,
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
    backgroundColor: "#111",
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#111",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  secondaryBtnText: {
    color: "#111",
    fontWeight: "800",
  },
});
