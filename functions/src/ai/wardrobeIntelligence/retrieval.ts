import { HttpsError } from "firebase-functions/v2/https";
import { EMBEDDING_VECTOR_FIELD } from "./config";
import { isReadyClosetItem } from "./draftAudit";
import { normalizeClosetItemMetadata } from "./metadata";
import type {
  NormalizedWardrobeRetrievalInput,
  WardrobeRetrievalCategoryBucket,
  WardrobeRetrievalCategoryBuckets,
  WardrobeRetrievalDiagnostics,
  WardrobeRetrievalFormality,
  WardrobeRetrievalResult,
} from "./retrievalTypes";
import type { ClosetItemDocument, NormalizedClosetItemMetadata } from "./types";

export const DEFAULT_RETRIEVAL_LIMIT = 12;
export const MAX_RETRIEVAL_LIMIT = 50;
export const MAX_RAW_VECTOR_LIMIT = 100;
export const VECTOR_DISTANCE_FIELD = "vectorDistance";

export type WardrobeVectorCandidate = {
  itemId: string;
  item: ClosetItemDocument;
  distance?: number | null;
};

const EMPTY_BUCKETS: WardrobeRetrievalCategoryBuckets = {
  top: [],
  bottom: [],
  footwear: [],
  outerwear: [],
  accessory: [],
  one_piece: [],
  unknown: [],
};

const FOOTWEAR_PATTERN = /\b(shoes?|footwear|sneakers?|boots?|loafers?|penny loafers?|sandals?|slides?|oxford shoes?|derb(?:y|ies)|dress shoes?|formal shoes?|air force|air max|reactx|rejuven8|nike shoes|zara shoes)\b/;
const OFFICE_QUERY_PATTERN = /\b(office|work|business|meeting|presentation|professional|smart casual|smart_casual|formal)\b/;
const WEAK_OFFICE_TOP_PATTERN = /\b(tank|tank top|vest top|sleeveless|graphic tee|graphic t shirt|graphic tshirt|loud graphic|gym top|athletic top|training top)\b/;
const GRAPHIC_TOP_PATTERN = /\b(graphic tee|graphic t shirt|graphic tshirt|loud graphic)\b/;
const OFFICE_TOP_PATTERN = /\b(button shirt|button down|button-down|oxford shirt|dress shirt|polo|knit polo|overshirt)\b/;
const CLEAN_TSHIRT_PATTERN = /\b(clean tee|plain tee|minimal tee|clean t shirt|plain t shirt|minimal t shirt|solid tee|solid t shirt)\b/;
const OFFICE_FOOTWEAR_PATTERN = /\b(loafer|loafers|penny loafer|derby|derbies|oxford|oxfords|dress shoe|dress shoes|formal shoe|formal shoes)\b/;
const OFFICE_SNEAKER_PATTERN = /\b(clean|minimal|plain|leather)\b.*\b(sneaker|sneakers)\b|\b(sneaker|sneakers)\b.*\b(clean|minimal|plain|leather)\b/;
const WEAK_OFFICE_FOOTWEAR_PATTERN = /\b(sandal|sandals|slide|slides|running shoe|running shoes|gym shoe|gym shoes|athletic shoe|athletic shoes|training shoe|training shoes|loud sneaker|loud sneakers)\b/;
const OFFICE_BOTTOM_PATTERN = /\b(trousers|straight trousers|tailored pants|tailored trousers|chinos|dress pants)\b/;
const OFFICE_OUTERWEAR_PATTERN = /\b(blazer|overshirt|sport coat|formal jacket)\b/;

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(cleanText)
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map(cleanText)
      .filter(Boolean);
  }
  return [];
}

function uniqueNormalizedStrings(value: unknown, limit = 16): string[] {
  return [...new Set(asStringArray(value).map(normalizedText).filter(Boolean))].slice(0, limit);
}

function normalizeFormality(value: unknown): WardrobeRetrievalFormality {
  const text = normalizedText(value || "any");
  if (!text || text === "any") return "any";
  if (text === "smart casual" || text === "smart_casual") return "smart_casual";
  if (text === "casual" || text === "formal") return text;
  throw new HttpsError(
    "invalid-argument",
    "formality must be one of casual, smart_casual, formal, or any.",
  );
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_RETRIEVAL_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_RETRIEVAL_LIMIT;
  return Math.max(1, Math.min(MAX_RETRIEVAL_LIMIT, Math.floor(parsed)));
}

