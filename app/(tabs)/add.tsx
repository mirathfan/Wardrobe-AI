import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AddItemWizard } from "@/src/addItem/AddItemWizard";
import { Colors } from "@/constants/theme";
import { captureSafeException } from "@/src/lib/sentry";
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

class AddItemFlowErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey: string; onReset: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    captureSafeException(error, { boundary: "add_item_flow" });
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.fallbackScreen}>
        <View style={styles.fallbackPanel}>
          <Text style={styles.fallbackTitle}>Couldn&apos;t load Add Item</Text>
          <Text style={styles.fallbackCopy}>
            Your closet is safe. Try opening the flow again.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              this.setState({ hasError: false });
              this.props.onReset();
            }}
            style={styles.fallbackButton}
          >
            <Text style={styles.fallbackButtonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
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
    <AddItemFlowErrorBoundary
      resetKey={formSessionKey}
      onReset={() => setCreateFocusSession(String(Date.now()))}
    >
      <AddItemWizard
        mode={mode}
        editItemId={editItemId}
        duplicateItemId={duplicateItemId}
        sourceItemId={duplicateSourceItemId}
        initialCategory={initialCategory}
        formSessionKey={formSessionKey}
        exitRoute="/(tabs)/closet"
      />
    </AddItemFlowErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fallbackScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
    padding: 24,
  },
  fallbackPanel: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    gap: 14,
  },
  fallbackTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  fallbackCopy: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  fallbackButton: {
    minHeight: 44,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 18,
  },
  fallbackButtonText: {
    color: Colors.dark.background,
    fontSize: 14,
    fontWeight: "800",
  },
});
