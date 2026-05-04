import AppImage from "@/src/components/common/AppImage";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Text, View } from "react-native";

import type { AppColors } from "@/constants/theme";
import AuraPressable from "@/src/components/aura/AuraPressable";
import { ACTION_GAP, CHIP_BORDER_WIDTH, CHIP_HEIGHT, CHIP_HORIZONTAL_PADDING, PILL_RADIUS } from "@/src/constants/auraControls";
import { getItemImageDecoration, getItemImagePresentation, getItemImageUrl } from "@/src/lib/itemImage";
import { sanitizeDisplayText } from "@/src/lib/text";
import type { ClothingItem } from "@/src/types/ClothingItem";

import type { ChatOutfit } from "./chatTypes";
import { auraShadow } from "./aiTheme";

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
      colors={["rgba(43,18,76,0.42)", "rgba(9,0,11,0.96)"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        padding: 15,
        borderWidth: CHIP_BORDER_WIDTH,
        borderColor: colors.border,
        gap: 14,
        ...auraShadow(0.1),
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: "700", letterSpacing: 0 }}>
            Stylist edit {index + 1}
          </Text>
          <Text style={{ color: colors.text, fontSize: 19, lineHeight: 23, fontWeight: "800" }} numberOfLines={1}>
            Styled for right now
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 9,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: colors.purpleSurface,
            borderWidth: CHIP_BORDER_WIDTH,
            borderColor: colors.purpleBorder,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: "800" }}>
            {Math.round(outfit.score * 100)}% match
          </Text>
        </View>
      </View>

      {memoryHint ? (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 9,
            borderRadius: 15,
            backgroundColor: colors.chipBackground,
            borderWidth: CHIP_BORDER_WIDTH,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, fontWeight: "600" }}>
            {sanitizeDisplayText(memoryHint)}
          </Text>
        </View>
      ) : null}

      <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }} numberOfLines={4}>
        {cleanReason}
      </Text>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {pickedItems.map(({ slot, item }) => {
          const imageUri = getItemImageUrl(item, { variant: "thumb" });
          const imagePresentation = getItemImagePresentation(item, { surface: "ai_outfit" });
          const imageDecoration = getItemImageDecoration(item, "ai_outfit");
          return (
            <View key={`${outfit.id}-${slot}-${item.id}`} style={{ flex: 1, minWidth: 0, gap: 10 }}>
              <View
                style={{
                  borderRadius: 18,
                  padding: 10,
                  backgroundColor: colors.boardLight,
                  borderWidth: CHIP_BORDER_WIDTH,
                  borderColor: colors.borderWarm,
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
                    backgroundColor: colors.shadow,
                    opacity: imageDecoration.shadowStyle.opacity,
                    shadowColor: colors.shadow,
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
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0 }}>
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

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: ACTION_GAP }}>
        <AuraPressable
          onPress={onSave}
          disabled={saving}
          haptic="light"
          hapticTrigger="press"
          pressedScale={0.96}
          pressedOpacity={0.88}
          style={{
            height: CHIP_HEIGHT,
            minHeight: CHIP_HEIGHT,
            paddingHorizontal: CHIP_HORIZONTAL_PADDING,
            paddingVertical: 0,
            borderRadius: PILL_RADIUS,
            backgroundColor: colors.ctaCream,
            borderWidth: CHIP_BORDER_WIDTH,
            borderColor: colors.ctaCream,
            alignItems: "center",
            justifyContent: "center",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Text style={{ color: colors.ctaText, fontSize: 12, fontWeight: "800" }}>{saving ? "Saving..." : "Save to Today"}</Text>
        </AuraPressable>
        <AuraPressable
          onPress={() => onSwap(outfit)}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.96}
          pressedOpacity={0.88}
          style={{
            height: CHIP_HEIGHT,
            minHeight: CHIP_HEIGHT,
            paddingHorizontal: CHIP_HORIZONTAL_PADDING,
            paddingVertical: 0,
            borderRadius: PILL_RADIUS,
            backgroundColor: colors.surfaceSoft,
            borderWidth: CHIP_BORDER_WIDTH,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}>Swap item</Text>
        </AuraPressable>
        <AuraPressable
          onPress={() => onMoreLikeThis(outfit)}
          haptic="selection"
          hapticTrigger="press"
          pressedScale={0.96}
          pressedOpacity={0.88}
          style={{
            height: CHIP_HEIGHT,
            minHeight: CHIP_HEIGHT,
            paddingHorizontal: CHIP_HORIZONTAL_PADDING,
            paddingVertical: 0,
            borderRadius: PILL_RADIUS,
            borderWidth: CHIP_BORDER_WIDTH,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}>More like this</Text>
        </AuraPressable>
      </View>
    </LinearGradient>
  );
}

export default React.memo(OutfitMessage);
