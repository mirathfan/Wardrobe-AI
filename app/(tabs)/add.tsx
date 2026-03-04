import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
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

  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [addingCustomColor, setAddingCustomColor] = useState(false);

  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [price, setPrice] = useState("");
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
  const lastCompletedRefineKeyRef = useRef("");
  const latestRefineRequestIdRef = useRef(0);
  const refineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestPhotoSelectionIdRef = useRef(0);
  const draftSubscriptionRef = useRef<(() => void) | null>(null);
  const userEditedKeysRef = useRef<Set<string>>(new Set());
  const syncedPreviewUriRef = useRef<string | null>(null);

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
  const displayedPattern = aiPattern || "Auto (AI)";
  const displayedMaterial = aiMaterial || "Auto (AI)";

  function markUserEdited(...keys: string[]) {
    keys.forEach((key) => userEditedKeysRef.current.add(key));
  }

  function clearUserEdited(...keys: string[]) {
    keys.forEach((key) => userEditedKeysRef.current.delete(key));
  }

  const stopDraftSubscription = useCallback(() => {
    if (draftSubscriptionRef.current) {
      draftSubscriptionRef.current();
      draftSubscriptionRef.current = null;
    }
  }, []);

  async function cleanupDraftDoc(itemId: string | null) {
    if (!uid || !itemId || isEdit) return;
    try {
      await deleteDoc(doc(db, "users", uid, "items", itemId));
    } catch (error) {
      console.log("[AddItem] best-effort draft cleanup failed:", error);
    }
  }

  const resetDraftTracking = useCallback(() => {
    stopDraftSubscription();
    setDraftItemId(null);
    setDraftPhotoHash(null);
    setIngestionStatus(null);
    setAiPattern(null);
    setAiMaterial(null);
    syncedPreviewUriRef.current = null;
  }, [stopDraftSubscription]);

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
    selectionId: number;
  }) {
    if (!uid || isEdit) return;
    let failingStep = "upload";
    try {
      const {
        photoHash,
        localPreviewUri,
        cleanedLocalUri,
        originalWidth,
        selectionId,
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

      if (selectionId !== latestPhotoSelectionIdRef.current) {
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
        lastWashedDate: now,
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

      if (selectionId !== latestPhotoSelectionIdRef.current) {
        void cleanupDraftDoc(draftRef.id);
        return;
      }

      setDraftItemId(draftRef.id);
      setDraftPhotoHash(photoHash);
      setIngestionStatus("pending");
      setPhotoUrl(uploaded.primaryUrl);
      setCleanedPhotoUrl(nextCleanedPhotoUrl);
      syncedPreviewUriRef.current = localPreviewUri;

      draftSubscriptionRef.current = onSnapshot(draftRef, (snap) => {
        if (!snap.exists()) return;
        maybeApplyAutofillFromDraft(snap.data() as any);
      });

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
        setPrice(data.price != null ? String(data.price) : "");
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
        resetDraftTracking();
        userEditedKeysRef.current.clear();
        lastCompletedRefineKeyRef.current = "";
        latestRefineRequestIdRef.current = 0;
        latestPhotoSelectionIdRef.current = 0;
        if (refineTimeoutRef.current) {
          clearTimeout(refineTimeoutRef.current);
          refineTimeoutRef.current = null;
        }
      } catch (e: any) {
        console.log(e);
        Alert.alert("Error", e?.message ?? "Failed to load item");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, editItemId, uid, resetDraftTracking]);

  useEffect(() => {
    return () => {
      stopDraftSubscription();
      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
      }
    };
  }, [stopDraftSubscription]);

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
    const { threshold, cleanupRadius, feather } = getRefineOptions(normalizedValue);
    const requestKey = getRefineRequestKey(originalPickedPhotoUri, normalizedValue);
    if (lastCompletedRefineKeyRef.current === requestKey) return;

    const requestId = latestRefineRequestIdRef.current + 1;
    latestRefineRequestIdRef.current = requestId;

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
        });
        if (requestId !== latestRefineRequestIdRef.current) return;
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
      const originalUri = asset.uri;
      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
        refineTimeoutRef.current = null;
      }
      const previousDraftId = draftItemId;
      stopDraftSubscription();
      setDraftItemId(null);
      setDraftPhotoHash(null);
      setIngestionStatus(null);
      setAiPattern(null);
      setAiMaterial(null);
      syncedPreviewUriRef.current = null;
      latestRefineRequestIdRef.current = 0;
      setRefiningCutout(false);
      const initialOptions = getRefineOptions(DEFAULT_REFINE_VALUE);
      const cutoutUri = await removeBackground(originalUri, initialOptions);
      if (previousSelectionId !== latestPhotoSelectionIdRef.current) return;
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

      if (!isEdit && uid) {
        setUploadingPhoto(true);
        try {
          await startDraftAutofill({
            photoHash: nextPhotoHash,
            localPreviewUri: cutoutUri,
            cleanedLocalUri: cutoutUri !== originalUri ? cutoutUri : null,
            originalWidth: asset.width ?? null,
            selectionId: previousSelectionId,
          });
        } finally {
          if (previousSelectionId === latestPhotoSelectionIdRef.current) {
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
    const priceNum = parsePriceToNumber(price);
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
      size: norm(size) || null,
      notes: norm(notes) || null,
      price: priceNum,
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
        router.back();
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
        lastWashedDate: Date.now(),
        ingestion: {
          status: "pending",
          lastRunAt: Date.now(),
        },
      });

      Alert.alert("Added ✅", "Item added to wardrobe.");

      setBrand("");
      setName("");
      setCategory(null);
      setSubCategory("");
      setSelectedColors([]);
      setCustomColor("");
      setAddingCustomColor(false);
      setSize("");
      setNotes("");
      setPrice("");
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
      resetDraftTracking();
      userEditedKeysRef.current.clear();
      lastCompletedRefineKeyRef.current = "";
      latestRefineRequestIdRef.current = 0;
      latestPhotoSelectionIdRef.current = 0;
      if (refineTimeoutRef.current) {
        clearTimeout(refineTimeoutRef.current);
        refineTimeoutRef.current = null;
      }
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
          const previousDraftId = draftItemId;
          setPendingPhotoUri(null);
          setPendingCleanedPhotoUri(null);
          setPendingPhotoWidth(null);
          setPhotoUrl(null);
          setPhotoUri(null);
          setCleanedPhotoUrl(null);
          setServerCleanedUrl(null);
          setOriginalPickedPhotoUri(null);
          setRefineValue(DEFAULT_REFINE_VALUE);
          resetDraftTracking();
          userEditedKeysRef.current.clear();
          lastCompletedRefineKeyRef.current = "";
          latestRefineRequestIdRef.current = 0;
          latestPhotoSelectionIdRef.current = 0;
          if (refineTimeoutRef.current) {
            clearTimeout(refineTimeoutRef.current);
            refineTimeoutRef.current = null;
          }
          if (previousDraftId) {
            void cleanupDraftDoc(previousDraftId);
          }
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
        <Text style={{ color: "#666" }}>{displayedPattern}</Text>
      </Field>

      <Field label="Material">
        <Text style={{ color: "#666" }}>{displayedMaterial}</Text>
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
        <TextInput
          value={price}
          onChangeText={setPrice}
          placeholder="e.g., 220"
          keyboardType="numeric"
          style={input}
        />
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
