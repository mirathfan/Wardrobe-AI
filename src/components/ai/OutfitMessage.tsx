import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { getItemImageUrl } from "@/src/lib/itemImage";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";

import type { ChatOutfit } from "./chatTypes";

function displayName(item: ClothingItem) {
  return item.name || `${item.displayColor ?? item.primaryColor ?? ""} ${item.category}`.trim();
}

function slotLabel(slot: string) {
  if (slot === "footwear") return "Shoes";
  return slot.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function OutfitMessage({
  colors,
  outfit,
  itemsById,
  saving,
  index,
  memoryHint,
  onSave,
  onMoreLikeThis,
  onSwap,
}: {
  colors: AppColors;
  outfit: ChatOutfit;
  itemsById: Map<string, ClothingItem>;
  saving: boolean;
  index: number;
  memoryHint?: string | null;
  onSave: () => void;
  onMoreLikeThis: (outfit: ChatOutfit) => void;
  onSwap: (outfit: ChatOutfit) => void;
}) {
  const pickedItems = outfit.picks
    .map((pick) => ({
      slot: pick.slot,
      item: itemsById.get(pick.itemId),
    }))
    .filter((value): value is { slot: string; item: ClothingItem } => !!value.item);
  const cleanReason = sanitizeDisplayText(outfit.reason);

  return (
    <LinearGradient
      colors={["rgba(28,34,47,0.96)", "rgba(19,23,31,0.98)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        padding: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        shadowColor: "#000",
        shadowOpacity: 0.22,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
        gap: 16,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: "rgba(255,255,255,0.56)", fontSize: 12, fontWeight: "700", letterSpacing: 0.8 }}>
            LOOK {index + 1}
          </Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }} numberOfLines={1} ellipsizeMode="tail">
            Styled for right now
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: "rgba(139,157,255,0.14)",
          }}
        >
          <Text style={{ color: colors.aiAccent, fontSize: 12, fontWeight: "800" }}>
            {Math.round(outfit.score * 100)}% match
          </Text>
        </View>
      </View>

      {memoryHint ? (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 16,
            backgroundColor: "rgba(255,255,255,0.045)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.06)",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, lineHeight: 18, fontWeight: "600" }}>
            {sanitizeDisplayText(memoryHint)}
          </Text>
        </View>
      ) : null}

      <Text style={{ color: "rgba(236,237,238,0.76)", fontSize: 15, lineHeight: 22 }} numberOfLines={4} ellipsizeMode="tail">
        {cleanReason}
      </Text>

      <View style={{ flexDirection: "row", gap: 12 }}>
        {pickedItems.map(({ slot, item }) => {
          const imageUri = getItemImageUrl(item, { variant: "thumb" });
          return (
            <View key={`${outfit.id}-${slot}-${item.id}`} style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <View
                style={{
                  borderRadius: 20,
                  padding: 12,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.06)",
                  aspectRatio: 0.84,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    resizeMode="contain"
                    style={{ width: "100%", height: "100%", borderRadius: 14 }}
                  />
                ) : (
                  <View
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 14,
                      backgroundColor: colors.muted,
                    }}
                  />
                )}
              </View>
              <View style={{ gap: 3 }}>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", letterSpacing: 0.7 }} numberOfLines={1} ellipsizeMode="tail">
                  {slotLabel(slot)}
                </Text>
                <Text numberOfLines={2} ellipsizeMode="tail" style={{ color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>
                  {displayName(item)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: colors.aiAccent,
            opacity: pressed ? 0.86 : 1,
          })}
        >
          <Text style={{ color: "#0f1420", fontWeight: "800" }} numberOfLines={1} ellipsizeMode="tail">
            {saving ? "Saving..." : "Save to Today"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onSwap(outfit)}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.02)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={{ color: "rgba(236,237,238,0.84)", fontWeight: "700" }} numberOfLines={1} ellipsizeMode="tail">Swap item</Text>
        </Pressable>
        <Pressable
          onPress={() => onMoreLikeThis(outfit)}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: "transparent",
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={{ color: "rgba(236,237,238,0.7)", fontWeight: "700" }} numberOfLines={1} ellipsizeMode="tail">More like this</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}