export function normalizeWardrobeRetrievalInput(value: unknown): NormalizedWardrobeRetrievalInput {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const query = cleanText(data.query);
  if (!query) {
    throw new HttpsError("invalid-argument", "A non-empty wardrobe retrieval query is required.");
  }

  const occasion = cleanText(data.occasion);
  const weather = cleanText(data.weather);
  return {
    query,
    limit: normalizeLimit(data.limit),
    ...(occasion ? { occasion } : {}),
    categories: uniqueNormalizedStrings(data.categories),
    styleTags: uniqueNormalizedStrings(data.styleTags),
    colors: uniqueNormalizedStrings(data.colors),
    ...(weather ? { weather } : {}),
    formality: normalizeFormality(data.formality),
    includeDiagnostics: data.includeDiagnostics === true,
  };
}

export function rawVectorLimit(limit: number): number {
  return Math.min(MAX_RAW_VECTOR_LIMIT, Math.max(limit * 3, limit));
}

export function scoreFromCosineDistance(distance: number | null | undefined): number | null {
  if (typeof distance !== "number" || !Number.isFinite(distance)) return null;
  return Number(Math.max(0, Math.min(1, 1 - distance)).toFixed(4));
}

function metadataForItem(item: ClosetItemDocument): NormalizedClosetItemMetadata {
  const generated = normalizeClosetItemMetadata(item);
  const stored = item.aiMetadata && typeof item.aiMetadata === "object"
    ? item.aiMetadata as Partial<NormalizedClosetItemMetadata>
    : {};
  const storedFormality = Number(stored.formality);
  return {
    ...generated,
    ...stored,
    category: generated.category,
    subcategory: generated.subcategory ?? stored.subcategory,
    formality: generated.category === "shoes" || !Number.isFinite(storedFormality)
      ? generated.formality
      : Math.max(generated.formality, storedFormality),
    warmth: generated.warmth,
    fit: generated.fit,
    colors: [...new Set([
      ...generated.colors.map(normalizedText),
      ...(Array.isArray(stored.colors) ? stored.colors.map(normalizedText) : []),
    ].filter(Boolean))],
    styleTags: [...new Set([
      ...generated.styleTags.map(normalizedText),
      ...(Array.isArray(stored.styleTags) ? stored.styleTags.map(normalizedText) : []),
    ].filter(Boolean))],
    occasionTags: [...new Set([
      ...generated.occasionTags.map(normalizedText),
      ...(Array.isArray(stored.occasionTags) ? stored.occasionTags.map(normalizedText) : []),
    ].filter(Boolean))],
    seasonTags: [...new Set([
      ...generated.seasonTags.map(normalizedText),
      ...(Array.isArray(stored.seasonTags) ? stored.seasonTags.map(normalizedText) : []),
    ].filter(Boolean))],
    weatherTags: [...new Set([
      ...generated.weatherTags.map(normalizedText),
      ...(Array.isArray(stored.weatherTags) ? stored.weatherTags.map(normalizedText) : []),
    ].filter(Boolean))],
    searchAliases: [...new Set([
      ...generated.searchAliases.map(normalizedText),
      ...(Array.isArray(stored.searchAliases) ? stored.searchAliases.map(normalizedText) : []),
    ].filter(Boolean))],
  };
}

function serializeMetadata(metadata: NormalizedClosetItemMetadata): Record<string, unknown> {
  const updatedAt = metadata.updatedAt && typeof (metadata.updatedAt as { toDate?: () => Date }).toDate === "function"
    ? (metadata.updatedAt as { toDate: () => Date }).toDate().toISOString()
    : null;
  return {
    ...metadata,
    updatedAt,
  };
}

function firstUsefulString(item: ClosetItemDocument, keys: readonly string[]): string {
  for (const key of keys) {
    const text = cleanText(item[key]);
    if (text) return text;
  }
  return "";
}

function collectStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  const text = normalizedText(value);
  return text ? [text] : [];
}

