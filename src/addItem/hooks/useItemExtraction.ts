import { InteractionManager } from "react-native";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";

import {
  AiStatus,
  AUTOFILL_DEBOUNCE_MS,
  AUTOFILL_TIMEOUT_MS,
  AutofillSource,
  buildUsefulItemName,
  hasTwoLegRegionCue,
  isWeakItemName,
  nearestColorLabel,
  norm,
  normColor,
  normalizeDisplayColorToDefault,
  normalizeColorList,
  normalizeIngestionStatus,
  parseHexRgb,
  UPLOAD_TIMEOUT_MS,
  uploadWithTimeout,
} from "../controllerShared";
import { db } from "../../lib/firebase";
import { normalizeCategoryForStorage } from "../../lib/items";
import { photoPipelineDuration, photoPipelineNow, safeErrorData } from "../../lib/photoPipelineLogger";
import {
  Category,
  isValidCategorySubCategory,
} from "../../shared/wardrobeTaxonomy";
import { uploadItemPhoto } from "../../lib/uploadImage";
import type { ProductImageQuality, ProductPolishMetadata } from "../../types/ProductImageQuality";

const UNBRANDED_LABEL = "Unbranded";
const unknownBrandValues = new Set([
  "",
  "unknown",
  "n/a",
  "na",
  "none",
  "no brand",
  "not found",
  "unidentified",
  "unreadable",
]);

function cleanDetectedBrand(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanupLower(value: unknown) {
  return cleanupString(value).toLowerCase();
}

function cleanupRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanupHasText(value: unknown) {
  return cleanupString(value).length > 0;
}

function cleanupRecordsHaveImage(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (cleanupHasText(entry)) return true;
    const record = cleanupRecord(entry);
    return Object.keys(record).some((key) => {
      const lowerKey = key.toLowerCase();
      return (lowerKey.includes("url") || lowerKey.includes("uri")) && cleanupHasText(record[key]);
    });
  });
}

const CLEANUP_IMAGE_URL_KEY_PATTERN =
  /(?:image|photo|thumb|thumbnail|crop|refined|cleaned|original|primary|preview|normalized|layout).*?(?:url|uri)|(?:url|uri).*?(?:image|photo|thumb|thumbnail|crop|refined|cleaned|original|primary|preview|normalized|layout)/i;

function cleanupHasImageUrlLikeValue(value: unknown, keyHint = ""): boolean {
  const imageKey = CLEANUP_IMAGE_URL_KEY_PATTERN.test(keyHint);
  if (imageKey && cleanupHasText(value)) return true;

  if (Array.isArray(value)) {
    if (imageKey && value.some(cleanupHasText)) return true;
    return value.some((entry) => cleanupHasImageUrlLikeValue(entry));
  }

  const record = cleanupRecord(value);
  return Object.entries(record).some(([key, entry]) => cleanupHasImageUrlLikeValue(entry, key));
}

function cleanupHasProductOrSourceUrl(data: any) {
  const product = cleanupRecord(data?.product);
  const metadata = cleanupRecord(data?.metadata);
  const linkMetadata = cleanupRecord(data?.linkMetadata);
  const ingestionSource = cleanupRecord(data?.ingestionSource);
  const source = cleanupRecord(data?.source);
  return [
    data?.sourceUrl,
    data?.productUrl,
    data?.productPageUrl,
    data?.purchaseUrl,
    data?.affiliateUrl,
    data?.canonicalUrl,
    data?.url,
    product.url,
    product.sourceUrl,
    product.productUrl,
    source.url,
    source.sourceUrl,
    source.productUrl,
    metadata.sourceUrl,
    metadata.productUrl,
    metadata.canonicalUrl,
    metadata.url,
    linkMetadata.sourceUrl,
    linkMetadata.productUrl,
    linkMetadata.canonicalUrl,
    linkMetadata.url,
    ingestionSource.sourceUrl,
    ingestionSource.productUrl,
  ].some(cleanupHasText);
}

function isImmediateCleanupSafeEmptyDraft(data: any) {
  if (data?.isDraft !== true) return false;
  const draftState = cleanupLower(data?.draftState);
  const lifecycle = cleanupLower(data?.itemLifecycleStatus);
  const ingestion = cleanupRecord(data?.ingestion);
  const nestedIngestionStatus = cleanupString(ingestion.status);
  const photos = cleanupRecord(data?.photos);
  const productPolish = cleanupRecord(data?.productPolish);
  const photosProductPolish = cleanupRecord(photos.productPolish);
  const outfitExtraction = cleanupRecord(data?.outfitExtraction);
  const blocks = [
    draftState && draftState !== "draft",
    lifecycle && lifecycle !== "draft",
    cleanupHasText(data?.ingestionStatus),
    cleanupHasText(nestedIngestionStatus),
    Object.keys(ingestion).some((key) => cleanupHasText(ingestion[key])),
    cleanupHasText(data?.imageUrl),
    cleanupHasText(data?.imageUri),
    cleanupHasText(data?.photoUrl),
    cleanupHasText(data?.photoUri),
    cleanupHasText(data?.cleanedImageUrl),
    cleanupHasText(data?.originalImageUrl),
    cleanupHasText(data?.normalizedImageUrl),
    cleanupHasText(data?.refinedImageUrl),
    cleanupHasText(data?.layoutCropUrl),
    cleanupHasText(data?.originalCropUrl),
    cleanupHasText(data?.cropImageUrl),
    cleanupHasText(data?.primaryImageUrl),
    cleanupHasText(data?.thumbnailUrl),
    cleanupHasText(data?.thumbUrl),
    cleanupHasText(data?.sourceOriginalUrl),
    cleanupHasText(productPolish.refinedImageUrl),
    cleanupHasText(photos.primaryUrl),
    cleanupHasText(photos.cleanedUrl),
    cleanupHasText(photos.cleanedPhotoUrl),
    cleanupHasText(photos.cleanedThumbUrl),
    cleanupHasText(photos.originalUrl),
    cleanupHasText(photos.normalizedUrl),
    cleanupHasText(photos.normalizedImageUrl),
    cleanupHasText(photos.refinedUrl),
    cleanupHasText(photos.layoutCropUrl),
    cleanupHasText(photos.originalCropUrl),
    cleanupHasText(photos.previewUrl),
    cleanupHasText(photos.croppedUrl),
    cleanupHasText(photos.thumbnailUrl),
    cleanupHasText(photos.aiUrl),
    cleanupHasText(photos.thumbUrl),
    cleanupHasText(photosProductPolish.refinedImageUrl),
    cleanupHasText(outfitExtraction.imageUrl),
    cleanupHasText(outfitExtraction.cleanedImageUrl),
    cleanupHasText(outfitExtraction.normalizedImageUrl),
    cleanupHasText(outfitExtraction.layoutCropUrl),
    cleanupHasText(outfitExtraction.originalCropUrl),
    cleanupHasText(outfitExtraction.cropImageUrl),
    cleanupHasProductOrSourceUrl(data),
    cleanupHasText(data?.embeddingHash),
    data?.embeddingVector != null,
    Array.isArray(data?.imageUrls) && data.imageUrls.some(cleanupHasText),
    Array.isArray(data?.cleanedImageUrls) && data.cleanedImageUrls.some(cleanupHasText),
    Array.isArray(data?.secondaryImageUrls) && data.secondaryImageUrls.some(cleanupHasText),
    cleanupRecordsHaveImage(data?.images),
    cleanupRecordsHaveImage(photos.images),
    Array.isArray(photos.urls) && photos.urls.some(cleanupHasText),
    Array.isArray(photos.imageUrls) && photos.imageUrls.some(cleanupHasText),
    Array.isArray(photos.cleanedImageUrls) && photos.cleanedImageUrls.some(cleanupHasText),
    cleanupHasImageUrlLikeValue(data),
  ];
  return !blocks.some(Boolean);
}

function brandConfidenceFor(data: any) {
  const confidence = Number(
    data?.brandConfidence ??
      data?.confidence?.brand ??
      data?.confidence?.brandConfidence ??
      Number.NaN
  );
  return Number.isFinite(confidence) ? confidence : null;
}

function confidentBrandFor(data: any) {
  const brand = cleanDetectedBrand(data?.brand);
  const normalized = brand.toLowerCase();
  if (unknownBrandValues.has(normalized)) return "";
  const confidence = brandConfidenceFor(data);
  if (confidence != null && confidence > 0 && confidence < 0.55) return "";
  return brand;
}

function extractionFieldNamesFor(data: any) {
  const fields: string[] = [];
  const add = (field: string, present: boolean) => {
    if (present && !fields.includes(field)) fields.push(field);
  };
  add("brand", !!confidentBrandFor(data));
  add("name", !!norm(data?.name) && !isWeakItemName(norm(data?.name)));
  add("category", !!normalizeCategoryForStorage(data?.category));
  add("subcategory", !!norm(data?.subCategory));
  add("color", normalizeColorList(data?.colors).length > 0 || !!norm(data?.primaryColor));
  add("material", !!norm(data?.material));
  add("fit", !!norm(data?.fit));
  add("pattern", !!norm(data?.pattern));
  add("notes", !!norm(data?.notes));
  return fields;
}

