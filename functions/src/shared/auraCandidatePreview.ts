import OpenAI from "openai";
import type { ProductExtraction } from "./productLinkExtractor";

export type AuraCandidateItem = {
  candidateId: string;
  imageUrls: string[];
  primaryImageUrl?: string | null;
  secondaryImageUrls?: string[];
  title?: string | null;
  category?: string | null;
  subCategory?: string | null;
  color?: string | null;
  brand?: string | null;
  material?: string | null;
  fit?: string | null;
  pattern?: string | null;
  confidence?: number | null;
  sourceType: "image" | "link" | "batch";
  sourceUrl?: string | null;
  status: "awaiting_confirmation" | "needs_review" | "added" | "cancelled" | "failed";
};

export type RankedProductImage = {
  url: string;
  score: number;
  reasons: string[];
  isGarmentOnly: boolean;
  isModelImage: boolean;
  isFrontFacing: boolean;
  bucket?: ProductImageBucket;
};

type ProductImageBucket = "garment_only" | "model_editorial" | "unknown";

type RawProductImageRanking = {
  index: number;
  score: number;
  isGarmentOnly: boolean;
  isModelImage: boolean;
  isFrontFacing: boolean;
  containsMultipleGarments: boolean;
  reasons: string[];
};

export function candidatePreviewResponse(candidates: AuraCandidateItem[]) {
  const needsReview = candidates.some((candidate) => candidate.status === "needs_review");
  const response = {
    presentation: "candidate_preview" as const,
    title: candidates.length === 1 ? "Review item" : "Review items",
    reply: needsReview
      ? "I couldn’t fully read this item — review before adding"
      : candidates.length === 1
        ? "I found this item. Want me to add it?"
        : `I found ${candidates.length} items. Review them before I add them.`,
    reason: "",
    outfitItems: [],
    ownedPieces: [],
    recommendedAdditions: [],
    swapSuggestion: "",
    chips: [],
    look: null,
    candidateItems: candidates,
    candidates,
  };
  console.info("[AURA_CANDIDATE_BACKEND] preview payload created", {
    candidateCount: candidates.length,
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    sourceTypes: candidates.map((candidate) => candidate.sourceType),
    hasCandidateItems: true,
    hasCandidatesAlias: true,
    keys: Object.keys(response),
  });
  return response;
}

export function fallbackImageCandidates(imageGroups: string[][]): AuraCandidateItem[] {
  const batch = imageGroups.length > 1;
  return imageGroups
    .filter((imageUrls) => imageUrls.length > 0)
    .map((imageUrls, index) =>
      cleanCandidate(
        {
          title: null,
          category: null,
          subCategory: null,
          color: null,
          brand: null,
          material: null,
          fit: null,
          pattern: null,
          confidence: null,
        },
        imageUrls,
        index,
        batch,
      ),
    );
}

export function candidatesFromProductExtractions(
  extractions: ProductExtraction[],
): AuraCandidateItem[] {
  return extractions.map((extraction, index) => ({
    candidateId: `link-${Date.now()}-${index}`,
    imageUrls: extraction.imageUrls,
    primaryImageUrl: extraction.imageUrls[0] ?? null,
    secondaryImageUrls: extraction.imageUrls.slice(1),
    title: extraction.metadata.title ?? null,
    category: extraction.metadata.categoryHints?.[0] ?? null,
    subCategory: extraction.metadata.categoryHints?.[1] ?? null,
    color: extraction.metadata.color ?? null,
    brand:
      extraction.status === "needs_review"
        ? extraction.metadata.brand ?? null
        : extraction.metadata.brand ?? extraction.metadata.retailer ?? null,
    material: extraction.metadata.material ?? null,
    fit: null,
    pattern: null,
    confidence: extraction.confidence ?? null,
    sourceType: extractions.length > 1 ? "batch" : "link",
    sourceUrl: extraction.metadata.sourceUrl,
    status: extraction.status === "needs_review" ? "needs_review" : "awaiting_confirmation",
  }));
}

