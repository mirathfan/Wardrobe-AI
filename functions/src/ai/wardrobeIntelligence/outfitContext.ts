import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { EMBEDDING_VECTOR_FIELD, outfitGenerationConfig } from "./config";
import { createTextEmbedding } from "./embeddings";
import {
  VECTOR_DISTANCE_FIELD,
  buildWardrobeRetrievalResults,
  rawVectorLimit,
  type WardrobeVectorCandidate,
} from "./retrieval";
import type { WardrobeRetrievalFormality } from "./retrievalTypes";
import type { ClosetItemDocument } from "./types";
import { canonicalizeOutfitRole } from "./outfitRole";
import {
  OUTFIT_ROLES,
  type NormalizedOutfitGenerationInput,
  type OutfitCandidate,
  type OutfitCandidateBuckets,
  type OutfitGenerationContext,
  type OutfitGenerationInput,
  type OutfitRetrievalPlan,
  type OutfitRole,
} from "./outfitTypes";

const MAX_OUTFIT_COUNT = 5;
const DEFAULT_OUTFIT_COUNT = 3;
const ROLE_CATEGORY: Record<OutfitRole, string> = {
  top: "top",
  bottom: "bottom",
  footwear: "footwear",
  outerwear: "outerwear",
  accessory: "accessory",
  one_piece: "one_piece",
};

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

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (typeof value === "string") return value.split(",").map(cleanText).filter(Boolean);
  return [];
}

function uniqueNormalized(value: unknown, limit = 12): string[] {
  return [...new Set(asStringArray(value).map(normalizedText).filter(Boolean))].slice(0, limit);
}

function normalizeFormality(value: unknown): WardrobeRetrievalFormality {
  const text = normalizedText(value || "any");
  if (!text || text === "any") return "any";
  if (text === "smart casual" || text === "smart_casual") return "smart_casual";
  if (text === "casual" || text === "formal") return text;
  throw new HttpsError("invalid-argument", "formality must be casual, smart_casual, formal, or any.");
}

function normalizeRole(value: string): OutfitRole | null {
  const text = normalizedText(value);
  if (text === "shoe" || text === "shoes") return "footwear";
  if ((OUTFIT_ROLES as string[]).includes(text)) return text as OutfitRole;
  return null;
}

function normalizeRoles(value: unknown): OutfitRole[] {
  return [...new Set(asStringArray(value).map(normalizeRole).filter((role): role is OutfitRole => Boolean(role)))];
}

export function normalizeOutfitGenerationInput(value: unknown): NormalizedOutfitGenerationInput {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const query = cleanText(data.query);
  if (!query) throw new HttpsError("invalid-argument", "A non-empty outfit query is required.");
  const count = Number(data.count ?? DEFAULT_OUTFIT_COUNT);
  const occasion = cleanText(data.occasion);
  const weather = cleanText(data.weather);
  return {
    query,
    count: Math.max(1, Math.min(MAX_OUTFIT_COUNT, Number.isFinite(count) ? Math.floor(count) : DEFAULT_OUTFIT_COUNT)),
    ...(occasion ? { occasion } : {}),
    ...(weather ? { weather } : {}),
    formality: normalizeFormality(data.formality),
    preferredColors: uniqueNormalized(data.preferredColors),
    requiredColors: uniqueNormalized(data.requiredColors),
    requiredCategories: normalizeRoles(data.requiredCategories),
    includeDiagnostics: data.includeDiagnostics === true,
    useStyleMemory: data.useStyleMemory !== false,
  };
}

function intentFlags(input: NormalizedOutfitGenerationInput) {
  const text = normalizedText([input.query, input.occasion, input.weather, input.formality].filter(Boolean).join(" "));
  return {
    office: /\b(office|work|interview|business|professional|meeting|corporate|workwear)\b/.test(text),
    date: /\b(date|dinner|night out|evening|restaurant)\b/.test(text),
    streetwear: /\b(streetwear|street|sneaker|hoodie|cargo|graphic)\b/.test(text),
    summer: /\b(summer|hot|beach|vacation|resort|warm|pool)\b/.test(text),
    rain: /\b(rain|rainy|storm|wet|drizzle)\b/.test(text),
  };
}

function inferredOccasion(input: NormalizedOutfitGenerationInput): string | undefined {
  if (input.occasion) return input.occasion;
  const flags = intentFlags(input);
  if (flags.office) return "office";
  if (flags.date) return "dinner";
  if (flags.streetwear) return "streetwear";
  if (flags.summer) return "vacation";
  return undefined;
}

function inferredWeather(input: NormalizedOutfitGenerationInput): string | undefined {
  if (input.weather) return input.weather;
  const flags = intentFlags(input);
  if (flags.rain) return "rain";
  if (flags.summer) return "hot";
  return undefined;
}

