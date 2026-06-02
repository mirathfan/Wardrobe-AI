import { buildOutfitRetrievalPlan, normalizeOutfitGenerationInput } from "../outfitContext";
import type {
  NormalizedOutfitGenerationInput,
  OutfitCandidate,
  OutfitCandidateBuckets,
  OutfitGenerationContext,
  OutfitRole,
} from "../outfitTypes";
import type {
  WardrobeRetrievalCategoryBucket,
  WardrobeRetrievalResult,
} from "../retrievalTypes";
import type {
  AuraEvalCase,
  AuraEvalClosetFixture,
  AuraEvalFixtureItem,
} from "./evalTypes";

const PLACEHOLDER_IMAGE = "https://example.com/aura-eval-placeholder.png";

export const AURA_EVAL_CLOSET_FIXTURES: AuraEvalClosetFixture[] = [
  {
    id: "aura-core-closet-v1",
    name: "AURA Core Synthetic Closet",
    items: [
      {
        id: "eval-blue-polo",
        name: "Light Blue Polo",
        category: "top",
        subcategory: "polo",
        colors: ["light blue", "blue"],
        styleTags: ["clean", "classic", "smart casual"],
        occasionTags: ["office", "date", "casual"],
        formality: 3,
        material: "cotton pique",
        fit: "regular",
        seasonTags: ["spring", "summer"],
        embeddingText: "light blue cotton polo clean classic smart casual office date top",
      },
      {
        id: "eval-linen-shirt",
        name: "Light Blue Linen Shirt",
        category: "top",
        subcategory: "linen shirt",
        colors: ["light blue", "blue"],
        styleTags: ["breathable", "resort", "elevated", "relaxed"],
        occasionTags: ["date", "summer", "vacation", "office"],
        formality: 3,
        material: "linen",
        fit: "relaxed",
        weatherTags: ["hot"],
        seasonTags: ["summer"],
        embeddingText: "light blue linen shirt breathable elevated resort summer date top",
      },
      {
        id: "eval-black-trousers",
        name: "Black Relaxed Trousers",
        category: "bottom",
        subcategory: "trousers",
        colors: ["black"],
        styleTags: ["clean", "tailored", "smart casual", "classic"],
        occasionTags: ["office", "date", "dinner"],
        formality: 3,
        material: "wool blend",
        fit: "relaxed",
        embeddingText: "black relaxed tailored trousers clean office date smart casual bottom",
      },
      {
        id: "eval-black-jeans",
        name: "Black Straight Jeans",
        category: "bottom",
        subcategory: "jeans",
        colors: ["black"],
        styleTags: ["casual", "streetwear", "clean"],
        occasionTags: ["casual", "streetwear", "date"],
        formality: 2,
        material: "denim",
        fit: "regular",
        embeddingText: "black straight jeans casual streetwear clean bottom",
      },
      {
        id: "eval-black-loafers",
        name: "Black Penny Loafers",
        category: "shoes",
        subcategory: "loafers",
        colors: ["black"],
        styleTags: ["leather", "polished", "classic", "dressy"],
        occasionTags: ["office", "date", "dinner"],
        formality: 4,
        material: "leather",
        weatherTags: ["dry"],
        embeddingText: "black leather penny loafers polished office date footwear",
      },
      {
        id: "eval-black-white-sneakers",
        name: "Black and White Sneakers",
        category: "shoes",
        subcategory: "sneakers",
        colors: ["black", "white"],
        styleTags: ["clean", "streetwear", "casual"],
        occasionTags: ["casual", "streetwear", "summer"],
        formality: 2,
        material: "leather",
        weatherTags: ["dry"],
        embeddingText: "black white clean leather sneakers casual streetwear footwear",
      },
      {
        id: "eval-sandals",
        name: "Black Leather Sandals",
        category: "shoes",
        subcategory: "sandals",
        colors: ["black"],
        styleTags: ["summer", "open", "casual"],
        occasionTags: ["summer", "vacation", "beach"],
        formality: 1,
        material: "leather",
        weatherTags: ["hot", "dry"],
        embeddingText: "black leather sandals open summer vacation casual footwear",
      },
      {
        id: "eval-racer-jacket",
        name: "Black Racer Jacket",
        category: "outerwear",
        subcategory: "racer jacket",
        colors: ["black"],
        styleTags: ["structured", "sleek", "streetwear", "date"],
        occasionTags: ["date", "streetwear", "dinner"],
        formality: 3,
        material: "faux leather",
        fit: "regular",
        weatherTags: ["cool", "wind"],
        embeddingText: "black racer jacket structured sleek streetwear date outerwear",
      },
      {
        id: "eval-graphic-tee",
        name: "Oversized Graphic Tee",
        category: "top",
        subcategory: "graphic tee",
        colors: ["white", "black"],
        styleTags: ["graphic", "oversized", "streetwear", "statement"],
        occasionTags: ["streetwear", "casual"],
        formality: 1,
        material: "cotton",
        fit: "oversized",
        embeddingText: "oversized graphic tee statement streetwear casual top",
      },
      {
        id: "eval-cap",
        name: "Black Cap",
        category: "accessory",
        subcategory: "cap",
        colors: ["black"],
        styleTags: ["streetwear", "casual", "sporty"],
        occasionTags: ["streetwear", "casual", "summer"],
        formality: 1,
        material: "cotton",
        embeddingText: "black cap casual streetwear accessory",
      },
      {
        id: "eval-watch",
        name: "Silver Watch",
        category: "accessory",
        subcategory: "watch",
        colors: ["silver", "green"],
        styleTags: ["polished", "classic", "refined"],
        occasionTags: ["office", "date", "dinner"],
        formality: 3,
        material: "steel",
        embeddingText: "silver watch polished classic refined office date accessory",
      },
      {
        id: "eval-belt",
        name: "Black Leather Belt",
        category: "accessory",
        subcategory: "belt",
        colors: ["black"],
        styleTags: ["classic", "polished", "minimal"],
        occasionTags: ["office", "date"],
        formality: 3,
        material: "leather",
        embeddingText: "black leather belt classic polished office accessory",
      },
      {
        id: "eval-resort-shirt",
        name: "Linen Resort Shirt",
        category: "top",
        subcategory: "resort shirt",
        colors: ["cream", "white"],
        styleTags: ["linen", "breathable", "vacation", "relaxed"],
        occasionTags: ["summer", "vacation", "casual"],
        formality: 2,
        material: "linen",
        fit: "relaxed",
        weatherTags: ["hot"],
        seasonTags: ["summer"],
        embeddingText: "cream linen resort shirt breathable vacation summer casual top",
      },
      {
        id: "eval-white-linen-trousers",
        name: "White Linen Trousers",
        category: "bottom",
        subcategory: "linen trousers",
        colors: ["white"],
        styleTags: ["linen", "breathable", "resort", "lightweight"],
        occasionTags: ["summer", "vacation", "date"],
        formality: 2.5,
        material: "linen",
        fit: "relaxed",
        weatherTags: ["hot"],
        seasonTags: ["summer"],
        embeddingText: "white linen trousers breathable resort summer lightweight bottom",
      },
    ],
  },
];

