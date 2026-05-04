import { Alert } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";

export const WIZARD_STEPS = [
  {
    id: "photo",
    label: "Photo",
    title: "Photo",
    subtitle: "Add the item image.",
  },
  {
    id: "details",
    label: "Details",
    title: "Details",
    subtitle: "Confirm the essentials.",
  },
  {
    id: "optional",
    label: "Optional",
    title: "Optional",
    subtitle: "Add extra metadata.",
  },
] as const;

export type WizardStepIndex = 0 | 1 | 2;

export function useAddWizardState(params: {
  controller: any;
  onExit: () => void;
}) {
  const { controller, onExit } = params;
  const { state, derived, actions } = controller;
  const [currentStep, setCurrentStep] = useState<WizardStepIndex>(0);

  useEffect(() => {
    if (!derived.previewPhotoUri && currentStep > 0) {
      setCurrentStep(0);
    }
  }, [currentStep, derived.previewPhotoUri]);

  useEffect(() => {
    if (currentStep === 2 && !state.advancedExpanded) {
      actions.setAdvancedExpanded(true);
    }
  }, [actions, currentStep, state.advancedExpanded]);

  const hasPhoto = !!derived.previewPhotoUri;
  const detailMissing = useMemo(() => {
    const missing: string[] = [];
    if (!String(state.brand ?? "").trim()) missing.push("brand");
    if (!String(state.name ?? "").trim()) missing.push("item name");
    if (!state.category) missing.push("category");
    if (state.selectedColors.length === 0) missing.push("color");
    return missing;
  }, [state.brand, state.category, state.name, state.selectedColors.length]);
  const hasReviewDetails = detailMissing.length === 0;
  const canContinue =
    currentStep === 0 ? hasPhoto : currentStep === 1 ? hasReviewDetails : derived.canSave;
  const currentStepMeta = WIZARD_STEPS[currentStep];

  const stepButtonText =
    currentStep === 2
      ? state.isEdit
        ? "Save Changes"
        : "Add to Wardrobe"
      : "Continue";

  const stepStatusText =
    currentStep === 0
      ? hasPhoto
        ? "Photo ready"
        : "Add a photo to continue"
      : currentStep === 1
        ? hasReviewDetails
          ? "Details ready"
          : `Missing: ${detailMissing.join(", ")}`
        : derived.ctaStatusText;

  const handleStepBack = useCallback(() => {
    if (currentStep === 0) {
      onExit();
      return;
    }
    setCurrentStep((prev) => Math.max(0, prev - 1) as WizardStepIndex);
  }, [currentStep, onExit]);

  const handleStepForward = useCallback(() => {
    if (currentStep === 0) {
      if (!hasPhoto) {
        Alert.alert("Add a photo", "Pick a photo or take one before continuing.");
        return;
      }
      setCurrentStep(1);
      return;
    }

    if (currentStep === 1) {
      if (!String(state.brand ?? "").trim()) {
        Alert.alert("Confirm details", "Add a brand before continuing.");
        return;
      }
      if (!String(state.name ?? "").trim()) {
        Alert.alert("Confirm details", "Add an item name before continuing.");
        return;
      }
      if (!state.category) {
        Alert.alert("Confirm details", "Confirm a category before continuing.");
        return;
      }
      if (state.selectedColors.length === 0) {
        Alert.alert("Confirm details", "Pick at least one color before continuing.");
        return;
      }
      setCurrentStep(2);
      return;
    }

    actions.saveItem();
  }, [actions, currentStep, hasPhoto, state.brand, state.category, state.name, state.selectedColors.length]);

  const currentStepKey = currentStepMeta.id;

  return useMemo(
    () => ({
      currentStep,
      currentStepKey,
      currentStepMeta,
      canContinue,
      hasPhoto,
      hasReviewDetails,
      detailMissing,
      stepButtonText,
      stepStatusText,
      setCurrentStep,
      handleStepBack,
      handleStepForward,
      steps: WIZARD_STEPS,
    }),
    [
      canContinue,
      currentStep,
      currentStepKey,
      currentStepMeta,
      handleStepBack,
      handleStepForward,
      hasPhoto,
      hasReviewDetails,
      detailMissing,
      stepButtonText,
      stepStatusText,
    ]
  );
}