function itemImageUrl(item: ClosetItemDocument): string | null {
  const photos = item.photos && typeof item.photos === "object"
    ? item.photos as Record<string, unknown>
    : {};
  const direct = cleanText(
    item.cleanedImageUrl ??
      item.refinedImageUrl ??
      item.originalImageUrl ??
      item.photoUrl ??
      photos.cleanedUrl ??
      photos.cleanedPhotoUrl ??
      photos.primaryUrl ??
      photos.thumbUrl ??
      photos.originalUrl,
  );
  if (direct) return direct;
  if (Array.isArray(photos.urls)) {
    const first = cleanText(photos.urls[0]);
    if (first) return first;
  }
  const imageCollections = [item.images, photos.images];
  for (const collection of imageCollections) {
    if (!Array.isArray(collection)) continue;
    const primary = collection.find((entry) => entry && typeof entry === "object" && (entry as Record<string, unknown>).isPrimary === true);
    const candidates = [primary, ...collection].filter(Boolean) as Record<string, unknown>[];
    for (const candidate of candidates) {
      const url = cleanText(candidate.cleanedUrl ?? candidate.refinedUrl ?? candidate.originalUrl ?? candidate.sourceOriginalUrl);
      if (url) return url;
    }
  }
  return null;
}

export function categoryBucket(value: unknown): WardrobeRetrievalCategoryBucket {
  const text = normalizedText(value);
  if (text === "shoe" || text === "shoes" || text === "footwear") return "footwear";
  if (FOOTWEAR_PATTERN.test(text)) return "footwear";
  if (text === "top" || text === "bottom" || text === "outerwear" || text === "accessory" || text === "one piece" || text === "one_piece") {
    return text === "one piece" ? "one_piece" : text as WardrobeRetrievalCategoryBucket;
  }
  if (/\b(jacket|coat|blazer|outerwear|overshirt)\b/.test(text)) return "outerwear";
  if (/\b(pant|trouser|jean|short|skirt|bottom)\b/.test(text)) return "bottom";
  if (/\b(shirt|tee|top|polo|sweater|hoodie|blouse|tank)\b/.test(text)) return "top";
  if (/\b(bag|belt|watch|hat|cap|jewelry|accessory)\b/.test(text)) return "accessory";
  if (/\b(dress|jumpsuit|romper|one piece|set)\b/.test(text)) return "one_piece";
  return "unknown";
}

function itemBucket(item: ClosetItemDocument, metadata: NormalizedClosetItemMetadata): WardrobeRetrievalCategoryBucket {
  const rawBucket = categoryBucket([item.category, item.subCategory, item.subcategory, item.type, item.name, item.title].filter(Boolean).join(" "));
  if (rawBucket === "footwear") return rawBucket;
  const metadataBucket = categoryBucket(metadata.category);
  return metadataBucket !== "unknown" ? metadataBucket : rawBucket;
}

function itemColors(item: ClosetItemDocument, metadata: NormalizedClosetItemMetadata): string[] {
  return [...new Set([
    ...metadata.colors.map(normalizedText),
    ...collectStrings(item.colors),
    normalizedText(item.primaryColor),
    normalizedText(item.displayColor),
    normalizedText(item.colorLabel),
  ].filter(Boolean))];
}

function itemStyles(item: ClosetItemDocument, metadata: NormalizedClosetItemMetadata): string[] {
  return [...new Set([
    ...metadata.styleTags.map(normalizedText),
    ...collectStrings(item.aestheticTags),
    ...collectStrings(item.detailTags),
    normalizedText(item.style),
  ].filter(Boolean))];
}

function itemSearchText(item: ClosetItemDocument, metadata: NormalizedClosetItemMetadata): string {
  return normalizedText([
    item.name,
    item.title,
    item.category,
    item.subCategory,
    item.subcategory,
    item.type,
    item.style,
    item.pattern,
    item.material,
    metadata.category,
    metadata.subcategory,
    metadata.brand,
    metadata.material,
    metadata.fit,
    metadata.colors.join(" "),
    metadata.styleTags.join(" "),
    metadata.occasionTags.join(" "),
    metadata.searchAliases.join(" "),
  ].filter(Boolean).join(" "));
}

function hasOverlap(left: string[], right: string[]): boolean {
  if (!left.length || !right.length) return false;
  return left.some((value) => right.includes(value));
}