function inferredFormality(input: NormalizedOutfitGenerationInput): WardrobeRetrievalFormality {
  if (input.formality !== "any") return input.formality;
  const flags = intentFlags(input);
  if (flags.office || flags.date) return "smart_casual";
  if (flags.streetwear || flags.summer) return "casual";
  return "any";
}

function categoryColorConstraints(input: NormalizedOutfitGenerationInput): Partial<Record<OutfitRole, string[]>> {
  const text = normalizedText(input.query);
  const constraints: Partial<Record<OutfitRole, string[]>> = {};
  const colorNames = ["black", "white", "blue", "navy", "gray", "grey", "brown", "tan", "beige", "cream", "green", "red"];
  const normalizedColor = (color: string) => color === "grey" ? "gray" : color;
  for (const color of colorNames) {
    const c = normalizedColor(color);
    if (new RegExp(`\\b${color}\\b.{0,18}\\b(shoe|shoes|footwear|loafer|loafers|sneaker|sneakers|boot|boots|derby|derbies)\\b`).test(text) ||
        new RegExp(`\\b(shoe|shoes|footwear|loafer|loafers|sneaker|sneakers|boot|boots|derby|derbies)\\b.{0,18}\\b${color}\\b`).test(text)) {
      constraints.footwear = [...new Set([...(constraints.footwear ?? []), c])];
    }
    if (new RegExp(`\\b${color}\\b.{0,18}\\b(shirt|top|tee|polo|blouse)\\b`).test(text) ||
        new RegExp(`\\b(shirt|top|tee|polo|blouse)\\b.{0,18}\\b${color}\\b`).test(text)) {
      constraints.top = [...new Set([...(constraints.top ?? []), c])];
    }
  }
  return constraints;
}

function queryParts(base: string, extras: string[], colors: string[] = []): string {
  return [...new Set([base, ...extras, ...(colors.length ? [`colors ${colors.join(", ")}`] : [])])]
    .filter(Boolean)
    .join(", ");
}

export function buildOutfitRetrievalPlan(input: NormalizedOutfitGenerationInput | OutfitGenerationInput): OutfitRetrievalPlan {
  const normalized = "preferredColors" in input && Array.isArray(input.preferredColors)
    ? input as NormalizedOutfitGenerationInput
    : normalizeOutfitGenerationInput(input);
  const flags = intentFlags(normalized);
  const occasion = inferredOccasion(normalized);
  const weather = inferredWeather(normalized);
  const formality = inferredFormality(normalized);
  const constraints = categoryColorConstraints(normalized);
  const styleHints: string[] = [];
  const colorHints = [...new Set([...normalized.preferredColors, ...normalized.requiredColors])];

  if (flags.office) styleHints.push("office", "clean", "polished", "professional", "smart casual");
  if (flags.date) styleHints.push(
    "elevated",
    "date night",
    "dinner",
    "night out",
    "sleek",
    "polished",
    "romantic",
    "refined",
    "textured",
    "dark tones",
    "leather",
    "subtle statement",
  );
  if (flags.streetwear) styleHints.push("streetwear", "relaxed", "sneaker-friendly");
  if (flags.summer) styleHints.push("warm weather", "breathable", "relaxed");
  if (flags.rain) styleHints.push("rain-ready", "practical layer");

  const dateTopExtras = ["elevated shirt", "polo", "knit polo", "linen shirt", "button shirt", "textured top", "sleek night-out top"];
  const dateBottomExtras = ["trousers", "dark jeans", "clean relaxed trousers", "tailored pants", "textured trousers"];
  const dateFootwearExtras = ["loafers", "dress shoes", "derbies", "clean leather sneakers", "sleek shoes"];
  const dateOuterwearExtras = ["leather jacket", "racer jacket", "clean jacket", "overshirt", "structured layer", "subtle statement layer"];
  const dateAccessoryExtras = ["watch", "belt", "minimal accessory", "refined accessory"];

  const topExtras = flags.office
    ? ["button shirt", "oxford shirt", "polo", "knit polo", "overshirt", "clean professional shirt", ...(flags.date ? dateTopExtras : [])]
    : flags.date
      ? dateTopExtras
      : flags.streetwear
      ? ["hoodie", "graphic tee", "oversized tee", "layered streetwear top"]
      : flags.summer
        ? ["breathable shirt", "linen shirt", "cotton top", "relaxed summer top"]
        : ["versatile top", "shirt", "tee", "polo"];
  const bottomExtras = flags.office
    ? ["trousers", "chinos", "tailored pants", "clean dark jeans", ...(flags.date ? dateBottomExtras : [])]
    : flags.date
      ? dateBottomExtras
      : flags.streetwear
      ? ["cargos", "relaxed jeans", "streetwear pants"]
      : flags.summer
        ? ["shorts", "linen pants", "light trousers"]
        : ["pants", "jeans", "shorts"];
  const footwearExtras = flags.office
    ? ["black office shoes", "black loafers", "black dress shoes", "black derbies", "clean black leather sneakers", ...(flags.date ? dateFootwearExtras : [])]
    : flags.date
      ? dateFootwearExtras
      : flags.streetwear
      ? ["sneakers", "streetwear shoes", "statement sneakers"]
      : flags.summer
        ? ["sandals", "light sneakers", "summer footwear"]
        : ["shoes", "sneakers", "boots"];

  return {
    intent: {
      ...(occasion ? { occasion } : {}),
      formality,
      ...(weather ? { weather } : {}),
      styleHints,
      colorHints,
      categorySpecificConstraints: constraints,
    },
    categoryQueries: {
      top: queryParts(`${occasion ?? "outfit"} ${formality} top`, topExtras, constraints.top),
      bottom: queryParts(`${occasion ?? "outfit"} ${formality} bottom`, bottomExtras, constraints.bottom),
      footwear: queryParts(`${occasion ?? "outfit"} ${formality} footwear`, footwearExtras, constraints.footwear),
      outerwear: queryParts(`${occasion ?? "outfit"} ${formality} outerwear`, flags.office
        ? ["overshirt", "blazer", "clean jacket", "structured layer", ...(flags.date ? dateOuterwearExtras : [])]
        : flags.date
          ? dateOuterwearExtras
          : ["jacket", "outerwear", "layer"], constraints.outerwear),
      accessory: queryParts(`${occasion ?? "outfit"} ${formality} accessory`, flags.office
        ? ["watch", "belt", "minimal accessory", ...(flags.date ? dateAccessoryExtras : [])]
        : flags.date
          ? dateAccessoryExtras
          : ["accessory", "watch", "belt", "bag"], constraints.accessory),
      one_piece: queryParts(`${occasion ?? "outfit"} ${formality} one piece`, ["dress", "jumpsuit", "one piece outfit"], constraints.one_piece),
    },
  };
}

function distanceValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function vectorSearchCandidates(args: {
  uid: string;
  queryVector: number[];
  limit: number;
}): Promise<WardrobeVectorCandidate[]> {
  const snap = await getFirestore()
    .collection("users")
    .doc(args.uid)
    .collection("items")
    .findNearest({
      vectorField: EMBEDDING_VECTOR_FIELD,
      queryVector: args.queryVector,
      limit: args.limit,
      distanceMeasure: "COSINE",
      distanceResultField: VECTOR_DISTANCE_FIELD,
    })
    .get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      itemId: doc.id,
      item: { id: doc.id, ...data } as ClosetItemDocument,
      distance: distanceValue(doc.get(VECTOR_DISTANCE_FIELD) ?? data[VECTOR_DISTANCE_FIELD]),
    };
  });
}

export type RetrieveOutfitContextDeps = {
  retrieveRoleCandidates?: (args: {
    uid: string;
    input: NormalizedOutfitGenerationInput;
    plan: OutfitRetrievalPlan;
    role: OutfitRole;
    query: string;
    limit: number;
  }) => Promise<OutfitCandidate[]>;
};

function emptyCandidateBuckets(): OutfitCandidateBuckets {
  return {
    top: [],
    bottom: [],
    footwear: [],
    outerwear: [],
    accessory: [],
    one_piece: [],
  };
}

function scoreValue(candidate: OutfitCandidate): number {
  return Number(candidate.score ?? candidate.finalScore ?? candidate.vectorScore ?? 0);
}

function sourceAiMetadataCategory(candidate: OutfitCandidate): string | null {
  const category = candidate.aiMetadata.category;
  return typeof category === "string" && category.trim() ? category.trim() : null;
}

function annotateCandidate(candidate: OutfitCandidate, sourceRole: OutfitRole): OutfitCandidate {
  const canonical = canonicalizeOutfitRole(candidate, candidate.role);
  const canonicalRole = canonical === "unknown" ? sourceRole : canonical;
  return {
    ...candidate,
    sourceRole: candidate.sourceRole ?? sourceRole,
    sourceCategory: candidate.sourceCategory ?? candidate.category,
    sourceAiMetadataCategory: candidate.sourceAiMetadataCategory ?? sourceAiMetadataCategory(candidate),
    role: canonicalRole,
    canonicalRole,
    allowedRole: canonicalRole,
  };
}