function stableUniqueUrls(urls: string[]) {
  const seen = new Set<string>();
  return urls
    .map((url) => String(url ?? "").trim())
    .filter(Boolean)
    .filter((url) => {
      const key = url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function productImageReasonText(result: RawProductImageRanking | undefined) {
  return (result?.reasons ?? []).join(" ").toLowerCase();
}

function productImageReasonSuggestsModel(result: RawProductImageRanking | undefined) {
  const text = productImageReasonText(result).replace(
    /\b(no visible|without|no)\s+(person|model|human|body|torso|leg|arm|head)s?\b/g,
    "",
  );
  return /\b(model|person|human|wearing|worn|body|torso|leg|arm|head|full[-\s]?body|editorial)\b/.test(
    text,
  );
}

function productImageReasonSuggestsGarmentOnly(result: RawProductImageRanking | undefined) {
  return /\b(garment[-\s]?only|product[-\s]?only|standalone|isolated|flat[-\s]?lay|plain background|studio product|no visible (person|model|human))\b/.test(
    productImageReasonText(result),
  );
}

function productImageBucket(result: RawProductImageRanking | undefined): ProductImageBucket {
  if (result?.isModelImage || productImageReasonSuggestsModel(result)) return "model_editorial";
  if (result?.isGarmentOnly || productImageReasonSuggestsGarmentOnly(result)) return "garment_only";
  return "unknown";
}

function productImageScore(result: RawProductImageRanking | undefined, bucket: ProductImageBucket) {
  const baseScore = Math.max(0, Math.min(100, Number(result?.score ?? 20)));
  if (bucket === "garment_only") {
    return (
      baseScore +
      (result?.isFrontFacing ? 40 : 0) -
      (result?.containsMultipleGarments ? 45 : 0)
    );
  }
  if (bucket === "model_editorial") {
    return (
      baseScore +
      (result?.isFrontFacing ? 10 : 0) -
      120 -
      (result?.containsMultipleGarments ? 60 : 0)
    );
  }
  return baseScore - (result?.containsMultipleGarments ? 35 : 0);
}

function sortProductImages(items: RankedProductImage[]) {
  return [...items].sort((a, b) => b.score - a.score);
}

function orderProductImageBuckets(items: RankedProductImage[]) {
  const garmentOnly = items.filter((item) => item.bucket === "garment_only");
  const modelEditorial = items.filter((item) => item.bucket === "model_editorial");
  const unknown = items.filter((item) => item.bucket === "unknown");

  if (garmentOnly.length > 0) {
    return [
      ...sortProductImages(garmentOnly),
      ...sortProductImages(unknown),
      ...sortProductImages(modelEditorial),
    ];
  }

  return sortProductImages(items);
}

function logProductImageBuckets(params: {
  sourceUrl?: string | null;
  items: RankedProductImage[];
}) {
  const buckets: Record<ProductImageBucket, string[]> = {
    garment_only: [],
    model_editorial: [],
    unknown: [],
  };
  for (const item of params.items) {
    buckets[item.bucket ?? "unknown"].push(item.url);
  }
  console.info("[LINK_PRIMARY_BUCKETS]", {
    sourceUrl: params.sourceUrl ?? null,
    garmentOnlyCount: buckets.garment_only.length,
    modelEditorialCount: buckets.model_editorial.length,
    unknownCount: buckets.unknown.length,
    garmentOnlyUrls: buckets.garment_only,
    modelEditorialUrls: buckets.model_editorial,
    unknownUrls: buckets.unknown,
  });
  console.info("[LINK_IMAGE_BUCKETS]", {
    sourceUrl: params.sourceUrl ?? null,
    garmentOnlyCount: buckets.garment_only.length,
    modelEditorialCount: buckets.model_editorial.length,
    unknownCount: buckets.unknown.length,
    garmentOnlyUrls: buckets.garment_only,
    modelEditorialUrls: buckets.model_editorial,
    unknownUrls: buckets.unknown,
  });
}

export async function rankProductLinkImages(params: {
  client: OpenAI;
  imageUrls: string[];
  title?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
}): Promise<RankedProductImage[]> {
  const imageUrls = stableUniqueUrls(params.imageUrls).slice(0, 24);
  console.info("[LINK_IMAGE_CANDIDATES]", {
    sourceUrl: params.sourceUrl ?? null,
    candidateCount: imageUrls.length,
    urls: imageUrls,
    title: params.title ?? null,
  });
  if (imageUrls.length <= 1) {
    return imageUrls.map((url) => ({
      url,
      score: 50,
      reasons: ["only image candidate"],
      isGarmentOnly: false,
      isModelImage: false,
      isFrontFacing: false,
      bucket: "unknown",
    }));
  }

  try {
    const response = await params.client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "developer",
          content:
            "Rank retail product images for wardrobe item ingestion. Classify product-only images separately from model/editorial images. A garment-only/product-only image has no visible person, model, limbs, head, torso, mannequin, or full outfit; it is usually a standalone garment on a plain studio background or flat lay. Any image with a person wearing the item, even if the target product is visible, is model/editorial. If the title says shirt, shorts, jeans, or another specific garment, a full-body model wearing other garments is not garment-only.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Product title: ${params.title ?? "unknown"}\n` +
                `Description: ${params.description ?? "unknown"}\n` +
                "For each image index, score 0-100 for usefulness as the primary wardrobe item image and classify whether it is garment-only/product-only, model/editorial, front-facing/canonical, and whether it contains multiple visible garments. Return JSON only.",
            },
            ...imageUrls.flatMap((url, index) => [
              {
                type: "input_text" as const,
                text: `Image index ${index}: ${url}`,
              },
              {
                type: "input_image" as const,
                image_url: url,
                detail: "high" as const,
              },
            ]),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "product_image_ranking",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              rankings: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    index: { type: "number" },
                    score: { type: "number" },
                    isGarmentOnly: { type: "boolean" },
                    isModelImage: { type: "boolean" },
                    isFrontFacing: { type: "boolean" },
                    containsMultipleGarments: { type: "boolean" },
                    reasons: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: [
                    "index",
                    "score",
                    "isGarmentOnly",
                    "isModelImage",
                    "isFrontFacing",
                    "containsMultipleGarments",
                    "reasons",
                  ],
                },
              },
            },
            required: ["rankings"],
          },
        },
      },
    });
    const parsed = JSON.parse(String(response.output_text || "{}")) as {
      rankings?: {
        index: number;
        score: number;
        isGarmentOnly: boolean;
        isModelImage: boolean;
        isFrontFacing: boolean;
        containsMultipleGarments: boolean;
        reasons: string[];
      }[];
    };
    const byIndex = new Map((parsed.rankings ?? []).map((entry) => [Math.trunc(entry.index), entry]));
    const scored = imageUrls.map((url, index) => {
        const result = byIndex.get(index);
        const bucket = productImageBucket(result);
        const score = productImageScore(result, bucket);
        const item = {
          url,
          score,
          reasons: result?.reasons?.slice(0, 4) ?? ["not ranked by model"],
          isGarmentOnly: !!result?.isGarmentOnly,
          isModelImage: !!result?.isModelImage,
          isFrontFacing: !!result?.isFrontFacing,
          bucket,
        };
        console.info("[LINK_PRIMARY_SCORE]", {
          sourceUrl: params.sourceUrl ?? null,
          index,
          url,
          bucket: item.bucket,
          baseScore: result?.score ?? null,
          score: item.score,
          isGarmentOnly: item.isGarmentOnly,
          isModelImage: item.isModelImage,
          isFrontFacing: item.isFrontFacing,
          containsMultipleGarments: !!result?.containsMultipleGarments,
          reasons: item.reasons,
        });
        console.info("[LINK_IMAGE_SCORE]", {
          sourceUrl: params.sourceUrl ?? null,
          index,
          url,
          score: item.score,
          isGarmentOnly: item.isGarmentOnly,
          isModelImage: item.isModelImage,
          isFrontFacing: item.isFrontFacing,
          reasons: item.reasons,
        });
        return item;
      });
    logProductImageBuckets({ sourceUrl: params.sourceUrl, items: scored });
    const ranked = orderProductImageBuckets(scored);
    console.info("[LINK_PRIMARY_CHOSEN]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      bucket: ranked[0]?.bucket ?? null,
      score: ranked[0]?.score ?? null,
      reasons: ranked[0]?.reasons ?? [],
      garmentOnlyAvailable: scored.some((item) => item.bucket === "garment_only"),
    });
    console.info("[LINK_IMAGE_PRIMARY]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      primaryReasons: ranked[0]?.reasons ?? [],
      primaryIsGarmentOnly: ranked[0]?.isGarmentOnly ?? false,
    });
    console.info("[LINK_IMAGE_SECONDARY]", {
      sourceUrl: params.sourceUrl ?? null,
      secondaryImageUrls: ranked.slice(1).map((item) => item.url),
    });
    return ranked;
  } catch (error) {
    console.warn("[LINK_IMAGE_SCORE]", "visual ranking failed; using stable URL order", {
      sourceUrl: params.sourceUrl ?? null,
      error,
    });
    const ranked = imageUrls.map((url, index) => ({
      url,
      score: imageUrls.length - index,
      reasons: ["visual ranking unavailable"],
      isGarmentOnly: false,
      isModelImage: false,
      isFrontFacing: false,
      bucket: "unknown" as const,
    }));
    logProductImageBuckets({ sourceUrl: params.sourceUrl, items: ranked });
    console.info("[LINK_PRIMARY_CHOSEN]", {
      sourceUrl: params.sourceUrl ?? null,
      primaryImageUrl: ranked[0]?.url ?? null,
      bucket: ranked[0]?.bucket ?? null,
      score: ranked[0]?.score ?? null,
      reasons: ranked[0]?.reasons ?? [],
      garmentOnlyAvailable: false,
    });
    return ranked;
  }
}

