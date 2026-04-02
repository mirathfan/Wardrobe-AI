import { router } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { Alert, LayoutAnimation, Platform, UIManager } from "react-native";

import { norm, normColor } from "../controllerShared";
import { db } from "../../lib/firebase";
import { normalizeCategoryForStorage } from "../../lib/items";
import {
  Category,
  isValidCategorySubCategory,
  wearSlot,
} from "../../shared/wardrobeTaxonomy";

export function useItemDraft({
  uid,
  editItemId,
  isEdit,
  photoRef,
  extractionRef,
  resetCreateFlowRef,
}: {
  uid: string | null;
  editItemId: string | null;
  isEdit: boolean;
  photoRef: MutableRefObject<any>;
  extractionRef: MutableRefObject<any>;
  resetCreateFlowRef: MutableRefObject<any>;
}) {
  const [loading, setLoading] = useState(false);
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
  const [duplicateBanner, setDuplicateBanner] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [fabricExpanded, setFabricExpanded] = useState(false);
  const [sizeExpanded, setSizeExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [occasionExpanded, setOccasionExpanded] = useState(false);
  const [seasonExpanded, setSeasonExpanded] = useState(false);
  const [fitExpanded, setFitExpanded] = useState(false);

  const userEditedKeysRef = useRef<Set<string>>(new Set());
  const selectedCategory = category ?? Category.TOP;

  const markUserEdited = useCallback((...keys: string[]) => {
    keys.forEach((key) => userEditedKeysRef.current.add(key));
  }, []);

  const clearUserEdited = useCallback((...keys: string[]) => {
    keys.forEach((key) => userEditedKeysRef.current.delete(key));
  }, []);

  const toggleSection = useCallback(
    (
      section: "fabric" | "size" | "notes" | "occasion" | "season" | "fit",
      nextValue?: boolean
    ) => {
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
    },
    [fabricExpanded, fitExpanded, notesExpanded, occasionExpanded, seasonExpanded, sizeExpanded]
  );

  const toggleColor = useCallback((c: string) => {
    const color = normColor(c);
    if (!color) return;
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((x) => x !== color) : [...prev, color]
    );
  }, []);

  const parsePriceToNumber = useCallback((s: string) => {
    const t = norm(s);
    if (!t) return null;
    const cleaned = t.replace(/[^0-9.]/g, "");
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }, []);

  const parsePurchaseDate = useCallback((s: string) => {
    const t = norm(s);
    if (!t) return null;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(t);
    if (!ok) return "INVALID";
    return t;
  }, []);

  const syncDraftProgress = useCallback(async () => {
    const extraction = extractionRef.current;
    const draftItemId = extraction?.state?.draftItemId ?? null;
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
        pattern: norm(pattern ?? "") || null,
        material: norm(material ?? "") || null,
        size: norm(size) || null,
        notes: norm(notes) || null,
        priceAmount: parsePriceToNumber(priceAmount),
        priceCurrency,
        purchaseDate:
          parsePurchaseDate(purchaseDate) === "INVALID"
            ? null
            : parsePurchaseDate(purchaseDate),
        ...(occasionTags.length ? { occasionTags } : {}),
        ...(seasonTags.length ? { seasonTags } : {}),
        ...(fit ? { fit } : {}),
        ...(rise ? { rise } : {}),
        ...(legShape ? { legShape } : {}),
        ...(warmthPreference != null ? { warmthPreference } : {}),
        updatedAt: Date.now(),
      });
    } catch {}
  }, [
    brand,
    category,
    extractionRef,
    fit,
    isEdit,
    legShape,
    material,
    name,
    notes,
    occasionTags,
    parsePriceToNumber,
    parsePurchaseDate,
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

  const resetDraftState = useCallback(() => {
    setLoading(false);
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
    setDuplicateBanner(false);
    setAdvancedExpanded(false);
    setFabricExpanded(false);
    setSizeExpanded(false);
    setNotesExpanded(false);
    setOccasionExpanded(false);
    setSeasonExpanded(false);
    setFitExpanded(false);
    userEditedKeysRef.current.clear();
  }, []);

  const duplicateLastItem = useCallback(async () => {
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
      setSelectedColors(
        Array.isArray(data.colors) ? data.colors.map(normColor).filter(Boolean) : []
      );
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
    } catch {
      Alert.alert("No recent items", "Could not load a recent item.");
    }
  }, [isEdit, markUserEdited, uid]);

  const saveItem = useCallback(async () => {
    const photo = photoRef.current;
    const extraction = extractionRef.current;
    const resetCreateFlow = resetCreateFlowRef.current;
    if (!photo || !extraction) return;

    setLoading(true);
    extraction.refs.isFinalizingRef.current = true;
    const b = norm(brand);
    const n = norm(name);
    const hasAtLeastOnePhoto = !!(
      photo.state.pendingPhotoUri ||
      photo.state.photoUrl ||
      photo.state.photoUri
    );

    try {
      if (!hasAtLeastOnePhoto) {
        Alert.alert("Missing photo", "Add at least one item photo.");
        return;
      }
      if (!uid) {
        router.replace("/(auth)/login");
        Alert.alert("Not signed in", "Please sign in first.");
        return;
      }
      const priceNum = parsePriceToNumber(priceAmount);
      const date = parsePurchaseDate(purchaseDate);
      if (date === "INVALID") {
        Alert.alert(
          "Bad date format",
          "Use YYYY-MM-DD (example: 2025-12-26) or leave it empty."
        );
        return;
      }

      const draftItemId = extraction.state.draftItemId;
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
        pattern: norm(pattern ?? "") || null,
        material: norm(material ?? "") || null,
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

      const nextPhoto = await photo.actions.resolvePhotoFields(uid, itemRef.id);
      const payload = {
        ...payloadBase,
        photoUrl: nextPhoto.photoUrl,
        photoUri: nextPhoto.photoUri,
      };
      if (isEdit) {
        const updatePayload: Record<string, any> = {
          ...payload,
          "photos.primaryUrl": nextPhoto.photoUrl,
          "photos.urls": nextPhoto.photoUrl ? [nextPhoto.photoUrl] : [],
          ...(photo.state.pendingPhotoUri
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
        if (
          photo.state.pendingPhotoUri &&
          photo.refs.syncedPreviewUriRef.current !== photo.state.pendingPhotoUri
        ) {
          updatePayload.ingestion = {
            status: "pending",
            lastRunAt: Date.now(),
          };
        }
        await updateDoc(itemRef, updatePayload);
        Alert.alert("Added ✅", "Item added to wardrobe.");
        await resetCreateFlow?.("post-save");
        return;
      }

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
      await resetCreateFlow?.("post-save");
    } catch (e: any) {
      Alert.alert(
        "Error",
        e?.message ?? (isEdit ? "Failed to update item" : "Failed to add item")
      );
    } finally {
      photo.actions.setUploadingPhoto(false);
      setLoading(false);
      extraction.refs.isFinalizingRef.current = false;
    }
  }, [
    brand,
    category,
    editItemId,
    extractionRef,
    fit,
    isEdit,
    legShape,
    material,
    name,
    notes,
    occasionTags,
    parsePriceToNumber,
    parsePurchaseDate,
    pattern,
    photoRef,
    priceAmount,
    priceCurrency,
    purchaseDate,
    resetCreateFlowRef,
    rise,
    seasonTags,
    selectedCategory,
    selectedColors,
    size,
    subCategory,
    uid,
    warmthPreference,
  ]);

  useEffect(() => {
    void (async () => {
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
        setDuplicateBanner(false);
        photoRef.current?.actions?.hydrateFromItem?.(data);
        extractionRef.current?.actions?.resetForLoadedEditItem?.();
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to load item");
      } finally {
        setLoading(false);
      }
    })();
  }, [editItemId, extractionRef, isEdit, photoRef, uid]);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const state = {
    loading,
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
    duplicateBanner,
    advancedExpanded,
    fabricExpanded,
    sizeExpanded,
    notesExpanded,
    occasionExpanded,
    seasonExpanded,
    fitExpanded,
  };

  const actions = {
    setLoading,
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
    setDuplicateBanner,
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
    duplicateLastItem,
    saveItem,
    syncDraftProgress,
    resetDraftState,
  };

  const refs = {
    userEditedKeysRef,
  };

  const derived = {
    selectedCategory,
  };

  return { state, actions, refs, derived };
}