export function canonicalizeOutfitCandidateBuckets(
  buckets: OutfitCandidateBuckets,
): OutfitCandidateBuckets {
  const byId = new Map<string, OutfitCandidate>();
  for (const sourceRole of OUTFIT_ROLES) {
    for (const candidate of buckets[sourceRole]) {
      const annotated = annotateCandidate(candidate, sourceRole);
      const existing = byId.get(annotated.itemId);
      if (!existing || scoreValue(annotated) > scoreValue(existing)) {
        byId.set(annotated.itemId, annotated);
      }
    }
  }

  const normalized = emptyCandidateBuckets();
  for (const candidate of byId.values()) {
    normalized[candidate.allowedRole].push(candidate);
  }
  for (const role of OUTFIT_ROLES) {
    normalized[role].sort((left, right) => scoreValue(right) - scoreValue(left));
  }
  return normalized;
}

async function defaultRetrieveRoleCandidates(args: {
  uid: string;
  input: NormalizedOutfitGenerationInput;
  plan: OutfitRetrievalPlan;
  role: OutfitRole;
  query: string;
  limit: number;
}): Promise<OutfitCandidate[]> {
  const colors = args.plan.intent.categorySpecificConstraints[args.role] ?? [];
  const vector = await createTextEmbedding(args.query);
  const rawLimit = rawVectorLimit(args.limit);
  const candidates = await vectorSearchCandidates({
    uid: args.uid,
    queryVector: vector,
    limit: rawLimit,
  });
  const results = buildWardrobeRetrievalResults({
    query: args.query,
    limit: args.limit,
    ...(args.plan.intent.occasion ? { occasion: args.plan.intent.occasion } : {}),
    ...(args.plan.intent.weather ? { weather: args.plan.intent.weather } : {}),
    formality: args.plan.intent.formality,
    categories: [ROLE_CATEGORY[args.role]],
    styleTags: [],
    colors,
    includeDiagnostics: false,
  }, candidates);

  return results.map((result) => ({
    itemId: result.itemId,
    name: result.name,
    category: result.category,
    role: args.role,
    canonicalRole: args.role,
    allowedRole: args.role,
    sourceRole: args.role,
    sourceCategory: result.category,
    sourceAiMetadataCategory: typeof result.aiMetadata.category === "string" ? result.aiMetadata.category : null,
    ...(result.subcategory ? { subcategory: result.subcategory } : {}),
    ...(result.brand ? { brand: result.brand } : {}),
    colors: result.colors,
    score: result.score,
    vectorScore: result.vectorScore,
    finalScore: result.finalScore,
    reason: result.reason,
    imageUrl: result.imageUrl,
    aiMetadata: result.aiMetadata,
    embeddingTextPreview: result.embeddingTextPreview,
    status: result.status,
  }));
}

function missingRequiredRoles(candidates: OutfitCandidateBuckets): OutfitRole[] {
  const hasOnePiece = candidates.one_piece.length > 0;
  const missing: OutfitRole[] = [];
  if (!hasOnePiece && !candidates.top.length) missing.push("top");
  if (!hasOnePiece && !candidates.bottom.length) missing.push("bottom");
  if (!candidates.footwear.length) missing.push("footwear");
  return missing;
}

export async function retrieveOutfitGenerationContext(
  uid: string,
  input: NormalizedOutfitGenerationInput | OutfitGenerationInput,
  deps: RetrieveOutfitContextDeps = {},
): Promise<OutfitGenerationContext> {
  const normalized = "preferredColors" in input && Array.isArray(input.preferredColors)
    ? input as NormalizedOutfitGenerationInput
    : normalizeOutfitGenerationInput(input);
  const config = outfitGenerationConfig();
  const plan = buildOutfitRetrievalPlan(normalized);
  const limit = config.maxCandidatesPerCategory;
  const retrieveRoleCandidates = deps.retrieveRoleCandidates ?? defaultRetrieveRoleCandidates;
  const candidates = emptyCandidateBuckets();

  for (const role of OUTFIT_ROLES) {
    const query = plan.categoryQueries[role];
    if (!query) continue;
    candidates[role] = await retrieveRoleCandidates({
      uid,
      input: normalized,
      plan,
      role,
      query,
      limit,
    });
  }
  const canonicalCandidates = canonicalizeOutfitCandidateBuckets(candidates);

  return {
    retrievalPlan: plan,
    candidates: canonicalCandidates,
    diagnostics: {
      candidateLimitPerCategory: limit,
      rawLimitPerCategory: rawVectorLimit(limit),
      missingRequiredRoles: missingRequiredRoles(canonicalCandidates),
      candidateCounts: {
        top: canonicalCandidates.top.length,
        bottom: canonicalCandidates.bottom.length,
        footwear: canonicalCandidates.footwear.length,
        outerwear: canonicalCandidates.outerwear.length,
        accessory: canonicalCandidates.accessory.length,
        one_piece: canonicalCandidates.one_piece.length,
      },
      categoryQueries: plan.categoryQueries,
    },
  };
}