export function useItemExtraction({
  uid,
  isEdit,
  draft,
  photo,
  beginAsyncRequest,
  isActiveRequest,
  createSessionRef,
}: {
  uid: string | null;
  isEdit: boolean;
  draft: any;
  photo: any;
  beginAsyncRequest: () => { sessionId: string; requestId: number };
  isActiveRequest: (token: { sessionId: string; requestId: number }) => boolean;
  createSessionRef: MutableRefObject<{
    sessionId: string;
    requestId: number;
    draftId: string | null;
    unsub: null | (() => void);
  }>;
}) {
  const verboseAutofillLog = (...args: unknown[]) => {
    void args;
  };
  const humanizeAutofillLabel = (value: string | null | undefined) =>
    String(value ?? "")
      .trim()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  const userFacingAutofillError = (error: unknown, fallback: string) => {
    const raw = error instanceof Error ? error.message : String(error ?? "");
    const lower = raw.toLowerCase();
    if (lower.includes("timed out") || lower.includes("timeout")) {
      return "AI autofill took too long. You can keep editing manually or try again.";
    }
    if (lower.includes("network") || lower.includes("unavailable") || lower.includes("offline")) {
      return "AI autofill couldn’t stay connected. Check your connection and try again.";
    }
    if (lower.includes("upload") || lower.includes("storage")) {
      return "Photo upload failed. Please try again.";
    }
    return fallback;
  };
  const [draftItemId, setDraftItemId] = useState<string | null>(null);
  const [draftPhotoHash, setDraftPhotoHash] = useState<string | null>(null);
  const [autofillKick, setAutofillKick] = useState(0);
  const [ingestionStatus, setIngestionStatus] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiStage, setAiStage] = useState<"Color" | "Category" | "Details" | null>(null);
  const [autofillStatus, setAutofillStatus] = useState<string>("AI idle");
  const [isAutofillRunning, setIsAutofillRunning] = useState(false);
  const [lastAutofillSummary, setLastAutofillSummary] = useState<string>("");
  const [autofillError, setAutofillError] = useState<string | null>(null);
  const [extractionPartialSuccess, setExtractionPartialSuccess] = useState(false);
  const [aiPrediction, setAiPrediction] = useState<{
    category: string | null;
    colors: string[];
    crop?: { x?: number; y?: number; w?: number; h?: number } | null;
  }>({
    category: null,
    colors: [],
    crop: null,
  });
  const [finalPrediction, setFinalPrediction] = useState<{
    category: string | null;
    colors: string[];
    crop?: { x?: number; y?: number; w?: number; h?: number } | null;
  }>({
    category: null,
    colors: [],
    crop: null,
  });
  const [aiDebugRunId, setAiDebugRunId] = useState<number>(0);
  const [aiDebugInputUri, setAiDebugInputUri] = useState<string>("");
  const [aiDebugInputSource, setAiDebugInputSource] = useState<"cutout" | "original" | "">("");
  const [aiDebugAspectRatio, setAiDebugAspectRatio] = useState<number | null>(null);
  const [aiDebugDominantRgb, setAiDebugDominantRgb] = useState<string>("");
  const [aiDebugCorrectedCategory, setAiDebugCorrectedCategory] = useState<string>("");
  const [aiDebugRawPayload, setAiDebugRawPayload] = useState<string>("");
  const [aiPattern, setAiPattern] = useState<string | null>(null);
  const [aiMaterial, setAiMaterial] = useState<string | null>(null);
  const [aiFit, setAiFit] = useState<string | null>(null);
  const [aiOccasionTags, setAiOccasionTags] = useState<string[]>([]);
  const [aiSeasonTags, setAiSeasonTags] = useState<string[]>([]);
  const [aiColorNeedsReview, setAiColorNeedsReview] = useState(false);

  const aiRunIdRef = useRef(0);
  const lastAutofillStartedHashRef = useRef<string | null>(null);
  const scheduledAutofillHashRef = useRef<string | null>(null);
  const aiDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiInteractionTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const aiCacheRef = useRef(new Map<string, { at: number; summary: string }>());
  const aiRunMetaRef = useRef(
    new Map<number, { source: AutofillSource; inputUri: string; photoHash: string }>()
  );
  const aiCommittedRef = useRef<{
    source: AutofillSource;
    category: string | null;
    categoryConfidence: number;
    colors: string[];
    colorsConfidence: number;
  } | null>(null);
  const aiLockedValuesRef = useRef<{
    runId: number;
    category?: Category;
    subCategory?: string;
    colors?: string[];
    brand?: string;
    pattern?: string;
    material?: string;
  }>({ runId: 0 });
  const draftSubscriptionRef = useRef<(() => void) | null>(null);
  const isSubscribedRef = useRef(false);
  const subscriptionKeyRef = useRef("");
  const lastDraftFingerprintRef = useRef("");
  const lastDuplicateSnapshotSignatureRef = useRef("");
  const hashLifecycleRef = useRef(
    new Map<string, { status: string | null; draftId: string | null }>()
  );
  const terminalFailedHashesRef = useRef(new Set<string>());
  const snapshotUpdateCountRef = useRef(0);
  const draftCreatePromiseRef = useRef<Promise<string | null> | null>(null);
  const activeAutofillHashRef = useRef<string | null>(null);
  const extractionStartedAtByHashRef = useRef(new Map<string, number>());
  const autofillStatusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutofillStatusRef = useRef<string | null>(null);
  const isFinalizingRef = useRef(false);

  const setAutofillStatusThrottled = useCallback((value: string) => {
    pendingAutofillStatusRef.current = value;
    if (autofillStatusDebounceRef.current) return;
    autofillStatusDebounceRef.current = setTimeout(() => {
      autofillStatusDebounceRef.current = null;
      if (pendingAutofillStatusRef.current != null) {
        setAutofillStatus(pendingAutofillStatusRef.current);
      }
    }, 180);
  }, []);

  const stopDraftSubscription = useCallback(() => {
    const unsubscribe = createSessionRef.current.unsub ?? draftSubscriptionRef.current;
    if (unsubscribe) {
      unsubscribe();
      createSessionRef.current.unsub = null;
      draftSubscriptionRef.current = null;
      isSubscribedRef.current = false;
      subscriptionKeyRef.current = "";
    }
  }, [createSessionRef]);

  const cleanupDraftDoc = useCallback(
    async (itemId: string | null) => {
      if (!uid || !itemId || isEdit) return;
      try {
        const draftRef = doc(db, "users", uid, "items", itemId);
        const snap = await getDoc(draftRef);
        if (!snap.exists()) return;
        const data = snap.data();
        if (!isImmediateCleanupSafeEmptyDraft(data)) {
          if (__DEV__) {
            console.log("[AddItemLifecycle] cleanupDraftDoc:skip-unsafe", {
              itemId,
              draftState: data?.draftState ?? null,
              itemLifecycleStatus: data?.itemLifecycleStatus ?? null,
              ingestionStatus: data?.ingestion?.status ?? data?.ingestionStatus ?? null,
              hasPhoto: Boolean(data?.photoUrl ?? data?.photos?.primaryUrl ?? data?.cleanedImageUrl ?? data?.originalImageUrl),
            });
          }
          return;
        }
        await deleteDoc(draftRef);
      } catch {
      }
    },
    [isEdit, uid]
  );

  const cleanupDraftDocIfInactive = useCallback(
    (itemId: string | null) => {
      if (!itemId) return;
      if (createSessionRef.current.draftId === itemId) return;
      void cleanupDraftDoc(itemId);
    },
    [cleanupDraftDoc, createSessionRef]
  );

  const ensureDraftDocExists = useCallback(async () => {
    if (!uid || isEdit) return null;
    const existingDraftId = createSessionRef.current.draftId ?? draftItemId;
    if (existingDraftId) {
      return existingDraftId;
    }
    if (draftCreatePromiseRef.current) {
      return draftCreatePromiseRef.current;
    }
    // TODO: Consider using separate users/{uid}/itemDrafts collection instead of users/{uid}/items for transient drafts.
    const draftRef = doc(collection(db, "users", uid, "items"));
    const now = Date.now();
    const payload = {
      createdAt: now,
      updatedAt: now,
      status: "AVAILABLE",
      category: Category.TOP,
      wearCountSinceWash: 0,
      lastWornDate: null,
      lastWashedDate: null,
        lastWashedAt: null,
        isDraft: true,
        draftState: "draft",
    };
    const createPromise = (async () => {
      await setDoc(draftRef, payload, { merge: true });
      setDraftItemId(draftRef.id);
      createSessionRef.current.draftId = draftRef.id;
      return draftRef.id;
    })();
    draftCreatePromiseRef.current = createPromise;
    try {
      return await createPromise;
    } finally {
      if (draftCreatePromiseRef.current === createPromise) {
        draftCreatePromiseRef.current = null;
      }
    }
  }, [createSessionRef, draftItemId, isEdit, uid]);

  const resetDraftTracking = useCallback((options?: { preserveDraftId?: boolean; preserveActiveAutofillHash?: boolean }) => {
    stopDraftSubscription();
    const preserveDraftId = options?.preserveDraftId === true;
    if (!preserveDraftId) {
      setDraftItemId(null);
      createSessionRef.current.draftId = null;
    } else {
      const stableDraftId = createSessionRef.current.draftId ?? draftItemId ?? null;
      if (stableDraftId) {
        setDraftItemId(stableDraftId);
        createSessionRef.current.draftId = stableDraftId;
      }
    }
    setDraftPhotoHash(null);
    if (draftPhotoHash) {
      hashLifecycleRef.current.delete(draftPhotoHash);
      terminalFailedHashesRef.current.delete(draftPhotoHash);
    }
    if (!options?.preserveActiveAutofillHash) {
      activeAutofillHashRef.current = null;
    }
    lastDraftFingerprintRef.current = "";
    lastDuplicateSnapshotSignatureRef.current = "";
    setIngestionStatus(null);
    setAiPattern(null);
    setAiMaterial(null);
    setAiColorNeedsReview(false);
    setExtractionPartialSuccess(false);
    photo.refs.syncedPreviewUriRef.current = null;
  }, [createSessionRef, draftItemId, draftPhotoHash, photo.refs, stopDraftSubscription]);

  const maybeApplyAutofillFromDraft = useCallback((data: any, runId?: number) => {
    const activeRunId = runId ?? aiRunIdRef.current;
    if (activeRunId !== aiRunIdRef.current) return;
    const normalizedStatus = normalizeIngestionStatus(
      data?.ingestion?.status ?? data?.ingestionStatus
    );
    try {
      setAiDebugRawPayload(
        JSON.stringify(
          {
            ingestionStatus: normalizedStatus,
            ingestionSource: data?.ingestionSource ?? null,
            category: data?.category ?? null,
            subCategory: data?.subCategory ?? null,
            type: data?.type ?? null,
            colors: Array.isArray(data?.colors) ? data.colors : [],
            primaryColor: data?.primaryColor ?? null,
            displayColor: data?.displayColor ?? null,
            displayColors: Array.isArray(data?.displayColors) ? data.displayColors : [],
            colorLabel: data?.colorLabel ?? null,
            aiDebug: data?.aiDebug ?? null,
            confidence: data?.confidence ?? null,
            brand: data?.brand ?? null,
            brandConfidence: data?.brandConfidence ?? null,
            name: data?.name ?? null,
            pattern: data?.pattern ?? null,
            material: data?.material ?? null,
            fit: data?.fit ?? null,
            style: data?.style ?? null,
            formality: data?.formality ?? null,
            warmth: data?.warmth ?? null,
            layerRole: data?.layerRole ?? null,
            aestheticTags: Array.isArray(data?.aestheticTags) ? data.aestheticTags : [],
            visualWeight: data?.visualWeight ?? null,
            versatilityScore: data?.versatilityScore ?? null,
            sleeveLength: data?.sleeveLength ?? null,
            neckline: data?.neckline ?? null,
            closure: data?.closure ?? null,
            length: data?.length ?? null,
            rise: data?.rise ?? null,
            legShape: data?.legShape ?? null,
            hasLogo: data?.hasLogo ?? null,
            logoPlacement: data?.logoPlacement ?? null,
            occasionTags: Array.isArray(data?.occasionTags) ? data.occasionTags : [],
            seasonTags: Array.isArray(data?.seasonTags) ? data.seasonTags : [],
            bbox: data?.bbox ?? null,
            crop: data?.crop ?? null,
          },
          null,
          2
        )
      );
    } catch {
      setAiDebugRawPayload("");
    }
    verboseAutofillLog("[AddItem] draft snapshot received", {
      activeRunId,
      draftId: createSessionRef.current.draftId,
      ingestionStatus: normalizedStatus,
      category: data?.category ?? null,
      subCategory: data?.subCategory ?? null,
      colors: Array.isArray(data?.colors) ? data.colors : [],
      brand: data?.brand ?? null,
      name: data?.name ?? null,
    });
    const fingerprint = JSON.stringify({
      ingestionStatus: normalizedStatus,
      category: norm(data?.category),
      subCategory: norm(data?.subCategory),
      colors: normalizeColorList(data?.colors),
      pattern: norm(data?.pattern),
      material: norm(data?.material),
      fit: norm(data?.fit),
      occasionTags: Array.isArray(data?.occasionTags) ? data.occasionTags : [],
      seasonTags: Array.isArray(data?.seasonTags) ? data.seasonTags : [],
      estimatedValue: data?.estimatedValue ?? null,
      purchasePrice: data?.purchasePrice ?? null,
      retailPrice: data?.retailPrice ?? null,
      currency: data?.currency ?? data?.priceCurrency ?? null,
      priceSource: data?.priceSource ?? null,
      primaryUrl: norm(data?.photos?.primaryUrl ?? data?.photoUrl),
      cleanedPhotoUrl: norm(data?.photos?.cleanedUrl ?? data?.photos?.cleanedPhotoUrl),
    });
    const snapshotSignature = `${createSessionRef.current.draftId ?? "no-draft"}|${fingerprint}`;
    if (fingerprint === lastDraftFingerprintRef.current) {
      const duplicateStatus = normalizedStatus;
      if (
        (duplicateStatus === "failed" || duplicateStatus === "processing") &&
        lastDuplicateSnapshotSignatureRef.current !== snapshotSignature
      ) {
        lastDuplicateSnapshotSignatureRef.current = snapshotSignature;
        verboseAutofillLog(`[AddItem] duplicate ${duplicateStatus} snapshot skipped`, {
          activeRunId,
          draftId: createSessionRef.current.draftId,
          status: duplicateStatus,
        });
      }
      return;
    }
    lastDraftFingerprintRef.current = fingerprint;
    lastDuplicateSnapshotSignatureRef.current = "";
    if (aiLockedValuesRef.current.runId !== activeRunId) {
      aiLockedValuesRef.current = { runId: activeRunId };
    }
    const locked = aiLockedValuesRef.current;
    const activePhotoHash = draftPhotoHash ?? lastAutofillStartedHashRef.current ?? null;
    const snapshotSourceHash = norm(data?.ingestionSource?.sourceHash);
    if (activePhotoHash && snapshotSourceHash && snapshotSourceHash !== activePhotoHash) {
      return;
    }
    const previousLifecycleStatus = activePhotoHash
      ? hashLifecycleRef.current.get(activePhotoHash)?.status ?? null
      : null;
    const effectiveStatus =
      previousLifecycleStatus === "done" && normalizedStatus !== "done"
        ? "done"
        : normalizedStatus;
    const extractionFieldNames = extractionFieldNamesFor(data);
    const hasPartialExtraction =
      effectiveStatus === "failed" &&
      extractionFieldNames.some((field) => field !== "brand");
    const statusForClient = hasPartialExtraction ? "done" : effectiveStatus;
    const traceId =
      String(data?.photoPipelineTraceId ?? photo.state.photoTraceId ?? "").trim() || null;
    if (activePhotoHash) {
      hashLifecycleRef.current.set(activePhotoHash, {
        status: statusForClient,
        draftId: createSessionRef.current.draftId,
      });
      if (statusForClient === "failed") {
        terminalFailedHashesRef.current.add(activePhotoHash);
        verboseAutofillLog("[AddItem] autofill terminal failure recorded", {
          activeRunId,
          draftId: createSessionRef.current.draftId,
          photoHash: activePhotoHash,
        });
      } else if (statusForClient === "done" || statusForClient === "processing") {
        terminalFailedHashesRef.current.delete(activePhotoHash);
      }
    }
    const shouldPreferDoneSnapshot = effectiveStatus === "done";
    const shouldApplyExtractionFields = effectiveStatus === "done" || hasPartialExtraction;
    setIngestionStatus(statusForClient);
    if (statusForClient === "pending" || statusForClient === "processing") {
      photo.actions.logPhotoPipelineEvent?.(traceId, "extraction", "start", {
        status: statusForClient,
        draftUpdated: true,
        hasCategory: !!data?.category,
        colorCount: Array.isArray(data?.colors) ? data.colors.length : 0,
      });
      setAiStatus("running");
      setAutofillStatusThrottled("AI autofill running…");
      setIsAutofillRunning(true);
      setAutofillError(null);
      setExtractionPartialSuccess(false);
      setAiStage("Details");
    } else if (effectiveStatus === "done") {
      const startedAt = activePhotoHash ? extractionStartedAtByHashRef.current.get(activePhotoHash) : null;
      photo.actions.logPhotoPipelineEvent?.(traceId, "extraction", "success", {
        status: effectiveStatus,
        hasCategory: !!data?.category,
        hasSubCategory: !!data?.subCategory,
        colorCount: Array.isArray(data?.colors) ? data.colors.length : 0,
        hasBrand: !!data?.brand,
        hasName: !!data?.name,
      }, startedAt ? photoPipelineDuration(startedAt) : null);
      setAiStatus("ready");
      setAutofillStatusThrottled("AI done");
      setIsAutofillRunning(false);
      setAutofillError(null);
      setExtractionPartialSuccess(false);
      setAiStage(null);
    } else if (hasPartialExtraction) {
      const startedAt = activePhotoHash ? extractionStartedAtByHashRef.current.get(activePhotoHash) : null;
      photo.actions.logPhotoPipelineEvent?.(traceId, "extraction_partial_success", "success", {
        status: effectiveStatus,
        brandDetected: !!confidentBrandFor(data),
        fieldsApplied: extractionFieldNames.filter((field) => field !== "brand"),
      }, startedAt ? photoPipelineDuration(startedAt) : null);
      setAiStatus("ready");
      setAutofillStatusThrottled("Detected most details — review before saving.");
      setIsAutofillRunning(false);
      setAutofillError(null);
      setExtractionPartialSuccess(true);
      setAiStage(null);
    } else if (effectiveStatus === "failed") {
      const startedAt = activePhotoHash ? extractionStartedAtByHashRef.current.get(activePhotoHash) : null;
      photo.actions.logPhotoPipelineEvent?.(traceId, "extraction", "failure", {
        status: effectiveStatus,
        hasError: !!data?.ingestion?.error,
      }, startedAt ? photoPipelineDuration(startedAt) : null);
      setAiStatus("error");
      setAutofillStatusThrottled("AI couldn’t autofill—continue manually");
      setIsAutofillRunning(false);
      setAutofillError("AI autofill failed");
      setExtractionPartialSuccess(false);
      setAiStage(null);
    }
    setAiPattern(norm(data?.pattern) || null);
    setAiMaterial(norm(data?.material) || null);
    setAiFit(norm(data?.fit) || null);
    setAiOccasionTags(Array.isArray(data?.occasionTags) ? data.occasionTags : []);
    setAiSeasonTags(Array.isArray(data?.seasonTags) ? data.seasonTags : []);
    setAiColorNeedsReview(Boolean(data?.colorNeedsReview));
    const incomingPrice =
      typeof data?.estimatedValue === "number"
        ? data.estimatedValue
        : typeof data?.purchasePrice === "number"
          ? data.purchasePrice
          : typeof data?.retailPrice === "number"
            ? data.retailPrice
            : typeof data?.priceAmount === "number"
              ? data.priceAmount
              : typeof data?.price === "number"
                ? data.price
                : null;
    if (!draft.refs.userEditedKeysRef.current.has("price") && incomingPrice != null) {
      draft.actions.setPriceAmount(String(incomingPrice));
      draft.actions.setPriceCurrency(norm(data?.currency ?? data?.priceCurrency) || "USD");
      draft.actions.setPriceSource(
        data?.priceSource === "product_link" ||
          data?.priceSource === "manual" ||
          data?.priceSource === "estimated"
          ? data.priceSource
          : "product_link"
      );
      draft.actions.setPriceDisplay(norm(data?.priceDisplay) || "");
    }

    const serverPrimaryUrl = data?.photos?.primaryUrl ?? data?.photoUrl ?? null;
    const serverCleanedPhotoUrl =
      data?.photos?.cleanedUrl ?? data?.photos?.cleanedPhotoUrl ?? null;
    const serverGeneratedCleanedUrl =
      data?.photos?.cleanedUrl ?? data?.photos?.cleanedPhotoUrl ?? null;
    if (serverPrimaryUrl) photo.actions.setPhotoUrl(serverPrimaryUrl);
    if (serverCleanedPhotoUrl) photo.actions.setCleanedPhotoUrl(serverCleanedPhotoUrl);
    if (serverGeneratedCleanedUrl) photo.actions.setServerCleanedUrl(serverGeneratedCleanedUrl);
    if (!shouldApplyExtractionFields) {
      return;
    }

    const rawIncomingCategory = data?.category
      ? normalizeCategoryForStorage(data.category)
      : null;
    const isPlaceholderDraftCategory =
      (data?.isDraft !== false) &&
      (!normalizedStatus ||
        normalizedStatus === "pending" ||
        normalizedStatus === "processing") &&
      rawIncomingCategory === Category.TOP &&
      !norm(data?.subCategory) &&
      !(Array.isArray(data?.colors) && data.colors.length > 0) &&
      !norm(data?.brand) &&
      !norm(data?.name) &&
      !norm(data?.pattern) &&
      !norm(data?.material);
    const bboxW = Number(data?.bbox?.w ?? data?.bbox?.width ?? 0);
    const bboxH = Number(data?.bbox?.h ?? data?.bbox?.height ?? 0);
    const aspectRatio = bboxW > 0 && bboxH > 0 ? bboxH / bboxW : null;
    const twoLegCue = hasTwoLegRegionCue(data);
    let finalCategoryCandidate = isPlaceholderDraftCategory ? null : rawIncomingCategory;
    if (
      rawIncomingCategory &&
      rawIncomingCategory !== Category.BOTTOM &&
      aspectRatio != null &&
      aspectRatio > 1.6 &&
      twoLegCue
    ) {
      finalCategoryCandidate = Category.BOTTOM;
      setAiDebugCorrectedCategory(Category.BOTTOM);
    } else {
    setAiDebugCorrectedCategory("");
    }
    setAiDebugAspectRatio(aspectRatio);

    const aiDebug = data?.aiDebug ?? {};
    const rawColors = normalizeColorList(data?.colors);
    const rawPrimary = normalizeColorList([data?.primaryColor])[0] ?? "";
    const debugColors = normalizeColorList([
      ...(Array.isArray(aiDebug?.aiColors) ? aiDebug.aiColors : []),
      aiDebug?.aiPrimaryColor,
      aiDebug?.aiColorLabel,
      aiDebug?.displayColor,
      ...(Array.isArray(aiDebug?.displayColors) ? aiDebug.displayColors : []),
      ...(Array.isArray(aiDebug?.pixelColors) ? aiDebug.pixelColors : []),
    ]);
    const pixelHex = norm(String(data?.pixelColorHex ?? data?.pixelHex ?? aiDebug?.pixelColorHex ?? ""));
    const dominantRgb = parseHexRgb(pixelHex);
    const dominantColor = dominantRgb ? nearestColorLabel(dominantRgb) : "";
    const dominantColorLabel = normColor(dominantColor);
    const warmNeutralDominant = ["Beige", "Brown", "Khaki", "Tan", "Olive"].includes(
      dominantColorLabel
    );
    const filteredRawColors = rawColors.filter(
      (color) => !(warmNeutralDominant && (color === "Orange" || color === "Grey"))
    );
    const filteredRawPrimary =
      warmNeutralDominant && (rawPrimary === "Orange" || rawPrimary === "Grey")
        ? ""
        : rawPrimary;
    const displayColorFallback = normalizeDisplayColorToDefault(
      [
        data?.displayColor,
        ...(Array.isArray(data?.displayColors) ? data.displayColors : []),
        data?.colorLabel,
        aiDebug?.displayColor,
        ...(Array.isArray(aiDebug?.displayColors) ? aiDebug.displayColors : []),
        aiDebug?.aiColorLabel,
      ]
        .filter(Boolean)
        .join(" ")
    );
    const finalColors = [
      ...filteredRawColors,
      ...(filteredRawPrimary ? [filteredRawPrimary] : []),
      ...debugColors,
      ...(filteredRawColors.length === 0 && !filteredRawPrimary && displayColorFallback
        ? [displayColorFallback]
        : []),
      ...(filteredRawColors.length === 0 && !filteredRawPrimary && dominantColorLabel
        ? [dominantColorLabel]
        : []),
    ]
      .filter((value, index, arr) => value && arr.indexOf(value) === index)
      .slice(0, 2);
    const incomingCategoryConfidence = Number(data?.confidence?.category ?? 0);
    const incomingColorsConfidence = Number(data?.confidence?.colors ?? 0);
    const runMeta = aiRunMetaRef.current.get(activeRunId);
    const incomingSource: AutofillSource = runMeta?.source ?? "original";
    const committed = aiCommittedRef.current;
    const categoryConfDelta = Math.abs(
      incomingCategoryConfidence - (committed?.categoryConfidence ?? 0)
    );
    if (dominantRgb) {
      setAiDebugDominantRgb(`${dominantRgb.r},${dominantRgb.g},${dominantRgb.b}`);
    } else {
      setAiDebugDominantRgb("");
    }

    setAiPrediction({
      category: rawIncomingCategory,
      colors: rawColors.length ? rawColors : rawPrimary ? [rawPrimary] : [],
      crop: data?.crop ?? null,
    });
    setFinalPrediction({
      category: finalCategoryCandidate,
      colors: finalColors,
      crop: data?.crop ?? null,
    });
    verboseAutofillLog("[AddItem] mapped autofill fields", {
      activeRunId,
      normalizedStatus: effectiveStatus,
      isPlaceholderDraftCategory,
      rawIncomingCategory,
      finalCategoryCandidate,
      finalColors,
      incomingPattern: norm(data?.pattern),
      incomingMaterial: norm(data?.material),
      incomingBrand: norm(data?.brand),
      incomingName: norm(data?.name),
    });

    if (
      !draft.refs.userEditedKeysRef.current.has("category") &&
      (shouldPreferDoneSnapshot || !draft.state.category || isPlaceholderDraftCategory) &&
      finalCategoryCandidate
    ) {
      const categoryConflict =
        !!committed?.category && committed.category !== finalCategoryCandidate;
      const shouldKeepCommittedCategory =
        categoryConflict &&
        ((incomingSource === "original" && committed.source === "cutout") ||
          categoryConfDelta < 0.18);
      if (shouldKeepCommittedCategory) {
        finalCategoryCandidate = committed?.category as Category;
      }
      if (shouldPreferDoneSnapshot || !locked.category || locked.category === finalCategoryCandidate) {
        verboseAutofillLog("[AddItem] applying autofill category", {
          activeRunId,
          category: finalCategoryCandidate,
          previousCategory: draft.state.category,
          shouldPreferDoneSnapshot,
        });
        draft.actions.setCategory(finalCategoryCandidate);
        locked.category = finalCategoryCandidate;
      }
    } else {
      verboseAutofillLog("[AddItem] skipped autofill category", {
        activeRunId,
        hasUserEdit: draft.refs.userEditedKeysRef.current.has("category"),
        currentCategory: draft.state.category,
        finalCategoryCandidate,
        isPlaceholderDraftCategory,
      });
    }
    const incomingPattern = norm(data?.pattern);
    if (!draft.refs.userEditedKeysRef.current.has("pattern") && !draft.state.pattern && incomingPattern) {
      if (shouldPreferDoneSnapshot || !locked.pattern || locked.pattern === incomingPattern) {
        draft.actions.setPattern(incomingPattern);
        locked.pattern = incomingPattern;
      }
    }
    const incomingMaterial = norm(data?.material);
    if (
      !draft.refs.userEditedKeysRef.current.has("material") &&
      (shouldPreferDoneSnapshot || !draft.state.material) &&
      incomingMaterial
    ) {
      if (shouldPreferDoneSnapshot || !locked.material || locked.material === incomingMaterial) {
        draft.actions.setMaterial(incomingMaterial);
        locked.material = incomingMaterial;
      }
    }
    if (
      !draft.refs.userEditedKeysRef.current.has("fit") &&
      (shouldPreferDoneSnapshot || !draft.state.fit) &&
      norm(data?.fit)
    ) {
      draft.actions.setFit(norm(data.fit));
    }
    if (
      !draft.refs.userEditedKeysRef.current.has("occasionTags") &&
      draft.state.occasionTags.length === 0 &&
      Array.isArray(data?.occasionTags) &&
      data.occasionTags.length
    ) {
      draft.actions.setOccasionTags(data.occasionTags);
    }
    if (
      !draft.refs.userEditedKeysRef.current.has("seasonTags") &&
      draft.state.seasonTags.length === 0 &&
      Array.isArray(data?.seasonTags) &&
      data.seasonTags.length
    ) {
      draft.actions.setSeasonTags(data.seasonTags);
    }
    const incomingNotes = norm(data?.notes);
    if (
      !draft.refs.userEditedKeysRef.current.has("notes") &&
      !draft.state.notes &&
      incomingNotes
    ) {
      draft.actions.setNotes(incomingNotes);
    }

    const normalizedCategory = finalCategoryCandidate ?? draft.derived.selectedCategory;
    const serverSubCategory = norm(data?.subCategory);
    const resolvedSubCategory =
      shouldPreferDoneSnapshot &&
      locked.subCategory &&
      serverSubCategory &&
      locked.subCategory !== serverSubCategory
        ? locked.subCategory
        : serverSubCategory;
    if (
      !draft.refs.userEditedKeysRef.current.has("subCategory") &&
      (shouldPreferDoneSnapshot || !draft.state.subCategory) &&
      resolvedSubCategory &&
      isValidCategorySubCategory(normalizedCategory, resolvedSubCategory)
    ) {
      if (
        shouldPreferDoneSnapshot ||
        !locked.subCategory ||
        locked.subCategory === resolvedSubCategory
      ) {
        verboseAutofillLog("[AddItem] applying autofill subCategory", {
          activeRunId,
          subCategory: resolvedSubCategory,
          previousSubCategory: draft.state.subCategory,
          shouldPreferDoneSnapshot,
        });
        draft.actions.setSubCategory(resolvedSubCategory);
        locked.subCategory = resolvedSubCategory;
      }
    }

    const colorSource = String(data?.colorSource ?? "").trim().toLowerCase();
    if (
      colorSource !== "user" &&
      !draft.refs.userEditedKeysRef.current.has("colors") &&
      (shouldPreferDoneSnapshot || draft.state.selectedColors.length === 0)
    ) {
      const incomingColors = finalColors;
      const colorsConflict =
        !!committed?.colors?.length &&
        incomingColors.length > 0 &&
        incomingColors.join("|") !== committed.colors.join("|");
      const colorsConfDelta = Math.abs(
        incomingColorsConfidence - (committed?.colorsConfidence ?? 0)
      );
      const shouldKeepCommittedColors =
        colorsConflict &&
        ((incomingSource === "original" && committed?.source === "cutout") ||
          colorsConfDelta < 0.18);
      const resolvedColors = shouldKeepCommittedColors
        ? committed?.colors ?? incomingColors
        : incomingColors;
      if (resolvedColors.length > 0) {
        const lockedColorKey = locked.colors?.join("|") ?? "";
        const incomingColorKey = resolvedColors.join("|");
        if (shouldPreferDoneSnapshot || !locked.colors || lockedColorKey === incomingColorKey) {
          verboseAutofillLog("[AddItem] applying autofill colors", {
            activeRunId,
            resolvedColors,
            previousColors: draft.state.selectedColors,
            shouldPreferDoneSnapshot,
          });
          draft.actions.setSelectedColors(resolvedColors);
          locked.colors = resolvedColors;
        }
      }
    } else {
      verboseAutofillLog("[AddItem] skipped autofill colors", {
        activeRunId,
        colorSource,
        hasUserEdit: draft.refs.userEditedKeysRef.current.has("colors"),
        currentColors: draft.state.selectedColors,
        finalColors,
      });
    }
    if (!draft.refs.userEditedKeysRef.current.has("displayColor")) {
      const incomingDisplayColor = norm(String(data?.displayColor ?? ""));
      if (incomingDisplayColor) {
        draft.actions.setDisplayColor(incomingDisplayColor);
      } else if (finalColors.length > 0 && shouldPreferDoneSnapshot) {
        draft.actions.setDisplayColor(humanizeAutofillLabel(finalColors[0]).toLowerCase());
      }
    }
    if (!draft.refs.userEditedKeysRef.current.has("displayColors")) {
      const incomingDisplayColors = Array.isArray(data?.displayColors)
        ? data.displayColors
            .map((value: unknown) => norm(String(value ?? "")))
            .filter(Boolean)
            .slice(0, 4)
        : [];
      draft.actions.setDisplayColors(incomingDisplayColors);
    }

    const summaryParts: string[] = [];
    const summaryBrand = confidentBrandFor(data);
    if (
      summaryBrand &&
      !draft.refs.userEditedKeysRef.current.has("brand") &&
      (shouldPreferDoneSnapshot || !draft.state.brand)
    ) {
      if (shouldPreferDoneSnapshot || !locked.brand || locked.brand === summaryBrand) {
        verboseAutofillLog("[AddItem] applying autofill brand", {
          activeRunId,
          brand: summaryBrand,
          shouldPreferDoneSnapshot,
        });
        draft.actions.setBrand(summaryBrand);
        locked.brand = summaryBrand;
      }
    } else if (
      !summaryBrand &&
      !draft.refs.userEditedKeysRef.current.has("brand") &&
      !norm(draft.state.brand)
    ) {
      verboseAutofillLog("[AddItem] defaulting brand to unbranded", {
        activeRunId,
        shouldPreferDoneSnapshot,
      });
      draft.actions.setBrand(UNBRANDED_LABEL);
      locked.brand = UNBRANDED_LABEL;
      photo.actions.logPhotoPipelineEvent?.(traceId, "brand_defaulted_unbranded", "success", {
        brandDetected: false,
      });
    }
    const summaryCategory = norm(locked.category ?? finalCategoryCandidate ?? data?.category);
    const rawSummaryName = norm(data?.name);
    const displayColorForName =
      norm(String(data?.displayColor ?? "")) ||
      (Array.isArray(data?.displayColors)
        ? norm(String(data.displayColors[0] ?? ""))
        : "") ||
      "";
    const generatedSummaryName = buildUsefulItemName({
      displayColor: displayColorForName,
      colors: finalColors,
      material: incomingMaterial,
      fit: norm(data?.fit),
      subCategory: resolvedSubCategory,
      category: summaryCategory,
    });
    const summaryName =
      !isWeakItemName(rawSummaryName)
        ? rawSummaryName
        : generatedSummaryName ||
          [displayColorForName, summaryCategory]
            .filter(Boolean)
            .map((part) => humanizeAutofillLabel(part))
            .join(" ");
    if (
      summaryName &&
      !draft.refs.userEditedKeysRef.current.has("name") &&
      (shouldPreferDoneSnapshot || !draft.state.name)
    ) {
      verboseAutofillLog("[AddItem] applying autofill name", {
        activeRunId,
        name: summaryName,
        shouldPreferDoneSnapshot,
      });
      draft.actions.setName(summaryName);
    }
    if (summaryBrand) summaryParts.push(summaryBrand);
    if (summaryCategory) summaryParts.push(summaryCategory);
    if (summaryParts.length) {
      const summary = `AI found: ${summaryParts.join(" • ")}`;
      setLastAutofillSummary(summary);
      if (normalizedStatus === "pending" || normalizedStatus === "processing") {
        setAutofillStatusThrottled(summary);
      } else if (effectiveStatus === "done") {
        const doneBits = [summaryCategory].filter(Boolean).join(" • ");
        const doneStatus = `AI done: ${doneBits || "ready"}`;
        setAutofillStatusThrottled(doneStatus);
        setAiStatus("ready");
        setAiStage(null);
        const runMetaForCache = aiRunMetaRef.current.get(activeRunId);
        if (runMetaForCache) {
          const cacheKey = `${runMetaForCache.source}:${runMetaForCache.photoHash}`;
          aiCacheRef.current.set(cacheKey, { at: Date.now(), summary });
        }
      }
    }
    if (!isPlaceholderDraftCategory || effectiveStatus === "done") {
      aiCommittedRef.current = {
        source: incomingSource,
        category: finalCategoryCandidate,
        categoryConfidence: Number.isFinite(incomingCategoryConfidence)
          ? incomingCategoryConfidence
          : 0,
        colors: locked.colors ?? finalColors,
        colorsConfidence: Number.isFinite(incomingColorsConfidence)
          ? incomingColorsConfidence
          : 0,
      };
    }
  }, [
    createSessionRef,
    draft,
    draftPhotoHash,
    photo.actions,
    photo.state,
    setAutofillStatusThrottled,
  ]);

  const attachDraftSubscription = useCallback(
    (itemId: string, sessionId?: string, runId?: number) => {
      if (!uid) return;
      const activeSessionId = sessionId ?? createSessionRef.current.sessionId;
      const nextKey = `${itemId}:${activeSessionId}`;
      if (isSubscribedRef.current && subscriptionKeyRef.current === nextKey) {
        verboseAutofillLog("[AddItem] subscription attach skipped because already attached to same item", {
          itemId,
          activeSessionId,
          activeRunId: runId ?? aiRunIdRef.current,
        });
        return;
      }
      stopDraftSubscription();
      const ref = doc(db, "users", uid, "items", itemId);
      const activeRunId = runId ?? aiRunIdRef.current;
      verboseAutofillLog("[AddItem] attaching draft subscription", {
        sessionId: activeSessionId,
        itemId,
        activeRunId,
      });
      draftSubscriptionRef.current = onSnapshot(ref, (snap) => {
        if (
          createSessionRef.current.sessionId !== activeSessionId ||
          createSessionRef.current.draftId !== itemId
        ) {
          return;
        }
        if (!snap.exists()) return;
        snapshotUpdateCountRef.current += 1;
        if (__DEV__) {
          console.log("[AddItemLifecycle] draftSubscription:update", {
            itemId,
            activeSessionId,
            activeRunId,
            snapshotCount: snapshotUpdateCountRef.current,
            ingestionStatus: normalizeIngestionStatus(
              snap.data()?.ingestion?.status ?? snap.data()?.ingestionStatus
            ),
            isDraft: snap.data()?.isDraft ?? null,
            draftState: snap.data()?.draftState ?? null,
          });
        }
        verboseAutofillLog("[AddItem] draft subscription update", {
          sessionId: activeSessionId,
          itemId,
          activeRunId,
          snapshotCount: snapshotUpdateCountRef.current,
          ingestionStatus: normalizeIngestionStatus(
            snap.data()?.ingestion?.status ?? snap.data()?.ingestionStatus
          ),
        });
        maybeApplyAutofillFromDraft(snap.data() as any, activeRunId);
      });
      createSessionRef.current.unsub = draftSubscriptionRef.current;
      isSubscribedRef.current = true;
      subscriptionKeyRef.current = nextKey;
    },
    [createSessionRef, maybeApplyAutofillFromDraft, stopDraftSubscription, uid]
  );

  const startDraftAutofill = useCallback(
    async (params: {
      photoHash: string;
      localPhotoUri: string;
      cleanedLocalUri: string | null;
      normalizedLocalUri?: string | null;
      sourceOriginalLocalUri?: string | null;
      refinedLocalUri?: string | null;
      imageQuality?: ProductImageQuality | null;
      productPolish?: ProductPolishMetadata | null;
      traceId?: string | null;
      originalWidth: number | null;
      token: { sessionId: string; requestId: number };
      runId?: number;
    }) => {
      if (!uid || isEdit) return;
      const runId = params.runId ?? aiRunIdRef.current;
      if (runId !== aiRunIdRef.current) return;
      try {
        const {
          photoHash,
          localPhotoUri,
          cleanedLocalUri,
          normalizedLocalUri = null,
          sourceOriginalLocalUri = null,
          refinedLocalUri = null,
          imageQuality = null,
          productPolish = null,
          traceId = null,
          originalWidth,
        } = params;
        if (draftPhotoHash === photoHash && draftItemId) {
          createSessionRef.current.draftId = draftItemId;
          attachDraftSubscription(draftItemId, params.token.sessionId, runId);
          return;
        }
        const previousDraftId = createSessionRef.current.draftId ?? draftItemId;
        const reusableDraftId = previousDraftId;
        resetDraftTracking({ preserveDraftId: true, preserveActiveAutofillHash: true });
        const draftRef = reusableDraftId
          ? doc(db, "users", uid, "items", reusableDraftId)
          : doc(collection(db, "users", uid, "items"));
        const existingDraftSnap = await getDoc(draftRef);
        if (existingDraftSnap.exists()) {
          const existingData = existingDraftSnap.data() as any;
          const existingStatus = normalizeIngestionStatus(
            existingData?.ingestion?.status ?? existingData?.ingestionStatus
          );
          const existingSourceHash = norm(existingData?.ingestionSource?.sourceHash);
          if (
            (existingStatus === "processing" || existingStatus === "done") &&
            existingSourceHash &&
            existingSourceHash === photoHash
          ) {
            if (__DEV__) {
              console.log("[AddItemLifecycle] startDraftAutofill:skip-active-terminal", {
                draftId: draftRef.id,
                existingStatus,
                photoHash,
                existingSourceHash,
              });
            }
            setDraftItemId(draftRef.id);
            setDraftPhotoHash(photoHash);
            createSessionRef.current.draftId = draftRef.id;
            setIngestionStatus(existingStatus);
            const existingPrimary =
              existingData?.photos?.primaryUrl ?? existingData?.photoUrl ?? null;
            const existingCleaned =
              existingData?.photos?.cleanedUrl ??
              existingData?.photos?.cleanedPhotoUrl ??
              null;
            const existingNormalized = existingData?.photos?.normalizedUrl ?? null;
            const existingRefined = existingData?.photos?.refinedUrl ?? existingData?.refinedImageUrl ?? null;
            if (existingPrimary) photo.actions.setPhotoUrl(existingPrimary);
            if (existingCleaned) {
              photo.actions.setCleanedPhotoUrl(existingCleaned);
              photo.actions.setServerCleanedUrl(existingCleaned);
            }
            photo.actions.setPendingNormalizedPreviewUri?.(existingNormalized);
            photo.actions.setPendingRefinedImageUrl?.(existingRefined);
            photo.actions.setPendingImageQuality?.(existingData?.imageQuality ?? existingData?.photos?.imageQuality ?? null);
            photo.actions.setPendingProductPolish?.(existingData?.productPolish ?? existingData?.photos?.productPolish ?? null);
            attachDraftSubscription(draftRef.id, params.token.sessionId, runId);
            return;
          }
        }
        const uploaded = await uploadWithTimeout(
          uploadItemPhoto({
            uid,
            itemId: draftRef.id,
            localUri: localPhotoUri,
            cleanedLocalUri,
            normalizedLocalUri,
            sourceOriginalLocalUri,
            refinedLocalUri,
            saveNormalizedAsCleaned: true,
            originalWidth,
            imageQuality,
            productPolish,
            traceId,
            onLog: photo.actions.appendPhotoPipelineEvent,
          }),
          UPLOAD_TIMEOUT_MS,
          "Photo upload"
        );
        if (runId !== aiRunIdRef.current) {
          cleanupDraftDocIfInactive(draftRef.id);
          return;
        }
        const now = Date.now();
        const nextCleanedPhotoUrl = uploaded.cleanedUrl;
        const nextNormalizedPhotoUrl = uploaded.normalizedUrl;
        const draftPayload = {
          photoUrl: uploaded.primaryUrl,
          photoUri: null,
          originalImageUrl: uploaded.originalUrl,
          cleanedImageUrl: uploaded.cleanedUrl,
          refinedImageUrl: uploaded.refinedUrl,
          imageQuality,
          productPolish,
          photoPipelineTraceId: traceId,
          images: uploaded.images,
          createdAt: now,
          updatedAt: now,
          status: "AVAILABLE",
          category: Category.TOP,
          wearCountSinceWash: 0,
          lastWornDate: null,
          lastWashedDate: null,
          lastWashedAt: null,
          isDraft: true,
          draftState: "photo_uploaded",
          itemLifecycleStatus: "processing",
          ingestionStatus: "pending",
          name: null,
          brand: null,
          subCategory: "",
          colors: [],
          primaryColor: null,
          colorLabel: null,
          aiColors: [],
          pattern: null,
          material: null,
          fit: null,
          occasionTags: [],
          seasonTags: [],
          photos: {
            originalUrl: uploaded.originalUrl,
            primaryUrl: uploaded.primaryUrl,
            aiUrl: uploaded.aiUrl,
            refinedUrl: uploaded.refinedUrl,
            imageQuality,
            productPolish,
            traceId,
            urls: uploaded.imageUrls,
            images: uploaded.images,
            ...(nextCleanedPhotoUrl
              ? {
                  cleanedUrl: nextCleanedPhotoUrl,
                  cleanedSource: uploaded.cleanedSource,
                }
              : {}),
            ...(nextNormalizedPhotoUrl
              ? {
                  normalizedUrl: nextNormalizedPhotoUrl,
                }
              : {}),
          },
          ingestion: {
            status: "pending",
            lastRunAt: now,
          },
          ingestionSource: {
            sourceHash: photoHash,
            sourceType: nextCleanedPhotoUrl ? "ios_vision" : "original",
          },
        };
        const draftUpdateStartedAt = photoPipelineNow();
        await setDoc(draftRef, draftPayload, { merge: true });
        photo.actions.logPhotoPipelineEvent?.(traceId, "draft_updated", "success", {
          draftId: draftRef.id,
          hasPrimaryUrl: !!uploaded.primaryUrl,
          hasCleanedUrl: !!uploaded.cleanedUrl,
          hasRefinedUrl: !!uploaded.refinedUrl,
          ingestionStatus: "pending",
        }, photoPipelineDuration(draftUpdateStartedAt));
        if (runId !== aiRunIdRef.current) {
          cleanupDraftDocIfInactive(draftRef.id);
          return;
        }
        setDraftItemId(draftRef.id);
        setDraftPhotoHash(photoHash);
        createSessionRef.current.draftId = draftRef.id;
        setIngestionStatus("pending");
        photo.actions.setPhotoUrl(uploaded.primaryUrl);
        photo.actions.setCleanedPhotoUrl(nextCleanedPhotoUrl);
        photo.actions.setServerCleanedUrl(nextCleanedPhotoUrl);
        photo.actions.setPendingNormalizedPreviewUri?.(nextNormalizedPhotoUrl ?? null);
        photo.actions.setUploadedPhotoRecord?.({
          imageId: "primary",
          itemId: draftRef.id,
          traceId,
          photoHash,
          originalUrl: uploaded.originalUrl,
          sourceOriginalUrl: uploaded.sourceOriginalUrl,
          primaryUrl: uploaded.primaryUrl,
          aiUrl: uploaded.aiUrl,
          cleanedUrl: nextCleanedPhotoUrl,
          normalizedUrl: nextNormalizedPhotoUrl,
          refinedUrl: uploaded.refinedUrl,
          cleanedSource: uploaded.cleanedSource,
          imageQuality,
          productPolish,
        });
        photo.refs.syncedPreviewUriRef.current = localPhotoUri;
        attachDraftSubscription(draftRef.id, params.token.sessionId, runId);
        if (previousDraftId && previousDraftId !== draftRef.id) {
          cleanupDraftDocIfInactive(previousDraftId);
        }
      } catch (error) {
        const message = userFacingAutofillError(error, "Photo upload failed. Please try again.");
        photo.actions.logPhotoPipelineEvent?.(params.traceId ?? null, "draft_updated", "failure", {
          ...safeErrorData(error),
        });
        photo.actions.setUploadError(message);
        throw error;
      }
    },
    [
      attachDraftSubscription,
      cleanupDraftDocIfInactive,
      createSessionRef,
      draftItemId,
      draftPhotoHash,
      isEdit,
      photo.actions,
      photo.refs,
      resetDraftTracking,
      uid,
    ]
  );

  useEffect(() => {
    if (!uid || isEdit) return;
    if (createSessionRef.current.draftId || draftItemId) return;
    void ensureDraftDocExists();
  }, [createSessionRef, draftItemId, ensureDraftDocExists, isEdit, uid]);

  const bumpAiRun = useCallback(() => {
    aiRunIdRef.current += 1;
    aiLockedValuesRef.current = { runId: aiRunIdRef.current };
    return aiRunIdRef.current;
  }, []);

  const prepareForNewPhoto = useCallback(() => {
    const nextRunId = bumpAiRun();
    if (!draft.refs.userEditedKeysRef.current.has("brand")) {
      draft.actions.setBrand("");
    }
    if (!draft.refs.userEditedKeysRef.current.has("name")) {
      draft.actions.setName("");
    }
    if (!draft.refs.userEditedKeysRef.current.has("category")) {
      draft.actions.setCategory(null);
    }
    if (!draft.refs.userEditedKeysRef.current.has("subCategory")) {
      draft.actions.setSubCategory("");
    }
    if (!draft.refs.userEditedKeysRef.current.has("pattern")) {
      draft.actions.setPattern(null);
    }
    if (!draft.refs.userEditedKeysRef.current.has("material")) {
      draft.actions.setMaterial(null);
    }
    if (!draft.refs.userEditedKeysRef.current.has("colors")) {
      draft.actions.setSelectedColors([]);
    }
    if (!draft.refs.userEditedKeysRef.current.has("fit")) {
      draft.actions.setFit(null);
    }
    if (!draft.refs.userEditedKeysRef.current.has("occasionTags")) {
      draft.actions.setOccasionTags([]);
    }
    if (!draft.refs.userEditedKeysRef.current.has("seasonTags")) {
      draft.actions.setSeasonTags([]);
    }
    aiLockedValuesRef.current = { runId: nextRunId };
    aiCommittedRef.current = null;
    aiRunMetaRef.current.clear();
    aiCacheRef.current.clear();
    resetDraftTracking({ preserveDraftId: true });
    setAutofillError(null);
    setLastAutofillSummary("");
    setAiPrediction({ category: null, colors: [] });
    setFinalPrediction({ category: null, colors: [], crop: null });
    setAiPattern(null);
    setAiMaterial(null);
    setAiFit(null);
    setAiOccasionTags([]);
    setAiSeasonTags([]);
    setAiColorNeedsReview(false);
    setExtractionPartialSuccess(false);
    setAiDebugInputUri("");
    setAiDebugInputSource("");
    setAiDebugAspectRatio(null);
    setAiDebugDominantRgb("");
    setAiDebugCorrectedCategory("");
    setAutofillStatus("Starting AI autofill…");
    setAiStatus("running");
    setAiStage("Color");
    setIsAutofillRunning(!isEdit);
    lastAutofillStartedHashRef.current = null;
  }, [
    bumpAiRun,
    draft.actions,
    draft.refs.userEditedKeysRef,
    isEdit,
    resetDraftTracking,
  ]);

  const setAutofillRunningState = useCallback(() => {
    setAiStatus("running");
    setAiStage("Color");
    setExtractionPartialSuccess(false);
    setAutofillStatusThrottled("Starting AI autofill…");
  }, [setAutofillStatusThrottled]);

  const resetExtractionState = useCallback(() => {
    stopDraftSubscription();
    setDraftItemId(null);
    setDraftPhotoHash(null);
    setAutofillKick(0);
    lastDraftFingerprintRef.current = "";
    lastDuplicateSnapshotSignatureRef.current = "";
    setIngestionStatus(null);
    setAiStatus("idle");
    setAiStage(null);
    setAutofillStatus("AI idle");
    setIsAutofillRunning(false);
    setLastAutofillSummary("");
    setAutofillError(null);
    setExtractionPartialSuccess(false);
    setAiPrediction({ category: null, colors: [] });
    setFinalPrediction({ category: null, colors: [], crop: null });
    setAiDebugRunId(0);
    setAiDebugInputUri("");
    setAiDebugInputSource("");
    setAiDebugAspectRatio(null);
    setAiDebugDominantRgb("");
    setAiDebugCorrectedCategory("");
    setAiDebugRawPayload("");
    setAiPattern(null);
    setAiMaterial(null);
    setAiFit(null);
    setAiOccasionTags([]);
    setAiSeasonTags([]);
    setAiColorNeedsReview(false);
    aiRunIdRef.current += 1;
    aiLockedValuesRef.current = { runId: aiRunIdRef.current };
    lastAutofillStartedHashRef.current = null;
    scheduledAutofillHashRef.current = null;
    activeAutofillHashRef.current = null;
    hashLifecycleRef.current.clear();
    terminalFailedHashesRef.current.clear();
    aiRunMetaRef.current.clear();
    aiCommittedRef.current = null;
    draftCreatePromiseRef.current = null;
    if (aiDebounceTimerRef.current) {
      clearTimeout(aiDebounceTimerRef.current);
      aiDebounceTimerRef.current = null;
    }
    if (autofillStatusDebounceRef.current) {
      clearTimeout(autofillStatusDebounceRef.current);
      autofillStatusDebounceRef.current = null;
    }
    if (aiInteractionTaskRef.current?.cancel) {
      aiInteractionTaskRef.current.cancel();
    }
  }, [stopDraftSubscription]);

  const retryAutofill = useCallback(() => {
    if (isEdit) return;
    lastAutofillStartedHashRef.current = null;
    scheduledAutofillHashRef.current = null;
    if (draftPhotoHash) {
      terminalFailedHashesRef.current.delete(draftPhotoHash);
      hashLifecycleRef.current.delete(draftPhotoHash);
    }
    setDraftPhotoHash(null);
    setAutofillError(null);
    setAiStatus("running");
    setAiStage("Color");
    setAutofillStatus("Starting AI autofill…");
    setAutofillKick((prev) => prev + 1);
  }, [draftPhotoHash, isEdit]);

  const resetForLoadedEditItem = useCallback(() => {
    setAiFit(null);
    setAiOccasionTags([]);
    setAiSeasonTags([]);
    setAiColorNeedsReview(false);
  }, []);

  const autofillTriggerUri = useMemo(
    () =>
      photo.state.autofillCutoutUri ??
      photo.state.pendingPhotoUri ??
      photo.state.originalPickedPhotoUri ??
      null,
    [
      photo.state.autofillCutoutUri,
      photo.state.originalPickedPhotoUri,
      photo.state.pendingPhotoUri,
    ]
  );

  const autofillInputSource = useMemo<"cutout" | "original" | "">(
    () =>
      photo.state.autofillCutoutUri &&
      autofillTriggerUri === photo.state.autofillCutoutUri &&
      photo.state.autofillCutoutUri !== photo.state.originalPickedPhotoUri
        ? "cutout"
        : autofillTriggerUri
        ? "original"
        : "",
    [
      autofillTriggerUri,
      photo.state.autofillCutoutUri,
      photo.state.originalPickedPhotoUri,
    ]
  );

  const autofillTriggerHash = useMemo(() => {
    if (!autofillTriggerUri) return null;
    return `${autofillInputSource || "original"}:${autofillTriggerUri}`;
  }, [autofillInputSource, autofillTriggerUri]);

  useEffect(() => {
    const existingDraftId = draftItemId ?? createSessionRef.current.draftId ?? null;
    if (!uid) {
      verboseAutofillLog("[AddItem] autofill kickoff skipped: missing uid");
      return;
    }
    if (isEdit) {
      verboseAutofillLog("[AddItem] autofill kickoff skipped: edit mode");
      return;
    }
    if (!autofillTriggerUri) {
      verboseAutofillLog("[AddItem] autofill kickoff waiting: no trigger uri", {
        originalPickedPhotoUri: photo.state.originalPickedPhotoUri,
        autofillCutoutUri: photo.state.autofillCutoutUri,
      });
      return;
    }
      const imageUri = photo.state.pendingPhotoUri ?? autofillTriggerUri;
      const cutoutUri =
        photo.state.autofillCutoutUri &&
        photo.state.autofillCutoutUri !== photo.state.originalPickedPhotoUri
        ? photo.state.autofillCutoutUri
        : null;
    const photoHash = autofillTriggerHash;
    if (!photoHash) {
      verboseAutofillLog("[AddItem] autofill kickoff skipped: missing photo hash", {
        imageUri,
        autofillInputSource,
      });
      return;
    }

    if (activeAutofillHashRef.current === photoHash) {
      verboseAutofillLog("[AddItem] kickoff suppressed because current hash is already uploading", {
        photoHash,
        existingDraftId,
        sessionId: createSessionRef.current.sessionId,
      });
      return;
    }

    const currentLifecycle = photoHash ? hashLifecycleRef.current.get(photoHash) : null;

    if (existingDraftId && draftPhotoHash === photoHash) {
      if (currentLifecycle?.status === "failed" || terminalFailedHashesRef.current.has(photoHash)) {
        verboseAutofillLog("[AddItem] kickoff suppressed because current hash is already failed", {
          photoHash,
          existingDraftId,
          sessionId: createSessionRef.current.sessionId,
        });
        setAiStatus("error");
        setAiStage(null);
        setIsAutofillRunning(false);
        setAutofillStatusThrottled("AI couldn’t autofill—continue manually");
        return;
      }
      if (
        currentLifecycle?.status === "pending" ||
        currentLifecycle?.status === "processing"
      ) {
        verboseAutofillLog("[AddItem] kickoff suppressed because current hash is already processing", {
          photoHash,
          existingDraftId,
          sessionId: createSessionRef.current.sessionId,
          lifecycleStatus: currentLifecycle?.status,
        });
        if (!isSubscribedRef.current || subscriptionKeyRef.current !== `${existingDraftId}:${createSessionRef.current.sessionId}`) {
          attachDraftSubscription(existingDraftId, createSessionRef.current.sessionId, aiRunIdRef.current);
        }
        return;
      }
      if (currentLifecycle?.status === "done") {
        verboseAutofillLog("[AddItem] kickoff suppressed because current hash is already done", {
          photoHash,
          existingDraftId,
          sessionId: createSessionRef.current.sessionId,
        });
        if (!isSubscribedRef.current || subscriptionKeyRef.current !== `${existingDraftId}:${createSessionRef.current.sessionId}`) {
          attachDraftSubscription(existingDraftId, createSessionRef.current.sessionId, aiRunIdRef.current);
        }
        return;
      }
      verboseAutofillLog("[AddItem] autofill kickoff reusing matching draft", {
        existingDraftId,
        draftPhotoHash,
        photoHash,
      });
      if (!isSubscribedRef.current || subscriptionKeyRef.current !== `${existingDraftId}:${createSessionRef.current.sessionId}`) {
        attachDraftSubscription(existingDraftId, createSessionRef.current.sessionId, aiRunIdRef.current);
      }
      return;
    }

    if (scheduledAutofillHashRef.current === photoHash) {
      return;
    }

    const runId = bumpAiRun();
    aiRunMetaRef.current.set(runId, {
      source: autofillInputSource || "original",
      inputUri: imageUri,
      photoHash,
    });
    setAiDebugRunId(runId);
    setAiDebugInputUri(imageUri);
    setAiDebugInputSource(autofillInputSource);
    const token = {
      sessionId: createSessionRef.current.sessionId,
      requestId: createSessionRef.current.requestId,
    };

    const runAutofill = async () => {
      if (!uid || isEdit) return;
      if (aiRunIdRef.current !== runId) {
        return;
      }
      lastAutofillStartedHashRef.current = photoHash;
      activeAutofillHashRef.current = photoHash;
      const traceId = String(photo.state.photoTraceId ?? "").trim() || null;
      const extractionStartedAt = photoPipelineNow();
      extractionStartedAtByHashRef.current.set(photoHash, extractionStartedAt);
      photo.actions.logPhotoPipelineEvent?.(traceId, "extraction", "start", {
        inputSource: autofillInputSource || "original",
        hasCutoutUri: !!cutoutUri,
        hasNormalizedPreviewUri: !!photo.state.pendingNormalizedPreviewUri,
      });
      setAutofillError(null);
      setLastAutofillSummary("");
      setAiStatus("running");
      setAutofillStatusThrottled("Starting AI autofill…");
      setIsAutofillRunning(true);

      const cacheKey = `${autofillInputSource || "original"}:${photoHash}`;
      const cached = aiCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
        setAutofillStatusThrottled(cached.summary || "AI done");
        setLastAutofillSummary(cached.summary || "");
        setAiStatus("ready");
        setAiStage(null);
        setIsAutofillRunning(false);
        return;
      }

      const attemptId = photo.actions.setUploadingPhoto
        ? (() => {
            photo.actions.setUploadingPhoto(true);
            photo.actions.setUploadError(null);
            return 1;
          })()
        : 1;
      try {
        setAiStage("Color");
        await uploadWithTimeout(
          startDraftAutofill({
            photoHash,
            localPhotoUri: imageUri,
            cleanedLocalUri: cutoutUri,
            normalizedLocalUri: photo.state.pendingNormalizedPreviewUri,
            sourceOriginalLocalUri: photo.state.originalPickedPhotoUri ?? imageUri,
            refinedLocalUri: photo.state.pendingRefinedPhotoUri,
            imageQuality: photo.state.pendingImageQuality,
            productPolish: photo.state.pendingProductPolish,
            traceId,
            originalWidth: photo.state.pendingPhotoWidth,
            token,
            runId,
          }),
          AUTOFILL_TIMEOUT_MS,
          "AI autofill"
        );
        if (aiRunIdRef.current !== runId) {
          return;
        }
        setAiStage("Category");
        setAutofillStatusThrottled("AI autofill running…");
        setIsAutofillRunning(true);
      } catch (error) {
        if (aiRunIdRef.current !== runId) return;
        const message = userFacingAutofillError(
          error,
          "AI autofill couldn’t finish. You can keep editing manually or try again."
        );
        photo.actions.logPhotoPipelineEvent?.(traceId, "extraction", "failure", {
          ...safeErrorData(error),
        }, photoPipelineDuration(extractionStartedAt));
        setAutofillStatusThrottled("AI couldn’t autofill—continue manually");
        setAiStatus("error");
        setAiStage(null);
        setAutofillError(message);
        setIsAutofillRunning(false);
      } finally {
        if (aiRunIdRef.current === runId && activeAutofillHashRef.current === photoHash) {
          activeAutofillHashRef.current = null;
        }
        void attemptId;
        photo.actions.setUploadingPhoto(false);
      }
    };

    if (aiDebounceTimerRef.current) {
      clearTimeout(aiDebounceTimerRef.current);
      aiDebounceTimerRef.current = null;
    }
    scheduledAutofillHashRef.current = photoHash;
    aiDebounceTimerRef.current = setTimeout(() => {
      aiDebounceTimerRef.current = null;
      if (scheduledAutofillHashRef.current === photoHash) {
        scheduledAutofillHashRef.current = null;
      }
      if (aiInteractionTaskRef.current?.cancel) {
        aiInteractionTaskRef.current.cancel();
      }
      aiInteractionTaskRef.current = InteractionManager.runAfterInteractions(() => {
        void runAutofill();
      });
    }, AUTOFILL_DEBOUNCE_MS);
  }, [
    autofillInputSource,
    autofillKick,
    autofillTriggerHash,
    autofillTriggerUri,
    bumpAiRun,
    createSessionRef,
    draftItemId,
    draftPhotoHash,
    isEdit,
    photo,
    startDraftAutofill,
    attachDraftSubscription,
    uid,
    setAutofillStatusThrottled,
  ]);

  useEffect(() => {
    return () => {
      stopDraftSubscription();
      if (aiDebounceTimerRef.current) clearTimeout(aiDebounceTimerRef.current);
      if (autofillStatusDebounceRef.current) clearTimeout(autofillStatusDebounceRef.current);
      if (aiInteractionTaskRef.current?.cancel) aiInteractionTaskRef.current.cancel();
    };
  }, [stopDraftSubscription]);

  const state = {
    draftItemId,
    draftPhotoHash,
    autofillKick,
    ingestionStatus,
    aiStatus,
    aiStage,
    autofillStatus,
    isAutofillRunning,
    lastAutofillSummary,
    autofillError,
    aiPrediction,
    finalPrediction,
    aiDebugRunId,
    aiDebugInputUri,
    aiDebugInputSource,
    aiDebugAspectRatio,
    aiDebugDominantRgb,
    aiDebugCorrectedCategory,
    aiDebugRawPayload,
    aiPattern,
    aiMaterial,
    aiFit,
    aiOccasionTags,
    aiSeasonTags,
    aiColorNeedsReview,
    extractionPartialSuccess,
  };

  const refs = {
    aiRunIdRef,
    snapshotUpdateCountRef,
    isFinalizingRef,
  };

  const actions = {
    setDraftItemId,
    setDraftPhotoHash,
    setIngestionStatus,
    setAiStatus,
    setAiStage,
    setAutofillStatus,
    setIsAutofillRunning,
    setLastAutofillSummary,
    setAutofillError,
    setAiPattern,
    setAiMaterial,
    stopDraftSubscription,
    attachDraftSubscription,
    cleanupDraftDoc,
    cleanupDraftDocIfInactive,
    ensureDraftDocExists,
    resetDraftTracking,
    maybeApplyAutofillFromDraft,
    startDraftAutofill,
    retryAutofill,
    prepareForNewPhoto,
    resetExtractionState,
    resetForLoadedEditItem,
    setAutofillRunningState,
    bumpAiRun,
  };

  return { state, refs, actions };
}
