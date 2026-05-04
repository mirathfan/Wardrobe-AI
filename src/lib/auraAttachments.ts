import * as FileSystem from "expo-file-system/legacy";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { addDoc, collection, doc, setDoc, updateDoc } from "firebase/firestore";

import type { ChatAttachment, ChatAudioAttachment, ChatImageAttachment } from "@/src/components/ai/chatTypes";
import { removeBackground } from "@/src/bg/removeBackground";
import { normalizeCutoutImage } from "@/src/lib/cutoutNormalize";
import { db, storage } from "@/src/lib/firebase";
import { normalizeCurrencyCode } from "@/src/lib/currency";
import { optimizeImageForUpload } from "@/src/lib/imageOptimization";
import { uploadItemPhoto } from "@/src/lib/uploadImage";
import { analyzeCutoutVisualNormalization } from "@/src/lib/visualNormalization";
import type { AuraCandidateItem, AuraDetectedOutfitPiece } from "@/src/types/aura";

const AURA_UPLOAD_LOG = "[AURA_UPLOAD]";
const AURA_DRAFT_LOG = "[AURA_DRAFT]";
const AURA_CUTOUT_LOG = "[AURA_CUTOUT]";
const MIN_USABLE_CUTOUT_TRANSPARENCY = 0.05;
const AURA_CUTOUT_TIMEOUT_MS = 25_000;
const MAX_TRANSCRIPTION_AUDIO_BYTES = 10 * 1024 * 1024;
const DEBUG_AURA_ATTACHMENTS =
  __DEV__ && process.env.EXPO_PUBLIC_AURA_DEBUG === "1";
const fileSystem = FileSystem as unknown as {
  cacheDirectory?: string | null;
  downloadAsync?: (uri: string, fileUri: string) => Promise<{ uri: string }>;
};
const fileSystemCacheDirectory = fileSystem.cacheDirectory ?? null;

function debugAuraAttachmentLog(...args: Parameters<typeof console.log>) {
  if (DEBUG_AURA_ATTACHMENTS) {
    console.log(...args);
  }
}

function priceFieldsFromCandidate(candidate: AuraCandidateItem): Record<string, unknown> {
  const amountCandidates = [
    candidate.salePrice,
    candidate.estimatedValue,
    candidate.purchasePrice,
    candidate.retailPrice,
    candidate.originalPrice,
  ];
  const amount = amountCandidates.find((value) => typeof value === "number" && Number.isFinite(value));
  if (typeof amount !== "number") return {};
  const currency = normalizeCurrencyCode(candidate.currency ?? candidate.originalCurrency);
  const priceDisplay =
    candidate.priceDisplay ??
    (currency ? `${currency} ${amount}` : String(amount));
  return {
    retailPrice: amount,
    purchasePrice: amount,
    estimatedValue: amount,
    originalPrice: candidate.originalPrice ?? amount,
    salePrice: candidate.salePrice ?? null,
    ...(currency ? { currency, originalCurrency: candidate.originalCurrency ?? currency, priceCurrency: currency } : {}),
    priceSource: candidate.priceSource ?? "product_link",
    priceDisplay,
    priceAmount: amount,
    price: amount,
    productUrl: candidate.productUrl ?? candidate.sourceUrl ?? null,
  };
}

export type AuraCandidateLocalPhoto = {
  localUri: string;
  attachmentUri?: string | null;
  width?: number | null;
  height?: number | null;
};

function normalizeFileUri(uri: string) {
  const value = String(uri ?? "").trim();
  if (!value) return "";
  if (value.startsWith("file://")) return value;
  if (value.startsWith("/")) return `file://${value}`;
  return value;
}

async function blobFromFileUri(localUri: string): Promise<Blob> {
  const fileUri = normalizeFileUri(localUri);
  if (!fileUri) throw new Error("Missing local file URI for upload.");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error("Failed to read local file."));
    xhr.ontimeout = () => reject(new Error("Timed out reading local file."));
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.responseType = "blob";
    xhr.timeout = 20_000;
    xhr.open("GET", fileUri, true);
    xhr.send(null);
  });
}

function extensionForAttachment(attachment: ChatAttachment) {
  if (attachment.type === "audio") return "m4a";
  return "jpg";
}

function contentTypeForAttachment(attachment: ChatAttachment) {
  if (attachment.type === "audio") return "audio/mp4";
  return "image/jpeg";
}

