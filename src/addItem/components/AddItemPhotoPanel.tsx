import React from "react";
import { Pressable, Text, View } from "react-native";

import { PhotoEditorSection } from "../../components/PhotoEditorSection";
import { SectionCard } from "../ui/SectionCard";
import { AddItemPhotoCarousel } from "./AddItemPhotoCarousel";
import { OutfitExtractionEntry } from "./OutfitExtractionEntry";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { earlyAccessFeatureLabel } from "@/src/lib/earlyAccess";

export const AddItemPhotoPanel = React.memo(function AddItemPhotoPanel({
  controller,
}: {
  controller: any;
}) {
  const { state, derived, actions } = controller;
  const { colors } = useAppTheme();
  const primaryPhoto =
    state.selectedPhotos?.find((entry: any) => entry.id === state.primaryPhotoId) ??
    state.selectedPhotos?.[0] ??
    null;
  const productPolishStatusText =
    state.productPolishStatus === "analyzing"
      ? "Analyzing photo..."
      : state.productPolishStatus === "polishing"
        ? "Improving product photo..."
        : state.productPolishStatus === "cutout"
          ? "Creating clean cutout..."
          : null;

  const statusTone =
    derived.aiStatusPill.tone === "error"
      ? colors.textSecondary
      : derived.aiStatusPill.tone === "warning"
        ? colors.warning
        : derived.aiStatusPill.tone === "running"
          ? colors.lightPurple
          : derived.aiStatusPill.tone === "ready"
            ? colors.success
            : colors.textSecondary;

  return (
    <View style={{ gap: 14 }}>
      <SectionCard>
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <View style={{ gap: 2, flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: "900" }}>
                Photo
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
                {state.isEdit && derived.aiStatusPill.tone === "idle"
                  ? "Change or refine this item photo."
                  : derived.aiStatusPill.label}
              </Text>
            </View>
            <View
              style={{
                minHeight: 30,
                paddingHorizontal: 9,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(251,228,216,0.10)",
                backgroundColor: "rgba(43,18,76,0.34)",
              }}
            >
              <Text style={{ color: statusTone, fontSize: 11.5, lineHeight: 15, fontWeight: "900" }} numberOfLines={1}>
                AI
              </Text>
            </View>
          </View>

          {state.uploadingPhoto ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Uploading photo...</Text>
          ) : null}

          {state.uploadError ? (
            <InlineIssue
              message={state.uploadError}
              actionLabel="Retry upload"
              onPress={() => void actions.retryPhotoUpload()}
            />
          ) : null}

          {state.bgRemovalError ? (
            <InlineIssue
              message={state.bgRemovalError}
              actionLabel={
                state.bgRemovalError === "Download this image to refine the cutout."
                  ? "Download & retry"
                  : "Retry cutout"
              }
              onPress={() => void actions.retryBackgroundRemoval()}
            />
          ) : null}

          {!state.isEdit ? <OutfitExtractionEntry uid={state.uid ?? null} /> : null}

          <PhotoEditorSection
            previewUri={derived.previewPhotoUri}
            normalizedPreviewUri={derived.normalizedPreviewUri}
            cleanedPreviewUri={derived.cleanedPreviewUri}
            fallbackPreviewUri={derived.fallbackPreviewUri}
            hasCutoutPreview={derived.hasCutoutPreview}
            maskDebugUri={derived.maskDebugUri}
            isProcessing={state.refiningCutout || state.productPolishStatus !== "idle"}
            canRefine={derived.canRefineCutout}
            isAiRunning={state.aiStatus === "running" || state.productPolishStatus !== "idle"}
            statusText={productPolishStatusText}
            productPolishOriginalUri={
              primaryPhoto?.normalizedOriginalUri ?? state.originalPickedPhotoUri ?? null
            }
            productPolishPolishedUri={
              primaryPhoto?.refinedLocalUri ??
              state.pendingRefinedPhotoUri ??
              primaryPhoto?.refinedImageUrl ??
              state.pendingRefinedImageUrl ??
              null
            }
            productPolishActiveVariant={
              state.selectedStudioSource ??
              primaryPhoto?.activeImageVariant ??
              state.pendingActiveImageVariant ??
              "original"
            }
            productPolishWarning={state.studioSourceWarning}
            productPolishError={state.productPolishError}
            productPolishActionState={
              state.isEdit || !state.aiPolishEarlyAccess || state.aiPolishEarlyAccess.loading
                ? "hidden"
                : state.aiPolishEarlyAccess.allowed
                  ? "available"
                  : "unavailable"
            }
            productPolishActionHelper={
              state.aiPolishEarlyAccess
                ? earlyAccessFeatureLabel("aiPolish", state.aiPolishEarlyAccess.remaining)
                : null
            }
            productPolishActionDisabled={
              state.productPolishStatus !== "idle" || state.refiningCutout
            }
            showPendingNote={
              !!state.pendingPhotoUri &&
              !state.uploadingPhoto &&
              state.productPolishStatus === "idle" &&
              !state.uploadError &&
              !state.draftItemId &&
              !state.isEdit
            }
            onPickLibrary={() => void actions.pickPhoto("library")}
            onUseCamera={() => void actions.pickPhoto("camera")}
            onRemove={() => {
              if (state.isEdit) {
                actions.resetPhotoState?.();
                actions.resetExtractionState?.();
                return;
              }
              void actions.resetCreateFlow("remove-photo", { deleteActiveDraft: true });
            }}
            onUseOriginal={actions.useOriginalPhoto}
            onUseOriginalProduct={actions.useOriginalProductPhoto}
            onUsePolishedProduct={actions.usePolishedProductPhoto}
            onPolishProduct={() => void actions.polishProductPhoto()}
            onRerunCutout={() => void actions.retryBackgroundRemoval()}
            onReplace={() => void actions.pickPhoto("library")}
            onRefineOpen={() => {}}
            frameless
          />
        </View>
      </SectionCard>
      {state.selectedPhotos?.length ? (
        <SectionCard>
          <AddItemPhotoCarousel controller={controller} />
        </SectionCard>
      ) : null}
    </View>
  );
});

const InlineIssue = React.memo(function InlineIssue({
  message,
  actionLabel,
  onPress,
}: {
  message: string;
  actionLabel: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        gap: 8,
        padding: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,77,79,0.24)",
        backgroundColor: "rgba(255,77,79,0.08)",
      }}
    >
      <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "800" }}>{message}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 40,
          alignSelf: "flex-start",
          justifyContent: "center",
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,77,79,0.26)",
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "900" }}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
});
