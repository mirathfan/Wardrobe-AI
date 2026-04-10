import { Alert, type PressableProps } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";

export const WIZARD_STEPS = [
  {
    id: "photo",
    label: "Photo",
    title: "Step 1 — Photo",
    subtitle: "Pick a photo, preview it, and optionally refine the background cutout.",
  },
  {
    id: "review",
    label: "Review",
    title: "Step 2 — Review AI Details",
    subtitle: "Check AI-extracted details and correct anything before moving on.",
  },
  {
    id: "more",
    label: "More",
    title: "Step 3 — More Details",
    subtitle: "Add optional metadata, then save the item to your wardrobe.",
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
  const hasReviewDetails = !!state.category && state.selectedColors.length > 0;
  const canContinue =
    currentStep === 0 ? hasPhoto : currentStep === 1 ? hasReviewDetails : derived.canSave;
  const currentStepMeta = WIZARD_STEPS[currentStep];

  const stepButtonText =
    currentStep === 2
      ? state.isEdit
        ? "Save Changes"
        : "Add to Wardrobe"
      : "Next";

  const stepStatusText =
    currentStep === 0
      ? hasPhoto
        ? "Photo ready"
        : "Add a photo to continue"
      : currentStep === 1
        ? hasReviewDetails
          ? "Review complete"
          : "Confirm category and color before continuing"
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
      if (!state.category) {
        Alert.alert("Review details", "Confirm a category before continuing.");
        return;
      }
      if (state.selectedColors.length === 0) {
        Alert.alert("Review details", "Pick at least one color before continuing.");
        return;
      }
      setCurrentStep(2);
      return;
    }

    actions.saveItem();
  }, [actions, currentStep, hasPhoto, state.category, state.selectedColors.length]);

  const currentStepKey = currentStepMeta.id;

  return useMemo(
    () => ({
      currentStep,
      currentStepKey,
      currentStepMeta,
      canContinue,
      hasPhoto,
      hasReviewDetails,
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
      stepButtonText,
      stepStatusText,
    ]
  );
}
