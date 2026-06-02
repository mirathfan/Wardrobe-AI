import { createHash } from "node:crypto";
import { FieldValue, getFirestore, type Query } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { STYLE_PROFILE_VERSION, wardrobeIntelligenceConfig } from "./config";
import { createTextEmbedding } from "./embeddings";
import { hashEmbeddingInput } from "./hash";
import type { OutfitStyleMemoryContext } from "./outfitTypes";
import type {
  FeedbackType,
  StyleMemory,
  StyleMemoryClient,
  StyleMemoryContextResponse,
  StyleMemoryDraft,
  StyleMemoryEntities,
  StyleMemoryFeedbackInput,
  StyleMemoryPolarity,
  StyleMemorySource,
  StyleMemoryType,
  StyleProfile,
  WeightedStyleSignal,
} from "./styleMemoryTypes";

export const STYLE_MEMORY_VECTOR_FIELD = "embeddingVector";
export const STYLE_MEMORY_DISTANCE_FIELD = "styleMemoryDistance";
const MAX_MEMORY_RETRIEVAL_LIMIT = 20;
const DEFAULT_MEMORY_RETRIEVAL_LIMIT = 8;
const GENERIC_NEGATIVE_CATEGORIES = new Set(["top", "bottom", "footwear", "accessory", "one_piece"]);
const GENERIC_NEGATIVE_COLORS = new Set(["black", "white", "blue", "gray", "grey", "beige", "brown", "navy"]);
const GENERIC_NEGATIVE_MATERIALS = new Set(["cotton", "denim", "leather", "polyester", "unknown"]);
const GENERIC_NEGATIVE_STYLE_TAGS = new Set(["casual", "classic", "minimal", "solid", "travel", "work", "formal", "smart casual", "streetwear"]);
const DISTINCTIVE_COLORS = new Set(["multicolor", "multi color", "red", "orange", "yellow", "pink", "purple", "green"]);
const DISTINCTIVE_STYLE_TAGS = new Set(["graphic", "loud", "logo", "football", "jersey", "statement", "streetwear"]);
const CLIENT_VECTOR_FIELD_NAMES = new Set(["embeddingVector", "embeddingRaw", "_values", "vector", "rawVector", "queryVector"]);

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedText(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizedText).filter(Boolean))].slice(0, limit);
}

function cleanStringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))].slice(0, limit);
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function compactTextBucket(value: string): string {
  return normalizedText(value).split(" ").slice(0, 10).join(" ");
}

function feedbackPolarity(feedbackType: FeedbackType): StyleMemoryPolarity {
  if (["like", "save", "wear", "more_like_this", "prefer_item", "too_casual", "more_formal", "more_streetwear", "more_color"].includes(feedbackType)) {
    return "positive";
  }
  if (["dislike", "not_my_vibe", "less_like_this", "avoid_item", "too_formal", "more_casual", "less_streetwear", "less_color"].includes(feedbackType)) {
    return "negative";
  }
  return "neutral";
}

function feedbackStrength(feedbackType: FeedbackType): number {
  const strengths: Partial<Record<FeedbackType, number>> = {
    like: 3,
    save: 4,
    wear: 5,
    more_like_this: 4,
    prefer_item: 4,
    dislike: 3,
    not_my_vibe: 4,
    less_like_this: 3,
    avoid_item: 5,
    too_formal: 3,
    too_casual: 3,
    more_formal: 3,
    more_casual: 3,
    more_streetwear: 3,
    less_streetwear: 3,
    more_color: 3,
    less_color: 3,
    manual_note: 3,
  };
  return strengths[feedbackType] ?? 3;
}

function feedbackSource(feedbackType: FeedbackType): StyleMemorySource {
  if (feedbackType === "save") return "saved_outfit";
  if (feedbackType === "wear") return "worn_outfit";
  if (feedbackType === "manual_note") return "manual";
  return "outfit_feedback";
}

function feedbackTypeToMemoryType(feedbackType: FeedbackType): StyleMemoryType {
  if (feedbackType === "too_formal" || feedbackType === "too_casual" || feedbackType === "more_formal" || feedbackType === "more_casual") {
    return "formality_preference";
  }
  if (feedbackType === "more_color" || feedbackType === "less_color") return "color_preference";
  if (feedbackType === "prefer_item") return "item_affinity";
  if (feedbackType === "avoid_item") return "avoidance";
  if (feedbackType === "manual_note") return "manual_note";
  if (feedbackPolarity(feedbackType) === "negative") return "negative_preference";
  return "positive_preference";
}

function isOutfitNegativeFeedback(feedbackType: FeedbackType): boolean {
  return feedbackType === "dislike" || feedbackType === "not_my_vibe" || feedbackType === "less_like_this";
}

function isFormalityFeedback(feedbackType: FeedbackType): boolean {
  return feedbackType === "too_formal" || feedbackType === "too_casual" || feedbackType === "more_formal" || feedbackType === "more_casual";
}

function isStreetwearAdjustment(feedbackType: FeedbackType): boolean {
  return feedbackType === "more_streetwear" || feedbackType === "less_streetwear";
}

function isColorAdjustment(feedbackType: FeedbackType): boolean {
  return feedbackType === "more_color" || feedbackType === "less_color";
}

function isItemOnlyFeedback(feedbackType: FeedbackType): boolean {
  return feedbackType === "prefer_item" || feedbackType === "avoid_item";
}

function filterDistinctive(values: string[], allowed: Set<string>, generic: Set<string>): string[] {
  return values.filter((value) => {
    const text = normalizedText(value);
    if (!text || generic.has(text)) return false;
    return allowed.has(text) || [...allowed].some((entry) => text.includes(entry));
  });
}

function outfitFingerprint(itemIds: string[]): string | undefined {
  const normalized = itemIds.map(cleanText).filter(Boolean).sort();
  return normalized.length >= 2 ? hash(normalized.join("|")).slice(0, 16) : undefined;
}