async function jpegUploadSourceForAttachment(attachment: ChatAttachment) {
  const sourceUri = attachment.localUri || attachment.uri;
  if (!sourceUri) throw new Error("Missing attachment URI.");
  if (attachment.type !== "image" || /^https?:\/\//i.test(sourceUri)) {
    return {
      sourceUri,
      uploadUri: sourceUri,
      contentType: contentTypeForAttachment(attachment),
      extension: extensionForAttachment(attachment),
      normalized: false,
      width: attachment.type === "image" ? attachment.width ?? null : null,
      height: attachment.type === "image" ? attachment.height ?? null : null,
    };
  }

  try {
    const optimized = await optimizeImageForUpload({
      uri: sourceUri,
      width: attachment.type === "image" ? attachment.width ?? null : null,
      height: attachment.type === "image" ? attachment.height ?? null : null,
      mimeType: attachment.mimeType ?? null,
      preset: "aura_chat",
    });
    debugAuraAttachmentLog(AURA_UPLOAD_LOG, "normalized image attachment for upload", {
      attachmentId: attachment.id,
      sourceMimeType: attachment.mimeType ?? null,
      sourceWidth: optimized.original.width,
      sourceHeight: optimized.original.height,
      sourceBytes: optimized.original.sizeBytes,
      normalizedWidth: optimized.width,
      normalizedHeight: optimized.height,
      normalizedBytes: optimized.sizeBytes,
      outputMimeType: "image/jpeg",
      optimized: optimized.optimized,
    });
    return {
      sourceUri,
      uploadUri: optimized.uri,
      contentType: optimized.contentType,
      extension: optimized.extension,
      normalized: optimized.optimized,
      width: optimized.width ?? attachment.width ?? null,
      height: optimized.height ?? attachment.height ?? null,
    };
  } catch (error) {
    debugAuraAttachmentLog(AURA_UPLOAD_LOG, "image normalization failed", {
      attachmentId: attachment.id,
      sourceMimeType: attachment.mimeType ?? null,
      reason: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Unable to prepare that image for AURA. Try a JPEG or PNG photo.");
  }
}

export async function uploadAuraAttachment(uid: string, attachment: ChatAttachment) {
  if (attachment.type === "audio") {
    throw new Error("Voice input is transcribed as text before sending.");
  }
  const uploadSource = await jpegUploadSourceForAttachment(attachment);
  const sourceUri = uploadSource.sourceUri;
  if (/^https?:\/\//i.test(sourceUri)) return attachment;

  debugAuraAttachmentLog(AURA_UPLOAD_LOG, "starting attachment upload", {
    uid,
    attachmentId: attachment.id,
    type: attachment.type,
    sourceMimeType: attachment.mimeType ?? null,
    uploadContentType: uploadSource.contentType,
    normalized: uploadSource.normalized,
  });
  const blob = await blobFromFileUri(uploadSource.uploadUri);
  const storagePath = `users/${uid}/auraAttachments/${Date.now()}-${attachment.id}.${uploadSource.extension}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, blob, {
    contentType: uploadSource.contentType,
  });
  const uri = await getDownloadURL(fileRef);
  debugAuraAttachmentLog(AURA_UPLOAD_LOG, "attachment upload complete", {
    uid,
    attachmentId: attachment.id,
    type: attachment.type,
    uploadContentType: uploadSource.contentType,
    uploadedBytes: typeof blob.size === "number" ? blob.size : null,
    storagePath,
    uriHost: (() => {
      try {
        return new URL(uri).hostname;
      } catch {
        return null;
      }
    })(),
  });
  return {
    ...attachment,
    uri,
    localUri: attachment.localUri ?? sourceUri,
    mimeType: uploadSource.contentType,
    storagePath,
    ...(attachment.type === "image"
      ? {
          width: uploadSource.width,
          height: uploadSource.height,
        }
      : {}),
  };
}

export async function uploadAuraAttachments(uid: string, attachments: ChatAttachment[]) {
  debugAuraAttachmentLog(AURA_UPLOAD_LOG, "uploading attachment batch", {
    uid,
    count: attachments.length,
    types: attachments.map((attachment) => attachment.type),
  });
  return Promise.all(attachments.map((attachment) => uploadAuraAttachment(uid, attachment)));
}

export async function uploadAuraTranscriptionAudio(
  uid: string,
  attachment: Pick<ChatAudioAttachment, "id" | "uri" | "localUri" | "mimeType" | "durationMs">,
) {
  const sourceUri = attachment.localUri || attachment.uri;
  if (!sourceUri) throw new Error("Missing voice recording.");
  const contentType =
    attachment.mimeType && (/^audio\//i.test(attachment.mimeType) || attachment.mimeType === "video/mp4")
      ? attachment.mimeType
      : "audio/mp4";
  const blob = await blobFromFileUri(sourceUri);
  if (typeof blob.size === "number" && blob.size > MAX_TRANSCRIPTION_AUDIO_BYTES) {
    throw new Error("That voice recording is too large. Try a shorter note.");
  }
  const recordingId = String(attachment.id ?? `${Date.now()}`).replace(/[^A-Za-z0-9._-]/g, "-");
  const storagePath = `users/${uid}/tmp/transcription/${Date.now()}-${recordingId}.m4a`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, blob, { contentType });
  debugAuraAttachmentLog(AURA_UPLOAD_LOG, "temporary transcription audio uploaded", {
    uid,
    storagePath,
    contentType,
    uploadedBytes: typeof blob.size === "number" ? blob.size : null,
    durationMs: attachment.durationMs ?? null,
  });
  return {
    storagePath,
    mimeType: contentType,
    durationMs: attachment.durationMs ?? null,
  };
}

function imageRecordForAttachment(attachment: ChatImageAttachment, isPrimary: boolean) {
  return {
    originalUrl: attachment.uri,
    isPrimary,
  };
}

export async function createAuraItemDraftsFromImages(params: {
  uid: string;
  images: ChatImageAttachment[];
  mode: "same_item" | "separate_items";
  prompt: string;
}) {
  const { uid, images, mode, prompt } = params;
  const itemGroups = mode === "separate_items" ? images.map((image) => [image]) : [images];
  const created: { itemId: string; imageCount: number }[] = [];

  debugAuraAttachmentLog(AURA_DRAFT_LOG, "creating item drafts from AURA images", {
    uid,
    mode,
    imageCount: images.length,
    groupCount: itemGroups.length,
    prompt,
    images: images.map((image) => ({
      id: image.id,
      uri: image.uri,
      role: image.role ?? null,
      groupId: image.groupId ?? null,
    })),
  });

  for (const group of itemGroups) {
    const primary = group[0];
    if (!primary) continue;
    const records = group.map((image, index) => imageRecordForAttachment(image, index === 0));
    const now = Date.now();
    const sourceHash = records.map((record) => record.originalUrl).join("|");
    const docRef = await addDoc(collection(db, "users", uid, "items"), {
      isDraft: true,
      draftState: "photo_uploaded",
      itemLifecycleStatus: "processing",
      status: "AVAILABLE",
      category: "top",
      subCategory: "",
      wearCountSinceWash: 0,
      ingestionStatus: "pending",
      ingestion: {
        status: "pending",
        lastRunAt: now,
      },
      ingestionSource: {
        sourceHash,
        sourceType: "aura_chat",
      },
      source: "aura_chat",
      auraPrompt: prompt,
      images: records,
      imageUrls: records.map((record) => record.originalUrl),
      originalImageUrl: primary.uri,
      cleanedImageUrl: null,
      photoUrl: primary.uri,
      cleanedSource: null,
      photos: {
        primaryUrl: primary.uri,
        urls: records.map((record) => record.originalUrl),
        images: records,
      },
      primaryImageProcessingStatus: "processing",
      primaryImageProcessingError: null,
      primaryImageProcessingStartedAt: now,
      primaryImageProcessedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    debugAuraAttachmentLog(AURA_DRAFT_LOG, "created item draft", {
      uid,
      itemId: docRef.id,
      imageCount: group.length,
      primaryUrl: primary.uri,
      draftState: "photo_uploaded",
      ingestionStatus: "pending",
    });
    void runPostSavePrimaryImageCutout({
      uid,
      itemId: docRef.id,
      candidateId: primary.id,
      sourceType: "image",
      primaryUrl: primary.uri,
      secondaryUrls: records.slice(1).map((record) => record.originalUrl),
      category: "top",
      subCategory: null,
      localPhoto: {
        localUri: primary.localUri ?? primary.uri,
        attachmentUri: primary.uri,
        width: primary.width ?? null,
        height: primary.height ?? null,
      },
    }).catch((error) => {
      debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] failure fallback", {
        uid,
        itemId: docRef.id,
        candidateId: primary.id,
        reason: error instanceof Error ? error.message : String(error),
        error,
      });
    });
    created.push({ itemId: docRef.id, imageCount: group.length });
  }

  if (!created.length) {
    throw new Error("No wardrobe drafts were created from the attached images.");
  }

  debugAuraAttachmentLog(AURA_DRAFT_LOG, "item draft creation finished", {
    uid,
    created,
  });
  return created;
}

export async function createProductLinkProcessingDraft(params: {
  uid: string;
  url: string;
  prompt: string;
}) {
  const { uid, url, prompt } = params;
  const now = Date.now();
  const docRef = await addDoc(collection(db, "users", uid, "items"), {
    isDraft: true,
    draftState: "photo_uploaded",
    itemLifecycleStatus: "processing",
    status: "AVAILABLE",
    category: "top",
    subCategory: "",
    wearCountSinceWash: 0,
    ingestionStatus: "pending",
    ingestion: {
      status: "pending",
      lastRunAt: now,
    },
    ingestionSource: {
      sourceHash: `link:${url}`,
      sourceType: "aura_product_link",
      sourceUrl: url,
    },
    source: "aura_product_link",
    sourceUrl: url,
    auraPrompt: prompt,
    name: "Importing from link",
    createdAt: now,
    updatedAt: now,
  });
  debugAuraAttachmentLog(AURA_DRAFT_LOG, "created product link processing draft", {
    uid,
    itemId: docRef.id,
    url,
  });
  return { itemId: docRef.id };
}

function imageRecordForUrl(url: string, isPrimary: boolean) {
  return {
    originalUrl: url,
    isPrimary,
  };
}

async function runPostSavePrimaryImageCutout(params: {
  uid: string;
  itemId: string;
  candidateId: string;
  sourceType: "image" | "link" | "batch";
  primaryUrl: string;
  secondaryUrls: string[];
  category: string;
  subCategory?: string | null;
  localPhoto?: AuraCandidateLocalPhoto | undefined;
}) {
  const {
    uid,
    itemId,
    candidateId,
    sourceType,
    primaryUrl,
    secondaryUrls,
    category,
    subCategory,
    localPhoto,
  } = params;
  debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] item save processing start", {
    uid,
    itemId,
    candidateId,
    sourceType,
    primaryUrl,
  });
  debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] primary source used", {
    uid,
    itemId,
    candidateId,
    source: localPhoto?.localUri ? "local_review_photo" : "remote_primary_download",
    hasLocalPhoto: !!localPhoto?.localUri,
  });
  debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] secondaries untouched count", {
    uid,
    itemId,
    candidateId,
    secondaryCount: secondaryUrls.length,
  });

  const itemRef = doc(db, "users", uid, "items", itemId);
  const resolvedLocalPhoto =
    localPhoto ??
    (await downloadCandidateImageToLocal({
      uid,
      candidateId,
      imageUrl: primaryUrl,
    })) ??
    undefined;

  if (!resolvedLocalPhoto?.localUri) {
    debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] failure fallback", {
      uid,
      itemId,
      candidateId,
      reason: "primary image unavailable locally",
    });
    await updateDoc(itemRef, {
      primaryImageProcessingStatus: "failed",
      primaryImageProcessingError: "primary image unavailable locally",
      primaryImageProcessedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return;
  }

  const cutout = await prepareAuraCandidateCutout({
    uid,
    candidateId,
    localPhoto: resolvedLocalPhoto,
    category,
    subCategory: subCategory ?? null,
  });

  if (!cutout?.cleanedLocalUri) {
    debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] failure fallback", {
      uid,
      itemId,
      candidateId,
      reason: "cutout unavailable",
    });
    await updateDoc(itemRef, {
      primaryImageProcessingStatus: "failed",
      primaryImageProcessingError: "cutout unavailable",
      primaryImageProcessedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return;
  }

  try {
    const uploaded = await uploadItemPhoto({
      uid,
      itemId,
      localUri: resolvedLocalPhoto.localUri,
      cleanedLocalUri: cutout.cleanedLocalUri,
      normalizedLocalUri: cutout.normalizedLocalUri,
      originalWidth: resolvedLocalPhoto.width ?? null,
      saveNormalizedAsCleaned: true,
    });
    const nextImages = [
      {
        originalUrl: uploaded.primaryUrl,
        aiUrl: uploaded.aiUrl,
        ...(uploaded.cleanedUrl ? { cleanedUrl: uploaded.cleanedUrl } : {}),
        isPrimary: true,
        sourceOriginalUrl: primaryUrl,
      },
      ...secondaryUrls.map((url) => imageRecordForUrl(url, false)),
    ];
    const nextImageUrls = [uploaded.primaryUrl, ...secondaryUrls];
    const primaryDisplayUrl = uploaded.cleanedUrl ?? uploaded.primaryUrl;
    await updateDoc(itemRef, {
      images: nextImages,
      imageUrls: nextImageUrls,
      originalImageUrl: uploaded.originalUrl,
      photoUrl: primaryDisplayUrl,
      cleanedImageUrl: uploaded.cleanedUrl ?? null,
      cleanedSource: uploaded.cleanedUrl ? "vision" : null,
      "photos.originalUrl": uploaded.originalUrl,
      "photos.primaryUrl": primaryDisplayUrl,
      "photos.aiUrl": uploaded.aiUrl,
      "photos.urls": nextImageUrls,
      "photos.images": nextImages,
      "photos.cleanedUrl": uploaded.cleanedUrl ?? null,
      "photos.cleanedSource": uploaded.cleanedUrl ? "vision" : null,
      "photos.normalizedUrl": uploaded.normalizedUrl ?? null,
      ...(cutout.visualNormalization ? { visualNormalization: cutout.visualNormalization } : {}),
      primaryImageProcessingStatus: "complete",
      primaryImageProcessingError: null,
      primaryImageProcessedAt: Date.now(),
      updatedAt: Date.now(),
    });
    debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] success with cleaned fields written", {
      uid,
      itemId,
      candidateId,
      originalImageUrl: uploaded.originalUrl,
      photoUrl: primaryDisplayUrl,
      cleanedImageUrl: uploaded.cleanedUrl ?? null,
      photosPrimaryUrl: primaryDisplayUrl,
      photosCleanedUrl: uploaded.cleanedUrl ?? null,
    });
  } catch (error) {
    debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] failure fallback", {
      uid,
      itemId,
      candidateId,
      reason: error instanceof Error ? error.message : String(error),
      error,
    });
    await updateDoc(itemRef, {
      primaryImageProcessingStatus: "failed",
      primaryImageProcessingError: error instanceof Error ? error.message : String(error),
      primaryImageProcessedAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
}

function candidateSourceType(candidate: AuraCandidateItem) {
  if (candidate.sourceType === "link") return "aura_product_link";
  if (candidate.sourceType === "batch") return "aura_candidate_batch";
  return "aura_chat";
}

function normalizedText(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function brandFromSourceUrl(sourceUrl?: string | null) {
  try {
    const host = new URL(String(sourceUrl ?? "")).hostname.replace(/^www\d*\./, "").toLowerCase();
    if (host.endsWith("hm.com")) return "H&M";
    if (host.endsWith("zara.com")) return "Zara";
    if (host.endsWith("nike.com")) return "Nike";
    const domain = host.split(".")[0] ?? "";
    return domain ? domain.charAt(0).toUpperCase() + domain.slice(1) : "";
  } catch {
    return "";
  }
}

function looksLikeGraphicBrand(value?: string | null) {
  return /\b(kodak|barbie|disney|ferrari|proshots|camera club|graphic|artwork|slogan|print)\b/i.test(
    String(value ?? ""),
  );
}

function normalizeLinkBrandAndTitle(candidate: AuraCandidateItem) {
  const sourceBrand = brandFromSourceUrl(candidate.sourceUrl);
  const rawBrand = String(candidate.brand ?? "").trim();
  const brand =
    sourceBrand && looksLikeGraphicBrand(rawBrand)
      ? sourceBrand
      : rawBrand && !/^no brand$/i.test(rawBrand)
      ? rawBrand
      : sourceBrand;
  let title = String(candidate.title ?? "").replace(/\s+/g, " ").trim();
  title = title
    .replace(/\s*\|\s*H\s*&\s*M(?:\s+[A-Z]{2})?\s*$/i, "")
    .replace(/\s*\|\s*Zara\s*$/i, "")
    .replace(/\s*\|\s*Nike\s*$/i, "")
    .replace(/^Men[’']s\s+/i, "")
    .replace(/^Women[’']s\s+/i, "")
    .replace(/^Ladies[’']?\s+/i, "")
    .trim();
  if (brand) {
    title = title
      .replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "")
      .trim();
  }
  debugAuraAttachmentLog("[LINK_BRAND_NORMALIZE]", {
    sourceUrl: candidate.sourceUrl ?? null,
    rawBrand: candidate.brand ?? null,
    rawTitle: candidate.title ?? null,
    savedBrand: brand,
    savedTitle: title,
  });
  return { brand, title };
}

function imagePathKey(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
  } catch {
    return String(url ?? "").toLowerCase();
  }
}

function hmMediaFamily(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().endsWith("image.hm.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const assetIndex = parts.indexOf("hm");
    if (assetIndex < 0 || parts.length <= assetIndex + 3) return null;
    return parts[assetIndex + 3]?.replace(/\.(jpg|jpeg|png|webp)$/i, "").toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function sameRetailerImageHost(a: string, b: string) {
  try {
    return new URL(a).hostname.toLowerCase() === new URL(b).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function buildFinalLinkImageSet(candidate: AuraCandidateItem) {
  const rawPrimary = String(candidate.primaryImageUrl ?? candidate.imageUrls?.[0] ?? "").trim();
  const rawCandidates = [
    candidate.primaryImageUrl,
    ...(candidate.imageUrls ?? []),
    ...(candidate.secondaryImageUrls ?? []),
  ].map((url) => String(url ?? "").trim()).filter(Boolean);
  const primaryUrl = rawPrimary || rawCandidates[0] || "";
  const seen = new Set<string>();
  const finalUrls: string[] = [];
  const rejected: { url: string; reason: string }[] = [];
  if (primaryUrl) {
    finalUrls.push(primaryUrl);
    seen.add(imagePathKey(primaryUrl));
  }
  const primaryHmFamily = hmMediaFamily(primaryUrl);
  const isHmLink = (() => {
    try {
      const host = new URL(String(candidate.sourceUrl ?? "")).hostname.toLowerCase();
      return host === "hm.com" || host.endsWith(".hm.com");
    } catch {
      return false;
    }
  })();

  for (const url of rawCandidates) {
    if (!url || url === primaryUrl) continue;
    const key = imagePathKey(url);
    if (seen.has(key)) continue;
    const family = hmMediaFamily(url);
    const accepted =
      isHmLink && sameRetailerImageHost(primaryUrl, url)
        ? true
        : primaryHmFamily && family
        ? family === primaryHmFamily
        : sameRetailerImageHost(primaryUrl, url) && finalUrls.length === 1;
    debugAuraAttachmentLog("[LINK_IMAGE_SECONDARY_VALIDATE]", {
      sourceUrl: candidate.sourceUrl ?? null,
      primaryUrl,
      url,
      accepted,
      reason: accepted
        ? isHmLink
          ? "reviewed H&M product image set"
          : primaryHmFamily
          ? "same H&M media family"
          : "same image host fallback"
        : primaryHmFamily
          ? "different H&M media family"
          : "weak same-product evidence",
    });
    if (!accepted) {
      rejected.push({
        url,
        reason: primaryHmFamily ? "different H&M media family" : "weak same-product evidence",
      });
      continue;
    }
    finalUrls.push(url);
    seen.add(key);
    if (finalUrls.length >= 6) break;
  }

  debugAuraAttachmentLog("[LINK_IMAGE_FINAL_SET]", {
    sourceUrl: candidate.sourceUrl ?? null,
    primaryUrl,
    finalUrls,
    rejectedCount: rejected.length,
    rejected: rejected.slice(0, 8),
  });
  return finalUrls;
}

function finalImageSetForCandidate(candidate: AuraCandidateItem) {
  if (candidate.sourceType === "link") return buildFinalLinkImageSet(candidate);
  const urls = [
    candidate.primaryImageUrl,
    ...(candidate.imageUrls ?? []),
    ...(candidate.secondaryImageUrls ?? []),
  ].map((url) => String(url ?? "").trim()).filter(Boolean);
  return Array.from(new Set(urls));
}

function normalizeCandidateCategory(candidate: AuraCandidateItem) {
  const rawCategory = normalizedText(candidate.category);
  const rawSubcategory = normalizedText(candidate.subCategory);
  const combined = `${rawCategory} ${rawSubcategory}`;

  if (["top", "tops"].includes(rawCategory)) return "top";
  if (["bottom", "bottoms"].includes(rawCategory)) return "bottom";
  if (["outerwear"].includes(rawCategory)) return "outerwear";
  if (["footwear", "shoes", "shoe"].includes(rawCategory)) return "footwear";
  if (["one_piece", "dress", "dresses", "jumpsuit", "romper"].includes(rawCategory)) return "one_piece";
  if (["accessory", "accessories"].includes(rawCategory)) return "accessory";

  if (/\b(shirt|tee|tshirt|t-shirt|polo|blouse|tank|crop_top|sweater|hoodie)\b/.test(combined)) return "top";
  if (/\b(pant|trouser|jean|short|skirt|legging)\b/.test(combined)) return "bottom";
  if (/\b(jacket|coat|blazer|outerwear)\b/.test(combined)) return "outerwear";
  if (/\b(sneaker|shoe|boot|loafer|heel|sandal)\b/.test(combined)) return "footwear";
  if (/\b(dress|jumpsuit|romper)\b/.test(combined)) return "one_piece";
  if (/\b(watch|bag|handbag|cap|hat|sunglasses|glasses|necklace|chain|bracelet|ring|earring|belt|scarf|perfume)\b/.test(combined)) {
    return "accessory";
  }

  return "top";
}

function categoryForDetectedOutfitPiece(piece: AuraDetectedOutfitPiece) {
  if (piece.role === "footwear") return "footwear";
  if (piece.role === "outerwear") return "outerwear";
  if (piece.role === "accessory") return "accessory";
  return piece.role;
}

export async function createAuraItemDraftsFromDetectedOutfit(params: {
  uid: string;
  pieces: AuraDetectedOutfitPiece[];
  sourceImageUrl?: string | null;
  prompt: string;
}) {
  const { uid, prompt } = params;
  const sourceImageUrl = String(params.sourceImageUrl ?? "").trim();
  if (!sourceImageUrl) {
    throw new Error("Missing outfit photo reference.");
  }
  const visiblePieces = params.pieces
    .filter((piece) => String(piece.label ?? "").trim())
    .slice(0, 8);
  const created: { itemId: string; candidateId: string; imageCount: number }[] = [];
  const now = Date.now();

  for (const piece of visiblePieces) {
    const category = categoryForDetectedOutfitPiece(piece);
    const candidateId = `outfit-piece-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const docRef = doc(collection(db, "users", uid, "items"));
    await setDoc(docRef, {
      isDraft: true,
      draftState: "draft",
      itemLifecycleStatus: "candidate",
      status: "AVAILABLE",
      category,
      subCategory: piece.label,
      wearCountSinceWash: 0,
      ingestionStatus: "pending",
      ingestion: {
        status: "pending",
        lastRunAt: now,
      },
      ingestionSource: {
        sourceHash: `outfit-photo:${sourceImageUrl}:${piece.role}:${piece.label}`,
        sourceType: "aura_outfit_photo",
        candidateId,
      },
      source: "aura_outfit_photo",
      auraPrompt: prompt,
      auraDetectedOutfitPiece: piece,
      name: piece.label,
      colorLabel: piece.color || "",
      displayColor: piece.color || null,
      notes: piece.notes || "Draft from outfit photo. Original photo is a reference, not a clean garment cutout.",
      confidenceSummary: {
        overall: typeof piece.confidence === "number" ? piece.confidence : 0.5,
        notes: "Detected from worn outfit photo; review before using as a closet item.",
      },
      images: [{ originalUrl: sourceImageUrl, isPrimary: true }],
      imageUrls: [sourceImageUrl],
      originalImageUrl: sourceImageUrl,
      cleanedImageUrl: null,
      photoUrl: sourceImageUrl,
      cleanedSource: null,
      photos: {
        originalUrl: sourceImageUrl,
        primaryUrl: sourceImageUrl,
        urls: [sourceImageUrl],
        images: [{ originalUrl: sourceImageUrl, isPrimary: true }],
      },
      primaryImageProcessingStatus: "idle",
      primaryImageProcessingError: null,
      primaryImageProcessedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    created.push({ itemId: docRef.id, candidateId, imageCount: 1 });
  }

  if (!created.length) throw new Error("No visible outfit pieces were detected.");
  return created;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs);
    }),
  ]);
}

