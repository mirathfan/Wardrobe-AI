import { doc, writeBatch } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { app, db, storage } from "@/src/lib/firebase";
import { earlyAccessErrorMessage, isEarlyAccessError } from "@/src/lib/earlyAccess";
import { getFriendlyErrorMessage, isRateLimitError } from "@/src/lib/errors";
import { optimizeImageForUpload } from "@/src/lib/imageOptimization";
import { blobFromFileUri } from "@/src/lib/uploadImage";
import type {
  DetectedGarment,
  ExtractOutfitItemsResponse,
  ExtractedGarmentPreview,
  OutfitExtractionDraft,
  PolishExtractedAccessoryResponse,
  ReconstructOutfitLayoutResponse,
} from "@/src/types/OutfitExtraction";

type UploadOutfitPhotoParams = {
  uid: string;
  localUri: string;
  width?: number | null;
  height?: number | null;
};

type ExtractOutfitItemsParams = {
  imageUrl: string;
  storagePath: string;
  imageHash?: string | null;
  traceId?: string | null;
  qualityPreferences?: {
    maxItems?: number;
    preferSpeed?: boolean;
    skipPolish?: boolean;
    skipBackgroundRemoval?: boolean;
    skipQualityScoring?: boolean;
  };
};

type PolishExtractedAccessoryParams = {
  traceId: string;
  itemTempId: string;
  cropImageUrl: string;
  category: "accessory";
  subcategory?: string | null;
  suggestedName?: string | null;
};

type ReconstructOutfitLayoutParams = {
  imageUrl: string;
  storagePath: string;
  imageHash?: string | null;
  traceId?: string | null;
  detectedItems?: DetectedGarment[];
};

const OUTFIT_EXTRACTION_CALLABLE_TIMEOUT_MS = 540_000;
const ACCESSORY_POLISH_CALLABLE_TIMEOUT_MS = 240_000;
const DEBUG_OUTFIT_EXTRACTION =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG_OUTFIT_EXTRACTION === "true";

function randomToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function safeDocToken(value: string) {
  return String(value || "item")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item";
}

