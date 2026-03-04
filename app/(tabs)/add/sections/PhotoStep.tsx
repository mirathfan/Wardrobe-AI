import React from "react";
import { Alert, Text, View } from "react-native";
import { PhotoEditorSection } from "../../../../src/components/PhotoEditorSection";
import { SectionCard } from "../ui/SectionCard";
import { SectionTitle } from "../ui/SectionTitle";
import { RequiredBadge } from "../ui/RequiredBadge";

export const PhotoStep = React.memo(function PhotoStep({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;

  return (
    <SectionCard>
      <SectionTitle
        title="Photo"
        right={<RequiredBadge />}
        subtitle="Start with a clean photo. AI autofill runs in the background while you keep going."
      />
      {state.loading ? <Text>{state.uploadingPhoto ? "Uploading photo..." : "Loading..."}</Text> : null}
      <PhotoEditorSection
        previewUri={derived.previewPhotoUri}
        refineValue={state.refineValue}
        isProcessing={state.refiningCutout}
        canRefine={derived.canRefineCutout}
        showPendingNote={!!state.pendingPhotoUri}
        onPickLibrary={() => void actions.pickPhoto("library")}
        onUseCamera={() => void actions.pickPhoto("camera")}
        onRemove={() => {
          void actions.resetCreateFlow("remove-photo", { deleteActiveDraft: true });
        }}
        onRefineChange={actions.handleRefineValueChange}
        onRefineComplete={actions.handleRefineValueComplete}
        onResetRefine={actions.handleRefineReset}
        onReplace={() => void actions.pickPhoto("library")}
        onRefineOpen={() => {}}
        onAdjust={() => {}}
        onRotate={() => Alert.alert("Coming soon", "Rotate is coming soon.")}
      />
      {!derived.isEdit && state.draftItemId ? (
        <View style={controller.styles.inlineInfo}>
          <Text style={{ fontSize: 14, fontWeight: "800" }}>
            AI Autofill: {state.ingestionStatus ? state.ingestionStatus : "starting"}
          </Text>
          <Text style={{ color: "#666" }}>
            {[
              `Category: ${state.category ?? "Auto (AI)"}`,
              state.subCategory ? `Sub-category: ${state.subCategory}` : "",
              state.selectedColors.length
                ? `Colors: ${state.selectedColors.join(" / ")}`
                : "Colors: Auto (AI)",
              `Pattern: ${derived.displayedPattern}`,
              `Material: ${derived.displayedMaterial}`,
            ]
              .filter(Boolean)
              .join(" • ") || "Waiting for ingestion…"}
          </Text>
        </View>
      ) : null}
    </SectionCard>
  );
});
