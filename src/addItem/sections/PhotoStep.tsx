import React from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { PhotoEditorSection } from "../../components/PhotoEditorSection";
import { makeDevThrottleLogger } from "../devPerf";
import { SectionCard } from "../ui/SectionCard";
import { SectionTitle } from "../ui/SectionTitle";
import { RequiredBadge } from "../ui/RequiredBadge";

export const PhotoStep = React.memo(function PhotoStep({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  const logRender = React.useMemo(() => makeDevThrottleLogger("PhotoStep"), []);
  const displayAutofillSummary = derived.previewPhotoUri ? state.lastAutofillSummary : "";
  const rawAiCategory = state.aiPrediction?.category || "none";
  const rawAiColors =
    Array.isArray(state.aiPrediction?.colors) && state.aiPrediction.colors.length
      ? state.aiPrediction.colors.join(" / ")
      : "none";
  const appliedCategory = state.finalPrediction?.category || "none";
  const appliedColors =
    Array.isArray(state.finalPrediction?.colors) && state.finalPrediction.colors.length
      ? state.finalPrediction.colors.join(" / ")
      : "none";
  logRender({
    uploading: state.uploadingPhoto,
    aiStatus: state.aiStatus,
    hasPreview: !!derived.previewPhotoUri,
  });

  return (
    <SectionCard>
      <View>
      <SectionTitle
        title="Photo"
        right={<RequiredBadge />}
        subtitle="Start with a clean photo. AI autofill runs in the background while you keep going."
      />
      {state.uploadingPhoto ? <Text>Uploading photo...</Text> : null}
      {!state.isEdit && (state.autofillStatus || displayAutofillSummary || state.autofillError) ? (
        <View style={controller.styles.inlineInfo}>
          <Text style={{ fontSize: 14, fontWeight: "800" }}>
            {state.autofillStatus || "AI idle"}
          </Text>
          {state.aiStatus === "running" ? (
            <Text style={{ color: "#666" }}>
              {state.aiStage ? `${state.aiStage}…` : "Running…"}
            </Text>
          ) : null}
          {displayAutofillSummary ? (
            <Text style={{ color: "#666" }}>{displayAutofillSummary}</Text>
          ) : null}
          {state.autofillError ? (
            <Text style={{ color: "#b91c1c", fontWeight: "700" }}>{state.autofillError}</Text>
          ) : null}
          <Text style={{ color: "#666", fontSize: 12 }}>
            Raw AI: {rawAiCategory} | {rawAiColors}
          </Text>
          <Text style={{ color: "#666", fontSize: 12 }}>
            Applied: {appliedCategory} | {appliedColors}
          </Text>
          {state.aiDebugRawPayload ? (
            <View
              style={{
                marginTop: 6,
                padding: 10,
                borderRadius: 10,
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <Text style={{ color: "#9ca3af", fontSize: 11, fontWeight: "700", marginBottom: 4 }}>
                Full AI payload
              </Text>
              <Text
                selectable
                style={{ color: "#9ca3af", fontSize: 11, lineHeight: 16, fontFamily: "Courier" }}
              >
                {state.aiDebugRawPayload}
              </Text>
            </View>
          ) : null}
          {state.aiStatus === "error" ? (
            <Pressable
              onPress={actions.retryAutofill}
              style={[controller.styles.btnSecondary, { alignSelf: "flex-start" }]}
            >
              <Text style={controller.styles.btnSecondaryText}>Retry AI autofill</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {state.uploadError ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: "#b91c1c", fontWeight: "700" }}>{state.uploadError}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => void actions.retryPhotoUpload()}
              style={[controller.styles.btnSecondary, { borderColor: "#b91c1c" }]}
            >
              <Text style={[controller.styles.btnSecondaryText, { color: "#b91c1c" }]}>
                Retry upload
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {state.bgRemovalError ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: "#b91c1c", fontWeight: "700" }}>{state.bgRemovalError}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => void actions.retryBackgroundRemoval()}
              style={[controller.styles.btnSecondary, { borderColor: "#b91c1c" }]}
            >
              <Text style={[controller.styles.btnSecondaryText, { color: "#b91c1c" }]}>
                Retry cutout
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <PhotoEditorSection
        previewUri={derived.previewPhotoUri}
        normalizedPreviewUri={derived.normalizedPreviewUri}
        cleanedPreviewUri={derived.cleanedPreviewUri}
        fallbackPreviewUri={derived.fallbackPreviewUri}
        hasCutoutPreview={derived.hasCutoutPreview}
        maskDebugUri={derived.maskDebugUri}
        refineValue={state.refineValue}
        edgePolish={state.edgePolish}
        debugThreshold={state.debugThreshold}
        debugCleanupRadius={state.debugCleanupRadius}
        debugFeather={state.debugFeather}
        debugEdgeTighten={state.debugEdgeTighten}
        isProcessing={state.refiningCutout}
        canRefine={derived.canRefineCutout}
        isAiRunning={state.aiStatus === "running"}
        statusText={
          !state.isEdit
            ? state.aiStatus === "running"
              ? state.aiStage
                ? `Analyzing photo: ${state.aiStage}…`
                : state.autofillStatus || "Analyzing photo…"
              : displayAutofillSummary || state.autofillStatus || null
            : null
        }
        showPendingNote={
          !!state.pendingPhotoUri &&
          !state.uploadingPhoto &&
          !state.uploadError &&
          !state.draftItemId &&
          !state.isEdit
        }
        onPickLibrary={() => void actions.pickPhoto("library")}
        onUseCamera={() => void actions.pickPhoto("camera")}
        onRemove={() => {
          void actions.resetCreateFlow("remove-photo", { deleteActiveDraft: true });
        }}
        onRefineChange={actions.handleRefineValueChange}
        onRefineComplete={actions.handleRefineValueComplete}
        onResetRefine={actions.handleRefineReset}
        onEdgePolishChange={actions.handleEdgePolishChange}
        onDebugThresholdChange={actions.handleDebugRefineThresholdChange}
        onDebugCleanupRadiusChange={actions.handleDebugRefineCleanupRadiusChange}
        onDebugFeatherChange={actions.handleDebugRefineFeatherChange}
        onDebugEdgeTightenChange={actions.handleDebugRefineEdgeTightenChange}
        onReplace={() => void actions.pickPhoto("library")}
        onRefineOpen={() => {}}
        onAdjust={() => {}}
        onRotate={() => Alert.alert("Coming soon", "Rotate is coming soon.")}
      />
      {!state.isEdit && state.ingestionStatus === "done" && state.lastAutofillSummary ? (
        <View style={controller.styles.inlineInfo}>
          <Text style={{ fontSize: 13, color: "#666" }}>
            Review AI details in the next step. You can edit anything manually.
          </Text>
        </View>
      ) : null}
      </View>
    </SectionCard>
  );
});