function matchesCategoryFilter(
  input: NormalizedWardrobeRetrievalInput,
  item: ClosetItemDocument,
  metadata: NormalizedClosetItemMetadata,
): boolean {
  if (!input.categories.length) return true;
  const bucket = itemBucket(item, metadata);
  const normalizedCategories = input.categories.map(categoryBucket);
  if (normalizedCategories.includes(bucket)) return true;
  const rawCategoryText = [
    metadata.category,
    metadata.subcategory,
    item.category,
    item.subCategory,
    item.subcategory,
    item.type,
  ].map(normalizedText).filter(Boolean);
  return hasOverlap(input.categories, rawCategoryText);
}

function matchesColorFilter(
  input: NormalizedWardrobeRetrievalInput,
  item: ClosetItemDocument,
  metadata: NormalizedClosetItemMetadata,
): boolean {
  if (!input.colors.length) return true;
  return hasOverlap(input.colors, itemColors(item, metadata));
}

function matchesStyleFilter(
  input: NormalizedWardrobeRetrievalInput,
  item: ClosetItemDocument,
  metadata: NormalizedClosetItemMetadata,
): boolean {
  if (!input.styleTags.length) return true;
  return hasOverlap(input.styleTags, itemStyles(item, metadata));
}

function matchesPostVectorFilters(
  input: NormalizedWardrobeRetrievalInput,
  item: ClosetItemDocument,
  metadata: NormalizedClosetItemMetadata,
): boolean {
  return matchesCategoryFilter(input, item, metadata) &&
    matchesColorFilter(input, item, metadata) &&
    matchesStyleFilter(input, item, metadata);
}

export function isRetrievableWardrobeItem(item: ClosetItemDocument): boolean {
  return isReadyClosetItem(item) && Boolean(item[EMBEDDING_VECTOR_FIELD]);
}

function previewText(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  return text.length <= 220 ? text : `${text.slice(0, 217).trim()}...`;
}

function formalityMatches(input: NormalizedWardrobeRetrievalInput, metadata: NormalizedClosetItemMetadata): boolean {
  if (input.formality === "any") return false;
  if (input.formality === "casual") return metadata.formality <= 2;
  if (input.formality === "smart_casual") return metadata.formality >= 2 && metadata.formality <= 4;
  return metadata.formality >= 4;
}

function isOfficeLikeQuery(input: NormalizedWardrobeRetrievalInput): boolean {
  return input.formality === "smart_casual" ||
    input.formality === "formal" ||
    OFFICE_QUERY_PATTERN.test(normalizedText([input.query, input.occasion].filter(Boolean).join(" ")));
}

export type RetrievalScoreDiagnostics = {
  vectorScore: number | null;
  finalScore: number;
  boostsApplied: string[];
  penaltiesApplied: string[];
};

