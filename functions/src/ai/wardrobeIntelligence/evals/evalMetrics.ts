import type { AuraStylingAgentResponse } from "../agentTypes";
import type { OutfitRole, ValidatedOutfit, ValidatedOutfitItem } from "../outfitTypes";
import type { WardrobeRetrievalResult } from "../retrievalTypes";
import type {
  AuraAgentEvalResult,
  AuraEvalCase,
  AuraEvalFixtureItem,
  AuraOutfitGenerationEvalMetrics,
  AuraOutfitGenerationEvalResult,
  AuraRetrievalEvalResult,
} from "./evalTypes";

const VECTOR_LEAKAGE_KEYS = [
  "embeddingVector",
  "embeddingRaw",
  "_values",
  "vector",
  "rawVector",
  "queryVector",
];
const RAW_RESPONSE_KEYS = [
  "rawOpenAIResponse",
  "rawOpenAiResponse",
  "rawResponse",
  "openAIResponse",
  "openAiResponse",
];

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roleFromCategory(value: unknown): OutfitRole | "unknown" {
  const text = normalizedText(value);
  if (text === "shoes" || text === "shoe") return "footwear";
  if (text === "top" || text === "bottom" || text === "footwear" || text === "outerwear" || text === "accessory" || text === "one piece" || text === "one_piece") {
    return text === "one piece" ? "one_piece" : text;
  }
  return "unknown";
}

function itemSearchText(item: {
  name?: unknown;
  category?: unknown;
  subcategory?: unknown;
  colors?: unknown;
  aiMetadata?: unknown;
  reason?: unknown;
}): string {
  const metadata = item.aiMetadata && typeof item.aiMetadata === "object" && !Array.isArray(item.aiMetadata)
    ? item.aiMetadata as Record<string, unknown>
    : {};
  return normalizedText([
    item.name,
    item.category,
    item.subcategory,
    Array.isArray(item.colors) ? item.colors.join(" ") : item.colors,
    metadata.category,
    metadata.subcategory,
    Array.isArray(metadata.colors) ? metadata.colors.join(" ") : metadata.colors,
    Array.isArray(metadata.styleTags) ? metadata.styleTags.join(" ") : metadata.styleTags,
    Array.isArray(metadata.occasionTags) ? metadata.occasionTags.join(" ") : metadata.occasionTags,
    metadata.material,
    item.reason,
  ].filter(Boolean).join(" "));
}

function matchesAny(text: string, values: readonly string[] | undefined): boolean {
  return Boolean(values?.some((value) => text.includes(normalizedText(value))));
}

function isPreferred(evalCase: AuraEvalCase, item: WardrobeRetrievalResult | ValidatedOutfitItem): boolean {
  const text = itemSearchText(item);
  const role = roleFromCategory("role" in item ? item.role : item.category);
  return (
    evalCase.expected.requiredRoles.includes(role as OutfitRole) ||
    matchesAny(text, evalCase.expected.preferredCategories) ||
    matchesAny(text, evalCase.expected.preferredSubcategories) ||
    matchesAny(text, evalCase.expected.preferredColors) ||
    matchesAny(text, evalCase.expected.mustIncludeItemNames)
  );
}

function forbiddenViolation(evalCase: AuraEvalCase, item: WardrobeRetrievalResult | ValidatedOutfitItem): boolean {
  const text = itemSearchText(item);
  return (
    (evalCase.expected.expectedAvoidItemIds ?? []).includes("itemId" in item ? item.itemId : "") ||
    matchesAny(text, evalCase.expected.avoidedSubcategories) ||
    matchesAny(text, evalCase.expected.avoidedStyleTags) ||
    matchesAny(text, evalCase.expected.mustNotIncludeItemNames)
  );
}

export function precisionAtK(evalCase: AuraEvalCase, results: WardrobeRetrievalResult[], k: number): number {
  const slice = results.slice(0, k);
  if (!slice.length) return 0;
  return round(slice.filter((item) => isPreferred(evalCase, item)).length / slice.length);
}

export function requiredRoleCoverageForItems(
  evalCase: AuraEvalCase,
  items: readonly (WardrobeRetrievalResult | ValidatedOutfitItem)[],
): number {
  if (!evalCase.expected.requiredRoles.length) return 1;
  const presentRoles = new Set(items.map((item) => roleFromCategory("role" in item ? item.role : item.category)));
  return round(evalCase.expected.requiredRoles.filter((role) => presentRoles.has(role)).length / evalCase.expected.requiredRoles.length);
}

