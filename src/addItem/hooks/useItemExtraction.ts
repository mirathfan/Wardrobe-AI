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
  hasTwoLegRegionCue,
  nearestColorLabel,
  norm,
  normColor,
  normalizeColorList,
  normalizeIngestionStatus,
  parseHexRgb,
  UPLOAD_TIMEOUT_MS,
  uploadWithTimeout,
} from "../controllerShared";
import { db } from "../../lib/firebase";
import { normalizeCategoryForStorage } from "../../lib/items";
import {
  Category,
  isValidCategorySubCategory,
} from "../../shared/wardrobeTaxonomy";
import { uploadItemPhoto } from "../../lib/uploadImage";

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
        await deleteDoc(doc(db, "users", uid, "items", itemId));
      } catch {}
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
    if (activePhotoHash) {
      hashLifecycleRef.current.set(activePhotoHash, {
        status: effectiveStatus,
        draftId: createSessionRef.current.draftId,
      });
      if (effectiveStatus === "failed") {
        terminalFailedHashesRef.current.add(activePhotoHash);
        verboseAutofillLog("[AddItem] autofill terminal failure recorded", {
          activeRunId,
          draftId: createSessionRef.current.draftId,
          photoHash: activePhotoHash,
        });
      } else if (effectiveStatus === "done" || effectiveStatus === "processing") {
        terminalFailedHashesRef.current.delete(activePhotoHash);
      }
    }
    const shouldPreferDoneSnapshot = effectiveStatus === "done";
    setIngestionStatus(effectiveStatus);
    if (effectiveStatus === "pending" || effectiveStatus === "processing") {
      setAiStatus("running");
      setAutofillStatusThrottled("AI autofill running…");
      setIsAutofillRunning(true);
      setAutofillError(null);
      setAiStage("Details");
    } else if (effectiveStatus === "done") {
      setAiStatus("ready");
      setAutofillStatusThrottled("AI done");
      setIsAutofillRunning(false);
      setAutofillError(null);
      setAiStage(null);
    } else if (effectiveStatus === "failed") {
      setAiStatus("error");
      setAutofillStatusThrottled("AI couldn’t autofill—continue manually");
      setIsAutofillRunning(false);
      setAutofillError("AI autofill failed");
      setAiStage(null);
    }
    setAiPattern(norm(data?.pattern) || null);
    setAiMaterial(norm(data?.material) || null);
    setAiFit(norm(data?.fit) || null);
    setAiOccasionTags(Array.isArray(data?.occasionTags) ? data.occasionTags : []);
    setAiSeasonTags(Array.isArray(data?.seasonTags) ? data.seasonTags : []);

    const serverPrimaryUrl = data?.photos?.primaryUrl ?? data?.photoUrl ?? null;
    const serverCleanedPhotoUrl =
      data?.photos?.cleanedUrl ?? data?.photos?.cleanedPhotoUrl ?? null;
    const serverGeneratedCleanedUrl =
      data?.photos?.cleanedUrl ?? data?.photos?.cleanedPhotoUrl ?? null;
    if (serverPrimaryUrl) photo.actions.setPhotoUrl(serverPrimaryUrl);
    if (serverCleanedPhotoUrl) photo.actions.setCleanedPhotoUrl(serverCleanedPhotoUrl);
    if (serverGeneratedCleanedUrl) photo.actions.setServerCleanedUrl(serverGeneratedCleanedUrl);
    if (effectiveStatus !== "done") {
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

    const rawColors = normalizeColorList(data?.colors);
    const rawPrimary = normColor(String(data?.primaryColor ?? ""));
    const colorNeedsReview = Boolean(data?.colorNeedsReview);
    const pixelHex = norm(String(data?.pixelColorHex ?? data?.pixelHex ?? ""));
    const dominantRgb = parseHexRgb(pixelHex);
    const dominantColor = dominantRgb ? nearestColorLabel(dominantRgb) : "";
    const dominantColorLabel = colorNeedsReview ? "" : normColor(dominantColor);
    const warmNeutralDominant = ["Beige", "Brown", "Khaki", "Tan", "Olive"].includes(
      dominantColorLabel
    );
    const filteredRawColors = (colorNeedsReview ? [] : rawColors).filter(
      (color) => !(warmNeutralDominant && (color === "Orange" || color === "Grey"))
    );
    const filteredRawPrimary =
      colorNeedsReview
        ? ""
        : warmNeutralDominant && (rawPrimary === "Orange" || rawPrimary === "Grey")
        ? ""
        : rawPrimary;
    const finalColors = [
      ...filteredRawColors,
      ...(filteredRawPrimary ? [filteredRawPrimary] : []),
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
    const summaryBrand = String(data?.brand ?? "")
      .replace(/\s+/g, " ")
      .trim();
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
    }
    const summaryCategory = norm(locked.category ?? finalCategoryCandidate ?? data?.category);
    const rawSummaryName = norm(data?.name);
    const displayColorForName =
      norm(String(data?.displayColor ?? "")) ||
      (Array.isArray(data?.displayColors)
        ? norm(String(data.displayColors[0] ?? ""))
        : "") ||
      "";
    const summaryName =
      colorNeedsReview
        ? ""
        : rawSummaryName ||
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
            if (existingPrimary) photo.actions.setPhotoUrl(existingPrimary);
            if (existingCleaned) {
              photo.actions.setCleanedPhotoUrl(existingCleaned);
              photo.actions.setServerCleanedUrl(existingCleaned);
            }
            photo.actions.setPendingNormalizedPreviewUri?.(existingNormalized);
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
            saveNormalizedAsCleaned: true,
            originalWidth,
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
        await setDoc(draftRef, draftPayload, { merge: true });
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
          photoHash,
          originalUrl: uploaded.originalUrl,
          primaryUrl: uploaded.primaryUrl,
          cleanedUrl: nextCleanedPhotoUrl,
          normalizedUrl: nextNormalizedPhotoUrl,
          cleanedSource: uploaded.cleanedSource,
        });
        photo.refs.syncedPreviewUriRef.current = localPhotoUri;
        attachDraftSubscription(draftRef.id, params.token.sessionId, runId);
        if (previousDraftId && previousDraftId !== draftRef.id) {
          cleanupDraftDocIfInactive(previousDraftId);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Photo upload failed. Please retry.";
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
  }, []);

  const autofillTriggerUri = useMemo(
    () => photo.state.autofillCutoutUri ?? null,
    [photo.state.autofillCutoutUri]
  );

  const autofillInputSource = useMemo<"cutout" | "original" | "">(
    () => (photo.state.autofillCutoutUri ? "cutout" : ""),
    [photo.state.autofillCutoutUri]
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
        const message =
          error instanceof Error ? error.message : "AI autofill timed out.";
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
