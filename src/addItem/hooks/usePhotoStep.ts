import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { doc, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Alert, Image as RNImage, Platform } from "react-native";

import {
  buildPhotoHash,
  CUTOUT_TIMEOUT_MS,
  DEFAULT_REFINE_VALUE,
  getRefineOptions,
  getRefineRequestKey,
  shortenUri,
  UPLOAD_TIMEOUT_MS,
  uploadWithTimeout,
} from "../controllerShared";
import {
  isBackgroundRemovalAvailable,
  removeBackground,
} from "../../bg/removeBackground";
import { normalizeCutoutImage } from "../../lib/cutoutNormalize";
import { detectBrandLogo } from "../../lib/detectBrandLogo";
import { getFriendlyErrorMessage, isRateLimitError } from "../../lib/errors";
import { db } from "../../lib/firebase";
import {
  createPhotoPipelineTraceId,
  formatPhotoPipelineSummaryLine,
  logPhotoPipeline,
  photoPipelineDuration,
  photoPipelineNow,
  safeErrorData,
  safeUriType,
  summarizeImageQuality,
  type PhotoPipelineLogEvent,
} from "../../lib/photoPipelineLogger";
import { runProductPolishForLocalImage } from "../../lib/productPolish";
import { uploadItemPhoto } from "../../lib/uploadImage";
import { analyzeCutoutVisualNormalization, type VisualNormalization } from "../../lib/visualNormalization";
import type {
  ItemImageSource,
  ProductImageQuality,
  ProductImageVariant,
  ProductPolishMetadata,
} from "../../types/ProductImageQuality";

type FileSystemCompat = typeof FileSystem & {
  cacheDirectory?: string | null;
  documentDirectory?: string | null;
};

const fileSystem = FileSystem as FileSystemCompat;
const PHOTO_PREVIEW_DEBUG =
  __DEV__ &&
  (process.env.EXPO_PUBLIC_AURA_DEBUG_PHOTO_PREVIEW === "true" ||
    (globalThis as any).AURA_DEBUG_PHOTO_PREVIEW === true);

type UploadedPhotoRecord = {
  imageId: string;
  itemId: string;
  traceId?: string | null;
  photoHash: string;
  originalUrl: string;
  sourceOriginalUrl: string | null;
  primaryUrl: string;
  aiUrl: string | null;
  cleanedUrl: string | null;
  normalizedUrl: string | null;
  refinedUrl: string | null;
  cleanedSource: "vision" | null;
  imageSource?: ItemImageSource | null;
  cutoutSourceKind?: ProductImageVariant | null;
  visualNormalization?: VisualNormalization | null;
  imageQuality?: ProductImageQuality | null;
  productPolish?: ProductPolishMetadata | null;
};

type SelectedPhotoEntry = {
  id: string;
  traceId: string | null;
  source: "camera" | "library";
  localUri: string;
  originalUri: string;
  normalizedOriginalUri: string;
  refinedLocalUri: string | null;
  refinedImageUrl: string | null;
  activeImageVariant: ProductImageVariant;
  photoHash: string;
  originalWidth: number | null;
  originalHeight: number | null;
  cleanedLocalUri: string | null;
  normalizedLocalUri: string | null;
  hasTransparency: boolean;
  transparentPixelRatio: number;
  maskUri: string | null;
  contentBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  cutoutWidth?: number | null;
  cutoutHeight?: number | null;
  visualNormalization: VisualNormalization | null;
  imageQuality: ProductImageQuality | null;
  productPolish: ProductPolishMetadata | null;
  imageSource: ItemImageSource;
  cutoutSourceKind: ProductImageVariant | null;
  uploaded?: UploadedPhotoRecord | null;
};

type StudioSource = ProductImageVariant;

type CutoutInputSource = {
  sourceKind: ProductImageVariant;
  localUri: string;
  reason: string;
  fallbackReason: string | null;
  inspection: Awaited<ReturnType<typeof inspectPipelineImageUri>>;
  entry: SelectedPhotoEntry;
};

type ResolvedPhotoFields = {
  traceId: string | null;
  originalUrl: string | null;
  photoUrl: string | null;
  photoUri: string | null;
  cleanedPhotoUrl: string | null;
  cleanedUrl: string | null;
  normalizedUrl: string | null;
  refinedUrl: string | null;
  visualNormalization: VisualNormalization | null;
  imageQuality: ProductImageQuality | null;
  productPolish: ProductPolishMetadata | null;
  imageSource: ItemImageSource | null;
  cutoutSourceKind: ProductImageVariant | null;
  imageUrls: string[];
  cleanedImageUrls: string[];
  images: {
    originalUrl: string;
    sourceOriginalUrl?: string | null;
    aiUrl?: string | null;
    refinedUrl?: string | null;
    cleanedUrl?: string | null;
    imageSource?: ItemImageSource | null;
    cutoutSourceKind?: ProductImageVariant | null;
    isPrimary: boolean;
  }[];
};

const MIN_USABLE_CUTOUT_TRANSPARENCY = 0.05;
const CUTOUT_ERROR_MESSAGE =
  "We couldn't remove the background. Please try again.";
const PHOTO_PROCESSING_ERROR_MESSAGE =
  "We couldn't prepare this photo. Please try again.";
const REMOTE_CUTOUT_PREP_MESSAGE = "Download this image to refine the cutout.";
const REMOTE_CUTOUT_FAILED_MESSAGE = "Couldn’t prepare this image. Try changing the photo.";
const POLISHED_LOCAL_FALLBACK_MESSAGE =
  "We couldn’t prepare the cleaned image. You can retry or continue with the original photo.";
const POLISHED_CUTOUT_FAILED_MESSAGE =
  "Background removal failed, but you can still continue with the polished image.";

function makeSelectedPhotoId() {
  return randomId();
}

function sanitizePhotoImageRecord(input: {
  traceId?: string | null;
  originalUrl?: string | null;
  sourceOriginalUrl?: string | null;
  aiUrl?: string | null;
  refinedUrl?: string | null;
  cleanedUrl?: string | null;
  imageSource?: ItemImageSource | null;
  cutoutSourceKind?: ProductImageVariant | null;
  isPrimary: boolean;
}) {
  const traceId = String(input.traceId ?? "").trim();
  const originalUrl = String(input.originalUrl ?? "").trim();
  const sourceOriginalUrl = String(input.sourceOriginalUrl ?? "").trim();
  const aiUrl = String(input.aiUrl ?? "").trim();
  const refinedUrl = String(input.refinedUrl ?? "").trim();
  const cleanedUrl = String(input.cleanedUrl ?? "").trim();
  return {
    ...(traceId ? { traceId } : {}),
    originalUrl,
    ...(sourceOriginalUrl ? { sourceOriginalUrl } : {}),
    ...(aiUrl ? { aiUrl } : {}),
    ...(refinedUrl ? { refinedUrl } : {}),
    ...(cleanedUrl ? { cleanedUrl } : {}),
    ...(input.imageSource ? { imageSource: input.imageSource } : {}),
    ...(input.cutoutSourceKind ? { cutoutSourceKind: input.cutoutSourceKind } : {}),
    isPrimary: input.isPrimary,
  };
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getImageDimensionsForDebug(uri: string): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve({ width: null, height: null })
    );
  });
}