export function countForbiddenViolations(
  evalCase: AuraEvalCase,
  items: readonly (WardrobeRetrievalResult | ValidatedOutfitItem)[],
): number {
  return items.filter((item) => forbiddenViolation(evalCase, item)).length;
}

export function evaluateRetrievalResults(
  evalCase: AuraEvalCase,
  results: WardrobeRetrievalResult[],
): AuraRetrievalEvalResult {
  const relevantScores = results
    .filter((item) => isPreferred(evalCase, item))
    .map((item) => Number(item.finalScore ?? item.score ?? 0))
    .filter((score) => Number.isFinite(score));
  const topResults = results.slice(0, 5);
  const requiredRoleCoverage = requiredRoleCoverageForItems(evalCase, results.slice(0, 10));
  const forbiddenViolations = countForbiddenViolations(evalCase, topResults);
  const categoryBalance = requiredRoleCoverage;
  const precision5 = precisionAtK(evalCase, results, 5);
  const precision10 = precisionAtK(evalCase, results, 10);
  const gracefulMissingRetrieval = evalCase.expected.allowGracefulFailure &&
    (!results.length || requiredRoleCoverage < 1);
  const failureReasons = [
    ...(!gracefulMissingRetrieval && precision5 < 0.6 ? [`Precision@5 ${precision5} is below 0.6`] : []),
    ...(!gracefulMissingRetrieval && requiredRoleCoverage < 1 ? [`Required role coverage ${requiredRoleCoverage} is incomplete`] : []),
    ...(forbiddenViolations > 1 ? [`${forbiddenViolations} forbidden retrieval violations`] : []),
  ];
  return {
    caseId: evalCase.id,
    precisionAt5: precision5,
    precisionAt10: precision10,
    requiredRoleCoverage,
    forbiddenViolations,
    averageRelevantScore: average(relevantScores),
    categoryBalance,
    passed: failureReasons.length === 0,
    failureReasons,
    results,
  };
}

function completeOutfitRoles(items: ValidatedOutfitItem[]): boolean {
  const roles = new Set(items.map((item) => item.role));
  return (
    (roles.has("top") && roles.has("bottom") && roles.has("footwear")) ||
    (roles.has("one_piece") && roles.has("footwear"))
  );
}

function heuristicOccasionFit(evalCase: AuraEvalCase, outfit: ValidatedOutfit): number {
  const allText = normalizedText([
    evalCase.query,
    outfit.title,
    outfit.vibe,
    outfit.occasion,
    outfit.explanation,
    ...outfit.items.map(itemSearchText),
  ].join(" "));
  const hasForbidden = matchesAny(allText, evalCase.expected.avoidedSubcategories) ||
    matchesAny(allText, evalCase.expected.avoidedStyleTags);
  let score = 0.55;
  if (matchesAny(allText, evalCase.expected.preferredSubcategories)) score += 0.2;
  if (matchesAny(allText, evalCase.expected.preferredColors)) score += 0.1;
  if (matchesAny(allText, evalCase.expected.avoidedSubcategories)) score -= 0.25;
  if (matchesAny(allText, evalCase.expected.avoidedStyleTags)) score -= 0.2;
  if (!hasForbidden) score += 0.08;
  if (evalCase.weather && allText.includes(normalizedText(evalCase.weather))) score += 0.08;
  if (normalizedText(evalCase.weather).includes("rain") &&
      /\b(sneaker|sneakers|boot|boots|jacket|outerwear)\b/.test(allText) &&
      !/\b(sandal|sandals|suede|open shoe|open shoes)\b/.test(allText)) {
    score += 0.22;
  }
  if (evalCase.occasion && allText.includes(normalizedText(evalCase.occasion))) score += 0.08;
  return round(Math.max(0, Math.min(1, score)));
}

function formalityFit(evalCase: AuraEvalCase, outfit: ValidatedOutfit): number {
  const target = normalizedText(evalCase.expected.expectedFormality ?? evalCase.formality ?? "any");
  if (!target || target === "any") return 1;
  if (normalizedText(outfit.formality) === target) return 1;
  if (target === "smart casual" && normalizedText(outfit.formality) === "smart casual") return 1;
  return 0.55;
}

