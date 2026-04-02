import { useLocalSearchParams } from "expo-router";
import React, { useMemo } from "react";

import { AddItemWizard } from "@/src/addItem/AddItemWizard";

export default function AddItemScreen() {
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editItemId = useMemo(
    () => (Array.isArray(editId) ? editId[0] : editId) || null,
    [editId]
  );

  return <AddItemWizard editItemId={editItemId} />;
}
