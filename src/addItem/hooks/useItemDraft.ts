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

import { type AddItemMode, norm, normColor } from "../controllerShared";
import { db } from "../../lib/firebase";
import { analyticsErrorProperties, trackLaunchEvent } from "../../lib/analytics";
import { safeGoBack } from "../../lib/navigation";
import { photoPipelineDuration, photoPipelineNow, safeErrorData } from "../../lib/photoPipelineLogger";
import { Toast } from "../../lib/toast";
import { normalizeCategoryForStorage } from "../../lib/items";
import {
  Category,
  isValidCategorySubCategory,
  wearSlot,
} from "../../shared/wardrobeTaxonomy";

type ItemDetailRoute = Parameters<typeof router.replace>[0];

function itemDetailRoute(itemId: string): ItemDetailRoute {
  return {
    pathname: "/(tabs)/item/[id]",
    params: { id: itemId, refreshKey: String(Date.now()) },
  } as ItemDetailRoute;
}

const UNBRANDED_LABEL = "Unbranded";

function cleanBrandInput(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUnbrandedValue(value: unknown) {
  return cleanBrandInput(value).toLowerCase() === UNBRANDED_LABEL.toLowerCase();
}

export function useItemDraft({
  uid,
  mode,
  editItemId,
  duplicateItemId,
  isEdit,
  initialCategory,
  formSessionKey,
  photoRef,
  extractionRef,
  resetCreateFlowRef,
}: {
  uid: string | null;
  mode: AddItemMode;
  editItemId: string | null;
  duplicateItemId?: string | null;
  isEdit: boolean;
  initialCategory?: Category | null;
  formSessionKey: string;
  photoRef: MutableRefObject<any>;
  extractionRef: MutableRefObject<any>;
  resetCreateFlowRef: MutableRefObject<any>;
}) {
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category | null>(() => initialCategory ?? null);
  const [subCategory, setSubCategory] = useState("");
  const [pattern, setPattern] = useState<string | null>(null);
  const [material, setMaterial] = useState<string | null>(null);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [displayColor, setDisplayColor] = useState("");
  const [displayColors, setDisplayColors] = useState<string[]>([]);
  const [addingCustomColor, setAddingCustomColor] = useState(false);
  const [size, setSize] = useState("");
  const [notes, setNotes] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState<string>("USD");
  const [priceSource, setPriceSource] = useState<"product_link" | "manual" | "estimated" | null>(null);
  const [priceDisplay, setPriceDisplay] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
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
  const saveInFlightRef = useRef(false);
  const lastFinalizedSubmissionKeyRef = useRef("");
  const selectedCategory = category ?? Category.TOP;

  const markUserEdited = useCallback((...keys: string[]) => {
    keys.forEach((key) => userEditedKeysRef.current.add(key));
  }, []);

  const clearUserEdited = useCallback((...keys: string[]) => {
    keys.forEach((key) => userEditedKeysRef.current.delete(key));
  }, []);

  const buildUserEditMetadata = useCallback(() => {
    const userEditedFields = Array.from(userEditedKeysRef.current).sort();
    if (!userEditedFields.length) return {};
    return {
      userEditedFields,
      userEditedFieldsUpdatedAt: Date.now(),
      ...(userEditedKeysRef.current.has("colors")
        ? {
            colorSource: "user",
            colorUpdatedAt: Date.now(),
          }
        : {}),
    };
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
    const match = t.match(/\d(?:[\d,.]*\d)?/);
    if (!match) return null;
    const remainder = `${t.slice(0, match.index)}${t.slice((match.index ?? 0) + match[0].length)}`;
    const unsupportedRemainder = remainder
      .replace(/\b(?:USD|INR|EUR|GBP|CAD|AUD|AED)\b/gi, "")
      .replace(/US\$|CA\$|C\$|AU\$|A\$|\$|₹|€|£|د\.إ/gi, "")
      .replace(/[\s()/-]/g, "");
    if (unsupportedRemainder) return null;

    const numeric = match[0];
    const lastComma = numeric.lastIndexOf(",");
    const lastDot = numeric.lastIndexOf(".");
    let normalized = numeric;
    if (lastComma >= 0 && lastDot >= 0) {
      normalized =
        lastComma > lastDot
          ? numeric.replace(/\./g, "").replace(",", ".")
          : numeric.replace(/,/g, "");
    } else if (lastComma >= 0) {
      const decimalDigits = numeric.length - lastComma - 1;
      normalized = decimalDigits === 2 ? numeric.replace(",", ".") : numeric.replace(/,/g, "");
    }
    normalized = normalized.replace(/[^0-9.]/g, "");
    const num = Number(normalized);
    return Number.isFinite(num) && num > 0 && num <= 1_000_000
      ? Math.round(num * 100) / 100
      : null;
  }, []);

  const parsePurchaseDate = useCallback((s: string) => {
    const t = norm(s);
    if (!t) return null;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(t);
    if (!ok) return "INVALID";
    return t;
  }, []);

  const buildPricePayload = useCallback(
    (priceNum: number | null) => {
      const normalizedCurrency = (norm(priceCurrency) || "USD").toUpperCase();
      if (priceNum == null) {
        return {
          priceAmount: null,
          price: null,
          purchasePrice: null,
          retailPrice: null,
          estimatedValue: null,
          currency: normalizedCurrency,
          priceCurrency: normalizedCurrency,
          priceSource: null,
          priceDisplay: null,
        };
      }
      const source = priceSource ?? "manual";
      const display =
        source === "product_link" && priceDisplay
          ? priceDisplay
          : `${normalizedCurrency} ${priceNum}`;
      return {
        priceAmount: priceNum,
        price: priceNum,
        purchasePrice: priceNum,
        retailPrice: priceNum,
        estimatedValue: priceNum,
        currency: normalizedCurrency,
        priceCurrency: normalizedCurrency,
        priceSource: source,
        priceDisplay: display,
      };
    },
    [priceCurrency, priceDisplay, priceSource]
  );

  const syncDraftProgress = useCallback(async () => {
    const extraction = extractionRef.current;
    const draftItemId = extraction?.state?.draftItemId ?? null;
    if (!uid || isEdit || !draftItemId) return;
    try {
      const draftRef = doc(db, "users", uid, "items", draftItemId);
      const effectiveBrand = cleanBrandInput(brand) || UNBRANDED_LABEL;
      await updateDoc(draftRef, {
        ...buildUserEditMetadata(),
        brand: effectiveBrand,
        isUnbranded: isUnbrandedValue(effectiveBrand),
        brandSource: userEditedKeysRef.current.has("brand")
          ? "user"
          : isUnbrandedValue(effectiveBrand)
            ? "default_unbranded"
            : "ai",
        brandUpdatedAt: Date.now(),
        name: norm(name) || "",
        category: category ?? Category.TOP,
        subCategory: isValidCategorySubCategory(selectedCategory, subCategory)
          ? subCategory
          : null,
        colors: selectedColors.map(normColor).filter(Boolean),
        displayColor: norm(displayColor) || null,
        displayColors: displayColors.map((value) => norm(value) || "").filter(Boolean),
        pattern: norm(pattern ?? "") || null,
        material: norm(material ?? "") || null,
        size: norm(size) || null,
        notes: norm(notes) || null,
        ...buildPricePayload(parsePriceToNumber(priceAmount)),
        sourceUrl: norm(sourceUrl) || null,
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
    buildUserEditMetadata,
    category,
    displayColor,
    displayColors,
    extractionRef,
    fit,
    isEdit,
    legShape,
    material,
    name,
    notes,
    occasionTags,
    buildPricePayload,
    parsePriceToNumber,
    parsePurchaseDate,
    pattern,
    priceAmount,
    sourceUrl,
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
    setCategory(initialCategory ?? null);
    setSubCategory("");
    setPattern(null);
    setMaterial(null);
    setSelectedColors([]);
    setDisplayColor("");
    setDisplayColors([]);
    setAddingCustomColor(false);
    setSize("");
    setNotes("");
    setPriceAmount("");
    setPriceCurrency("USD");
    setPriceSource(null);
    setPriceDisplay("");
    setSourceUrl("");
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
  }, [initialCategory]);

  const applyItemDataToDraft = useCallback(
    (data: any, options?: { markAsDuplicate?: boolean }) => {
      setBrand(cleanBrandInput(data.brand) || "");
      setName(norm(data.name) || "");
      const loadedCategory = normalizeCategoryForStorage(data.category);
      setCategory(loadedCategory);
      setSubCategory(
        isValidCategorySubCategory(loadedCategory, data.subCategory)
          ? data.subCategory
          : ""
      );
      setPattern(norm(data.pattern) || null);
      setMaterial(norm(data.material) || null);
      const loadedColors: string[] =
        Array.isArray(data.colors) && data.colors.length
          ? data.colors.map(normColor).filter(Boolean)
          : data.primaryColor
            ? [normColor(data.primaryColor)]
            : [];
      setSelectedColors(loadedColors);
      setDisplayColor(norm(data.displayColor) || "");
      setDisplayColors(
        Array.isArray(data.displayColors)
          ? data.displayColors.map((value: unknown) => norm(String(value ?? "")) || "").filter(Boolean)
          : []
      );
      setAddingCustomColor(false);
      setSize(norm(data.size) || "");
      setPriceAmount(
        data.estimatedValue != null
          ? String(data.estimatedValue)
          : data.purchasePrice != null
            ? String(data.purchasePrice)
            : data.retailPrice != null
              ? String(data.retailPrice)
              : data.priceAmount != null
                ? String(data.priceAmount)
                : data.price != null
                  ? String(data.price)
                  : ""
      );
      setPriceCurrency(norm(data.currency ?? data.priceCurrency) || "USD");
      setPriceSource(
        data.priceSource === "product_link" ||
          data.priceSource === "manual" ||
          data.priceSource === "estimated"
          ? data.priceSource
          : null
      );
      setPriceDisplay(norm(data.priceDisplay) || "");
      setSourceUrl(norm(data.sourceUrl) || "");
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
      setDuplicateBanner(Boolean(options?.markAsDuplicate));
      if (options?.markAsDuplicate) {
        markUserEdited(
          "brand",
          "name",
          "category",
          "subCategory",
          "pattern",
          "material",
          "colors",
          "displayColor",
          "displayColors",
          "price",
          "sourceUrl",
          "fit",
          "rise",
          "legShape",
          "occasionTags",
          "seasonTags"
        );
      }
    },
    [markUserEdited]
  );

  const duplicateLastItem = useCallback(async () => {
    if (!uid || isEdit) return;
    try {
      const itemsRef = collection(db, "users", uid, "items");
      let recentSnap;
      try {
        recentSnap = await getDocs(query(itemsRef, orderBy("createdAt", "desc"), limit(10)));
      } catch {
        recentSnap = await getDocs(query(itemsRef, orderBy("updatedAt", "desc"), limit(10)));
      }
      const latestRealItem = recentSnap?.docs.find((docSnap) => docSnap.data()?.isDraft !== true) ?? null;
      if (!latestRealItem) {
        Alert.alert("No recent items", "Add at least one item first.");
        return;
      }
      const data = latestRealItem.data() as any;
      applyItemDataToDraft(data, { markAsDuplicate: true });
    } catch {
      Alert.alert("No recent items", "Could not load a recent item.");
    }
  }, [applyItemDataToDraft, isEdit, uid]);

  const saveItem = useCallback(async () => {
    const photo = photoRef.current;
    const extraction = extractionRef.current;
    const resetCreateFlow = resetCreateFlowRef.current;
    if (!photo || !extraction) return;

    const submissionKey = [
      uid ?? "",
      String(editItemId ?? extraction.state.draftItemId ?? ""),
      String(photo.state.pendingPhotoHash ?? photo.state.photoUrl ?? photo.state.photoUri ?? ""),
      norm(name),
      norm(brand),
    ].join("|");
    if (saveInFlightRef.current) {
      return;
    }
    if (lastFinalizedSubmissionKeyRef.current && lastFinalizedSubmissionKeyRef.current === submissionKey) {
      return;
    }

    saveInFlightRef.current = true;
    setLoading(true);
    extraction.refs.isFinalizingRef.current = true;
    let finalizedAndExiting = false;
    const extractionIngestionStatus = String(extraction.state.ingestionStatus ?? "")
      .trim()
      .toLowerCase();
    const canKickoffIngestion =
      extractionIngestionStatus !== "processing" &&
      extractionIngestionStatus !== "done";
    const b = cleanBrandInput(brand);
    const n = norm(name);
      const hasAtLeastOnePhoto = !!(
        (photo.state.selectedPhotos?.length ?? 0) > 0 ||
        photo.state.pendingPhotoUri ||
        photo.state.photoUrl ||
        photo.state.photoUri
    );
    const traceId = String(photo.state.photoTraceId ?? "").trim() || null;
    const finalSaveStartedAt = photoPipelineNow();
    photo.actions.logPhotoPipelineEvent?.(traceId, "final_save", "start", {
      mode,
      isEdit,
      hasDraftItemId: !!extraction.state.draftItemId,
      hasPhoto: hasAtLeastOnePhoto,
    });

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
      const effectiveBrand = b || UNBRANDED_LABEL;

      const payloadBase = {
        ...buildUserEditMetadata(),
        brand: effectiveBrand,
        isUnbranded: isUnbrandedValue(effectiveBrand),
        brandSource: userEditedKeysRef.current.has("brand")
          ? "user"
          : isUnbrandedValue(effectiveBrand)
            ? "default_unbranded"
            : "ai",
        brandUpdatedAt: Date.now(),
        name: n || "",
        category: category ?? Category.TOP,
        subCategory: isValidCategorySubCategory(selectedCategory, subCategory)
          ? subCategory
          : null,
        wearSlot: wearSlot(category ?? Category.TOP),
        colors: selectedColors.map(normColor).filter(Boolean),
        primaryColor: normColor(selectedColors[0] ?? ""),
        displayColor: norm(displayColor) || null,
        displayColors: displayColors.map((value) => norm(value) || "").filter(Boolean),
        pattern: norm(pattern ?? "") || null,
        material: norm(material ?? "") || null,
        size: norm(size) || null,
        notes: norm(notes) || null,
        ...buildPricePayload(priceNum),
        sourceUrl: norm(sourceUrl) || null,
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
      photo.actions.logPhotoPipelineEvent?.(traceId, "cleaned_image_saved", "success", {
        hasOriginalUrl: !!nextPhoto.originalUrl,
        hasPhotoUrl: !!nextPhoto.photoUrl,
        hasCleanedUrl: !!nextPhoto.cleanedUrl,
        hasNormalizedUrl: !!nextPhoto.normalizedUrl,
        hasRefinedUrl: !!nextPhoto.refinedUrl,
        imageCount: nextPhoto.images.length,
      });
      const payload = {
        ...payloadBase,
        photoUrl: nextPhoto.photoUrl,
        photoUri: nextPhoto.photoUri,
        originalImageUrl: nextPhoto.originalUrl ?? nextPhoto.photoUrl,
        cleanedImageUrl: nextPhoto.cleanedUrl,
        refinedImageUrl: nextPhoto.refinedUrl,
        imageQuality: nextPhoto.imageQuality,
        productPolish: nextPhoto.productPolish,
        imageSource: nextPhoto.imageSource,
        cutoutSourceKind: nextPhoto.cutoutSourceKind,
        photoPipelineTraceId: traceId,
        images: nextPhoto.images,
      };
      if (isEdit) {
        const existingSnap = await getDoc(itemRef);
        const existingData = existingSnap.exists() ? (existingSnap.data() as any) : null;
        const isConfirmationDraft =
          existingData?.isDraft === true &&
          existingData?.draftState === "awaiting_confirmation";
        const updatePayload: Record<string, any> = {
          ...payload,
          "photos.originalUrl": nextPhoto.originalUrl ?? nextPhoto.photoUrl,
          "photos.primaryUrl": nextPhoto.photoUrl,
          "photos.refinedUrl": nextPhoto.refinedUrl,
          "photos.imageQuality": nextPhoto.imageQuality,
          "photos.productPolish": nextPhoto.productPolish,
          "photos.imageSource": nextPhoto.imageSource,
          "photos.cutoutSourceKind": nextPhoto.cutoutSourceKind,
          "photos.traceId": traceId,
          "photos.urls": nextPhoto.imageUrls,
          "photos.images": nextPhoto.images,
          isDraft: false,
          draftState: "ready",
          itemLifecycleStatus:
            (photo.state.pendingPhotoUri || isConfirmationDraft) && canKickoffIngestion
              ? "processing"
              : "ready",
          ...((photo.state.pendingPhotoUri || isConfirmationDraft) && canKickoffIngestion
            ? {
                ingestionStatus: "pending",
                ingestion: {
                  status: "pending",
                  lastRunAt: Date.now(),
                },
              }
            : {}),
        };
        if (nextPhoto.cleanedUrl) {
          updatePayload["photos.cleanedUrl"] = nextPhoto.cleanedUrl;
          updatePayload["photos.cleanedSource"] = "vision";
        }
        if (nextPhoto.normalizedUrl) {
          updatePayload["photos.normalizedUrl"] = nextPhoto.normalizedUrl;
        }
        if (nextPhoto.visualNormalization) {
          updatePayload.visualNormalization = nextPhoto.visualNormalization;
        }
        const draftUpdateStartedAt = photoPipelineNow();
        await updateDoc(itemRef, updatePayload);
        photo.actions.logPhotoPipelineEvent?.(traceId, "draft_updated", "success", {
          mode: "edit",
          itemId: itemRef.id,
          draftState: "ready",
          hasCleanedUrl: !!nextPhoto.cleanedUrl,
          hasRefinedUrl: !!nextPhoto.refinedUrl,
        }, photoPipelineDuration(draftUpdateStartedAt));
        lastFinalizedSubmissionKeyRef.current = submissionKey;
        photo.actions.logPhotoPipelineEvent?.(traceId, "final_save", "success", {
          mode: "edit",
          itemId: itemRef.id,
          photoCount: nextPhoto.imageUrls.length,
        }, photoPipelineDuration(finalSaveStartedAt));
        Toast.success("Item updated");
        void trackLaunchEvent({
          userId: uid,
          eventName: "wardrobe_item_updated",
          properties: {
            itemId: itemRef.id,
            mode,
            category: category ?? Category.TOP,
            photoCount: nextPhoto.imageUrls.length,
          },
        });
        resetDraftState();
        photo.actions.resetPhotoState?.();
        extraction.actions.resetExtractionState?.();
        finalizedAndExiting = true;
        router.replace(itemDetailRoute(itemRef.id));
        return;
      }

      if (draftItemId) {
        const updatePayload: Record<string, any> = {
          ...payload,
          "photos.originalUrl": nextPhoto.originalUrl ?? nextPhoto.photoUrl,
          "photos.primaryUrl": nextPhoto.photoUrl,
          "photos.refinedUrl": nextPhoto.refinedUrl,
          "photos.imageQuality": nextPhoto.imageQuality,
          "photos.productPolish": nextPhoto.productPolish,
          "photos.imageSource": nextPhoto.imageSource,
          "photos.cutoutSourceKind": nextPhoto.cutoutSourceKind,
          "photos.traceId": traceId,
          "photos.urls": nextPhoto.imageUrls,
          "photos.images": nextPhoto.images,
          isDraft: false,
          draftState: "ready",
          itemLifecycleStatus: "ready",
          updatedAt: Date.now(),
        };
        if (nextPhoto.cleanedUrl) {
          updatePayload["photos.cleanedUrl"] = nextPhoto.cleanedUrl;
          updatePayload["photos.cleanedSource"] = "vision";
        }
        if (nextPhoto.normalizedUrl) {
          updatePayload["photos.normalizedUrl"] = nextPhoto.normalizedUrl;
        }
        if (nextPhoto.visualNormalization) {
          updatePayload.visualNormalization = nextPhoto.visualNormalization;
        }
        if (
          photo.state.pendingPhotoUri &&
          canKickoffIngestion &&
          photo.refs.syncedPreviewUriRef.current !== photo.state.pendingPhotoUri
        ) {
          updatePayload.itemLifecycleStatus = "processing";
          updatePayload.ingestionStatus = "pending";
          updatePayload.ingestion = {
            status: "pending",
            lastRunAt: Date.now(),
          };
        }
        const draftUpdateStartedAt = photoPipelineNow();
        await updateDoc(itemRef, updatePayload);
        photo.actions.logPhotoPipelineEvent?.(traceId, "draft_updated", "success", {
          mode: "draft_create",
          itemId: itemRef.id,
          draftState: "ready",
          hasCleanedUrl: !!nextPhoto.cleanedUrl,
          hasRefinedUrl: !!nextPhoto.refinedUrl,
          ingestionStatus: updatePayload.ingestionStatus ?? "ready",
        }, photoPipelineDuration(draftUpdateStartedAt));
        lastFinalizedSubmissionKeyRef.current = submissionKey;
        photo.actions.logPhotoPipelineEvent?.(traceId, "final_save", "success", {
          mode: "draft_create",
          itemId: itemRef.id,
          photoCount: nextPhoto.imageUrls.length,
          ingestionStatus: updatePayload.ingestionStatus ?? "ready",
        }, photoPipelineDuration(finalSaveStartedAt));
        if (__DEV__) {
          console.log("[AddItemSave] success:draft-create", {
            draftItemId,
            submissionKey,
          });
        }
        Toast.itemAdded();
        void trackLaunchEvent({
          userId: uid,
          eventName: "wardrobe_item_added",
          properties: {
            itemId: itemRef.id,
            source: "draft",
            category: category ?? Category.TOP,
            photoCount: nextPhoto.imageUrls.length,
            ingestionStatus: updatePayload.ingestionStatus ?? "ready",
          },
        });
        await resetCreateFlow?.("post-save");
        extraction.actions.stopDraftSubscription?.();
        finalizedAndExiting = true;
        if (__DEV__) {
          console.log("[AddItemSave] navigate:replace-item-detail");
        }
        router.replace(itemDetailRoute(itemRef.id));
        return;
      }

      const draftUpdateStartedAt = photoPipelineNow();
      await setDoc(itemRef, {
        ...payload,
        photos: {
          originalUrl: nextPhoto.originalUrl ?? nextPhoto.photoUrl,
          primaryUrl: nextPhoto.photoUrl,
          refinedUrl: nextPhoto.refinedUrl,
          imageQuality: nextPhoto.imageQuality,
          productPolish: nextPhoto.productPolish,
          imageSource: nextPhoto.imageSource,
          cutoutSourceKind: nextPhoto.cutoutSourceKind,
          traceId,
          urls: nextPhoto.imageUrls,
          images: nextPhoto.images,
          ...(nextPhoto.cleanedUrl
            ? {
                cleanedUrl: nextPhoto.cleanedUrl,
                cleanedSource: "vision",
              }
            : {}),
          ...(nextPhoto.normalizedUrl
            ? {
                normalizedUrl: nextPhoto.normalizedUrl,
              }
            : {}),
        },
        ...(nextPhoto.visualNormalization
          ? {
              visualNormalization: nextPhoto.visualNormalization,
            }
          : {}),
        status: "AVAILABLE",
        wearCountSinceWash: 0,
        createdAt: Date.now(),
        lastWornDate: null,
        lastWashedDate: null,
        lastWashedAt: null,
        isDraft: false,
        draftState: "ready",
        ...(canKickoffIngestion
          ? {
              ingestion: {
                status: "pending",
                lastRunAt: Date.now(),
              },
            }
          : {}),
      });

      lastFinalizedSubmissionKeyRef.current = submissionKey;
      photo.actions.logPhotoPipelineEvent?.(traceId, "draft_updated", "success", {
        mode: "new_create",
        itemId: itemRef.id,
        draftState: "ready",
        hasCleanedUrl: !!nextPhoto.cleanedUrl,
        hasRefinedUrl: !!nextPhoto.refinedUrl,
        ingestionStatus: canKickoffIngestion ? "pending" : "ready",
      }, photoPipelineDuration(draftUpdateStartedAt));
      photo.actions.logPhotoPipelineEvent?.(traceId, "final_save", "success", {
        mode: "new_create",
        itemId: itemRef.id,
        photoCount: nextPhoto.imageUrls.length,
        ingestionStatus: canKickoffIngestion ? "pending" : "ready",
      }, photoPipelineDuration(finalSaveStartedAt));
      if (__DEV__) {
        console.log("[AddItemSave] success:new-create", {
          itemId: itemRef.id,
          submissionKey,
        });
      }
      Toast.itemAdded();
      void trackLaunchEvent({
        userId: uid,
        eventName: "wardrobe_item_added",
        properties: {
          itemId: itemRef.id,
          source: "manual",
          category: category ?? Category.TOP,
          photoCount: nextPhoto.imageUrls.length,
          ingestionStatus: canKickoffIngestion ? "pending" : "ready",
        },
      });
      await resetCreateFlow?.("post-save");
      extraction.actions.stopDraftSubscription?.();
      finalizedAndExiting = true;
      if (__DEV__) {
        console.log("[AddItemSave] navigate:replace-item-detail");
      }
      router.replace(itemDetailRoute(itemRef.id));
    } catch (e: any) {
      photo.actions.logPhotoPipelineEvent?.(traceId, "final_save", "failure", {
        mode,
        isEdit,
        hasPhoto: hasAtLeastOnePhoto,
        ...safeErrorData(e),
      }, photoPipelineDuration(finalSaveStartedAt));
      void trackLaunchEvent({
        userId: uid,
        eventName: "wardrobe_item_save_failed",
        properties: {
          mode,
          isEdit,
          hasPhoto: hasAtLeastOnePhoto,
          category: category ?? Category.TOP,
          ...analyticsErrorProperties(e),
        },
      });
      Alert.alert(
        "Error",
        isEdit ? "Failed to update item." : "Failed to add item."
      );
    } finally {
      if (__DEV__) {
        console.log("[AddItemSave] finally", {
          finalizedAndExiting,
        });
      }
      photo.actions.setUploadingPhoto(false);
      setLoading(false);
      if (!finalizedAndExiting) {
        extraction.refs.isFinalizingRef.current = false;
      }
      saveInFlightRef.current = false;
    }
  // resetCreateFlowRef is a stable ref container; saveItem intentionally reads .current at submit time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    brand,
    buildUserEditMetadata,
    category,
    editItemId,
    extractionRef,
    fit,
    isEdit,
    legShape,
    material,
    name,
    notes,
    displayColor,
    displayColors,
    occasionTags,
    buildPricePayload,
    parsePriceToNumber,
    parsePurchaseDate,
    pattern,
    photoRef,
    priceAmount,
    sourceUrl,
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        lastFinalizedSubmissionKeyRef.current = "";
        resetDraftState();
        photoRef.current?.actions?.resetPhotoState?.();
        extractionRef.current?.actions?.resetExtractionState?.();
        if (mode === "create") return;
        if (!uid) {
          router.replace("/(auth)/login");
          return;
        }
        const itemIdToLoad = mode === "edit" ? editItemId : duplicateItemId;
        if (!itemIdToLoad) return;
        setLoading(true);
        const ref = doc(db, "users", uid, "items", String(itemIdToLoad));
        const snap = await getDoc(ref);
        if (cancelled) return;
        if (!snap.exists()) {
          Alert.alert("Not found", "This item no longer exists.");
          safeGoBack("/(tabs)/closet");
          return;
        }
        const data = snap.data() as any;
        applyItemDataToDraft(data, { markAsDuplicate: mode === "duplicate" });
        if (mode === "edit" || mode === "duplicate") {
          photoRef.current?.actions?.hydrateFromItem?.({ id: itemIdToLoad, ...data });
        }
        if (mode === "edit") {
          extractionRef.current?.actions?.resetForLoadedEditItem?.();
        }
      } catch {
        if (cancelled) return;
        Alert.alert("Error", "Failed to load item.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    applyItemDataToDraft,
    duplicateItemId,
    editItemId,
    extractionRef,
    formSessionKey,
    mode,
    photoRef,
    resetDraftState,
    uid,
  ]);

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
    displayColor,
    displayColors,
    addingCustomColor,
    size,
    notes,
    priceAmount,
    priceCurrency,
    priceSource,
    priceDisplay,
    sourceUrl,
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
    setDisplayColor,
    setDisplayColors,
    setAddingCustomColor,
    setSize,
    setNotes,
    setPriceAmount,
    setPriceCurrency,
    setPriceSource,
    setPriceDisplay,
    setSourceUrl,
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