function outfitItems(outfit: unknown): Record<string, unknown>[] {
  if (!outfit || typeof outfit !== "object" || Array.isArray(outfit)) return [];
  const items = (outfit as Record<string, unknown>).items;
  return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function entitiesFromInput(input: StyleMemoryFeedbackInput, selectedItemIds: string[] = []): StyleMemoryEntities {
  const items = outfitItems(input.outfit);
  const itemIds = [...new Set([
    ...items.map((item) => cleanText(item.itemId)).filter(Boolean),
    ...selectedItemIds.map(cleanText).filter(Boolean),
    ...(input.selectedItemIds ?? []).map(cleanText).filter(Boolean),
  ])];
  const metadataRecords = items.map((item) => (
    item.aiMetadata && typeof item.aiMetadata === "object" && !Array.isArray(item.aiMetadata)
      ? item.aiMetadata as Record<string, unknown>
      : {}
  ));
  return {
    itemIds,
    itemNames: [...new Set(items.map((item) => cleanText(item.name || item.title || item.category || item.role)).filter(Boolean))],
    ...(input.outfitId ? { outfitId: cleanText(input.outfitId) } : {}),
    ...(outfitFingerprint(itemIds) ? { outfitFingerprint: outfitFingerprint(itemIds) } : {}),
    ...(input.query ? { query: cleanText(input.query) } : {}),
    ...(input.occasion ? { occasion: normalizedText(input.occasion) } : {}),
    ...(input.formality ? { formality: normalizedText(input.formality) } : {}),
    colors: [...new Set([
      ...items.flatMap((item) => stringArray(item.colors)),
      ...metadataRecords.flatMap((metadata) => stringArray(metadata.colors)),
    ])],
    categories: [...new Set(items.flatMap((item) => [
      normalizedText(item.role),
      normalizedText(item.category),
      normalizedText(item.allowedRole),
      normalizedText(item.canonicalRole),
    ]).filter(Boolean))],
    styleTags: [...new Set(metadataRecords.flatMap((metadata) => stringArray(metadata.styleTags)))],
    fits: [...new Set(metadataRecords.map((metadata) => normalizedText(metadata.fit)).filter(Boolean))],
    brands: [...new Set(items.map((item) => normalizedText(item.brand)).filter(Boolean))],
    materials: [...new Set(metadataRecords.map((metadata) => normalizedText(metadata.material)).filter(Boolean))],
    subcategories: [...new Set([
      ...items.map((item) => normalizedText(item.subcategory)),
      ...metadataRecords.map((metadata) => normalizedText(metadata.subcategory)),
    ].filter(Boolean))],
  };
}

function itemLabels(outfit: unknown): string[] {
  return outfitItems(outfit).map((item) => cleanText(item.name || item.category || item.role)).filter(Boolean);
}

function styleWords(input: StyleMemoryFeedbackInput): string {
  const labels = itemLabels(input.outfit);
  return labels.length ? labels.join(", ") : "this outfit style";
}

function feedbackText(input: StyleMemoryFeedbackInput, feedbackType: FeedbackType): string {
  const occasion = cleanText(input.occasion ?? input.query ?? "this occasion");
  const styles = styleWords(input);
  const note = cleanText(input.note);
  if (feedbackType === "manual_note") return note || `User style note for ${occasion}.`;
  if (feedbackType === "too_formal") return `User prefers less formal outfits for ${occasion}.`;
  if (feedbackType === "too_casual" || feedbackType === "more_formal") return `User prefers more elevated outfits for ${occasion}.`;
  if (feedbackType === "more_casual") return `User prefers more casual outfits for ${occasion}.`;
  if (feedbackType === "more_streetwear") return `User wants more streetwear influence for ${occasion}.`;
  if (feedbackType === "less_streetwear") return `User wants less streetwear influence for ${occasion}.`;
  if (feedbackType === "more_color") return `User wants more color in outfits for ${occasion}.`;
  if (feedbackType === "less_color") return `User prefers less color and more restrained palettes for ${occasion}.`;
  if (feedbackType === "not_my_vibe") return `User disliked this outfit vibe for ${occasion}: ${styles}.`;
  if (feedbackType === "save") return `User strongly prefers this ${occasion} outfit style: ${styles}.`;
  if (feedbackType === "wear") return `User wore and strongly prefers this ${occasion} outfit style: ${styles}.`;
  if (feedbackType === "more_like_this") return `User wants more outfits like this for ${occasion}: ${styles}.`;
  if (feedbackType === "less_like_this") return `User wants fewer outfits like this for ${occasion}: ${styles}.`;
  if (feedbackType === "dislike") return `User dislikes this ${occasion} outfit style: ${styles}.`;
  if (feedbackType === "prefer_item") return `User prefers selected items in outfits for ${occasion}.`;
  if (feedbackType === "avoid_item") return `User wants to avoid selected items in outfits for ${occasion}.`;
  return `User likes this ${occasion} outfit style: ${styles}.`;
}

function scopedEntitiesForFeedback(
  input: StyleMemoryFeedbackInput,
  feedbackType: FeedbackType,
  entities: StyleMemoryEntities,
  selectedItemIds: string[],
): StyleMemoryEntities {
  const base = {
    itemIds: entities.itemIds,
    ...(entities.itemNames?.length ? { itemNames: entities.itemNames } : {}),
    ...(entities.outfitId ? { outfitId: entities.outfitId } : {}),
    ...(entities.outfitFingerprint ? { outfitFingerprint: entities.outfitFingerprint } : {}),
    ...(entities.query ? { query: entities.query } : {}),
    ...(entities.occasion ? { occasion: entities.occasion } : {}),
    ...(entities.formality ? { formality: entities.formality } : {}),
    colors: entities.colors,
    categories: entities.categories,
    styleTags: entities.styleTags,
    fits: entities.fits,
    brands: entities.brands,
    materials: entities.materials,
    subcategories: entities.subcategories,
  };

  if (isItemOnlyFeedback(feedbackType)) {
    const ids = selectedItemIds.length ? selectedItemIds : input.selectedItemIds ?? [];
    return {
      ...base,
      itemIds: [...new Set(ids.map(cleanText).filter(Boolean))],
      itemNames: [],
      colors: [],
      categories: [],
      styleTags: [],
      fits: [],
      brands: [],
      materials: [],
      subcategories: [],
    };
  }

  if (isFormalityFeedback(feedbackType)) {
    return {
      ...base,
      itemIds: [],
      itemNames: [],
      colors: [],
      categories: [],
      styleTags: [],
      fits: [],
      brands: [],
      materials: [],
      subcategories: [],
    };
  }

  if (isStreetwearAdjustment(feedbackType)) {
    return {
      ...base,
      itemIds: [],
      itemNames: [],
      colors: [],
      categories: [],
      styleTags: ["streetwear"],
      fits: [],
      brands: [],
      materials: [],
      subcategories: [],
    };
  }

  if (isColorAdjustment(feedbackType)) {
    return {
      ...base,
      itemIds: [],
      itemNames: [],
      colors: feedbackType === "more_color" ? ["colorful"] : ["multicolor"],
      categories: [],
      styleTags: feedbackType === "more_color" ? ["colorful"] : ["loud color"],
      fits: [],
      brands: [],
      materials: [],
      subcategories: [],
    };
  }

  if (isOutfitNegativeFeedback(feedbackType)) {
    return {
      ...base,
      colors: filterDistinctive(entities.colors, DISTINCTIVE_COLORS, GENERIC_NEGATIVE_COLORS),
      categories: [],
      styleTags: filterDistinctive(entities.styleTags, DISTINCTIVE_STYLE_TAGS, GENERIC_NEGATIVE_STYLE_TAGS),
      fits: [],
      brands: [],
      materials: [],
      subcategories: entities.subcategories.filter((value) => !GENERIC_NEGATIVE_CATEGORIES.has(value)),
    };
  }

  return base;
}

function draftForFeedback(input: StyleMemoryFeedbackInput, feedbackType: FeedbackType, selectedItemIds: string[] = []): StyleMemoryDraft {
  const text = feedbackText(input, feedbackType);
  const entities = scopedEntitiesForFeedback(input, feedbackType, entitiesFromInput(input, selectedItemIds), selectedItemIds);
  if (feedbackType === "more_streetwear") entities.styleTags = [...new Set([...entities.styleTags, "streetwear"])];
  if (feedbackType === "less_streetwear") entities.styleTags = [...new Set([...entities.styleTags, "streetwear"])];
  return {
    type: feedbackTypeToMemoryType(feedbackType),
    polarity: feedbackType === "manual_note" && input.polarity ? input.polarity : feedbackPolarity(feedbackType),
    source: selectedItemIds.length ? "item_feedback" : feedbackSource(feedbackType),
    text,
    normalizedText: normalizedText(text),
    strength: feedbackStrength(feedbackType),
    confidence: feedbackType === "manual_note" ? 0.7 : 0.85,
    entities,
  };
}

export function buildStyleMemoriesFromFeedback(input: StyleMemoryFeedbackInput): StyleMemoryDraft[] {
  const drafts: StyleMemoryDraft[] = [draftForFeedback(input, input.feedbackType)];
  for (const item of input.itemFeedback ?? []) {
    drafts.push(draftForFeedback(
      {
        ...input,
        feedbackType: item.feedbackType,
        note: item.note ?? input.note,
      },
      item.feedbackType,
      [item.itemId],
    ));
  }
  return drafts.filter((draft) => draft.text && draft.normalizedText);
}

function sentence(value: string): string {
  const text = cleanText(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function preciseNegativeEmbeddingDescriptors(draft: StyleMemoryDraft): string[] {
  const text = normalizedText([
    draft.text,
    ...(draft.entities.itemNames ?? []),
    ...draft.entities.subcategories,
    ...draft.entities.styleTags,
  ].join(" "));
  const descriptors: string[] = [];
  if (/\b(football shirt|football jersey|jersey|sports jersey|sport jersey)\b/.test(text)) {
    descriptors.push("sports jersey", "football shirt");
  }
  if (/\b(logo|graphic)\b/.test(text)) descriptors.push("logo heavy");
  if (/\b(statement|loud)\b/.test(text)) descriptors.push("statement");
  descriptors.push(...draft.entities.subcategories);
  descriptors.push(...draft.entities.styleTags.filter((tag) => tag !== "streetwear"));
  return [...new Set(descriptors.map(normalizedText).filter(Boolean))].slice(0, 8);
}

export function buildStyleMemoryEmbeddingText(draft: StyleMemoryDraft): string {
  const entities = draft.entities;
  if (draft.type === "formality_preference") {
    return `Formality preference: ${sentence(draft.text)}`.slice(0, 1000);
  }
  if (draft.polarity === "negative" && draft.type === "negative_preference") {
    const descriptors = preciseNegativeEmbeddingDescriptors(draft);
    return [
      `Negative preference: ${sentence(draft.text)}`,
      entities.occasion ? `Occasion: ${entities.occasion}.` : "",
      entities.itemNames?.length ? `Exact items: ${entities.itemNames.join(", ")}.` : "",
      entities.itemIds.length ? `Exact item IDs: ${entities.itemIds.join(", ")}.` : "",
      descriptors.length ? `Avoid similar ${descriptors.join(", ")} combinations${entities.occasion ? ` for ${entities.occasion}` : ""}.` : "",
    ].filter(Boolean).join(" ").slice(0, 1000);
  }
  if (draft.polarity === "negative" && draft.type === "avoidance") {
    return [
      `Item avoidance: ${sentence(draft.text)}`,
      entities.itemNames?.length ? `Exact items: ${entities.itemNames.join(", ")}.` : "",
      entities.itemIds.length ? `Exact item IDs: ${entities.itemIds.join(", ")}.` : "",
      entities.occasion ? `Occasion: ${entities.occasion}.` : "",
    ].filter(Boolean).join(" ").slice(0, 1000);
  }
  return [
    `Preference: ${draft.text}.`,
    `Polarity: ${draft.polarity}.`,
    entities.occasion ? `Occasion: ${entities.occasion}.` : "",
    entities.formality ? `Formality: ${entities.formality}.` : "",
    entities.itemNames?.length ? `Items: ${cleanStringArray(entities.itemNames).join(", ")}.` : "",
    entities.colors.length ? `Colors: ${entities.colors.join(", ")}.` : "",
    entities.categories.length ? `Categories: ${entities.categories.join(", ")}.` : "",
    entities.styleTags.length ? `Style tags: ${entities.styleTags.join(", ")}.` : "",
    entities.fits.length ? `Fits: ${entities.fits.join(", ")}.` : "",
    entities.materials.length ? `Materials: ${entities.materials.join(", ")}.` : "",
  ].filter(Boolean).join(" ").slice(0, 1000);
}

export function styleMemoryFingerprint(userId: string, draft: StyleMemoryDraft): string {
  const entities = draft.entities;
  const topEntities = [
    ...entities.colors,
    ...entities.categories,
    ...entities.styleTags,
    ...entities.fits,
    ...entities.brands,
    ...entities.materials,
    ...entities.itemIds,
  ].map(normalizedText).filter(Boolean).sort().slice(0, 10);
  return hash([
    userId,
    draft.type,
    draft.polarity,
    draft.source,
    entities.occasion ?? "",
    entities.formality ?? "",
    topEntities.join("|"),
    compactTextBucket(draft.normalizedText),
  ].join("::")).slice(0, 32);
}

function emptyProfile(userId: string): StyleProfile {
  return {
    userId,
    summary: "No style memories yet.",
    preferredColors: [],
    avoidedColors: [],
    preferredStyleTags: [],
    avoidedStyleTags: [],
    preferredFits: [],
    avoidedFits: [],
    preferredBrands: [],
    avoidedBrands: [],
    preferredCategories: [],
    avoidedCategories: [],
    preferredMaterials: [],
    avoidedMaterials: [],
    itemAffinities: [],
    avoidedItemIds: [],
    avoidedOutfitFingerprints: [],
    occasionProfiles: {},
    formalityBiasByOccasion: {},
    memoryCount: 0,
    positiveMemoryCount: 0,
    negativeMemoryCount: 0,
    profileVersion: STYLE_PROFILE_VERSION,
  };
}

export function defaultStyleProfile(userId: string): StyleProfile {
  return emptyProfile(userId);
}

function addWeights(map: Map<string, number>, values: string[], weight: number) {
  for (const value of values.map(normalizedText).filter(Boolean)) {
    map.set(value, Number(((map.get(value) ?? 0) + weight).toFixed(3)));
  }
}

function positiveCategoryWeight(value: string, weight: number): number {
  return GENERIC_NEGATIVE_CATEGORIES.has(normalizedText(value)) ? weight * 0.35 : weight;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function explicitlyMentionsNegativeSignal(memory: StyleMemory, value: string): boolean {
  const signal = normalizedText(value);
  if (!signal) return false;
  if (memory.type !== "negative_preference" && memory.type !== "formality_preference") return true;
  if (!new RegExp(`\\b${escapeRegExp(signal)}\\b`).test(memory.normalizedText)) return false;
  return /\b(avoid|less|fewer|without|restrained|not)\b/.test(memory.normalizedText);
}

function negativeValuesForProfile(memory: StyleMemory, values: string[], blacklist: Set<string>, explicit = false): string[] {
  return values
    .map(normalizedText)
    .filter((value) => value && (!blacklist.has(value) || explicit || explicitlyMentionsNegativeSignal(memory, value)));
}

function addPositiveCategoryWeights(map: Map<string, number>, values: string[], weight: number) {
  for (const value of values.map(normalizedText).filter(Boolean)) {
    const nextWeight = positiveCategoryWeight(value, weight);
    map.set(value, Number(((map.get(value) ?? 0) + nextWeight).toFixed(3)));
  }
}

function weightedSignals(map: Map<string, number>, limit = 12): WeightedStyleSignal[] {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, weight]) => ({ value, weight: Number(weight.toFixed(3)) }));
}

function signalSummary(prefix: string, signals: WeightedStyleSignal[]): string | null {
  if (!signals.length) return null;
  return `${prefix} ${signals.slice(0, 4).map((signal) => signal.value).join(", ")}`;
}

function deterministicSummary(profile: StyleProfile): string {
  const parts = [
    signalSummary("Prefers", profile.preferredStyleTags),
    signalSummary("likes colors", profile.preferredColors),
    signalSummary("likes categories", profile.preferredCategories),
    signalSummary("likes materials", profile.preferredMaterials),
    signalSummary("avoids", profile.avoidedStyleTags),
    signalSummary("avoids colors", profile.avoidedColors),
  ].filter((part): part is string => Boolean(part));
  return parts.length ? `${parts.join("; ")}.` : "No strong style preferences learned yet.";
}

export function buildStyleProfileFromMemories(userId: string, memories: StyleMemory[]): StyleProfile {
  const active = memories.filter((memory) => memory.active !== false);
  const profile = emptyProfile(userId);
  const positive = {
    colors: new Map<string, number>(),
    styleTags: new Map<string, number>(),
    fits: new Map<string, number>(),
    brands: new Map<string, number>(),
    categories: new Map<string, number>(),
    materials: new Map<string, number>(),
    itemIds: new Map<string, number>(),
  };
  const negative = {
    colors: new Map<string, number>(),
    styleTags: new Map<string, number>(),
    fits: new Map<string, number>(),
    brands: new Map<string, number>(),
    categories: new Map<string, number>(),
    materials: new Map<string, number>(),
  };
  const negativeItemIds = new Map<string, number>();
  const negativeOutfitFingerprints = new Map<string, number>();
  const occasionProfiles: Record<string, StyleMemory[]> = {};
  const formalityBias = new Map<string, number>();

  for (const memory of active) {
    const weight = memory.strength * memory.confidence * (1 + Math.min(memory.reinforcementCount, 5) * 0.1);
    const explicitNegative = memory.type === "avoidance" ||
      memory.type === "color_preference" ||
      memory.type === "category_preference" ||
      memory.type === "fit_preference" ||
      memory.type === "brand_preference" ||
      /\b(avoid|less|fewer)\b/.test(memory.normalizedText);
    if (memory.polarity === "positive") profile.positiveMemoryCount += 1;
    if (memory.polarity === "negative") profile.negativeMemoryCount += 1;
    if (memory.polarity === "negative") {
      addWeights(negative.colors, negativeValuesForProfile(memory, memory.entities.colors, GENERIC_NEGATIVE_COLORS, explicitNegative), weight);
      addWeights(negative.styleTags, negativeValuesForProfile(memory, memory.entities.styleTags, GENERIC_NEGATIVE_STYLE_TAGS, explicitNegative), weight);
      addWeights(negative.fits, memory.type === "fit_preference" ? memory.entities.fits : [], weight);
      addWeights(negative.brands, memory.type === "brand_preference" ? memory.entities.brands : [], weight);
      addWeights(negative.categories, negativeValuesForProfile(memory, memory.entities.categories, GENERIC_NEGATIVE_CATEGORIES, memory.type === "category_preference"), weight);
      addWeights(negative.materials, negativeValuesForProfile(memory, memory.entities.materials, GENERIC_NEGATIVE_MATERIALS, explicitNegative && memory.type !== "formality_preference"), weight);
      addWeights(negativeItemIds, memory.entities.itemIds, memory.type === "avoidance" ? weight * 1.6 : weight);
      if (memory.entities.outfitFingerprint) addWeights(negativeOutfitFingerprints, [memory.entities.outfitFingerprint], weight);
    } else {
      addWeights(positive.colors, memory.entities.colors, weight);
      addWeights(positive.styleTags, memory.entities.styleTags, weight);
      addWeights(positive.fits, memory.entities.fits, weight);
      addWeights(positive.brands, memory.entities.brands, weight);
      addPositiveCategoryWeights(positive.categories, memory.entities.categories, weight);
      addWeights(positive.materials, memory.entities.materials, weight);
      addWeights(positive.itemIds, memory.entities.itemIds, weight);
    }
    if (memory.entities.occasion) {
      occasionProfiles[memory.entities.occasion] = [...(occasionProfiles[memory.entities.occasion] ?? []), memory];
      if (memory.type === "formality_preference") {
        const direction = /less formal|more casual/.test(memory.normalizedText) ? -1 : /more elevated|more formal/.test(memory.normalizedText) ? 1 : 0;
        formalityBias.set(memory.entities.occasion, (formalityBias.get(memory.entities.occasion) ?? 0) + direction * weight);
      }
    }
  }

  profile.memoryCount = active.length;
  profile.preferredColors = weightedSignals(positive.colors);
  profile.avoidedColors = weightedSignals(negative.colors);
  profile.preferredStyleTags = weightedSignals(positive.styleTags);
  profile.avoidedStyleTags = weightedSignals(negative.styleTags);
  profile.preferredFits = weightedSignals(positive.fits);
  profile.avoidedFits = weightedSignals(negative.fits);
  profile.preferredBrands = weightedSignals(positive.brands);
  profile.avoidedBrands = weightedSignals(negative.brands);
  profile.preferredCategories = weightedSignals(positive.categories);
  profile.avoidedCategories = weightedSignals(negative.categories);
  profile.preferredMaterials = weightedSignals(positive.materials);
  profile.avoidedMaterials = weightedSignals(negative.materials);
  profile.itemAffinities = weightedSignals(positive.itemIds, 20).map((signal) => ({ value: signal.value, weight: signal.weight }));
  profile.avoidedItemIds = weightedSignals(negativeItemIds, 20);
  profile.avoidedOutfitFingerprints = weightedSignals(negativeOutfitFingerprints, 20);
  profile.occasionProfiles = Object.fromEntries(Object.entries(occasionProfiles).map(([occasion, values]) => {
    const posColors = new Map<string, number>();
    const negColors = new Map<string, number>();
    const posStyles = new Map<string, number>();
    const negStyles = new Map<string, number>();
    const posCategories = new Map<string, number>();
    const negCategories = new Map<string, number>();
    const negItemIds = new Map<string, number>();
    let formalityAdjustment = 0;
    for (const memory of values) {
      const weight = memory.strength * memory.confidence * (1 + Math.min(memory.reinforcementCount, 5) * 0.1);
      const positiveMemory = memory.polarity !== "negative";
      addWeights(positiveMemory ? posColors : negColors, memory.entities.colors, weight);
      addWeights(positiveMemory ? posStyles : negStyles, memory.entities.styleTags, weight);
      if (positiveMemory) {
        addPositiveCategoryWeights(posCategories, memory.entities.categories, weight);
      } else {
        addWeights(negCategories, negativeValuesForProfile(memory, memory.entities.categories, GENERIC_NEGATIVE_CATEGORIES, memory.type === "category_preference"), weight);
        addWeights(negItemIds, memory.entities.itemIds, weight);
      }
      if (memory.type === "formality_preference") {
        formalityAdjustment += /less formal|more casual/.test(memory.normalizedText) ? -weight : /more elevated|more formal/.test(memory.normalizedText) ? weight : 0;
      }
    }
    return [occasion, {
      preferredColors: weightedSignals(posColors),
      avoidedColors: weightedSignals(new Map([...negColors].filter(([value]) => !GENERIC_NEGATIVE_COLORS.has(value)))),
      preferredStyleTags: weightedSignals(posStyles),
      avoidedStyleTags: weightedSignals(new Map([...negStyles].filter(([value]) => !GENERIC_NEGATIVE_STYLE_TAGS.has(value)))),
      preferredCategories: weightedSignals(posCategories),
      avoidedCategories: weightedSignals(negCategories),
      avoidedItemIds: weightedSignals(negItemIds),
      avoidedOutfitFingerprints: [],
      formalityAdjustment: Number(clamp(formalityAdjustment / 10, -2, 2).toFixed(2)),
      memoryCount: values.length,
    }];
  }));
  profile.formalityBiasByOccasion = Object.fromEntries([...formalityBias.entries()].map(([occasion, value]) => [
    occasion,
    Number(clamp(value / 10, -2, 2).toFixed(2)),
  ]));
  profile.summary = deterministicSummary(profile);
  return profile;
}

export type RecordStyleMemoryDeps = {
  getMemory?: (uid: string, memoryId: string) => Promise<StyleMemory | null>;
  createMemory?: (uid: string, memory: StyleMemory) => Promise<void>;
  updateMemory?: (uid: string, memoryId: string, patch: Partial<StyleMemory>) => Promise<void>;
  listActiveMemories?: (uid: string) => Promise<StyleMemory[]>;
  writeStyleProfile?: (uid: string, profile: StyleProfile) => Promise<void>;
  createEmbedding?: (text: string) => Promise<number[]>;
  now?: () => unknown;
};

async function defaultGetMemory(uid: string, memoryId: string): Promise<StyleMemory | null> {
  const snap = await getFirestore().collection("users").doc(uid).collection("styleMemories").doc(memoryId).get();
  return snap.exists ? { id: snap.id, ...snap.data() } as StyleMemory : null;
}

async function defaultCreateMemory(uid: string, memory: StyleMemory): Promise<void> {
  await getFirestore().collection("users").doc(uid).collection("styleMemories").doc(memory.id).set({
    ...memory,
    embeddingVector: FieldValue.vector(memory.embeddingVector as number[]),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastReinforcedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function defaultUpdateMemory(uid: string, memoryId: string, patch: Partial<StyleMemory>): Promise<void> {
  await getFirestore().collection("users").doc(uid).collection("styleMemories").doc(memoryId).set({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
    lastReinforcedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function listActiveStyleMemories(uid: string): Promise<StyleMemory[]> {
  const snap = await getFirestore()
    .collection("users")
    .doc(uid)
    .collection("styleMemories")
    .where("active", "==", true)
    .limit(500)
    .get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as StyleMemory));
}

async function defaultWriteStyleProfile(uid: string, profile: StyleProfile): Promise<void> {
  await getFirestore().collection("users").doc(uid).collection("styleProfile").doc("main").set({
    ...profile,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function recordStyleMemoryFeedback(
  uid: string,
  input: StyleMemoryFeedbackInput,
  deps: RecordStyleMemoryDeps = {},
) {
  const drafts = buildStyleMemoriesFromFeedback(input);
  const config = wardrobeIntelligenceConfig();
  const getMemory = deps.getMemory ?? defaultGetMemory;
  const createMemory = deps.createMemory ?? defaultCreateMemory;
  const updateMemory = deps.updateMemory ?? defaultUpdateMemory;
  const createEmbedding = deps.createEmbedding ?? createTextEmbedding;
  const created: StyleMemory[] = [];
  const reinforced: StyleMemory[] = [];

  for (const draft of drafts) {
    const id = styleMemoryFingerprint(uid, draft);
    const existing = await getMemory(uid, id);
    if (existing && existing.active !== false) {
      const patch: Partial<StyleMemory> = {
        strength: Math.min(5, Math.max(existing.strength, draft.strength) + 0.25),
        confidence: Math.max(existing.confidence, draft.confidence),
        reinforcementCount: (existing.reinforcementCount ?? 0) + 1,
        text: draft.text.length > existing.text.length ? draft.text : existing.text,
        normalizedText: draft.normalizedText.length > existing.normalizedText.length ? draft.normalizedText : existing.normalizedText,
      };
      await updateMemory(uid, id, patch);
      reinforced.push({ ...existing, ...patch });
      continue;
    }
    const embeddingText = buildStyleMemoryEmbeddingText(draft);
    const embedding = await createEmbedding(embeddingText);
    const memory: StyleMemory = {
      ...draft,
      id,
      userId: uid,
      fingerprint: id,
      reinforcementCount: 1,
      embeddingText,
      embeddingHash: hashEmbeddingInput(embeddingText, STYLE_PROFILE_VERSION, 1, config.embeddingModel, config.embeddingDimensions),
      embeddingVector: embedding,
      embeddingModel: config.embeddingModel,
      embeddingDimensions: config.embeddingDimensions,
      active: true,
      createdAt: deps.now?.(),
      updatedAt: deps.now?.(),
      lastReinforcedAt: deps.now?.(),
    };
    await createMemory(uid, memory);
    created.push(memory);
  }

  const activeMemories = deps.listActiveMemories
    ? await deps.listActiveMemories(uid)
    : await listActiveStyleMemories(uid);
  const profile = buildStyleProfileFromMemories(uid, [...activeMemories, ...created]);
  await (deps.writeStyleProfile ?? defaultWriteStyleProfile)(uid, profile);
  return {
    createdMemoryCount: created.length,
    reinforcedMemoryCount: reinforced.length,
    memories: [...created, ...reinforced].map(serializeStyleMemory),
    styleProfilePreview: profile,
  };
}

export function buildStyleMemoryRetrievalQueryText(input: { query: string; occasion?: string; formality?: string }): string {
  return [
    `Style memory for: ${cleanText(input.query)}.`,
    input.occasion ? `Occasion: ${cleanText(input.occasion)}.` : "",
    input.formality ? `Formality: ${cleanText(input.formality)}.` : "",
  ].filter(Boolean).join(" ");
}

function retrievalLimit(value: unknown): number {
  const parsed = Number(value ?? DEFAULT_MEMORY_RETRIEVAL_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_MEMORY_RETRIEVAL_LIMIT;
  return Math.max(1, Math.min(MAX_MEMORY_RETRIEVAL_LIMIT, Math.floor(parsed)));
}

function vectorSearchError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("index") || lower.includes("nearest") || lower.includes("vector")) {
    return new HttpsError("failed-precondition", `Style memory vector index required. Original error: ${message}`, {
      code: "style_memory_vector_index_required",
      collectionGroup: "styleMemories",
      vectorField: STYLE_MEMORY_VECTOR_FIELD,
      dimensions: wardrobeIntelligenceConfig().embeddingDimensions,
      distanceMeasure: "COSINE",
    });
  }
  return new HttpsError("internal", `Style memory retrieval failed: ${message}`);
}

function sanitizeClientValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeClientValue);
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (CLIENT_VECTOR_FIELD_NAMES.has(key)) continue;
    clean[key] = sanitizeClientValue(entry);
  }
  return clean;
}

export function serializeStyleMemoryForClient(memory: StyleMemory): StyleMemoryClient {
  const safeMemory = sanitizeClientValue(memory) as StyleMemoryClient;
  const distance = numberValue((memory as Record<string, unknown>)[STYLE_MEMORY_DISTANCE_FIELD], NaN);
  return {
    ...safeMemory,
    ...(Number.isFinite(distance) ? { styleMemoryDistance: distance } : {}),
    ...("semanticScore" in memory ? { semanticScore: numberValue((memory as Record<string, unknown>).semanticScore) } : {}),
    ...("occasionCompatibility" in memory ? { occasionCompatibility: numberValue((memory as Record<string, unknown>).occasionCompatibility) } : {}),
    ...("finalMemoryScore" in memory ? { finalMemoryScore: numberValue((memory as Record<string, unknown>).finalMemoryScore) } : {}),
  };
}

export const serializeStyleMemory = serializeStyleMemoryForClient;

function semanticScore(memory: StyleMemory): number {
  const distance = numberValue((memory as Record<string, unknown>)[STYLE_MEMORY_DISTANCE_FIELD], NaN);
  if (!Number.isFinite(distance)) return 0.75;
  return Number(Math.max(0, Math.min(1, 1 - distance)).toFixed(3));
}

function normalizeOccasion(value: unknown): string {
  const text = normalizedText(value);
  if (!text) return "";
  if (/\b(date night|date)\b/.test(text)) return "date_night";
  if (/\b(dinner|restaurant|evening)\b/.test(text)) return "dinner";
  if (/\b(office|work|business|professional|meeting|interview|corporate)\b/.test(text)) return "office";
  if (/\b(streetwear|street style|street|sneaker fit)\b/.test(text)) return "streetwear";
  if (/\b(vacation|resort|summer|beach|travel)\b/.test(text)) return "vacation";
  if (/\b(casual|errands|everyday)\b/.test(text)) return "casual";
  if (/\b(gym|workout|training)\b/.test(text)) return "gym";
  if (/\b(formal|black tie)\b/.test(text)) return "formal";
  return text;
}

export function inferMemoryOccasionFromQuery(query: string): string | undefined {
  const text = normalizedText(query);
  if (!text) return undefined;
  if (/\b(streetwear|street style|sneaker fit)\b/.test(text)) return "streetwear";
  if (/\b(office|work|interview|business casual|business|professional|meeting)\b/.test(text)) return "office";
  if (/\b(date night|date)\b/.test(text)) return "date_night";
  if (/\b(dinner|night out|restaurant|evening)\b/.test(text)) return "dinner";
  if (/\b(summer|vacation|beach|resort|travel)\b/.test(text)) return "vacation";
  if (/\b(casual|everyday|errands)\b/.test(text)) return "casual";
  if (/\b(gym|workout)\b/.test(text)) return "gym";
  return undefined;
}

export function getOccasionCompatibility(queryOccasion: unknown, memoryOccasion: unknown): number {
  const query = normalizeOccasion(queryOccasion);
  const memory = normalizeOccasion(memoryOccasion);
  if (!query || !memory) return 0.55;
  if (query === memory) return 1;
  const pair = new Set([query, memory]);
  if (isHardOccasionConflict(query, memory)) return 0.1;
  if (pair.has("dinner") && pair.has("date_night")) return 0.7;
  if (pair.has("office") && (pair.has("business") || pair.has("smart_casual"))) return 0.7;
  if (pair.has("office") && pair.has("streetwear")) return 0.15;
  if ((pair.has("formal") || pair.has("office")) && (pair.has("beach") || pair.has("vacation"))) return 0.1;
  if (pair.has("casual") && pair.has("streetwear")) return 0.6;
  if (pair.has("vacation") && pair.has("casual")) return 0.55;
  return 0.35;
}

function isHardOccasionConflict(leftValue: unknown, rightValue: unknown): boolean {
  const left = normalizeOccasion(leftValue);
  const right = normalizeOccasion(rightValue);
  if (!left || !right || left === right) return false;
  const pair = new Set([left, right]);
  return (
    (pair.has("office") && pair.has("streetwear")) ||
    (pair.has("office") && pair.has("vacation")) ||
    (pair.has("office") && pair.has("gym")) ||
    (pair.has("gym") && pair.has("date_night")) ||
    (pair.has("formal") && pair.has("streetwear")) ||
    (pair.has("formal") && pair.has("vacation"))
  );
}

function occasionConflictWarning(args: {
  inputOccasion: string;
  inferredOccasion: string;
  resolvedOccasion: string;
}) {
  return {
    type: "occasion_conflict_resolved",
    inputOccasion: args.inputOccasion,
    inferredOccasion: args.inferredOccasion,
    resolvedOccasion: args.resolvedOccasion,
    message: "Input occasion conflicted with query; using inferred occasion.",
  };
}

function resolvedQueryOccasion(input: {
  query: string;
  occasion?: string;
  formality?: string;
  respectInputOccasion?: boolean;
}): {
  inputOccasion: string | null;
  inferredOccasion: string | null;
  resolvedOccasion: string | null;
  occasionSource: string;
  warnings: ReturnType<typeof occasionConflictWarning>[];
} {
  const inputOccasion = cleanText(input.occasion);
  const normalizedInput = inputOccasion ? normalizeOccasion(inputOccasion) : "";
  const inferredOccasion = inferMemoryOccasionFromQuery(input.query) ?? inferMemoryOccasionFromQuery(String(input.formality ?? ""));
  const warnings: ReturnType<typeof occasionConflictWarning>[] = [];
  if (normalizedInput && inferredOccasion && isHardOccasionConflict(normalizedInput, inferredOccasion)) {
    if (input.respectInputOccasion === true) {
      warnings.push(occasionConflictWarning({
        inputOccasion: normalizedInput,
        inferredOccasion,
        resolvedOccasion: normalizedInput,
      }));
      return {
        inputOccasion: normalizedInput,
        inferredOccasion,
        resolvedOccasion: normalizedInput,
        occasionSource: "input_respected_conflict",
        warnings,
      };
    }
    warnings.push(occasionConflictWarning({
      inputOccasion: normalizedInput,
      inferredOccasion,
      resolvedOccasion: inferredOccasion,
    }));
    return {
      inputOccasion: normalizedInput,
      inferredOccasion,
      resolvedOccasion: inferredOccasion,
      occasionSource: "input_conflict_overridden",
      warnings,
    };
  }
  if (normalizedInput) {
    return {
      inputOccasion: normalizedInput,
      inferredOccasion: inferredOccasion ?? null,
      resolvedOccasion: normalizedInput,
      occasionSource: "input",
      warnings,
    };
  }
  return {
    inputOccasion: null,
    inferredOccasion: inferredOccasion ?? null,
    resolvedOccasion: inferredOccasion ?? null,
    occasionSource: inferredOccasion ? "inferred" : "none",
    warnings,
  };
}

function memoryOccasionForCompatibility(memory: StyleMemory): string | undefined {
  return cleanText(memory.entities.occasion) ||
    inferMemoryOccasionFromQuery(cleanText(memory.entities.query)) ||
    inferMemoryOccasionFromQuery(memory.text);
}

function isManualOrGlobal(memory: StyleMemory, memoryOccasion?: string): boolean {
  return memory.type === "manual_note" || memory.source === "manual" || memory.source === "debug" || !memoryOccasion;
}

function typeSpecificBoost(memory: StyleMemory): number {
  if (memory.type === "manual_note") return 1;
  if (memory.type === "item_affinity" || memory.type === "avoidance") return 0.9;
  if (memory.type === "formality_preference") return 0.8;
  return 0.6;
}

export type RetrieveStyleMemoryDeps = {
  createEmbedding?: (text: string) => Promise<number[]>;
  vectorSearchMemories?: (uid: string, queryVector: number[], limit: number) => Promise<StyleMemory[]>;
  getStyleProfile?: (uid: string) => Promise<StyleProfile | null>;
};

async function defaultVectorSearchMemories(uid: string, queryVector: number[], limit: number): Promise<StyleMemory[]> {
  try {
    const snap = await getFirestore()
      .collection("users")
      .doc(uid)
      .collection("styleMemories")
      .findNearest({
        vectorField: STYLE_MEMORY_VECTOR_FIELD,
        queryVector,
        limit,
        distanceMeasure: "COSINE",
        distanceResultField: STYLE_MEMORY_DISTANCE_FIELD,
      })
      .get();
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      [STYLE_MEMORY_DISTANCE_FIELD]: doc.get(STYLE_MEMORY_DISTANCE_FIELD) ?? doc.data()[STYLE_MEMORY_DISTANCE_FIELD],
    } as unknown as StyleMemory));
  } catch (error) {
    throw vectorSearchError(error);
  }
}

export async function readStyleProfile(uid: string): Promise<StyleProfile | null> {
  const snap = await getFirestore().collection("users").doc(uid).collection("styleProfile").doc("main").get();
  return snap.exists ? snap.data() as StyleProfile : null;
}

export async function retrieveStyleMemoryContextForUser(
  uid: string,
  input: {
    query: string;
    occasion?: string;
    formality?: string;
    limit?: number;
    includeDiagnostics?: boolean;
    respectInputOccasion?: boolean;
  },
  deps: RetrieveStyleMemoryDeps = {},
): Promise<StyleMemoryContextResponse> {
  const query = cleanText(input.query);
  if (!query) throw new HttpsError("invalid-argument", "A non-empty style memory query is required.");
  const limit = retrievalLimit(input.limit);
  const occasionResolution = resolvedQueryOccasion(input);
  const memoryQueryText = buildStyleMemoryRetrievalQueryText({
    ...input,
    occasion: occasionResolution.resolvedOccasion ?? undefined,
  });
  const queryVector = await (deps.createEmbedding ?? createTextEmbedding)(memoryQueryText);
  const queryOccasion = occasionResolution.resolvedOccasion ?? normalizeOccasion(input.formality);
  const excludedMemoriesPreview: { id: string; text: string; reason: string }[] = [];
  let excludedMemoryCount = 0;
  const scoredMemories = (await (deps.vectorSearchMemories ?? defaultVectorSearchMemories)(uid, queryVector, Math.max(limit * 4, limit)))
    .filter((memory) => memory.active !== false)
    .flatMap((memory) => {
      const memoryOccasion = memoryOccasionForCompatibility(memory);
      const compatibility = getOccasionCompatibility(queryOccasion, memoryOccasion);
      if (compatibility < 0.3 && !isManualOrGlobal(memory, memoryOccasion)) {
        excludedMemoryCount += 1;
        if (excludedMemoriesPreview.length < 8) {
          excludedMemoriesPreview.push({
            id: memory.id,
            text: memory.text,
            reason: isHardOccasionConflict(queryOccasion, memoryOccasion)
              ? `hard occasion mismatch: query=${queryOccasion || "none"} memory=${memoryOccasion || "none"}`
              : `occasion mismatch: query=${queryOccasion || "none"} memory=${memoryOccasion || "none"}`,
          });
        }
        return [];
      }
      const semantic = semanticScore(memory);
      const typeBoost = typeSpecificBoost(memory);
      return [{
        ...memory,
        semanticScore: semantic,
        occasionCompatibility: compatibility,
        finalMemoryScore: Number(((semantic * 0.65) + (compatibility * 0.25) + (typeBoost * 0.1)).toFixed(3)),
      } as StyleMemory];
    })
    .sort((left, right) => numberValue((right as Record<string, unknown>).finalMemoryScore) - numberValue((left as Record<string, unknown>).finalMemoryScore))
    .slice(0, limit)
    .map(serializeStyleMemory);
  const profile = await (deps.getStyleProfile ?? readStyleProfile)(uid) ?? defaultStyleProfile(uid);
  return {
    query,
    memoryQueryText,
    positiveMemories: scoredMemories.filter((memory) => memory.polarity === "positive"),
    negativeMemories: scoredMemories.filter((memory) => memory.polarity === "negative"),
    profileSummary: profile.summary,
    profileSignals: profile,
    ...(input.includeDiagnostics ? {
      diagnostics: {
        returnedMemoryCount: scoredMemories.length,
        embeddingDimensions: queryVector.length,
        inputOccasion: occasionResolution.inputOccasion,
        inferredOccasion: occasionResolution.inferredOccasion,
        resolvedOccasion: occasionResolution.resolvedOccasion,
        occasionSource: occasionResolution.occasionSource,
        warnings: occasionResolution.warnings,
        excludedMemoryCount,
        excludedMemoriesPreview,
      },
    } : {}),
  };
}

export function outfitStyleMemoryContextFromResponse(response: StyleMemoryContextResponse): OutfitStyleMemoryContext {
  const profile = response.profileSignals;
  return {
    profileSummary: response.profileSummary,
    profileSignals: {
      preferredColors: profile.preferredColors,
      avoidedColors: profile.avoidedColors,
      preferredStyleTags: profile.preferredStyleTags,
      avoidedStyleTags: profile.avoidedStyleTags,
      preferredFits: profile.preferredFits,
      avoidedFits: profile.avoidedFits,
      preferredBrands: profile.preferredBrands,
      avoidedBrands: profile.avoidedBrands,
      preferredCategories: profile.preferredCategories,
      avoidedCategories: profile.avoidedCategories,
      preferredMaterials: profile.preferredMaterials,
      avoidedMaterials: profile.avoidedMaterials,
      itemAffinities: profile.itemAffinities,
      avoidedItemIds: profile.avoidedItemIds,
      avoidedOutfitFingerprints: profile.avoidedOutfitFingerprints,
      formalityBiasByOccasion: profile.formalityBiasByOccasion,
    },
    positiveMemories: response.positiveMemories.map((memory) => ({
      id: memory.id,
      text: memory.text,
      strength: memory.strength,
      confidence: memory.confidence,
      type: memory.type,
      entities: memory.entities,
      occasionCompatibility: memory.occasionCompatibility,
      finalMemoryScore: memory.finalMemoryScore,
    })),
    negativeMemories: response.negativeMemories.map((memory) => ({
      id: memory.id,
      text: memory.text,
      strength: memory.strength,
      confidence: memory.confidence,
      type: memory.type,
      entities: memory.entities,
      occasionCompatibility: memory.occasionCompatibility,
      finalMemoryScore: memory.finalMemoryScore,
    })),
  };
}

export async function rebuildStyleProfile(
  uid: string,
  options: { dryRun?: boolean } = {},
): Promise<{ profile: StyleProfile; memoryCount: number; dryRun: boolean }> {
  const memories = await listActiveStyleMemories(uid);
  const profile = buildStyleProfileFromMemories(uid, memories);
  if (!options.dryRun) await defaultWriteStyleProfile(uid, profile);
  return { profile, memoryCount: memories.length, dryRun: options.dryRun === true };
}

export async function listStyleMemoriesForUser(
  uid: string,
  input: { limit?: number; polarity?: string; type?: string },
): Promise<StyleMemoryClient[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(numberValue(input.limit, 25))));
  let query: Query = getFirestore()
    .collection("users")
    .doc(uid)
    .collection("styleMemories")
    .where("active", "==", true);
  if (input.polarity) query = query.where("polarity", "==", input.polarity);
  if (input.type) query = query.where("type", "==", input.type);
  const snap = await query.limit(limit).get();
  return snap.docs.map((doc) => serializeStyleMemory({ id: doc.id, ...doc.data() } as StyleMemory));
}

