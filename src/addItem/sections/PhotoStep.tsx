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
  logRender({
    uploading: state.uploadingPhoto,
    aiStatus: state.aiStatus,
    hasPreview: !!derived.previewPhotoUri,
  });

  return (
    <SectionCard>
      <View
        onTouchStart={() => {
          if (__DEV__) {
            console.log("[TouchDebug] PhotoStep root touch");
          }
        }}
      >
      <SectionTitle
        title="Photo"
        right={<RequiredBadge />}
        subtitle="Start with a clean photo. AI autofill runs in the background while you keep going."
      />
      {state.uploadingPhoto ? <Text>Uploading photo...</Text> : null}
      {!state.isEdit && (state.autofillStatus || state.lastAutofillSummary || state.autofillError) ? (
        <View style={controller.styles.inlineInfo}>
          <Text style={{ fontSize: 14, fontWeight: "800" }}>
            {state.autofillStatus || "AI idle"}
          </Text>
          {state.aiStatus === "running" ? (
            <Text style={{ color: "#666" }}>
              {state.aiStage ? `${state.aiStage}…` : "Running…"}
            </Text>
          ) : null}
          {state.lastAutofillSummary ? (
            <Text style={{ color: "#666" }}>{state.lastAutofillSummary}</Text>
          ) : null}
          {state.autofillError ? (
            <Text style={{ color: "#b91c1c", fontWeight: "700" }}>{state.autofillError}</Text>
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
        refineValue={state.refineValue}
        isProcessing={state.refiningCutout}
        canRefine={derived.canRefineCutout}
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
        onReplace={() => void actions.pickPhoto("library")}
        onRefineOpen={() => {}}
        onAdjust={() => {}}
        onRotate={() => Alert.alert("Coming soon", "Rotate is coming soon.")}
      />
      {!state.isEdit && state.ingestionStatus === "done" && state.lastAutofillSummary ? (
        <View style={controller.styles.inlineInfo}>
          <Text style={{ fontSize: 14, fontWeight: "800" }}>{state.autofillStatus}</Text>
          <Text style={{ color: "#666" }}>{state.lastAutofillSummary}</Text>
          <View style={{ marginTop: 4, gap: 2 }}>
            <Text style={{ color: "#666", fontSize: 12, fontWeight: "700" }}>AI Debug</Text>
            <Text style={{ color: "#777", fontSize: 12 }}>
              runId: {state.aiDebugRunId || 0}
            </Text>
            <Text style={{ color: "#777", fontSize: 12 }}>
              source: {state.aiDebugInputSource || "unknown"}
            </Text>
            <Text style={{ color: "#777", fontSize: 12 }}>
              input: {state.aiDebugInputUri ? `${state.aiDebugInputUri.slice(0, 56)}…` : "n/a"}
            </Text>
            <Text style={{ color: "#777", fontSize: 12 }}>
              aspect_ratio: {state.aiDebugAspectRatio != null ? state.aiDebugAspectRatio.toFixed(2) : "n/a"}
            </Text>
            <Text style={{ color: "#777", fontSize: 12 }}>
              dominant_rgb: {state.aiDebugDominantRgb || "n/a"}
            </Text>
            {state.aiDebugCorrectedCategory ? (
              <Text style={{ color: "#777", fontSize: 12 }}>
                corrected_category: {state.aiDebugCorrectedCategory}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      </View>
    </SectionCard>
  );
});
