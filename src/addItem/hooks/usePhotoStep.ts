import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Alert, Platform } from "react-native";

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
import { db } from "../../lib/firebase";
import { uploadItemPhoto } from "../../lib/uploadImage";
import { analyzeCutoutVisualNormalization, type VisualNormalization } from "../../lib/visualNormalization";

type FileSystemCompat = typeof FileSystem & {
  cacheDirectory?: string | null;
  documentDirectory?: string | null;
};

const fileSystem = FileSystem as FileSystemCompat;

type UploadedPhotoRecord = {
  imageId: string;
  itemId: string;
  photoHash: string;
  originalUrl: string;
  primaryUrl: string;
  aiUrl: string | null;
  cleanedUrl: string | null;
  normalizedUrl: string | null;
  cleanedSource: "vision" | null;
  visualNormalization?: VisualNormalization | null;
};

type SelectedPhotoEntry = {
  id: string;
  source: "camera" | "library";
  localUri: string;
  originalUri: string;
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
  uploaded?: UploadedPhotoRecord | null;
};

type ResolvedPhotoFields = {
  originalUrl: string | null;
  photoUrl: string | null;
  photoUri: string | null;
  cleanedPhotoUrl: string | null;
  cleanedUrl: string | null;
  normalizedUrl: string | null;
  visualNormalization: VisualNormalization | null;
  imageUrls: string[];
  cleanedImageUrls: string[];
  images: {
    originalUrl: string;
    aiUrl?: string | null;
    cleanedUrl?: string | null;
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

function makeSelectedPhotoId() {
  return randomId();
}

function sanitizePhotoImageRecord(input: {
  originalUrl?: string | null;
  aiUrl?: string | null;
  cleanedUrl?: string | null;
  isPrimary: boolean;
}) {
  const originalUrl = String(input.originalUrl ?? "").trim();
  const aiUrl = String(input.aiUrl ?? "").trim();
  const cleanedUrl = String(input.cleanedUrl ?? "").trim();
  return {
    originalUrl,
    ...(aiUrl ? { aiUrl } : {}),
    ...(cleanedUrl ? { cleanedUrl } : {}),
    isPrimary: input.isPrimary,
  };
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function userFacingPhotoProcessingError(error: unknown) {
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
    lower.includes("couldn't prepare this photo")
  ) {
    return CUTOUT_ERROR_MESSAGE;
  }
  return message || PHOTO_PROCESSING_ERROR_MESSAGE;
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
      if (__DEV__) {
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
                uploaded: null,
              }
            : entry
        );
      });
    },
    [primaryPhotoId]
  );

  const previewPhotoUri =
    (pendingCutoutHasTransparency &&
    pendingCutoutTransparencyRatio >= MIN_USABLE_CUTOUT_TRANSPARENCY
      ? pendingNormalizedPreviewUri ?? pendingCleanedPhotoUri
      : null) ??
    pendingPhotoUri ??
    cleanedPhotoUrl ??
    serverCleanedUrl ??
    photoUrl ??
    photoUri ??
    null;

  const canRefineCutout =
    isBackgroundRemovalAvailable() &&
    !!originalPickedPhotoUri;

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
      setPendingPhotoHash(null);
      setOriginalPickedPhotoUri(null);
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

    setPendingPhotoHash(entry.photoHash);
    setOriginalPickedPhotoUri(entry.localUri);
    setPendingPhotoUri(entry.localUri);
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
  }, [commitPendingCutoutState]);

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
      if (__DEV__) {
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
    }) => {
      const { inputUri, width, height, options, tag } = params;
      const startedAt = Date.now();
      void width;
      void height;
      void options;
      void tag;
      await estimateFileSizeBytes(inputUri);
      const output = await uploadWithTimeout(
        removeBackground(inputUri, options),
        CUTOUT_TIMEOUT_MS,
        "Background removal"
      );
      const durationMs = Date.now() - startedAt;
      const outputUri = output.uri;
      void durationMs;
      await estimateFileSizeBytes(outputUri);
      if (!outputUri || outputUri === inputUri) {
        throw new Error(CUTOUT_ERROR_MESSAGE);
      }
      return output;
    },
    [estimateFileSizeBytes]
  );

  const retryBackgroundRemoval = useCallback(async () => {
    if (!originalPickedPhotoUri || !canRefineCutout) return;
    const options = currentDebugRefineOptions();
    const requestId = latestRefineRequestIdRef.current + 1;
    latestRefineRequestIdRef.current = requestId;
    setRefiningCutout(true);
    setBgRemovalError(null);
    try {
      const localCutoutInputUri = await prepareImageUriForCutout(originalPickedPhotoUri);
      const cutout = await runBackgroundRemoval({
        inputUri: localCutoutInputUri,
        width: pendingPhotoWidth,
        height: null,
        options,
        tag: "retry",
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
        setBgRemovalError(CUTOUT_ERROR_MESSAGE);
      }
      lastCompletedRefineKeyRef.current = getRefineRequestKey(
        localCutoutInputUri,
        refineValue
      );
    } catch (error) {
      setBgRemovalError(userFacingPhotoProcessingError(error));
    } finally {
      if (requestId === latestRefineRequestIdRef.current) {
        setRefiningCutout(false);
      }
    }
  }, [
    buildNormalizedPreviewCutout,
    canRefineCutout,
    commitPendingCutoutState,
    commitPrimaryPhotoCutout,
    currentDebugRefineOptions,
    originalPickedPhotoUri,
    pendingCleanedPhotoUri,
    pendingPhotoWidth,
    prepareImageUriForCutout,
    refineValue,
    analyzeCurrentVisualNormalization,
    runBackgroundRemoval,
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
      if (!canRefineCutout || !originalPickedPhotoUri) return;
      const normalizedValue = Math.max(0, Math.min(1, value));
      const {
        threshold,
        cleanupRadius,
        feather,
        edgeTighten,
        edgePolish: scheduledEdgePolish,
        maskToAlpha,
      } = explicitOptions ?? getRefineOptions(normalizedValue);
      const requestKey = getRefineRequestKey(originalPickedPhotoUri, normalizedValue);
      if (!explicitOptions && lastCompletedRefineKeyRef.current === requestKey) return;

      const requestId = latestRefineRequestIdRef.current + 1;
      latestRefineRequestIdRef.current = requestId;
      const execute = async () => {
        try {
          refineExecCountRef.current += 1;
          setRefiningCutout(true);
          extractionRef.current?.actions?.setAutofillRunningState?.();
          setBgRemovalError(null);
          const localCutoutInputUri = await prepareImageUriForCutout(originalPickedPhotoUri);
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
          lastCompletedRefineKeyRef.current = requestKey;
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
            setBgRemovalError(CUTOUT_ERROR_MESSAGE);
          }
        } catch (error) {
          if (requestId === latestRefineRequestIdRef.current) {
            setBgRemovalError(userFacingPhotoProcessingError(error));
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
      buildNormalizedPreviewCutout,
      canRefineCutout,
      commitPendingCutoutState,
      commitPrimaryPhotoCutout,
      extractionRef,
      originalPickedPhotoUri,
      pendingCleanedPhotoUri,
      pendingPhotoWidth,
      prepareImageUriForCutout,
      analyzeCurrentVisualNormalization,
      runBackgroundRemoval,
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
              uploaded: null,
            }
          : entry
      );
    });
  }, [commitPendingCutoutState, primaryPhotoId]);

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

  const processPickedAsset = useCallback(
    async (
      asset: ImagePicker.ImagePickerAsset,
      source: "library" | "camera",
      selectionId: number
    ): Promise<SelectedPhotoEntry> => {
      const originalUri = asset.uri;
      const nextPhotoHash = buildPhotoHash(asset);
      const normalized = await normalizeImageForCutout({
        uri: originalUri,
        width: asset.width,
        height: asset.height,
      });
      const normalizedUri = normalized.uri || originalUri;
      const effectiveWidth = normalized.width ?? asset.width ?? null;
      const effectiveHeight = normalized.height ?? asset.height ?? null;
      const initialOptions = getRefineOptions(DEFAULT_REFINE_VALUE);

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
          inputUri: normalizedUri,
          width: effectiveWidth,
          height: effectiveHeight,
          options: initialOptions,
          tag: "pick",
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
        id: makeSelectedPhotoId(),
        source,
        localUri: normalizedUri,
        originalUri,
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
        uploaded: null,
      };
    },
    [
      analyzeCurrentVisualNormalization,
      buildNormalizedPreviewCutout,
      normalizeImageForCutout,
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
      clearPendingCutoutState("pick-start");
      void shortenUri;

      const nextEntries: SelectedPhotoEntry[] = [];
      for (const asset of res.assets) {
        const entry = await processPickedAsset(asset, source, previousSelectionId);
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
        return;
      }
      if (!nextEntries.length) {
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

      if (!isEdit && uid) {
        if (previousDraftId) {
          void extraction?.actions?.cleanupDraftDoc?.(previousDraftId);
        }
      } else if (previousDraftId && uid) {
        void deleteDoc(doc(db, "users", uid, "items", previousDraftId)).catch(() => {});
      }
    } catch (e: any) {
      const message = userFacingPhotoProcessingError(e);
      setUploadError(message);
      setBgRemovalError(message);
      setUploadingPhoto(false);
      Alert.alert("Error", message);
    }
  }, [
    clearPendingCutoutState,
    extractionRef,
    isEdit,
    processPickedAsset,
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
                source: "library" as const,
                localUri: pendingPhotoUri,
                originalUri: originalPickedPhotoUri ?? pendingPhotoUri,
                photoHash: pendingPhotoHash ?? `${pendingPhotoUri}-${pendingPhotoWidth ?? "w"}`,
                originalWidth: pendingPhotoWidth,
                originalHeight: null,
                cleanedLocalUri: pendingCleanedPhotoUri,
                normalizedLocalUri: pendingNormalizedPreviewUri,
                hasTransparency: pendingCutoutHasTransparency,
                transparentPixelRatio: pendingCutoutTransparencyRatio,
                maskUri: pendingCutoutMaskUri,
                visualNormalization: pendingVisualNormalization,
                uploaded: uploadedPhotoRecord,
              },
            ]
          : [];

    if (!activeEntries.length) {
      return {
        originalUrl: photoUrl,
        photoUrl,
        photoUri,
        cleanedPhotoUrl,
        cleanedUrl: serverCleanedUrl,
        normalizedUrl: pendingNormalizedPreviewUri,
        visualNormalization: pendingVisualNormalization,
        imageUrls: photoUrl ? [photoUrl] : [],
        cleanedImageUrls: serverCleanedUrl ? [serverCleanedUrl] : [],
        images: photoUrl
          ? [sanitizePhotoImageRecord({ originalUrl: photoUrl, aiUrl: null, cleanedUrl: serverCleanedUrl, isPrimary: true })]
          : [],
      };
    }

    const primaryId = primaryPhotoId ?? activeEntries[0]?.id ?? null;
    const canReuseUploadedEntry = (entry: SelectedPhotoEntry) =>
      !!entry.uploaded &&
      (entry.uploaded.itemId === itemId || isRemoteImageUri(entry.localUri)) &&
      entry.uploaded.photoHash === entry.photoHash;

    const reusableUpload = activeEntries.every(canReuseUploadedEntry);

    let uploadedEntries = activeEntries;
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
                saveNormalizedAsCleaned: entry.id === primaryId,
                originalWidth: entry.originalWidth,
                originalHeight: entry.originalHeight,
              }),
              UPLOAD_TIMEOUT_MS,
              "Photo upload"
            );
            return {
              ...entry,
              uploaded: {
                imageId: entry.id,
                itemId,
                photoHash: entry.photoHash,
                originalUrl: uploadedUrl.originalUrl,
                primaryUrl: uploadedUrl.primaryUrl,
                aiUrl: uploadedUrl.aiUrl,
                cleanedUrl: uploadedUrl.cleanedUrl,
                normalizedUrl: uploadedUrl.normalizedUrl,
                cleanedSource: uploadedUrl.cleanedUrl ? "vision" : null,
                visualNormalization: entry.visualNormalization,
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
    setPendingVisualNormalization(primaryEntry?.visualNormalization ?? null);

    return {
      originalUrl: primaryUpload?.originalUrl ?? null,
      photoUrl: primaryUpload?.primaryUrl ?? null,
      photoUri: null,
      cleanedPhotoUrl: primaryUpload?.cleanedUrl ?? null,
      cleanedUrl: primaryUpload?.cleanedUrl ?? null,
      normalizedUrl: primaryUpload?.normalizedUrl ?? null,
      visualNormalization: primaryEntry?.visualNormalization ?? null,
      imageUrls: sortedUploads
        .map((entry) => entry.uploaded?.primaryUrl ?? "")
        .filter(Boolean),
      cleanedImageUrls: sortedUploads
        .map((entry) => entry.uploaded?.cleanedUrl ?? "")
        .filter(Boolean),
      images: sortedUploads
        .map((entry) =>
          sanitizePhotoImageRecord({
            originalUrl: entry.uploaded?.primaryUrl ?? "",
            aiUrl: entry.uploaded?.aiUrl ?? null,
            cleanedUrl: entry.uploaded?.cleanedUrl ?? null,
            isPrimary: entry.id === (primaryEntry?.id ?? ""),
          })
        )
        .filter((entry) => entry.originalUrl),
    };
  }, [
    beginUploadAttempt,
    cleanedPhotoUrl,
    endUploadAttempt,
    originalPickedPhotoUri,
    pendingCutoutHasTransparency,
    pendingCutoutMaskUri,
    pendingCutoutTransparencyRatio,
    pendingCleanedPhotoUri,
    pendingNormalizedPreviewUri,
    pendingPhotoHash,
    pendingPhotoUri,
    pendingPhotoWidth,
    pendingVisualNormalization,
    photoUri,
    photoUrl,
    primaryPhotoId,
    selectedPhotos,
    serverCleanedUrl,
    uploadedPhotoRecord,
  ]);

  const retryPhotoUpload = useCallback(async () => {
    const extraction = extractionRef.current;
    if (!uid || isEdit || !pendingPhotoUri || !extraction) return;
    const token = beginAsyncRequest();
    const attemptId = beginUploadAttempt("retry-upload");
    try {
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
            saveNormalizedAsCleaned: true,
            originalWidth: pendingPhotoWidth,
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
          images: [
            sanitizePhotoImageRecord({
              originalUrl: uploaded.primaryUrl,
              aiUrl: uploaded.aiUrl,
              cleanedUrl: uploaded.cleanedUrl,
              isPrimary: true,
            }),
          ],
          updatedAt: Date.now(),
          "photos.originalUrl": uploaded.originalUrl,
          "photos.primaryUrl": uploaded.primaryUrl,
          "photos.aiUrl": uploaded.aiUrl,
          "photos.urls": [uploaded.primaryUrl],
          "photos.images": [
            sanitizePhotoImageRecord({
              originalUrl: uploaded.primaryUrl,
              aiUrl: uploaded.aiUrl,
              cleanedUrl: uploaded.cleanedUrl,
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
            photoHash: pendingPhotoHash,
            originalUrl: uploaded.originalUrl,
            primaryUrl: uploaded.primaryUrl,
            aiUrl: uploaded.aiUrl,
            cleanedUrl: uploaded.cleanedUrl,
            normalizedUrl: uploaded.normalizedUrl,
            cleanedSource: uploaded.cleanedUrl ? "vision" : null,
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
      const message =
        error instanceof Error ? error.message : "Photo upload failed. Please retry.";
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
    endUploadAttempt,
    extractionRef,
    isEdit,
    pendingCleanedPhotoUri,
    pendingNormalizedPreviewUri,
    pendingPhotoHash,
    pendingPhotoUri,
    pendingPhotoWidth,
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
        return {
          id: String(image?.id ?? `hydrated-${index + 1}`),
          source: "library" as const,
          localUri: originalUrl,
          originalUri: originalUrl,
          photoHash: String(image?.photoHash ?? originalUrl),
          originalWidth: null,
          originalHeight: null,
          cleanedLocalUri: String(image?.cleanedUrl ?? "").trim() || null,
          normalizedLocalUri: null,
          hasTransparency: Boolean(image?.cleanedUrl),
          transparentPixelRatio: image?.cleanedUrl ? 1 : 0,
          maskUri: null,
          visualNormalization: data.visualNormalization ?? null,
          uploaded: {
            imageId: String(image?.id ?? `hydrated-${index + 1}`),
            itemId: String(data?.id ?? ""),
            photoHash: String(image?.photoHash ?? originalUrl),
            originalUrl,
            primaryUrl: originalUrl,
            aiUrl: String(image?.aiUrl ?? "").trim() || null,
            cleanedUrl: String(image?.cleanedUrl ?? "").trim() || null,
            normalizedUrl: null,
            cleanedSource: image?.cleanedUrl ? "vision" : null,
            visualNormalization: data.visualNormalization ?? null,
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
    pickPhoto,
    resolvePhotoFields,
    retryPhotoUpload,
    retryBackgroundRemoval,
    hydrateFromItem,
    resetPhotoState,
  };

  return { state, derived, refs, actions };
}