export function scoreWardrobeRetrievalCandidate(args: {
  input: NormalizedWardrobeRetrievalInput;
  item: ClosetItemDocument;
  metadata: NormalizedClosetItemMetadata;
  distance?: number | null;
}): RetrievalScoreDiagnostics {
  const vectorScore = scoreFromCosineDistance(args.distance);
  let finalScore = vectorScore ?? 0;
  const boostsApplied: string[] = [];
  const penaltiesApplied: string[] = [];
  const bucket = itemBucket(args.item, args.metadata);
  const text = itemSearchText(args.item, args.metadata);

  const boost = (amount: number, reason: string) => {
    finalScore += amount;
    boostsApplied.push(reason);
  };
  const penalize = (amount: number, reason: string) => {
    finalScore -= amount;
    penaltiesApplied.push(reason);
  };

  if (isOfficeLikeQuery(args.input)) {
    if (bucket === "top") {
      if (/\b(tank|tank top|vest top|sleeveless)\b/.test(text)) {
        penalize(0.38, "penalized: sleeveless top is weak for office");
      } else if (GRAPHIC_TOP_PATTERN.test(text)) {
        penalize(0.32, "penalized: graphic tee is weak for office");
      } else if (WEAK_OFFICE_TOP_PATTERN.test(text)) {
        penalize(0.3, "penalized: athletic top is weak for office");
      } else if (OFFICE_TOP_PATTERN.test(text)) {
        boost(0.22, "boosted: office top matches smart casual office");
      } else if (CLEAN_TSHIRT_PATTERN.test(text)) {
        boost(0.04, "boosted: clean t-shirt can work for office");
      }
    }

    if (bucket === "footwear") {
      if (OFFICE_FOOTWEAR_PATTERN.test(text)) {
        const label = /\b(loafer|loafers|penny loafer)\b/.test(text) ? "loafer" : "dress shoe";
        boost(0.25, `boosted: ${label} matches smart casual office`);
      } else if (OFFICE_SNEAKER_PATTERN.test(text)) {
        boost(0.14, "boosted: clean minimal leather sneaker can work for office");
      }
      if (WEAK_OFFICE_FOOTWEAR_PATTERN.test(text)) {
        penalize(0.25, "penalized: casual footwear is weak for office");
      }
    }

    if (bucket === "bottom" && OFFICE_BOTTOM_PATTERN.test(text)) {
      boost(0.2, "boosted: trousers match smart casual office");
    }

    if (bucket === "outerwear" && OFFICE_OUTERWEAR_PATTERN.test(text)) {
      boost(0.15, "boosted: office layer matches smart casual office");
    }

    if (args.metadata.formality >= 3) {
      boost(0.05, "boosted: formality fits office");
    } else if (args.metadata.formality <= 1) {
      penalize(0.08, "penalized: very casual formality is weak for office");
    }
  }

  return {
    vectorScore,
    finalScore: Number(Math.max(0, Math.min(1, finalScore)).toFixed(4)),
    boostsApplied,
    penaltiesApplied,
  };
}

export function buildRetrievalReason(
  input: NormalizedWardrobeRetrievalInput,
  item: ClosetItemDocument,
  metadata: NormalizedClosetItemMetadata,
  boostsApplied: string[] = [],
  penaltiesApplied: string[] = [],
): string {
  const reasons: string[] = [];
  const colors = itemColors(item, metadata).filter((color) => input.colors.includes(color));
  const styles = itemStyles(item, metadata).filter((style) => input.styleTags.includes(style));
  const occasion = normalizedText(input.occasion);
  const weather = normalizedText(input.weather);
  const queryText = normalizedText(input.query);
  const bucket = itemBucket(item, metadata);

  if (colors.length) reasons.push(`matches ${colors.join(", ")} color`);
  if (input.categories.length && input.categories.map(categoryBucket).includes(bucket)) {
    reasons.push(`matches ${bucket} category`);
  }
  if (occasion && metadata.occasionTags.map(normalizedText).includes(occasion)) {
    reasons.push(`fits ${occasion} occasion`);
  }
  if (styles.length) reasons.push(`matches ${styles.join(", ")} style`);
  if (weather && metadata.weatherTags.map(normalizedText).includes(weather)) {
    reasons.push(`fits ${weather} weather`);
  }
  if (formalityMatches(input, metadata)) {
    reasons.push(`fits ${input.formality.replace("_", " ")} formality`);
  }
  if (/\b(summer|beach|hot|warm|vacation|resort)\b/.test(`${queryText} ${weather}`) &&
      (metadata.warmth <= 2 || hasOverlap(metadata.seasonTags.map(normalizedText), ["summer"]) ||
        hasOverlap(metadata.weatherTags.map(normalizedText), ["warm", "hot"]))) {
    reasons.push("lightweight warm-weather option");
  }
  if (/\b(black).*\b(shoe|shoes|footwear|sneaker|sneakers|loafer|loafers|boot|boots)\b/.test(queryText) &&
      bucket === "footwear" && itemColors(item, metadata).includes("black")) {
    reasons.push("black footwear match");
  }

  return [...new Set([
    ...reasons,
    ...boostsApplied,
    ...penaltiesApplied,
  ])].slice(0, 5).join("; ") || "semantically similar wardrobe match";
}

export function buildCategoryBuckets(results: WardrobeRetrievalResult[]): WardrobeRetrievalCategoryBuckets {
  const buckets: WardrobeRetrievalCategoryBuckets = {
    top: [],
    bottom: [],
    footwear: [],
    outerwear: [],
    accessory: [],
    one_piece: [],
    unknown: [],
  };
  for (const result of results) {
    buckets[result.category].push(result);
  }
  return buckets;
}

