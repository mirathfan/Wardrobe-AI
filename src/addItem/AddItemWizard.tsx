import React, { useMemo } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeDevThrottleLogger } from "./devPerf";
import { useAddItemController } from "./useAddItemController";
import { AddItemHeader } from "./components/AddItemHeader";
import { AddItemStepIndicator } from "./components/AddItemStepIndicator";
import { AddItemStickyFooter } from "./components/AddItemStickyFooter";
import { useAddWizardState } from "./hooks/useAddWizardState";
import { MoreDetailsStepScreen } from "./steps/MoreDetailsStepScreen";
import { PhotoStepScreen } from "./steps/PhotoStepScreen";
import { ReviewDetailsStepScreen } from "./steps/ReviewDetailsStepScreen";
import { Pill } from "./ui/Pill";
import { SafeScreen } from "../components/SafeScreen";
import { dockSpace } from "@/src/constants/dock";
import {
  auraCardStyle,
  auraChipStyle,
  auraChipTextStyle,
  auraSheetBackdropStyle,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import type { AddItemMode } from "@/src/addItem/controllerShared";
import type { Category } from "@/src/shared/wardrobeTaxonomy";

type AddItemExitRoute = Parameters<typeof router.replace>[0];

function itemDetailRoute(itemId: string): AddItemExitRoute {
  return {
    pathname: "/(tabs)/item/[id]",
    params: { id: itemId, refreshKey: String(Date.now()) },
  } as AddItemExitRoute;
}

export const AddItemWizard = React.memo(function AddItemWizard({
  mode,
  editItemId,
  duplicateItemId,
  sourceItemId,
  initialCategory,
  formSessionKey,
  exitRoute = "/(tabs)/closet",
}: {
  mode: AddItemMode;
  editItemId: string | null;
  duplicateItemId?: string | null;
  sourceItemId?: string | null;
  initialCategory?: Category | null;
  formSessionKey: string;
  exitRoute?: AddItemExitRoute;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const floatingDockSpace = dockSpace(insets.bottom);
  const controller = useAddItemController({
    mode,
    editItemId,
    duplicateItemId: duplicateItemId ?? null,
    initialCategory: initialCategory ?? null,
    formSessionKey,
  });
  const { state, derived, actions, styles } = controller;
  const renderLog = useMemo(() => makeDevThrottleLogger("AddItemWizard"), []);
  const handleExit = React.useCallback(() => {
    const target =
      mode === "edit" && editItemId
        ? itemDetailRoute(editItemId)
        : mode === "duplicate" && sourceItemId
          ? itemDetailRoute(sourceItemId)
          : exitRoute;

    void (async () => {
      await actions.resetFormSession?.("exit", { deleteActiveDraft: mode !== "edit" });
      router.replace(target);
    })();
  }, [actions, editItemId, exitRoute, mode, sourceItemId]);

  const handleDuplicate = React.useCallback(() => {
    if (mode === "edit" && editItemId) {
      void actions.resetFormSession?.("duplicate-from-edit");
      router.replace({
        pathname: "/(tabs)/add",
        params: {
          duplicateId: editItemId,
          sourceItemId: editItemId,
          addSession: String(Date.now()),
        },
      });
      return;
    }

    void actions.duplicateLastItem();
  }, [actions, editItemId, mode]);

  const wizard = useAddWizardState({
    controller,
    onExit: handleExit,
  });

  const onScreenFocus = actions.onScreenFocus;
  const onScreenBlur = actions.onScreenBlur;

  useFocusEffect(
    React.useCallback(() => {
      onScreenFocus();
      return () => {
        onScreenBlur();
      };
    }, [onScreenBlur, onScreenFocus])
  );

  renderLog({
    step: wizard.currentStepKey,
    loading: state.loading,
    uploading: state.uploadingPhoto,
    ai: state.aiStatus,
  });

  return (
    <SafeScreen
      backgroundColor={colors.background}
      includeTopInset={false}
      includeBottomInset={false}
      style={styles.screen}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <AddItemHeader
            title={state.isEdit ? "Edit Item" : "Add Item"}
            eyebrow="AURA CLOSET"
            onBack={handleExit}
            canDuplicate={wizard.currentStepKey === "photo" && (mode === "edit" || mode === "create")}
            duplicateActive={state.duplicateBanner}
            duplicateLabel={mode === "create" ? "Duplicate last" : "Duplicate"}
            onDuplicate={handleDuplicate}
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onScrollBeginDrag={() => Keyboard.dismiss()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, { paddingBottom: floatingDockSpace + 120 }]}
          >
            <View style={{ marginBottom: 12, gap: 8 }}>
              <AddItemStepIndicator steps={wizard.steps} currentStep={wizard.currentStep} />
              {state.duplicateBanner && wizard.currentStepKey === "photo" ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                  Duplicated. Replace the photo to finish.
                </Text>
              ) : null}
            </View>

            {wizard.currentStepKey === "photo" ? (
              <PhotoStepScreen controller={controller} />
            ) : wizard.currentStepKey === "details" ? (
              <ReviewDetailsStepScreen controller={controller} />
            ) : (
              <MoreDetailsStepScreen controller={controller} />
            )}
          </ScrollView>

          <AddItemStickyFooter
            currentStep={wizard.currentStep}
            bottomPadding={floatingDockSpace + 10}
            statusText={wizard.stepStatusText}
            buttonText={wizard.stepButtonText}
            canContinue={wizard.canContinue}
            onBack={wizard.handleStepBack}
            onForward={wizard.handleStepForward}
          />

          <Modal
            visible={state.showCurrencyPicker}
            transparent
            animationType="fade"
            onRequestClose={() => actions.setShowCurrencyPicker(false)}
          >
            <Pressable
              onPress={() => actions.setShowCurrencyPicker(false)}
              style={{
                ...auraSheetBackdropStyle(colors),
                alignItems: "center",
                padding: 24,
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxWidth: 320,
                  ...auraCardStyle(colors, "sheet"),
                  padding: 14,
                  gap: 8,
                }}
              >
                <Text style={[auraTypography.cardTitle, { color: colors.text }]}>
                  Select currency
                </Text>
                {derived.CURRENCIES.map((currency: string) => (
                  <Pressable
                    key={currency}
                    onPress={() => {
                      actions.markUserEdited("price");
                      actions.setPriceCurrency(currency);
                      if (state.priceAmount) {
                        actions.setPriceSource("manual");
                        actions.setPriceDisplay("");
                      }
                      actions.setShowCurrencyPicker(false);
                    }}
                    style={{
                      ...auraChipStyle(colors, state.priceCurrency === currency ? "selected" : "unselected"),
                      alignItems: "flex-start",
                    }}
                  >
                    <Text
                      style={{
                        ...auraChipTextStyle(colors, state.priceCurrency === currency ? "selected" : "unselected"),
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
            visible={state.showAttributeSheet === "material" || state.showAttributeSheet === "pattern"}
            transparent
            animationType="slide"
            onRequestClose={() => actions.setShowAttributeSheet(null)}
          >
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <Pressable
                onPress={() => actions.setShowAttributeSheet(null)}
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: colors.overlay,
                }}
              />
              <View
                style={{
                  ...auraCardStyle(colors, "sheet"),
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: Math.max(14, insets.bottom + 6),
                  gap: 10,
                }}
              >
                <Text style={[auraTypography.cardTitle, { color: colors.text }]}>
                  {state.showAttributeSheet === "material"
                    ? "Material"
                    : "Pattern"}
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
                  : state.showAttributeSheet === "pattern"
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
              </View>
            </View>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
});