async function prepareAuraCandidateCutout(params: {
  uid: string;
  candidateId: string;
  localPhoto: AuraCandidateLocalPhoto;
  category: string;
  subCategory?: string | null;
}) {
  const { uid, candidateId, localPhoto, category, subCategory } = params;
  const localUri = normalizeFileUri(localPhoto.localUri);
  if (!localUri) return null;

  try {
    debugAuraAttachmentLog(AURA_CUTOUT_LOG, "starting client cutout for AURA candidate", {
      uid,
      candidateId,
      hasAttachmentUri: !!localPhoto.attachmentUri,
      width: localPhoto.width ?? null,
      height: localPhoto.height ?? null,
    });
    const cutout = await withTimeout(
      removeBackground(localUri, {
        threshold: 0.64,
        cleanupRadius: 2,
        feather: 0,
        edgeTighten: 0.45,
        edgePolish: 0.5,
        maskToAlpha: true,
      }),
      AURA_CUTOUT_TIMEOUT_MS,
      "AURA background removal"
    );
    const usableCutout =
      cutout.uri &&
      cutout.uri !== localUri &&
      cutout.hasTransparency &&
      cutout.transparentPixelRatio >= MIN_USABLE_CUTOUT_TRANSPARENCY;
    const canNormalizePrimary =
      !!cutout.contentBounds && !!cutout.width && !!cutout.height && !!(cutout.uri || localUri);
    debugAuraAttachmentLog(AURA_CUTOUT_LOG, "client cutout finished", {
      uid,
      candidateId,
      usableCutout,
      canNormalizePrimary,
      hasTransparency: cutout.hasTransparency,
      transparentPixelRatio: cutout.transparentPixelRatio,
      hasContentBounds: !!cutout.contentBounds,
    });
    if (!usableCutout && !canNormalizePrimary) return null;

    const visualNormalization =
      cutout.contentBounds && cutout.width && cutout.height
        ? await analyzeCutoutVisualNormalization({
            contentBounds: cutout.contentBounds,
            imageWidth: cutout.width,
            imageHeight: cutout.height,
            category,
            subCategory: subCategory ?? null,
          })
        : null;
    const normalizedCutout = canNormalizePrimary
      ? await normalizeCutoutImage({
          cutoutUri: cutout.uri || localUri,
          contentBounds: cutout.contentBounds,
          imageWidth: cutout.width,
          imageHeight: cutout.height,
          category,
          subCategory: subCategory ?? null,
        })
      : null;

    return {
      cleanedLocalUri: usableCutout ? cutout.uri : normalizedCutout?.uri ?? null,
      normalizedLocalUri: normalizedCutout?.uri ?? null,
      visualNormalization,
    };
  } catch (error) {
    debugAuraAttachmentLog(AURA_CUTOUT_LOG, "client cutout failed; saving original only", {
      uid,
      candidateId,
      errorMessage: error instanceof Error ? error.message : String(error),
      error,
    });
    return null;
  }
}