export async function softDeleteStyleMemory(uid: string, memoryId: string): Promise<void> {
  await getFirestore()
    .collection("users")
    .doc(uid)
    .collection("styleMemories")
    .doc(memoryId)
    .set({
      active: false,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}

export async function softDeleteAllStyleMemoriesForUser(
  uid: string,
  deps: {
    listMemories?: (uid: string) => Promise<StyleMemory[]>;
    updateMemory?: (uid: string, memoryId: string, patch: Partial<StyleMemory>) => Promise<void>;
    writeStyleProfile?: (uid: string, profile: StyleProfile) => Promise<void>;
  } = {},
): Promise<{ softDeletedCount: number; styleProfilePreview: StyleProfile }> {
  const memories = deps.listMemories ? await deps.listMemories(uid) : await listActiveStyleMemories(uid);
  const active = memories.filter((memory) => memory.active !== false);
  if (deps.updateMemory) {
    for (const memory of active) {
      await deps.updateMemory(uid, memory.id, { active: false, deletedAt: FieldValue.serverTimestamp() });
    }
  } else {
    const db = getFirestore();
    for (let index = 0; index < active.length; index += 400) {
      const batch = db.batch();
      for (const memory of active.slice(index, index + 400)) {
        const ref = db.collection("users").doc(uid).collection("styleMemories").doc(memory.id);
        batch.set(ref, {
          active: false,
          deletedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      await batch.commit();
    }
  }
  const profile = defaultStyleProfile(uid);
  if (deps.writeStyleProfile) {
    await deps.writeStyleProfile(uid, profile);
  } else {
    await defaultWriteStyleProfile(uid, profile);
  }
  return {
    softDeletedCount: active.length,
    styleProfilePreview: profile,
  };
}
