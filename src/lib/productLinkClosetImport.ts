import { getFunctions, httpsCallable } from "firebase/functions";

import { buildClientProductLinkPreview } from "@/src/lib/aura";
import { app } from "@/src/lib/firebase";
import type { AuraCandidateItem } from "@/src/types/aura";

export type ClosetProductLinkPreviewMetadata = {
  sourceUrl: string;
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
  categoryHints?: string[];
  sku?: string | null;
  imageExtractionSource?: "json_ld" | "og_image" | "twitter" | "html_image" | "fallback" | null;
  imageCandidateCount?: number | null;
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
  const message = raw?.message ?? "";
  const looksBlocked =
    /(?:returned|status)\s+403\b|forbidden|blocked automatic reading/i.test(message);
  if (productLinkCode === "blocked_store" || details?.blockedStore === true || looksBlocked) {
    return new ClosetProductLinkError(
      "This store blocked automatic reading.",
      "blocked_store",
      {
        ...details,
        title: "This store blocked automatic reading.",
        message: "You can try again, paste another link, or add the item from a screenshot.",
      },
    );
  }
  return new ClosetProductLinkError(
    raw?.message ?? "I could not read that product link. Try another product page or add it manually.",
    productLinkCode,
    details,
  );
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
      } | null;
    },
    PreviewProductLinkResponse
  >(functions, "previewProductLink");
  try {
    const linkPreview = await buildClientProductLinkPreview(url);
    const result = await callable({ url, linkPreview });
    return result.data.preview;
  } catch (error) {
    throw normalizePreviewError(error);
  }
}

function clean(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeCategory(raw?: string | null) {
  const value = clean(raw).toLowerCase().replace(/[_-]+/g, " ");
  if (["top", "tops"].includes(value)) return "top";
  if (["bottom", "bottoms"].includes(value)) return "bottom";
  if (["outerwear", "jacket", "coat", "blazer"].includes(value)) return "outerwear";
  if (["shoes", "shoe", "footwear", "sneaker", "boot", "loafer"].includes(value)) return "shoes";
  if (["one piece", "one_piece", "dress", "dresses", "jumpsuit", "romper"].includes(value)) return "one_piece";
  if (["accessory", "accessories"].includes(value)) return "accessory";
  if (/\b(shirt|tee|t-shirt|polo|sweater|hoodie|top)\b/.test(value)) return "top";
  if (/\b(jean|trouser|pant|short|skirt)\b/.test(value)) return "bottom";
  if (/\b(jacket|coat|blazer)\b/.test(value)) return "outerwear";
  if (/\b(shoe|sneaker|boot|loafer|sandal)\b/.test(value)) return "shoes";
  if (/\b(dress|jumpsuit|romper)\b/.test(value)) return "one_piece";
  return "top";
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
  return "";
}

export function draftFromProductLinkPreview(
  preview: ClosetProductLinkPreview,
): ClosetProductLinkDraft {
  return {
    name: clean(preview.candidate.title) || clean(preview.metadata.title),
    brand:
      clean(preview.candidate.brand) ||
      clean(preview.metadata.brand) ||
      clean(preview.metadata.retailer),
    category: normalizeCategory(preview.candidate.category ?? preview.metadata.categoryHints?.[0]),
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
  const category = normalizeCategory(draft.category);
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
    category,
    subCategory: candidate.subCategory || subCategoryFromTitle(category, draft.name),
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