async function downloadCandidateImageToLocal(params: {
  uid: string;
  candidateId: string;
  imageUrl: string;
}): Promise<AuraCandidateLocalPhoto | null> {
  const url = String(params.imageUrl ?? "").trim();
  if (!/^https?:\/\//i.test(url)) {
    debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] failure fallback", {
      uid: params.uid,
      candidateId: params.candidateId,
      reason: "primary image URL is not http/https",
      imageUrl: url || null,
    });
    return null;
  }
  if (!fileSystemCacheDirectory || !fileSystem.downloadAsync) {
    debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] failure fallback", {
      uid: params.uid,
      candidateId: params.candidateId,
      reason: "expo file downloader unavailable",
      hasCacheDirectory: !!fileSystemCacheDirectory,
      hasDownloadAsync: !!fileSystem.downloadAsync,
    });
    return null;
  }
  try {
    const destination = `${fileSystemCacheDirectory}aura-${params.candidateId}-${Date.now()}.jpg`;
    debugAuraAttachmentLog(AURA_CUTOUT_LOG, "downloading remote candidate image for cutout", {
      uid: params.uid,
      candidateId: params.candidateId,
      url,
    });
    const result = await fileSystem.downloadAsync(url, destination);
    return {
      localUri: result.uri,
      attachmentUri: url,
      width: null,
      height: null,
    };
  } catch (error) {
    debugAuraAttachmentLog(AURA_CUTOUT_LOG, "remote candidate download failed", {
      uid: params.uid,
      candidateId: params.candidateId,
      errorMessage: error instanceof Error ? error.message : String(error),
      error,
    });
    return null;
  }
}