function fixtureItem(id: string, overrides: Partial<AuraEvalFixtureItem> = {}): AuraEvalFixtureItem {
  const standard = AURA_EVAL_CLOSET_FIXTURES[0]?.items.find((item) => item.id === id);
  if (!standard) throw new Error(`Missing standard eval fixture item ${id}.`);
  return { ...standard, ...overrides };
}

function evalItem(item: AuraEvalFixtureItem): AuraEvalFixtureItem {
  return item;
}

AURA_EVAL_CLOSET_FIXTURES.push(
  {
    id: "sparse-office-closet-v1",
    name: "Sparse Office Closet",
    items: [
      evalItem({
        id: "sparse-casual-tee",
        name: "Plain Casual Tee",
        category: "top",
        subcategory: "t shirt",
        colors: ["white"],
        styleTags: ["casual", "plain"],
        occasionTags: ["casual"],
        formality: 1.5,
        material: "cotton",
        embeddingText: "plain white casual cotton tee top",
      }),
      fixtureItem("eval-blue-polo", { id: "sparse-blue-polo" }),
      fixtureItem("eval-black-jeans", { id: "sparse-black-jeans" }),
      fixtureItem("eval-black-white-sneakers", { id: "sparse-black-sneakers", name: "Black Sneakers", colors: ["black"] }),
    ],
  },
  {
    id: "missing-footwear-closet-v1",
    name: "Missing Footwear Closet",
    items: [
      fixtureItem("eval-linen-shirt", { id: "missing-fw-linen-shirt" }),
      fixtureItem("eval-black-trousers", { id: "missing-fw-black-trousers" }),
      fixtureItem("eval-racer-jacket", { id: "missing-fw-racer-jacket" }),
      fixtureItem("eval-watch", { id: "missing-fw-watch" }),
    ],
  },
  {
    id: "weather-conflict-closet-v1",
    name: "Weather Conflict Closet",
    items: [
      fixtureItem("eval-resort-shirt", { id: "weather-resort-shirt" }),
      fixtureItem("eval-white-linen-trousers", { id: "weather-white-linen-trousers" }),
      fixtureItem("eval-sandals", { id: "weather-sandals" }),
      evalItem({
        id: "weather-suede-loafers",
        name: "Brown Suede Loafers",
        category: "shoes",
        subcategory: "suede loafers",
        colors: ["brown"],
        styleTags: ["suede", "delicate", "polished"],
        occasionTags: ["date", "office"],
        formality: 3.5,
        material: "suede",
        weatherTags: ["dry"],
        embeddingText: "brown suede loafers delicate polished dry weather footwear",
      }),
      fixtureItem("eval-black-white-sneakers", { id: "weather-sneakers" }),
      fixtureItem("eval-racer-jacket", { id: "weather-racer-jacket" }),
      evalItem({
        id: "weather-puffer-jacket",
        name: "Heavy Black Puffer Jacket",
        category: "outerwear",
        subcategory: "puffer jacket",
        colors: ["black"],
        styleTags: ["heavy", "winter", "warm"],
        occasionTags: ["winter", "casual"],
        formality: 1.5,
        material: "insulated nylon",
        fit: "regular",
        weatherTags: ["cold", "snow"],
        seasonTags: ["winter"],
        embeddingText: "heavy black puffer jacket winter cold outerwear",
      }),
    ],
  },
  {
    id: "bad-metadata-closet-v1",
    name: "Bad Metadata Closet",
    items: [
      fixtureItem("eval-linen-shirt", {
        id: "bad-meta-shirt",
        name: "Bad Metadata Linen Shirt",
        aiMetadataCategoryOverride: "one_piece",
      }),
      fixtureItem("eval-black-loafers", {
        id: "bad-meta-loafers",
        name: "Bad Metadata Black Loafers",
        aiMetadataCategoryOverride: "one_piece",
      }),
      fixtureItem("eval-black-trousers", { id: "bad-meta-trousers" }),
    ],
  },
  {
    id: "draft-only-closet-v1",
    name: "Draft Only Closet",
    items: [
      fixtureItem("eval-blue-polo", { id: "draft-blue-polo", status: "draft", itemLifecycleStatus: "draft" }),
      fixtureItem("eval-black-trousers", { id: "draft-black-trousers", status: "needs_review", itemLifecycleStatus: "needs_review" }),
      fixtureItem("eval-black-loafers", { id: "draft-black-loafers", status: "draft", itemLifecycleStatus: "draft" }),
    ],
  },
  {
    id: "casual-only-closet-v1",
    name: "Casual Only Closet",
    items: [
      fixtureItem("eval-graphic-tee", { id: "casual-graphic-tee" }),
      fixtureItem("eval-resort-shirt", { id: "casual-resort-shirt" }),
      fixtureItem("eval-black-jeans", { id: "casual-black-jeans" }),
      fixtureItem("eval-black-white-sneakers", { id: "casual-sneakers" }),
      fixtureItem("eval-cap", { id: "casual-cap" }),
    ],
  },
  {
    id: "diverse-office-closet-v1",
    name: "Diverse Office Closet",
    items: [
      fixtureItem("eval-blue-polo", { id: "diverse-blue-polo" }),
      fixtureItem("eval-linen-shirt", { id: "diverse-linen-shirt" }),
      evalItem({
        id: "diverse-oxford-shirt",
        name: "White Oxford Shirt",
        category: "top",
        subcategory: "oxford shirt",
        colors: ["white"],
        styleTags: ["clean", "professional", "classic"],
        occasionTags: ["office", "dinner"],
        formality: 3.5,
        material: "cotton",
        fit: "regular",
        embeddingText: "white oxford shirt professional classic office top",
      }),
      fixtureItem("eval-black-trousers", { id: "diverse-black-trousers" }),
      fixtureItem("eval-black-jeans", { id: "diverse-black-jeans" }),
      evalItem({
        id: "diverse-navy-chinos",
        name: "Navy Chinos",
        category: "bottom",
        subcategory: "chinos",
        colors: ["navy"],
        styleTags: ["clean", "office", "smart casual"],
        occasionTags: ["office", "casual"],
        formality: 3,
        material: "cotton twill",
        fit: "regular",
        embeddingText: "navy chinos clean office smart casual bottom",
      }),
      fixtureItem("eval-black-loafers", { id: "diverse-black-loafers" }),
      fixtureItem("eval-black-white-sneakers", { id: "diverse-clean-sneakers" }),
      fixtureItem("eval-watch", { id: "diverse-watch" }),
      fixtureItem("eval-belt", { id: "diverse-belt" }),
    ],
  },
);

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function roleForCategory(category: AuraEvalFixtureItem["category"]): OutfitRole {
  return category === "shoes" ? "footwear" : category;
}

