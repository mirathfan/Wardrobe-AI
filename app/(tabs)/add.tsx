import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";

import { AddItemWizard } from "@/src/addItem/AddItemWizard";
import { Category } from "@/src/shared/wardrobeTaxonomy";

function parseSuggestedCategory(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === Category.TOP || normalized === "tops") return Category.TOP;
  if (normalized === Category.BOTTOM || normalized === "bottoms") return Category.BOTTOM;
  if (normalized === Category.FOOTWEAR || normalized === "shoes") return Category.FOOTWEAR;
  if (normalized === Category.OUTERWEAR) return Category.OUTERWEAR;
  if (normalized === Category.ACCESSORY || normalized === "accessories") return Category.ACCESSORY;
  if (normalized === Category.ONE_PIECE) return Category.ONE_PIECE;
  return null;
}

export default function AddItemScreen() {
  const { editId, suggestedCategory } = useLocalSearchParams<{
    editId?: string;
    suggestedCategory?: string;
  }>();
  const editItemId = useMemo(
    () => (Array.isArray(editId) ? editId[0] : editId) || null,
    [editId]
  );
  const initialCategory = useMemo(
    () => parseSuggestedCategory(suggestedCategory),
    [suggestedCategory]
  );

  return <AddItemWizard editItemId={editItemId} initialCategory={initialCategory} />;
}
