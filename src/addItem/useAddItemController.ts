import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { router } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  InteractionManager,
  LayoutAnimation,
  Platform,
  UIManager,
  unstable_batchedUpdates,
} from "react-native";
import { styles } from "./styles";
import { useAuth } from "../hooks/useAuth";
import { db } from "../lib/firebase";
import { normalizeCategoryForStorage } from "../lib/items";
import {
  Category,
  SUB_CATEGORIES,
  isValidCategorySubCategory,
  wearSlot,
} from "../shared/wardrobeTaxonomy";
import {
  isVisionBackgroundRemovalAvailable,
  removeBackground,
} from "../bg/removeBackground";
import { detectBrandLogo } from "../lib/detectBrandLogo";
import { uploadItemPhoto } from "../lib/uploadImage";

const CATEGORIES: Category[] = Object.values(Category);

const DEFAULT_COLORS = [
  "Black",
  "White",
  "Blue",
  "Grey",
  "Brown",
  "Green",
  "Red",
  "Gold",
  "Beige",
  "Cream",
  "Silver",
];

const OCCASION_OPTIONS = [
  "work",
  "gym",
  "party",
  "date",
  "travel",
  "lounge",
  "formal_event",
  "streetwear",
] as const;

const SEASON_OPTIONS = [
  "summer",
  "winter",
  "spring_fall",
  "all_season",
] as const;

const FIT_OPTIONS = ["slim", "regular", "oversized", "relaxed", "unknown"] as const;
const RISE_OPTIONS = ["low", "mid", "high", "unknown"] as const;
const LEG_SHAPE_OPTIONS = [
  "skinny",
  "tapered",
  "straight",
  "wide",
  "flare",
  "unknown",
] as const;
const SIZE_OPTIONS = ["XXS", "XS", "S", "M", "L", "XL", "XXL"] as const;
const MATERIAL_OPTIONS = [
  "cotton",
  "denim",
  "polyester",
  "wool",
  "leather",
  "linen",
  "nylon",
  "silk",
  "rayon",
  "fleece",
  "unknown",
] as const;
const PATTERN_OPTIONS = [
  "solid",
  "striped",
  "plaid",
  "checked",
  "graphic",
  "logo",
  "text",
  "floral",
  "dots",
  "camouflage",
  "textured",
  "other",
  "unknown",
] as const;

const DEFAULT_REFINE_VALUE = 1 / 3;
const CURRENCIES = ["USD", "INR", "EUR", "GBP", "CAD", "AUD"] as const;
const UPLOAD_TIMEOUT_MS = 25_000;
const CUTOUT_TIMEOUT_MS = 55_000;
const AUTOFILL_TIMEOUT_MS = 20_000;
const AUTOFILL_DEBOUNCE_MS = 500;

type AiStatus = "idle" | "running" | "ready" | "error";
type AutofillSource = "original" | "cutout";

function makeCreateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function norm(s: string) {
  return (s || "").trim();
}

function normColor(s: string) {
  const t = norm(s);
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

function getRefineOptions(value: number) {
  const normalizedValue = Math.max(0, Math.min(1, value));
  const edgeTighten =
    normalizedValue >= 0.8 ? (normalizedValue - 0.8) / 0.2 : 0;
  return {
    threshold: 0.58 + normalizedValue * 0.12,
    cleanupRadius: Math.round(2 + normalizedValue * 2),
    feather: Math.round(normalizedValue * 2),
    edgeTighten,
    maskToAlpha: true,
  };
}

function getRefineRequestKey(uri: string, value: number) {
  const { threshold, cleanupRadius, feather, edgeTighten } = getRefineOptions(value);
  return [
    uri,
    threshold.toFixed(2),
    cleanupRadius,
    feather,
    edgeTighten.toFixed(2),
  ].join("|");
}

function normalizeIngestionStatus(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "processing" ||
    normalized === "done" ||
    normalized === "failed"
  ) {
    return normalized;
  }
  return null;
}

