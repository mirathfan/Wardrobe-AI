import { router } from "expo-router";
import React, { useMemo, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
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
import { useAddWizardState } from "./hooks/useAddWizardState";
import { MoreDetailsStepScreen } from "./steps/MoreDetailsStepScreen";
import { PhotoStepScreen } from "./steps/PhotoStepScreen";
import { ReviewDetailsStepScreen } from "./steps/ReviewDetailsStepScreen";
import { Pill } from "./ui/Pill";
import { SafeScreen } from "../components/SafeScreen";
import { dockSpace } from "@/src/constants/dock";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const AddItemWizard = React.memo(function AddItemWizard({
  editItemId,
}: {
  editItemId: string | null;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const floatingDockSpace = dockSpace(insets.bottom);
  const controller = useAddItemController({ editItemId });
  const { state, derived, actions, styles } = controller;
  const renderLog = useMemo(() => makeDevThrottleLogger("AddItemWizard"), []);

  const wizard = useAddWizardState({
    controller,
    onExit: () => router.back(),
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
    <SafeScreen backgroundColor={colors.background} edges={["top"]} style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <React.Profiler id="AddItemWizard" onRender={() => {}}>
          <View style={styles.container}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            onScrollBeginDrag={() => Keyboard.dismiss()}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.listContent, { paddingBottom: floatingDockSpace + 180 }]}
          >
            <View style={{ marginBottom: 14, gap: 14 }}>
              <View style={styles.headerRow}>
                <Pressable onPress={wizard.handleStepBack} style={styles.btnSecondary}>
                  <Text style={styles.btnSecondaryText}>Back</Text>
                </Pressable>

                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>
                  {state.isEdit ? "Edit Item" : "Add Item"}
                </Text>

                <View style={{ width: 60 }} />
              </View>

              <View style={{ gap: 8 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {wizard.currentStepMeta.title}
                  </Text>
                  {!state.isEdit && wizard.currentStepKey === "photo" ? (
                    <Pressable onPress={() => void actions.duplicateLastItem()}>
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>
                        Duplicate last item
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View
                  style={{
                    height: 6,
                    borderRadius: 999,
                    backgroundColor: colors.border,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      width: `${((wizard.currentStep + 1) / wizard.steps.length) * 100}%`,
                      height: "100%",
                      borderRadius: 999,
                      backgroundColor: colors.accent,
                    }}
                  />
                </View>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {wizard.steps.map((step, index) => {
                    const active = index === wizard.currentStep;
                    const complete = index < wizard.currentStep;
                    return (
                      <View
                        key={step.id}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active || complete ? colors.accent : colors.border,
                          backgroundColor: active ? colors.accent : colors.surface,
                        }}
                      >
                        <Text
                          style={{
                            color: active ? "#fff" : complete ? colors.accent : colors.textSecondary,
                            fontSize: 12,
                            fontWeight: "700",
                          }}
                        >
                          {step.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {wizard.currentStepMeta.subtitle}
                </Text>
                {state.duplicateBanner && wizard.currentStepKey === "photo" ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    Duplicated — replace photo to finish.
                  </Text>
                ) : null}
              </View>
            </View>

            {wizard.currentStepKey === "photo" ? (
              <PhotoStepScreen controller={controller} />
            ) : wizard.currentStepKey === "review" ? (
              <ReviewDetailsStepScreen controller={controller} />
            ) : (
              <MoreDetailsStepScreen controller={controller} />
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: floatingDockSpace + 12 }]}>
            <Text style={styles.ctaStatus}>{wizard.stepStatusText}</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {wizard.currentStep > 0 ? (
                <Pressable onPress={wizard.handleStepBack} style={[styles.btnSecondary, { flex: 1 }]}>
                  <Text style={styles.btnSecondaryText}>Back</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={wizard.handleStepForward}
                style={[
                  styles.btnPrimary,
                  { flex: wizard.currentStep > 0 ? 1.6 : 1 },
                  !wizard.canContinue ? { opacity: 0.6 } : null,
                ]}
                disabled={!wizard.canContinue}
              >
                <Text style={{ color: colors.background, fontSize: 16, fontWeight: "900" }}>
                  {wizard.stepButtonText}
                </Text>
              </Pressable>
            </View>
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
                  backgroundColor: colors.surface,
                  padding: 14,
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
                  Select currency
                </Text>
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
                      borderColor: state.priceCurrency === currency ? colors.accent : colors.border,
                      backgroundColor: state.priceCurrency === currency ? colors.accent : colors.surface,
                    }}
                  >
                    <Text
                      style={{
                        color: state.priceCurrency === currency ? "#fff" : colors.text,
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
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <Pressable
                onPress={() => actions.setShowAttributeSheet(null)}
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: "rgba(0,0,0,0.25)",
                }}
              />
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: Math.max(14, insets.bottom + 6),
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>
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
                    : (
                        <Text style={{ color: colors.textSecondary }}>
                          Care tags are coming soon.
                        </Text>
                      )}
              </View>
            </View>
          </Modal>
          </View>
        </React.Profiler>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
});
