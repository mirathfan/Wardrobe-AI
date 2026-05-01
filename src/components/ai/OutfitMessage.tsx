import AppImage from "@/src/components/common/AppImage";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import { getItemImageDecoration, getItemImagePresentation, getItemImageUrl } from "@/src/lib/itemImage";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";

import type { ChatOutfit } from "./chatTypes";
import { auraShadow, auraTheme } from "./aiTheme";

function displayName(item: ClothingItem) {
  return item.name || `${item.displayColor ?? item.primaryColor ?? ""} ${item.category}`.trim();
}

function slotLabel(slot: string) {
  if (slot === "footwear") return "Shoes";
  return slot.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

type OutfitMessageProps = {
  colors: AppColors;
  outfit: ChatOutfit;
  itemsById: Map<string, ClothingItem>;
  saving: boolean;
  index: number;
  memoryHint?: string | null;
  onSave: () => void;
  onMoreLikeThis: (outfit: ChatOutfit) => void;
  onSwap: (outfit: ChatOutfit) => void;
};

function OutfitMessage({
  colors,
  outfit,
  itemsById,
  saving,
  index,
  memoryHint,
  onSave,
  onMoreLikeThis,
  onSwap,
}: OutfitMessageProps) {
  const pickedItems = outfit.picks
    .map((pick) => ({
      slot: pick.slot,
      item: itemsById.get(pick.itemId),
    }))
    .filter((value): value is { slot: string; item: ClothingItem } => !!value.item);
  const cleanReason = sanitizeDisplayText(outfit.reason);

  return (
    <LinearGradient
      colors={["rgba(16,18,24,0.98)", "rgba(10,12,18,0.98)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 28,
        padding: 18,
        borderWidth: 1,
        borderColor: auraTheme.border,
        gap: 16,
        ...auraShadow(0.2),
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: auraTheme.textMuted, fontSize: 12, fontWeight: "700", letterSpacing: 0.8 }}>
            LOOK {index + 1}
          </Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }} numberOfLines={1}>
            Styled for right now
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: "rgba(243,190,221,0.12)",
            borderWidth: 1,
            borderColor: "rgba(243,223,195,0.18)",
          }}
        >
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800" }}>
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
            backgroundColor: "rgba(255,255,255,0.04)",
            borderWidth: 1,
            borderColor: auraTheme.borderSoft,
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 13, lineHeight: 18, fontWeight: "600" }}>
            {sanitizeDisplayText(memoryHint)}
          </Text>
        </View>
      ) : null}

      <Text style={{ color: "rgba(236,237,238,0.78)", fontSize: 15, lineHeight: 23 }} numberOfLines={4}>
        {cleanReason}
      </Text>

      <View style={{ flexDirection: "row", gap: 12 }}>
        {pickedItems.map(({ slot, item }) => {
          const imageUri = getItemImageUrl(item, { variant: "thumb" });
          const imagePresentation = getItemImagePresentation(item, { surface: "ai_outfit" });
          const imageDecoration = getItemImageDecoration(item, "ai_outfit");
          return (
            <View key={`${outfit.id}-${slot}-${item.id}`} style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <View
                style={{
                  borderRadius: 20,
                  padding: 12,
                  backgroundColor: "rgba(255,255,255,0.04)",
                  borderWidth: 1,
                  borderColor: "rgba(243,223,195,0.14)",
                  aspectRatio: imagePresentation.containerAspectRatio,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: imageDecoration.shadowStyle.width as any,
                    height: imageDecoration.shadowStyle.height as any,
                    bottom: imageDecoration.shadowStyle.bottom as any,
                    borderRadius: 999,
                    backgroundColor: "#000",
                    opacity: imageDecoration.shadowStyle.opacity,
                    shadowColor: "#000",
                    shadowOpacity: imageDecoration.shadowStyle.opacity * 0.7,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 2,
                  }}
                />
                {imageUri ? (
                  <AppImage
                    source={{
                      uri: imageUri,
                    }}
                    resizeMode="contain"
                    style={[
                      { width: "100%", height: "100%", borderRadius: 14 },
                      imagePresentation.imageStyle,
                    ]}
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
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: "700", letterSpacing: 0.7 }}>
                  {slotLabel(slot)}
                </Text>
                <Text numberOfLines={2} style={{ color: colors.text, fontSize: 13, fontWeight: "700", lineHeight: 18 }}>
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
            backgroundColor: "rgba(243,223,195,0.16)",
            borderWidth: 1,
            borderColor: "rgba(243,223,195,0.24)",
            opacity: pressed ? 0.86 : 1,
          })}
        >
          <Text style={{ color: colors.text, fontWeight: "800" }}>{saving ? "Saving..." : "Save to Today"}</Text>
        </Pressable>
        <Pressable
          onPress={() => onSwap(outfit)}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: auraTheme.surfaceSoft,
            borderWidth: 1,
            borderColor: auraTheme.borderSoft,
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={{ color: "rgba(236,237,238,0.84)", fontWeight: "700" }}>Swap item</Text>
        </Pressable>
        <Pressable
          onPress={() => onMoreLikeThis(outfit)}
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.04)",
            opacity: pressed ? 0.82 : 1,
          })}
        >
          <Text style={{ color: "rgba(236,237,238,0.7)", fontWeight: "700" }}>More like this</Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

export default React.memo(OutfitMessage);