export async function createAuraItemDraftsFromCandidates(params: {
  uid: string;
  candidates: AuraCandidateItem[];
  prompt: string;
  mode: "pending" | "awaiting_confirmation";
  localPhotosByCandidateId?: Record<string, AuraCandidateLocalPhoto | undefined>;
}) {
  const { uid, candidates, prompt, mode, localPhotosByCandidateId = {} } = params;
  const created: { itemId: string; imageCount: number; candidateId: string }[] = [];

  debugAuraAttachmentLog(AURA_DRAFT_LOG, "creating item drafts from AURA candidates", {
    uid,
    mode,
    candidateCount: candidates.length,
  });

  for (const candidate of candidates) {
    const normalizedLinkFields =
      candidate.sourceType === "link" ? normalizeLinkBrandAndTitle(candidate) : null;
    debugAuraAttachmentLog("[LINK_IMAGE_SOURCE]", {
      sourceUrl: candidate.sourceUrl ?? null,
      candidateId: candidate.candidateId,
      primaryImageUrl: candidate.primaryImageUrl ?? null,
      imageUrls: candidate.imageUrls ?? [],
      secondaryImageUrls: candidate.secondaryImageUrls ?? [],
    });
    const uniqueUrls = finalImageSetForCandidate(candidate);
    const primaryUrl = uniqueUrls[0];
    if (!primaryUrl) continue;
    const records = uniqueUrls.map((url, index) => imageRecordForUrl(url, index === 0));
    const now = Date.now();
    const sourceHash = uniqueUrls.join("|");
    const draftState = mode === "awaiting_confirmation" ? "draft" : "photo_uploaded";
    const ingestionStatus = "pending";
    const category = normalizeCandidateCategory(candidate);
    const matchedLocalPhoto = localPhotosByCandidateId[candidate.candidateId];
    const localPhoto = matchedLocalPhoto ?? undefined;
    const docRef = doc(collection(db, "users", uid, "items"));
    const payload = {
      isDraft: true,
      draftState,
      auraCandidateState: mode === "awaiting_confirmation" ? "candidate" : "confirmed",
      itemLifecycleStatus: mode === "awaiting_confirmation" ? "candidate" : "processing",
      status: "AVAILABLE",
      category,
      subCategory: candidate.subCategory || "",
      wearCountSinceWash: 0,
      ingestionStatus,
      ingestion: {
        status: ingestionStatus,
        lastRunAt: now,
      },
      ingestionSource: {
        sourceHash,
        sourceType: candidateSourceType(candidate),
        candidateId: candidate.candidateId,
        ...(candidate.sourceUrl ? { sourceUrl: candidate.sourceUrl } : {}),
      },
      source: candidateSourceType(candidate),
      ...(candidate.sourceUrl ? { sourceUrl: candidate.sourceUrl } : {}),
      ...(candidate.productUrl ?? candidate.sourceUrl ? { productUrl: candidate.productUrl ?? candidate.sourceUrl } : {}),
      auraPrompt: prompt,
      auraCandidate: candidate,
      name: normalizedLinkFields?.title ?? candidate.title ?? "",
      brand: normalizedLinkFields?.brand ?? candidate.brand ?? "",
      colorLabel: candidate.displayColor || candidate.color || "",
      displayColor: candidate.displayColor || candidate.color || null,
      displayColors: candidate.displayColors ?? [],
      material: candidate.material || null,
      materials: candidate.materials ?? [],
      pattern: candidate.pattern || null,
      fit: candidate.fit || null,
      sleeveLength: candidate.sleeveLength ?? null,
      collar: candidate.collar ?? null,
      length: candidate.length ?? null,
      sizeOptions: candidate.sizeOptions ?? [],
      availableSizes: candidate.availableSizes ?? candidate.sizeOptions ?? [],
      careInstructions: candidate.careInstructions ?? [],
      productDescription: candidate.productDescription ?? null,
      graphicText: candidate.graphicText ?? null,
      motif: candidate.motif ?? candidate.graphicText ?? null,
      collaborationName: candidate.collaborationName ?? null,
      ...priceFieldsFromCandidate(candidate),
      images: records,
      imageUrls: uniqueUrls,
      originalImageUrl: primaryUrl,
      cleanedImageUrl: null,
      photoUrl: primaryUrl,
      cleanedSource: null,
      photos: {
        originalUrl: primaryUrl,
        primaryUrl: primaryUrl,
        urls: uniqueUrls,
        images: records,
      },
      primaryImageProcessingStatus: mode === "pending" ? "processing" : "idle",
      primaryImageProcessingError: null,
      primaryImageProcessingStartedAt: mode === "pending" ? now : null,
      primaryImageProcessedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    debugAuraAttachmentLog(AURA_DRAFT_LOG, "confirming AURA candidate item", {
      uid,
      path: `users/${uid}/items/{new}`,
      mode,
      createMode: "addDoc",
      payloadKeys: Object.keys(payload),
      candidateId: candidate.candidateId,
      rawCategory: candidate.category ?? null,
      rawSubCategory: candidate.subCategory ?? null,
      category,
      hasLocalPhoto: !!localPhoto?.localUri,
      hasCleanedUrl: false,
    });
    await setDoc(docRef, payload);
    if (candidate.sourceType === "link") {
      debugAuraAttachmentLog("[LINK_IMAGE_CLEANUP]", {
        uid,
        candidateId: candidate.candidateId,
        selectedPrimaryImage: primaryUrl,
        hasLocalPhoto: !!localPhoto?.localUri,
        cleanedOutputUrl: null,
        finalPrimaryUrl: primaryUrl,
      });
      debugAuraAttachmentLog("[LINK_IMAGE_SAVE]", {
        uid,
        candidateId: candidate.candidateId,
        primaryUrl,
        imageUrls: uniqueUrls,
        savedFields: {
          originalImageUrl: primaryUrl,
          photoUrl: primaryUrl,
          photosPrimaryUrl: primaryUrl,
          cleanedImageUrl: null,
        },
      });
      debugAuraAttachmentLog("[LINK_IMAGE_SAVE_SET]", {
        uid,
        candidateId: candidate.candidateId,
        rawCandidateImageCount: [
          candidate.primaryImageUrl,
          ...(candidate.imageUrls ?? []),
          ...(candidate.secondaryImageUrls ?? []),
        ].filter(Boolean).length,
        finalImageCount: uniqueUrls.length,
        finalImageUrls: uniqueUrls,
      });
      debugAuraAttachmentLog("[LINK_SAVE_FIELDS]", {
        uid,
        candidateId: candidate.candidateId,
        brand: payload.brand,
        title: payload.name,
        category: payload.category,
        subCategory: payload.subCategory,
        originalImageUrl: payload.originalImageUrl,
        cleanedImageUrl: payload.cleanedImageUrl,
        photoUrl: payload.photoUrl,
        photosPrimaryUrl: payload.photos.primaryUrl,
      });
    }
    if (mode === "pending") {
      void runPostSavePrimaryImageCutout({
        uid,
        itemId: docRef.id,
        candidateId: candidate.candidateId,
        sourceType: candidate.sourceType,
        primaryUrl,
        secondaryUrls: uniqueUrls.slice(1),
        category,
        subCategory: candidate.subCategory,
        localPhoto,
      }).catch((error) => {
        debugAuraAttachmentLog("[PRIMARY_POSTSAVE_CUTOUT] failure fallback", {
          uid,
          itemId: docRef.id,
          candidateId: candidate.candidateId,
          reason: error instanceof Error ? error.message : String(error),
          error,
        });
      });
    }
    created.push({
      itemId: docRef.id,
      imageCount: uniqueUrls.length,
      candidateId: candidate.candidateId,
    });
  }

  if (!created.length) {
    throw new Error("No wardrobe drafts were created from these item previews.");
  }

  debugAuraAttachmentLog(AURA_DRAFT_LOG, "candidate draft creation finished", {
    uid,
    created,
  });
  return created;
}
