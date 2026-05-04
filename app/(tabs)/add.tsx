import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";

import { AddItemWizard } from "@/src/addItem/AddItemWizard";
import type { AddItemMode } from "@/src/addItem/controllerShared";
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
  const { editId, duplicateId, sourceItemId, suggestedCategory, addSession } = useLocalSearchParams<{
    editId?: string;
    duplicateId?: string;
    sourceItemId?: string;
    suggestedCategory?: string;
    addSession?: string;
  }>();
  const [createFocusSession, setCreateFocusSession] = useState(() => String(Date.now()));
  const editItemId = useMemo(
    () => (Array.isArray(editId) ? editId[0] : editId) || null,
    [editId]
  );
  const duplicateItemId = useMemo(
    () => (Array.isArray(duplicateId) ? duplicateId[0] : duplicateId) || null,
    [duplicateId]
  );
  const duplicateSourceItemId = useMemo(
    () =>
      (Array.isArray(sourceItemId) ? sourceItemId[0] : sourceItemId) ||
      duplicateItemId ||
      null,
    [duplicateItemId, sourceItemId]
  );
  const routeAddSession = useMemo(
    () => (Array.isArray(addSession) ? addSession[0] : addSession) || null,
    [addSession]
  );
  const initialCategory = useMemo(
    () => parseSuggestedCategory(suggestedCategory),
    [suggestedCategory]
  );
  const mode: AddItemMode = editItemId ? "edit" : duplicateItemId ? "duplicate" : "create";
  const formSessionKey = useMemo(() => {
    if (mode === "edit") return `edit:${editItemId}`;
    if (mode === "duplicate") return `duplicate:${duplicateItemId}:${routeAddSession ?? ""}`;
    return `create:${routeAddSession ?? createFocusSession}:${initialCategory ?? ""}`;
  }, [createFocusSession, duplicateItemId, editItemId, initialCategory, mode, routeAddSession]);
  useFocusEffect(
    React.useCallback(() => {
      if (editItemId || duplicateItemId || routeAddSession) return;
      setCreateFocusSession(String(Date.now()));
    }, [duplicateItemId, editItemId, routeAddSession])
  );

  return (
    <AddItemWizard
      mode={mode}
      editItemId={editItemId}
      duplicateItemId={duplicateItemId}
      sourceItemId={duplicateSourceItemId}
      initialCategory={initialCategory}
      formSessionKey={formSessionKey}
      exitRoute="/(tabs)/closet"
    />
  );
}
