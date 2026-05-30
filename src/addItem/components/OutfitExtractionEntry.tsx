import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  extractOutfitItems,
  outfitExtractionErrorMessage,
  polishExtractedAccessory,
  reconstructOutfitLayout,
  saveSelectedOutfitExtractionItems,
  toOutfitExtractionDraft,
  toOutfitLayoutDraft,
  uploadOutfitPhotoForExtraction,
} from "@/src/lib/outfitExtraction";
import { getFriendlyErrorMessage } from "@/src/lib/errors";
import { runHaptic } from "@/src/lib/haptics";
import { Toast } from "@/src/lib/toast";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { getImageFraming, imageFramingPadding } from "@/src/lib/imageFraming";
import type {
  ExtractedGarmentPreview,
  OutfitExtractionCategory,
  OutfitExtractionDraft,
} from "@/src/types/OutfitExtraction";

type OutfitExtractionStatus =
  | "idle"
  | "confirming"
  | "uploading"
  | "understanding"
  | "reconstructing"
  | "detecting"
  | "separating"
  | "cleaning"
  | "review"
  | "saving"
  | "error";

type PendingOutfitPhoto = {
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
};

type OutfitPhotoSource = "library" | "camera";

const CATEGORY_OPTIONS: { value: OutfitExtractionCategory; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "footwear", label: "Shoes" },
  { value: "outerwear", label: "Outerwear" },
  { value: "accessory", label: "Accessory" },
  { value: "one_piece", label: "One piece" },
];

const PROCESSING_STAGES: OutfitExtractionStatus[] = ["understanding", "reconstructing", "separating"];
const DEBUG_OUTFIT_EXTRACTION =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG_OUTFIT_EXTRACTION === "true";