export function buildWardrobeRetrievalResults(
  input: NormalizedWardrobeRetrievalInput,
  candidates: WardrobeVectorCandidate[],
): WardrobeRetrievalResult[] {
  const results: WardrobeRetrievalResult[] = [];
  for (const candidate of candidates) {
    if (!isRetrievableWardrobeItem(candidate.item)) continue;
    const metadata = metadataForItem(candidate.item);
    if (!matchesPostVectorFilters(input, candidate.item, metadata)) continue;
    const bucket = itemBucket(candidate.item, metadata);
    const scoreDiagnostics = scoreWardrobeRetrievalCandidate({
      input,
      item: candidate.item,
      metadata,
      distance: candidate.distance,
    });
    results.push({
      itemId: candidate.itemId,
      name: firstUsefulString(candidate.item, ["name", "title"]) || metadata.subcategory || "Untitled item",
      category: bucket,
      ...(metadata.subcategory ? { subcategory: metadata.subcategory } : {}),
      ...(metadata.brand ? { brand: metadata.brand } : {}),
      colors: itemColors(candidate.item, metadata),
      score: scoreDiagnostics.finalScore,
      vectorScore: scoreDiagnostics.vectorScore,
      finalScore: scoreDiagnostics.finalScore,
      boostsApplied: scoreDiagnostics.boostsApplied,
      penaltiesApplied: scoreDiagnostics.penaltiesApplied,
      distance: typeof candidate.distance === "number" && Number.isFinite(candidate.distance)
        ? Number(candidate.distance.toFixed(6))
        : null,
      reason: buildRetrievalReason(
        input,
        candidate.item,
        metadata,
        scoreDiagnostics.boostsApplied,
        scoreDiagnostics.penaltiesApplied,
      ),
      imageUrl: itemImageUrl(candidate.item),
      aiMetadata: serializeMetadata(metadata),
      embeddingTextPreview: previewText(candidate.item.embeddingText),
      status: cleanText(candidate.item.status) || null,
      itemLifecycleStatus: cleanText(candidate.item.itemLifecycleStatus) || null,
    });
  }
  return results
    .sort((left, right) => {
      const scoreDelta = (right.score ?? 0) - (left.score ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return (right.vectorScore ?? 0) - (left.vectorScore ?? 0);
    })
    .slice(0, input.limit);
}

export function emptyCategoryBuckets(): WardrobeRetrievalCategoryBuckets {
  return {
    top: [...EMPTY_BUCKETS.top],
    bottom: [...EMPTY_BUCKETS.bottom],
    footwear: [...EMPTY_BUCKETS.footwear],
    outerwear: [...EMPTY_BUCKETS.outerwear],
    accessory: [...EMPTY_BUCKETS.accessory],
    one_piece: [...EMPTY_BUCKETS.one_piece],
    unknown: [...EMPTY_BUCKETS.unknown],
  };
}

export function buildRetrievalDiagnostics(args: {
  input: NormalizedWardrobeRetrievalInput;
  rawVectorLimit: number;
  rawResultCount: number;
  readyResultCount: number;
  filteredResultCount: number;
  returnedResultCount: number;
  embeddingDimensions: number;
}): WardrobeRetrievalDiagnostics {
  return {
    vectorField: EMBEDDING_VECTOR_FIELD,
    distanceMeasure: "COSINE",
    distanceResultField: VECTOR_DISTANCE_FIELD,
    rawVectorLimit: args.rawVectorLimit,
    rawResultCount: args.rawResultCount,
    readyResultCount: args.readyResultCount,
    filteredResultCount: args.filteredResultCount,
    returnedResultCount: args.returnedResultCount,
    embeddingDimensions: args.embeddingDimensions,
    appliedFilters: {
      categories: args.input.categories,
      styleTags: args.input.styleTags,
      colors: args.input.colors,
      ...(args.input.occasion ? { occasion: args.input.occasion } : {}),
      ...(args.input.weather ? { weather: args.input.weather } : {}),
      formality: args.input.formality,
    },
  };
}

export function countReadyVectorCandidates(candidates: WardrobeVectorCandidate[]): number {
  return candidates.filter((candidate) => isRetrievableWardrobeItem(candidate.item)).length;
}
