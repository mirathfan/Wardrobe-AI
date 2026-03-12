import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useMemo, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SectionList,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { renderAddRow } from "@/src/addItem/renderAddRow";
import { makeDevThrottleLogger } from "@/src/addItem/devPerf";
import { useAddItemController } from "@/src/addItem/useAddItemController";
import { Pill } from "@/src/addItem/ui/Pill";
import { dockSpace } from "@/src/constants/dock";

export default function AddItemScreen() {
  const insets = useSafeAreaInsets();
  const floatingDockSpace = dockSpace(insets.bottom);
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editItemId = useMemo(() => (Array.isArray(editId) ? editId[0] : editId) || null, [editId]);
  const controller = useAddItemController({ editItemId });
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const { state, derived, actions, styles } = controller;
  const onScreenFocus = actions.onScreenFocus;
  const onScreenBlur = actions.onScreenBlur;
  const sectionListRef = useRef<SectionList<{ key: string }> | null>(null);
  const renderLog = useMemo(() => makeDevThrottleLogger("AddScreen"), []);
  const profilerStatsRef = useRef({ commits: 0, total: 0 });

  useFocusEffect(
    React.useCallback(() => {
      onScreenFocus();
      return () => {
        onScreenBlur();
      };
    }, [onScreenBlur, onScreenFocus])
  );

  const formRows = useMemo(() => {
    const rows: { key: string }[] = [{ key: "photo" }];
    if (derived.showBasics) rows.push({ key: "basics" });
    if (derived.showDetails) {
      rows.push({ key: "details" });
    }
    rows.push({ key: "advanced-toggle" });
    if (derived.showAdvanced) {
      rows.push({ key: "fabric-header" });
      if (state.fabricExpanded) rows.push({ key: "fabric-content" });
      rows.push({ key: "size-header" });
      if (state.sizeExpanded) rows.push({ key: "size-content" });
      rows.push({ key: "occasion-header" });
      if (state.occasionExpanded) rows.push({ key: "occasion-content" });
      rows.push({ key: "season-header" });
      if (state.seasonExpanded) rows.push({ key: "season-content" });
      rows.push({ key: "fit-header" });
      if (state.fitExpanded) rows.push({ key: "fit-content" });
      rows.push({ key: "notes-header" });
      if (state.notesExpanded) rows.push({ key: "notes-content" });
    }
    return [{ key: "form", data: rows }];
  }, [
    derived.showAdvanced,
    derived.showBasics,
    derived.showDetails,
    state.fabricExpanded,
    state.fitExpanded,
    state.notesExpanded,
    state.occasionExpanded,
    state.seasonExpanded,
    state.sizeExpanded,
  ]);

  renderLog({
    rows: formRows?.[0]?.data?.length ?? 0,
    loading: state.loading,
    uploading: state.uploadingPhoto,
    ai: state.aiStatus,
  });

  const scrollToChecklistRow = useCallback(
    (rowId: string) => {
      const keyMap: Record<string, string> = {
        photo: "photo",
        category: "details",
        colors: "details",
        details: "details",
        advanced: "advanced-toggle",
      };
      const targetKey = keyMap[rowId] ?? rowId;
      const index = formRows[0]?.data.findIndex((row) => row.key === targetKey) ?? -1;
      if (index < 0) return;
      sectionListRef.current?.scrollToLocation({
        sectionIndex: 0,
        itemIndex: index,
        animated: true,
        viewPosition: 0.12,
      });
    },
    [formRows]
  );

  const handleProfilerRender = useCallback(
    (
      _id: string,
      phase: "mount" | "update" | "nested-update",
      actualDuration: number
    ) => {
      if (!__DEV__) return;
      profilerStatsRef.current.commits += 1;
      profilerStatsRef.current.total += actualDuration;
      if (profilerStatsRef.current.commits % 15 === 0) {
        const avg = profilerStatsRef.current.total / profilerStatsRef.current.commits;
        console.log(
          `[Perf] AddScreen profiler phase=${phase} avgCommit=${avg.toFixed(1)}ms last=${actualDuration.toFixed(1)}ms`
        );
      }
    },
    []
  );

  const renderRow = useCallback(
    ({ item }: { item: { key: string } }) =>
      renderAddRow({ rowKey: item.key, controller: controllerRef.current }),
    []
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <React.Profiler id="AddScreen" onRender={handleProfilerRender}>
        <View style={styles.container}>
          <SectionList
            ref={sectionListRef}
            sections={formRows}
            keyExtractor={(item) => item.key}
            renderItem={renderRow}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onScrollBeginDrag={() => Keyboard.dismiss()}
            stickySectionHeadersEnabled={false}
            removeClippedSubviews
            windowSize={7}
            initialNumToRender={6}
            maxToRenderPerBatch={6}
            updateCellsBatchingPeriod={16}
            contentContainerStyle={[styles.listContent, { paddingBottom: floatingDockSpace + 180 }]}
            ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
            ListHeaderComponent={
              <View style={{ marginBottom: 14, gap: 10 }}>
                <View style={styles.headerRow}>
                  <Pressable onPress={() => router.back()} style={styles.btnSecondary}>
                    <Text style={styles.btnSecondaryText}>Back</Text>
                  </Pressable>

                  <Text style={{ fontSize: 22, fontWeight: "800" }}>
                    {state.isEdit ? "Edit Item" : "Add Item"}
                  </Text>

                  <View style={{ width: 60 }} />
                </View>

                {!state.isEdit ? (
                  <View style={{ gap: 8 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text style={{ color: "#666", fontSize: 13 }}>
                        Item setup • {derived.setupProgress.percent}%
                      </Text>
                      <Pressable onPress={() => void actions.duplicateLastItem()}>
                        <Text style={{ color: "#111", fontSize: 13, fontWeight: "700" }}>
                          Duplicate last item
                        </Text>
                      </Pressable>
                    </View>
                    <View
                      style={{
                        height: 6,
                        borderRadius: 999,
                        backgroundColor: "#ececec",
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          width: `${derived.setupProgress.percent}%`,
                          height: "100%",
                          borderRadius: 999,
                          backgroundColor: "#111",
                        }}
                      />
                    </View>
                    {state.duplicateBanner ? (
                      <Text style={{ color: "#666", fontSize: 12 }}>
                        Duplicated — replace photo to finish.
                      </Text>
                    ) : null}
                    <View style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {derived.requiredChecklist.map((item: any) => (
                          <Pressable
                            key={item.id}
                            onPress={() => scrollToChecklistRow(item.rowId)}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: item.done ? "#111" : "#ddd",
                              backgroundColor: item.done ? "#111" : "#fff",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: "700",
                                color: item.done ? "#fff" : "#555",
                              }}
                            >
                              {item.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {derived.nextMissing ? (
                        <Text style={{ color: "#666", fontSize: 12 }}>
                          Next: {derived.nextMissing.label}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            }
          />

          <View style={[styles.footer, { paddingBottom: floatingDockSpace + 12 }]}>
            <Text style={styles.ctaStatus}>{derived.ctaStatusText}</Text>
            <Pressable
              onPress={actions.saveItem}
              style={[styles.btnPrimary, !derived.canSave ? { opacity: 0.6 } : null]}
              disabled={!derived.canSave}
            >
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>
                {state.isEdit ? "Save Changes" : "Add to Wardrobe"}
              </Text>
            </Pressable>
          </View>

          <Modal
            visible={state.showCurrencyPicker}
            transparent
            animationType="fade"
            onRequestClose={() => actions.setShowCurrencyPicker(false)}
          >
            <Pressable
              onPress={() => actions.setShowCurrencyPicker(false)}
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.2)",
                alignItems: "center",
                justifyContent: "center",
                padding: 24,
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: 320,
                  borderRadius: 16,
                  backgroundColor: "#fff",
                  padding: 14,
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "800" }}>Select currency</Text>
                {derived.CURRENCIES.map((currency: string) => (
                  <Pressable
                    key={currency}
                    onPress={() => {
                      actions.setPriceCurrency(currency);
                      actions.setShowCurrencyPicker(false);
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: state.priceCurrency === currency ? "#111" : "#ddd",
                      backgroundColor: state.priceCurrency === currency ? "#111" : "#fff",
                    }}
                  >
                    <Text
                      style={{
                        color: state.priceCurrency === currency ? "#fff" : "#111",
                        fontWeight: "700",
                      }}
                    >
                      {currency}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={state.showAttributeSheet != null}
            transparent
            animationType="slide"
            onRequestClose={() => actions.setShowAttributeSheet(null)}
          >
            <Pressable
              onPress={() => actions.setShowAttributeSheet(null)}
              style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.25)", justifyContent: "flex-end" }}
            >
              <Pressable
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: "#fff",
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: Math.max(14, insets.bottom + 6),
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 17, fontWeight: "800" }}>
                  {state.showAttributeSheet === "material"
                    ? "Material"
                    : state.showAttributeSheet === "pattern"
                      ? "Pattern"
                      : "Care"}
                </Text>
                {state.showAttributeSheet === "material"
                  ? derived.MATERIAL_OPTIONS.map((option: string) => (
                      <Pill
                        key={option}
                        label={option}
                        active={state.material === option}
                        onPress={() => {
                          actions.markUserEdited("material");
                          actions.setMaterial(option);
                          actions.setShowAttributeSheet(null);
                        }}
                      />
                    ))
                  : null}
                {state.showAttributeSheet === "pattern"
                  ? derived.PATTERN_OPTIONS.map((option: string) => (
                      <Pill
                        key={option}
                        label={option}
                        active={state.pattern === option}
                        onPress={() => {
                          actions.markUserEdited("pattern");
                          actions.setPattern(option);
                          actions.setShowAttributeSheet(null);
                        }}
                      />
                    ))
                  : null}
              </Pressable>
            </Pressable>
          </Modal>
        </View>
      </React.Profiler>
    </KeyboardAvoidingView>
  );
}