function retrievalCategoryForItem(item: AuraEvalFixtureItem): WardrobeRetrievalCategoryBucket {
  return item.category === "shoes" ? "footwear" : item.category;
}

function itemText(item: AuraEvalFixtureItem): string {
  return normalizedText([
    item.name,
    item.category,
    item.subcategory,
    item.colors.join(" "),
    item.styleTags.join(" "),
    item.occasionTags.join(" "),
    item.material,
    item.fit,
    item.weatherTags?.join(" "),
    item.seasonTags?.join(" "),
    item.embeddingText,
  ].filter(Boolean).join(" "));
}

function scoreFixtureItem(item: AuraEvalFixtureItem, evalCase: AuraEvalCase): number {
  const haystack = itemText(item);
  const queryWords = normalizedText([
    evalCase.query,
    evalCase.occasion,
    evalCase.formality,
    evalCase.weather,
    evalCase.expected.notes,
  ].filter(Boolean).join(" "))
    .split(" ")
    .filter((word) => word.length > 3);
  const uniqueWords = [...new Set(queryWords)];
  let score = 0.25;
  score += uniqueWords.filter((word) => haystack.includes(word)).length * 0.04;
  if (evalCase.expected.requiredRoles.includes(roleForCategory(item.category))) score += 0.14;
  if ((evalCase.expected.preferredColors ?? []).some((color) => haystack.includes(normalizedText(color)))) score += 0.18;
  if ((evalCase.expected.preferredSubcategories ?? []).some((subcategory) => haystack.includes(normalizedText(subcategory)))) score += 0.22;
  if ((evalCase.expected.preferredCategories ?? []).some((category) => haystack.includes(normalizedText(category)))) score += 0.1;
  if ((evalCase.expected.avoidedSubcategories ?? []).some((subcategory) => haystack.includes(normalizedText(subcategory)))) score -= 0.35;
  if ((evalCase.expected.avoidedStyleTags ?? []).some((tag) => haystack.includes(normalizedText(tag)))) score -= 0.25;
  if ((evalCase.styleMemory?.dislikedOutfitItemIds ?? []).includes(item.id)) score -= 0.3;
  if ((evalCase.previousOutfitItemIds ?? []).includes(item.id) && /\b(different|swap|change)\b/i.test(evalCase.query)) score -= 0.35;
  return Number(Math.max(0.02, Math.min(0.99, score)).toFixed(4));
}