async function inspectPipelineImageUri(uri: string | null | undefined) {
  const value = String(uri ?? "").trim();
  const uriType = safeUriType(value);
  if (!value) {
    return {
      hasUri: false,
      uriType,
      pathHint: "",
      fileExists: false,
      byteSize: null as number | null,
      width: null as number | null,
      height: null as number | null,
    };
  }

  let fileExists: boolean | null = null;
  let byteSize: number | null = null;
  if (uriType === "file" || uriType === "local_path") {
    try {
      const info = await FileSystem.getInfoAsync(value);
      fileExists = Boolean(info.exists);
      byteSize = info.exists && typeof (info as any).size === "number"
        ? Number((info as any).size)
        : null;
    } catch {
      fileExists = false;
      byteSize = null;
    }
  }

  const dimensions = await getImageDimensionsForDebug(value);
  return {
    hasUri: true,
    uriType,
    pathHint: shortenUri(value),
    fileExists,
    byteSize,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function isUsablePipelineImage(inspection: Awaited<ReturnType<typeof inspectPipelineImageUri>>) {
  if (!inspection.hasUri) return false;
  if (
    (inspection.uriType === "file" || inspection.uriType === "local_path") &&
    inspection.fileExists === false
  ) {
    return false;
  }
  return true;
}

function isVerifiedLocalCutoutImage(inspection: Awaited<ReturnType<typeof inspectPipelineImageUri>>) {
  if (!isUsablePipelineImage(inspection)) return false;
  if (inspection.uriType === "file" || inspection.uriType === "local_path") {
    if (inspection.fileExists !== true) return false;
    if (typeof inspection.byteSize !== "number" || inspection.byteSize <= 0) return false;
  }
  return (
    typeof inspection.width === "number" &&
    inspection.width > 0 &&
    typeof inspection.height === "number" &&
    inspection.height > 0
  );
}

function itemImageSourceFor(
  sourceKind: ProductImageVariant,
  hasUsableCutout: boolean
): ItemImageSource {
  if (sourceKind === "polished") {
    return hasUsableCutout ? "polished_cutout" : "polished";
  }
  return hasUsableCutout ? "original_cutout" : "original";
}

function localSourceUriForEntry(entry: SelectedPhotoEntry | null, fallback?: string | null) {
  return (
    entry?.normalizedOriginalUri ??
    entry?.originalUri ??
    fallback ??
    entry?.localUri ??
    null
  );
}

function displayUriForStudioSource(
  source: StudioSource,
  entry: SelectedPhotoEntry | null,
  fallback: {
    originalUri?: string | null;
    pendingPhotoUri?: string | null;
    refinedLocalUri?: string | null;
    refinedImageUrl?: string | null;
  } = {}
) {
  const originalUri =
    localSourceUriForEntry(entry, fallback.originalUri ?? fallback.pendingPhotoUri ?? null) ??
    fallback.pendingPhotoUri ??
    null;
  if (source === "polished") {
    return (
      entry?.refinedLocalUri ??
      fallback.refinedLocalUri ??
      entry?.refinedImageUrl ??
      fallback.refinedImageUrl ??
      originalUri
    );
  }
  return originalUri;
}

function userFacingPhotoProcessingError(error: unknown) {
  if (isRateLimitError(error)) {
    return getFriendlyErrorMessage(error);
  }
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim();
  const lower = message.toLowerCase();
  if (lower.includes("remote images cannot") || lower.includes("download this image")) {
    return REMOTE_CUTOUT_PREP_MESSAGE;
  }
  if (lower.includes("couldn’t prepare this image") || lower.includes("couldn't prepare this image")) {
    return REMOTE_CUTOUT_FAILED_MESSAGE;
  }
  if (
    lower.includes("renderasync") ||
    lower.includes("not readable") ||
    lower.includes("background removal") ||
    lower.includes("couldn't prepare this photo") ||
    lower.includes("selected image file is unavailable")
  ) {
    return CUTOUT_ERROR_MESSAGE;
  }
  if (
    message === CUTOUT_ERROR_MESSAGE ||
    message === PHOTO_PROCESSING_ERROR_MESSAGE ||
    message === REMOTE_CUTOUT_PREP_MESSAGE ||
    message === REMOTE_CUTOUT_FAILED_MESSAGE ||
    message === POLISHED_LOCAL_FALLBACK_MESSAGE ||
    message === POLISHED_CUTOUT_FAILED_MESSAGE
  ) {
    return message;
  }
  return PHOTO_PROCESSING_ERROR_MESSAGE;
}

function isRemoteImageUri(uri?: string | null) {
  return /^https?:\/\//i.test(String(uri ?? "").trim());
}

export function usePhotoStep({
  uid,
  isEdit,
  draft,
  extractionRef,
  beginAsyncRequest,
}: {
  uid: string | null;
  isEdit: boolean;
  draft: any;
  extractionRef: MutableRefObject<any>;
  beginAsyncRequest: () => { sessionId: string; requestId: number };
}) {
  const selectedCategory = draft?.derived?.selectedCategory ?? draft?.state?.category ?? null;
  const selectedSubCategory = draft?.state?.subCategory ?? null;
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bgRemovalError, setBgRemovalError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cleanedPhotoUrl, setCleanedPhotoUrl] = useState<string | null>(null);
  const [serverCleanedUrl, setServerCleanedUrl] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [pendingCleanedPhotoUri, setPendingCleanedPhotoUri] = useState<string | null>(null);
  const [pendingCutoutHasTransparency, setPendingCutoutHasTransparency] = useState(false);
  const [pendingCutoutTransparencyRatio, setPendingCutoutTransparencyRatio] = useState(0);
  const [pendingCutoutMaskUri, setPendingCutoutMaskUri] = useState<string | null>(null);
  const [pendingNormalizedPreviewUri, setPendingNormalizedPreviewUri] = useState<string | null>(
    null
  );
  const [autofillCutoutUri, setAutofillCutoutUri] = useState<string | null>(null);
  const [pendingPhotoWidth, setPendingPhotoWidth] = useState<number | null>(null);
  const [originalPickedPhotoUri, setOriginalPickedPhotoUri] = useState<string | null>(null);
  const [pendingRefinedPhotoUri, setPendingRefinedPhotoUri] = useState<string | null>(null);
  const [pendingRefinedImageUrl, setPendingRefinedImageUrl] = useState<string | null>(null);
  const [pendingActiveImageVariant, setPendingActiveImageVariant] =
    useState<ProductImageVariant>("original");
  const [selectedStudioSource, setSelectedStudioSource] = useState<StudioSource>("original");
  const [studioSourceWarning, setStudioSourceWarning] = useState<string | null>(null);
  const [pendingImageQuality, setPendingImageQuality] = useState<ProductImageQuality | null>(null);
  const [pendingProductPolish, setPendingProductPolish] = useState<ProductPolishMetadata | null>(null);
  const [productPolishStatus, setProductPolishStatus] = useState<
    "idle" | "analyzing" | "polishing" | "cutout"
  >("idle");
  const [photoTraceId, setPhotoTraceId] = useState<string | null>(null);
  const [photoDebugSummary, setPhotoDebugSummary] = useState("");
  const [refineValue, setRefineValue] = useState(DEFAULT_REFINE_VALUE);
  const defaultRefineOptions = getRefineOptions(DEFAULT_REFINE_VALUE);
  const [edgePolish, setEdgePolish] = useState(defaultRefineOptions.edgePolish);
  const [debugThreshold, setDebugThreshold] = useState(defaultRefineOptions.threshold);
  const [debugCleanupRadius, setDebugCleanupRadius] = useState(defaultRefineOptions.cleanupRadius);
  const [debugFeather, setDebugFeather] = useState(defaultRefineOptions.feather);
  const [debugEdgeTighten, setDebugEdgeTighten] = useState(defaultRefineOptions.edgeTighten);
  const [refiningCutout, setRefiningCutout] = useState(false);
  const [pendingPhotoHash, setPendingPhotoHash] = useState<string | null>(null);
  const [detectedBrand, setDetectedBrand] = useState<string | null>(null);
  const [detectedBrandConfidence, setDetectedBrandConfidence] = useState<number | null>(null);
  const [uploadedPhotoRecord, setUploadedPhotoRecord] = useState<UploadedPhotoRecord | null>(null);
  const [pendingVisualNormalization, setPendingVisualNormalization] = useState<VisualNormalization | null>(
    null
  );
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedPhotoEntry[]>([]);
  const [primaryPhotoId, setPrimaryPhotoId] = useState<string | null>(null);
  const selectedPhotoIdsKey = selectedPhotos.map((entry) => entry.id).join("|");

  const lastCompletedRefineKeyRef = useRef("");
  const latestRefineRequestIdRef = useRef(0);
  const refineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPhotoSelectionIdRef = useRef(0);
  const latestUploadAttemptIdRef = useRef(0);
  const syncedPreviewUriRef = useRef<string | null>(null);
  const refineExecCountRef = useRef(0);
  const selectedPhotosRef = useRef<SelectedPhotoEntry[]>([]);
  const photoDebugEventsRef = useRef<PhotoPipelineLogEvent[]>([]);

  const appendPhotoPipelineEvent = useCallback((event: PhotoPipelineLogEvent) => {
    if (!__DEV__) return;
    photoDebugEventsRef.current = [...photoDebugEventsRef.current, event].slice(-160);
    setPhotoDebugSummary(
      photoDebugEventsRef.current.map(formatPhotoPipelineSummaryLine).join("\n")
    );
  }, []);

  const resetPhotoPipelineDebug = useCallback((traceId: string | null) => {
    photoDebugEventsRef.current = [];
    setPhotoDebugSummary(traceId ? `trace=${traceId}` : "");
  }, []);

  const logPhotoPipelineEvent = useCallback(
    (
      traceId: string | null | undefined,
      step: string,
      status: "start" | "success" | "failure" | "fallback" | "skip",
      data?: Record<string, unknown>,
      durationMs?: number | null
    ) => {
      logPhotoPipeline({
        traceId,
        step,
        status,
        data,
        durationMs,
        sink: appendPhotoPipelineEvent,
      });
    },
    [appendPhotoPipelineEvent]
  );

  const clearPendingCutoutState = useCallback((reason: string) => {
    void reason;
    setPendingCleanedPhotoUri(null);
    setPendingCutoutHasTransparency(false);
    setPendingCutoutTransparencyRatio(0);
    setPendingCutoutMaskUri(null);
    setPendingNormalizedPreviewUri(null);
    setAutofillCutoutUri(null);
  }, []);

  const commitPendingCutoutState = useCallback(
    (
      reason: string,
      payload: {
        cutoutUri: string | null;
        previewUri?: string | null;
        maskUri?: string | null;
        hasTransparency?: boolean;
        transparentPixelRatio?: number;
        updateAutofillCutout?: boolean;
      }
    ) => {
      const {
        cutoutUri,
        previewUri = null,
        maskUri = null,
        hasTransparency = false,
        transparentPixelRatio = 0,
        updateAutofillCutout = true,
      } = payload;
      setPendingCleanedPhotoUri(cutoutUri);
      setPendingNormalizedPreviewUri(previewUri);
      setPendingCutoutHasTransparency(hasTransparency);
      setPendingCutoutTransparencyRatio(transparentPixelRatio);
      setPendingCutoutMaskUri(maskUri);
      if (updateAutofillCutout) {
        setAutofillCutoutUri(cutoutUri);
      }
      if (PHOTO_PREVIEW_DEBUG) {
        console.log("[AddItemPreview] commitPendingCutoutState", {
          reason,
          cleanedUri: cutoutUri,
          normalizedUri: previewUri,
          maskUri,
          hasTransparency,
          transparentPixelRatio,
          updateAutofillCutout,
        });
      }
    },
    []
  );

  const commitPrimaryPhotoCutout = useCallback(
    (payload: {
      cutoutUri: string | null;
      previewUri: string | null;
      maskUri: string | null;
      hasTransparency: boolean;
      transparentPixelRatio: number;
      contentBounds?: SelectedPhotoEntry["contentBounds"];
      cutoutWidth?: number | null;
      cutoutHeight?: number | null;
      visualNormalization: VisualNormalization | null;
      cutoutSourceKind?: ProductImageVariant | null;
      imageSource?: ItemImageSource | null;
    }) => {
      setSelectedPhotos((prev) => {
        const targetId = primaryPhotoId ?? prev[0]?.id ?? null;
        if (!targetId) return prev;
        return prev.map((entry) =>
          entry.id === targetId
            ? {
                ...entry,
                cleanedLocalUri: payload.cutoutUri,
                normalizedLocalUri: payload.previewUri,
                hasTransparency: payload.hasTransparency,
                transparentPixelRatio: payload.transparentPixelRatio,
                maskUri: payload.maskUri,
                contentBounds: payload.contentBounds ?? null,
                cutoutWidth: payload.cutoutWidth ?? null,
                cutoutHeight: payload.cutoutHeight ?? null,
                visualNormalization: payload.visualNormalization,
                cutoutSourceKind: payload.cutoutSourceKind ?? null,
                imageSource: payload.imageSource ?? itemImageSourceFor(payload.cutoutSourceKind ?? entry.activeImageVariant, !!payload.cutoutUri),
                uploaded: null,
              }
            : entry
        );
      });
    },
    [primaryPhotoId]
  );

  const primarySelectedPhoto =
    selectedPhotos.find((entry) => entry.id === primaryPhotoId) ??
    selectedPhotos[0] ??
    null;
  const activePhotoUri = displayUriForStudioSource(selectedStudioSource, primarySelectedPhoto, {
    originalUri: originalPickedPhotoUri,
    pendingPhotoUri,
    refinedLocalUri: pendingRefinedPhotoUri,
    refinedImageUrl: pendingRefinedImageUrl,
  });
  const previewPhotoUri =
    (pendingCutoutHasTransparency &&
    pendingCutoutTransparencyRatio >= MIN_USABLE_CUTOUT_TRANSPARENCY
      ? pendingNormalizedPreviewUri ?? pendingCleanedPhotoUri
      : null) ??
    activePhotoUri ??
    pendingPhotoUri ??
    cleanedPhotoUrl ??
    serverCleanedUrl ??
    photoUrl ??
    photoUri ??
    null;

  const canRefineCutout =
    isBackgroundRemovalAvailable() &&
    !!activePhotoUri;

  const currentDebugRefineOptions = useCallback(
    () => ({
      threshold: debugThreshold,
      cleanupRadius: debugCleanupRadius,
      feather: debugFeather,
      edgeTighten: debugEdgeTighten,
      edgePolish,
      maskToAlpha: true,
    }),
    [debugCleanupRadius, debugEdgeTighten, debugFeather, debugThreshold, edgePolish]
  );

  const beginUploadAttempt = useCallback((label: string) => {
    const attemptId = latestUploadAttemptIdRef.current + 1;
    latestUploadAttemptIdRef.current = attemptId;
    setUploadingPhoto(true);
    setUploadError(null);
    void label;
    return attemptId;
  }, []);

  const endUploadAttempt = useCallback((attemptId: number, label: string) => {
    void label;
    if (latestUploadAttemptIdRef.current === attemptId) {
      setUploadingPhoto(false);
    }
  }, []);

  const syncLegacyStateFromPrimary = useCallback((entry: SelectedPhotoEntry | null) => {
    if (!entry) {
      setPhotoTraceId(null);
      resetPhotoPipelineDebug(null);
      setSelectedStudioSource("original");
      setStudioSourceWarning(null);
      setPendingPhotoHash(null);
      setOriginalPickedPhotoUri(null);
      setPendingRefinedPhotoUri(null);
      setPendingRefinedImageUrl(null);
      setPendingActiveImageVariant("original");
      setPendingImageQuality(null);
      setPendingProductPolish(null);
      setPendingPhotoUri(null);
      commitPendingCutoutState("sync-primary-clear", {
        cutoutUri: null,
        previewUri: null,
        maskUri: null,
        hasTransparency: false,
        transparentPixelRatio: 0,
        updateAutofillCutout: true,
      });
      setPendingPhotoWidth(null);
      setPendingVisualNormalization(null);
      setUploadedPhotoRecord(null);
      setPhotoUrl(null);
      setCleanedPhotoUrl(null);
      setServerCleanedUrl(null);
      return;
    }

    setPhotoTraceId(entry.traceId ?? null);
    setSelectedStudioSource(entry.activeImageVariant ?? "original");
    setPendingPhotoHash(entry.photoHash);
    setOriginalPickedPhotoUri(
      entry.originalUri ?? entry.normalizedOriginalUri ?? entry.localUri
    );
    setPendingPhotoUri(entry.localUri);
    setPendingRefinedPhotoUri(entry.refinedLocalUri);
    setPendingRefinedImageUrl(entry.refinedImageUrl);
    setPendingActiveImageVariant(entry.activeImageVariant);
    setPendingImageQuality(entry.imageQuality);
    setPendingProductPolish(entry.productPolish);
    commitPendingCutoutState("sync-primary", {
      cutoutUri: entry.cleanedLocalUri,
      previewUri: entry.normalizedLocalUri,
      maskUri: entry.maskUri,
      hasTransparency: entry.hasTransparency,
      transparentPixelRatio: entry.transparentPixelRatio,
      updateAutofillCutout: true,
    });
    setPendingPhotoWidth(entry.originalWidth);
    setPendingVisualNormalization(entry.visualNormalization);
    setUploadedPhotoRecord(entry.uploaded ?? null);
    setPhotoUrl(entry.uploaded?.primaryUrl ?? null);
    setCleanedPhotoUrl(entry.uploaded?.cleanedUrl ?? null);
    setServerCleanedUrl(entry.uploaded?.cleanedUrl ?? null);
  }, [commitPendingCutoutState, resetPhotoPipelineDebug]);

  useEffect(() => {
    selectedPhotosRef.current = selectedPhotos;
  }, [selectedPhotos]);

  useEffect(() => {
    const primary =
      selectedPhotos.find((entry) => entry.id === primaryPhotoId) ??
      selectedPhotos[0] ??
      null;
    syncLegacyStateFromPrimary(primary);
  }, [primaryPhotoId, selectedPhotos, syncLegacyStateFromPrimary]);

  const estimateFileSizeBytes = useCallback(async (uri: string) => {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists && typeof (info as any).size === "number"
        ? Number((info as any).size)
        : null;
    } catch {
      return null;
    }
  }, []);

  const normalizeImageForCutout = useCallback(
    async (params: { uri: string; width?: number | null; height?: number | null }) => {
      const { uri, width, height } = params;
      const maxDimension = 1536;
      const sourceW = width ?? 0;
      const sourceH = height ?? 0;
      const largest = Math.max(sourceW, sourceH);
      if (!largest || largest <= maxDimension) {
        return {
          uri,
          width: sourceW || null,
          height: sourceH || null,
        };
      }
      const scale = maxDimension / largest;
      const nextW = Math.max(1, Math.round(sourceW * scale));
      const nextH = Math.max(1, Math.round(sourceH * scale));
      const normalized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: nextW, height: nextH } }],
        { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG }
      );
      return {
        uri: normalized.uri,
        width: normalized.width ?? nextW,
        height: normalized.height ?? nextH,
      };
    },
    []
  );

  const prepareImageUriForCutout = useCallback(async (uri: string) => {
    if (!isRemoteImageUri(uri)) return uri;
    const baseDirectory = fileSystem.cacheDirectory ?? fileSystem.documentDirectory;
    if (!baseDirectory || typeof FileSystem.downloadAsync !== "function") {
      throw new Error(REMOTE_CUTOUT_FAILED_MESSAGE);
    }
    try {
      const destination = `${baseDirectory}aura-cutout-${randomId()}.jpg`;
      const result = await FileSystem.downloadAsync(uri, destination);
      if (!result?.uri) throw new Error(REMOTE_CUTOUT_FAILED_MESSAGE);
      setSelectedPhotos((prev) =>
        prev.map((entry) =>
          entry.localUri === uri || entry.originalUri === uri
            ? { ...entry, localUri: result.uri }
            : entry
        )
      );
      setOriginalPickedPhotoUri(result.uri);
      setPendingPhotoUri(result.uri);
      return result.uri;
    } catch {
      throw new Error(REMOTE_CUTOUT_FAILED_MESSAGE);
    }
  }, []);

  const ensureRefinedLocalUriForEntry = useCallback(
    async (entry: SelectedPhotoEntry | null, reason: string) => {
      if (!entry) return null;
      const traceId = entry.traceId ?? photoTraceId;
      const existingInspection = await inspectPipelineImageUri(entry.refinedLocalUri);
      if (entry.refinedLocalUri && isVerifiedLocalCutoutImage(existingInspection)) {
        logPhotoPipelineEvent(traceId, "refined_local_rehydrate", "skip", {
          reason,
          localAlreadyAvailable: true,
          refinedLocalPathHint: existingInspection.pathHint,
          refinedUriType: existingInspection.uriType,
          refinedFileExists: existingInspection.fileExists,
          refinedByteSize: existingInspection.byteSize,
          refinedWidth: existingInspection.width,
          refinedHeight: existingInspection.height,
        });
        return entry;
      }

      const refinedImageUrl =
        entry.refinedImageUrl ?? entry.productPolish?.refinedImageUrl ?? pendingRefinedImageUrl;
      if (!refinedImageUrl) {
        logPhotoPipelineEvent(traceId, "refined_local_rehydrate", "skip", {
          reason,
          localAlreadyAvailable: false,
          hasRefinedImageUrl: false,
          existingRefinedPathHint: existingInspection.pathHint,
          existingRefinedFileExists: existingInspection.fileExists,
        });
        return entry;
      }

      const baseDirectory = fileSystem.cacheDirectory ?? fileSystem.documentDirectory;
      if (!baseDirectory || typeof FileSystem.downloadAsync !== "function") {
        logPhotoPipelineEvent(traceId, "refined_local_rehydrate", "failure", {
          reason,
          failureReason: "file_system_unavailable",
          hasRefinedImageUrl: true,
        });
        return entry;
      }

      const destination = `${baseDirectory}aura-product-polish-${randomId()}.jpg`;
      const startedAt = photoPipelineNow();
      logPhotoPipelineEvent(traceId, "refined_local_rehydrate", "start", {
        reason,
        hasRefinedImageUrl: true,
        destinationUriType: safeUriType(destination),
        destinationPathHint: shortenUri(destination),
      });
      logPhotoPipelineEvent(traceId, "refined_image_download", "start", {
        reason,
        hasRefinedImageUrl: true,
        destinationUriType: safeUriType(destination),
        destinationPathHint: shortenUri(destination),
      });

      try {
        const result = await FileSystem.downloadAsync(refinedImageUrl, destination);
        const localUri = result?.uri ?? null;
        const downloadedInspection = await inspectPipelineImageUri(localUri);
        const usable = Boolean(localUri && isVerifiedLocalCutoutImage(downloadedInspection));
        logPhotoPipelineEvent(
          traceId,
          "refined_image_download",
          usable ? "success" : "failure",
          {
            reason,
            outputUriType: downloadedInspection.uriType,
            outputPathHint: downloadedInspection.pathHint,
            hasLocalUri: !!localUri,
            fileExists: downloadedInspection.fileExists,
            byteSize: downloadedInspection.byteSize,
            width: downloadedInspection.width,
            height: downloadedInspection.height,
          },
          photoPipelineDuration(startedAt)
        );

        if (!usable || !localUri) {
          logPhotoPipelineEvent(
            traceId,
            "refined_local_rehydrate",
            "failure",
            {
              reason,
              failureReason: "downloaded_file_unusable",
              hasRefinedImageUrl: true,
              outputPathHint: downloadedInspection.pathHint,
              fileExists: downloadedInspection.fileExists,
              byteSize: downloadedInspection.byteSize,
            },
            photoPipelineDuration(startedAt)
          );
          return entry;
        }

        const nextEntry: SelectedPhotoEntry = {
          ...entry,
          localUri: entry.activeImageVariant === "polished" ? localUri : entry.localUri,
          refinedLocalUri: localUri,
          refinedImageUrl,
          productPolish: entry.productPolish
            ? {
                ...entry.productPolish,
                refinedImageUrl,
              }
            : entry.productPolish,
        };
        setPendingRefinedPhotoUri(localUri);
        setPendingRefinedImageUrl(refinedImageUrl);
        setSelectedPhotos((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? {
                  ...item,
                  localUri: item.activeImageVariant === "polished" ? localUri : item.localUri,
                  refinedLocalUri: localUri,
                  refinedImageUrl,
                  productPolish: item.productPolish
                    ? {
                        ...item.productPolish,
                        refinedImageUrl,
                      }
                    : item.productPolish,
                }
              : item
          )
        );
        logPhotoPipelineEvent(
          traceId,
          "refined_local_rehydrate",
          "success",
          {
            reason,
            hasRefinedImageUrl: true,
            refinedLocalUri: localUri,
            refinedLocalPathHint: downloadedInspection.pathHint,
            refinedUriType: downloadedInspection.uriType,
            refinedFileExists: downloadedInspection.fileExists,
            refinedByteSize: downloadedInspection.byteSize,
            refinedWidth: downloadedInspection.width,
            refinedHeight: downloadedInspection.height,
          },
          photoPipelineDuration(startedAt)
        );
        return nextEntry;
      } catch (error) {
        logPhotoPipelineEvent(
          traceId,
          "refined_image_download",
          "failure",
          {
            reason,
            ...safeErrorData(error),
          },
          photoPipelineDuration(startedAt)
        );
        logPhotoPipelineEvent(
          traceId,
          "refined_local_rehydrate",
          "failure",
          {
            reason,
            ...safeErrorData(error),
          },
          photoPipelineDuration(startedAt)
        );
        return entry;
      }
    },
    [logPhotoPipelineEvent, pendingRefinedImageUrl, photoTraceId]
  );

  const resolveCutoutInputSource = useCallback(
    async (params: {
      entry: SelectedPhotoEntry | null;
      requestedSource?: ProductImageVariant | null;
      reason: string;
      allowOriginalFallback?: boolean;
    }): Promise<CutoutInputSource | null> => {
      const { entry, reason, allowOriginalFallback = true } = params;
      if (!entry) return null;
      const traceId = entry.traceId ?? photoTraceId;
      const requestedSource =
        params.requestedSource ??
        selectedStudioSource ??
        entry.activeImageVariant ??
        "original";
      const wantsPolished =
        requestedSource === "polished" &&
        Boolean(entry.refinedLocalUri || entry.refinedImageUrl || entry.productPolish?.refinedImageUrl);

      if (wantsPolished) {
        const hydratedEntry =
          (await ensureRefinedLocalUriForEntry(entry, reason)) ?? entry;
        const polishedInspection = await inspectPipelineImageUri(hydratedEntry.refinedLocalUri);
        if (hydratedEntry.refinedLocalUri && isVerifiedLocalCutoutImage(polishedInspection)) {
          setStudioSourceWarning(null);
          logPhotoPipelineEvent(traceId, "cutout_input_selected", "success", {
            reason,
            sourceKind: "polished",
            localUri: hydratedEntry.refinedLocalUri,
            pathHint: polishedInspection.pathHint,
            uriType: polishedInspection.uriType,
            fileExists: polishedInspection.fileExists,
            byteSize: polishedInspection.byteSize,
            width: polishedInspection.width,
            height: polishedInspection.height,
          });
          return {
            sourceKind: "polished",
            localUri: hydratedEntry.refinedLocalUri,
            reason: "polished_verified",
            fallbackReason: null,
            inspection: polishedInspection,
            entry: hydratedEntry,
          };
        }

        const originalUri =
          hydratedEntry.normalizedOriginalUri ??
          hydratedEntry.originalUri ??
          hydratedEntry.localUri;
        const originalInspection = await inspectPipelineImageUri(originalUri);
        logPhotoPipelineEvent(traceId, "cutout_input_selected", "fallback", {
          reason,
          sourceKind: "original",
          requestedSource: "polished",
          fallbackReason: "polished_local_unavailable",
          polishedPathHint: polishedInspection.pathHint,
          polishedFileExists: polishedInspection.fileExists,
          polishedByteSize: polishedInspection.byteSize,
          polishedWidth: polishedInspection.width,
          polishedHeight: polishedInspection.height,
          originalPathHint: originalInspection.pathHint,
          originalUriType: originalInspection.uriType,
          originalFileExists: originalInspection.fileExists,
        });
        setStudioSourceWarning(POLISHED_LOCAL_FALLBACK_MESSAGE);
        if (!allowOriginalFallback || !originalUri || !isUsablePipelineImage(originalInspection)) {
          return null;
        }
        return {
          sourceKind: "original",
          localUri: originalUri,
          reason: "polished_unavailable_original_fallback",
          fallbackReason: "polished_local_unavailable",
          inspection: originalInspection,
          entry: {
            ...hydratedEntry,
            localUri: originalUri,
            activeImageVariant: "original",
            imageSource: itemImageSourceFor("original", !!hydratedEntry.cleanedLocalUri),
          },
        };
      }

      const originalUri = entry.normalizedOriginalUri ?? entry.originalUri ?? entry.localUri;
      const originalInspection = await inspectPipelineImageUri(originalUri);
      if (!originalUri || !isUsablePipelineImage(originalInspection)) {
        logPhotoPipelineEvent(traceId, "cutout_input_selected", "failure", {
          reason,
          sourceKind: "original",
          failureReason: "original_unavailable",
          pathHint: originalInspection.pathHint,
          uriType: originalInspection.uriType,
          fileExists: originalInspection.fileExists,
        });
        return null;
      }
      logPhotoPipelineEvent(traceId, "vision_input_selected", "success", {
        reason,
        sourceKind: "original",
        localUri: originalUri,
        pathHint: originalInspection.pathHint,
        uriType: originalInspection.uriType,
        fileExists: originalInspection.fileExists,
        byteSize: originalInspection.byteSize,
        width: originalInspection.width,
        height: originalInspection.height,
      });
      return {
        sourceKind: "original",
        localUri: originalUri,
        reason: "original_selected",
        fallbackReason: null,
        inspection: originalInspection,
        entry: {
          ...entry,
          localUri: originalUri,
          activeImageVariant: "original",
        },
      };
    },
    [
      ensureRefinedLocalUriForEntry,
      logPhotoPipelineEvent,
      photoTraceId,
      selectedStudioSource,
    ]
  );

  const buildNormalizedPreviewCutout = useCallback(
    async (params: {
      cutoutUri: string;
      contentBounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
      imageWidth?: number | null;
      imageHeight?: number | null;
    }) => {
      const normalized = await normalizeCutoutImage({
        ...params,
        category: selectedCategory,
        subCategory: selectedSubCategory,
      });
      if (PHOTO_PREVIEW_DEBUG) {
        console.log("[AddItemPreview] normalized:success", {
          normalizedUri: normalized.uri,
          cutoutUri: params.cutoutUri,
          normalizedSize:
            normalized.outputWidth && normalized.outputHeight
              ? `${normalized.outputWidth}x${normalized.outputHeight}`
              : null,
          scaleRatioUsed: normalized.scaleRatio,
          distinctFromCutout: normalized.uri !== params.cutoutUri,
        });
      }

      return normalized.uri;
    },
    [selectedCategory, selectedSubCategory]
  );

  const analyzeCurrentVisualNormalization = useCallback(
    async (params: {
      contentBounds?: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
      imageWidth?: number | null;
      imageHeight?: number | null;
    }) =>
      analyzeCutoutVisualNormalization({
        ...params,
        category: selectedCategory,
        subCategory: selectedSubCategory,
      }),
    [selectedCategory, selectedSubCategory]
  );

  const runBackgroundRemoval = useCallback(
    async (params: {
      inputUri: string;
      width?: number | null;
      height?: number | null;
      options: ReturnType<typeof getRefineOptions>;
      tag: string;
      traceId?: string | null;
      usingRefinedImage?: boolean;
      originalLocalUri?: string | null;
      refinedLocalUri?: string | null;
      refinedImageUrl?: string | null;
    }) => {
      const {
        inputUri,
        width,
        height,
        options,
        tag,
        traceId = photoTraceId,
        usingRefinedImage = false,
        originalLocalUri = null,
        refinedLocalUri = null,
        refinedImageUrl = null,
      } = params;
      const startedAt = Date.now();
      void width;
      void height;
      void options;
      const inputInspection = await inspectPipelineImageUri(inputUri);
      logPhotoPipelineEvent(traceId, "cutout_input_selected", "success", {
        tag,
        usingRefinedImage,
        sourceKind: usingRefinedImage ? "polished" : "original",
        inputUri,
        inputPathHint: inputInspection.pathHint,
        inputUriType: inputInspection.uriType,
        inputFileExists: inputInspection.fileExists,
        inputByteSize: inputInspection.byteSize,
        inputWidth: inputInspection.width,
        inputHeight: inputInspection.height,
        originalUploadLocalUri: originalLocalUri,
        originalUploadPathHint: shortenUri(originalLocalUri),
        refinedLocalUri,
        refinedLocalPathHint: shortenUri(refinedLocalUri),
        hasRefinedImageUrl: !!refinedImageUrl,
      });
      if (!isUsablePipelineImage(inputInspection)) {
        logPhotoPipelineEvent(traceId, "vision_input_selected", "failure", {
          tag,
          usingRefinedImage,
          reason: "input_file_missing",
          inputUri,
          inputPathHint: inputInspection.pathHint,
          inputUriType: inputInspection.uriType,
          inputFileExists: inputInspection.fileExists,
        }, photoPipelineDuration(startedAt));
        throw new Error("Selected image file is unavailable for background removal.");
      }
      logPhotoPipelineEvent(traceId, "vision_start", "start", {
        tag,
        sourceKind: usingRefinedImage ? "polished" : "original",
        inputUriType: safeUriType(inputUri),
        inputPathHint: inputInspection.pathHint,
        inputFileExists: inputInspection.fileExists,
        inputByteSize: inputInspection.byteSize,
        inputWidth: inputInspection.width,
        inputHeight: inputInspection.height,
        width: width ?? null,
        height: height ?? null,
      });
      await estimateFileSizeBytes(inputUri);
      try {
        const output = await uploadWithTimeout(
          removeBackground(inputUri, options),
          CUTOUT_TIMEOUT_MS,
          "Background removal"
        );
        const durationMs = Date.now() - startedAt;
        const outputUri = output.uri;
        const outputInspection = await inspectPipelineImageUri(outputUri);
        if (!outputUri || outputUri === inputUri) {
          throw new Error(CUTOUT_ERROR_MESSAGE);
        }
        logPhotoPipelineEvent(traceId, "final_image_selected", "success", {
          tag,
          usingRefinedImage,
          imageSource: itemImageSourceFor(usingRefinedImage ? "polished" : "original", true),
          cleanedUri: outputUri,
          cleanedPathHint: outputInspection.pathHint,
          cleanedUriType: outputInspection.uriType,
          cleanedFileExists: outputInspection.fileExists,
          cleanedByteSize: outputInspection.byteSize,
          cleanedWidth: outputInspection.width,
          cleanedHeight: outputInspection.height,
          hasTransparency: output.hasTransparency,
          transparentPixelRatio: output.transparentPixelRatio,
        }, durationMs);
        logPhotoPipelineEvent(traceId, "vision_success", "success", {
          tag,
          outputUriType: safeUriType(outputUri),
          hasTransparency: output.hasTransparency,
          transparentPixelRatio: output.transparentPixelRatio,
          hasMaskUri: !!output.maskUri,
          hasContentBounds: !!output.contentBounds,
          width: output.width ?? null,
          height: output.height ?? null,
        }, durationMs);
        return output;
      } catch (error) {
        logPhotoPipelineEvent(traceId, "vision_failure", "failure", {
          tag,
          ...safeErrorData(error),
        }, photoPipelineDuration(startedAt));
        throw error;
      }
    },
    [estimateFileSizeBytes, logPhotoPipelineEvent, photoTraceId]
  );

  const retryBackgroundRemoval = useCallback(async () => {
    if (!activePhotoUri || !canRefineCutout) return;
    const options = currentDebugRefineOptions();
    const requestId = latestRefineRequestIdRef.current + 1;
    latestRefineRequestIdRef.current = requestId;
    setRefiningCutout(true);
    setBgRemovalError(null);
    try {
      const entries = selectedPhotosRef.current;
      const targetId = primaryPhotoId ?? entries[0]?.id ?? null;
      const entry = entries.find((item) => item.id === targetId) ?? entries[0] ?? null;
      const resolvedInput = await resolveCutoutInputSource({
        entry,
        requestedSource: selectedStudioSource,
        reason: "retry_cutout",
      });
      if (!resolvedInput) {
        throw new Error(PHOTO_PROCESSING_ERROR_MESSAGE);
      }
      const workingEntry = resolvedInput.entry;
      const shouldRetryRefined = resolvedInput.sourceKind === "polished";
      const retrySourceUri = resolvedInput.localUri;
      if (shouldRetryRefined) {
        setStudioSourceWarning(null);
        setPendingPhotoUri(retrySourceUri);
        setPendingRefinedPhotoUri(workingEntry.refinedLocalUri);
        setPendingActiveImageVariant("polished");
        setSelectedPhotos((prev) =>
          prev.map((item) =>
            item.id === workingEntry.id
              ? {
                  ...item,
                  localUri: retrySourceUri,
                  activeImageVariant: "polished",
                  refinedLocalUri: workingEntry.refinedLocalUri,
                  refinedImageUrl: workingEntry.refinedImageUrl,
                  productPolish: item.productPolish
                    ? {
                        ...item.productPolish,
                        activeVariant: "polished",
                      }
                    : item.productPolish,
                }
              : item
          )
        );
      } else if (resolvedInput.fallbackReason) {
        setPendingActiveImageVariant("original");
        setSelectedStudioSource("original");
      }
      const localCutoutInputUri = await prepareImageUriForCutout(retrySourceUri);
      const cutout = await runBackgroundRemoval({
        inputUri: localCutoutInputUri,
        width: pendingPhotoWidth,
        height: null,
        options,
        tag: "retry",
        traceId: workingEntry.traceId ?? photoTraceId,
        usingRefinedImage: shouldRetryRefined,
        originalLocalUri: workingEntry.originalUri ?? originalPickedPhotoUri ?? activePhotoUri,
        refinedLocalUri: workingEntry.refinedLocalUri ?? pendingRefinedPhotoUri,
        refinedImageUrl: workingEntry.refinedImageUrl ?? pendingRefinedImageUrl,
      });
      if (requestId !== latestRefineRequestIdRef.current) {
        return;
      }
      const usableCutout =
        cutout.hasTransparency &&
        cutout.transparentPixelRatio >= MIN_USABLE_CUTOUT_TRANSPARENCY;
      const previewCutoutUri =
        usableCutout
          ? await buildNormalizedPreviewCutout({
              cutoutUri: cutout.uri,
              contentBounds: cutout.contentBounds,
              imageWidth: cutout.width,
              imageHeight: cutout.height,
            })
          : null;
      const visualNormalization = usableCutout
        ? await analyzeCurrentVisualNormalization({
            contentBounds: cutout.contentBounds,
            imageWidth: cutout.width,
            imageHeight: cutout.height,
          })
        : null;
      if (usableCutout) {
        commitPendingCutoutState("retry", {
          cutoutUri: cutout.uri,
          previewUri: previewCutoutUri,
          maskUri: cutout.maskUri,
          hasTransparency: cutout.hasTransparency,
          transparentPixelRatio: cutout.transparentPixelRatio,
        });
        commitPrimaryPhotoCutout({
          cutoutUri: cutout.uri,
          previewUri: previewCutoutUri,
          maskUri: cutout.maskUri,
          hasTransparency: cutout.hasTransparency,
          transparentPixelRatio: cutout.transparentPixelRatio,
          contentBounds: cutout.contentBounds,
          cutoutWidth: cutout.width,
          cutoutHeight: cutout.height,
          visualNormalization,
          cutoutSourceKind: resolvedInput.sourceKind,
          imageSource: itemImageSourceFor(resolvedInput.sourceKind, true),
        });
        setPendingVisualNormalization(visualNormalization);
        setCleanedPhotoUrl(null);
      }
      if (__DEV__) {
        console.log("[RefineCutout] refine applied", {
          hasOriginal: Boolean(originalPickedPhotoUri),
          hasPreviousCutout: Boolean(pendingCleanedPhotoUri),
          hasResult: usableCutout,
          resultUri: usableCutout ? cutout.uri : null,
          params: options,
        });
      }
      if (!usableCutout) {
        const message = shouldRetryRefined ? POLISHED_CUTOUT_FAILED_MESSAGE : CUTOUT_ERROR_MESSAGE;
        setBgRemovalError(message);
        if (shouldRetryRefined) setStudioSourceWarning(message);
      }
      lastCompletedRefineKeyRef.current = getRefineRequestKey(
        localCutoutInputUri,
        refineValue
      );
    } catch (error) {
      const selectedEntry =
        selectedPhotosRef.current.find((item) => item.id === primaryPhotoId) ??
        selectedPhotosRef.current[0] ??
        null;
      const hasPolished =
        selectedStudioSource === "polished" &&
        Boolean(selectedEntry?.refinedLocalUri || selectedEntry?.refinedImageUrl);
      const message = hasPolished
        ? POLISHED_CUTOUT_FAILED_MESSAGE
        : userFacingPhotoProcessingError(error);
      setBgRemovalError(message);
      if (hasPolished) setStudioSourceWarning(message);
    } finally {
      if (requestId === latestRefineRequestIdRef.current) {
        setRefiningCutout(false);
      }
    }
  }, [
    activePhotoUri,
    buildNormalizedPreviewCutout,
    canRefineCutout,
    commitPendingCutoutState,
    commitPrimaryPhotoCutout,
    currentDebugRefineOptions,
    originalPickedPhotoUri,
    pendingCleanedPhotoUri,
    pendingPhotoWidth,
    pendingRefinedImageUrl,
    pendingRefinedPhotoUri,
    photoTraceId,
    prepareImageUriForCutout,
    primaryPhotoId,
    refineValue,
    resolveCutoutInputSource,
    analyzeCurrentVisualNormalization,
    runBackgroundRemoval,
    selectedStudioSource,
  ]);

  const scheduleRefine = useCallback(
    (
      value: number,
      immediate = false,
      explicitOptions?: {
        threshold: number;
        cleanupRadius: number;
        feather: number;
        edgeTighten: number;
        edgePolish: number;
        maskToAlpha: boolean;
      }
    ) => {
      if (!canRefineCutout || !activePhotoUri) return;
      const normalizedValue = Math.max(0, Math.min(1, value));
      const {
        threshold,
        cleanupRadius,
        feather,
        edgeTighten,
        edgePolish: scheduledEdgePolish,
        maskToAlpha,
      } = explicitOptions ?? getRefineOptions(normalizedValue);
      const entries = selectedPhotosRef.current;
      const targetId = primaryPhotoId ?? entries[0]?.id ?? null;
      const entry = entries.find((item) => item.id === targetId) ?? entries[0] ?? null;
      const wantsPolished = selectedStudioSource === "polished" || entry?.activeImageVariant === "polished";
      const shouldRefinePolished = !!(
        wantsPolished &&
        (entry?.refinedLocalUri || entry?.refinedImageUrl)
      );
      const refineSourceUri = shouldRefinePolished
        ? String(entry?.refinedLocalUri ?? entry?.refinedImageUrl)
        : entry?.normalizedOriginalUri ?? activePhotoUri;
      const requestKey = getRefineRequestKey(refineSourceUri, normalizedValue);
      if (!explicitOptions && lastCompletedRefineKeyRef.current === requestKey) return;

      const requestId = latestRefineRequestIdRef.current + 1;
      latestRefineRequestIdRef.current = requestId;
      const execute = async () => {
        try {
          refineExecCountRef.current += 1;
          setRefiningCutout(true);
          extractionRef.current?.actions?.setAutofillRunningState?.();
          setBgRemovalError(null);
          const latestEntries = selectedPhotosRef.current;
          const latestTargetId = primaryPhotoId ?? latestEntries[0]?.id ?? null;
          const latestEntry =
            latestEntries.find((item) => item.id === latestTargetId) ??
            latestEntries[0] ??
            entry;
          const resolvedInput = await resolveCutoutInputSource({
            entry: latestEntry,
            requestedSource: selectedStudioSource,
            reason: "refine_cutout",
          });
          if (!resolvedInput) {
            throw new Error(PHOTO_PROCESSING_ERROR_MESSAGE);
          }
          const workingEntry = resolvedInput.entry;
          const usingRefinedForRefine = resolvedInput.sourceKind === "polished";
          const refineInputUri = resolvedInput.localUri;
          if (usingRefinedForRefine) {
            setStudioSourceWarning(null);
            setPendingPhotoUri(refineInputUri);
            setPendingRefinedPhotoUri(workingEntry.refinedLocalUri);
            setPendingActiveImageVariant("polished");
            setSelectedPhotos((prev) =>
              prev.map((item) =>
                item.id === workingEntry.id
                  ? {
                      ...item,
                      localUri: refineInputUri,
                      activeImageVariant: "polished",
                      refinedLocalUri: workingEntry.refinedLocalUri,
                      refinedImageUrl: workingEntry.refinedImageUrl,
                      productPolish: item.productPolish
                        ? {
                            ...item.productPolish,
                            activeVariant: "polished",
                          }
                        : item.productPolish,
                    }
                  : item
              )
            );
          } else if (resolvedInput.fallbackReason) {
            setPendingActiveImageVariant("original");
            setSelectedStudioSource("original");
          }
          const localCutoutInputUri = await prepareImageUriForCutout(refineInputUri);
          const cutout = await runBackgroundRemoval({
            inputUri: localCutoutInputUri,
            width: pendingPhotoWidth,
            height: null,
            options: {
              threshold,
              cleanupRadius,
              feather,
              edgeTighten,
              edgePolish: scheduledEdgePolish,
              maskToAlpha,
            },
            tag: "refine",
            traceId: workingEntry.traceId ?? entry?.traceId ?? photoTraceId,
            usingRefinedImage: usingRefinedForRefine,
            originalLocalUri: workingEntry.originalUri ?? originalPickedPhotoUri ?? activePhotoUri,
            refinedLocalUri: workingEntry.refinedLocalUri ?? pendingRefinedPhotoUri,
            refinedImageUrl: workingEntry.refinedImageUrl ?? pendingRefinedImageUrl,
          });
          if (requestId !== latestRefineRequestIdRef.current) {
            return;
          }
          const usableCutout =
            cutout.hasTransparency &&
            cutout.transparentPixelRatio >= MIN_USABLE_CUTOUT_TRANSPARENCY;
          const previewCutoutUri =
            usableCutout
              ? await buildNormalizedPreviewCutout({
                  cutoutUri: cutout.uri,
                  contentBounds: cutout.contentBounds,
                  imageWidth: cutout.width,
                  imageHeight: cutout.height,
                })
              : null;
          const visualNormalization = usableCutout
            ? await analyzeCurrentVisualNormalization({
                contentBounds: cutout.contentBounds,
                imageWidth: cutout.width,
                imageHeight: cutout.height,
              })
            : null;
          lastCompletedRefineKeyRef.current = getRefineRequestKey(refineInputUri, normalizedValue);
          commitPendingCutoutState("refine", {
            cutoutUri: usableCutout ? cutout.uri : null,
            previewUri: previewCutoutUri,
            maskUri: usableCutout ? cutout.maskUri : null,
            hasTransparency: usableCutout ? cutout.hasTransparency : false,
            transparentPixelRatio: usableCutout ? cutout.transparentPixelRatio : 0,
            updateAutofillCutout: immediate,
          });
          if (immediate) {
            commitPrimaryPhotoCutout({
              cutoutUri: usableCutout ? cutout.uri : null,
              previewUri: previewCutoutUri,
              maskUri: usableCutout ? cutout.maskUri : null,
              hasTransparency: usableCutout ? cutout.hasTransparency : false,
              transparentPixelRatio: usableCutout ? cutout.transparentPixelRatio : 0,
              contentBounds: usableCutout ? cutout.contentBounds : null,
              cutoutWidth: usableCutout ? cutout.width : null,
              cutoutHeight: usableCutout ? cutout.height : null,
              visualNormalization,
              cutoutSourceKind: usableCutout ? resolvedInput.sourceKind : null,
              imageSource: itemImageSourceFor(resolvedInput.sourceKind, usableCutout),
            });
          }
          setPendingVisualNormalization(visualNormalization);
          setCleanedPhotoUrl(null);
          if (__DEV__) {
            console.log("[RefineCutout] refine applied", {
              hasOriginal: Boolean(originalPickedPhotoUri),
              hasPreviousCutout: Boolean(pendingCleanedPhotoUri),
              hasResult: usableCutout,
              resultUri: usableCutout ? cutout.uri : null,
              params: {
                threshold,
                cleanupRadius,
                feather,
                edgeTighten,
                edgePolish: scheduledEdgePolish,
                maskToAlpha,
              },
            });
          }
          if (!usableCutout) {
            const message = usingRefinedForRefine ? POLISHED_CUTOUT_FAILED_MESSAGE : CUTOUT_ERROR_MESSAGE;
            setBgRemovalError(message);
            if (usingRefinedForRefine) setStudioSourceWarning(message);
          }
        } catch (error) {
          if (requestId === latestRefineRequestIdRef.current) {
            const selectedEntry =
              selectedPhotosRef.current.find((item) => item.id === primaryPhotoId) ??
              selectedPhotosRef.current[0] ??
              null;
            const hasPolished =
              selectedStudioSource === "polished" &&
              Boolean(selectedEntry?.refinedLocalUri || selectedEntry?.refinedImageUrl);
            const message = hasPolished
              ? POLISHED_CUTOUT_FAILED_MESSAGE
              : userFacingPhotoProcessingError(error);
            setBgRemovalError(message);
            if (hasPolished) setStudioSourceWarning(message);
          }
        } finally {
          if (requestId === latestRefineRequestIdRef.current) {
            setRefiningCutout(false);
          }
        }
      };

      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
        refineTimeoutRef.current = null;
      }
      if (immediate) {
        void execute();
        return;
      }
      refineTimeoutRef.current = setTimeout(() => {
        refineTimeoutRef.current = null;
        void execute();
      }, 180);
    },
    [
      activePhotoUri,
      buildNormalizedPreviewCutout,
      canRefineCutout,
      commitPendingCutoutState,
      commitPrimaryPhotoCutout,
      extractionRef,
      originalPickedPhotoUri,
      pendingCleanedPhotoUri,
      pendingPhotoWidth,
      pendingRefinedImageUrl,
      pendingRefinedPhotoUri,
      photoTraceId,
      prepareImageUriForCutout,
      primaryPhotoId,
      analyzeCurrentVisualNormalization,
      resolveCutoutInputSource,
      runBackgroundRemoval,
      selectedStudioSource,
    ]
  );

  const handleRefineValueChange = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(1, value));
      const options = getRefineOptions(next);
      setRefineValue(next);
      setDebugThreshold(options.threshold);
      setDebugCleanupRadius(options.cleanupRadius);
      setDebugFeather(options.feather);
      setDebugEdgeTighten(options.edgeTighten);
      scheduleRefine(next, false, {
        ...options,
        edgePolish,
      });
    },
    [edgePolish, scheduleRefine]
  );

  const handleRefineValueComplete = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(1, value));
      setRefineValue(next);
      const options = getRefineOptions(next);
      setDebugThreshold(options.threshold);
      setDebugCleanupRadius(options.cleanupRadius);
      setDebugFeather(options.feather);
      setDebugEdgeTighten(options.edgeTighten);
      scheduleRefine(next, true, {
        ...options,
        edgePolish,
      });
    },
    [edgePolish, scheduleRefine]
  );

  const handleRefineReset = useCallback(() => {
    setRefineValue(DEFAULT_REFINE_VALUE);
    const options = getRefineOptions(DEFAULT_REFINE_VALUE);
    setEdgePolish(options.edgePolish);
    setDebugThreshold(options.threshold);
    setDebugCleanupRadius(options.cleanupRadius);
    setDebugFeather(options.feather);
    setDebugEdgeTighten(options.edgeTighten);
    scheduleRefine(DEFAULT_REFINE_VALUE, true, options);
  }, [scheduleRefine]);

  const useOriginalPhoto = useCallback(() => {
    if (refineTimeoutRef.current) {
      clearTimeout(refineTimeoutRef.current);
      refineTimeoutRef.current = null;
    }
    latestRefineRequestIdRef.current += 1;
    setRefiningCutout(false);
    setBgRemovalError(null);
    setCleanedPhotoUrl(null);
    setServerCleanedUrl(null);
    setPendingVisualNormalization(null);
    setUploadedPhotoRecord(null);
    lastCompletedRefineKeyRef.current = "";
    commitPendingCutoutState("use-original", {
      cutoutUri: null,
      previewUri: null,
      maskUri: null,
      hasTransparency: false,
      transparentPixelRatio: 0,
      updateAutofillCutout: true,
    });
    setSelectedPhotos((prev) => {
      const targetId = primaryPhotoId ?? prev[0]?.id ?? null;
      return prev.map((entry) =>
        entry.id === targetId
          ? {
              ...entry,
              cleanedLocalUri: null,
              normalizedLocalUri: null,
              hasTransparency: false,
              transparentPixelRatio: 0,
              maskUri: null,
              contentBounds: null,
              cutoutWidth: null,
              cutoutHeight: null,
              visualNormalization: null,
              cutoutSourceKind: null,
              imageSource: "original",
              uploaded: null,
            }
          : entry
      );
    });
  }, [commitPendingCutoutState, primaryPhotoId]);

  const applyProductPhotoVariant = useCallback(
    async (variant: ProductImageVariant) => {
      const entries = selectedPhotosRef.current;
      const targetId = primaryPhotoId ?? entries[0]?.id ?? null;
      const entry = entries.find((item) => item.id === targetId) ?? entries[0] ?? null;
      if (!entry) return;
      const traceId = entry.traceId ?? photoTraceId;
      const previousVariant = entry.activeImageVariant;
      setSelectedStudioSource(variant);
      setPendingActiveImageVariant(variant);
      setBgRemovalError(null);
      setStudioSourceWarning(null);
      logPhotoPipelineEvent(traceId, "studio_source_selected", "success", {
        selected: variant,
        previous: previousVariant,
      });

      const resolvedInput = await resolveCutoutInputSource({
        entry,
        requestedSource: variant,
        reason: "studio_select",
      });
      if (!resolvedInput) return;
      const workingEntry = resolvedInput.entry;
      const usingRequestedRefined = resolvedInput.sourceKind === "polished";
      const inputUri = resolvedInput.localUri;
      const displayUri = displayUriForStudioSource(variant, workingEntry, {
        originalUri: workingEntry.originalUri,
        pendingPhotoUri: workingEntry.localUri,
        refinedLocalUri: workingEntry.refinedLocalUri,
        refinedImageUrl: workingEntry.refinedImageUrl,
      });
      const displayInspection = await inspectPipelineImageUri(displayUri);
      logPhotoPipelineEvent(traceId, "active_photo_uri_resolved", "success", {
        selected: variant,
        usingRefinedImage: usingRequestedRefined,
        pathHint: displayInspection.pathHint,
        uriType: displayInspection.uriType,
        fileExists: displayInspection.fileExists,
        byteSize: displayInspection.byteSize,
        width: displayInspection.width,
        height: displayInspection.height,
        hasRefinedLocalUri: !!workingEntry.refinedLocalUri,
        hasRefinedImageUrl: !!workingEntry.refinedImageUrl,
      });
      const cutoutInputUri = inputUri;
      if (!cutoutInputUri) return;
      const effectiveVariant = resolvedInput.sourceKind;
      if (effectiveVariant !== variant) {
        setSelectedStudioSource(effectiveVariant);
        setPendingActiveImageVariant(effectiveVariant);
      }
      const activeDisplayUri =
        effectiveVariant === "polished"
          ? displayUri ?? cutoutInputUri
          : workingEntry.normalizedOriginalUri ?? cutoutInputUri;
      setPendingPhotoUri(activeDisplayUri);
      setPendingCleanedPhotoUri(null);
      setPendingNormalizedPreviewUri(null);
      setPendingCutoutHasTransparency(false);
      setPendingCutoutTransparencyRatio(0);
      setPendingCutoutMaskUri(null);
      setPendingVisualNormalization(null);
      setCleanedPhotoUrl(null);
      setServerCleanedUrl(null);
      const immediateProductPolish = workingEntry.productPolish
        ? {
            ...workingEntry.productPolish,
            activeVariant: effectiveVariant,
          }
        : workingEntry.productPolish;
      setPendingProductPolish(immediateProductPolish);
      setSelectedPhotos((prev) =>
        prev.map((item) =>
          item.id === workingEntry.id
            ? {
                ...item,
                localUri: activeDisplayUri,
                activeImageVariant: effectiveVariant,
                cleanedLocalUri: null,
                normalizedLocalUri: null,
                hasTransparency: false,
                transparentPixelRatio: 0,
                maskUri: null,
                contentBounds: null,
                cutoutWidth: null,
                cutoutHeight: null,
                visualNormalization: null,
                cutoutSourceKind: null,
                imageSource: itemImageSourceFor(effectiveVariant, false),
                productPolish: immediateProductPolish,
                uploaded: null,
              }
            : item
        )
      );
      if (variant === "polished" && resolvedInput.fallbackReason) {
        logPhotoPipelineEvent(traceId, "vision_input_refined_fallback", "fallback", {
          reason: resolvedInput.fallbackReason,
          hasRefinedLocalUri: !!workingEntry.refinedLocalUri,
          refinedLocalUri: workingEntry.refinedLocalUri,
          refinedLocalPathHint: resolvedInput.inspection.pathHint,
          refinedFileExists: resolvedInput.inspection.fileExists,
          fallbackInputUri: workingEntry.normalizedOriginalUri,
          fallbackPathHint: shortenUri(workingEntry.normalizedOriginalUri),
        });
      }
      logPhotoPipelineEvent(traceId, "product_image_variant_toggle", "success", {
        selectedVariant: effectiveVariant,
        requestedVariant: variant,
        previousVariant,
        hasRefinedLocalUri: !!workingEntry.refinedLocalUri,
      });

      const requestId = latestRefineRequestIdRef.current + 1;
      latestRefineRequestIdRef.current = requestId;
      setProductPolishStatus("cutout");
      setRefiningCutout(true);
      setBgRemovalError(null);
      try {
        const options = currentDebugRefineOptions();
        const cutout = await runBackgroundRemoval({
          inputUri: cutoutInputUri,
          width: workingEntry.originalWidth,
          height: workingEntry.originalHeight,
          options,
          tag: `product-polish-${effectiveVariant}`,
          traceId,
          usingRefinedImage: usingRequestedRefined,
          originalLocalUri: workingEntry.originalUri,
          refinedLocalUri: workingEntry.refinedLocalUri,
          refinedImageUrl: workingEntry.refinedImageUrl,
        });
        if (requestId !== latestRefineRequestIdRef.current) {
          return;
        }
        const usableCutout =
          cutout.hasTransparency &&
          cutout.transparentPixelRatio >= MIN_USABLE_CUTOUT_TRANSPARENCY;
        const previewCutoutUri =
          usableCutout
            ? await buildNormalizedPreviewCutout({
                cutoutUri: cutout.uri,
                contentBounds: cutout.contentBounds,
                imageWidth: cutout.width,
                imageHeight: cutout.height,
              })
            : null;
        const visualNormalization = usableCutout
          ? await analyzeCurrentVisualNormalization({
              contentBounds: cutout.contentBounds,
              imageWidth: cutout.width,
              imageHeight: cutout.height,
            })
          : null;
        commitPendingCutoutState("product-variant", {
          cutoutUri: usableCutout ? cutout.uri : null,
          previewUri: previewCutoutUri,
          maskUri: usableCutout ? cutout.maskUri : null,
          hasTransparency: usableCutout ? cutout.hasTransparency : false,
          transparentPixelRatio: usableCutout ? cutout.transparentPixelRatio : 0,
        });
        setPendingVisualNormalization(visualNormalization);
        const nextProductPolish = workingEntry.productPolish
          ? {
              ...workingEntry.productPolish,
              activeVariant: effectiveVariant,
              status: effectiveVariant === "polished" ? "applied" : workingEntry.productPolish.status,
            }
          : null;
        setSelectedPhotos((prev) =>
          prev.map((item) =>
            item.id === workingEntry.id
              ? {
                  ...item,
                  localUri: inputUri,
                  activeImageVariant: effectiveVariant,
                  cleanedLocalUri: usableCutout ? cutout.uri : null,
                  normalizedLocalUri: previewCutoutUri,
                  hasTransparency: usableCutout ? cutout.hasTransparency : false,
                  transparentPixelRatio: usableCutout ? cutout.transparentPixelRatio : 0,
                  maskUri: usableCutout ? cutout.maskUri : null,
                  contentBounds: usableCutout ? cutout.contentBounds : null,
                  cutoutWidth: usableCutout ? cutout.width : null,
                  cutoutHeight: usableCutout ? cutout.height : null,
                  visualNormalization,
                  cutoutSourceKind: usableCutout ? effectiveVariant : null,
                  imageSource: itemImageSourceFor(effectiveVariant, usableCutout),
                  productPolish: nextProductPolish,
                  uploaded: null,
                }
              : item
          )
        );
        lastCompletedRefineKeyRef.current = getRefineRequestKey(cutoutInputUri, refineValue);
        if (!usableCutout) {
          const message = effectiveVariant === "polished" ? POLISHED_CUTOUT_FAILED_MESSAGE : CUTOUT_ERROR_MESSAGE;
          setBgRemovalError(message);
          if (effectiveVariant === "polished") setStudioSourceWarning(message);
        }
      } catch (error) {
        const message = effectiveVariant === "polished"
          ? POLISHED_CUTOUT_FAILED_MESSAGE
          : userFacingPhotoProcessingError(error);
        setBgRemovalError(message);
        if (effectiveVariant === "polished") setStudioSourceWarning(message);
      } finally {
        if (requestId === latestRefineRequestIdRef.current) {
          setRefiningCutout(false);
          setProductPolishStatus("idle");
        }
      }
    },
    [
      analyzeCurrentVisualNormalization,
      buildNormalizedPreviewCutout,
      commitPendingCutoutState,
      currentDebugRefineOptions,
      logPhotoPipelineEvent,
      photoTraceId,
      primaryPhotoId,
      refineValue,
      resolveCutoutInputSource,
      runBackgroundRemoval,
    ]
  );

  const handleEdgePolishChange = useCallback(
    (value: number, commit = false) => {
      const next = Math.max(0, Math.min(1, value));
      setEdgePolish(next);
      scheduleRefine(refineValue, commit, {
        ...currentDebugRefineOptions(),
        edgePolish: next,
      });
    },
    [currentDebugRefineOptions, refineValue, scheduleRefine]
  );

  const handleDebugRefineThresholdChange = useCallback(
    (value: number, commit = false) => {
      const next = Math.max(0.5, Math.min(0.75, value));
      setDebugThreshold(next);
      scheduleRefine(refineValue, commit, {
        ...currentDebugRefineOptions(),
        threshold: next,
      });
    },
    [currentDebugRefineOptions, refineValue, scheduleRefine]
  );

  const handleDebugRefineCleanupRadiusChange = useCallback(
    (value: number, commit = false) => {
      const next = Math.max(0, Math.min(4, Math.round(value)));
      setDebugCleanupRadius(next);
      scheduleRefine(refineValue, commit, {
        ...currentDebugRefineOptions(),
        cleanupRadius: next,
      });
    },
    [currentDebugRefineOptions, refineValue, scheduleRefine]
  );

  const handleDebugRefineFeatherChange = useCallback(
    (value: number, commit = false) => {
      const next = Math.max(0, Math.min(3, Math.round(value)));
      setDebugFeather(next);
      scheduleRefine(refineValue, commit, {
        ...currentDebugRefineOptions(),
        feather: next,
      });
    },
    [currentDebugRefineOptions, refineValue, scheduleRefine]
  );

  const handleDebugRefineEdgeTightenChange = useCallback(
    (value: number, commit = false) => {
      const next = Math.max(0, Math.min(0.15, value));
      setDebugEdgeTighten(next);
      scheduleRefine(refineValue, commit, {
        ...currentDebugRefineOptions(),
        edgeTighten: next,
      });
    },
    [currentDebugRefineOptions, refineValue, scheduleRefine]
  );

  const productPolishGarmentMetadata = useCallback(() => ({
    name: draft?.state?.name ?? null,
    brand: draft?.state?.brand ?? null,
    category: selectedCategory ?? null,
    subCategory: selectedSubCategory ?? null,
    pattern: draft?.state?.pattern ?? null,
    material: draft?.state?.material ?? null,
    colors: Array.isArray(draft?.state?.selectedColors) ? draft.state.selectedColors : [],
    graphicText: draft?.state?.graphicText ?? null,
  }), [draft?.state, selectedCategory, selectedSubCategory]);

  const maybeRunProductPolish = useCallback(
    async (params: {
      normalizedUri: string;
      width: number | null;
      height: number | null;
      photoHash: string;
      traceId: string | null;
    }): Promise<{
      workingUri: string;
      refinedLocalUri: string | null;
      refinedImageUrl: string | null;
      activeImageVariant: ProductImageVariant;
      imageQuality: ProductImageQuality | null;
      productPolish: ProductPolishMetadata | null;
    }> => {
      if (!uid) {
        logPhotoPipelineEvent(params.traceId, "product_polish_decision", "skip", {
          reason: "missing_uid",
        });
        return {
          workingUri: params.normalizedUri,
          refinedLocalUri: null,
          refinedImageUrl: null,
          activeImageVariant: "original",
          imageQuality: null,
          productPolish: null,
        };
      }

      setProductPolishStatus("analyzing");
      const polishStartedAt = photoPipelineNow();
      const polishingDelay = setTimeout(() => {
        setProductPolishStatus((current) => (current === "analyzing" ? "polishing" : current));
      }, 900);

      try {
        const result = await runProductPolishForLocalImage({
          uid,
          localUri: params.normalizedUri,
          width: params.width,
          height: params.height,
          photoHash: params.photoHash,
          traceId: params.traceId,
          onLog: appendPhotoPipelineEvent,
          garmentMetadata: productPolishGarmentMetadata(),
        });
        logPhotoPipelineEvent(params.traceId, "image_quality_result", "success", {
          imageQuality: summarizeImageQuality(result.imageQuality),
        }, photoPipelineDuration(polishStartedAt));
        const warnings = Array.isArray(result.warnings) ? result.warnings : [];
        const hasFailureWarning = warnings.some((warning) => /failed/i.test(warning));
        logPhotoPipelineEvent(params.traceId, "refined_image_received", result.refinedImageUrl ? "success" : "skip", {
          refinementApplied: result.refinementApplied,
          hasRefinedImageUrl: !!result.refinedImageUrl,
          hasRefinedStoragePath: !!result.refinedStoragePath,
          modelUsed: result.modelUsed ?? null,
        });
        const refinedInspection = result.refinedLocalUri
          ? await inspectPipelineImageUri(result.refinedLocalUri)
          : null;
        if (result.refinementApplied) {
          logPhotoPipelineEvent(params.traceId, "refined_local_file_verified", refinedInspection ? "success" : "failure", {
            refinedLocalUri: result.refinedLocalUri ?? null,
            refinedLocalPathHint: refinedInspection?.pathHint ?? "",
            refinedUriType: refinedInspection?.uriType ?? "missing",
            refinedFileExists: refinedInspection?.fileExists ?? false,
            refinedByteSize: refinedInspection?.byteSize ?? null,
            refinedWidth: refinedInspection?.width ?? null,
            refinedHeight: refinedInspection?.height ?? null,
          });
        }
        const hasUsableRefinement = !!(
          result.refinementApplied &&
          result.refinedLocalUri &&
          refinedInspection &&
          isVerifiedLocalCutoutImage(refinedInspection)
        );
        const hasRefinedImage = Boolean(result.refinementApplied && result.refinedImageUrl);
        const shouldPreferPolished = hasUsableRefinement || hasRefinedImage;
        logPhotoPipelineEvent(params.traceId, "product_polish_decision", "success", {
          needsRefinement: result.imageQuality?.needsRefinement ?? null,
          refinementApplied: result.refinementApplied,
          usingPolishedImage: shouldPreferPolished,
          hasFailureWarning,
          refinedLocalFileExists: refinedInspection?.fileExists ?? null,
          warningCount: warnings.length,
          imageQuality: summarizeImageQuality(result.imageQuality),
        });
        const productPolish: ProductPolishMetadata = {
          source: "photo_upload",
          status: shouldPreferPolished ? "applied" : hasFailureWarning ? "failed" : "not_needed",
          activeVariant: shouldPreferPolished ? "polished" : "original",
          traceId: params.traceId,
          modelUsed: result.modelUsed ?? null,
          sourceStoragePath: result.sourceStoragePath,
          refinedStoragePath: result.refinedStoragePath ?? null,
          refinedImageUrl: result.refinedImageUrl ?? null,
          warnings,
          errorMessage: hasFailureWarning ? "Cleaned image could not improve this photo." : null,
          appliedAt: shouldPreferPolished ? Date.now() : null,
        };
        if (result.refinementApplied && result.refinedImageUrl && !hasUsableRefinement) {
          productPolish.errorMessage = "Cleaned image will be prepared before background removal.";
          productPolish.warnings = [...warnings, "refined_local_file_unavailable"];
        } else if (result.refinementApplied && !hasUsableRefinement) {
          productPolish.status = "failed";
          productPolish.activeVariant = "original";
          productPolish.errorMessage = "Cleaned image could not be prepared.";
          productPolish.warnings = [...warnings, "refined_image_unavailable"];
        }
        return {
          workingUri: hasUsableRefinement ? String(result.refinedLocalUri) : params.normalizedUri,
          refinedLocalUri: result.refinedLocalUri ?? null,
          refinedImageUrl: result.refinedImageUrl ?? null,
          activeImageVariant: shouldPreferPolished ? "polished" : "original",
          imageQuality: result.imageQuality ?? null,
          productPolish,
        };
      } catch (error) {
        logPhotoPipelineEvent(params.traceId, "product_polish_decision", "fallback", {
          reason: "polish_unavailable",
          ...safeErrorData(error),
        }, photoPipelineDuration(polishStartedAt));
        if (__DEV__) {
          console.warn("[ProductPolish] optional polish failed; using original", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return {
          workingUri: params.normalizedUri,
          refinedLocalUri: null,
          refinedImageUrl: null,
          activeImageVariant: "original",
          imageQuality: null,
          productPolish: {
            source: "photo_upload",
            status: "failed",
            activeVariant: "original",
            traceId: params.traceId,
            warnings: ["product_polish_unavailable"],
            errorMessage: "Cleaned image was unavailable.",
            appliedAt: null,
          },
        };
      } finally {
        clearTimeout(polishingDelay);
      }
    },
    [appendPhotoPipelineEvent, logPhotoPipelineEvent, productPolishGarmentMetadata, uid]
  );

  const processPickedAsset = useCallback(
    async (
      asset: ImagePicker.ImagePickerAsset,
      source: "library" | "camera",
      selectionId: number,
      traceId: string | null,
      imageIndex: number
    ): Promise<SelectedPhotoEntry> => {
      const originalUri = asset.uri;
      const nextPhotoHash = buildPhotoHash(asset);
      const normalizeStartedAt = photoPipelineNow();
      logPhotoPipelineEvent(traceId, "local_image_normalized", "start", {
        imageIndex,
        source,
        inputUriType: safeUriType(originalUri),
        width: asset.width ?? null,
        height: asset.height ?? null,
      });
      const originalInspection = await inspectPipelineImageUri(originalUri);
      logPhotoPipelineEvent(traceId, "original_upload_local_uri", "success", {
        imageIndex,
        source,
        originalLocalUri: originalUri,
        originalPathHint: originalInspection.pathHint,
        originalUriType: originalInspection.uriType,
        originalFileExists: originalInspection.fileExists,
        originalByteSize: originalInspection.byteSize,
        originalWidth: originalInspection.width ?? asset.width ?? null,
        originalHeight: originalInspection.height ?? asset.height ?? null,
      });
      let normalized: Awaited<ReturnType<typeof normalizeImageForCutout>>;
      try {
        normalized = await normalizeImageForCutout({
          uri: originalUri,
          width: asset.width,
          height: asset.height,
        });
        logPhotoPipelineEvent(traceId, "local_image_normalized", "success", {
          imageIndex,
          outputUriType: safeUriType(normalized.uri || originalUri),
          resized: (normalized.uri || originalUri) !== originalUri,
          width: normalized.width ?? asset.width ?? null,
          height: normalized.height ?? asset.height ?? null,
        }, photoPipelineDuration(normalizeStartedAt));
      } catch (error) {
        logPhotoPipelineEvent(traceId, "local_image_normalized", "failure", {
          imageIndex,
          ...safeErrorData(error),
        }, photoPipelineDuration(normalizeStartedAt));
        throw error;
      }
      const normalizedUri = normalized.uri || originalUri;
      const effectiveWidth = normalized.width ?? asset.width ?? null;
      const effectiveHeight = normalized.height ?? asset.height ?? null;
      const initialOptions = getRefineOptions(DEFAULT_REFINE_VALUE);
      const polish = await maybeRunProductPolish({
        normalizedUri,
        width: effectiveWidth,
        height: effectiveHeight,
        photoHash: nextPhotoHash,
        traceId,
      });
      if (selectionId !== latestPhotoSelectionIdRef.current) {
        throw new Error("Photo selection superseded.");
      }
      setProductPolishStatus("cutout");

      const selectedPhotoId = makeSelectedPhotoId();
      const seedEntry: SelectedPhotoEntry = {
        id: selectedPhotoId,
        traceId,
        source,
        localUri: polish.refinedLocalUri ?? normalizedUri,
        originalUri,
        normalizedOriginalUri: normalizedUri,
        refinedLocalUri: polish.refinedLocalUri,
        refinedImageUrl: polish.refinedImageUrl,
        activeImageVariant: polish.activeImageVariant,
        photoHash: nextPhotoHash,
        originalWidth: effectiveWidth,
        originalHeight: effectiveHeight,
        cleanedLocalUri: null,
        normalizedLocalUri: null,
        hasTransparency: false,
        transparentPixelRatio: 0,
        maskUri: null,
        visualNormalization: null,
        imageQuality: polish.imageQuality,
        productPolish: polish.productPolish,
        imageSource: itemImageSourceFor(polish.activeImageVariant, false),
        cutoutSourceKind: null,
        uploaded: null,
      };
      const resolvedVisionInput = await resolveCutoutInputSource({
        entry: seedEntry,
        requestedSource: polish.activeImageVariant,
        reason: "initial_pick",
      });
      const shouldUseRefinedForVision = resolvedVisionInput?.sourceKind === "polished";
      const visionInputUri = resolvedVisionInput?.localUri ?? normalizedUri;
      const activeImageVariant = resolvedVisionInput?.sourceKind ?? polish.activeImageVariant;
      const resolvedEntry = resolvedVisionInput?.entry ?? seedEntry;

      const brandPromise = detectBrandLogo(originalUri).catch(() => null);
      let cutoutUri: string | null = null;
      let previewCutoutUri: string | null = null;
      let cutoutHasTransparency = false;
      let cutoutTransparencyRatio = 0;
      let cutoutMaskUri: string | null = null;
      let cutoutContentBounds:
        | {
            x: number;
            y: number;
            width: number;
            height: number;
          }
        | null = null;
      let cutoutWidth: number | null = null;
      let cutoutHeight: number | null = null;

      try {
        const cutout = await runBackgroundRemoval({
          inputUri: visionInputUri,
          width: shouldUseRefinedForVision ? resolvedVisionInput?.inspection.width ?? effectiveWidth : effectiveWidth,
          height: shouldUseRefinedForVision ? resolvedVisionInput?.inspection.height ?? effectiveHeight : effectiveHeight,
          options: initialOptions,
          tag: "pick",
          traceId,
          usingRefinedImage: shouldUseRefinedForVision,
          originalLocalUri: originalUri,
          refinedLocalUri: polish.refinedLocalUri,
          refinedImageUrl: polish.refinedImageUrl,
        });
        cutoutUri = cutout.uri;
        cutoutHasTransparency = cutout.hasTransparency;
        cutoutTransparencyRatio = cutout.transparentPixelRatio;
        cutoutMaskUri = cutout.maskUri;
        cutoutContentBounds = cutout.contentBounds;
        cutoutWidth = cutout.width;
        cutoutHeight = cutout.height;
        previewCutoutUri = await buildNormalizedPreviewCutout({
          cutoutUri: cutout.uri,
          contentBounds: cutout.contentBounds,
          imageWidth: cutout.width,
          imageHeight: cutout.height,
        });
        if (
          !cutoutHasTransparency ||
          cutoutTransparencyRatio < MIN_USABLE_CUTOUT_TRANSPARENCY
        ) {
          cutoutUri = null;
          previewCutoutUri = null;
          cutoutHasTransparency = false;
          cutoutTransparencyRatio = 0;
          cutoutMaskUri = null;
        }
      } catch (error) {
        if (Platform.OS === "android") {
          throw error instanceof Error
            ? error
            : new Error("Android background removal failed.");
        }
        if (shouldUseRefinedForVision) {
          setStudioSourceWarning(POLISHED_CUTOUT_FAILED_MESSAGE);
          setBgRemovalError(POLISHED_CUTOUT_FAILED_MESSAGE);
        }
        cutoutUri = null;
        previewCutoutUri = null;
        cutoutHasTransparency = false;
        cutoutTransparencyRatio = 0;
        cutoutMaskUri = null;
      }

      if (selectionId !== latestPhotoSelectionIdRef.current) {
        throw new Error("Photo selection superseded.");
      }

      const visualNormalization =
        cutoutUri && cutoutContentBounds && cutoutWidth && cutoutHeight
          ? await analyzeCurrentVisualNormalization({
              contentBounds: cutoutContentBounds,
              imageWidth: cutoutWidth,
              imageHeight: cutoutHeight,
            })
          : null;

      const brandResult = await brandPromise;
      if (selectionId !== latestPhotoSelectionIdRef.current) {
        throw new Error("Photo selection superseded.");
      }

      if (brandResult?.brand) {
        setDetectedBrand(brandResult.brand);
        setDetectedBrandConfidence(
          typeof brandResult.confidence === "number" ? brandResult.confidence : null
        );
      }

      return {
        id: selectedPhotoId,
        traceId,
        source,
        localUri: visionInputUri,
        originalUri,
        normalizedOriginalUri: normalizedUri,
        refinedLocalUri: resolvedEntry.refinedLocalUri ?? polish.refinedLocalUri,
        refinedImageUrl: polish.refinedImageUrl,
        activeImageVariant,
        photoHash: nextPhotoHash,
        originalWidth: effectiveWidth,
        originalHeight: effectiveHeight,
        cleanedLocalUri: cutoutUri,
        normalizedLocalUri: previewCutoutUri,
        hasTransparency: cutoutHasTransparency,
        transparentPixelRatio: cutoutTransparencyRatio,
        maskUri: cutoutMaskUri,
        contentBounds: cutoutContentBounds,
        cutoutWidth,
        cutoutHeight,
        visualNormalization,
        imageQuality: polish.imageQuality,
        productPolish: polish.productPolish
          ? {
              ...polish.productPolish,
              activeVariant: activeImageVariant,
            }
          : polish.productPolish,
        imageSource: itemImageSourceFor(activeImageVariant, !!cutoutUri),
        cutoutSourceKind: cutoutUri ? activeImageVariant : null,
        uploaded: null,
      };
    },
    [
      analyzeCurrentVisualNormalization,
      buildNormalizedPreviewCutout,
      logPhotoPipelineEvent,
      maybeRunProductPolish,
      normalizeImageForCutout,
      resolveCutoutInputSource,
      runBackgroundRemoval,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    const entries = selectedPhotosRef.current;
    const canReprocess = entries.some(
      (entry) =>
        !!entry.cleanedLocalUri &&
        !!entry.contentBounds &&
        !!entry.cutoutWidth &&
        !!entry.cutoutHeight
    );

    if (!canReprocess) {
      return;
    }

    const reprocessSelectedPhotos = async () => {
      const nextEntries = await Promise.all(
        entries.map(async (entry) => {
          if (
            !entry.cleanedLocalUri ||
            !entry.contentBounds ||
            !entry.cutoutWidth ||
            !entry.cutoutHeight
          ) {
            return entry;
          }

          const normalizedLocalUri = await buildNormalizedPreviewCutout({
            cutoutUri: entry.cleanedLocalUri,
            contentBounds: entry.contentBounds,
            imageWidth: entry.cutoutWidth,
            imageHeight: entry.cutoutHeight,
          });
          const visualNormalization = await analyzeCurrentVisualNormalization({
            contentBounds: entry.contentBounds,
            imageWidth: entry.cutoutWidth,
            imageHeight: entry.cutoutHeight,
          });

          return {
            ...entry,
            normalizedLocalUri,
            visualNormalization,
            uploaded: null,
          };
        })
      );

      if (cancelled) {
        return;
      }

      setSelectedPhotos((prev) => {
        if (!prev.length) {
          return prev;
        }
        return nextEntries;
      });
      setUploadedPhotoRecord(null);
    };

    void reprocessSelectedPhotos();

    return () => {
      cancelled = true;
    };
  }, [
    analyzeCurrentVisualNormalization,
    buildNormalizedPreviewCutout,
    primaryPhotoId,
    selectedPhotoIdsKey,
    selectedCategory,
    selectedSubCategory,
  ]);

  const pickPhoto = useCallback(async (source: "library" | "camera") => {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          source === "camera"
            ? "Allow camera access to capture an item photo."
            : "Allow photo access to pick an item photo."
        );
        return;
      }

      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ["images"],
              quality: 1,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 1,
              allowsMultipleSelection: true,
              selectionLimit: 8,
            });
      if (res.canceled || !res.assets.length) return;

      const nextTraceId = createPhotoPipelineTraceId();
      setPhotoTraceId(nextTraceId);
      resetPhotoPipelineDebug(nextTraceId);
      logPhotoPipelineEvent(nextTraceId, "photo_selected", "success", {
        source,
        assetCount: res.assets.length,
        firstUriType: safeUriType(res.assets[0]?.uri),
        firstWidth: res.assets[0]?.width ?? null,
        firstHeight: res.assets[0]?.height ?? null,
        allowsMultipleSelection: source === "library",
      });
      setUploadError(null);

      const extraction = extractionRef.current;
      const previousDraftId = !isEdit ? extraction?.state?.draftItemId ?? null : null;
      const previousSelectionId = latestPhotoSelectionIdRef.current + 1;
      latestPhotoSelectionIdRef.current = previousSelectionId;
      extraction?.actions?.prepareForNewPhoto?.();
      setDetectedBrand(null);
      setDetectedBrandConfidence(null);
      setBgRemovalError(null);
      setUploadedPhotoRecord(null);
      setProductPolishStatus("idle");
      clearPendingCutoutState("pick-start");

      const nextEntries: SelectedPhotoEntry[] = [];
      for (const [index, asset] of res.assets.entries()) {
        const entry = await processPickedAsset(asset, source, previousSelectionId, nextTraceId, index);
        if (
          !isEdit &&
          extraction?.state?.draftPhotoHash === entry.photoHash &&
          extraction?.state?.draftItemId
        ) {
          continue;
        }
        nextEntries.push(entry);
      }
      if (previousSelectionId !== latestPhotoSelectionIdRef.current) {
        setProductPolishStatus("idle");
        return;
      }
      if (!nextEntries.length) {
        setProductPolishStatus("idle");
        return;
      }

      lastCompletedRefineKeyRef.current = getRefineRequestKey(
        nextEntries[0].localUri,
        DEFAULT_REFINE_VALUE
      );
      latestRefineRequestIdRef.current = 0;
      setRefineValue(DEFAULT_REFINE_VALUE);
      const resetOptions = getRefineOptions(DEFAULT_REFINE_VALUE);
      setEdgePolish(resetOptions.edgePolish);
      setDebugThreshold(resetOptions.threshold);
      setDebugCleanupRadius(resetOptions.cleanupRadius);
      setDebugFeather(resetOptions.feather);
      setDebugEdgeTighten(resetOptions.edgeTighten);
      setSelectedPhotos((prev) => {
        const merged = [...prev, ...nextEntries];
        return merged;
      });
      setPrimaryPhotoId((prev) => prev ?? nextEntries[0]?.id ?? null);
      setCleanedPhotoUrl(null);
      setServerCleanedUrl(null);
      extraction?.actions?.setIngestionStatus?.(isEdit ? null : "pending");
      setProductPolishStatus("idle");

      if (!isEdit && uid) {
        if (previousDraftId) {
          void extraction?.actions?.cleanupDraftDoc?.(previousDraftId);
        }
      }
    } catch (e: any) {
      const message = userFacingPhotoProcessingError(e);
      setUploadError(message);
      setBgRemovalError(message);
      setUploadingPhoto(false);
      setProductPolishStatus("idle");
      Alert.alert("Photo not added", message);
    }
  }, [
    clearPendingCutoutState,
    extractionRef,
    isEdit,
    logPhotoPipelineEvent,
    processPickedAsset,
    resetPhotoPipelineDebug,
    uid,
  ]);

  const resolvePhotoFields = useCallback(async (currentUid: string, itemId: string): Promise<ResolvedPhotoFields> => {
    const activeEntries =
      selectedPhotos.length > 0
        ? selectedPhotos
        : pendingPhotoUri
          ? [
              {
                id: makeSelectedPhotoId(),
                traceId: photoTraceId,
                source: "library" as const,
                localUri: pendingPhotoUri,
                originalUri: originalPickedPhotoUri ?? pendingPhotoUri,
                normalizedOriginalUri: pendingPhotoUri,
                refinedLocalUri: pendingRefinedPhotoUri,
                refinedImageUrl: pendingRefinedImageUrl,
                activeImageVariant: pendingActiveImageVariant,
                photoHash: pendingPhotoHash ?? `${pendingPhotoUri}-${pendingPhotoWidth ?? "w"}`,
                originalWidth: pendingPhotoWidth,
                originalHeight: null,
                cleanedLocalUri: pendingCleanedPhotoUri,
                normalizedLocalUri: pendingNormalizedPreviewUri,
                hasTransparency: pendingCutoutHasTransparency,
                transparentPixelRatio: pendingCutoutTransparencyRatio,
                maskUri: pendingCutoutMaskUri,
                visualNormalization: pendingVisualNormalization,
                imageQuality: pendingImageQuality,
                productPolish: pendingProductPolish,
                imageSource: itemImageSourceFor(pendingActiveImageVariant, !!pendingCleanedPhotoUri),
                cutoutSourceKind: pendingCleanedPhotoUri ? pendingActiveImageVariant : null,
                uploaded: uploadedPhotoRecord,
              },
            ]
          : [];

    if (!activeEntries.length) {
      return {
        traceId: photoTraceId,
        originalUrl: photoUrl,
        photoUrl,
        photoUri,
        cleanedPhotoUrl,
        cleanedUrl: serverCleanedUrl,
        normalizedUrl: pendingNormalizedPreviewUri,
        refinedUrl: pendingRefinedImageUrl,
        visualNormalization: pendingVisualNormalization,
        imageQuality: pendingImageQuality,
        productPolish: pendingProductPolish,
        imageSource: itemImageSourceFor(pendingActiveImageVariant, !!serverCleanedUrl),
        cutoutSourceKind: serverCleanedUrl ? pendingActiveImageVariant : null,
        imageUrls: photoUrl ? [photoUrl] : [],
        cleanedImageUrls: serverCleanedUrl ? [serverCleanedUrl] : [],
        images: photoUrl
          ? [sanitizePhotoImageRecord({ traceId: photoTraceId, originalUrl: photoUrl, aiUrl: null, cleanedUrl: serverCleanedUrl, isPrimary: true })]
          : [],
      };
    }

    const primaryId = primaryPhotoId ?? activeEntries[0]?.id ?? null;
    const entriesForUpload = await Promise.all(
      activeEntries.map(async (entry) => {
        const requestedSource = entry.id === primaryId ? selectedStudioSource : entry.activeImageVariant;
        const resolvedInput = await resolveCutoutInputSource({
          entry,
          requestedSource,
          reason: entry.id === primaryId ? "save_primary" : "save_secondary",
        });
        if (!resolvedInput) return entry;
        const hasMatchingCutout =
          Boolean(entry.cleanedLocalUri) &&
          (entry.cutoutSourceKind ?? entry.activeImageVariant) === resolvedInput.sourceKind;
        const nextProductPolish = entry.productPolish
          ? {
              ...entry.productPolish,
              activeVariant: resolvedInput.sourceKind,
            }
          : entry.productPolish;
        return {
          ...resolvedInput.entry,
          localUri: resolvedInput.localUri,
          activeImageVariant: resolvedInput.sourceKind,
          cleanedLocalUri: hasMatchingCutout ? entry.cleanedLocalUri : null,
          normalizedLocalUri: hasMatchingCutout ? entry.normalizedLocalUri : null,
          hasTransparency: hasMatchingCutout ? entry.hasTransparency : false,
          transparentPixelRatio: hasMatchingCutout ? entry.transparentPixelRatio : 0,
          maskUri: hasMatchingCutout ? entry.maskUri : null,
          contentBounds: hasMatchingCutout ? entry.contentBounds : null,
          cutoutWidth: hasMatchingCutout ? entry.cutoutWidth : null,
          cutoutHeight: hasMatchingCutout ? entry.cutoutHeight : null,
          visualNormalization: hasMatchingCutout ? entry.visualNormalization : null,
          imageSource: itemImageSourceFor(resolvedInput.sourceKind, hasMatchingCutout),
          cutoutSourceKind: hasMatchingCutout ? resolvedInput.sourceKind : null,
          productPolish: nextProductPolish,
          uploaded:
            entry.uploaded &&
            entry.localUri === resolvedInput.localUri &&
            entry.imageSource === itemImageSourceFor(resolvedInput.sourceKind, hasMatchingCutout)
              ? entry.uploaded
              : null,
        } satisfies SelectedPhotoEntry;
      })
    );
    const canReuseUploadedEntry = (entry: SelectedPhotoEntry) =>
      !!entry.uploaded &&
      (entry.uploaded.itemId === itemId || isRemoteImageUri(entry.localUri)) &&
      entry.uploaded.photoHash === entry.photoHash;

    const reusableUpload = entriesForUpload.every(canReuseUploadedEntry);

    let uploadedEntries = entriesForUpload;
    if (!reusableUpload) {
      const attemptId = beginUploadAttempt("resolve-photo-fields");
      try {
        uploadedEntries = await Promise.all(
          activeEntries.map(async (entry, index) => {
            if (canReuseUploadedEntry(entry)) {
              return entry;
            }
            const uploadedUrl = await uploadWithTimeout(
              uploadItemPhoto({
                uid: currentUid,
                itemId,
                imageId: `image-${index + 1}`,
                localUri: entry.localUri,
                cleanedLocalUri: entry.cleanedLocalUri,
                normalizedLocalUri: entry.normalizedLocalUri,
                sourceOriginalLocalUri: entry.originalUri,
                refinedLocalUri: entry.refinedLocalUri,
                saveNormalizedAsCleaned: entry.id === primaryId,
                originalWidth: entry.originalWidth,
                originalHeight: entry.originalHeight,
                imageQuality: entry.imageQuality,
                productPolish: entry.productPolish,
                imageSource: entry.imageSource,
                cutoutSourceKind: entry.cutoutSourceKind,
                traceId: entry.traceId ?? photoTraceId,
                onLog: appendPhotoPipelineEvent,
              }),
              UPLOAD_TIMEOUT_MS,
              "Photo upload"
            );
            return {
              ...entry,
              uploaded: {
                imageId: entry.id,
                itemId,
                traceId: entry.traceId ?? photoTraceId,
                photoHash: entry.photoHash,
                originalUrl: uploadedUrl.originalUrl,
                sourceOriginalUrl: uploadedUrl.sourceOriginalUrl,
                primaryUrl: uploadedUrl.primaryUrl,
                aiUrl: uploadedUrl.aiUrl,
                cleanedUrl: uploadedUrl.cleanedUrl,
                normalizedUrl: uploadedUrl.normalizedUrl,
                refinedUrl: uploadedUrl.refinedUrl,
                cleanedSource: uploadedUrl.cleanedUrl ? "vision" : null,
                imageSource: uploadedUrl.imageSource,
                cutoutSourceKind: uploadedUrl.cutoutSourceKind,
                visualNormalization: entry.visualNormalization,
                imageQuality: entry.imageQuality,
                productPolish: entry.productPolish,
              },
            };
          })
        );
        setSelectedPhotos(uploadedEntries);
        setUploadError(null);
      } catch (error) {
        const message = userFacingPhotoProcessingError(error);
        setUploadError(message);
        throw new Error(message);
      } finally {
        endUploadAttempt(attemptId, "resolve-photo-fields");
      }
    }

    const sortedUploads = uploadedEntries.filter((entry) => entry.uploaded);
    const primaryEntry =
      sortedUploads.find((entry) => entry.id === primaryId) ??
      sortedUploads[0] ??
      null;
    const primaryUpload = primaryEntry?.uploaded ?? null;
    if (primaryEntry?.localUri) {
      syncedPreviewUriRef.current = primaryEntry.localUri;
    }
    setUploadedPhotoRecord(primaryUpload);
    setPhotoUrl(primaryUpload?.primaryUrl ?? null);
    setCleanedPhotoUrl(primaryUpload?.cleanedUrl ?? null);
    setServerCleanedUrl(primaryUpload?.cleanedUrl ?? null);
    setPendingNormalizedPreviewUri(primaryUpload?.normalizedUrl ?? null);
    setPendingRefinedImageUrl(primaryUpload?.refinedUrl ?? primaryEntry?.refinedImageUrl ?? null);
    setPendingRefinedPhotoUri(primaryEntry?.refinedLocalUri ?? null);
    setPendingActiveImageVariant(primaryEntry?.activeImageVariant ?? "original");
    setSelectedStudioSource(primaryEntry?.activeImageVariant ?? "original");
    setPendingImageQuality(primaryEntry?.imageQuality ?? null);
    setPendingProductPolish(primaryEntry?.productPolish ?? null);
    setPendingVisualNormalization(primaryEntry?.visualNormalization ?? null);
    if (primaryEntry) {
      logPhotoPipelineEvent(primaryEntry.traceId ?? photoTraceId, "final_image_selected", "success", {
        reason: "save",
        imageSource: primaryEntry.imageSource,
        cutoutSourceKind: primaryEntry.cutoutSourceKind,
        hasPrimaryUrl: !!primaryUpload?.primaryUrl,
        hasCleanedUrl: !!primaryUpload?.cleanedUrl,
        hasRefinedUrl: !!primaryUpload?.refinedUrl,
      });
    }

    return {
      traceId: primaryEntry?.traceId ?? photoTraceId,
      originalUrl: primaryUpload?.originalUrl ?? null,
      photoUrl: primaryUpload?.primaryUrl ?? null,
      photoUri: null,
      cleanedPhotoUrl: primaryUpload?.cleanedUrl ?? null,
      cleanedUrl: primaryUpload?.cleanedUrl ?? null,
      normalizedUrl: primaryUpload?.normalizedUrl ?? null,
      refinedUrl: primaryUpload?.refinedUrl ?? null,
      visualNormalization: primaryEntry?.visualNormalization ?? null,
      imageQuality: primaryEntry?.imageQuality ?? null,
      productPolish: primaryEntry?.productPolish ?? null,
      imageSource: primaryEntry?.imageSource ?? primaryUpload?.imageSource ?? null,
      cutoutSourceKind: primaryEntry?.cutoutSourceKind ?? primaryUpload?.cutoutSourceKind ?? null,
      imageUrls: sortedUploads
        .map((entry) => entry.uploaded?.primaryUrl ?? "")
        .filter(Boolean),
      cleanedImageUrls: sortedUploads
        .map((entry) => entry.uploaded?.cleanedUrl ?? "")
        .filter(Boolean),
      images: sortedUploads
        .map((entry) =>
          sanitizePhotoImageRecord({
            traceId: entry.traceId,
            originalUrl: entry.uploaded?.primaryUrl ?? "",
            sourceOriginalUrl: entry.uploaded?.sourceOriginalUrl ?? null,
            aiUrl: entry.uploaded?.aiUrl ?? null,
            refinedUrl: entry.uploaded?.refinedUrl ?? null,
            cleanedUrl: entry.uploaded?.cleanedUrl ?? null,
            imageSource: entry.imageSource ?? entry.uploaded?.imageSource ?? null,
            cutoutSourceKind: entry.cutoutSourceKind ?? entry.uploaded?.cutoutSourceKind ?? null,
            isPrimary: entry.id === (primaryEntry?.id ?? ""),
          })
        )
        .filter((entry) => entry.originalUrl),
    };
  }, [
    beginUploadAttempt,
    appendPhotoPipelineEvent,
    cleanedPhotoUrl,
    endUploadAttempt,
    logPhotoPipelineEvent,
    originalPickedPhotoUri,
    pendingCutoutHasTransparency,
    pendingCutoutMaskUri,
    pendingCutoutTransparencyRatio,
    pendingCleanedPhotoUri,
    pendingActiveImageVariant,
    pendingImageQuality,
    pendingNormalizedPreviewUri,
    pendingPhotoHash,
    pendingPhotoUri,
    pendingPhotoWidth,
    pendingProductPolish,
    pendingRefinedImageUrl,
    pendingRefinedPhotoUri,
    pendingVisualNormalization,
    photoUri,
    photoUrl,
    photoTraceId,
    primaryPhotoId,
    resolveCutoutInputSource,
    selectedPhotos,
    selectedStudioSource,
    serverCleanedUrl,
    uploadedPhotoRecord,
  ]);

  const retryPhotoUpload = useCallback(async () => {
    const extraction = extractionRef.current;
    if (!uid || isEdit || !pendingPhotoUri || !extraction) return;
    const token = beginAsyncRequest();
    const attemptId = beginUploadAttempt("retry-upload");
    try {
      const retryEntry =
        selectedPhotosRef.current.find((entry) => entry.id === primaryPhotoId) ??
        selectedPhotosRef.current[0] ??
        null;
      if (extraction.state.draftItemId) {
        extraction.actions.setAutofillRunningState?.();
        extraction.actions.setIngestionStatus?.("pending");
        extraction.actions.setAutofillError?.(null);
        extraction.actions.setIsAutofillRunning?.(true);
        const uploaded = await uploadWithTimeout(
          uploadItemPhoto({
            uid,
            itemId: extraction.state.draftItemId,
            localUri: pendingPhotoUri,
            cleanedLocalUri: pendingCleanedPhotoUri,
            normalizedLocalUri: pendingNormalizedPreviewUri,
            sourceOriginalLocalUri: retryEntry?.originalUri ?? originalPickedPhotoUri ?? pendingPhotoUri,
            refinedLocalUri: retryEntry?.refinedLocalUri ?? pendingRefinedPhotoUri,
            saveNormalizedAsCleaned: true,
            originalWidth: pendingPhotoWidth,
            imageQuality: pendingImageQuality,
            productPolish: pendingProductPolish,
            imageSource: retryEntry?.imageSource ?? itemImageSourceFor(pendingActiveImageVariant, !!pendingCleanedPhotoUri),
            cutoutSourceKind: retryEntry?.cutoutSourceKind ?? (pendingCleanedPhotoUri ? pendingActiveImageVariant : null),
            traceId: retryEntry?.traceId ?? photoTraceId,
            onLog: appendPhotoPipelineEvent,
          }),
          UPLOAD_TIMEOUT_MS,
          "Retry photo upload"
        );
        const nextSourceHash =
          pendingPhotoHash ??
          `${pendingPhotoUri}-${pendingPhotoWidth ?? "unknown-width"}`;
        const now = Date.now();
        await updateDoc(doc(db, "users", uid, "items", extraction.state.draftItemId), {
          photoUrl: uploaded.primaryUrl,
          originalImageUrl: uploaded.originalUrl,
          cleanedImageUrl: uploaded.cleanedUrl,
          refinedImageUrl: uploaded.refinedUrl,
          imageQuality: pendingImageQuality,
          productPolish: pendingProductPolish,
          imageSource: uploaded.imageSource,
          cutoutSourceKind: uploaded.cutoutSourceKind,
          photoPipelineTraceId: retryEntry?.traceId ?? photoTraceId,
          images: [
            sanitizePhotoImageRecord({
              traceId: retryEntry?.traceId ?? photoTraceId,
              originalUrl: uploaded.primaryUrl,
              sourceOriginalUrl: uploaded.sourceOriginalUrl,
              aiUrl: uploaded.aiUrl,
              refinedUrl: uploaded.refinedUrl,
              cleanedUrl: uploaded.cleanedUrl,
              imageSource: uploaded.imageSource,
              cutoutSourceKind: uploaded.cutoutSourceKind,
              isPrimary: true,
            }),
          ],
          updatedAt: Date.now(),
          "photos.originalUrl": uploaded.originalUrl,
          "photos.primaryUrl": uploaded.primaryUrl,
          "photos.aiUrl": uploaded.aiUrl,
          "photos.refinedUrl": uploaded.refinedUrl,
          "photos.imageQuality": pendingImageQuality,
          "photos.productPolish": pendingProductPolish,
          "photos.imageSource": uploaded.imageSource,
          "photos.cutoutSourceKind": uploaded.cutoutSourceKind,
          "photos.traceId": retryEntry?.traceId ?? photoTraceId,
          "photos.urls": [uploaded.primaryUrl],
          "photos.images": [
            sanitizePhotoImageRecord({
              traceId: retryEntry?.traceId ?? photoTraceId,
              originalUrl: uploaded.primaryUrl,
              sourceOriginalUrl: uploaded.sourceOriginalUrl,
              aiUrl: uploaded.aiUrl,
              refinedUrl: uploaded.refinedUrl,
              cleanedUrl: uploaded.cleanedUrl,
              imageSource: uploaded.imageSource,
              cutoutSourceKind: uploaded.cutoutSourceKind,
              isPrimary: true,
            }),
          ],
          ...(uploaded.cleanedUrl
            ? {
                "photos.cleanedUrl": uploaded.cleanedUrl,
                "photos.cleanedSource": uploaded.cleanedSource,
              }
            : {}),
          ...(uploaded.normalizedUrl
            ? {
                "photos.normalizedUrl": uploaded.normalizedUrl,
              }
            : {}),
          draftState: "photo_uploaded",
          itemLifecycleStatus: "processing",
          ingestionStatus: "pending",
          ingestion: {
            status: "pending",
            lastRunAt: now,
          },
          ingestionSource: {
            sourceHash: nextSourceHash,
            sourceType: uploaded.cleanedUrl ? "ios_vision" : "original",
          },
        });
        extraction.actions.setDraftPhotoHash?.(nextSourceHash);
        setPhotoUrl(uploaded.primaryUrl);
        setCleanedPhotoUrl(uploaded.cleanedUrl);
        setServerCleanedUrl(uploaded.cleanedUrl);
        setPendingNormalizedPreviewUri(uploaded.normalizedUrl);
        if (pendingPhotoHash) {
          setUploadedPhotoRecord({
            imageId: "primary",
            itemId: extraction.state.draftItemId,
            traceId: retryEntry?.traceId ?? photoTraceId,
            photoHash: pendingPhotoHash,
            originalUrl: uploaded.originalUrl,
            sourceOriginalUrl: uploaded.sourceOriginalUrl,
            primaryUrl: uploaded.primaryUrl,
            aiUrl: uploaded.aiUrl,
            cleanedUrl: uploaded.cleanedUrl,
            normalizedUrl: uploaded.normalizedUrl,
            refinedUrl: uploaded.refinedUrl,
            cleanedSource: uploaded.cleanedUrl ? "vision" : null,
            imageSource: uploaded.imageSource,
            cutoutSourceKind: uploaded.cutoutSourceKind,
            imageQuality: pendingImageQuality,
            productPolish: pendingProductPolish,
          });
        }
        syncedPreviewUriRef.current = pendingPhotoUri;
      } else {
        const retryHash =
          pendingPhotoHash ??
          `${pendingPhotoUri}-${pendingPhotoWidth ?? "unknown-width"}`;
        extraction.actions.bumpAiRun();
        await uploadWithTimeout(
          extraction.actions.startDraftAutofill({
            photoHash: retryHash,
            localPhotoUri: pendingPhotoUri,
            cleanedLocalUri: pendingCleanedPhotoUri,
            normalizedLocalUri: pendingNormalizedPreviewUri,
            sourceOriginalLocalUri: retryEntry?.originalUri ?? originalPickedPhotoUri ?? pendingPhotoUri,
            refinedLocalUri: retryEntry?.refinedLocalUri ?? pendingRefinedPhotoUri,
            imageQuality: pendingImageQuality,
            productPolish: pendingProductPolish,
            traceId: retryEntry?.traceId ?? photoTraceId,
            originalWidth: pendingPhotoWidth,
            token,
            runId: extraction.refs.aiRunIdRef.current,
          }),
          UPLOAD_TIMEOUT_MS,
          "Retry draft autofill"
        );
      }
      setUploadError(null);
    } catch (error) {
      const message = userFacingPhotoProcessingError(error);
      setUploadError(message);
      extraction.actions.setAiStatus?.("error");
      extraction.actions.setIsAutofillRunning?.(false);
      extraction.actions.setIngestionStatus?.("failed");
      extraction.actions.setAutofillError?.(message);
    } finally {
      endUploadAttempt(attemptId, "retry-upload");
    }
  }, [
    beginAsyncRequest,
    beginUploadAttempt,
    appendPhotoPipelineEvent,
    endUploadAttempt,
    extractionRef,
    isEdit,
    originalPickedPhotoUri,
    pendingActiveImageVariant,
    pendingCleanedPhotoUri,
    pendingImageQuality,
    pendingNormalizedPreviewUri,
    pendingPhotoHash,
    pendingPhotoUri,
    pendingPhotoWidth,
    pendingProductPolish,
    pendingRefinedPhotoUri,
    photoTraceId,
    primaryPhotoId,
    uid,
  ]);

  const hydrateFromItem = useCallback((data: any) => {
    setPhotoUrl(data.photoUrl ?? null);
    setPhotoUri(data.photoUri ?? null);
    const canonicalCleanedUrl = data.photos?.cleanedUrl ?? data.photos?.cleanedPhotoUrl ?? null;
    setCleanedPhotoUrl(canonicalCleanedUrl);
    setServerCleanedUrl(canonicalCleanedUrl);
    setUploadedPhotoRecord(null);
    setPendingPhotoUri(null);
    clearPendingCutoutState("hydrate-from-item");
    setPendingNormalizedPreviewUri(data.photos?.normalizedUrl ?? data.photos?.previewUrl ?? null);
    setPendingVisualNormalization(data.visualNormalization ?? null);
    setPendingPhotoWidth(null);
    setOriginalPickedPhotoUri(null);
    setPendingRefinedPhotoUri(data?.productPolish?.refinedImageUrl ?? data?.photos?.refinedUrl ?? data?.refinedImageUrl ?? null);
    setPendingRefinedImageUrl(data?.productPolish?.refinedImageUrl ?? data?.photos?.refinedUrl ?? data?.refinedImageUrl ?? null);
    const hydratedStudioSource = data?.productPolish?.activeVariant === "polished" ? "polished" : "original";
    setPendingActiveImageVariant(hydratedStudioSource);
    setSelectedStudioSource(hydratedStudioSource);
    setStudioSourceWarning(null);
    setPendingImageQuality(data.imageQuality ?? data.photos?.imageQuality ?? null);
    setPendingProductPolish(data.productPolish ?? data.photos?.productPolish ?? null);
    setProductPolishStatus("idle");
    setRefineValue(DEFAULT_REFINE_VALUE);
    setDebugThreshold(defaultRefineOptions.threshold);
    setDebugCleanupRadius(defaultRefineOptions.cleanupRadius);
    setDebugFeather(defaultRefineOptions.feather);
    setDebugEdgeTighten(defaultRefineOptions.edgeTighten);
    setDetectedBrand(null);
    setDetectedBrandConfidence(null);
    const hydratedImages = Array.isArray(data.images)
      ? data.images
      : Array.isArray(data.photos?.images)
        ? data.photos.images
        : [];
    const entries: SelectedPhotoEntry[] = hydratedImages
      .map((image: any, index: number) => {
        const originalUrl = String(image?.originalUrl ?? "").trim();
        if (!originalUrl) return null;
        const sourceOriginalUrl =
          String(image?.sourceOriginalUrl ?? data?.originalImageUrl ?? originalUrl).trim() ||
          originalUrl;
        const refinedUrl = String(image?.refinedUrl ?? data?.refinedImageUrl ?? data?.photos?.refinedUrl ?? "").trim();
        const activeImageVariant =
          data?.productPolish?.activeVariant === "polished" && refinedUrl ? "polished" : "original";
        const imageSource = (data?.imageSource ?? data?.photos?.imageSource ?? image?.imageSource ?? itemImageSourceFor(activeImageVariant, !!image?.cleanedUrl)) as ItemImageSource;
        const cutoutSourceKind =
          (data?.cutoutSourceKind ?? data?.photos?.cutoutSourceKind ?? image?.cutoutSourceKind ?? (image?.cleanedUrl ? activeImageVariant : null)) as ProductImageVariant | null;
        return {
          id: String(image?.id ?? `hydrated-${index + 1}`),
          traceId: String(data?.photoPipelineTraceId ?? image?.traceId ?? "").trim() || null,
          source: "library" as const,
          localUri: activeImageVariant === "polished" ? refinedUrl : originalUrl,
          originalUri: sourceOriginalUrl,
          normalizedOriginalUri: sourceOriginalUrl,
          refinedLocalUri: refinedUrl || null,
          refinedImageUrl: refinedUrl || null,
          activeImageVariant,
          photoHash: String(image?.photoHash ?? originalUrl),
          originalWidth: null,
          originalHeight: null,
          cleanedLocalUri: String(image?.cleanedUrl ?? "").trim() || null,
          normalizedLocalUri: null,
          hasTransparency: Boolean(image?.cleanedUrl),
          transparentPixelRatio: image?.cleanedUrl ? 1 : 0,
          maskUri: null,
          visualNormalization: data.visualNormalization ?? null,
          imageQuality: data.imageQuality ?? data.photos?.imageQuality ?? null,
          productPolish: data.productPolish ?? data.photos?.productPolish ?? null,
          imageSource,
          cutoutSourceKind,
          uploaded: {
            imageId: String(image?.id ?? `hydrated-${index + 1}`),
            itemId: String(data?.id ?? ""),
            traceId: String(data?.photoPipelineTraceId ?? image?.traceId ?? "").trim() || null,
            photoHash: String(image?.photoHash ?? originalUrl),
            originalUrl: sourceOriginalUrl,
            sourceOriginalUrl,
            primaryUrl: originalUrl,
            aiUrl: String(image?.aiUrl ?? "").trim() || null,
            cleanedUrl: String(image?.cleanedUrl ?? "").trim() || null,
            normalizedUrl: null,
            refinedUrl: refinedUrl || null,
            cleanedSource: image?.cleanedUrl ? "vision" : null,
            imageSource,
            cutoutSourceKind,
            visualNormalization: data.visualNormalization ?? null,
            imageQuality: data.imageQuality ?? data.photos?.imageQuality ?? null,
            productPolish: data.productPolish ?? data.photos?.productPolish ?? null,
          },
        } satisfies SelectedPhotoEntry;
      })
      .filter(Boolean) as SelectedPhotoEntry[];
    setSelectedPhotos(entries);
    const primaryHydrated =
      entries.find((entry, index) => hydratedImages[index]?.isPrimary) ?? entries[0] ?? null;
    setPrimaryPhotoId(primaryHydrated?.id ?? null);
  }, [
    clearPendingCutoutState,
    defaultRefineOptions.cleanupRadius,
    defaultRefineOptions.edgeTighten,
    defaultRefineOptions.feather,
    defaultRefineOptions.threshold,
  ]);

  const resetPhotoState = useCallback(() => {
    if (refineTimeoutRef.current) {
      clearTimeout(refineTimeoutRef.current);
      refineTimeoutRef.current = null;
    }
    setUploadingPhoto(false);
    setUploadError(null);
    setBgRemovalError(null);
    setPhotoUrl(null);
    setPhotoUri(null);
    setCleanedPhotoUrl(null);
    setServerCleanedUrl(null);
    setPendingPhotoUri(null);
    clearPendingCutoutState("reset-photo-state");
    setPendingPhotoWidth(null);
    setPendingVisualNormalization(null);
    setOriginalPickedPhotoUri(null);
    setPendingRefinedPhotoUri(null);
    setPendingRefinedImageUrl(null);
    setPendingActiveImageVariant("original");
    setSelectedStudioSource("original");
    setStudioSourceWarning(null);
    setPendingImageQuality(null);
    setPendingProductPolish(null);
    setProductPolishStatus("idle");
    setPhotoTraceId(null);
    resetPhotoPipelineDebug(null);
    setRefineValue(DEFAULT_REFINE_VALUE);
    setDebugThreshold(defaultRefineOptions.threshold);
    setDebugCleanupRadius(defaultRefineOptions.cleanupRadius);
    setDebugFeather(defaultRefineOptions.feather);
    setDebugEdgeTighten(defaultRefineOptions.edgeTighten);
    setRefiningCutout(false);
    setPendingPhotoHash(null);
    setDetectedBrand(null);
    setDetectedBrandConfidence(null);
    setUploadedPhotoRecord(null);
    setSelectedPhotos([]);
    setPrimaryPhotoId(null);
    lastCompletedRefineKeyRef.current = "";
    latestRefineRequestIdRef.current = 0;
    latestPhotoSelectionIdRef.current = 0;
    syncedPreviewUriRef.current = null;
  }, [
    clearPendingCutoutState,
    defaultRefineOptions.cleanupRadius,
    defaultRefineOptions.edgeTighten,
    defaultRefineOptions.feather,
    defaultRefineOptions.threshold,
    resetPhotoPipelineDebug,
  ]);

  const setPrimaryPhoto = useCallback((photoId: string) => {
    setPrimaryPhotoId(photoId);
  }, []);

  const movePhoto = useCallback((photoId: string, direction: -1 | 1) => {
    setSelectedPhotos((prev) => {
      const index = prev.findIndex((entry) => entry.id === photoId);
      if (index < 0) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [entry] = next.splice(index, 1);
      next.splice(nextIndex, 0, entry);
      return next;
    });
  }, []);

  const removeSelectedPhoto = useCallback((photoId: string) => {
    setSelectedPhotos((prev) => {
      const next = prev.filter((entry) => entry.id !== photoId);
      if (primaryPhotoId === photoId) {
        setPrimaryPhotoId(next[0]?.id ?? null);
      }
      return next;
    });
  }, [primaryPhotoId]);

  useEffect(() => {
    return () => {
      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
      }
    };
  }, []);

  const state = {
    uploadingPhoto,
    uploadError,
    bgRemovalError,
    photoUrl,
    photoUri,
    cleanedPhotoUrl,
    serverCleanedUrl,
    pendingPhotoUri,
    pendingCleanedPhotoUri,
    pendingNormalizedPreviewUri,
    pendingCutoutHasTransparency,
    pendingCutoutTransparencyRatio,
    pendingCutoutMaskUri,
    autofillCutoutUri,
    pendingPhotoWidth,
    pendingVisualNormalization,
    originalPickedPhotoUri,
    pendingRefinedPhotoUri,
    pendingRefinedImageUrl,
    pendingActiveImageVariant,
    selectedStudioSource,
    studioSourceWarning,
    pendingImageQuality,
    pendingProductPolish,
    productPolishStatus,
    photoTraceId,
    photoDebugSummary,
    refineValue,
    edgePolish,
    debugThreshold,
    debugCleanupRadius,
    debugFeather,
    debugEdgeTighten,
    refiningCutout,
    pendingPhotoHash,
    detectedBrand,
    detectedBrandConfidence,
    uploadedPhotoRecord,
    selectedPhotos,
    primaryPhotoId,
  };

  const derived = {
    previewPhotoUri,
    activePhotoUri,
    canRefineCutout,
  };

  const refs = {
    syncedPreviewUriRef,
    refineExecCountRef,
  };

  const actions = {
    setUploadingPhoto,
    setUploadError,
    setBgRemovalError,
    setPhotoUrl,
    setPhotoUri,
    setCleanedPhotoUrl,
    setServerCleanedUrl,
    setPendingPhotoUri,
    setPendingCleanedPhotoUri,
    setPendingNormalizedPreviewUri,
    setPendingCutoutHasTransparency,
    setPendingCutoutTransparencyRatio,
    setPendingCutoutMaskUri,
    setAutofillCutoutUri,
    setPendingPhotoWidth,
    setPendingVisualNormalization,
    setOriginalPickedPhotoUri,
    setPendingRefinedPhotoUri,
    setPendingRefinedImageUrl,
    setPendingActiveImageVariant,
    setPendingImageQuality,
    setPendingProductPolish,
    setProductPolishStatus,
    setPhotoTraceId,
    appendPhotoPipelineEvent,
    logPhotoPipelineEvent,
    setRefineValue,
    setEdgePolish,
    setDebugThreshold,
    setDebugCleanupRadius,
    setDebugFeather,
    setDebugEdgeTighten,
    setRefiningCutout,
    setPendingPhotoHash,
    setDetectedBrand,
    setDetectedBrandConfidence,
    setUploadedPhotoRecord,
    setPrimaryPhoto,
    movePhotoLeft: (photoId: string) => movePhoto(photoId, -1),
    movePhotoRight: (photoId: string) => movePhoto(photoId, 1),
    removeSelectedPhoto,
    handleRefineValueChange,
    handleRefineValueComplete,
    handleRefineReset,
    useOriginalPhoto,
    handleEdgePolishChange,
    handleDebugRefineThresholdChange,
    handleDebugRefineCleanupRadiusChange,
    handleDebugRefineFeatherChange,
    handleDebugRefineEdgeTightenChange,
    useOriginalProductPhoto: () => void applyProductPhotoVariant("original"),
    usePolishedProductPhoto: () => void applyProductPhotoVariant("polished"),
    pickPhoto,
    resolvePhotoFields,
    retryPhotoUpload,
    retryBackgroundRemoval,
    hydrateFromItem,
    resetPhotoState,
  };

  return { state, derived, refs, actions };
}