export function productCategoryHintsFromText(title?: string | null, description?: string | null) {
  const text = `${title ?? ""} ${description ?? ""}`.toLowerCase();
  if (/\b(shorts?|trousers?|pants?|jeans?|skirt|leggings?)\b/.test(text)) {
    return { category: "bottom", subCategory: text.includes("short") ? "shorts" : null };
  }
  if (/\b(shirt|t-shirt|tee|polo|sweater|hoodie|blouse|top)\b/.test(text)) {
    return { category: "top", subCategory: text.includes("sweater") ? "sweater" : null };
  }
  if (/\b(jacket|coat|blazer)\b/.test(text)) return { category: "outerwear", subCategory: null };
  if (/\b(shoe|sneaker|boot|loafer|sandal)\b/.test(text)) return { category: "footwear", subCategory: null };
  if (/\b(dress|jumpsuit|romper)\b/.test(text)) return { category: "one_piece", subCategory: null };
  return { category: null, subCategory: null };
}

type ImageCandidateExtraction = {
  title?: string | null;
  category?: string | null;
  subCategory?: string | null;
  color?: string | null;
  brand?: string | null;
  material?: string | null;
  fit?: string | null;
  pattern?: string | null;
  confidence?: number | null;
};

function cleanCandidate(value: ImageCandidateExtraction, imageUrls: string[], index: number, batch: boolean): AuraCandidateItem {
  return {
    candidateId: `image-${Date.now()}-${index}`,
    imageUrls,
    primaryImageUrl: imageUrls[0] ?? null,
    secondaryImageUrls: imageUrls.slice(1),
    title: value.title ?? null,
    category: value.category ?? null,
    subCategory: value.subCategory ?? null,
    color: value.color ?? null,
    brand: value.brand ?? null,
    material: value.material ?? null,
    fit: value.fit ?? null,
    pattern: value.pattern ?? null,
    confidence: typeof value.confidence === "number" ? value.confidence : null,
    sourceType: batch ? "batch" : "image",
    sourceUrl: null,
    status: "awaiting_confirmation",
  };
}