function metadataForItem(item: AuraEvalFixtureItem): Record<string, unknown> {
  return {
    category: item.aiMetadataCategoryOverride ?? item.category,
    subcategory: item.subcategory,
    colors: item.colors,
    material: item.material,
    fit: item.fit ?? "regular",
    formality: item.formality,
    warmth: item.weatherTags?.includes("cool") ? 3 : 1,
    styleTags: item.styleTags,
    occasionTags: item.occasionTags,
    seasonTags: item.seasonTags ?? [],
    weatherTags: item.weatherTags ?? [],
    searchAliases: [item.name, item.subcategory],
    confidence: 1,
    source: "deterministic",
  };
}

export function getEvalClosetFixture(fixtureId: string): AuraEvalClosetFixture {
  const fixture = AURA_EVAL_CLOSET_FIXTURES.find((entry) => entry.id === fixtureId);
  if (!fixture) throw new Error(`Unknown eval closet fixture: ${fixtureId}`);
  return fixture;
}

export function buildFixtureRetrievalResults(evalCase: AuraEvalCase): WardrobeRetrievalResult[] {
  return getEvalClosetFixture(evalCase.closetFixtureId).items
    .filter((item) => (item.status ?? item.itemLifecycleStatus ?? "ready") === "ready")
    .map((item) => {
      const score = scoreFixtureItem(item, evalCase);
      return {
        itemId: item.id,
        name: item.name,
        category: retrievalCategoryForItem(item),
        subcategory: item.subcategory,
        colors: item.colors,
        score,
        vectorScore: score,
        finalScore: score,
        boostsApplied: [],
        penaltiesApplied: [],
        distance: Number((1 - score).toFixed(4)),
        reason: "Synthetic eval fixture scored by deterministic query/expectation overlap.",
        imageUrl: item.imageUrl ?? PLACEHOLDER_IMAGE,
        aiMetadata: metadataForItem(item),
        embeddingTextPreview: item.embeddingText,
        status: "ready",
        itemLifecycleStatus: item.itemLifecycleStatus ?? item.status ?? "ready",
      };
    })
    .sort((a, b) => Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0));
}

