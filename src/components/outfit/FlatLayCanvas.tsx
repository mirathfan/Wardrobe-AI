import React from "react";

import { Colors } from "@/constants/theme";
import AuraOutfitVisualCard, { buildAuraLookFromSlotItems } from "@/src/components/aura/AuraOutfitVisualCard";
import type { ClothingItem } from "@/src/types/ClothingItem";

type SlotKey = "outerwear" | "top" | "bottom" | "shoes";

type Props = {
  items: Record<SlotKey, ClothingItem | null>;
  previewWidth?: number;
};

const THUMBNAIL_CARD_HORIZONTAL_PADDING = 24;

export function getFlatLayCanvasViewportWidth(previewWidth?: number | null) {
  if (!previewWidth || previewWidth <= 0) return undefined;
  return previewWidth + THUMBNAIL_CARD_HORIZONTAL_PADDING;
}

export default function FlatLayCanvas({ items, previewWidth }: Props) {
  const look = React.useMemo(
    () => buildAuraLookFromSlotItems(items),
    [items],
  );
  const viewportWidth = getFlatLayCanvasViewportWidth(previewWidth);

  if (!look) return null;

  return (
    <AuraOutfitVisualCard
      accessibilityLabel="Outfit preview"
      colors={Colors.dark}
      look={look}
      mode="thumbnail"
      viewportWidth={viewportWidth}
      style={previewWidth ? { width: previewWidth } : undefined}
      densePreview={Boolean(previewWidth)}
    />
  );
}
