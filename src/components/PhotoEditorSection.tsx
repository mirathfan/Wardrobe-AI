import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeScreen } from "./SafeScreen";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { Colors } from "@/constants/theme";

type PhotoEditorSectionProps = {
  previewUri: string | null;
  normalizedPreviewUri?: string | null;
  cleanedPreviewUri?: string | null;
  fallbackPreviewUri?: string | null;
  hasCutoutPreview?: boolean;
  maskDebugUri?: string | null;
  isProcessing: boolean;
  canRefine: boolean;
  isAiRunning?: boolean;
  statusText?: string | null;
  showPendingNote: boolean;
  onPickLibrary: () => void;
  onUseCamera: () => void;
  onRemove: () => void;
  onUseOriginal?: () => void;
  onRerunCutout?: () => void;
  onReplace?: () => void;
  onRotate?: () => void;
  onAdjust?: () => void;
  onRefineOpen?: () => void;
  frameless?: boolean;
};

type PreviewMode = "original" | "cutout" | "mask";

const editorColors = Colors.dark;

function PreviewCanvas(props: {
  uri: string;
  large?: boolean;
  compact?: boolean;
  checkerboard?: boolean;
}) {
  const { uri, large = false, compact = false, checkerboard = false } = props;
  const previewPadding = compact ? 18 : large ? 28 : 24;
  const previewBackgroundColor = editorColors.boardLight;

  return (
    <View
      style={{
        width: "100%",
        aspectRatio: compact ? 1.14 : large ? 4 / 5 : 1,
        borderRadius: large ? 20 : 16,
        borderWidth: 1,
        borderColor: editorColors.borderWarm,
        backgroundColor: previewBackgroundColor,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checkerboard ? <CheckerboardBackground /> : null}
      <View
        style={{
          width: "100%",
          height: "100%",
          padding: previewPadding,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Image
          source={{ uri }}
          style={{
            width: "100%",
            height: "100%",
            shadowColor: editorColors.ctaCream,
            shadowOpacity: checkerboard ? 0 : 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 5 },
          }}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

function CheckerboardBackground() {
  const cells = Array.from({ length: 64 }, (_, index) => index);
  return (
    <View
      pointerEvents="none"
      style={{
        ...StyleSheet.absoluteFillObject,
        flexDirection: "row",
        flexWrap: "wrap",
      }}
    >
      {cells.map((cell) => {
        const row = Math.floor(cell / 8);
        const col = cell % 8;
        const dark = (row + col) % 2 === 0;
        return (
          <View
            key={cell}
            style={{
              width: "12.5%",
              height: "12.5%",
              backgroundColor: dark ? "rgba(25,0,25,0.06)" : editorColors.boardLight,
            }}
          />
        );
      })}
    </View>
  );
}

function PreviewEmptyState(props: {
  title: string;
  message: string;
  colors: ReturnType<typeof useAppTheme>["colors"];
  onUseOriginal?: () => void;
  onTryAgain?: () => void;
  onChangePhoto?: () => void;
}) {
  const { title, message, colors, onUseOriginal, onTryAgain, onChangePhoto } = props;
  return (
    <View style={{ padding: 22, alignItems: "center", gap: 12 }}>
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(223,182,178,0.12)",
          borderWidth: 1,
          borderColor: "rgba(223,182,178,0.18)",
        }}
      >
        <Ionicons name="image-outline" size={22} color={colors.ctaCream} />
      </View>
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900", textAlign: "center" }}>
        {title}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18, textAlign: "center" }}>
        {message}
      </Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        {onUseOriginal ? (
          <Pressable onPress={onUseOriginal} style={editorButton}>
            <Text style={editorButtonText}>Use original</Text>
          </Pressable>
        ) : null}
        {onTryAgain ? (
          <Pressable onPress={onTryAgain} style={editorButton}>
            <Text style={editorButtonText}>Try again</Text>
          </Pressable>
        ) : null}
        {onChangePhoto ? (
          <Pressable onPress={onChangePhoto} style={editorButton}>
            <Text style={editorButtonText}>Change photo</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function PhotoEditorSection(props: PhotoEditorSectionProps) {
  const {
    previewUri,
    normalizedPreviewUri = null,
    cleanedPreviewUri = null,
    fallbackPreviewUri = null,
    hasCutoutPreview = false,
    maskDebugUri = null,
    isProcessing,
    canRefine,
    isAiRunning = false,
    statusText = null,
    showPendingNote,
    onPickLibrary,
    onUseCamera,
    onRemove,
    onUseOriginal,
    onRerunCutout,
    onReplace,
    onRotate,
    onAdjust,
    onRefineOpen,
    frameless = false,
  } = props;
  const { colors } = useAppTheme();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [activeModalPreview, setActiveModalPreview] = useState<PreviewMode>("cutout");
  const [failedPreviewUris, setFailedPreviewUris] = useState<string[]>([]);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const displayedPreviewUri = normalizedPreviewUri ?? cleanedPreviewUri ?? fallbackPreviewUri ?? previewUri;
  const originalPreviewUri = fallbackPreviewUri ?? (!hasCutoutPreview ? previewUri : null);
  const cutoutPreviewUri =
    normalizedPreviewUri ??
    cleanedPreviewUri ??
    (hasCutoutPreview ? previewUri : null);
  const hasFailedPreviewUri = (uri: string | null | undefined) =>
    !!uri && failedPreviewUris.includes(uri);
  const canShowOriginalPreview =
    !!originalPreviewUri && !hasFailedPreviewUri(originalPreviewUri);
  const canShowCutoutPreview =
    !!cutoutPreviewUri && !hasFailedPreviewUri(cutoutPreviewUri);
  const canShowMaskPreview =
    !!maskDebugUri && !hasFailedPreviewUri(maskDebugUri);
  const modalPreviewState = (() => {
    if (activeModalPreview === "mask") {
      if (canShowMaskPreview) {
        return {
          uri: maskDebugUri,
          label: "Mask preview",
          checkerboard: false,
          isFallback: false,
          emptyTitle: "",
          emptyMessage: "",
        };
      }
      return {
        uri: null,
        label: "Mask preview",
        checkerboard: false,
        isFallback: false,
        emptyTitle: "Mask preview unavailable",
        emptyMessage: "The cutout mask is only available after background removal finishes.",
      };
    }
    if (activeModalPreview === "original") {
      if (canShowOriginalPreview) {
        return {
          uri: originalPreviewUri,
          label: "Original photo",
          checkerboard: false,
          isFallback: false,
          emptyTitle: "",
          emptyMessage: "",
        };
      }
      return {
        uri: null,
        label: "Original photo",
        checkerboard: false,
        isFallback: false,
        emptyTitle: "Original photo unavailable",
        emptyMessage: "This photo could not be loaded. Try changing the photo.",
      };
    }
    if (canShowCutoutPreview) {
      return {
        uri: cutoutPreviewUri,
        label: "Cutout preview",
        checkerboard: true,
        isFallback: false,
        emptyTitle: "",
        emptyMessage: "",
      };
    }
    if (canShowOriginalPreview) {
      return {
        uri: originalPreviewUri,
        label: "Original photo",
        checkerboard: false,
        isFallback: true,
        emptyTitle: "",
        emptyMessage: "",
      };
    }
    return {
      uri: null,
      label: "Cutout preview",
      checkerboard: true,
      isFallback: false,
      emptyTitle: "Cutout preview unavailable",
      emptyMessage: "Use the original photo, try background removal again, or change the photo.",
    };
  })();

  useEffect(() => {
    setFailedPreviewUris([]);
    setIsPreviewLoading(false);
  }, [
    cleanedPreviewUri,
    fallbackPreviewUri,
    maskDebugUri,
    normalizedPreviewUri,
    previewUri,
  ]);

  useEffect(() => {
    if (!__DEV__ || !isModalVisible) return;
    console.log("[RefineCutout] preview state", {
      originalUri: Boolean(originalPreviewUri),
      cutoutUri: Boolean(cutoutPreviewUri),
      maskUri: Boolean(maskDebugUri),
      mode: activeModalPreview,
      resolvedUri: Boolean(modalPreviewState.uri),
      isFallback: modalPreviewState.isFallback,
    });
  }, [
    activeModalPreview,
    cutoutPreviewUri,
    isModalVisible,
    maskDebugUri,
    modalPreviewState.isFallback,
    modalPreviewState.uri,
    originalPreviewUri,
  ]);

  useEffect(() => {
    if (!__DEV__ || !displayedPreviewUri) {
      return;
    }
    console.log("[AddItemPreview] render:selected-uri", {
      normalizedPreviewUri,
      cleanedPreviewUri,
      fallbackPreviewUri,
      previewUri,
      displayedPreviewUri,
    });
  }, [
    cleanedPreviewUri,
    displayedPreviewUri,
    fallbackPreviewUri,
    normalizedPreviewUri,
    previewUri,
  ]);

  const themedEditorButton = {
    ...editorButton,
    borderColor: colors.border,
    backgroundColor: colors.chipBackground,
  };
  const themedPrimaryEditorButton = {
    ...editorButton,
    borderColor: colors.ctaCream,
    backgroundColor: colors.ctaCream,
  };
  const themedEditorButtonText = {
    ...editorButtonText,
    color: colors.text,
  };
  const themedDestructiveEditorButton = {
    ...editorButton,
    borderColor: "rgba(255,77,79,0.28)",
    backgroundColor: "rgba(255,77,79,0.08)",
  };
  const themedDestructiveEditorButtonText = {
    ...editorButtonText,
    color: colors.danger,
  };
  const themedPrimaryEditorButtonText = {
    ...editorButtonText,
    color: colors.ctaText,
  };
  const emptyPreviewHeight = Math.min(220, Math.max(176, screenHeight * 0.22));

  function openRefineModal() {
    onRefineOpen?.();
    setActiveModalPreview(cutoutPreviewUri ? "cutout" : "original");
    setIsModalVisible(true);
  }

  function closeRefineModal() {
    setActiveModalPreview("cutout");
    setIsModalVisible(false);
  }

  function markPreviewLoadFailed(uri: string | null) {
    if (!uri) return;
    setFailedPreviewUris((prev) => (prev.includes(uri) ? prev : [...prev, uri]));
    setIsPreviewLoading(false);
  }

  function handleUseOriginal() {
    onUseOriginal?.();
    setActiveModalPreview("original");
  }

  function handleTryCutoutAgain() {
    setActiveModalPreview("cutout");
    onRerunCutout?.();
  }

  function handleApply() {
    if (activeModalPreview === "original" || !canShowCutoutPreview) {
      onUseOriginal?.();
      setActiveModalPreview("original");
    }
    closeRefineModal();
  }

  return (
    <>
      <View
        style={{
          gap: 12,
          padding: frameless ? 0 : 12,
          borderRadius: frameless ? 0 : 22,
          borderWidth: frameless ? 0 : 1,
          borderColor: "rgba(251,228,216,0.12)",
          backgroundColor: frameless ? "transparent" : "rgba(18,0,20,0.62)",
        }}
      >
        {displayedPreviewUri ? (
          <Pressable
            onPress={openRefineModal}
          >
            <PreviewCanvas uri={displayedPreviewUri} compact />
          </Pressable>
        ) : (
          <View
            style={{
              width: "100%",
              height: emptyPreviewHeight,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "rgba(251,228,216,0.14)",
              backgroundColor: "rgba(43,18,76,0.34)",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 22,
              gap: 10,
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(223,182,178,0.12)",
                borderWidth: 1,
                borderColor: "rgba(223,182,178,0.18)",
              }}
            >
              <Ionicons name="cloud-upload-outline" size={22} color={colors.ctaCream} />
            </View>
            <Text style={{ color: colors.text, fontWeight: "900", textAlign: "center", fontSize: 16 }}>
              Add an item photo
            </Text>
            <Text style={{ color: colors.textSecondary, fontWeight: "600", textAlign: "center", fontSize: 13 }}>
              A clean front-facing image works best.
            </Text>
          </View>
        )}

        {displayedPreviewUri ? (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {canRefine ? (
              <Pressable
                onPress={openRefineModal}
                style={[themedPrimaryEditorButton, { minHeight: 42, flexGrow: 1 }]}
              >
                <Text style={themedPrimaryEditorButtonText}>Refine cutout</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onReplace ?? onPickLibrary}
              style={[themedEditorButton, { minHeight: 42, flexGrow: 1 }]}
            >
              <Text style={themedEditorButtonText}>Change</Text>
            </Pressable>
            <Pressable onPress={onRemove} style={[themedDestructiveEditorButton, { minHeight: 42 }]}>
              <Text style={themedDestructiveEditorButtonText}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onPickLibrary} style={[themedPrimaryEditorButton, { flex: 1 }]}>
              <Text style={themedPrimaryEditorButtonText}>Choose Photo</Text>
            </Pressable>
            <Pressable onPress={onUseCamera} style={[themedEditorButton, { flex: 1 }]}>
              <Text style={themedEditorButtonText}>Camera</Text>
            </Pressable>
          </View>
        )}

        {statusText ? (
          <Text style={{ color: isAiRunning ? colors.lightPurple : colors.textSecondary, fontSize: 13 }}>
            {statusText}
          </Text>
        ) : null}

        {showPendingNote ? (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
            New photo selected. It will upload to Firebase Storage when you save.
          </Text>
        ) : null}
      </View>

      <Modal
        visible={isModalVisible && !!displayedPreviewUri}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeRefineModal}
      >
        <SafeScreen
          backgroundColor={colors.background}
          includeBottomInset={false}
        >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View
            style={{
              height: 72,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Pressable
              onPress={closeRefineModal}
              hitSlop={10}
              style={{ minHeight: 40, justifyContent: "center" }}
            >
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "800" }}>Cancel</Text>
            </Pressable>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Refine Cutout</Text>
            <Pressable
              onPress={handleApply}
              disabled={isProcessing}
              hitSlop={10}
              style={{ minHeight: 40, justifyContent: "center", opacity: isProcessing ? 0.45 : 1 }}
            >
              <Text style={{ color: colors.ctaCream, fontSize: 15, fontWeight: "800" }}>Apply</Text>
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 16,
              paddingVertical: 20,
            }}
            minimumZoomScale={1}
            maximumZoomScale={4}
            bouncesZoom={false}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                width: Math.max(280, screenWidth - 32),
                height: Math.max(360, screenHeight * 0.55),
                borderRadius: 24,
                borderWidth: 1,
                borderColor: colors.borderWarm,
                overflow: "hidden",
                backgroundColor: colors.boardLight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {modalPreviewState.checkerboard ? <CheckerboardBackground /> : null}
              {modalPreviewState.uri ? (
                <>
                  <Image
                    key={`${activeModalPreview}:${modalPreviewState.uri}`}
                    source={{ uri: modalPreviewState.uri }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="contain"
                    onLoadStart={() => setIsPreviewLoading(true)}
                    onLoad={() => setIsPreviewLoading(false)}
                    onError={() => markPreviewLoadFailed(modalPreviewState.uri)}
                  />
                  {isPreviewLoading || isProcessing ? (
                    <View
                      pointerEvents="none"
                      style={{
                        ...StyleSheet.absoluteFillObject,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "rgba(18,0,20,0.18)",
                      }}
                    >
                      <ActivityIndicator color={colors.ctaCream} />
                      {isProcessing ? (
                        <Text style={{ color: colors.text, marginTop: 10, fontSize: 12, fontWeight: "800" }}>
                          Updating preview...
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                  {modalPreviewState.isFallback ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: 12,
                        right: 12,
                        bottom: 12,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 14,
                        backgroundColor: "rgba(18,0,20,0.72)",
                        borderWidth: 1,
                        borderColor: "rgba(251,228,216,0.12)",
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: "800", textAlign: "center" }}>
                        Cutout preview unavailable. Showing original.
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <PreviewEmptyState
                  title={modalPreviewState.emptyTitle}
                  message={modalPreviewState.emptyMessage}
                  colors={colors}
                  onUseOriginal={onUseOriginal ? handleUseOriginal : undefined}
                  onTryAgain={canRefine && onRerunCutout ? handleTryCutoutAgain : undefined}
                  onChangePhoto={onReplace ?? onPickLibrary}
                />
              )}
            </View>
          </ScrollView>

          <View
            style={{
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 24,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderTopWidth: 1,
              borderColor: colors.border,
              backgroundColor: "rgba(18,0,20,0.96)",
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Pressable
                onPress={() => setActiveModalPreview("original")}
                disabled={!originalPreviewUri}
                style={[
                  themedEditorButton,
                  activeModalPreview === "original" ? activePreviewButton : null,
                  !originalPreviewUri ? { opacity: 0.45 } : null,
                ]}
              >
                <Text style={themedEditorButtonText}>Original</Text>
              </Pressable>
              <Pressable
                onPress={() => setActiveModalPreview("cutout")}
                disabled={!cutoutPreviewUri && !originalPreviewUri}
                style={[
                  themedEditorButton,
                  activeModalPreview === "cutout" ? activePreviewButton : null,
                  !cutoutPreviewUri ? { opacity: 0.7 } : null,
                ]}
              >
                <Text style={themedEditorButtonText}>Cutout</Text>
              </Pressable>
              {maskDebugUri ? (
                <Pressable
                  onPress={() => setActiveModalPreview("mask")}
                  style={[
                    themedEditorButton,
                    activeModalPreview === "mask" ? activePreviewButton : null,
                  ]}
                >
                  <Text style={themedEditorButtonText}>Mask</Text>
                </Pressable>
              ) : null}
              {canRefine && onRerunCutout ? (
                <Pressable
                  onPress={handleTryCutoutAgain}
                  style={[themedEditorButton, isProcessing ? { opacity: 0.45 } : null]}
                  disabled={isProcessing}
                >
                  <Text style={themedEditorButtonText}>Try cutout again</Text>
                </Pressable>
              ) : null}
              {onUseOriginal ? (
                <Pressable onPress={handleUseOriginal} style={themedEditorButton}>
                  <Text style={themedEditorButtonText}>Use original</Text>
                </Pressable>
              ) : null}
              {onAdjust ? (
                <Pressable onPress={onAdjust} style={themedEditorButton}>
                  <Text style={themedEditorButtonText}>Adjust</Text>
                </Pressable>
              ) : null}
              {onRotate ? (
                <Pressable onPress={onRotate} style={themedEditorButton}>
                  <Text style={themedEditorButtonText}>Rotate</Text>
                </Pressable>
              ) : null}
            </View>

            <View
              style={{
                gap: 6,
                padding: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: "rgba(18,0,20,0.76)",
              }}
            >
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>
                Review the cutout before saving.
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                {cutoutPreviewUri
                  ? "Use the cutout if it looks right, or use the original photo if the item is clipped."
                  : "Cutout preview is unavailable. Use the original photo or try again."}
              </Text>
              {canRefine && onRerunCutout ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                  Generate a new cutout from the original photo.
                </Text>
              ) : null}
            </View>
          </View>
        </View>
        </SafeScreen>
      </Modal>
    </>
  );
}

const editorButton = {
  minHeight: 44,
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: editorColors.border,
  backgroundColor: editorColors.chipBackground,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const activePreviewButton = {
  borderColor: editorColors.purpleBorder,
  backgroundColor: editorColors.purpleSurface,
};

const editorButtonText = {
  color: editorColors.text,
  fontWeight: "700" as const,
};
