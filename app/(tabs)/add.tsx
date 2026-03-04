import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { PhotoEditorSection } from "../../src/components/PhotoEditorSection";
import { useAuth } from "../../src/hooks/useAuth";
import { db } from "../../src/lib/firebase";
import { normalizeCategoryForStorage } from "../../src/lib/items";
import {
  Category,
  SUB_CATEGORIES,
  isValidCategorySubCategory,
  wearSlot,
} from "../../src/shared/wardrobeTaxonomy";
import {
  isVisionBackgroundRemovalAvailable,
  removeBackground,
} from "../../src/bg/removeBackground";
import { detectBrandLogo } from "../../src/lib/detectBrandLogo";
import { uploadItemPhoto } from "../../src/lib/uploadImage";

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

export default function AddItemScreen() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const editItemId = useMemo(
    () => (Array.isArray(editId) ? editId[0] : editId),
    [editId]
  );
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
  const [customColor, setCustomColor] = useState("");
  const [addingCustomColor, setAddingCustomColor] = useState(false);

  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<string>("USD");
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState("");

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
  const [createSessionId, setCreateSessionId] = useState(() => makeCreateSessionId());
  const lastCompletedRefineKeyRef = useRef("");
  const latestRefineRequestIdRef = useRef(0);
  const refineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPhotoSelectionIdRef = useRef(0);
  const draftSubscriptionRef = useRef<(() => void) | null>(null);
  const userEditedKeysRef = useRef<Set<string>>(new Set());
  const syncedPreviewUriRef = useRef<string | null>(null);
  const prevEditItemIdRef = useRef<string | null>(null);
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

  const stopDraftSubscription = useCallback(() => {
    const unsubscribe =
      createSessionRef.current.unsub ?? draftSubscriptionRef.current;
    if (unsubscribe) {
      unsubscribe();
      createSessionRef.current.unsub = null;
      draftSubscriptionRef.current = null;
    }
  }, []);

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
      setCustomColor("");
      setAddingCustomColor(false);
      setSize("");
      setNotes("");
      setPriceAmount("");
      setPriceCurrency("USD");
      setShowCurrencyPicker(false);
      setPurchaseDate("");
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

  function maybeApplyAutofillFromDraft(data: any) {
    setIngestionStatus(normalizeIngestionStatus(data?.ingestion?.status));
    setAiPattern(norm(data?.pattern) || null);
    setAiMaterial(norm(data?.material) || null);

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
  }

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
      draftSubscriptionRef.current = onSnapshot(draftRef, (snap) => {
        if (
          createSessionRef.current.sessionId !== draftSessionId ||
          createSessionRef.current.draftId !== draftRef.id
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
        setCustomColor("");
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

        setPhotoUrl(data.photoUrl ?? null);
        setPhotoUri(data.photoUri ?? null);
        setCleanedPhotoUrl(data.photos?.cleanedPhotoUrl ?? null);
        setServerCleanedUrl(data.photos?.cleanedUrl ?? null);
        setPendingPhotoUri(null);
        setPendingCleanedPhotoUri(null);
        setPendingPhotoWidth(null);
        setOriginalPickedPhotoUri(null);
        setRefineValue(DEFAULT_REFINE_VALUE);
        await resetCreateFlow("load-edit-item");
      } catch (e: any) {
        console.log(e);
        Alert.alert("Error", e?.message ?? "Failed to load item");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, editItemId, uid, resetCreateFlow]);

  useEffect(() => {
    return () => {
      stopDraftSubscription();
      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
      }
    };
  }, [stopDraftSubscription]);

  useFocusEffect(
    useCallback(() => {
      const prevEdit = prevEditItemIdRef.current;
      const nowEdit = editItemId ?? null;

      prevEditItemIdRef.current = nowEdit;

      if (nowEdit) {
        return undefined;
      }

      if (hasActiveCreateState) {
        return undefined;
      }

      if (prevEdit && !nowEdit) {
        void resetCreateFlow("focus-create-after-edit");
      }

      return undefined;
    }, [editItemId, hasActiveCreateState, resetCreateFlow])
  );

  const colorOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_COLORS.map(normColor));
    selectedColors.forEach((c) => set.add(normColor(c)));
    return Array.from(set);
  }, [selectedColors]);

  function toggleColor(c: string) {
    const color = normColor(c);
    if (!color) return;
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((x) => x !== color) : [...prev, color]
    );
  }

  function addCustomColorNow() {
    const c = normColor(customColor);
    if (!c) return;
    setSelectedColors((prev) => (prev.includes(c) ? prev : [...prev, c]));
    setCustomColor("");
    setAddingCustomColor(false);
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

  async function saveItem() {
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
    }
  }

  const canAddCustomColor = customColor.trim().length > 0;
  const canSave = !!(pendingPhotoUri || photoUrl || photoUri) && !loading;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Pressable onPress={() => router.back()} style={btnSecondary}>
          <Text style={btnSecondaryText}>Back</Text>
        </Pressable>

        <Text style={{ fontSize: 22, fontWeight: "800" }}>
          {isEdit ? "Edit Item" : "Add Item"}
        </Text>

        <View style={{ width: 60 }} />
      </View>

      {loading ? <Text>{uploadingPhoto ? "Uploading photo..." : "Loading..."}</Text> : null}

      <PhotoEditorSection
        previewUri={previewPhotoUri}
        refineValue={refineValue}
        isProcessing={refiningCutout}
        canRefine={canRefineCutout}
        showPendingNote={!!pendingPhotoUri}
        onPickLibrary={() => void pickPhoto("library")}
        onUseCamera={() => void pickPhoto("camera")}
        onRemove={() => {
          void resetCreateFlow("remove-photo", {deleteActiveDraft: true});
        }}
        onRefineChange={handleRefineValueChange}
        onRefineComplete={handleRefineValueComplete}
        onResetRefine={handleRefineReset}
      />

      {!isEdit && draftItemId ? (
        <View
          style={{
            gap: 6,
            padding: 12,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "#e5e5e5",
            backgroundColor: "#fafafa",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "800" }}>
            AI Autofill: {ingestionStatus ? ingestionStatus : "starting"}
          </Text>
          <Text style={{ color: "#666" }}>
            {[
              `Category: ${category ?? "Auto (AI)"}`,
              subCategory ? `Sub-category: ${subCategory}` : "",
              selectedColors.length
                ? `Colors: ${selectedColors.join(" / ")}`
                : "Colors: Auto (AI)",
              `Pattern: ${displayedPattern}`,
              `Material: ${displayedMaterial}`,
            ]
              .filter(Boolean)
              .join(" • ") || "Waiting for ingestion…"}
          </Text>
        </View>
      ) : null}

      <Field label="Brand">
        <TextInput
          value={brand}
          onChangeText={(value) => {
            markUserEdited("brand");
            setBrand(value);
          }}
          placeholder="e.g., Nike"
          style={input}
        />
        {detectedBrand ? (
          <Text style={{ color: "#666" }}>
            Auto (AI): {detectedBrand}
            {typeof detectedBrandConfidence === "number"
              ? ` (${Math.round(detectedBrandConfidence * 100)}%)`
              : ""}
          </Text>
        ) : null}
      </Field>

      <Field label="Product name">
        <TextInput
          value={name}
          onChangeText={(value) => {
            markUserEdited("name");
            setName(value);
          }}
          placeholder="e.g., Air Jordan 2"
          style={input}
        />
      </Field>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pill
            key="auto-category"
            label="Auto (AI)"
            active={!category}
            onPress={() => {
              clearUserEdited("category", "subCategory");
              setCategory(null);
              setSubCategory("");
            }}
          />
          {CATEGORIES.map((cat) => (
            <Pill
              key={cat}
              label={cat}
              active={category === cat}
              onPress={() => {
                markUserEdited("category", "subCategory");
                setCategory(cat);
                setSubCategory("");
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>
          Sub-category (optional)
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pill
            key="auto"
            label="Auto (AI)"
            active={!subCategory}
            onPress={() => {
              clearUserEdited("subCategory");
              setSubCategory("");
            }}
          />
          {SUB_CATEGORIES[selectedCategory].map((sub) => (
            <Pill
              key={sub}
              label={sub}
              active={subCategory === sub}
              onPress={() => {
                markUserEdited("subCategory");
                setSubCategory(sub);
              }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Colors</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Pill
            key="auto-colors"
            label="Auto (AI)"
            active={selectedColors.length === 0}
            onPress={() => {
              clearUserEdited("colors");
              setSelectedColors([]);
              setCustomColor("");
              setAddingCustomColor(false);
            }}
          />
          {colorOptions.map((c) => (
            <Pill
              key={c}
              label={c}
              active={selectedColors.includes(c)}
              onPress={() => {
                markUserEdited("colors");
                toggleColor(c);
              }}
            />
          ))}

          {addingCustomColor ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TextInput
                value={customColor}
                onChangeText={setCustomColor}
                placeholder="Type color"
                style={[input, { paddingVertical: 8, width: 160 }]}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (!canAddCustomColor) return;
                  addCustomColorNow();
                }}
              />

              <Pressable
                onPress={addCustomColorNow}
                disabled={!canAddCustomColor}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: canAddCustomColor ? "#111" : "#ddd",
                  backgroundColor: canAddCustomColor ? "#111" : "transparent",
                  opacity: canAddCustomColor ? 1 : 0.5,
                }}
              >
                <Text
                  style={{
                    color: canAddCustomColor ? "#fff" : "#111",
                    fontWeight: "800",
                  }}
                >
                  Add
                </Text>
              </Pressable>

              <Pill
                label="Cancel"
                active={false}
                onPress={() => {
                  markUserEdited("colors");
                  setCustomColor("");
                  setAddingCustomColor(false);
                }}
              />
            </View>
          ) : (
            <Pill label="+" active={false} onPress={() => setAddingCustomColor(true)} />
          )}
        </View>

        {selectedColors.length > 0 ? (
          <Text style={{ color: "#666" }}>Selected: {selectedColors.join(" / ")}</Text>
        ) : (
          <Text style={{ color: "#666" }}>Selected: Auto (AI)</Text>
        )}
      </View>

      <Field label="Pattern">
        <View style={{ gap: 8 }}>
          <Pill
            label="Auto (AI)"
            active={!pattern}
            onPress={() => {
              clearUserEdited("pattern");
              setPattern(null);
            }}
          />
          <TextInput
            value={pattern ?? ""}
            onChangeText={(value) => {
              markUserEdited("pattern");
              setPattern(norm(value) || null);
            }}
            placeholder={displayedPattern}
            style={input}
          />
        </View>
      </Field>

      <Field label="Material">
        <View style={{ gap: 8 }}>
          <Pill
            label="Auto (AI)"
            active={!material}
            onPress={() => {
              clearUserEdited("material");
              setMaterial(null);
            }}
          />
          <TextInput
            value={material ?? ""}
            onChangeText={(value) => {
              markUserEdited("material");
              setMaterial(norm(value) || null);
            }}
            placeholder={displayedMaterial}
            style={input}
          />
        </View>
      </Field>

      <Field label="Size">
        <TextInput
          value={size}
          onChangeText={setSize}
          placeholder="e.g., US 10 / M / 32"
          style={input}
        />
      </Field>

      <Field label="Price">
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TextInput
            value={priceAmount}
            onChangeText={setPriceAmount}
            placeholder="e.g., 220"
            keyboardType="numeric"
            style={[input, { flex: 1 }]}
          />
          <Pressable
            onPress={() => setShowCurrencyPicker(true)}
            style={[
              input,
              {
                minWidth: 88,
                alignItems: "center",
                justifyContent: "center",
              },
            ]}
          >
            <Text style={{ fontSize: 16 }}>{priceCurrency}</Text>
          </Pressable>
        </View>
      </Field>

      <Field label="Purchase date">
        <TextInput
          value={purchaseDate}
          onChangeText={setPurchaseDate}
          placeholder="YYYY-MM-DD"
          style={input}
        />
      </Field>

      <Field label="Notes">
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g., Limited edition, gift from friend..."
          style={[input, { height: 90, textAlignVertical: "top" }]}
          multiline
        />
      </Field>

      <Pressable
        onPress={saveItem}
        style={[btnPrimary, !canSave ? { opacity: 0.6 } : null]}
        disabled={!canSave}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>
          {isEdit ? "Save Changes" : "Add to Wardrobe"}
        </Text>
      </Pressable>

      <View style={{ height: 30 }} />

      <Modal
        visible={showCurrencyPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCurrencyPicker(false)}
      >
        <Pressable
          onPress={() => setShowCurrencyPicker(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.2)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 320,
              borderRadius: 16,
              backgroundColor: "#fff",
              padding: 14,
              gap: 8,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800" }}>Select currency</Text>
            {CURRENCIES.map((currency) => (
              <Pressable
                key={currency}
                onPress={() => {
                  setPriceCurrency(currency);
                  setShowCurrencyPicker(false);
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: priceCurrency === currency ? "#111" : "#ddd",
                  backgroundColor: priceCurrency === currency ? "#111" : "#fff",
                }}
              >
                <Text
                  style={{
                    color: priceCurrency === currency ? "#fff" : "#111",
                    fontWeight: "700",
                  }}
                >
                  {currency}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: "700" }}>{label}</Text>
      {children}
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? "#111" : "#ddd",
        backgroundColor: active ? "#111" : "transparent",
      }}
    >
      <Text style={{ color: active ? "#fff" : "#111", fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

const input = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
} as const;

const btnPrimary = {
  marginTop: 6,
  paddingVertical: 14,
  borderRadius: 14,
  backgroundColor: "#111",
  alignItems: "center",
} as const;

const btnSecondary = {
  paddingVertical: 10,
  paddingHorizontal: 14,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "#ddd",
  alignItems: "center",
} as const;

const btnSecondaryText = {
  fontWeight: "800",
  color: "#111",
} as const;