function resultToCandidate(result: WardrobeRetrievalResult): OutfitCandidate {
  const role = result.category === "unknown" ? "accessory" : result.category as OutfitRole;
  return {
    itemId: result.itemId,
    name: result.name,
    category: result.category,
    role,
    canonicalRole: role,
    allowedRole: role,
    sourceRole: role,
    sourceCategory: result.category,
    sourceAiMetadataCategory: String(result.aiMetadata.category ?? result.category),
    subcategory: result.subcategory,
    colors: result.colors,
    score: result.score,
    vectorScore: result.vectorScore,
    finalScore: result.finalScore,
    reason: result.reason,
    imageUrl: result.imageUrl,
    aiMetadata: result.aiMetadata,
    embeddingTextPreview: result.embeddingTextPreview,
    status: result.status,
  };
}

function emptyBuckets(): OutfitCandidateBuckets {
  return {
    top: [],
    bottom: [],
    footwear: [],
    outerwear: [],
    accessory: [],
    one_piece: [],
  };
}

export function buildEvalOutfitInput(evalCase: AuraEvalCase): NormalizedOutfitGenerationInput {
  return normalizeOutfitGenerationInput({
    query: evalCase.query,
    count: evalCase.expected.expectedCount ?? 1,
    occasion: evalCase.occasion,
    weather: evalCase.weather,
    formality: evalCase.formality,
    includeDiagnostics: true,
    useStyleMemory: Boolean(evalCase.styleMemory),
  });
}

export function buildEvalOutfitContext(evalCase: AuraEvalCase): OutfitGenerationContext {
  const input = buildEvalOutfitInput(evalCase);
  const buckets = emptyBuckets();
  for (const result of buildFixtureRetrievalResults(evalCase)) {
    if (result.category === "unknown") continue;
    buckets[result.category].push(resultToCandidate(result));
  }
  return {
    retrievalPlan: buildOutfitRetrievalPlan(input),
    candidates: buckets,
    styleMemory: evalCase.styleMemory
      ? {
        profileSummary: "Synthetic eval style memory.",
        profileSignals: {
          preferredColors: [],
          avoidedColors: [],
          preferredStyleTags: (evalCase.styleMemory.positiveStyleTags ?? []).map((value) => ({ value, weight: 1 })),
          avoidedStyleTags: (evalCase.styleMemory.dislikedStyleTags ?? []).map((value) => ({ value, weight: 1 })),
          preferredFits: [],
          avoidedFits: [],
          preferredBrands: [],
          avoidedBrands: [],
          preferredCategories: [],
          avoidedCategories: [],
          preferredMaterials: [],
          avoidedMaterials: [],
          itemAffinities: [],
          avoidedItemIds: (evalCase.styleMemory.dislikedOutfitItemIds ?? []).map((value) => ({ value, weight: 1 })),
          avoidedOutfitFingerprints: [],
        },
        positiveMemories: [],
        negativeMemories: (evalCase.styleMemory.dislikedOutfitItemIds ?? []).length
          ? [{
            id: "eval-negative-memory",
            text: "User disliked this exact outfit cluster.",
            strength: 1,
            confidence: 1,
            type: "not_my_vibe",
            entities: { itemIds: evalCase.styleMemory.dislikedOutfitItemIds },
          }]
          : [],
      }
      : null,
    diagnostics: {
      candidateLimitPerCategory: 10,
      rawLimitPerCategory: 14,
      missingRequiredRoles: [],
      candidateCounts: {
        top: buckets.top.length,
        bottom: buckets.bottom.length,
        footwear: buckets.footwear.length,
        outerwear: buckets.outerwear.length,
        accessory: buckets.accessory.length,
        one_piece: buckets.one_piece.length,
      },
      categoryQueries: buildOutfitRetrievalPlan(input).categoryQueries,
    },
  };
}