function colorCoherence(outfit: ValidatedOutfit): number {
  const score = Number(outfit.scoreBreakdown.colorCoherence);
  if (Number.isFinite(score)) return round(score);
  const colors = new Set(outfit.items.flatMap((item) => item.colors.map(normalizedText)).filter(Boolean));
  if (colors.size <= 3) return 0.9;
  if (colors.size <= 5) return 0.72;
  return 0.55;
}

function fixtureIds(fixtureItems: AuraEvalFixtureItem[]): Set<string> {
  return new Set(fixtureItems.map((item) => item.id));
}

function hiddenDraftFixtureIds(fixtureItems: AuraEvalFixtureItem[]): Set<string> {
  return new Set(
    fixtureItems
      .filter((item) => (item.status ?? item.itemLifecycleStatus ?? "ready") !== "ready")
      .map((item) => item.id),
  );
}

function exactDuplicateOutfits(outfits: ValidatedOutfit[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const outfit of outfits) {
    const signature = outfit.items.map((item) => `${item.itemId}:${item.role}`).sort().join("|");
    if (seen.has(signature)) duplicates += 1;
    seen.add(signature);
  }
  return duplicates;
}

export function evaluateGeneratedOutfits(args: {
  evalCase: AuraEvalCase;
  outfits: ValidatedOutfit[];
  fixtureItems: AuraEvalFixtureItem[];
  validationErrors?: string[];
  repaired?: boolean;
}): AuraOutfitGenerationEvalResult {
  const allItems = args.outfits.flatMap((outfit) => outfit.items);
  const validItemIds = fixtureIds(args.fixtureItems);
  const hiddenDraftItemIds = hiddenDraftFixtureIds(args.fixtureItems);
  const hallucinatedItemCount = allItems.filter((item) => !validItemIds.has(item.itemId)).length;
  const hiddenDraftItemCount = allItems.filter((item) => hiddenDraftItemIds.has(item.itemId)).length;
  const closetOnlyItemRate = allItems.length
    ? round(allItems.filter((item) => validItemIds.has(item.itemId)).length / allItems.length)
    : 0;
  const requiredRoleCoverage = args.outfits.length
    ? average(args.outfits.map((outfit) => requiredRoleCoverageForItems(args.evalCase, outfit.items)))
    : 0;
  const categoryCompleteness = args.outfits.length
    ? average(args.outfits.map((outfit) => completeOutfitRoles(outfit.items) ? 1 : 0))
    : 0;
  const forbiddenItemViolations = countForbiddenViolations(args.evalCase, allItems);
  const occasionFitHeuristic = args.outfits.length
    ? average(args.outfits.map((outfit) => heuristicOccasionFit(args.evalCase, outfit)))
    : 0;
  const formality = args.outfits.length
    ? average(args.outfits.map((outfit) => formalityFit(args.evalCase, outfit)))
    : 0;
  const colorScore = args.outfits.length ? average(args.outfits.map(colorCoherence)) : 0;
  const validationErrors = args.validationErrors ?? [];
  const gracefulFailure = Boolean(args.evalCase.expected.allowGracefulFailure && !args.outfits.length && validationErrors.length);
  const validationPassRate = validationErrors.length && !gracefulFailure ? 0 : 1;
  const repairRate = args.repaired ? 1 : 0;
  const duplicateExactOutfitCount = exactDuplicateOutfits(args.outfits);
  const metrics: AuraOutfitGenerationEvalMetrics = {
    closetOnlyItemRate,
    hallucinatedItemCount,
    requiredRoleCoverage,
    categoryCompleteness,
    forbiddenItemViolations,
    occasionFitHeuristic,
    formalityFit: formality,
    colorCoherence: colorScore,
    validationPassRate,
    repairRate,
    gracefulFailure,
    hiddenDraftItemCount,
    duplicateExactOutfitCount,
  };
  const failureReasons = [
    ...(hallucinatedItemCount > 0 ? [`${hallucinatedItemCount} hallucinated item id(s)`] : []),
    ...(hiddenDraftItemCount > 0 ? [`${hiddenDraftItemCount} hidden/draft item id(s) selected`] : []),
    ...(!gracefulFailure && requiredRoleCoverage < 1 ? [`Required role coverage ${requiredRoleCoverage} is incomplete`] : []),
    ...(!gracefulFailure && categoryCompleteness < 1 ? ["Missing top+bottom+footwear or one_piece+footwear"] : []),
    ...(forbiddenItemViolations > 0 ? [`${forbiddenItemViolations} forbidden outfit item violation(s)`] : []),
    ...(!gracefulFailure && occasionFitHeuristic < 0.55 ? [`Occasion fit ${occasionFitHeuristic} is below threshold`] : []),
    ...(args.evalCase.expected.expectedNoExactDuplicateOutfits && duplicateExactOutfitCount > 0 ? [`${duplicateExactOutfitCount} exact duplicate outfit(s)`] : []),
    ...(!gracefulFailure && validationErrors.length ? validationErrors : []),
  ];
  return {
    caseId: args.evalCase.id,
    passed: failureReasons.length === 0,
    failureReasons,
    metrics,
    outfits: args.outfits,
    validationErrors,
    validationWarnings: [],
  };
}