function cleanText(value: unknown, maxLength = 120) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function hasPartialVisibilityWarning(item: DetectedGarment) {
  const warningText = [
    ...(item.extractionWarnings ?? []),
    ...(item.imageQuality?.refinementReason ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return (
    item.extractionQuality?.partiallyVisible === true ||
    (item.imageQuality?.visibilityCompleteness ?? 1) < 0.72 ||
    /\b(partial|partly|occluded|hidden|blocked|cropped|not fully visible|low visibility)\b/.test(warningText)
  );
}

function isLayoutCropMethod(method?: string | null) {
  return method === "layout_grid_crop" || method === "layout_bbox_crop" || method === "layout_crop";
}

function hasRawCropFallback(item: DetectedGarment) {
  if (isLayoutCropMethod(item.extractionMethod)) return false;
  if (item.extractionMethod === "original_crop_fallback") return true;
  return (
    item.imageState === "raw_fallback" ||
    item.extractionQuality?.rawCropFallback === true ||
    !(item.cleanedImageUrl || item.refinedImageUrl)
  );
}

function isLowConfidence(item: DetectedGarment) {
  const minimum = item.category === "accessory" ? 0.65 : 0.55;
  return item.extractionQuality?.lowConfidence === true || item.confidence < minimum;
}

function defaultSelected(item: DetectedGarment) {
  if (typeof item.selectedByDefault === "boolean") return item.selectedByDefault;
  if (item.imageSource === "outfit_layout_reconstruction") {
    if (!isLayoutCropMethod(item.extractionMethod)) return false;
    if (isLowConfidence(item) || hasPartialVisibilityWarning(item)) return false;
    if (item.category === "accessory" && item.confidence < 0.72) return false;
    return true;
  }
  if (item.category === "accessory") {
    if (!item.userPolished) return false;
    if (!(item.cleanedImageUrl || item.refinedImageUrl)) return false;
    if (item.confidence < 0.72 || hasPartialVisibilityWarning(item) || isLowConfidence(item)) {
      return false;
    }
    return true;
  }
  if (!item.cleanedImageUrl) return false;
  if (hasRawCropFallback(item) || isLowConfidence(item)) return false;
  return true;
}

function imageStateFor(item: DetectedGarment) {
  if (item.imageState) return item.imageState;
  if (item.cleanedImageUrl || item.refinedImageUrl) return "polished";
  if (item.imageSource === "outfit_layout_reconstruction") return "cropped";
  if (item.category === "accessory") return "cropped";
  return "raw_fallback";
}

export async function uploadOutfitPhotoForExtraction(params: UploadOutfitPhotoParams) {
  const optimized = await optimizeImageForUpload({
    uri: params.localUri,
    width: params.width,
    height: params.height,
    preset: "item_display",
  });
  const blob = await blobFromFileUri(optimized.uri);
  const storagePath = `users/${params.uid}/outfitExtraction/uploads/${randomToken()}.jpg`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, blob, { contentType: "image/jpeg" });
  const imageUrl = await getDownloadURL(fileRef);
  return {
    imageUrl,
    storagePath,
    width: optimized.width,
    height: optimized.height,
  };
}

export async function extractOutfitItems(params: ExtractOutfitItemsParams) {
  const functions = getFunctions(app);
  const callable = httpsCallable<ExtractOutfitItemsParams, ExtractOutfitItemsResponse>(
    functions,
    "extractOutfitItems",
    { timeout: OUTFIT_EXTRACTION_CALLABLE_TIMEOUT_MS },
  );
  try {
    const result = await callable(params);
    return result.data;
  } catch (error) {
    logOutfitExtractionClient("outfit_extraction_failed", {
      traceId: params.traceId,
      message: getFriendlyErrorMessage(error),
    });
    throw error;
  }
}

export async function reconstructOutfitLayout(params: ReconstructOutfitLayoutParams) {
  logOutfitLayoutClient("layout_reconstruction_started", {
    traceId: params.traceId,
    hasImageUrl: !!params.imageUrl,
    hasStoragePath: !!params.storagePath,
  });
  const functions = getFunctions(app);
  const callable = httpsCallable<ReconstructOutfitLayoutParams, ReconstructOutfitLayoutResponse>(
    functions,
    "reconstructOutfitLayout",
    { timeout: OUTFIT_EXTRACTION_CALLABLE_TIMEOUT_MS },
  );
  try {
    const result = await callable(params);
    logOutfitLayoutClient("layout_reconstruction_success", {
      traceId: result.data.traceId,
      hasReconstructedLayoutUrl: !!result.data.reconstructedLayoutUrl,
      itemCount: result.data.layoutItems.length,
    });
    return result.data;
  } catch (error) {
    logOutfitLayoutClient("layout_reconstruction_failed", {
      traceId: params.traceId,
      message: getFriendlyErrorMessage(error),
    });
    throw error;
  }
}

export async function polishExtractedAccessory(params: PolishExtractedAccessoryParams) {
  logOutfitExtractionClient("accessory_polish_requested", {
    traceId: params.traceId,
    itemTempId: params.itemTempId,
    category: params.category,
  });
  const functions = getFunctions(app);
  const callable = httpsCallable<PolishExtractedAccessoryParams, PolishExtractedAccessoryResponse>(
    functions,
    "polishExtractedAccessory",
    { timeout: ACCESSORY_POLISH_CALLABLE_TIMEOUT_MS },
  );
  try {
    const result = await callable(params);
    logOutfitExtractionClient("accessory_polish_success", {
      traceId: params.traceId,
      itemTempId: params.itemTempId,
      hasCleanedImageUrl: !!result.data.cleanedImageUrl,
    });
    return result.data;
  } catch (error) {
    logOutfitExtractionClient("accessory_polish_failed", {
      traceId: params.traceId,
      itemTempId: params.itemTempId,
      message: getFriendlyErrorMessage(error),
    });
    throw error;
  }
}

export function outfitExtractionErrorMessage(error: unknown) {
  if (isEarlyAccessError(error)) {
    return earlyAccessErrorMessage(error);
  }
  if (isRateLimitError(error)) {
    return getFriendlyErrorMessage(error);
  }
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  const combined = `${code} ${message}`.toLowerCase();

  if (combined.includes("deadline-exceeded") || combined.includes("timeout")) {
    return "This photo took too long to process. Try a clearer, well-lit outfit photo cropped closer to the outfit.";
  }
  if (combined.includes("resource-exhausted") || combined.includes("quota")) {
    return "AURA is a little overloaded right now. Try again in a minute with a clearer outfit photo.";
  }
  if (combined.includes("unavailable") || combined.includes("network")) {
    return "The outfit extractor could not stay connected. Check your connection and try the photo again.";
  }
  if (combined.includes("unauthenticated")) {
    return "Please sign in again before extracting outfit pieces.";
  }

  return "AURA could not extract garments from this outfit photo. Try a clearer full-body photo, or crop closer to the pieces.";
}

export function toOutfitExtractionDraft(params: {
  sourceImageUrl: string;
  sourceStoragePath: string;
  response: ExtractOutfitItemsResponse;
}): OutfitExtractionDraft {
  const detectedItems = params.response.detectedItems.map((item) => {
    const selected = defaultSelected(item);
    logOutfitExtractionClient("item_review_image_selected", {
      tempId: item.tempId,
      category: item.category,
      confidence: item.confidence,
      hasCleanedImageUrl: !!item.cleanedImageUrl,
      hasRefinedImageUrl: !!item.refinedImageUrl,
      imageState: imageStateFor(item),
      imageSource: item.imageSource ?? "outfit_extraction",
      extractionMethod: item.extractionMethod ?? null,
      autoPolishApplied: item.autoPolishApplied === true,
      userPolished: item.userPolished === true,
      fallbackUsed: hasRawCropFallback(item),
      selectedByDefault: selected,
    });
    return {
      ...item,
      autoPolishApplied: item.autoPolishApplied === true,
      userPolished: item.userPolished === true,
      imageState: imageStateFor(item),
      polishAvailable: item.polishAvailable ?? (item.category === "accessory"),
      polishSkippedReason: item.polishSkippedReason ?? null,
      reconstructionWarnings: item.reconstructionWarnings ?? [],
      selected,
      suggestedName: cleanText(item.suggestedName) || titleCase(item.subcategory || item.category),
      suggestedBrand: cleanText(item.suggestedBrand) || null,
      suggestedColors: item.suggestedColors.map((color) => titleCase(color)).filter(Boolean).slice(0, 3),
      extractionWarnings: item.extractionWarnings ?? [],
      extractionMetadata: {
        ...item.extractionMetadata,
        polishWarnings: item.extractionMetadata.polishWarnings ?? [],
        polishApplied: item.autoPolishApplied === true || item.extractionMetadata.polishApplied === true,
        backgroundRemovalApplied: item.extractionMetadata.backgroundRemovalApplied === true,
      },
    };
  });

  return {
    traceId: params.response.traceId,
    sourceImageUrl: params.sourceImageUrl,
    sourceStoragePath: params.sourceStoragePath,
    reconstructedLayoutUrl: null,
    summary: params.response.summary,
    detectedItems,
  };
}

export function toOutfitLayoutDraft(params: {
  sourceImageUrl: string;
  sourceStoragePath: string;
  response: ReconstructOutfitLayoutResponse;
}): OutfitExtractionDraft {
  const detectedItems = params.response.layoutItems.map((item) => {
    const selected = defaultSelected(item);
    logOutfitLayoutClient("layout_item_review_ready", {
      tempId: item.tempId,
      category: item.category,
      confidence: item.confidence,
      extractionMethod: item.extractionMethod ?? null,
      selectedByDefault: selected,
    });
    return {
      ...item,
      autoPolishApplied: false,
      userPolished: item.userPolished === true,
      imageState: imageStateFor(item),
      imageSource: "outfit_layout_reconstruction" as const,
      reconstructedLayoutUrl: item.reconstructedLayoutUrl ?? params.response.reconstructedLayoutUrl,
      polishAvailable: item.polishAvailable ?? (item.category === "accessory"),
      polishSkippedReason: item.polishSkippedReason ?? null,
      reconstructionWarnings: item.reconstructionWarnings ?? [],
      selected,
      suggestedName: cleanText(item.suggestedName) || titleCase(item.subcategory || item.category),
      suggestedBrand: cleanText(item.suggestedBrand) || null,
      suggestedColors: item.suggestedColors.map((color) => titleCase(color)).filter(Boolean).slice(0, 3),
      extractionWarnings: item.extractionWarnings ?? [],
      extractionMetadata: {
        ...item.extractionMetadata,
        polishWarnings: item.extractionMetadata.polishWarnings ?? [],
        polishApplied: false,
        backgroundRemovalApplied: item.extractionMetadata.backgroundRemovalApplied === true,
      },
    };
  });

  return {
    traceId: params.response.traceId,
    sourceImageUrl: params.sourceImageUrl,
    sourceStoragePath: params.sourceStoragePath,
    reconstructedLayoutUrl: params.response.reconstructedLayoutUrl,
    summary: params.response.summary,
    detectedItems,
  };
}

function primaryImageUrl(item: ExtractedGarmentPreview) {
  return item.normalizedImageUrl || item.cleanedImageUrl || item.layoutCropUrl || item.refinedImageUrl || item.originalCropUrl || item.cropImageUrl;
}

function imageSourceFor(item: ExtractedGarmentPreview) {
  if (item.imageSource === "outfit_layout_reconstruction") {
    return isLayoutCropMethod(item.extractionMethod)
      ? "outfit_layout_reconstruction"
      : "original_crop_fallback";
  }
  const polishApplied =
    item.autoPolishApplied === true ||
    item.userPolished === true ||
    item.polishApplied === true ||
    item.extractionMetadata.polishApplied === true;
  if (item.cleanedImageUrl && item.refinedImageUrl) return "polished_cutout";
  if (item.cleanedImageUrl && polishApplied) {
    return "polished_cutout";
  }
  if (item.cleanedImageUrl) return "original_cutout";
  if (item.refinedImageUrl) return "polished";
  return "original";
}

function cutoutSourceKindFor(item: ExtractedGarmentPreview) {
  if (item.imageSource === "outfit_layout_reconstruction") {
    return isLayoutCropMethod(item.extractionMethod)
      ? item.extractionMethod ?? "layout_crop"
      : "original";
  }
  return item.refinedImageUrl ||
    item.autoPolishApplied ||
    item.userPolished ||
    item.polishApplied ||
    item.extractionMetadata.polishApplied
    ? "polished"
    : "original";
}

function logOutfitExtractionClient(step: string, data: Record<string, unknown>) {
  if (!DEBUG_OUTFIT_EXTRACTION) return;
  console.info(`[AURA OutfitExtraction] step=${step} data=${JSON.stringify(data)}`);
}

function logOutfitLayoutClient(step: string, data: Record<string, unknown>) {
  if (!DEBUG_OUTFIT_EXTRACTION) return;
  console.info(`[AURA OutfitLayout] step=${step} data=${JSON.stringify(data)}`);
}

function cleanColors(colors: string[]) {
  return colors.map((color) => titleCase(color)).filter(Boolean).slice(0, 3);
}

export async function saveSelectedOutfitExtractionItems(params: {
  uid: string;
  draft: OutfitExtractionDraft;
  items: ExtractedGarmentPreview[];
}) {
  const selected = params.items.filter((item) => item.selected && !item.removed && primaryImageUrl(item));
  if (!selected.length) return [];

  const now = Date.now();
  const batch = writeBatch(db);
  const created: { itemId: string; tempId: string }[] = [];
  for (const item of selected) {
    const itemId = `outfit-${safeDocToken(params.draft.traceId)}-${safeDocToken(item.tempId)}`;
    const itemRef = doc(db, "users", params.uid, "items", itemId);
    const primaryUrl = primaryImageUrl(item);
    const colors = cleanColors(item.suggestedColors);
    const brand = cleanText(item.suggestedBrand) || "Unbranded";
    const isUnbranded = item.isUnbranded === true || brand === "Unbranded";
    const imageState = item.imageState ?? imageStateFor(item);
    const polishWarnings = item.extractionMetadata.polishWarnings ?? [];
    const polishApplied =
      item.autoPolishApplied === true ||
      item.userPolished === true ||
      item.polishApplied === true ||
      item.extractionMetadata.polishApplied === true;
    const backgroundRemovalApplied =
      item.cutoutApplied === true || item.extractionMetadata.backgroundRemovalApplied === true;
    const intentionalSkip =
      !polishApplied &&
      (item.polishSkippedReason === "accessory_auto_skip" || imageState === "cropped");
    const productPolishStatus = polishApplied
      ? "applied"
      : intentionalSkip
        ? "not_needed"
        : polishWarnings.length
          ? "failed"
          : "not_needed";
    const imageRecord = {
      traceId: params.draft.traceId,
      originalUrl: item.cropImageUrl,
      originalCropUrl: item.originalCropUrl ?? item.cropImageUrl,
      originalOutfitImageUrl: params.draft.sourceImageUrl,
      sourceOriginalUrl: params.draft.sourceImageUrl,
      reconstructedLayoutUrl: item.reconstructedLayoutUrl ?? params.draft.reconstructedLayoutUrl ?? null,
      layoutCropUrl: item.layoutCropUrl ?? null,
      normalizedImageUrl: item.normalizedImageUrl ?? null,
      extractionMethod: item.extractionMethod ?? null,
      metadataSource: item.metadataSource ?? null,
      ...(item.refinedImageUrl ? { refinedUrl: item.refinedImageUrl } : {}),
      ...(item.cleanedImageUrl ? { cleanedUrl: item.cleanedImageUrl } : {}),
      imageSource: imageSourceFor(item),
      cutoutSourceKind: cutoutSourceKindFor(item),
      imageState,
      autoPolishApplied: item.autoPolishApplied === true,
      userPolished: item.userPolished === true,
      isPrimary: true,
    };
    const selectedImageSource = imageSourceFor(item);
    logOutfitExtractionClient("item_save_image_selected", {
      tempId: item.tempId,
      category: item.category,
      confidence: item.confidence,
      hasCleanedImageUrl: !!item.cleanedImageUrl,
      hasRefinedImageUrl: !!item.refinedImageUrl,
      fallbackUsed: hasRawCropFallback(item),
      imageState,
      imageSource: item.imageSource ?? "outfit_extraction",
      extractionMethod: item.extractionMethod ?? null,
      autoPolishApplied: item.autoPolishApplied === true,
      userPolished: item.userPolished === true,
      selectedImageSource,
    });

    batch.set(itemRef, {
      status: "AVAILABLE",
      laundryStatus: "clean",
      category: item.category,
      subCategory: item.subcategory,
      wearSlot: item.category === "accessory" ? "accessory" : "core",
      wearCountSinceWash: 0,
      lastWornDate: null,
      lastWashedDate: null,
      lastWashedAt: null,
      createdAt: now,
      updatedAt: now,
      isDraft: false,
      draftState: null,
      itemLifecycleStatus: "ready",
      ingestionStatus: "done",
      ingestion: {
        status: "done",
        lastRunAt: now,
        completedAt: now,
      },
      source: item.imageSource ?? "outfit_extraction",
      name: cleanText(item.suggestedName) || titleCase(item.subcategory || item.category),
      brand,
      isUnbranded,
      brandSource: item.suggestedBrand ? "ai" : "default_unbranded",
      brandConfidence: item.suggestedBrand ? Math.max(0.55, item.confidence) : null,
      colors,
      displayColors: colors,
      primaryColor: colors[0] ?? null,
      displayColor: colors[0] ?? null,
      colorLabel: colors[0] ?? "",
      colorSource: "ai",
      colorUpdatedAt: now,
      material: cleanText(item.material) || null,
      materialEstimate: item.materialEstimate ?? [],
      pattern: cleanText(item.pattern) || null,
      fit: cleanText(item.fit) || null,
      styleAesthetic: (item.styleAesthetic ?? []).map((entry) => cleanText(entry, 40)).filter(Boolean).slice(0, 5),
      confidenceSummary: {
        overall: item.confidence,
        notes: item.extractionWarnings?.[0] || "Extracted from outfit photo.",
      },
      originalImageUrl: item.cropImageUrl,
      originalOutfitImageUrl: params.draft.sourceImageUrl,
      originalCropUrl: item.originalCropUrl ?? item.cropImageUrl,
      reconstructedLayoutUrl: item.reconstructedLayoutUrl ?? params.draft.reconstructedLayoutUrl ?? null,
      layoutCropUrl: item.layoutCropUrl ?? null,
      normalizedImageUrl: item.normalizedImageUrl ?? null,
      extractionMethod: item.extractionMethod ?? null,
      metadataSource: item.metadataSource ?? null,
      generatedFromOutfit: true,
      reconstructionWarnings: item.reconstructionWarnings ?? [],
      refinedImageUrl: item.refinedImageUrl ?? null,
      cleanedImageUrl: item.cleanedImageUrl ?? null,
      photoUrl: primaryUrl,
      imageSource: selectedImageSource,
      cutoutSourceKind: cutoutSourceKindFor(item),
      imageQuality: item.imageQuality ?? null,
      extractionQuality: item.extractionQuality ?? null,
      autoPolishApplied: item.autoPolishApplied === true,
      userPolished: item.userPolished === true,
      imageState,
      polishAvailable: item.polishAvailable === true,
      polishSkippedReason: item.polishSkippedReason ?? null,
      polishApplied,
      cutoutApplied: backgroundRemovalApplied,
      productPolish: {
        source: "photo_upload",
        status: productPolishStatus,
        activeVariant: cutoutSourceKindFor(item),
        traceId: params.draft.traceId,
        refinedStoragePath: item.extractionMetadata.refinedStoragePath ?? null,
        refinedImageUrl: item.refinedImageUrl ?? null,
        warnings: polishWarnings,
        appliedAt: now,
      },
      photoPipelineTraceId: params.draft.traceId,
      backgroundRemovalMethod: backgroundRemovalApplied ? "server" : "none",
      images: [imageRecord],
      imageUrls: [primaryUrl],
      photos: {
        traceId: params.draft.traceId,
        originalUrl: item.cropImageUrl,
        originalCropUrl: item.originalCropUrl ?? item.cropImageUrl,
        originalOutfitImageUrl: params.draft.sourceImageUrl,
        reconstructedLayoutUrl: item.reconstructedLayoutUrl ?? params.draft.reconstructedLayoutUrl ?? null,
        layoutCropUrl: item.layoutCropUrl ?? null,
        normalizedImageUrl: item.normalizedImageUrl ?? null,
        extractionMethod: item.extractionMethod ?? null,
        metadataSource: item.metadataSource ?? null,
        primaryUrl,
        refinedUrl: item.refinedImageUrl ?? null,
        cleanedUrl: item.cleanedImageUrl ?? null,
        cleanedPhotoUrl: item.cleanedImageUrl ?? null,
        cleanedSource: backgroundRemovalApplied ? "vision" : item.normalizedImageUrl ? "layout_normalized" : null,
        urls: [primaryUrl],
        images: [imageRecord],
        imageQuality: item.imageQuality ?? null,
        productPolish: {
          source: "photo_upload",
          status: productPolishStatus,
          activeVariant: cutoutSourceKindFor(item),
          traceId: params.draft.traceId,
          refinedStoragePath: item.extractionMetadata.refinedStoragePath ?? null,
          refinedImageUrl: item.refinedImageUrl ?? null,
          warnings: polishWarnings,
          appliedAt: now,
        },
        imageState,
        imageSource: item.imageSource ?? "outfit_extraction",
        reconstructionWarnings: item.reconstructionWarnings ?? [],
        autoPolishApplied: item.autoPolishApplied === true,
        userPolished: item.userPolished === true,
      },
      outfitExtraction: {
        traceId: params.draft.traceId,
        tempId: item.tempId,
        sourceImageUrl: params.draft.sourceImageUrl,
        sourceStoragePath: params.draft.sourceStoragePath,
        reconstructedLayoutUrl: item.reconstructedLayoutUrl ?? params.draft.reconstructedLayoutUrl ?? null,
        layoutCropUrl: item.layoutCropUrl ?? null,
        normalizedImageUrl: item.normalizedImageUrl ?? null,
        originalCropUrl: item.originalCropUrl ?? item.cropImageUrl,
        boundingBox: item.boundingBox,
        boundingBoxOnLayout: item.boundingBoxOnLayout ?? null,
        confidence: item.confidence,
        imageSource: item.imageSource ?? "outfit_extraction",
        extractionMethod: item.extractionMethod ?? null,
        metadataSource: item.metadataSource ?? null,
        extractionQuality: item.extractionQuality ?? null,
        autoPolishApplied: item.autoPolishApplied === true,
        userPolished: item.userPolished === true,
        imageState,
        polishAvailable: item.polishAvailable === true,
        polishSkippedReason: item.polishSkippedReason ?? null,
        polishApplied,
        cutoutApplied: backgroundRemovalApplied,
        reconstructionWarnings: item.reconstructionWarnings ?? [],
        warnings: item.extractionWarnings ?? [],
      },
      ingestionSource: {
        sourceHash: `outfitExtraction:${params.draft.traceId}:${item.tempId}`,
        sourceType: item.imageSource ?? "outfit_extraction",
      },
    });
    if (item.imageSource === "outfit_layout_reconstruction") {
      logOutfitLayoutClient("item_saved_with_layout_metadata", {
        traceId: params.draft.traceId,
        tempId: item.tempId,
        category: item.category,
        extractionMethod: item.extractionMethod ?? null,
        metadataSource: item.metadataSource ?? null,
        hasNormalizedImageUrl: !!item.normalizedImageUrl,
      });
    }
    created.push({ itemId, tempId: item.tempId });
  }

  await batch.commit();
  return created;
}