function makeTraceId() {
  return `outfit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function logOutfitExtraction(step: string, data: Record<string, unknown> = {}) {
  if (!DEBUG_OUTFIT_EXTRACTION) return;
  console.info(`[AURA OutfitExtraction] step=${step} data=${JSON.stringify(data)}`);
}

function stageLabel(status: OutfitExtractionStatus) {
  if (status === "confirming") return "Use this outfit photo?";
  if (status === "uploading") return "Preparing outfit photo...";
  if (status === "understanding") return "Understanding outfit...";
  if (status === "reconstructing") return "Creating clean outfit layout...";
  if (status === "detecting") return "Detecting garments...";
  if (status === "separating") return "Separating pieces...";
  if (status === "cleaning") return "Cleaning product photos...";
  if (status === "saving") return "Adding selected items...";
  if (status === "error") return "Needs another photo";
  return "Ready";
}

function visibleItems(items: ExtractedGarmentPreview[]) {
  return items.filter((item) => !item.removed);
}

function selectedCount(items: ExtractedGarmentPreview[]) {
  return visibleItems(items).filter((item) => item.selected).length;
}

function allLayoutItemsFellBack(draft: OutfitExtractionDraft, items: ExtractedGarmentPreview[]) {
  const visible = visibleItems(items);
  return (
    __DEV__ &&
    !!draft.reconstructedLayoutUrl &&
    visible.length > 0 &&
    visible.every((item) => item.extractionMethod === "original_crop_fallback")
  );
}

function confidenceLabel(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function displayImageFor(item: ExtractedGarmentPreview) {
  return item.normalizedImageUrl || item.cleanedImageUrl || item.layoutCropUrl || item.refinedImageUrl || item.originalCropUrl || item.cropImageUrl;
}

function warningTagsFor(item: ExtractedGarmentPreview) {
  const tags: string[] = [];
  const fallback =
    item.extractionMethod === "original_crop_fallback" ||
    (!(item.cleanedImageUrl || item.refinedImageUrl) && item.imageSource !== "outfit_layout_reconstruction") ||
    item.extractionQuality?.rawCropFallback === true;
  const partiallyVisible =
    item.extractionQuality?.partiallyVisible === true ||
    (item.imageQuality?.visibilityCompleteness ?? 1) < 0.72 ||
    item.extractionWarnings?.some((warning) => /partial|occluded|hidden|cropped|visible/i.test(warning));
  const lowConfidence =
    item.extractionQuality?.lowConfidence === true ||
    item.confidence < (item.category === "accessory" ? 0.65 : 0.55);
  if (
    fallback &&
    item.extractionMethod !== "original_crop_fallback" &&
    !(item.category === "accessory" && item.imageState === "cropped")
  ) {
    tags.push("Cropped from photo");
  }
  if (partiallyVisible) tags.push("Partially visible");
  if (lowConfidence) tags.push("Needs review");
  return tags;
}

function cleanCommaList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function defaultSubcategoryFor(category: OutfitExtractionCategory) {
  if (category === "bottom") return "trousers";
  if (category === "footwear") return "sneaker";
  if (category === "outerwear") return "jacket";
  if (category === "accessory") return "watch";
  if (category === "one_piece") return "dress";
  return "shirt";
}

export const OutfitExtractionEntry = React.memo(function OutfitExtractionEntry({
  uid,
}: {
  uid: string | null;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const extractionStartedRef = React.useRef(false);
  const [visible, setVisible] = React.useState(false);
  const [status, setStatus] = React.useState<OutfitExtractionStatus>("idle");
  const [pendingOutfitPhoto, setPendingOutfitPhoto] = React.useState<PendingOutfitPhoto | null>(null);
  const [draft, setDraft] = React.useState<OutfitExtractionDraft | null>(null);
  const [items, setItems] = React.useState<ExtractedGarmentPreview[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [polishingAccessoryIds, setPolishingAccessoryIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const isProcessing =
    status === "uploading" ||
    status === "understanding" ||
    status === "reconstructing" ||
    status === "detecting" ||
    status === "separating" ||
    status === "cleaning" ||
    status === "saving";

  React.useEffect(() => {
    if (status !== "understanding") return;
    let index = 0;
    const timer = setInterval(() => {
      index = Math.min(index + 1, PROCESSING_STAGES.length - 1);
      setStatus(PROCESSING_STAGES[index]);
    }, 3400);
    return () => clearInterval(timer);
  }, [status]);

  const reset = React.useCallback(() => {
    extractionStartedRef.current = false;
    setStatus("idle");
    setPendingOutfitPhoto(null);
    setDraft(null);
    setItems([]);
    setErrorMessage(null);
    setPolishingAccessoryIds(new Set());
  }, []);

  const close = React.useCallback(() => {
    if (isProcessing) return;
    if (pendingOutfitPhoto) {
      logOutfitExtraction("outfit_photo_cancelled", {
        uriType: pendingOutfitPhoto.uri.startsWith("file:") ? "file" : "other",
      });
    }
    setVisible(false);
    reset();
  }, [isProcessing, pendingOutfitPhoto, reset]);

  const updateItem = React.useCallback((tempId: string, patch: Partial<ExtractedGarmentPreview>) => {
    setItems((current) =>
      current.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item)),
    );
  }, []);

  const selectOutfitPhoto = React.useCallback(async (source: OutfitPhotoSource, replacing = false) => {
    if (!uid) {
      Alert.alert("Sign in required", "Please sign in before adding outfit pieces.");
      return;
    }
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        source === "camera"
          ? "Allow camera access to capture an outfit photo."
          : "Allow photo access to pick an outfit photo.",
      );
      return;
    }
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 1,
            allowsMultipleSelection: false,
          });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.uri) return;

    setVisible(true);
    setStatus("confirming");
    setPendingOutfitPhoto({
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName ?? undefined,
    });
    setDraft(null);
    setItems([]);
    setErrorMessage(null);
    setPolishingAccessoryIds(new Set());
    extractionStartedRef.current = false;
    void runHaptic("selection");
    logOutfitExtraction(replacing ? "outfit_photo_replaced" : "outfit_photo_selected_pending", {
      source,
      width: asset.width ?? null,
      height: asset.height ?? null,
      hasFileName: !!asset.fileName,
    });
  }, [uid]);

  const openOutfitPhotoSourceMenu = React.useCallback((replacing = false) => {
    if (!uid) {
      Alert.alert("Sign in required", "Please sign in before adding outfit pieces.");
      return;
    }
    Alert.alert("Add from outfit photo", "Choose a full-body outfit photo.", [
      {
        text: "Photo Library",
        onPress: () => void selectOutfitPhoto("library", replacing),
      },
      {
        text: "Camera",
        onPress: () => void selectOutfitPhoto("camera", replacing),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [selectOutfitPhoto, uid]);

  const confirmOutfitPhoto = React.useCallback(async () => {
    if (!uid || !pendingOutfitPhoto) return;
    if (extractionStartedRef.current) return;
    extractionStartedRef.current = true;

    setStatus("uploading");
    setDraft(null);
    setItems([]);
    setErrorMessage(null);
    setPolishingAccessoryIds(new Set());
    void runHaptic("selection");
    logOutfitExtraction("outfit_photo_confirmed", {
      width: pendingOutfitPhoto.width ?? null,
      height: pendingOutfitPhoto.height ?? null,
      hasFileName: !!pendingOutfitPhoto.fileName,
    });

    try {
      const traceId = makeTraceId();
      const uploaded = await uploadOutfitPhotoForExtraction({
        uid,
        localUri: pendingOutfitPhoto.uri,
        width: pendingOutfitPhoto.width,
        height: pendingOutfitPhoto.height,
      });
      setStatus("understanding");
      let nextDraft: OutfitExtractionDraft | null = null;
      try {
        const layoutResponse = await reconstructOutfitLayout({
          imageUrl: uploaded.imageUrl,
          storagePath: uploaded.storagePath,
          traceId,
        });
        if (layoutResponse.layoutItems.length) {
          nextDraft = toOutfitLayoutDraft({
            sourceImageUrl: uploaded.imageUrl,
            sourceStoragePath: uploaded.storagePath,
            response: layoutResponse,
          });
        }
      } catch (layoutError) {
        if (DEBUG_OUTFIT_EXTRACTION) {
          console.info(
            "[AURA OutfitLayout] step=layout_reconstruction_fallback data=",
            layoutError instanceof Error ? layoutError.message : String(layoutError ?? "Unknown error"),
          );
        }
      }

      if (!nextDraft) {
        setStatus("detecting");
        const response = await extractOutfitItems({
          imageUrl: uploaded.imageUrl,
          storagePath: uploaded.storagePath,
          traceId,
          qualityPreferences: {
            maxItems: 6,
          },
        });
        nextDraft = toOutfitExtractionDraft({
          sourceImageUrl: uploaded.imageUrl,
          sourceStoragePath: uploaded.storagePath,
          response,
        });
      }
      setDraft(nextDraft);
      setItems(nextDraft.detectedItems);
      setPendingOutfitPhoto(null);
      if (!nextDraft.detectedItems.length) {
        setStatus("error");
        setErrorMessage("We couldn’t confidently extract items from this outfit photo.");
        void runHaptic("warning");
        return;
      }
      setStatus("review");
      void runHaptic("success");
    } catch (error) {
      setStatus("error");
      setErrorMessage(outfitExtractionErrorMessage(error));
      void runHaptic("error");
    } finally {
      extractionStartedRef.current = false;
    }
  }, [pendingOutfitPhoto, uid]);

  const saveSelected = React.useCallback(async () => {
    if (!uid || !draft) return;
    const count = selectedCount(items);
    if (!count) {
      Alert.alert("Select items", "Choose at least one extracted item to add.");
      return;
    }
    setStatus("saving");
    try {
      const created = await saveSelectedOutfitExtractionItems({ uid, draft, items });
      Toast.success(
        created.length === 1 ? "Added 1 item" : `Added ${created.length} items`,
        "Saved separately to your closet",
      );
      void runHaptic("success");
      setVisible(false);
      reset();
      router.replace("/(tabs)/closet");
    } catch {
      setStatus("review");
      Toast.error(
        "Couldn’t add selected items",
        "Please try again.",
      );
      void runHaptic("error");
    }
  }, [draft, items, reset, uid]);

  const polishAccessory = React.useCallback(
    async (item: ExtractedGarmentPreview) => {
      if (!uid || !draft || item.category !== "accessory" || !item.cropImageUrl) return;
      if (polishingAccessoryIds.has(item.tempId)) return;

      setPolishingAccessoryIds((current) => {
        const next = new Set(current);
        next.add(item.tempId);
        return next;
      });
      void runHaptic("selection");

      try {
        const result = await polishExtractedAccessory({
          traceId: draft.traceId,
          itemTempId: item.tempId,
          cropImageUrl: item.cropImageUrl,
          category: "accessory",
          subcategory: item.subcategory,
          suggestedName: item.suggestedName,
        });
        const backgroundRemovalApplied = !!result.cleanedImageUrl;
        setItems((current) =>
          current.map((currentItem) => {
            if (currentItem.tempId !== item.tempId) return currentItem;
            const warnings = [
              ...(currentItem.extractionMetadata.polishWarnings ?? []).filter(
                (warning) => warning !== "accessory_auto_skip",
              ),
              ...(result.warnings ?? []),
            ];
            return {
              ...currentItem,
              refinedImageUrl: result.refinedImageUrl,
              cleanedImageUrl: result.cleanedImageUrl ?? null,
              imageState: "polished",
              autoPolishApplied: false,
              userPolished: true,
              polishApplied: true,
              cutoutApplied: backgroundRemovalApplied,
              polishAvailable: false,
              polishSkippedReason: null,
              maskInfo: backgroundRemovalApplied
                ? { method: "background_removal", source: "server" }
                : {
                    method: "not_available",
                    source: "server",
                    warning: "Background removal failed; polished image is available.",
                  },
              extractionWarnings: backgroundRemovalApplied
                ? currentItem.extractionWarnings.filter(
                    (warning) => !/accessory cropped only/i.test(warning),
                  )
                : [
                    ...currentItem.extractionWarnings.filter(
                      (warning) => !/accessory cropped only/i.test(warning),
                    ),
                    "Background removal failed; polished image is available.",
                  ],
              extractionMetadata: {
                ...currentItem.extractionMetadata,
                refinedStoragePath:
                  result.refinedStoragePath ?? currentItem.extractionMetadata.refinedStoragePath ?? null,
                cleanedStoragePath:
                  result.cleanedStoragePath ?? currentItem.extractionMetadata.cleanedStoragePath ?? null,
                polishApplied: true,
                backgroundRemovalApplied,
                polishWarnings: warnings,
              },
              extractionQuality: currentItem.extractionQuality
                ? {
                    ...currentItem.extractionQuality,
                    hasRefinedImageUrl: true,
                    hasCleanedImageUrl: backgroundRemovalApplied,
                    rawCropFallback: false,
                    fallbackUsed: !backgroundRemovalApplied,
                  }
                : currentItem.extractionQuality,
            };
          }),
        );
        Toast.success(
          "Accessory polished",
          backgroundRemovalApplied ? "Clean cutout is ready." : "Cleaned image is ready.",
        );
        void runHaptic("success");
      } catch (error) {
        setItems((current) =>
          current.map((currentItem) =>
            currentItem.tempId === item.tempId
              ? {
                  ...currentItem,
                  extractionWarnings: [
                    ...(currentItem.extractionWarnings ?? []),
                    "Accessory polish failed. Cropped image is still available.",
                  ].slice(0, 8),
                }
              : currentItem,
          ),
        );
        Toast.error(
          "Couldn’t polish accessory",
          getFriendlyErrorMessage(error),
        );
        void runHaptic("error");
      } finally {
        setPolishingAccessoryIds((current) => {
          const next = new Set(current);
          next.delete(item.tempId);
          return next;
        });
      }
    },
    [draft, polishingAccessoryIds, uid],
  );

  return (
    <>
      <Pressable
        onPress={() => openOutfitPhotoSourceMenu(false)}
        style={({ pressed }) => ({
          minHeight: 58,
          borderRadius: 18,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderWidth: 1,
          borderColor: "rgba(223,182,178,0.18)",
          backgroundColor: "rgba(34,31,40,0.54)",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(223,182,178,0.12)",
            borderWidth: 1,
            borderColor: "rgba(223,182,178,0.18)",
          }}
        >
          <Ionicons name="images-outline" size={18} color={colors.ctaCream} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: "900" }}>
            Add from outfit photo
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 }} numberOfLines={2}>
            Extract separate closet items from a mirror selfie or fit pic.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.textSecondary} />
      </Pressable>

      <Modal visible={visible} animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, backgroundColor: colors.background }}
        >
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <BlurView
              intensity={28}
              tint="dark"
              style={{
                paddingTop: insets.top + 10,
                paddingHorizontal: 16,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: "rgba(8,7,9,0.82)",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Pressable
                  onPress={close}
                  disabled={isProcessing}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: isProcessing ? 0.45 : 1,
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.textSecondary} />
                </Pressable>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text, fontSize: 19, fontWeight: "900" }}>
                    {status === "confirming" ? "Use this outfit photo?" : "Detected Items"}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 }} numberOfLines={1}>
                    {status === "confirming"
                      ? "AURA will separate visible pieces and create clean closet items."
                      : status === "review" && draft
                      ? `${selectedCount(items)} selected · ${visibleItems(items).length} found`
                      : stageLabel(status)}
                  </Text>
                </View>
                {status === "review" ? (
                  <Pressable
                    onPress={() => openOutfitPhotoSourceMenu(true)}
                    style={{
                      minHeight: 38,
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "900" }}>
                      Replace
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </BlurView>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                padding: 16,
                paddingBottom: insets.bottom + 110,
                gap: 14,
              }}
            >
              {status === "confirming" && pendingOutfitPhoto ? (
                <OutfitPhotoConfirmation
                  photo={pendingOutfitPhoto}
                  onConfirm={() => void confirmOutfitPhoto()}
                  onChooseAnother={() => openOutfitPhotoSourceMenu(true)}
                  onCancel={close}
                />
              ) : isProcessing ? (
                <ProcessingState colors={colors} label={stageLabel(status)} />
              ) : status === "error" ? (
                <ErrorState
                  message={errorMessage ?? "AURA could not extract garments from this photo."}
                  onTryAgain={() => openOutfitPhotoSourceMenu(true)}
                />
              ) : null}

              {status === "review" && draft ? (
                <>
                  <View
                    style={{
                      borderRadius: 22,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Image
                      source={{ uri: draft.reconstructedLayoutUrl ?? draft.sourceImageUrl }}
                      style={{ width: "100%", height: 170, backgroundColor: colors.surfaceRaised }}
                      contentFit={draft.reconstructedLayoutUrl ? "contain" : "cover"}
                    />
                  </View>
                  {draft.summary.failedCount > 0 ? (
                    <Text style={{ color: colors.warning, fontSize: 12.5, lineHeight: 18 }}>
                      {draft.summary.failedCount} item could not be cleaned, but the rest are ready to review.
                    </Text>
                  ) : null}
                  {allLayoutItemsFellBack(draft, items) ? (
                    <Text style={{ color: colors.warning, fontSize: 12.5, lineHeight: 18 }}>
                      Layout generated, but item crops were not matched.
                    </Text>
                  ) : null}
                  {visibleItems(items).map((item) => (
                    <ExtractedItemCard
                      key={item.tempId}
                      item={item}
                      onToggle={() => updateItem(item.tempId, { selected: !item.selected })}
                      onRemove={() => updateItem(item.tempId, { removed: true, selected: false })}
                      onChange={(patch) => updateItem(item.tempId, patch)}
                      onPolishAccessory={() => void polishAccessory(item)}
                      polishingAccessory={polishingAccessoryIds.has(item.tempId)}
                    />
                  ))}
                </>
              ) : null}
            </ScrollView>

            {status === "review" ? (
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: insets.bottom + 14,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                  backgroundColor: "rgba(8,7,9,0.94)",
                }}
              >
                <Pressable
                  onPress={() => void saveSelected()}
                  disabled={selectedCount(items) === 0}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.primary,
                    opacity: selectedCount(items) === 0 ? 0.45 : pressed ? 0.82 : 1,
                  })}
                >
                  <Text style={{ color: colors.primaryText, fontSize: 15, fontWeight: "900" }}>
                    Add selected
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
});

function OutfitPhotoConfirmation({
  photo,
  onConfirm,
  onChooseAnother,
  onCancel,
}: {
  photo: PendingOutfitPhoto;
  onConfirm: () => void;
  onChooseAnother: () => void;
  onCancel: () => void;
}) {
  const { colors } = useAppTheme();

  return (
    <View
      style={{
        borderRadius: 26,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "rgba(24,22,30,0.78)",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          backgroundColor: colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Image
          source={{ uri: photo.uri }}
          style={{ width: "100%", height: 360 }}
          contentFit="contain"
        />
      </View>
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.text, fontSize: 20, lineHeight: 25, fontWeight: "900" }}>
            Use this outfit photo?
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 13.5, lineHeight: 20 }}>
            AURA will separate visible pieces and create clean closet items.
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
            Full-body, well-lit photos work best.
          </Text>
        </View>

        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primary,
            opacity: pressed ? 0.84 : 1,
          })}
        >
          <Text style={{ color: colors.primaryText, fontSize: 15, fontWeight: "900" }}>
            Use this photo
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={onChooseAnother}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 46,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surfaceInteractive,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: "900" }}>
              Choose another
            </Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => ({
              minHeight: 46,
              borderRadius: 999,
              paddingHorizontal: 18,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 13.5, fontWeight: "900" }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ProcessingState({
  colors,
  label,
}: {
  colors: ReturnType<typeof useAppTheme>["colors"];
  label: string;
}) {
  return (
    <View
      style={{
        minHeight: 280,
        borderRadius: 24,
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: "rgba(34,31,40,0.58)",
      }}
    >
      <ActivityIndicator color={colors.ctaCream} />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>{label}</Text>
      <Text
        style={{
          maxWidth: 250,
          color: colors.textSecondary,
          fontSize: 13,
          lineHeight: 19,
          textAlign: "center",
        }}
      >
        AURA is building clean closet items from the visible pieces.
      </Text>
    </View>
  );
}

function ErrorState({
  message,
  onTryAgain,
}: {
  message: string;
  onTryAgain: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        borderRadius: 22,
        padding: 16,
        gap: 12,
        borderWidth: 1,
        borderColor: "rgba(255,77,79,0.24)",
        backgroundColor: "rgba(255,77,79,0.08)",
      }}
    >
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "900" }}>Couldn’t extract this outfit</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>{message}</Text>
      <Pressable
        onPress={onTryAgain}
        style={{
          minHeight: 42,
          borderRadius: 999,
          alignSelf: "flex-start",
          paddingHorizontal: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surfaceInteractive,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: "900" }}>Try another photo</Text>
      </Pressable>
    </View>
  );
}

const ExtractedItemCard = React.memo(function ExtractedItemCard({
  item,
  onToggle,
  onRemove,
  onChange,
  onPolishAccessory,
  polishingAccessory,
}: {
  item: ExtractedGarmentPreview;
  onToggle: () => void;
  onRemove: () => void;
  onChange: (patch: Partial<ExtractedGarmentPreview>) => void;
  onPolishAccessory: () => void;
  polishingAccessory: boolean;
}) {
  const { colors } = useAppTheme();
  const [editing, setEditing] = React.useState(false);
  const imageUri = displayImageFor(item);
  const imageFraming = React.useMemo(
    () => getImageFraming(item, null, { surface: "outfit_extraction_review" }),
    [item],
  );
  const warning = item.extractionWarnings?.[0] || item.maskInfo?.warning || null;
  const warningTags = warningTagsFor(item);
  const previewPadding = imageFramingPadding(94, imageFraming);
  const isAccessory = item.category === "accessory";
  const isCroppedAccessory = isAccessory && item.imageState === "cropped";
  const isPolishedAccessory = isAccessory && item.imageState === "polished";
  const isGridCrop = item.extractionMethod === "layout_grid_crop";
  const isBboxLayoutCrop = item.extractionMethod === "layout_bbox_crop" || item.extractionMethod === "layout_crop";
  const isEditedByAura = isGridCrop || isBboxLayoutCrop;
  const isOriginalFallback = item.extractionMethod === "original_crop_fallback";
  const canPolishAccessory =
    isAccessory && item.polishAvailable !== false && !item.userPolished && !!item.cropImageUrl;

  return (
    <View
      style={{
        borderRadius: 22,
        borderWidth: 1,
        borderColor: item.selected ? "rgba(223,182,178,0.30)" : colors.border,
        backgroundColor: "rgba(24,22,30,0.76)",
        padding: 12,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View
          style={{
            width: 94,
            height: 118,
            borderRadius: 18,
            overflow: "hidden",
            backgroundColor: imageFraming.backgroundColor ?? colors.surfaceRaised,
            borderWidth: 1,
            borderColor: colors.border,
            padding: previewPadding,
          }}
        >
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={[{ width: "100%", height: "100%" }, imageFraming.imageStyle]}
              contentFit={imageFraming.recommendedResizeMode === "cover" ? "cover" : "contain"}
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Pressable
              onPress={onToggle}
              style={{
                width: 26,
                height: 26,
                borderRadius: 13,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: item.selected ? colors.ctaCream : colors.border,
                backgroundColor: item.selected ? colors.ctaCream : "transparent",
              }}
            >
              {item.selected ? <Ionicons name="checkmark" size={15} color={colors.primaryText} /> : null}
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.text, fontSize: 15.5, lineHeight: 20, fontWeight: "900" }} numberOfLines={2}>
                {item.suggestedName}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 17 }} numberOfLines={1}>
                  {CATEGORY_OPTIONS.find((entry) => entry.value === item.category)?.label ?? item.category} · {confidenceLabel(item.confidence)}
                </Text>
                {isEditedByAura ? <StateBadge label="Edited by AURA" tone="success" /> : null}
                {isGridCrop ? <StateBadge label="Grid crop" tone="muted" /> : null}
                {isBboxLayoutCrop ? <StateBadge label="Layout crop" tone="muted" /> : null}
                {item.imageSource === "outfit_layout_reconstruction" ? <StateBadge label="Review before saving" tone="muted" /> : null}
                {isOriginalFallback ? <StateBadge label="Original crop" tone="warning" /> : null}
                {isCroppedAccessory ? <StateBadge label="Cropped" tone="muted" /> : null}
                {isPolishedAccessory ? <StateBadge label="Polished" tone="success" /> : null}
              </View>
            </View>
          </View>
          {item.suggestedColors.length ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12.5 }} numberOfLines={1}>
              {item.suggestedColors.join(", ")}
            </Text>
          ) : null}
          {warningTags.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {warningTags.map((tag) => (
                <View
                  key={tag}
                  style={{
                    minHeight: 24,
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,193,7,0.24)",
                    backgroundColor: "rgba(255,193,7,0.08)",
                  }}
                >
                  <Text style={{ color: colors.warning, fontSize: 10.5, fontWeight: "900" }}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {warning ? (
            <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
              {warning}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {canPolishAccessory ? (
              <MiniAction
                label={polishingAccessory ? "Polishing" : "Polish"}
                icon="sparkles-outline"
                onPress={onPolishAccessory}
                loading={polishingAccessory}
                disabled={polishingAccessory}
                emphasis
              />
            ) : null}
            <MiniAction label={editing ? "Done" : "Edit details"} icon="create-outline" onPress={() => setEditing((value) => !value)} />
            <MiniAction label="Remove" icon="trash-outline" onPress={onRemove} />
          </View>
        </View>
      </View>

      {editing ? (
        <View style={{ gap: 10 }}>
          <InlineField
            label="Name"
            value={item.suggestedName}
            onChangeText={(value) => onChange({ suggestedName: value })}
          />
          <InlineField
            label="Brand"
            value={item.suggestedBrand ?? ""}
            placeholder="Unbranded"
            onChangeText={(value) => onChange({ suggestedBrand: value })}
          />
          <InlineField
            label="Colors"
            value={item.suggestedColors.join(", ")}
            placeholder="Black, Silver"
            onChangeText={(value) => onChange({ suggestedColors: cleanCommaList(value) })}
          />
          <View style={{ gap: 7 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 }}>
              CATEGORY
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {CATEGORY_OPTIONS.map((option) => {
                const active = item.category === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() =>
                      onChange({
                        category: option.value,
                        subcategory: item.category === option.value
                          ? item.subcategory
                          : defaultSubcategoryFor(option.value),
                      })
                    }
                    style={{
                      minHeight: 34,
                      borderRadius: 999,
                      paddingHorizontal: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: active ? colors.purpleBorder : colors.border,
                      backgroundColor: active ? colors.purpleSurface : colors.chipBackground,
                    }}
                  >
                    <Text style={{ color: active ? colors.ctaCream : colors.textSecondary, fontSize: 12, fontWeight: "800" }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
});

function StateBadge({
  label,
  tone,
}: {
  label: string;
  tone: "muted" | "success" | "warning";
}) {
  const { colors } = useAppTheme();
  const success = tone === "success";
  const warning = tone === "warning";
  return (
    <View
      style={{
        minHeight: 21,
        borderRadius: 999,
        paddingHorizontal: 8,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: success
          ? "rgba(88,214,141,0.28)"
          : warning
            ? "rgba(255,193,7,0.24)"
            : colors.border,
        backgroundColor: success
          ? "rgba(88,214,141,0.10)"
          : warning
            ? "rgba(255,193,7,0.08)"
            : "rgba(255,255,255,0.06)",
      }}
    >
      <Text
        style={{
          color: success ? "#9EF0BA" : warning ? colors.warning : colors.textSecondary,
          fontSize: 10.5,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function MiniAction({
  label,
  icon,
  onPress,
  loading = false,
  disabled = false,
  emphasis = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  emphasis?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        minHeight: 34,
        borderRadius: 999,
        paddingHorizontal: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        borderWidth: 1,
        borderColor: emphasis ? "rgba(223,182,178,0.32)" : colors.border,
        backgroundColor: emphasis ? "rgba(223,182,178,0.12)" : "rgba(42,36,50,0.50)",
        opacity: disabled ? 0.68 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={emphasis ? colors.ctaCream : colors.textSecondary} />
      ) : (
        <Ionicons name={icon} size={13} color={emphasis ? colors.ctaCream : colors.textSecondary} />
      )}
      <Text style={{ color: emphasis ? colors.ctaCream : colors.textSecondary, fontSize: 12, fontWeight: "900" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function InlineField({
  label,
  value,
  placeholder,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "900", letterSpacing: 1.1 }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onChangeText={onChangeText}
        style={{
          minHeight: 42,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.inputBackground,
          color: colors.text,
          paddingHorizontal: 12,
          fontSize: 14,
        }}
      />
    </View>
  );
}