export function detectVectorLeakage(value: unknown): boolean {
  const serialized = JSON.stringify(value);
  return VECTOR_LEAKAGE_KEYS.some((key) => serialized.includes(key));
}

export function detectRawResponseLeakage(value: unknown): boolean {
  const serialized = JSON.stringify(value);
  return RAW_RESPONSE_KEYS.some((key) => serialized.includes(key));
}

export function detectDiagnosticsLeakage(value: unknown): boolean {
  return JSON.stringify(value).includes("\"diagnostics\"");
}

export function evaluateAgentResponse(evalCase: AuraEvalCase, response: AuraStylingAgentResponse): AuraAgentEvalResult {
  const expected = evalCase.expected;
  const requestedCount = response.requestedCount;
  const generatedOutfitCount = response.outfits?.length ?? 0;
  const occasion = response.intent.constraints.occasion ?? response.outfits?.[0]?.occasion;
  const formality = response.intent.constraints.formality ?? response.outfits?.[0]?.formality;
  const vectorLeakageDetected = detectVectorLeakage(response);
  const diagnosticsLeakageDetected = detectDiagnosticsLeakage(response);
  const rawResponseLeakageDetected = detectRawResponseLeakage(response);
  const message = response.message;
  const expectedOccasionPatterns = expected.expectedOccasionPatterns ?? [];
  const occasionText = normalizedText(occasion);
  const countMismatch = expected.expectedCount !== undefined && requestedCount !== expected.expectedCount;
  const maxCountMismatch = expected.expectedMaxCount !== undefined && generatedOutfitCount > expected.expectedMaxCount;
  const modeMismatch = expected.expectedMode !== undefined && response.mode !== expected.expectedMode;
  const occasionMismatch = expectedOccasionPatterns.length > 0 &&
    !expectedOccasionPatterns.some((pattern) => occasionText.includes(normalizedText(pattern)));
  const multipleOutfitsButSingularMessage = (requestedCount ?? 0) > 1 &&
    generatedOutfitCount > 1 &&
    /\bi found one\b/i.test(message);
  const gracefulNoOutfit = expected.allowGracefulFailure && generatedOutfitCount === 0;
  const failureReasons = [
    ...(modeMismatch ? [`Mode ${response.mode} did not match ${expected.expectedMode}`] : []),
    ...(countMismatch ? [`Requested count ${requestedCount ?? "missing"} did not match ${expected.expectedCount}`] : []),
    ...(maxCountMismatch ? [`Returned count ${generatedOutfitCount} exceeded max ${expected.expectedMaxCount}`] : []),
    ...(occasionMismatch ? [`Occasion ${occasion ?? "missing"} did not match expected patterns`] : []),
    ...(!gracefulNoOutfit && generatedOutfitCount < Math.min(expected.expectedCount ?? 1, 1) ? ["No generated outfits returned"] : []),
    ...(multipleOutfitsButSingularMessage ? ["Message says one option while multiple outfits were returned"] : []),
    ...(vectorLeakageDetected ? ["Vector leakage detected in agent response"] : []),
    ...(diagnosticsLeakageDetected ? ["Diagnostics leakage detected in production-shaped agent response"] : []),
    ...(rawResponseLeakageDetected ? ["Raw model response leakage detected in agent response"] : []),
  ];
  return {
    caseId: evalCase.id,
    passed: failureReasons.length === 0,
    failureReasons,
    mode: response.mode,
    requestedCount,
    generatedOutfitCount,
    occasion,
    formality,
    suggestedActionCount: response.suggestedActions.length,
    vectorLeakageDetected,
    diagnosticsLeakageDetected,
    rawResponseLeakageDetected,
    message,
  };
}
