import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Alert } from "react-native";

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
  isVisionBackgroundRemovalAvailable,
  removeBackground,
} from "../../bg/removeBackground";
import { detectBrandLogo } from "../../lib/detectBrandLogo";
import { db } from "../../lib/firebase";
import { uploadItemPhoto } from "../../lib/uploadImage";

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

  const lastCompletedRefineKeyRef = useRef("");
  const latestRefineRequestIdRef = useRef(0);
  const refineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPhotoSelectionIdRef = useRef(0);
  const latestUploadAttemptIdRef = useRef(0);
  const syncedPreviewUriRef = useRef<string | null>(null);
  const refineExecCountRef = useRef(0);

  const clearPendingCutoutState = useCallback((reason: string) => {
    void reason;
    setPendingCleanedPhotoUri(null);
    setPendingCutoutHasTransparency(false);
    setPendingCutoutTransparencyRatio(0);
    setPendingCutoutMaskUri(null);
    setAutofillCutoutUri(null);
  }, []);

  const commitPendingCutoutState = useCallback(
    (
      reason: string,
      payload: {
        cutoutUri: string | null;
        maskUri?: string | null;
        hasTransparency?: boolean;
        transparentPixelRatio?: number;
        updateAutofillCutout?: boolean;
      }
    ) => {
      const {
        cutoutUri,
        maskUri = null,
        hasTransparency = false,
        transparentPixelRatio = 0,
        updateAutofillCutout = true,
      } = payload;
      setPendingCleanedPhotoUri(cutoutUri);
      setPendingCutoutHasTransparency(hasTransparency);
      setPendingCutoutTransparencyRatio(transparentPixelRatio);
      setPendingCutoutMaskUri(maskUri);
      if (updateAutofillCutout) {
        setAutofillCutoutUri(cutoutUri);
      }
      void reason;
    },
    []
  );

  const previewPhotoUri =
    pendingCleanedPhotoUri ??
    pendingPhotoUri ??
    cleanedPhotoUrl ??
    serverCleanedUrl ??
    photoUrl ??
    photoUri ??
    null;

  const canRefineCutout =
    isVisionBackgroundRemovalAvailable() &&
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
        throw new Error("BG removal failed");
      }
      return output;
    },
    [estimateFileSizeBytes]
  );

  const retryBackgroundRemoval = useCallback(async () => {
    if (!originalPickedPhotoUri || !canRefineCutout) return;
    const options = getRefineOptions(refineValue);
    const requestId = latestRefineRequestIdRef.current + 1;
    latestRefineRequestIdRef.current = requestId;
    setRefiningCutout(true);
    setBgRemovalError(null);
    try {
      const cutout = await runBackgroundRemoval({
        inputUri: originalPickedPhotoUri,
        width: pendingPhotoWidth,
        height: null,
        options,
        tag: "retry",
      });
      if (requestId !== latestRefineRequestIdRef.current) {
        return;
      }
      commitPendingCutoutState("retry", {
        cutoutUri: cutout.uri,
        maskUri: cutout.maskUri,
        hasTransparency: cutout.hasTransparency,
        transparentPixelRatio: cutout.transparentPixelRatio,
      });
      setCleanedPhotoUrl(null);
      lastCompletedRefineKeyRef.current = getRefineRequestKey(
        originalPickedPhotoUri,
        refineValue
      );
    } catch (error) {
      setBgRemovalError("BG removal failed");
    } finally {
      if (requestId === latestRefineRequestIdRef.current) {
        setRefiningCutout(false);
      }
    }
  }, [
    canRefineCutout,
    commitPendingCutoutState,
    originalPickedPhotoUri,
    pendingPhotoWidth,
    refineValue,
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
        maskToAlpha: boolean;
      }
    ) => {
      if (!canRefineCutout || !originalPickedPhotoUri) return;
      const normalizedValue = Math.max(0, Math.min(1, value));
      const { threshold, cleanupRadius, feather, edgeTighten, maskToAlpha } =
        explicitOptions ?? getRefineOptions(normalizedValue);
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
          const cutout = await runBackgroundRemoval({
            inputUri: originalPickedPhotoUri,
            width: pendingPhotoWidth,
            height: null,
            options: { threshold, cleanupRadius, feather, edgeTighten, edgePolish, maskToAlpha },
            tag: "refine",
          });
          if (requestId !== latestRefineRequestIdRef.current) {
            return;
          }
          lastCompletedRefineKeyRef.current = requestKey;
          commitPendingCutoutState("refine", {
            cutoutUri: cutout.uri,
            maskUri: cutout.maskUri,
            hasTransparency: cutout.hasTransparency,
            transparentPixelRatio: cutout.transparentPixelRatio,
            updateAutofillCutout: immediate,
          });
          setCleanedPhotoUrl(null);
        } catch (e) {
          if (requestId === latestRefineRequestIdRef.current) {
            setBgRemovalError("BG removal failed");
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
      canRefineCutout,
      commitPendingCutoutState,
      extractionRef,
      originalPickedPhotoUri,
      pendingPhotoWidth,
      runBackgroundRemoval,
    ]
  );

  const handleRefineValueChange = useCallback((value: number) => {
    if (__DEV__) {
      void value;
    }
  }, []);

  const handleRefineValueComplete = useCallback(
    (value: number) => {
      setRefineValue(value);
      const options = getRefineOptions(value);
      setEdgePolish(options.edgePolish);
      setDebugThreshold(options.threshold);
      setDebugCleanupRadius(options.cleanupRadius);
      setDebugFeather(options.feather);
      setDebugEdgeTighten(options.edgeTighten);
      scheduleRefine(value, true, options);
    },
    [scheduleRefine]
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
              allowsEditing: true,
              aspect: [1, 1],
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 1,
              allowsEditing: true,
              aspect: [1, 1],
            });
      if (res.canceled || !res.assets[0]) return;

      const asset = res.assets[0];
      const nextPhotoHash = buildPhotoHash(asset);
      setPendingPhotoHash(nextPhotoHash);
      setUploadError(null);

      const extraction = extractionRef.current;
      if (!isEdit && extraction?.state?.draftPhotoHash === nextPhotoHash && extraction?.state?.draftItemId) {
        return;
      }

      const previousDraftId = !isEdit ? extraction?.state?.draftItemId ?? null : null;

      const previousSelectionId = latestPhotoSelectionIdRef.current + 1;
      latestPhotoSelectionIdRef.current = previousSelectionId;
      extraction?.actions?.prepareForNewPhoto?.();

      const originalUri = asset.uri;
      const normalized = await normalizeImageForCutout({
        uri: originalUri,
        width: asset.width,
        height: asset.height,
      });
      const normalizedUri = normalized.uri || originalUri;
      const effectiveWidth = normalized.width ?? asset.width ?? null;
      const effectiveHeight = normalized.height ?? asset.height ?? null;
      setOriginalPickedPhotoUri(normalizedUri);
      setPendingPhotoUri(normalizedUri);
      clearPendingCutoutState("pick-start");
      const initialOptions = getRefineOptions(DEFAULT_REFINE_VALUE);
      setDetectedBrand(null);
      setDetectedBrandConfidence(null);
      setBgRemovalError(null);

      const brandPromise = detectBrandLogo(originalUri).catch(() => null);
      let cutoutUri: string | null = null;
      let cutoutHasTransparency = false;
      let cutoutTransparencyRatio = 0;
      let cutoutMaskUri: string | null = null;
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
      } catch (error) {
        setBgRemovalError("BG removal failed");
        cutoutUri = null;
        cutoutHasTransparency = false;
        cutoutTransparencyRatio = 0;
        cutoutMaskUri = null;
      }
      if (previousSelectionId !== latestPhotoSelectionIdRef.current) {
        return;
      }
      const finalDisplayUri = cutoutUri || normalizedUri;
      void finalDisplayUri;
      void shortenUri;
      lastCompletedRefineKeyRef.current = getRefineRequestKey(
        normalizedUri,
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
      setPendingPhotoUri(normalizedUri);
      commitPendingCutoutState("pick", {
        cutoutUri,
        maskUri: cutoutMaskUri,
        hasTransparency: cutoutHasTransparency,
        transparentPixelRatio: cutoutTransparencyRatio,
      });
      setCleanedPhotoUrl(null);
      setServerCleanedUrl(null);
      extraction?.actions?.setIngestionStatus?.(isEdit ? null : "pending");
      setPendingPhotoWidth(effectiveWidth);

      const brandResult = await brandPromise;
      if (previousSelectionId !== latestPhotoSelectionIdRef.current) {
        return;
      }
      if (brandResult?.brand) {
        setDetectedBrand(brandResult.brand);
        setDetectedBrandConfidence(
          typeof brandResult.confidence === "number" ? brandResult.confidence : null
        );
        if (!draft.refs.userEditedKeysRef.current.has("brand")) {
          draft.actions.setBrand(brandResult.brand);
        }
      }

      if (!isEdit && uid) {
        if (previousDraftId) {
          void extraction?.actions?.cleanupDraftDoc?.(previousDraftId);
        }
      } else if (previousDraftId && uid) {
        void deleteDoc(doc(db, "users", uid, "items", previousDraftId)).catch(() => {});
      }
    } catch (e: any) {
      setUploadError(e?.message ?? "Failed to process selected photo.");
      setBgRemovalError(e?.message ?? "BG removal failed.");
      setUploadingPhoto(false);
      Alert.alert("Error", e?.message ?? "Failed to pick image");
    }
  }, [
    clearPendingCutoutState,
    commitPendingCutoutState,
    draft,
    extractionRef,
    isEdit,
    normalizeImageForCutout,
    runBackgroundRemoval,
    uid,
  ]);

  const resolvePhotoFields = useCallback(async (currentUid: string, itemId: string) => {
    const needsUpload =
      !!pendingPhotoUri &&
      (!photoUrl || syncedPreviewUriRef.current !== pendingPhotoUri);
    if (needsUpload) {
      const attemptId = beginUploadAttempt("resolve-photo-fields");
      try {
        const uploadedUrl = await uploadWithTimeout(
          uploadItemPhoto({
            uid: currentUid,
            itemId,
            localUri: pendingPhotoUri,
            cleanedLocalUri: pendingCleanedPhotoUri,
            originalWidth: pendingPhotoWidth,
          }),
          UPLOAD_TIMEOUT_MS,
          "Photo upload"
        );
        setPhotoUrl(uploadedUrl.primaryUrl);
        setCleanedPhotoUrl(uploadedUrl.cleanedUrl);
        syncedPreviewUriRef.current = pendingPhotoUri;
        setUploadError(null);
        return {
          photoUrl: uploadedUrl.primaryUrl,
          photoUri: null,
          cleanedPhotoUrl: uploadedUrl.cleanedUrl,
          cleanedUrl: serverCleanedUrl,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Photo upload failed. Please retry.";
        setUploadError(message);
        throw error;
      } finally {
        endUploadAttempt(attemptId, "resolve-photo-fields");
      }
    }
    if (!photoUrl && !photoUri) {
      return {
        photoUrl: null,
        photoUri: null,
        cleanedPhotoUrl,
        cleanedUrl: serverCleanedUrl,
      };
    }
    return {
      photoUrl,
      photoUri,
      cleanedPhotoUrl,
      cleanedUrl: serverCleanedUrl,
    };
  }, [
    beginUploadAttempt,
    cleanedPhotoUrl,
    endUploadAttempt,
    pendingCleanedPhotoUri,
    pendingPhotoUri,
    pendingPhotoWidth,
    photoUri,
    photoUrl,
    serverCleanedUrl,
  ]);

  const retryPhotoUpload = useCallback(async () => {
    const extraction = extractionRef.current;
    if (!uid || isEdit || !pendingPhotoUri || !extraction) return;
    const token = beginAsyncRequest();
    const attemptId = beginUploadAttempt("retry-upload");
    try {
      if (extraction.state.draftItemId) {
        const uploaded = await uploadWithTimeout(
          uploadItemPhoto({
            uid,
            itemId: extraction.state.draftItemId,
            localUri: pendingPhotoUri,
            cleanedLocalUri: pendingCleanedPhotoUri,
            originalWidth: pendingPhotoWidth,
          }),
          UPLOAD_TIMEOUT_MS,
          "Retry photo upload"
        );
        await updateDoc(doc(db, "users", uid, "items", extraction.state.draftItemId), {
          photoUrl: uploaded.primaryUrl,
          updatedAt: Date.now(),
          "photos.primaryUrl": uploaded.primaryUrl,
          "photos.urls": [uploaded.primaryUrl],
          ...(uploaded.cleanedUrl
            ? { "photos.cleanedPhotoUrl": uploaded.cleanedUrl }
            : {}),
          ingestion: {
            status: "pending",
            lastRunAt: Date.now(),
          },
        });
        setPhotoUrl(uploaded.primaryUrl);
        setCleanedPhotoUrl(uploaded.cleanedUrl);
        syncedPreviewUriRef.current = pendingPhotoUri;
      } else {
        const retryHash =
          pendingPhotoHash ??
          `${pendingPhotoUri}-${pendingPhotoWidth ?? "unknown-width"}`;
        extraction.actions.bumpAiRun();
        await uploadWithTimeout(
          extraction.actions.startDraftAutofill({
            photoHash: retryHash,
            localPreviewUri: pendingPhotoUri,
            cleanedLocalUri: pendingCleanedPhotoUri,
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
    pendingPhotoHash,
    pendingPhotoUri,
    pendingPhotoWidth,
    uid,
  ]);

  const hydrateFromItem = useCallback((data: any) => {
    setPhotoUrl(data.photoUrl ?? null);
    setPhotoUri(data.photoUri ?? null);
    setCleanedPhotoUrl(data.photos?.cleanedPhotoUrl ?? null);
    setServerCleanedUrl(data.photos?.cleanedUrl ?? null);
    setPendingPhotoUri(null);
    clearPendingCutoutState("hydrate-from-item");
    setPendingPhotoWidth(null);
    setOriginalPickedPhotoUri(null);
    setRefineValue(DEFAULT_REFINE_VALUE);
    setDebugThreshold(defaultRefineOptions.threshold);
    setDebugCleanupRadius(defaultRefineOptions.cleanupRadius);
    setDebugFeather(defaultRefineOptions.feather);
    setDebugEdgeTighten(defaultRefineOptions.edgeTighten);
    setDetectedBrand(null);
    setDetectedBrandConfidence(null);
  }, []);

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
    lastCompletedRefineKeyRef.current = "";
    latestRefineRequestIdRef.current = 0;
    latestPhotoSelectionIdRef.current = 0;
    syncedPreviewUriRef.current = null;
  }, []);

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
    pendingCutoutHasTransparency,
    pendingCutoutTransparencyRatio,
    pendingCutoutMaskUri,
    autofillCutoutUri,
    pendingPhotoWidth,
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
    setPendingCutoutHasTransparency,
    setPendingCutoutTransparencyRatio,
    setPendingCutoutMaskUri,
    setAutofillCutoutUri,
    setPendingPhotoWidth,
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
    handleRefineValueChange,
    handleRefineValueComplete,
    handleRefineReset,
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