function parseHexRgb(hexValue: string | null | undefined) {
  const hex = String(hexValue ?? "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return { r, g, b };
}

function nearestColorLabel(rgb: { r: number; g: number; b: number }) {
  const { r, g, b } = rgb;
  const brightness = (r + g + b) / 3;
  if (brightness < 20) return "black";

  // Brown correction: dark warm tones were often misread as red.
  if (r > 80 && g > 40 && b < 60 && r > g && g > b) return "brown";

  // Only classify red when red channel is clearly dominant.
  if (r > g * 1.35 && r > b * 1.35 && r > 70) return "red";

  const anchors: { label: string; rgb: [number, number, number] }[] = [
    { label: "black", rgb: [20, 20, 20] },
    { label: "white", rgb: [235, 235, 235] },
    { label: "grey", rgb: [130, 130, 130] },
    { label: "blue", rgb: [60, 90, 170] },
    { label: "green", rgb: [70, 140, 80] },
    { label: "brown", rgb: [120, 75, 45] },
    { label: "beige", rgb: [200, 175, 130] },
    { label: "cream", rgb: [230, 220, 190] },
    { label: "gold", rgb: [190, 155, 70] },
    { label: "silver", rgb: [180, 185, 195] },
  ];
  let best = anchors[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const anchor of anchors) {
    const dr = r - anchor.rgb[0];
    const dg = g - anchor.rgb[1];
    const db = b - anchor.rgb[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = anchor;
    }
  }
  return best.label;
}

function normalizeColorList(values: unknown) {
  if (!Array.isArray(values)) return [] as string[];
  return values.map((v) => normColor(String(v))).filter(Boolean).slice(0, 2);
}

function hasTwoLegRegionCue(data: any) {
  const text = [
    norm(data?.subCategory),
    norm(data?.name),
    norm(data?.title),
    norm(data?.productName),
  ]
    .join(" ")
    .toLowerCase();
  const cues = [
    "pants",
    "trackpants",
    "trousers",
    "joggers",
    "jeans",
    "leggings",
    "sweatpants",
    "cargo",
  ];
  return cues.some((cue) => text.includes(cue));
}

async function uploadWithTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function shortenUri(uri: string | null | undefined) {
  const value = String(uri ?? "");
  if (!value) return "";
  return value.length > 88 ? `...${value.slice(-88)}` : value;
}

function buildPhotoHash(asset: ImagePicker.ImagePickerAsset) {
  return [
    asset.fileSize ?? 0,
    `${asset.width ?? 0}x${asset.height ?? 0}`,
    asset.fileName ?? "",
    asset.assetId ?? "",
  ].join("-");
}

export function useAddItemController({
  editItemId,
}: {
  editItemId: string | null;
}) {
  // Performance fixes:
  // 1) slider now commits expensive refine only on release (no per-drag removeBackground work)
  // 2) snapshot updates are batched with unstable_batchedUpdates to avoid render storms
  // 3) single-flight + debounce + cache keeps autofill stable and prevents duplicate async churn
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isEdit = !!editItemId;
  const renderStartMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();

  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [bgRemovalError, setBgRemovalError] = useState<string | null>(null);

  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [subCategory, setSubCategory] = useState("");
  const [pattern, setPattern] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);

  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [addingCustomColor, setAddingCustomColor] = useState(false);

  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<string>("USD");
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showAttributeSheet, setShowAttributeSheet] = useState<
    null | "material" | "pattern" | "care"
  >(null);
  const [purchaseDate, setPurchaseDate] = useState("");
  const [careTags, setCareTags] = useState<string[]>([]);
  const [occasionTags, setOccasionTags] = useState<string[]>([]);
  const [seasonTags, setSeasonTags] = useState<string[]>([]);
  const [fit, setFit] = useState<string | null>(null);
  const [rise, setRise] = useState<string | null>(null);
  const [legShape, setLegShape] = useState<string | null>(null);
  const [warmthPreference, setWarmthPreference] = useState<number | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cleanedPhotoUrl, setCleanedPhotoUrl] = useState<string | null>(null);
  const [serverCleanedUrl, setServerCleanedUrl] = useState<string | null>(null);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [pendingCleanedPhotoUri, setPendingCleanedPhotoUri] = useState<string | null>(null);
  const [autofillCutoutUri, setAutofillCutoutUri] = useState<string | null>(null);
  const [pendingPhotoWidth, setPendingPhotoWidth] = useState<number | null>(null);
  const [originalPickedPhotoUri, setOriginalPickedPhotoUri] = useState<string | null>(null);
  const [refineValue, setRefineValue] = useState(DEFAULT_REFINE_VALUE);
  const [refiningCutout, setRefiningCutout] = useState(false);
  const [draftItemId, setDraftItemId] = useState<string | null>(null);
  const [draftPhotoHash, setDraftPhotoHash] = useState<string | null>(null);
  const [pendingPhotoHash, setPendingPhotoHash] = useState<string | null>(null);
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
  }>({ category: null, colors: [] });
  const [finalPrediction, setFinalPrediction] = useState<{
    category: string | null;
    colors: string[];
  }>({ category: null, colors: [] });
  const [aiDebugRunId, setAiDebugRunId] = useState<number>(0);
  const [aiDebugInputUri, setAiDebugInputUri] = useState<string>("");
  const [aiDebugInputSource, setAiDebugInputSource] = useState<"cutout" | "original" | "">("");
  const [aiDebugAspectRatio, setAiDebugAspectRatio] = useState<number | null>(null);
  const [aiDebugDominantRgb, setAiDebugDominantRgb] = useState<string>("");
  const [aiDebugCorrectedCategory, setAiDebugCorrectedCategory] = useState<string>("");
  const [aiPattern, setAiPattern] = useState<string | null>(null);
  const [aiMaterial, setAiMaterial] = useState<string | null>(null);
  const [detectedBrand, setDetectedBrand] = useState<string | null>(null);
  const [detectedBrandConfidence, setDetectedBrandConfidence] = useState<number | null>(null);
  const [aiFit, setAiFit] = useState<string | null>(null);
  const [aiOccasionTags, setAiOccasionTags] = useState<string[]>([]);
  const [aiSeasonTags, setAiSeasonTags] = useState<string[]>([]);
  const [duplicateBanner, setDuplicateBanner] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [fabricExpanded, setFabricExpanded] = useState(false);
  const [sizeExpanded, setSizeExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [occasionExpanded, setOccasionExpanded] = useState(false);
  const [seasonExpanded, setSeasonExpanded] = useState(false);
  const [fitExpanded, setFitExpanded] = useState(false);
  const [createSessionId, setCreateSessionId] = useState(() => makeCreateSessionId());
  const lastCompletedRefineKeyRef = useRef("");
  const latestRefineRequestIdRef = useRef(0);
  const refineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPhotoSelectionIdRef = useRef(0);
  const latestUploadAttemptIdRef = useRef(0);
  const aiRunIdRef = useRef(0);
  const lastAutofillStartedHashRef = useRef<string | null>(null);
  const aiDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiInteractionTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const aiCacheRef = useRef(
    new Map<
      string,
      {
        at: number;
        summary: string;
      }
    >()
  );
  const aiRunMetaRef = useRef(
    new Map<
      number,
      {
        source: AutofillSource;
        inputUri: string;
      }
    >()
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
  const subscriptionKeyRef = useRef<string>("");
  const lastDraftFingerprintRef = useRef<string>("");
  const userEditedKeysRef = useRef<Set<string>>(new Set());
  const syncedPreviewUriRef = useRef<string | null>(null);
  const prevEditItemIdRef = useRef<string | null>(null);
  const isFinalizingRef = useRef(false);
  const controllerRenderMetricsRef = useRef({
    lastLogAt: 0,
    renders: 0,
    lastDurationMs: 0,
  });
  const refineExecCountRef = useRef(0);
  const snapshotUpdateCountRef = useRef(0);
  const autofillStatusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutofillStatusRef = useRef<string | null>(null);
  const createSessionRef = useRef({
    sessionId: makeCreateSessionId(),
    requestId: 0,
    draftId: null as string | null,
    unsub: null as (() => void) | null,
  });

  if (createSessionRef.current.sessionId !== createSessionId) {
    createSessionRef.current.sessionId = createSessionId;
  }

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
    !!originalPickedPhotoUri &&
    !!(pendingPhotoUri || pendingCleanedPhotoUri);
  const selectedCategory = category ?? Category.TOP;
  const displayedPattern = pattern ?? aiPattern ?? "Auto (AI)";
  const displayedMaterial = material ?? aiMaterial ?? "Auto (AI)";
  const isPatternAuto = !userEditedKeysRef.current.has("pattern") && !pattern;
  const isMaterialAuto = !userEditedKeysRef.current.has("material") && !material;
  const hasActiveCreateState = useMemo(() => {
    return Boolean(
      draftItemId ||
      createSessionRef.current.draftId ||
      originalPickedPhotoUri ||
      pendingPhotoUri ||
      pendingCleanedPhotoUri ||
      cleanedPhotoUrl ||
      serverCleanedUrl ||
      photoUrl ||
      photoUri ||
      refiningCutout ||
      loading ||
      uploadingPhoto
    );
  }, [
    cleanedPhotoUrl,
    draftItemId,
    loading,
    originalPickedPhotoUri,
    pendingCleanedPhotoUri,
    pendingPhotoUri,
    photoUri,
    photoUrl,
    refiningCutout,
    serverCleanedUrl,
    uploadingPhoto,
  ]);

  function markUserEdited(...keys: string[]) {
    keys.forEach((key) => userEditedKeysRef.current.add(key));
  }

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

  const beginUploadAttempt = useCallback((label: string) => {
    const attemptId = latestUploadAttemptIdRef.current + 1;
    latestUploadAttemptIdRef.current = attemptId;
    setUploadingPhoto(true);
    setUploadError(null);
    console.log(`[AddItem] upload start: ${label}`, { attemptId });
    return attemptId;
  }, []);

  const endUploadAttempt = useCallback((attemptId: number, label: string) => {
    console.log(`[AddItem] upload finally: ${label}`, { attemptId });
    if (latestUploadAttemptIdRef.current === attemptId) {
      setUploadingPhoto(false);
    }
  }, []);

  function clearUserEdited(...keys: string[]) {
    keys.forEach((key) => userEditedKeysRef.current.delete(key));
  }

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

  async function normalizeImageForCutout(params: {
    uri: string;
    width?: number | null;
    height?: number | null;
  }) {
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
  }

  const runBackgroundRemoval = useCallback(async (params: {
    inputUri: string;
    width?: number | null;
    height?: number | null;
    options: ReturnType<typeof getRefineOptions>;
    tag: string;
  }) => {
    const { inputUri, width, height, options, tag } = params;
    const startedAt = Date.now();
    const inputBytes = await estimateFileSizeBytes(inputUri);
    console.log("[AddItem] cutout start", {
      tag,
      inputUri,
      width: width ?? null,
      height: height ?? null,
      fileSize: inputBytes,
      options,
      timeoutMs: CUTOUT_TIMEOUT_MS,
    });
    const outputUri = await uploadWithTimeout(
      removeBackground(inputUri, options),
      CUTOUT_TIMEOUT_MS,
      "Background removal"
    );
    const durationMs = Date.now() - startedAt;
    const outputBytes = await estimateFileSizeBytes(outputUri);
    console.log("[AddItem] cutout done", {
      tag,
      inputUri,
      outputUri,
      durationMs,
      outputBytes,
      changed: outputUri !== inputUri,
      outputLooksPng: outputUri.toLowerCase().includes(".png"),
    });
    const isPngOutput = /\.png(\?|$)/i.test(outputUri);
    if (!outputUri || outputUri === inputUri || !isPngOutput) {
      throw new Error("BG removal failed");
    }
    return outputUri;
  }, [estimateFileSizeBytes]);

  const retryBackgroundRemoval = useCallback(async () => {
    if (!originalPickedPhotoUri || !canRefineCutout) return;
    const options = getRefineOptions(refineValue);
    const requestId = latestRefineRequestIdRef.current + 1;
    latestRefineRequestIdRef.current = requestId;
    const token = beginAsyncRequest();
    setRefiningCutout(true);
    setBgRemovalError(null);
    try {
      const cutoutUri = await runBackgroundRemoval({
        inputUri: originalPickedPhotoUri,
        width: pendingPhotoWidth,
        height: null,
        options,
        tag: "retry",
      });
      if (requestId !== latestRefineRequestIdRef.current || !isActiveRequest(token)) {
        if (__DEV__) {
          console.log("[AddFlow] ignoring stale async result (session mismatch)");
        }
        return;
      }
      setPendingPhotoUri(cutoutUri);
      setPendingCleanedPhotoUri(cutoutUri);
      setAutofillCutoutUri(cutoutUri);
      setCleanedPhotoUrl(null);
      lastCompletedRefineKeyRef.current = getRefineRequestKey(
        originalPickedPhotoUri,
        refineValue
      );
    } catch (error) {
      setBgRemovalError("BG removal failed");
      console.log("[AddItem] retry background removal failed", error);
    } finally {
      if (requestId === latestRefineRequestIdRef.current) {
        setRefiningCutout(false);
      }
    }
  }, [
    beginAsyncRequest,
    canRefineCutout,
    isActiveRequest,
    originalPickedPhotoUri,
    pendingPhotoWidth,
    refineValue,
    runBackgroundRemoval,
  ]);

  function toggleSection(
    section: "fabric" | "size" | "notes" | "occasion" | "season" | "fit",
    nextValue?: boolean
  ) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (section === "fabric") {
      setFabricExpanded(nextValue ?? !fabricExpanded);
      return;
    }
    if (section === "size") {
      setSizeExpanded(nextValue ?? !sizeExpanded);
      return;
    }
    if (section === "occasion") {
      setOccasionExpanded(nextValue ?? !occasionExpanded);
      return;
    }
    if (section === "season") {
      setSeasonExpanded(nextValue ?? !seasonExpanded);
      return;
    }
    if (section === "fit") {
      setFitExpanded(nextValue ?? !fitExpanded);
      return;
    }
    setNotesExpanded(nextValue ?? !notesExpanded);
  }

  const stopDraftSubscription = useCallback(() => {
    const unsubscribe =
      createSessionRef.current.unsub ?? draftSubscriptionRef.current;
    if (unsubscribe) {
      unsubscribe();
      createSessionRef.current.unsub = null;
      draftSubscriptionRef.current = null;
      isSubscribedRef.current = false;
      subscriptionKeyRef.current = "";
    }
  }, []);

  const attachDraftSubscription = useCallback(
    (itemId: string, sessionId?: string, runId?: number) => {
      if (!uid) return;
      const activeSessionId = sessionId ?? createSessionRef.current.sessionId;
      const nextKey = `${itemId}:${activeSessionId}`;
      if (isSubscribedRef.current && subscriptionKeyRef.current === nextKey) {
        if (__DEV__) {
          console.log("[AddFlow] skip duplicate subscription attach", { nextKey });
        }
        return;
      }
      stopDraftSubscription();
      if (__DEV__) {
        console.log("[AddFlow] attach subscription", { itemId, sessionId: activeSessionId, runId });
      }
      const ref = doc(db, "users", uid, "items", itemId);
      const activeRunId = runId ?? aiRunIdRef.current;
      draftSubscriptionRef.current = onSnapshot(ref, (snap) => {
        if (
          createSessionRef.current.sessionId !== activeSessionId ||
          createSessionRef.current.draftId !== itemId
        ) {
        if (__DEV__) {
          console.log("[AddFlow] ignoring stale async result (session mismatch)");
        }
        return;
      }
      if (!snap.exists()) return;
      snapshotUpdateCountRef.current += 1;
      unstable_batchedUpdates(() => {
        maybeApplyAutofillFromDraft(snap.data() as any, activeRunId);
      });
      });
      createSessionRef.current.unsub = draftSubscriptionRef.current;
      isSubscribedRef.current = true;
      subscriptionKeyRef.current = nextKey;
    },
    [maybeApplyAutofillFromDraft, stopDraftSubscription, uid]
  );

  const beginAsyncRequest = useCallback(() => {
    createSessionRef.current.requestId += 1;
    return {
      sessionId: createSessionRef.current.sessionId,
      requestId: createSessionRef.current.requestId,
    };
  }, []);

  const isActiveRequest = useCallback(
    (token: { sessionId: string; requestId: number }) => {
      return (
        createSessionRef.current.sessionId === token.sessionId &&
        createSessionRef.current.requestId === token.requestId
      );
    },
    []
  );

  const cleanupDraftDoc = useCallback(async (itemId: string | null) => {
    if (!uid || !itemId || isEdit) return;
    try {
      await deleteDoc(doc(db, "users", uid, "items", itemId));
    } catch (error) {
      console.log("[AddItem] best-effort draft cleanup failed:", error);
    }
  }, [isEdit, uid]);

  const resetDraftTracking = useCallback(() => {
    stopDraftSubscription();
    setDraftItemId(null);
    setDraftPhotoHash(null);
    lastDraftFingerprintRef.current = "";
    setIngestionStatus(null);
    setAiPattern(null);
    setAiMaterial(null);
    createSessionRef.current.draftId = null;
    syncedPreviewUriRef.current = null;
  }, [stopDraftSubscription]);

  const resetCreateFlow = useCallback(
    async (
      reason: string,
      options?: {
        deleteActiveDraft?: boolean;
      }
    ) => {
      if (isEdit) return;

      if (__DEV__) {
        console.log(`[AddFlow] reset reason=${reason}`);
      }

      const previousDraftId = createSessionRef.current.draftId ?? draftItemId;
      stopDraftSubscription();

      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
        refineTimeoutRef.current = null;
      }

      createSessionRef.current.requestId += 1;
      createSessionRef.current.draftId = null;
      const nextSessionId = makeCreateSessionId();
      createSessionRef.current.sessionId = nextSessionId;
      setCreateSessionId(nextSessionId);

      setDraftItemId(null);
      setDraftPhotoHash(null);
      setPendingPhotoHash(null);
      setAutofillKick(0);
      lastDraftFingerprintRef.current = "";
      setIngestionStatus(null);
      setAiStatus("idle");
      setAiStage(null);
      setAutofillStatus("AI idle");
      setIsAutofillRunning(false);
      setLastAutofillSummary("");
      setAutofillError(null);
      setAiPrediction({ category: null, colors: [] });
      setFinalPrediction({ category: null, colors: [] });
      setAiDebugRunId(0);
      setAiDebugInputUri("");
      setAiDebugInputSource("");
      setAiDebugAspectRatio(null);
      setAiDebugDominantRgb("");
      setAiDebugCorrectedCategory("");
      setAiPattern(null);
      setAiMaterial(null);
      setBrand("");
      setName("");
      setCategory(null);
      setSubCategory("");
      setPattern(null);
      setMaterial(null);
      setSelectedColors([]);
      setAddingCustomColor(false);
      setSize("");
      setNotes("");
      setPriceAmount("");
      setPriceCurrency("USD");
      setShowCurrencyPicker(false);
      setShowAttributeSheet(null);
      setPurchaseDate("");
      setCareTags([]);
      setOccasionTags([]);
      setSeasonTags([]);
      setFit(null);
      setRise(null);
      setLegShape(null);
      setWarmthPreference(null);
      setPhotoUrl(null);
      setPhotoUri(null);
      setCleanedPhotoUrl(null);
      setServerCleanedUrl(null);
      setPendingPhotoUri(null);
      setPendingCleanedPhotoUri(null);
      setAutofillCutoutUri(null);
      setPendingPhotoWidth(null);
      setOriginalPickedPhotoUri(null);
      setRefineValue(DEFAULT_REFINE_VALUE);
      setRefiningCutout(false);
      setUploadingPhoto(false);
      setUploadError(null);
      setBgRemovalError(null);
      setLoading(false);
      setDetectedBrand(null);
      setDetectedBrandConfidence(null);
      setAiFit(null);
      setAiOccasionTags([]);
      setAiSeasonTags([]);
      setDuplicateBanner(false);
      setAdvancedExpanded(false);
      setOccasionExpanded(false);
      setSeasonExpanded(false);
      setFitExpanded(false);
      lastCompletedRefineKeyRef.current = "";
      latestRefineRequestIdRef.current = 0;
      latestPhotoSelectionIdRef.current = 0;
      aiRunIdRef.current += 1;
      aiLockedValuesRef.current = { runId: aiRunIdRef.current };
      lastAutofillStartedHashRef.current = null;
      aiRunMetaRef.current.clear();
      aiCommittedRef.current = null;
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
      syncedPreviewUriRef.current = null;
      userEditedKeysRef.current.clear();

      if (options?.deleteActiveDraft && previousDraftId) {
        await cleanupDraftDoc(previousDraftId);
      }
    },
    [cleanupDraftDoc, draftItemId, isEdit, stopDraftSubscription]
  );

  const maybeApplyAutofillFromDraft = useCallback((data: any, runId?: number) => {
    const activeRunId = runId ?? aiRunIdRef.current;
    if (activeRunId !== aiRunIdRef.current) {
      console.log(`[AddFlow] ai stale result discarded runId=${activeRunId}`);
      return;
    }
    const fingerprint = JSON.stringify({
      ingestionStatus: normalizeIngestionStatus(data?.ingestion?.status),
      category: norm(data?.category),
      subCategory: norm(data?.subCategory),
      colors: normalizeColorList(data?.colors),
      pattern: norm(data?.pattern),
      material: norm(data?.material),
      fit: norm(data?.fit),
      occasionTags: Array.isArray(data?.occasionTags) ? data.occasionTags : [],
      seasonTags: Array.isArray(data?.seasonTags) ? data.seasonTags : [],
      primaryUrl: norm(data?.photos?.primaryUrl ?? data?.photoUrl),
      cleanedPhotoUrl: norm(data?.photos?.cleanedPhotoUrl ?? data?.photos?.cleanedUrl),
    });
    if (fingerprint === lastDraftFingerprintRef.current) {
      return;
    }
    lastDraftFingerprintRef.current = fingerprint;
    if (aiLockedValuesRef.current.runId !== activeRunId) {
      aiLockedValuesRef.current = { runId: activeRunId };
    }
    const locked = aiLockedValuesRef.current;
    const normalizedStatus = normalizeIngestionStatus(data?.ingestion?.status);
    setIngestionStatus(normalizedStatus);
    if (normalizedStatus === "pending" || normalizedStatus === "processing") {
      setAiStatus("running");
      setAutofillStatusThrottled("AI autofill running…");
      setIsAutofillRunning(true);
      setAutofillError(null);
      setAiStage("Details");
    } else if (normalizedStatus === "done") {
      setAiStatus("ready");
      setAutofillStatusThrottled("AI done");
      setIsAutofillRunning(false);
      setAutofillError(null);
      setAiStage(null);
    } else if (normalizedStatus === "failed") {
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
      data?.photos?.cleanedPhotoUrl ?? data?.photos?.cleanedUrl ?? null;
    const serverGeneratedCleanedUrl = data?.photos?.cleanedUrl ?? null;

    if (serverPrimaryUrl) setPhotoUrl(serverPrimaryUrl);
    if (serverCleanedPhotoUrl) setCleanedPhotoUrl(serverCleanedPhotoUrl);
    if (serverGeneratedCleanedUrl) setServerCleanedUrl(serverGeneratedCleanedUrl);

    const rawIncomingCategory = data?.category
      ? normalizeCategoryForStorage(data.category)
      : null;
    const bboxW = Number(data?.bbox?.w ?? data?.bbox?.width ?? 0);
    const bboxH = Number(data?.bbox?.h ?? data?.bbox?.height ?? 0);
    const aspectRatio = bboxW > 0 && bboxH > 0 ? bboxH / bboxW : null;
    const twoLegCue = hasTwoLegRegionCue(data);
    let finalCategoryCandidate = rawIncomingCategory;
    if (
      rawIncomingCategory &&
      rawIncomingCategory !== Category.BOTTOM &&
      aspectRatio != null &&
      aspectRatio > 1.6 &&
      twoLegCue
    ) {
      finalCategoryCandidate = Category.BOTTOM;
      setAiDebugCorrectedCategory(Category.BOTTOM);
      console.log("[AddFlow] category corrected by silhouette heuristic");
    } else {
      setAiDebugCorrectedCategory("");
    }
    setAiDebugAspectRatio(aspectRatio);

    const rawColors = normalizeColorList(data?.colors);
    const rawPrimary = normColor(String(data?.primaryColor ?? ""));
    const pixelHex = norm(String(data?.pixelColorHex ?? data?.pixelHex ?? ""));
    const dominantRgb = parseHexRgb(pixelHex);
    const dominantColor = dominantRgb ? nearestColorLabel(dominantRgb) : "";
    const finalColors = [
      ...(dominantColor ? [normColor(dominantColor)] : []),
      ...rawColors,
      ...(rawPrimary ? [rawPrimary] : []),
    ].filter((value, index, arr) => value && arr.indexOf(value) === index).slice(0, 2);
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
    });
    setFinalPrediction({
      category: finalCategoryCandidate,
      colors: finalColors,
    });

    if (!userEditedKeysRef.current.has("category") && !category && finalCategoryCandidate) {
      const categoryConflict =
        !!committed?.category && committed.category !== finalCategoryCandidate;
      const shouldKeepCommittedCategory =
        categoryConflict &&
        ((incomingSource === "original" && committed.source === "cutout") ||
          categoryConfDelta < 0.18);
      if (shouldKeepCommittedCategory) {
        finalCategoryCandidate = committed?.category as Category;
      }
      if (!locked.category || locked.category === finalCategoryCandidate) {
        setCategory(finalCategoryCandidate);
        locked.category = finalCategoryCandidate;
      }
    }
    const incomingPattern = norm(data?.pattern);
    if (!userEditedKeysRef.current.has("pattern") && !pattern && incomingPattern) {
      if (!locked.pattern || locked.pattern === incomingPattern) {
        setPattern(incomingPattern);
        locked.pattern = incomingPattern;
      }
    }
    const incomingMaterial = norm(data?.material);
    if (!userEditedKeysRef.current.has("material") && !material && incomingMaterial) {
      if (!locked.material || locked.material === incomingMaterial) {
        setMaterial(incomingMaterial);
        locked.material = incomingMaterial;
      }
    }
    if (!userEditedKeysRef.current.has("fit") && !fit && norm(data?.fit)) {
      setFit(norm(data.fit));
    }
    if (
      !userEditedKeysRef.current.has("occasionTags") &&
      occasionTags.length === 0 &&
      Array.isArray(data?.occasionTags) &&
      data.occasionTags.length
    ) {
      setOccasionTags(data.occasionTags);
    }
    if (
      !userEditedKeysRef.current.has("seasonTags") &&
      seasonTags.length === 0 &&
      Array.isArray(data?.seasonTags) &&
      data.seasonTags.length
    ) {
      setSeasonTags(data.seasonTags);
    }

    const normalizedCategory = finalCategoryCandidate ?? selectedCategory;
    const serverSubCategory = norm(data?.subCategory);
    if (
      !userEditedKeysRef.current.has("subCategory") &&
      !subCategory &&
      serverSubCategory &&
      isValidCategorySubCategory(normalizedCategory, serverSubCategory)
    ) {
      if (!locked.subCategory || locked.subCategory === serverSubCategory) {
        setSubCategory(serverSubCategory);
        locked.subCategory = serverSubCategory;
      }
    }

    const colorSource = String(data?.colorSource ?? "").trim().toLowerCase();
    if (
      colorSource !== "user" &&
      !userEditedKeysRef.current.has("colors") &&
      selectedColors.length === 0
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
        if (!locked.colors || lockedColorKey === incomingColorKey) {
          setSelectedColors(resolvedColors);
          locked.colors = resolvedColors;
        }
      }
    }

    const summaryParts: string[] = [];
    const summaryBrand = norm(data?.brand);
    if (summaryBrand && !userEditedKeysRef.current.has("brand") && !brand) {
      if (!locked.brand || locked.brand === summaryBrand) {
        setBrand(summaryBrand);
        locked.brand = summaryBrand;
      }
    }
    const summaryCategory = norm(locked.category ?? finalCategoryCandidate ?? data?.category);
    const summaryColors: string[] =
      locked.colors && locked.colors.length
        ? locked.colors
        : finalColors;
    if (summaryBrand) summaryParts.push(summaryBrand);
    if (summaryCategory) summaryParts.push(summaryCategory);
    if (summaryColors.length) summaryParts.push(summaryColors.slice(0, 2).join("/"));
    if (summaryParts.length) {
      const summary = `AI found: ${summaryParts.join(" • ")}`;
      setLastAutofillSummary(summary);
      if (normalizedStatus === "pending" || normalizedStatus === "processing") {
        setAutofillStatusThrottled(summary);
      } else if (normalizedStatus === "done") {
        const doneBits = [summaryCategory, summaryColors[0]].filter(Boolean).join(" • ");
        const doneStatus = `AI done: ${doneBits || "ready"}`;
        setAutofillStatusThrottled(doneStatus);
        setAiStatus("ready");
        setAiStage(null);
        const runMetaForCache = aiRunMetaRef.current.get(activeRunId);
        if (runMetaForCache) {
          const cacheKey = `${runMetaForCache.source}:${runMetaForCache.inputUri}`;
          aiCacheRef.current.set(cacheKey, {
            at: Date.now(),
            summary,
          });
        }
        console.log(`[AddFlow] ai done runId=${activeRunId} result=${doneStatus}`);
      }
      if (__DEV__) {
        console.log("[AddItem] partial field updates", {
          summary,
          status: normalizedStatus,
          runId: activeRunId,
        });
      }
    }
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
  }, [
    brand,
    category,
    fit,
    material,
    occasionTags.length,
    pattern,
    seasonTags.length,
    selectedCategory,
    selectedColors.length,
    subCategory,
    setAutofillStatusThrottled,
  ]);

  const startDraftAutofill = useCallback(
    async (params: {
      photoHash: string;
      localPreviewUri: string;
      cleanedLocalUri: string | null;
      originalWidth: number | null;
      token: { sessionId: string; requestId: number };
      runId?: number;
    }) => {
      if (!uid || isEdit) return;
      const runId = params.runId ?? aiRunIdRef.current;
      if (runId !== aiRunIdRef.current) {
        console.log(`[AddFlow] ai stale result discarded runId=${runId}`);
        return;
      }
      let failingStep = "upload";
      console.log("[Draft] start autofill", {
        hasCleanedLocalUri: !!params.cleanedLocalUri,
        photoHash: params.photoHash,
        sessionId: params.token.sessionId,
        requestId: params.token.requestId,
        runId,
      });
      try {
        const {
          photoHash,
          localPreviewUri,
          cleanedLocalUri,
          originalWidth,
          token,
        } = params;

        if (draftPhotoHash === photoHash && draftItemId) {
          return;
        }

        const previousDraftId = draftItemId;
        resetDraftTracking();

        const draftRef = doc(collection(db, "users", uid, "items"));
        const uploaded = await uploadWithTimeout(
          uploadItemPhoto({
            uid,
            itemId: draftRef.id,
            localUri: localPreviewUri,
            cleanedLocalUri,
            originalWidth,
          }),
          UPLOAD_TIMEOUT_MS,
          "Photo upload"
        );

        if (runId !== aiRunIdRef.current || !isActiveRequest(token)) {
          if (__DEV__) {
            console.log(`[AddFlow] ai stale result discarded runId=${runId}`);
          }
          return;
        }

        const now = Date.now();
        const nextCleanedPhotoUrl = uploaded.cleanedUrl;
        failingStep = "create";
        console.log("[Draft] create", {
          itemId: draftRef.id,
          photoHash,
          hasCleanedUrl: !!nextCleanedPhotoUrl,
          runId,
        });
        await setDoc(draftRef, {
          photoUrl: uploaded.primaryUrl,
          photoUri: null,
          createdAt: now,
          updatedAt: now,
          status: "AVAILABLE",
          category: Category.TOP,
          wearCountSinceWash: 0,
          lastWornDate: null,
          lastWashedDate: null,
          lastWashedAt: null,
          isDraft: true,
          photos: {
            primaryUrl: uploaded.primaryUrl,
            urls: [uploaded.primaryUrl],
            ...(nextCleanedPhotoUrl
              ? {
                  cleanedPhotoUrl: nextCleanedPhotoUrl,
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
        });

        if (runId !== aiRunIdRef.current || !isActiveRequest(token)) {
          if (__DEV__) {
            console.log(`[AddFlow] ai stale result discarded runId=${runId}`);
          }
          void cleanupDraftDoc(draftRef.id);
          return;
        }

        setDraftItemId(draftRef.id);
        setDraftPhotoHash(photoHash);
        createSessionRef.current.draftId = draftRef.id;
        setIngestionStatus("pending");
        setPhotoUrl(uploaded.primaryUrl);
        setCleanedPhotoUrl(nextCleanedPhotoUrl);
        syncedPreviewUriRef.current = localPreviewUri;

        const draftSessionId = token.sessionId;
        attachDraftSubscription(draftRef.id, draftSessionId, runId);

        if (previousDraftId && previousDraftId !== draftRef.id) {
          void cleanupDraftDoc(previousDraftId);
        }
        console.log("[Draft] autofill success", { itemId: draftRef.id, runId });
        setUploadError(null);
      } catch (error) {
        console.log(`[Draft] failed step=${failingStep}`, error);
        const message =
          error instanceof Error ? error.message : "Photo upload failed. Please retry.";
        setUploadError(message);
        throw error;
      } finally {
        console.log("[Draft] autofill finally");
      }
    },
    [
      attachDraftSubscription,
      cleanupDraftDoc,
      draftItemId,
      draftPhotoHash,
      isActiveRequest,
      isEdit,
      resetDraftTracking,
      uid,
    ]
  );

  useEffect(() => {
    (async () => {
      try {
        if (!isEdit) return;
        if (!uid) {
          router.replace("/(auth)/login");
          return;
        }

        setLoading(true);
        const ref = doc(db, "users", uid, "items", String(editItemId));
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          Alert.alert("Not found", "This item no longer exists.");
          router.back();
          return;
        }

        const data = snap.data() as any;

        setBrand(data.brand ?? "");
        setName(data.name ?? "");
        const loadedCategory = normalizeCategoryForStorage(data.category);
        setCategory(loadedCategory);
        setPattern(norm(data.pattern) || null);
        setMaterial(norm(data.material) || null);
        setSubCategory(
          isValidCategorySubCategory(loadedCategory, data.subCategory)
            ? data.subCategory
            : ""
        );

        const loadedColors: string[] =
          Array.isArray(data.colors) && data.colors.length
            ? data.colors.map(normColor).filter(Boolean)
            : data.primaryColor
              ? [normColor(data.primaryColor)]
              : [];

        setSelectedColors(loadedColors);
        setAddingCustomColor(false);

        setSize(data.size ?? "");
        setNotes(data.notes ?? "");
        setPriceAmount(
          data.priceAmount != null
            ? String(data.priceAmount)
            : data.price != null
              ? String(data.price)
              : ""
        );
        setPriceCurrency(data.priceCurrency ?? "USD");
        setPurchaseDate(data.purchaseDate ?? "");
        setOccasionTags(Array.isArray(data.occasionTags) ? data.occasionTags : []);
        setSeasonTags(Array.isArray(data.seasonTags) ? data.seasonTags : []);
        setFit(norm(data.fit) || null);
        setRise(norm(data.rise) || null);
        setLegShape(norm(data.legShape) || null);
        setWarmthPreference(
          typeof data.warmthPreference === "number" ? data.warmthPreference : null
        );
        setAiFit(null);
        setAiOccasionTags([]);
        setAiSeasonTags([]);
        setDuplicateBanner(false);

        setPhotoUrl(data.photoUrl ?? null);
        setPhotoUri(data.photoUri ?? null);
        setCleanedPhotoUrl(data.photos?.cleanedPhotoUrl ?? null);
        setServerCleanedUrl(data.photos?.cleanedUrl ?? null);
        setPendingPhotoUri(null);
        setPendingCleanedPhotoUri(null);
        setPendingPhotoWidth(null);
        setOriginalPickedPhotoUri(null);
        setRefineValue(DEFAULT_REFINE_VALUE);
      } catch (e: any) {
        console.log(e);
        Alert.alert("Error", e?.message ?? "Failed to load item");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, editItemId, uid, resetCreateFlow]);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    return () => {
      stopDraftSubscription();
      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
      }
      if (aiDebounceTimerRef.current) {
        clearTimeout(aiDebounceTimerRef.current);
      }
      if (autofillStatusDebounceRef.current) {
        clearTimeout(autofillStatusDebounceRef.current);
      }
      if (aiInteractionTaskRef.current?.cancel) {
        aiInteractionTaskRef.current.cancel();
      }
    };
  }, [stopDraftSubscription]);

  useEffect(() => {
    if (!__DEV__) return;
    const interval = setInterval(() => {
      console.log(
        `[Perf] AddController refine/min=${refineExecCountRef.current} snapshot/min=${snapshotUpdateCountRef.current}`
      );
      refineExecCountRef.current = 0;
      snapshotUpdateCountRef.current = 0;
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const autofillTriggerUri = useMemo(
    () => autofillCutoutUri ?? originalPickedPhotoUri ?? null,
    [autofillCutoutUri, originalPickedPhotoUri]
  );
  const autofillInputSource = useMemo<"cutout" | "original" | "">(
    () => (autofillCutoutUri ? "cutout" : originalPickedPhotoUri ? "original" : ""),
    [autofillCutoutUri, originalPickedPhotoUri]
  );
  const autofillTriggerHash = useMemo(() => {
    if (!autofillTriggerUri) return null;
    return `${autofillInputSource || "original"}:${autofillTriggerUri}`;
  }, [autofillInputSource, autofillTriggerUri]);

  useEffect(() => {
    if (!autofillTriggerUri) return;
    console.log(`[AddFlow] photoUri=${autofillTriggerUri}`);
  }, [autofillTriggerUri]);

  useEffect(() => {
    if (!uid || isEdit) return;
    if (draftItemId) return;
    if (!autofillTriggerUri) return;

    const imageUri = autofillTriggerUri;
    if (!imageUri) return;
    const cutoutUri =
      autofillCutoutUri && autofillCutoutUri !== originalPickedPhotoUri
        ? autofillCutoutUri
        : null;
    const photoHash = autofillTriggerHash;
    if (!photoHash) return;
    if (lastAutofillStartedHashRef.current === photoHash) return;

    lastAutofillStartedHashRef.current = photoHash;
    const runId = aiRunIdRef.current + 1;
    aiRunIdRef.current = runId;
    aiLockedValuesRef.current = { runId };
    aiRunMetaRef.current.set(runId, {
      source: autofillInputSource || "original",
      inputUri: imageUri,
    });
    setAiDebugRunId(runId);
    setAiDebugInputUri(imageUri);
    setAiDebugInputSource(autofillInputSource);
    const token = beginAsyncRequest();

    console.log(`[AddFlow] ai start runId=${runId} input=${imageUri}`);

    const runAutofill = async () => {
      if (!uid || isEdit) return;
      if (aiRunIdRef.current !== runId || !isActiveRequest(token)) {
        console.log(`[AddFlow] ai stale result discarded runId=${runId}`);
        return;
      }

      setAutofillError(null);
      setLastAutofillSummary("");
      setAiStatus("running");
      setAutofillStatusThrottled("Starting AI autofill…");
      setIsAutofillRunning(true);
      console.log("[AddItem] autofillStart", {
        runId,
        photoHash,
        imageUri,
        cutoutUri,
      });

      const cacheKey = `${autofillInputSource || "original"}:${imageUri}`;
      const cached = aiCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < 5 * 60 * 1000) {
        setAutofillStatusThrottled(cached.summary || "AI done");
        setLastAutofillSummary(cached.summary || "");
        setAiStatus("ready");
        setAiStage(null);
        setIsAutofillRunning(false);
        console.log(`[AddFlow] ai done runId=${runId} result=cache-hit`);
        return;
      }

      const attemptId = beginUploadAttempt("draft-autofill");
      try {
        setAiStage("Color");
        await uploadWithTimeout(
          startDraftAutofill({
            photoHash,
            localPreviewUri: imageUri,
            cleanedLocalUri: cutoutUri,
            originalWidth: pendingPhotoWidth,
            token,
            runId,
          }),
          AUTOFILL_TIMEOUT_MS,
          "AI autofill"
        );

        if (aiRunIdRef.current !== runId || !isActiveRequest(token)) {
          console.log(`[AddFlow] ai stale result discarded runId=${runId}`);
          return;
        }
        setAiStage("Category");
        setAutofillStatusThrottled("AI autofill running…");
        setIsAutofillRunning(true);
      } catch (error) {
        if (aiRunIdRef.current !== runId || !isActiveRequest(token)) {
          console.log(`[AddFlow] ai stale result discarded runId=${runId}`);
          return;
        }
        const message =
          error instanceof Error ? error.message : "AI autofill timed out.";
        setAutofillStatusThrottled("AI couldn’t autofill—continue manually");
        setAiStatus("error");
        setAiStage(null);
        setAutofillError(message);
        setIsAutofillRunning(false);
        console.log("[AddItem] autofill error", error);
      } finally {
        console.log("[AddItem] autofill finally", { runId });
        endUploadAttempt(attemptId, "draft-autofill");
      }
    };
    if (aiDebounceTimerRef.current) {
      clearTimeout(aiDebounceTimerRef.current);
      aiDebounceTimerRef.current = null;
    }
    aiDebounceTimerRef.current = setTimeout(() => {
      aiDebounceTimerRef.current = null;
      if (aiInteractionTaskRef.current?.cancel) {
        aiInteractionTaskRef.current.cancel();
      }
      aiInteractionTaskRef.current = InteractionManager.runAfterInteractions(() => {
        void runAutofill();
      });
    }, AUTOFILL_DEBOUNCE_MS);
  }, [
    beginUploadAttempt,
    beginAsyncRequest,
    autofillKick,
    autofillCutoutUri,
    autofillTriggerHash,
    autofillInputSource,
    autofillTriggerUri,
    draftItemId,
    endUploadAttempt,
    isActiveRequest,
    isEdit,
    originalPickedPhotoUri,
    pendingPhotoWidth,
    setAutofillStatusThrottled,
    startDraftAutofill,
    uid,
  ]);

  const syncDraftProgress = useCallback(async () => {
    if (!uid || isEdit || !draftItemId) return;
    try {
      const draftRef = doc(db, "users", uid, "items", draftItemId);
      await updateDoc(draftRef, {
        brand: norm(brand) || "",
        name: norm(name) || "",
        category: category ?? Category.TOP,
        subCategory: isValidCategorySubCategory(selectedCategory, subCategory)
          ? subCategory
          : null,
        colors: selectedColors.map(normColor).filter(Boolean),
        pattern: norm(pattern) || null,
        material: norm(material) || null,
        size: norm(size) || null,
        notes: norm(notes) || null,
        priceAmount: parsePriceToNumber(priceAmount),
        priceCurrency,
        purchaseDate: parsePurchaseDate(purchaseDate) === "INVALID" ? null : parsePurchaseDate(purchaseDate),
        ...(occasionTags.length ? { occasionTags } : {}),
        ...(seasonTags.length ? { seasonTags } : {}),
        ...(fit ? { fit } : {}),
        ...(rise ? { rise } : {}),
        ...(legShape ? { legShape } : {}),
        ...(warmthPreference != null ? { warmthPreference } : {}),
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.log("[AddFlow] draft sync on blur failed", error);
    }
  }, [
    brand,
    category,
    draftItemId,
    fit,
    isEdit,
    legShape,
    material,
    name,
    notes,
    occasionTags,
    pattern,
    priceAmount,
    priceCurrency,
    purchaseDate,
    rise,
    seasonTags,
    selectedCategory,
    selectedColors,
    size,
    subCategory,
    uid,
    warmthPreference,
  ]);

  const onScreenFocus = useCallback(() => {
    const prevEdit = prevEditItemIdRef.current;
    const nowEdit = editItemId ?? null;
    prevEditItemIdRef.current = nowEdit;

    setShowCurrencyPicker(false);
    setShowAttributeSheet(null);

    if (nowEdit) return;
    if (!hasActiveCreateState && prevEdit && !nowEdit) {
      void resetCreateFlow("focus-create-after-edit");
      return;
    }

    const existingDraftId = createSessionRef.current.draftId ?? draftItemId;
    if (existingDraftId && uid) {
      createSessionRef.current.draftId = existingDraftId;
      const sessionId = createSessionRef.current.sessionId;
      void getDoc(doc(db, "users", uid, "items", existingDraftId)).then((snap) => {
        if (!snap.exists()) return;
        if (createSessionRef.current.sessionId !== sessionId) return;
        maybeApplyAutofillFromDraft(snap.data() as any);
      });
      attachDraftSubscription(existingDraftId, sessionId, aiRunIdRef.current);
    }
  }, [
    attachDraftSubscription,
    draftItemId,
    editItemId,
    hasActiveCreateState,
    maybeApplyAutofillFromDraft,
    resetCreateFlow,
    uid,
  ]);

  const onScreenBlur = useCallback(() => {
    createSessionRef.current.requestId += 1;
    if (refineTimeoutRef.current) {
      clearTimeout(refineTimeoutRef.current);
      refineTimeoutRef.current = null;
    }
    setShowCurrencyPicker(false);
    setShowAttributeSheet(null);
    setRefiningCutout(false);
    stopDraftSubscription();

    const isDirty =
      !!pendingPhotoUri ||
      !!brand ||
      !!name ||
      !!category ||
      !!subCategory ||
      selectedColors.length > 0 ||
      !!pattern ||
      !!material ||
      !!size ||
      !!notes;
    if (isDirty && !isFinalizingRef.current) {
      void syncDraftProgress();
    }
  }, [
    brand,
    category,
    material,
    name,
    notes,
    pattern,
    pendingPhotoUri,
    selectedColors.length,
    size,
    stopDraftSubscription,
    subCategory,
    syncDraftProgress,
  ]);

  const colorOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_COLORS.map(normColor));
    selectedColors.forEach((c) => set.add(normColor(c)));
    return Array.from(set);
  }, [selectedColors]);

  const warmthLabel = useMemo(() => {
    if (warmthPreference == null) return "Auto";
    if (warmthPreference < 0.34) return "Light";
    if (warmthPreference < 0.67) return "Balanced";
    return "Warm";
  }, [warmthPreference]);

  const hasPhoto = useMemo(
    () =>
      !!(
        pendingCleanedPhotoUri ||
        pendingPhotoUri ||
        photoUri ||
        cleanedPhotoUrl ||
        serverCleanedUrl ||
        photoUrl
      ),
    [
      cleanedPhotoUrl,
      pendingCleanedPhotoUri,
      pendingPhotoUri,
      photoUri,
      photoUrl,
      serverCleanedUrl,
    ]
  );
  const aiHasCategory = useMemo(() => !!category, [category]);
  const aiHasColors = useMemo(() => selectedColors.length > 0, [selectedColors.length]);
  const showBasics = hasPhoto;
  const showDetails = hasPhoto;
  const showAdvanced = showDetails && advancedExpanded;

  const setupProgress = useMemo(() => {
    const slots = [
      hasPhoto,
      aiHasCategory,
      aiHasColors,
      !!norm(brand) || !!norm(name),
      !!norm(material) || !!norm(pattern),
    ];
    const completed = slots.filter(Boolean).length;
    const total = slots.length;
    const ratio = completed / total;
    return {
      completed,
      total,
      ratio,
      percent: Math.round(ratio * 100),
    };
  }, [aiHasCategory, aiHasColors, brand, hasPhoto, material, name, pattern]);

  const advancedDone = useMemo(
    () =>
      !!(
        norm(pattern) ||
        norm(material) ||
        occasionTags.length > 0 ||
        seasonTags.length > 0 ||
        fit ||
        rise ||
        legShape ||
        norm(size) ||
        norm(notes)
      ),
    [fit, legShape, material, notes, occasionTags.length, pattern, rise, seasonTags.length, size]
  );

  const requiredChecklist = useMemo(
    () => [
      { id: "photo", label: "Photo", done: hasPhoto, rowId: "photo" },
      { id: "category", label: "Category", done: aiHasCategory, rowId: "details" },
      { id: "colors", label: "Color", done: aiHasColors, rowId: "details" },
      { id: "details", label: "Details", done: showDetails, rowId: "details" },
      { id: "advanced", label: "Advanced", done: advancedDone, rowId: "advanced-toggle" },
    ],
    [advancedDone, aiHasCategory, aiHasColors, hasPhoto, showDetails]
  );

  const nextMissing = useMemo(
    () => requiredChecklist.find((item) => !item.done) ?? null,
    [requiredChecklist]
  );

  const aiSuggestions = useMemo(() => {
    const items: { key: string; label: string; onPress: () => void }[] = [];
    const suggestionOccasion = aiOccasionTags[0];
    if (suggestionOccasion && !occasionTags.includes(suggestionOccasion)) {
      items.push({
        key: `occasion:${suggestionOccasion}`,
        label: suggestionOccasion.replace(/_/g, " "),
        onPress: () => {
          markUserEdited("occasionTags");
          setOccasionTags((prev) => (prev.includes(suggestionOccasion) ? prev : [...prev, suggestionOccasion]));
        },
      });
    }
    const suggestionSeason = aiSeasonTags[0];
    if (suggestionSeason && !seasonTags.includes(suggestionSeason)) {
      items.push({
        key: `season:${suggestionSeason}`,
        label: suggestionSeason.replace(/_/g, " "),
        onPress: () => {
          markUserEdited("seasonTags");
          setSeasonTags((prev) => (prev.includes(suggestionSeason) ? prev : [...prev, suggestionSeason]));
        },
      });
    }
    if (aiFit && fit !== aiFit) {
      items.push({
        key: `fit:${aiFit}`,
        label: `${aiFit} fit`,
        onPress: () => {
          markUserEdited("fit");
          setFit(aiFit);
        },
      });
    }
    return items.slice(0, 4);
  }, [aiFit, aiOccasionTags, aiSeasonTags, fit, occasionTags, seasonTags]);

  const aiStatusRows = useMemo(() => {
    if (aiStatus === "error" || ingestionStatus === "failed") {
      return ["⚠️ AI failed — you can fill manually"];
    }
    if (aiStatus === "running" || ingestionStatus === "pending" || ingestionStatus === "processing") {
      return [
        aiHasColors ? "✓ Color ready" : aiStage === "Color" ? "✨ Color…" : "✨ Detecting colors...",
        aiHasCategory ? "✓ Category ready" : aiStage === "Category" ? "✨ Category…" : "✨ Detecting category...",
        aiPattern || aiMaterial || aiStage === "Details"
          ? "✓ Details ready"
          : "✨ Details…",
      ];
    }
    if (aiStatus === "ready" || ingestionStatus === "done") {
      return [
        aiHasCategory ? "✓ Category detected" : "⚠️ Category missing",
        aiHasColors ? "✓ Colors detected" : "⚠️ Colors missing",
        aiPattern || aiMaterial
          ? "✓ Material/pattern detected"
          : "⚠️ Material/pattern missing",
      ];
    }
    return [];
  }, [aiHasCategory, aiHasColors, aiMaterial, aiPattern, aiStage, aiStatus, ingestionStatus]);

  const aiStatusPill = useMemo(() => {
    if (aiStatus === "error" || ingestionStatus === "failed") {
      return { label: "AI failed — fill manually", tone: "error" as const };
    }
    if (aiStatus === "running" || ingestionStatus === "pending" || ingestionStatus === "processing") {
      return { label: "AI filling details…", tone: "running" as const };
    }
    if ((aiStatus === "ready" || ingestionStatus === "done") && aiSuggestions.length > 0) {
      return { label: "AI suggestions ready", tone: "ready" as const };
    }
    if (aiStatus === "ready" || ingestionStatus === "done") {
      return { label: "AI ready", tone: "ready" as const };
    }
    return { label: "AI idle", tone: "idle" as const };
  }, [aiStatus, aiSuggestions.length, ingestionStatus]);

  const canApplyAiSuggestions = ingestionStatus === "done" && aiSuggestions.length > 0;
  const touched = {
    categoryTouched: userEditedKeysRef.current.has("category"),
    subCategoryTouched: userEditedKeysRef.current.has("subCategory"),
    colorsTouched: userEditedKeysRef.current.has("colors"),
    brandTouched: userEditedKeysRef.current.has("brand"),
    patternTouched: userEditedKeysRef.current.has("pattern"),
    materialTouched: userEditedKeysRef.current.has("material"),
  };

  const applyAiSuggestions = useCallback(() => {
    aiSuggestions.forEach((suggestion) => suggestion.onPress());
  }, [aiSuggestions]);

  function toggleColor(c: string) {
    const color = normColor(c);
    if (!color) return;
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((x) => x !== color) : [...prev, color]
    );
  }

  function scheduleRefine(value: number, immediate = false) {
    if (!canRefineCutout || !originalPickedPhotoUri) return;

    const normalizedValue = Math.max(0, Math.min(1, value));
    const { threshold, cleanupRadius, feather, edgeTighten, maskToAlpha } =
      getRefineOptions(normalizedValue);
    const requestKey = getRefineRequestKey(originalPickedPhotoUri, normalizedValue);
    if (lastCompletedRefineKeyRef.current === requestKey) return;

    const requestId = latestRefineRequestIdRef.current + 1;
    latestRefineRequestIdRef.current = requestId;
    const token = beginAsyncRequest();

    if (refineTimeoutRef.current) {
      clearTimeout(refineTimeoutRef.current);
      refineTimeoutRef.current = null;
    }

    const execute = async () => {
      try {
        refineExecCountRef.current += 1;
        setRefiningCutout(true);
        setAiStatus("running");
        setAiStage("Color");
        setAutofillStatusThrottled("Starting AI autofill…");
        setBgRemovalError(null);
        const cutoutUri = await runBackgroundRemoval({
          inputUri: originalPickedPhotoUri,
          width: pendingPhotoWidth,
          height: null,
          options: { threshold, cleanupRadius, feather, edgeTighten, maskToAlpha },
          tag: "refine",
        });
        if (
          requestId !== latestRefineRequestIdRef.current ||
          !isActiveRequest(token)
        ) {
          if (__DEV__) {
            console.log("[AddFlow] ignoring stale async result (session mismatch)");
          }
          return;
        }
        lastCompletedRefineKeyRef.current = requestKey;
        setPendingPhotoUri(cutoutUri);
        setPendingCleanedPhotoUri(cutoutUri);
        if (immediate) {
          setAutofillCutoutUri(cutoutUri);
        }
        setCleanedPhotoUrl(null);
        console.log(
          `[AddItem] refine done value=${normalizedValue.toFixed(2)}, threshold=${threshold.toFixed(2)}, radius=${cleanupRadius}, feather=${feather}, uri=${cutoutUri}`
        );
      } catch (e) {
        if (requestId === latestRefineRequestIdRef.current) {
          setBgRemovalError("BG removal failed");
          console.log(e);
        }
      } finally {
        if (requestId === latestRefineRequestIdRef.current) {
          setRefiningCutout(false);
        }
      }
    };

    if (!immediate) return;
    void execute();
  }

  function handleRefineValueChange(value: number) {
    // Keep dragging lightweight; only commit/call native refine on release.
    if (__DEV__) {
      // no-op to keep API shape from PhotoEditorSection without re-render spam.
      void value;
    }
  }

  function handleRefineValueComplete(value: number) {
    setRefineValue(value);
    scheduleRefine(value, true);
  }

  function handleRefineReset() {
    setRefineValue(DEFAULT_REFINE_VALUE);
    scheduleRefine(DEFAULT_REFINE_VALUE, true);
  }

  async function pickPhoto(source: "library" | "camera") {
    try {
      console.log("[AddItem] pickPhoto start", { source });
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
      if (!isEdit && draftPhotoHash === nextPhotoHash && draftItemId) {
        return;
      }

      const previousSelectionId = latestPhotoSelectionIdRef.current + 1;
      latestPhotoSelectionIdRef.current = previousSelectionId;
      aiRunIdRef.current += 1;
      aiLockedValuesRef.current = { runId: aiRunIdRef.current };
      const token = beginAsyncRequest();
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
      setAutofillCutoutUri(null);
      setPendingPhotoUri(normalizedUri);
      setPendingCleanedPhotoUri(null);
      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
        refineTimeoutRef.current = null;
      }
      const previousDraftId = createSessionRef.current.draftId ?? draftItemId;
      stopDraftSubscription();
      setDraftItemId(null);
      setDraftPhotoHash(null);
      setIngestionStatus(null);
      setAiPattern(null);
      setAiMaterial(null);
      createSessionRef.current.draftId = null;
      syncedPreviewUriRef.current = null;
      latestRefineRequestIdRef.current = 0;
      setRefiningCutout(false);
      const initialOptions = getRefineOptions(DEFAULT_REFINE_VALUE);
      setDetectedBrand(null);
      setDetectedBrandConfidence(null);
      setAutofillError(null);
      setLastAutofillSummary("");
      setAutofillStatus("Starting AI autofill…");
      setAiStatus("running");
      setAiStage("Color");
      setIsAutofillRunning(!isEdit);
      lastAutofillStartedHashRef.current = null;
      setBgRemovalError(null);
      const brandPromise = detectBrandLogo(originalUri).catch((error) => {
        console.log("[BrandDetect] error", error);
        return null;
      });
      let cutoutUri: string | null = null;
      try {
        cutoutUri = await runBackgroundRemoval({
          inputUri: normalizedUri,
          width: effectiveWidth,
          height: effectiveHeight,
          options: initialOptions,
          tag: "pick",
        });
      } catch (error) {
        setBgRemovalError("BG removal failed");
        cutoutUri = null;
        console.log("[AddItem] cutout failed - using original", error);
      }
      if (
        previousSelectionId !== latestPhotoSelectionIdRef.current ||
        !isActiveRequest(token)
      ) {
        if (__DEV__) {
          console.log("[AddFlow] ignoring stale async result (session mismatch)");
        }
        return;
      }
      const finalDisplayUri = cutoutUri || normalizedUri;
      console.log("[AddItem] original image URI:", shortenUri(originalUri));
      console.log("[AddItem] normalized image URI:", shortenUri(normalizedUri));
      console.log("[AddItem] final display/upload URI:", shortenUri(finalDisplayUri));
      lastCompletedRefineKeyRef.current = getRefineRequestKey(
        normalizedUri,
        DEFAULT_REFINE_VALUE
      );
      latestRefineRequestIdRef.current = 0;
      setRefineValue(DEFAULT_REFINE_VALUE);
      setPendingPhotoUri(finalDisplayUri);
      setPendingCleanedPhotoUri(cutoutUri);
      setAutofillCutoutUri(cutoutUri);
      setCleanedPhotoUrl(null);
      setServerCleanedUrl(null);
      setIngestionStatus(isEdit ? null : "pending");
      setPendingPhotoWidth(effectiveWidth);
      const brandResult = await brandPromise;
      if (
        previousSelectionId !== latestPhotoSelectionIdRef.current ||
        !isActiveRequest(token)
      ) {
        if (__DEV__) {
          console.log("[AddFlow] ignoring stale async result (session mismatch)");
        }
        return;
      }
      if (brandResult?.brand) {
        setDetectedBrand(brandResult.brand);
        setDetectedBrandConfidence(
          typeof brandResult.confidence === "number" ? brandResult.confidence : null
        );
        if (!userEditedKeysRef.current.has("brand")) {
          setBrand(brandResult.brand);
        }
      }

      if (!isEdit && uid) {
        console.log("[AddItem] cutoutDone", {
          photoHash: nextPhotoHash,
          cutoutReady: !!cutoutUri,
          cutoutFailed: !cutoutUri,
        });
      } else if (previousDraftId) {
        void cleanupDraftDoc(previousDraftId);
      }
    } catch (e: any) {
      console.log(e);
      setUploadError(e?.message ?? "Failed to process selected photo.");
      setBgRemovalError(e?.message ?? "BG removal failed.");
      setUploadingPhoto(false);
      Alert.alert("Error", e?.message ?? "Failed to pick image");
    } finally {
      console.log("[AddItem] pickPhoto finally");
    }
  }

  async function resolvePhotoFields(currentUid: string, itemId: string) {
    const needsUpload =
      !!pendingPhotoUri &&
      (!photoUrl || syncedPreviewUriRef.current !== pendingPhotoUri);

    if (needsUpload) {
      if (draftItemId) {
        console.log("[Draft] update photos", { itemId });
      }
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
        console.log("[AddItem] saved photos.cleanedPhotoUrl:", uploadedUrl.cleanedUrl);
        console.log("[AddItem] saved photos.cleanedUrl:", serverCleanedUrl);
        setPhotoUrl(uploadedUrl.primaryUrl);
        setCleanedPhotoUrl(uploadedUrl.cleanedUrl);
        syncedPreviewUriRef.current = pendingPhotoUri;
        setUploadError(null);
        console.log("[AddItem] upload success: resolve-photo-fields");
        return {
          photoUrl: uploadedUrl.primaryUrl,
          photoUri: null,
          cleanedPhotoUrl: uploadedUrl.cleanedUrl,
          cleanedUrl: serverCleanedUrl,
        };
      } catch (error) {
        console.log("[AddItem] upload error: resolve-photo-fields", error);
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
        cleanedPhotoUrl: cleanedPhotoUrl,
        cleanedUrl: serverCleanedUrl,
      };
    }

    return {
      photoUrl,
      photoUri,
      cleanedPhotoUrl,
      cleanedUrl: serverCleanedUrl,
    };
  }

  function parsePriceToNumber(s: string) {
    const t = norm(s);
    if (!t) return null;
    const cleaned = t.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }

  function parsePurchaseDate(s: string) {
    const t = norm(s);
    if (!t) return null;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(t);
    if (!ok) return "INVALID";
    return t;
  }

  async function duplicateLastItem() {
    if (!uid || isEdit) return;
    try {
      const itemsRef = collection(db, "users", uid, "items");
      let recentSnap;
      try {
        recentSnap = await getDocs(query(itemsRef, orderBy("createdAt", "desc"), limit(1)));
      } catch {
        recentSnap = await getDocs(query(itemsRef, orderBy("updatedAt", "desc"), limit(1)));
      }
      if (!recentSnap || recentSnap.empty) {
        Alert.alert("No recent items", "Add at least one item first.");
        return;
      }
      const data = recentSnap.docs[0].data() as any;
      setBrand(norm(data.brand) || "");
      setName(norm(data.name) || "");
      setCategory(data.category ? normalizeCategoryForStorage(data.category) : null);
      setSubCategory(norm(data.subCategory) || "");
      setPattern(norm(data.pattern) || null);
      setMaterial(norm(data.material) || null);
      setSelectedColors(Array.isArray(data.colors) ? data.colors.map(normColor).filter(Boolean) : []);
      setSize(norm(data.size) || "");
      setPriceAmount(
        data.priceAmount != null
          ? String(data.priceAmount)
          : data.price != null
            ? String(data.price)
            : ""
      );
      setPriceCurrency(norm(data.priceCurrency) || "USD");
      setPurchaseDate(norm(data.purchaseDate) || "");
      setNotes(norm(data.notes) || "");
      setOccasionTags(Array.isArray(data.occasionTags) ? data.occasionTags : []);
      setSeasonTags(Array.isArray(data.seasonTags) ? data.seasonTags : []);
      setFit(norm(data.fit) || null);
      setRise(norm(data.rise) || null);
      setLegShape(norm(data.legShape) || null);
      setWarmthPreference(
        typeof data.warmthPreference === "number" ? data.warmthPreference : null
      );
      setDuplicateBanner(true);
      markUserEdited(
        "brand",
        "name",
        "category",
        "subCategory",
        "pattern",
        "material",
        "colors",
        "fit",
        "rise",
        "legShape",
        "occasionTags",
        "seasonTags"
      );
    } catch (error) {
      console.log("[AddItem] duplicate last item failed", error);
      Alert.alert("No recent items", "Could not load a recent item.");
    }
  }

  async function retryPhotoUpload() {
    if (!uid || isEdit || !pendingPhotoUri) {
      return;
    }

    const token = beginAsyncRequest();
    const attemptId = beginUploadAttempt("retry-upload");
    try {
      if (draftItemId) {
        const uploaded = await uploadWithTimeout(
          uploadItemPhoto({
            uid,
            itemId: draftItemId,
            localUri: pendingPhotoUri,
            cleanedLocalUri: pendingCleanedPhotoUri,
            originalWidth: pendingPhotoWidth,
          }),
          UPLOAD_TIMEOUT_MS,
          "Retry photo upload"
        );
        await updateDoc(doc(db, "users", uid, "items", draftItemId), {
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
        const runId = aiRunIdRef.current + 1;
        aiRunIdRef.current = runId;
        aiLockedValuesRef.current = { runId };
        await uploadWithTimeout(
          startDraftAutofill({
            photoHash: retryHash,
            localPreviewUri: pendingPhotoUri,
            cleanedLocalUri: pendingCleanedPhotoUri,
            originalWidth: pendingPhotoWidth,
            token,
            runId,
          }),
          UPLOAD_TIMEOUT_MS,
          "Retry draft autofill"
        );
      }
      setUploadError(null);
      console.log("[AddItem] retry upload success");
    } catch (error) {
      console.log("[AddItem] retry upload error", error);
      const message =
        error instanceof Error ? error.message : "Photo upload failed. Please retry.";
      setUploadError(message);
    } finally {
      endUploadAttempt(attemptId, "retry-upload");
    }
  }

  const retryAutofill = useCallback(() => {
    if (isEdit) return;
    lastAutofillStartedHashRef.current = null;
    setAutofillError(null);
    setAiStatus("running");
    setAiStage("Color");
    setAutofillStatus("Starting AI autofill…");
    setAutofillKick((prev) => prev + 1);
  }, [isEdit]);

  async function saveItem() {
    isFinalizingRef.current = true;
    const b = norm(brand);
    const n = norm(name);

    const hasAtLeastOnePhoto = !!(pendingPhotoUri || photoUrl || photoUri);
    if (!hasAtLeastOnePhoto) {
      return Alert.alert("Missing photo", "Add at least one item photo.");
    }

    if (!uid) {
      router.replace("/(auth)/login");
      return Alert.alert("Not signed in", "Please sign in first.");
    }
    const priceNum = parsePriceToNumber(priceAmount);
    const date = parsePurchaseDate(purchaseDate);
    if (date === "INVALID") {
      return Alert.alert(
        "Bad date format",
        "Use YYYY-MM-DD (example: 2025-12-26) or leave it empty."
      );
    }

    const itemsRef = collection(db, "users", uid, "items");
    const itemRef =
      isEdit || draftItemId
        ? doc(db, "users", uid, "items", String(editItemId ?? draftItemId))
        : doc(itemsRef);

    const payloadBase = {
      brand: b || "",
      name: n || "",
      category: category ?? Category.TOP,
      subCategory: isValidCategorySubCategory(selectedCategory, subCategory)
        ? subCategory
        : null,
      wearSlot: wearSlot(category ?? Category.TOP),
      colors: selectedColors.map(normColor).filter(Boolean),
      primaryColor: normColor(selectedColors[0] ?? ""),
      pattern: norm(pattern) || null,
      material: norm(material) || null,
      size: norm(size) || null,
      notes: norm(notes) || null,
      priceAmount: priceNum,
      priceCurrency,
      purchaseDate: date,
      ...(occasionTags.length ? { occasionTags } : {}),
      ...(seasonTags.length ? { seasonTags } : {}),
      ...(fit ? { fit } : {}),
      ...(rise ? { rise } : {}),
      ...(legShape ? { legShape } : {}),
      ...(warmthPreference != null ? { warmthPreference } : {}),
      updatedAt: Date.now(),
    };

    let failingStep = "upload";
    try {
      setLoading(true);

      const nextPhoto = await resolvePhotoFields(uid, itemRef.id);
      const payload = {
        ...payloadBase,
        photoUrl: nextPhoto.photoUrl,
        photoUri: nextPhoto.photoUri,
      };
      console.log("[AddItem] writing photos.cleanedPhotoUrl:", nextPhoto.cleanedPhotoUrl ?? null);
      console.log("[AddItem] writing photos.cleanedUrl:", nextPhoto.cleanedUrl ?? null);

      if (isEdit) {
        failingStep = "finalize";
        const updatePayload: Record<string, any> = {
          ...payload,
          "photos.primaryUrl": nextPhoto.photoUrl,
          "photos.urls": nextPhoto.photoUrl ? [nextPhoto.photoUrl] : [],
          ...(pendingPhotoUri
            ? {
                ingestion: {
                  status: "pending",
                  lastRunAt: Date.now(),
                },
              }
            : {}),
        };
        if (nextPhoto.cleanedPhotoUrl) {
          updatePayload["photos.cleanedPhotoUrl"] = nextPhoto.cleanedPhotoUrl;
        }
        await updateDoc(itemRef, updatePayload);
        Alert.alert("Saved ✅", "Item updated.");
        router.back();
        return;
      }

      if (draftItemId) {
        console.log("[Draft] finalize", { itemId: itemRef.id });
        failingStep = "finalize";
        const updatePayload: Record<string, any> = {
          ...payload,
          "photos.primaryUrl": nextPhoto.photoUrl,
          "photos.urls": nextPhoto.photoUrl ? [nextPhoto.photoUrl] : [],
          isDraft: false,
          updatedAt: Date.now(),
        };
        if (nextPhoto.cleanedPhotoUrl) {
          updatePayload["photos.cleanedPhotoUrl"] = nextPhoto.cleanedPhotoUrl;
        }
        if (pendingPhotoUri && syncedPreviewUriRef.current !== pendingPhotoUri) {
          updatePayload.ingestion = {
            status: "pending",
            lastRunAt: Date.now(),
          };
        }
        await updateDoc(itemRef, updatePayload);
        Alert.alert("Added ✅", "Item added to wardrobe.");
        if (__DEV__) {
          console.log("[AddFlow] save success; resetting");
        }
        await resetCreateFlow("post-save");
        return;
      }

      failingStep = "create";
      await setDoc(itemRef, {
        ...payload,
        photos: {
          primaryUrl: nextPhoto.photoUrl,
          urls: nextPhoto.photoUrl ? [nextPhoto.photoUrl] : [],
          ...(nextPhoto.cleanedPhotoUrl
            ? {
                cleanedPhotoUrl: nextPhoto.cleanedPhotoUrl,
              }
            : {}),
        },
        status: "AVAILABLE",
        wearCountSinceWash: 0,
        createdAt: Date.now(),
        lastWornDate: null,
        lastWashedDate: null,
        lastWashedAt: null,
        ingestion: {
          status: "pending",
          lastRunAt: Date.now(),
        },
      });

      Alert.alert("Added ✅", "Item added to wardrobe.");
      if (__DEV__) {
        console.log("[AddFlow] save success; resetting");
      }
      await resetCreateFlow("post-save");
    } catch (e: any) {
      console.log(`[Draft] failed step=${failingStep}`, e);
      console.log(e);
      Alert.alert(
        "Error",
        e?.message ?? (isEdit ? "Failed to update item" : "Failed to add item")
      );
    } finally {
      setUploadingPhoto(false);
      setLoading(false);
      isFinalizingRef.current = false;
    }
  }

  const hasRequiredPhoto = !!previewPhotoUri;
  const canSave = hasRequiredPhoto && !loading;
  const ctaStatusText = uploadError
    ? "Upload failed. Retry below."
    : uploadingPhoto
      ? "Uploading photo…"
      : refiningCutout || isAutofillRunning || (draftItemId && ingestionStatus && ingestionStatus !== "done" && ingestionStatus !== "failed")
        ? "AI autofill running…"
      : canSave
        ? "Ready to save"
        : "Add a photo to continue";


  const rowKeys = useMemo(() => {
    const rows: { key: string }[] = [{ key: "photo" }];
    if (showBasics) rows.push({ key: "basics" });
    if (showDetails) {
      rows.push({ key: "details" });
      rows.push({ key: "advanced-toggle" });
    }
    if (showAdvanced) {
      rows.push({ key: "fabric-header" });
      if (fabricExpanded) rows.push({ key: "fabric-content" });
      rows.push({ key: "size-header" });
      if (sizeExpanded) rows.push({ key: "size-content" });
      rows.push({ key: "occasion-header" });
      if (occasionExpanded) rows.push({ key: "occasion-content" });
      rows.push({ key: "season-header" });
      if (seasonExpanded) rows.push({ key: "season-content" });
      rows.push({ key: "fit-header" });
      if (fitExpanded) rows.push({ key: "fit-content" });
      rows.push({ key: "notes-header" });
      if (notesExpanded) rows.push({ key: "notes-content" });
    }
    return rows;
  }, [
    showBasics,
    showDetails,
    showAdvanced,
    fabricExpanded,
    sizeExpanded,
    occasionExpanded,
    seasonExpanded,
    fitExpanded,
    notesExpanded,
  ]);

  if (__DEV__) {
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const metrics = controllerRenderMetricsRef.current;
    metrics.renders += 1;
    metrics.lastDurationMs = now - renderStartMs;
    if (now - metrics.lastLogAt >= 1000) {
      console.log(
        `[Perf] AddController renders/sec=${metrics.renders} lastRender=${metrics.lastDurationMs.toFixed(1)}ms`
      );
      metrics.renders = 0;
      metrics.lastLogAt = now;
    }
  }

  const state = {
    uid,
    editItemId,
    isEdit,
    loading,
    uploadingPhoto,
    uploadError,
    bgRemovalError,
    brand,
    name,
    category,
    subCategory,
    pattern,
    material,
    selectedColors,
    addingCustomColor,
    size,
    notes,
    priceAmount,
    priceCurrency,
    showCurrencyPicker,
    showAttributeSheet,
    purchaseDate,
    careTags,
    occasionTags,
    seasonTags,
    fit,
    rise,
    legShape,
    warmthPreference,
    photoUrl,
    photoUri,
    cleanedPhotoUrl,
    serverCleanedUrl,
    pendingPhotoUri,
    pendingCleanedPhotoUri,
    autofillCutoutUri,
    pendingPhotoWidth,
    originalPickedPhotoUri,
    refineValue,
    refiningCutout,
    draftItemId,
    draftPhotoHash,
    pendingPhotoHash,
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
    aiPattern,
    aiMaterial,
    detectedBrand,
    detectedBrandConfidence,
    aiFit,
    aiOccasionTags,
    aiSeasonTags,
    duplicateBanner,
    advancedExpanded,
    fabricExpanded,
    sizeExpanded,
    notesExpanded,
    occasionExpanded,
    seasonExpanded,
    fitExpanded,
    createSessionId,
  };

  const derived = {
    CATEGORIES,
    SUB_CATEGORIES,
    OCCASION_OPTIONS,
    SEASON_OPTIONS,
    FIT_OPTIONS,
    RISE_OPTIONS,
    LEG_SHAPE_OPTIONS,
    SIZE_OPTIONS,
    MATERIAL_OPTIONS,
    PATTERN_OPTIONS,
    CURRENCIES,
    previewPhotoUri,
    canRefineCutout,
    selectedCategory,
    displayedPattern,
    displayedMaterial,
    isPatternAuto,
    isMaterialAuto,
    hasActiveCreateState,
    colorOptions,
    warmthLabel,
    hasPhoto,
    aiHasCategory,
    aiHasColors,
    showBasics,
    showDetails,
    showAdvanced,
    setupProgress,
    requiredChecklist,
    nextMissing,
    aiSuggestions,
    aiStatusRows,
    aiStatusPill,
    canApplyAiSuggestions,
    hasRequiredPhoto,
    canSave,
    ctaStatusText,
    rowKeys,
    touched,
    isDirty:
      !!pendingPhotoUri ||
      !!brand ||
      !!name ||
      !!category ||
      !!subCategory ||
      selectedColors.length > 0 ||
      !!pattern ||
      !!material ||
      !!size ||
      !!notes,
  };

  const actions = {
    setBrand,
    setName,
    setCategory,
    setSubCategory,
    setPattern,
    setMaterial,
    setSelectedColors,
    setAddingCustomColor,
    setSize,
    setNotes,
    setPriceAmount,
    setPriceCurrency,
    setShowCurrencyPicker,
    setShowAttributeSheet,
    setPurchaseDate,
    setCareTags,
    setOccasionTags,
    setSeasonTags,
    setFit,
    setRise,
    setLegShape,
    setWarmthPreference,
    setAdvancedExpanded,
    setFabricExpanded,
    setSizeExpanded,
    setNotesExpanded,
    setOccasionExpanded,
    setSeasonExpanded,
    setFitExpanded,
    markUserEdited,
    clearUserEdited,
    toggleSection,
    toggleColor,
    applyAiSuggestions,
    handleRefineValueChange,
    handleRefineValueComplete,
    handleRefineReset,
    pickPhoto,
    saveItem,
    resetCreateFlow,
    retryPhotoUpload,
    retryBackgroundRemoval,
    retryAutofill,
    duplicateLastItem,
    stopDraftSubscription,
    onScreenFocus,
    onScreenBlur,
  };

  return { state, derived, actions, styles };
}
