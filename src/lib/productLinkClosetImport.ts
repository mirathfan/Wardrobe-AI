import { getFunctions, httpsCallable } from "firebase/functions";

import { buildClientProductLinkPreview, type ClientProductLinkPreview } from "@/src/lib/aura";
import { getFriendlyErrorMessage, isRateLimitError } from "@/src/lib/errors";
import { app } from "@/src/lib/firebase";
import type { AuraCandidateItem } from "@/src/types/aura";

export type ClosetProductLinkPreviewMetadata = {
  sourceUrl: string;
  canonicalUrl?: string | null;
  domain: string;
  retailer?: string | null;
  title?: string | null;
  brand?: string | null;
  color?: string | null;
  displayColor?: string | null;
  displayColors?: string[];
  material?: string | null;
  materials?: string[];
  fit?: string | null;
  sleeveLength?: string | null;
  collar?: string | null;
  length?: string | null;
  pattern?: string | null;
  price?: string | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  priceDisplay?: string | null;
  salePrice?: number | null;
  originalPrice?: number | null;
  description?: string | null;
  productDescription?: string | null;
  sizeHints?: string[];
  sizeOptions?: string[];
  availableSizes?: string[];
  careInstructions?: string[];
  graphicText?: string | null;
  motif?: string | null;
  collaborationName?: string | null;
  category?: string | null;
  subCategory?: string | null;
  categoryHints?: string[];
  sku?: string | null;
  styleId?: string | null;
  productId?: string | null;
  availability?: string | null;
  selectedSize?: string | null;
  sizes?: string[];
  extractionSource?: string | null;
  adapterName?: string | null;
  priceUnavailable?: boolean;
  marketPriceUnavailable?: boolean;
  imageExtractionSource?: "json_ld" | "og_image" | "twitter" | "html_image" | "fallback" | null;
  imageCandidateCount?: number | null;
  selectedImageReason?: string | null;
};

export type ClosetProductLinkPreview = {
  candidate: AuraCandidateItem;
  metadata: ClosetProductLinkPreviewMetadata;
};

export type ClosetProductLinkDraft = {
  name: string;
  brand: string;
  category: string;
  color: string;
  size: string;
};

type PreviewProductLinkResponse = {
  ok: boolean;
  preview: ClosetProductLinkPreview;
};

export class ClosetProductLinkError extends Error {
  constructor(
    message: string,
    public readonly productLinkCode?: string | null,
    public readonly details?: Record<string, unknown> | null,
  ) {
    super(message);
  }

  get blockedStore() {
    return this.productLinkCode === "blocked_store" || this.details?.blockedStore === true;
  }
}

function normalizePreviewError(error: unknown) {
  const raw = error as {
    message?: string;
    code?: string;
    details?: Record<string, unknown>;
  };
  const details = raw?.details && typeof raw.details === "object" ? raw.details : null;
  const productLinkCode =
    typeof details?.productLinkCode === "string"
      ? details.productLinkCode
      : typeof details?.code === "string"
        ? details.code
        : null;
  const failureCode = typeof details?.failureCode === "string" ? details.failureCode : null;
  const message = raw?.message ?? "";
  const looksBlocked =
    /(?:returned|status)\s+403\b|forbidden|blocked automatic reading/i.test(message);
  if (failureCode === "NO_PRODUCT_IMAGE" || failureCode === "IMPORT_REQUIRES_IMAGE" || productLinkCode === "no_images") {
    return new ClosetProductLinkError(
      "We found product details, but couldn't find a usable product image.",
      productLinkCode,
      {
        ...details,
        title: "No usable product image found.",
        message: "Upload a screenshot/photo or add an image manually.",
      },
    );
  }
  if (productLinkCode === "blocked_store" || details?.blockedStore === true || looksBlocked) {
    return new ClosetProductLinkError(
      "We couldn't fully read this product page.",
      "blocked_store",
      {
        ...details,
        title: "This store blocked automatic reading.",
        message: "We found limited preview info, or you can add from a screenshot/photo.",
      },
    );
  }
  if (
    productLinkCode === "no_metadata" ||
    productLinkCode === "no_images" ||
    productLinkCode === "fetch_failed"
  ) {
    return new ClosetProductLinkError(
      "I couldn't read this product page. Try another link, upload a screenshot, or add manually.",
      productLinkCode,
      {
        ...details,
        title: "I couldn't read this product page.",
        message: "Try another link, upload a screenshot, or add manually.",
      },
    );
  }
  return new ClosetProductLinkError(
    "I could not read that product link. Try another product page or add it manually.",
    productLinkCode,
    details,
  );
}

function isHmProductUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    return (
      (host === "hm.com" || host.endsWith(".hm.com")) &&
      /\/productpage\.\d+\.html$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function hmProductIdFromUrl(rawUrl: string) {
  try {
    return new URL(rawUrl).pathname.match(/\/productpage\.(\d+)\.html$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function safeHmImageUrls(preview: ClientProductLinkPreview | null) {
  const urls = [
    ...(preview?.imageUrls ?? []),
    preview?.imageUrl,
  ]
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      try {
        return new URL(value).hostname.toLowerCase() === "image.hm.com";
      } catch {
        return false;
      }
    });
  const seen = new Set<string>();
  return urls.filter((url) => {
    const key = url.toLowerCase().replace(/([?&])(imwidth|width|height|w|h)=\d+/g, "$1");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function previewFromSafeHmClientFallback(
  rawUrl: string,
  preview: ClientProductLinkPreview | null,
): ClosetProductLinkPreview | null {
  if (!preview || !isHmProductUrl(rawUrl) || !isHmProductUrl(preview.sourceUrl)) return null;
  const title = clean(preview.title);
  const imageUrls = safeHmImageUrls(preview);
  if (!title || !imageUrls.length) return null;
  const sourceUrl = preview.sourceUrl;
  const priceAmount =
    typeof preview.priceAmount === "number" && Number.isFinite(preview.priceAmount)
      ? preview.priceAmount
      : null;
  const currency = clean(preview.priceCurrency) || clean(preview.currency);
  const priceDisplay =
    clean(preview.priceDisplay) ||
    clean(preview.price) ||
    (priceAmount != null && currency ? `${currency} ${priceAmount}` : "");
  const category = normalizeCategory([
    preview.category,
    preview.subCategory,
    title,
  ].filter(Boolean).join(" "));
  const subCategory = preview.subCategory || subCategoryFromTitle(category, title);
  const productId = clean(preview.productId) || clean(preview.sku) || hmProductIdFromUrl(sourceUrl);
  const color = clean(preview.color);
  const candidate: AuraCandidateItem = {
    candidateId: `product-link-hm-${productId ?? Date.now()}`,
    imageUrls,
    primaryImageUrl: imageUrls[0],
    secondaryImageUrls: imageUrls.slice(1),
    title,
    category,
    subCategory,
    color,
    displayColor: color,
    displayColors: color ? [color] : [],
    brand: clean(preview.brand) || "H&M",
    confidence: 0.82,
    retailPrice: priceAmount,
    purchasePrice: priceAmount,
    estimatedValue: priceAmount,
    currency: currency || null,
    originalCurrency: currency || null,
    priceSource: priceAmount != null ? "product_link" : null,
    priceDisplay: priceDisplay || null,
    price: priceAmount,
    productUrl: sourceUrl,
    productDescription: clean(preview.description) || null,
    sourceType: "link",
    sourceUrl,
    imageSourceReason: "client_hm_preview_fallback",
    status: "needs_review",
  };
  return {
    candidate,
    metadata: {
      sourceUrl,
      canonicalUrl: sourceUrl,
      domain: "hm.com",
      retailer: "H&M",
      title,
      brand: "H&M",
      color,
      displayColor: color,
      displayColors: color ? [color] : [],
      price: priceDisplay || null,
      priceAmount,
      priceCurrency: currency || null,
      priceDisplay: priceDisplay || null,
      description: clean(preview.description) || null,
      productDescription: clean(preview.description) || null,
      category,
      subCategory,
      categoryHints: [category, subCategory].filter(Boolean),
      sku: clean(preview.sku) || productId,
      productId,
      imageExtractionSource: "fallback",
      imageCandidateCount: imageUrls.length,
      selectedImageReason: "client_hm_preview_fallback",
    },
  };
}

export async function previewProductLinkForCloset(url: string) {
  const functions = getFunctions(app);
  const callable = httpsCallable<
    {
      url: string;
      linkPreview?: {
        sourceUrl: string;
        title?: string | null;
        imageUrl?: string | null;
        imageUrls?: string[];
        description?: string | null;
        brand?: string | null;
        category?: string | null;
        subCategory?: string | null;
        color?: string | null;
        price?: string | null;
        currency?: string | null;
        priceAmount?: number | null;
        priceCurrency?: string | null;
        priceDisplay?: string | null;
        sku?: string | null;
        productId?: string | null;
      } | null;
    },
    PreviewProductLinkResponse
  >(functions, "previewProductLink");
  let linkPreview: ClientProductLinkPreview | null = null;
  try {
    linkPreview = await buildClientProductLinkPreview(url);
    const result = await callable({ url, linkPreview });
    return result.data.preview;
  } catch (error) {
    if (isRateLimitError(error)) {
      if (__DEV__) {
        console.log("[PRODUCT_LINK] previewProductLink rate limited", getFriendlyErrorMessage(error));
      }
      throw error;
    }
    const normalized = normalizePreviewError(error);
    if (normalized.blockedStore) {
      const fallback = previewFromSafeHmClientFallback(url, linkPreview);
      if (fallback) {
        if (__DEV__) {
          console.log("[PRODUCT_LINK] using safe H&M client fallback after blocked_store", {
            imageCount: fallback.metadata.imageCandidateCount,
            title: fallback.metadata.title,
          });
        }
        return fallback;
      }
    }
    throw normalized;
  }
}

function clean(value?: string | null) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCategory(raw?: string | null) {
  const value = clean(raw).toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(air jordan|jordan\s+\d+|new balance|foot locker|jd sports|men[’']?s shoes?|women[’']?s shoes?|running shoes?|basketball shoes?|shoe|sneaker|trainer|boot|loafer|sandal|footwear)\b/.test(value)) {
    return "shoes";
  }
  if (["top", "tops"].includes(value)) return "top";
  if (["bottom", "bottoms"].includes(value)) return "bottom";
  if (["outerwear", "jacket", "coat", "blazer"].includes(value)) return "outerwear";
  if (["shoes", "shoe", "footwear", "sneaker", "boot", "loafer"].includes(value)) return "shoes";
  if (["one piece", "one_piece", "dress", "dresses", "jumpsuit", "romper"].includes(value)) return "one_piece";
  if (["accessory", "accessories"].includes(value)) return "accessory";
  if (/\b(shirt|tee|t-shirt|polo|sweater|hoodie|top)\b/.test(value)) return "top";
  if (/\b(jean|trouser|pant|short|skirt)\b/.test(value)) return "bottom";
  if (/\b(jacket|coat|blazer)\b/.test(value)) return "outerwear";
  if (/\b(dress|jumpsuit|romper)\b/.test(value)) return "one_piece";
  return "unknown";
}

function subCategoryFromTitle(category: string, title?: string | null) {
  const text = clean(title).toLowerCase();
  if (category === "top") {
    if (/\bpolo\b/.test(text)) return "polo";
    if (/\bt-?shirt|tee\b/.test(text)) return "tshirt";
    if (/\bhoodie\b/.test(text)) return "hoodie";
    if (/\bsweater|jumper|knit\b/.test(text)) return "sweater";
    if (/\btank|vest\b/.test(text)) return "tank";
    if (/\bblouse\b/.test(text)) return "blouse";
    return "shirt";
  }
  if (category === "bottom") {
    if (/\bjeans?\b/.test(text)) return "jeans";
    if (/\bshorts?\b/.test(text)) return "shorts";
    if (/\bskirt\b/.test(text)) return "skirt";
    if (/\bjoggers?\b/.test(text)) return "joggers";
    return "trousers";
  }
  if (category === "outerwear") {
    if (/\bcoat\b/.test(text)) return "coat";
    if (/\bblazer\b/.test(text)) return "blazer";
    return "jacket";
  }
  if (category === "shoes") return "sneaker";
  if (category === "one_piece") return "dress";
  if (category === "accessory") return "accessory";
  if (category === "unknown") return "";
  return "";
}

export function draftFromProductLinkPreview(
  preview: ClosetProductLinkPreview,
): ClosetProductLinkDraft {
  const title = clean(preview.candidate.title) || clean(preview.metadata.title);
  return {
    name: title,
    brand:
      clean(preview.candidate.brand) ||
      clean(preview.metadata.brand) ||
      clean(preview.metadata.retailer),
    category: normalizeCategory([
      preview.candidate.category,
      preview.candidate.subCategory,
      preview.metadata.category,
      preview.metadata.subCategory,
      preview.metadata.categoryHints?.join(" "),
      title,
      preview.metadata.retailer,
      preview.metadata.domain,
    ].filter(Boolean).join(" ")),
    color: clean(preview.candidate.displayColor) || clean(preview.candidate.color) || clean(preview.metadata.displayColor) || clean(preview.metadata.color),
    size: clean(preview.metadata.sizeOptions?.[0]) || clean(preview.metadata.sizeHints?.[0]),
  };
}

function mergeSizeList(primary: string, ...lists: (string[] | undefined)[]) {
  return Array.from(
    new Set([
      clean(primary),
      ...lists.flatMap((list) => list ?? []).map((value) => clean(value)),
    ].filter(Boolean)),
  );
}

export function candidateFromProductLinkDraft(params: {
  preview: ClosetProductLinkPreview;
  draft: ClosetProductLinkDraft;
}): AuraCandidateItem {
  const { preview, draft } = params;
  const candidate = preview.candidate;
  const category = normalizeCategory([
    draft.category,
    draft.name,
    candidate.title,
    candidate.subCategory,
    preview.metadata.category,
    preview.metadata.subCategory,
    preview.metadata.categoryHints?.join(" "),
    preview.metadata.retailer,
    preview.metadata.domain,
  ].filter(Boolean).join(" "));
  const color = clean(draft.color);
  const sourceUrl = candidate.sourceUrl ?? preview.metadata.sourceUrl;
  const sizeOptions = mergeSizeList(
    draft.size,
    candidate.sizeOptions,
    preview.metadata.sizeOptions,
    preview.metadata.sizeHints,
  );
  const availableSizes = mergeSizeList(
    draft.size,
    candidate.availableSizes,
    preview.metadata.availableSizes,
    candidate.sizeOptions,
    preview.metadata.sizeOptions,
  );

  return {
    ...candidate,
    candidateId:
      clean(candidate.candidateId) ||
      `product-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceType: "link",
    sourceUrl,
    productUrl: candidate.productUrl ?? sourceUrl,
    imageSourceReason: candidate.imageSourceReason ?? "product_link_preview_selected_image",
    category,
    subCategory: candidate.subCategory || preview.metadata.subCategory || subCategoryFromTitle(category, draft.name),
    title: clean(draft.name) || clean(candidate.title) || clean(preview.metadata.title) || "Product link item",
    brand: clean(draft.brand) || clean(candidate.brand) || clean(preview.metadata.brand) || clean(preview.metadata.retailer),
    color: color || clean(candidate.color) || clean(preview.metadata.color),
    displayColor:
      color ||
      clean(candidate.displayColor) ||
      clean(candidate.color) ||
      clean(preview.metadata.displayColor) ||
      clean(preview.metadata.color),
    displayColors: preview.metadata.displayColors?.length
      ? preview.metadata.displayColors
      : color
      ? [color]
      : candidate.displayColors ?? [],
    material: clean(candidate.material) || clean(preview.metadata.material) || null,
    materials: candidate.materials?.length ? candidate.materials : preview.metadata.materials ?? [],
    fit: candidate.fit ?? preview.metadata.fit ?? null,
    pattern: candidate.pattern ?? preview.metadata.pattern ?? null,
    sleeveLength: candidate.sleeveLength ?? preview.metadata.sleeveLength ?? null,
    collar: candidate.collar ?? preview.metadata.collar ?? null,
    length: candidate.length ?? preview.metadata.length ?? null,
    sizeOptions,
    availableSizes,
    careInstructions: candidate.careInstructions?.length ? candidate.careInstructions : preview.metadata.careInstructions ?? [],
    productDescription: candidate.productDescription ?? preview.metadata.productDescription ?? preview.metadata.description ?? null,
    graphicText: candidate.graphicText ?? preview.metadata.graphicText ?? null,
    motif: candidate.motif ?? preview.metadata.motif ?? preview.metadata.graphicText ?? null,
    collaborationName: candidate.collaborationName ?? preview.metadata.collaborationName ?? null,
    status: "added",
  };
}
