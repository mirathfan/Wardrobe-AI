import * as ImagePicker from "expo-image-picker";
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
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { styles } from "./styles";
import { useAuth } from "../../../src/hooks/useAuth";
import { db } from "../../../src/lib/firebase";
import { normalizeCategoryForStorage } from "../../../src/lib/items";
import {
  Category,
  SUB_CATEGORIES,
  isValidCategorySubCategory,
  wearSlot,
} from "../../../src/shared/wardrobeTaxonomy";
import {
  isVisionBackgroundRemovalAvailable,
  removeBackground,
} from "../../../src/bg/removeBackground";
import { detectBrandLogo } from "../../../src/lib/detectBrandLogo";
import { uploadItemPhoto } from "../../../src/lib/uploadImage";

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
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const isEdit = !!editItemId;

  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
  const [pendingPhotoWidth, setPendingPhotoWidth] = useState<number | null>(null);
  const [originalPickedPhotoUri, setOriginalPickedPhotoUri] = useState<string | null>(null);
  const [refineValue, setRefineValue] = useState(DEFAULT_REFINE_VALUE);
  const [refiningCutout, setRefiningCutout] = useState(false);
  const [draftItemId, setDraftItemId] = useState<string | null>(null);
  const [draftPhotoHash, setDraftPhotoHash] = useState<string | null>(null);
  const [ingestionStatus, setIngestionStatus] = useState<string | null>(null);
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
  const draftSubscriptionRef = useRef<(() => void) | null>(null);
  const userEditedKeysRef = useRef<Set<string>>(new Set());
  const syncedPreviewUriRef = useRef<string | null>(null);
  const prevEditItemIdRef = useRef<string | null>(null);
  const isFinalizingRef = useRef(false);
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
    pendingPhotoUri ??
    cleanedPhotoUrl ??
    pendingCleanedPhotoUri ??
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

  function clearUserEdited(...keys: string[]) {
    keys.forEach((key) => userEditedKeysRef.current.delete(key));
  }

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
    }
  }, []);

  const attachDraftSubscription = useCallback(
    (itemId: string, sessionId?: string) => {
      if (!uid) return;
      stopDraftSubscription();
      const ref = doc(db, "users", uid, "items", itemId);
      const activeSessionId = sessionId ?? createSessionRef.current.sessionId;
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
        maybeApplyAutofillFromDraft(snap.data() as any);
      });
      createSessionRef.current.unsub = draftSubscriptionRef.current;
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
      setIngestionStatus(null);
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
      setPendingPhotoWidth(null);
      setOriginalPickedPhotoUri(null);
      setRefineValue(DEFAULT_REFINE_VALUE);
      setRefiningCutout(false);
      setUploadingPhoto(false);
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
      syncedPreviewUriRef.current = null;
      userEditedKeysRef.current.clear();

      if (options?.deleteActiveDraft && previousDraftId) {
        await cleanupDraftDoc(previousDraftId);
      }
    },
    [cleanupDraftDoc, draftItemId, isEdit, stopDraftSubscription]
  );

  const maybeApplyAutofillFromDraft = useCallback((data: any) => {
    setIngestionStatus(normalizeIngestionStatus(data?.ingestion?.status));
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

    if (!userEditedKeysRef.current.has("category") && !category && data?.category) {
      setCategory(normalizeCategoryForStorage(data.category));
    }
    if (!userEditedKeysRef.current.has("pattern") && !pattern && norm(data?.pattern)) {
      setPattern(norm(data.pattern));
    }
    if (!userEditedKeysRef.current.has("material") && !material && norm(data?.material)) {
      setMaterial(norm(data.material));
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

    const normalizedCategory = normalizeCategoryForStorage(
      data?.category ?? selectedCategory
    );
    const serverSubCategory = norm(data?.subCategory);
    if (
      !userEditedKeysRef.current.has("subCategory") &&
      !subCategory &&
      serverSubCategory &&
      isValidCategorySubCategory(normalizedCategory, serverSubCategory)
    ) {
      setSubCategory(serverSubCategory);
    }

    const colorSource = String(data?.colorSource ?? "").trim().toLowerCase();
    if (
      colorSource !== "user" &&
      !userEditedKeysRef.current.has("colors") &&
      selectedColors.length === 0
    ) {
      const incomingColors: string[] =
        Array.isArray(data?.colors) && data.colors.length
          ? data.colors.map(normColor).filter(Boolean)
          : data?.primaryColor
            ? [normColor(data.primaryColor)]
            : [];

      if (incomingColors.length > 0) {
        setSelectedColors(incomingColors);
      }
    }
  }, [
    category,
    fit,
    material,
    occasionTags.length,
    pattern,
    seasonTags.length,
    selectedCategory,
    selectedColors.length,
    subCategory,
  ]);

  async function startDraftAutofill(params: {
    photoHash: string;
    localPreviewUri: string;
    cleanedLocalUri: string | null;
    originalWidth: number | null;
    token: { sessionId: string; requestId: number };
  }) {
    if (!uid || isEdit) return;
    let failingStep = "upload";
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
      const uploaded = await uploadItemPhoto({
        uid,
        itemId: draftRef.id,
        localUri: localPreviewUri,
        cleanedLocalUri,
        originalWidth,
      });

      if (!isActiveRequest(token)) {
        if (__DEV__) {
          console.log("[AddFlow] ignoring stale async result (session mismatch)");
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

      if (!isActiveRequest(token)) {
        if (__DEV__) {
          console.log("[AddFlow] ignoring stale async result (session mismatch)");
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
      attachDraftSubscription(draftRef.id, draftSessionId);

      if (previousDraftId && previousDraftId !== draftRef.id) {
        void cleanupDraftDoc(previousDraftId);
      }
    } catch (error) {
      console.log(`[Draft] failed step=${failingStep}`, error);
      throw error;
    }
  }

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
    };
  }, [stopDraftSubscription]);

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
      attachDraftSubscription(existingDraftId, sessionId);
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
  const showDetails = hasPhoto && (aiHasCategory || ingestionStatus === "processing" || ingestionStatus === "done");
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

  const requiredChecklist = useMemo(
    () => [
      { id: "photo", label: "Photo", done: hasPhoto, rowId: "photo" },
      { id: "category", label: "Category", done: aiHasCategory, rowId: "category" },
      { id: "colors", label: "Color", done: aiHasColors, rowId: "colors" },
    ],
    [aiHasCategory, aiHasColors, hasPhoto]
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
    if (ingestionStatus === "failed") {
      return ["⚠️ AI failed — you can fill manually"];
    }
    if (ingestionStatus === "pending" || ingestionStatus === "processing") {
      return [
        aiHasCategory ? "✓ Category detected" : "✨ Detecting category...",
        aiHasColors ? "✓ Colors detected" : "✨ Detecting colors...",
        aiPattern || aiMaterial
          ? "✓ Material/pattern detected"
          : "✨ Detecting material/pattern...",
      ];
    }
    if (ingestionStatus === "done") {
      return [
        aiHasCategory ? "✓ Category detected" : "⚠️ Category missing",
        aiHasColors ? "✓ Colors detected" : "⚠️ Colors missing",
        aiPattern || aiMaterial
          ? "✓ Material/pattern detected"
          : "⚠️ Material/pattern missing",
      ];
    }
    return [];
  }, [aiHasCategory, aiHasColors, aiMaterial, aiPattern, ingestionStatus]);

  const aiStatusPill = useMemo(() => {
    if (ingestionStatus === "failed") {
      return { label: "AI failed — fill manually", tone: "error" as const };
    }
    if (ingestionStatus === "pending" || ingestionStatus === "processing") {
      return { label: "AI filling details…", tone: "running" as const };
    }
    if (ingestionStatus === "done" && aiSuggestions.length > 0) {
      return { label: "AI suggestions ready", tone: "ready" as const };
    }
    if (ingestionStatus === "done") {
      return { label: "AI ready", tone: "ready" as const };
    }
    return { label: "AI idle", tone: "idle" as const };
  }, [aiSuggestions.length, ingestionStatus]);

  const canApplyAiSuggestions = ingestionStatus === "done" && aiSuggestions.length > 0;

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
        setRefiningCutout(true);
        const cutoutUri = await removeBackground(originalPickedPhotoUri, {
          threshold,
          cleanupRadius,
          feather,
          edgeTighten,
          maskToAlpha,
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
        setCleanedPhotoUrl(null);
        console.log(
          `[AddItem] refine done value=${normalizedValue.toFixed(2)}, threshold=${threshold.toFixed(2)}, radius=${cleanupRadius}, feather=${feather}, uri=${cutoutUri}`
        );
      } catch (e) {
        if (requestId === latestRefineRequestIdRef.current) {
          console.log(e);
        }
      } finally {
        if (requestId === latestRefineRequestIdRef.current) {
          setRefiningCutout(false);
        }
      }
    };

    if (immediate) {
      void execute();
      return;
    }

    refineTimeoutRef.current = setTimeout(() => {
      refineTimeoutRef.current = null;
      void execute();
    }, 200);
  }

  function handleRefineValueChange(value: number) {
    setRefineValue(value);
    scheduleRefine(value, false);
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
      if (!isEdit && draftPhotoHash === nextPhotoHash && draftItemId) {
        return;
      }

      const previousSelectionId = latestPhotoSelectionIdRef.current + 1;
      latestPhotoSelectionIdRef.current = previousSelectionId;
      const token = beginAsyncRequest();
      const originalUri = asset.uri;
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
      const [cutoutUri, brandResult] = await Promise.all([
        removeBackground(originalUri, initialOptions),
        detectBrandLogo(originalUri),
      ]);
      if (
        previousSelectionId !== latestPhotoSelectionIdRef.current ||
        !isActiveRequest(token)
      ) {
        if (__DEV__) {
          console.log("[AddFlow] ignoring stale async result (session mismatch)");
        }
        return;
      }
      console.log("[AddItem] original image URI:", originalUri);
      console.log("[AddItem] final display/upload URI:", cutoutUri);
      lastCompletedRefineKeyRef.current = getRefineRequestKey(
        originalUri,
        DEFAULT_REFINE_VALUE
      );
      latestRefineRequestIdRef.current = 0;
      setOriginalPickedPhotoUri(originalUri);
      setRefineValue(DEFAULT_REFINE_VALUE);
      setPendingPhotoUri(cutoutUri);
      setPendingCleanedPhotoUri(cutoutUri);
      setCleanedPhotoUrl(null);
      setServerCleanedUrl(null);
      setIngestionStatus(isEdit ? null : "pending");
      setPendingPhotoWidth(asset.width ?? null);
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
        setUploadingPhoto(true);
        try {
          await startDraftAutofill({
            photoHash: nextPhotoHash,
            localPreviewUri: cutoutUri,
            cleanedLocalUri: cutoutUri !== originalUri ? cutoutUri : null,
            originalWidth: asset.width ?? null,
            token,
          });
        } finally {
          if (
            previousSelectionId === latestPhotoSelectionIdRef.current &&
            isActiveRequest(token)
          ) {
            setUploadingPhoto(false);
          }
        }
      } else if (previousDraftId) {
        void cleanupDraftDoc(previousDraftId);
      }
    } catch (e: any) {
      console.log(e);
      Alert.alert("Error", e?.message ?? "Failed to pick image");
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
      setUploadingPhoto(true);
      const uploadedUrl = await uploadItemPhoto({
        uid: currentUid,
        itemId,
        localUri: pendingPhotoUri,
        cleanedLocalUri: pendingCleanedPhotoUri,
        originalWidth: pendingPhotoWidth,
      });
      console.log("[AddItem] saved photos.cleanedPhotoUrl:", uploadedUrl.cleanedUrl);
      console.log("[AddItem] saved photos.cleanedUrl:", serverCleanedUrl);
      setPhotoUrl(uploadedUrl.primaryUrl);
      setCleanedPhotoUrl(uploadedUrl.cleanedUrl);
      syncedPreviewUriRef.current = pendingPhotoUri;
      return {
        photoUrl: uploadedUrl.primaryUrl,
        photoUri: null,
        cleanedPhotoUrl: uploadedUrl.cleanedUrl,
        cleanedUrl: serverCleanedUrl,
      };
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
  const canSave = hasRequiredPhoto && !loading && !uploadingPhoto;
  const ctaStatusText = uploadingPhoto
    ? "Uploading photo…"
    : refiningCutout || (draftItemId && ingestionStatus && ingestionStatus !== "done" && ingestionStatus !== "failed")
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

  const state = {
    uid,
    editItemId,
    isEdit,
    loading,
    uploadingPhoto,
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
    pendingPhotoWidth,
    originalPickedPhotoUri,
    refineValue,
    refiningCutout,
    draftItemId,
    draftPhotoHash,
    ingestionStatus,
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
    duplicateLastItem,
    stopDraftSubscription,
    onScreenFocus,
    onScreenBlur,
  };

  return { state, derived, actions, styles };
}
