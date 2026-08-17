import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { AppColors } from "@/constants/theme";
import { AuraLookCard } from "@/src/components/aura/AuraLookCard";
import type { AuraLayoutVariant } from "@/src/lib/auraLookLayouts";
import type { AuraLook, AuraLookPiece } from "@/src/types/aura";
import type { ClothingItem } from "@/src/types/ClothingItem";
import type { DailyOutfitRecord, OutfitItemsByCategory } from "@/src/utils/dailyOutfits";

export type AuraOutfitVisualCardMode = "full" | "medium" | "thumbnail";

type VisualModeConfig = {
  compact: boolean;
  boardOnly: boolean;
  boardVariant: AuraLayoutVariant;
};

export function getAuraOutfitVisualCardModeConfig(mode: AuraOutfitVisualCardMode): VisualModeConfig {
  if (mode === "thumbnail") {
    return {
      compact: true,
      boardOnly: true,
      boardVariant: "studio",
    };
  }
  if (mode === "medium") {
    return {
      compact: true,
      boardOnly: false,
      boardVariant: "chat",
    };
  }
  return {
    compact: false,
    boardOnly: false,
    boardVariant: "chat",
  };
}

function cleanText(value: unknown, fallback = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function itemTitle(item: ClothingItem) {
  return cleanText(item.name || item.subCategory || item.category, "Closet item");
}

function itemImageUrl(item: ClothingItem) {
  return item.cleanedImageUrl || item.refinedImageUrl || item.originalImageUrl || item.photoUrl || item.photoUri || null;
}

function closetPiece(role: AuraLookPiece["role"], item: ClothingItem): AuraLookPiece {
  return {
    role,
    itemId: item.id,
    itemName: itemTitle(item),
    imageUrl: itemImageUrl(item),
    source: "closet",
  };
}

export function buildAuraLookFromOutfitItemsByCategory(
  itemsByCategory: OutfitItemsByCategory | null | undefined,
  itemsById: Map<string, ClothingItem>,
  options: {
    title?: string | null;
    vibe?: string | null;
    explanation?: string | null;
  } = {},
): AuraLook | null {
  if (!itemsByCategory) return null;
  const pieces: AuraLookPiece[] = [];
  const seen = new Set<string>();

  const pushPiece = (role: AuraLookPiece["role"], itemId: string | null | undefined) => {
    const cleanId = cleanText(itemId);
    if (!cleanId || seen.has(cleanId)) return;
    const item = itemsById.get(cleanId);
    if (!item) return;
    seen.add(cleanId);
    pieces.push(closetPiece(role, item));
  };

  pushPiece("outerwear", itemsByCategory.outerwear);
  pushPiece("top", itemsByCategory.top);
  pushPiece("bottom", itemsByCategory.bottom);
  pushPiece("shoes", itemsByCategory.shoes);

  for (const accessoryId of itemsByCategory.accessories ?? []) {
    pushPiece("accessory", accessoryId);
  }

  if (!pieces.length) return null;

  const title = cleanText(options.title, "AURA outfit");
  const explanation = cleanText(options.explanation, "Built from pieces ready right now.");
  return {
    id: null,
    lookTitle: title,
    occasion: null,
    vibe: cleanText(options.vibe, title),
    shortExplanation: explanation,
    stylingNote: explanation,
    confidence: null,
    personalizationLabel: cleanText(options.vibe),
    pieces,
    fromCloset: pieces.map((piece) => piece.itemName).filter(Boolean),
    addToComplete: [],
    alternates: [],
    actions: [],
  };
}

export function buildAuraLookFromDailyOutfit(
  record: DailyOutfitRecord | null,
  itemsById: Map<string, ClothingItem>,
): AuraLook | null {
  const active = record?.plannedOutfit ?? record?.wornOutfit ?? null;
  if (!active) return null;
  return buildAuraLookFromOutfitItemsByCategory(active.itemsByCategory, itemsById, {
    title: active.title ?? (record?.wornOutfit ? "Worn today" : "Today's look"),
    vibe: active.source === "aura_agent" || active.source === "aura" ? "AURA" : "Closet",
    explanation: "reasons" in active ? active.reasons?.[0] : undefined,
  });
}

export function buildAuraLookFromSlotItems(
  items: {
    outerwear?: ClothingItem | null;
    top?: ClothingItem | null;
    bottom?: ClothingItem | null;
    shoes?: ClothingItem | null;
  },
  options: {
    title?: string | null;
    vibe?: string | null;
    explanation?: string | null;
  } = {},
): AuraLook | null {
  const pieces: AuraLookPiece[] = [];
  if (items.outerwear) pieces.push(closetPiece("outerwear", items.outerwear));
  if (items.top) pieces.push(closetPiece("top", items.top));
  if (items.bottom) pieces.push(closetPiece("bottom", items.bottom));
  if (items.shoes) pieces.push(closetPiece("shoes", items.shoes));
  if (!pieces.length) return null;

  const title = cleanText(options.title, "Outfit preview");
  const explanation = cleanText(options.explanation, "Built from your wardrobe.");
  return {
    id: null,
    lookTitle: title,
    occasion: null,
    vibe: cleanText(options.vibe, title),
    shortExplanation: explanation,
    stylingNote: explanation,
    confidence: null,
    personalizationLabel: cleanText(options.vibe),
    pieces,
    fromCloset: pieces.map((piece) => piece.itemName).filter(Boolean),
    addToComplete: [],
    alternates: [],
    actions: [],
  };
}

export default function AuraOutfitVisualCard({
  look,
  colors,
  itemsById,
  mode = "full",
  viewportWidth,
  titleAccessory,
  accessibilityLabel,
  style,
  testID,
  densePreview,
}: {
  look: AuraLook;
  colors?: AppColors;
  itemsById?: Map<string, ClothingItem>;
  mode?: AuraOutfitVisualCardMode;
  viewportWidth?: number;
  titleAccessory?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  densePreview?: boolean;
}) {
  const config = getAuraOutfitVisualCardModeConfig(mode);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      testID={testID ?? `aura-outfit-visual-card-${mode}`}
      style={styles.root}
    >
      <AuraLookCard
        colors={colors}
        look={look}
        itemsById={itemsById}
        hideActions
        compact={config.compact}
        boardOnly={config.boardOnly}
        boardVariant={config.boardVariant}
        viewportWidth={viewportWidth}
        titleAccessory={titleAccessory}
        style={style}
        densePreview={densePreview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: "stretch",
  },
});
