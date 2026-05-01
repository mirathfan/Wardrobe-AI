import React from "react";
import { Alert, Image, Pressable, ScrollView, Text, View } from "react-native";
import { PhotoEditorSection } from "../../components/PhotoEditorSection";
import { makeDevThrottleLogger } from "../devPerf";
import { SectionCard } from "../ui/SectionCard";
import { SectionTitle } from "../ui/SectionTitle";
import { RequiredBadge } from "../ui/RequiredBadge";
import { useAppTheme } from "@/src/hooks/useAppTheme";

export const PhotoStep = React.memo(function PhotoStep({ controller }: { controller: any }) {
  const { state, derived, actions } = controller;
  const { colors } = useAppTheme();
  const logRender = React.useMemo(() => makeDevThrottleLogger("PhotoStep"), []);
  const displayAutofillSummary = derived.previewPhotoUri ? state.lastAutofillSummary : "";
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
      {state.uploadingPhoto ? <Text style={{ color: colors.textSecondary }}>Uploading photo...</Text> : null}
      {!state.isEdit && (state.autofillStatus || displayAutofillSummary || state.autofillError) ? (
        <View style={controller.styles.inlineInfo}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }}>
            {state.autofillStatus || "AI idle"}
          </Text>
          {state.aiStatus === "running" ? (
            <Text style={{ color: colors.textSecondary }}>
              {state.aiStage ? `${state.aiStage}…` : "Running…"}
            </Text>
          ) : null}
          {displayAutofillSummary ? (
            <Text style={{ color: colors.textSecondary }}>{displayAutofillSummary}</Text>
          ) : null}
          {state.autofillError ? (
            <Text style={{ color: colors.danger, fontWeight: "800" }}>{state.autofillError}</Text>
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
          <Text style={{ color: colors.danger, fontWeight: "800" }}>{state.uploadError}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => void actions.retryPhotoUpload()}
              style={[controller.styles.btnSecondary, { borderColor: colors.danger }]}
            >
              <Text style={[controller.styles.btnSecondaryText, { color: colors.danger }]}>
                Retry upload
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {state.bgRemovalError ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.danger, fontWeight: "800" }}>{state.bgRemovalError}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => void actions.retryBackgroundRemoval()}
              style={[controller.styles.btnSecondary, { borderColor: colors.danger }]}
            >
              <Text style={[controller.styles.btnSecondaryText, { color: colors.danger }]}>
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
      {state.selectedPhotos?.length ? (
        <View style={{ gap: 10, marginTop: 10 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "900" }}>
              Item photos
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Mark a primary image and reorder before save
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              {state.selectedPhotos.map((entry: any, index: number) => {
                const previewUri =
                  entry.normalizedLocalUri ??
                  entry.cleanedLocalUri ??
                  entry.localUri ??
                  null;
                const isPrimary = state.primaryPhotoId === entry.id;
                return (
                  <View
                    key={entry.id}
                    style={{
                      width: 118,
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() => actions.setPrimaryPhoto(entry.id)}
                      style={{
                        borderRadius: 16,
                        borderWidth: 2,
                        borderColor: isPrimary ? colors.ctaCream : colors.border,
                        overflow: "hidden",
                        backgroundColor: colors.outfitBoardBackground,
                      }}
                    >
                      {previewUri ? (
                        <Image
                          source={{ uri: previewUri }}
                          style={{ width: "100%", height: 132 }}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={{ width: "100%", height: 132, backgroundColor: colors.outfitBoardBackground }} />
                      )}
                    </Pressable>
                    <View style={{ gap: 6 }}>
                      <Pressable
                        onPress={() => actions.setPrimaryPhoto(entry.id)}
                        style={[
                          controller.styles.btnSecondary,
                          {
                            paddingVertical: 8,
                            backgroundColor: isPrimary ? colors.ctaCream : colors.chipBackground,
                            borderColor: isPrimary ? colors.ctaCream : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            controller.styles.btnSecondaryText,
                            { color: isPrimary ? colors.ctaText : colors.text, fontSize: 12 },
                          ]}
                        >
                          {isPrimary ? "Primary" : "Make primary"}
                        </Text>
                      </Pressable>
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Pressable
                          onPress={() => actions.movePhotoLeft(entry.id)}
                          disabled={index === 0}
                          style={[controller.styles.btnSecondary, { flex: 1, opacity: index === 0 ? 0.4 : 1 }]}
                        >
                          <Text style={[controller.styles.btnSecondaryText, { fontSize: 12 }]}>Left</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => actions.movePhotoRight(entry.id)}
                          disabled={index === state.selectedPhotos.length - 1}
                          style={[
                            controller.styles.btnSecondary,
                            {
                              flex: 1,
                              opacity: index === state.selectedPhotos.length - 1 ? 0.4 : 1,
                            },
                          ]}
                        >
                          <Text style={[controller.styles.btnSecondaryText, { fontSize: 12 }]}>Right</Text>
                        </Pressable>
                      </View>
                      <Pressable
                        onPress={() => actions.removeSelectedPhoto(entry.id)}
                        style={[controller.styles.btnSecondary, { borderColor: colors.danger }]}
                      >
                        <Text style={[controller.styles.btnSecondaryText, { color: colors.danger, fontSize: 12 }]}>
                          Remove
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => void actions.pickPhoto("library")}
              style={[controller.styles.btnSecondary, { flex: 1 }]}
            >
              <Text style={controller.styles.btnSecondaryText}>Add from library</Text>
            </Pressable>
            <Pressable
              onPress={() => void actions.pickPhoto("camera")}
              style={[controller.styles.btnSecondary, { flex: 1 }]}
            >
              <Text style={controller.styles.btnSecondaryText}>Add from camera</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {!state.isEdit && state.ingestionStatus === "done" && state.lastAutofillSummary ? (
        <View style={controller.styles.inlineInfo}>
          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
            Review AI details in the next step. You can edit anything manually.
          </Text>
        </View>
      ) : null}
      </View>
    </SectionCard>
  );
});