export async function extractImageCandidates(params: {
  client: OpenAI;
  imageGroups: string[][];
}): Promise<AuraCandidateItem[]> {
  const candidates: AuraCandidateItem[] = [];
  const batch = params.imageGroups.length > 1;

  for (let index = 0; index < params.imageGroups.length; index += 1) {
    const imageUrls = params.imageGroups[index] ?? [];
    if (!imageUrls.length) continue;
    const response = await params.client.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "developer",
          content:
            "Extract concise clothing item preview details from the image(s). Return JSON only. Do not invent brand/material if not visible.",
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Return JSON with keys: title, category, subCategory, color, brand, material, fit, pattern, confidence. Use null for unknown values.",
            },
            ...imageUrls.map((url) => ({
              type: "input_image" as const,
              image_url: url,
              detail: "auto" as const,
            })),
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "aura_candidate_item",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: { type: ["string", "null"] },
              category: { type: ["string", "null"] },
              subCategory: { type: ["string", "null"] },
              color: { type: ["string", "null"] },
              brand: { type: ["string", "null"] },
              material: { type: ["string", "null"] },
              fit: { type: ["string", "null"] },
              pattern: { type: ["string", "null"] },
              confidence: { type: ["number", "null"] },
            },
            required: [
              "title",
              "category",
              "subCategory",
              "color",
              "brand",
              "material",
              "fit",
              "pattern",
              "confidence",
            ],
          },
        },
      },
    });
    let parsed: ImageCandidateExtraction = {};
    try {
      parsed = JSON.parse(String(response.output_text || "{}")) as ImageCandidateExtraction;
    } catch {
      parsed = {};
    }
    candidates.push(cleanCandidate(parsed, imageUrls, index, batch));
  }

  return candidates;
}
