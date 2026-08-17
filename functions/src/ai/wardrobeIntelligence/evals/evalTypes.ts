import type { AuraStylingAgentMode } from "../agentTypes";
import type { OutfitRole, ValidatedOutfit } from "../outfitTypes";
import type { WardrobeRetrievalResult } from "../retrievalTypes";

export type AuraEvalTaskSuite = "retrieval" | "generation" | "agent";
export type AuraEvalCaseSuite = "standard" | "hard";
export type AuraEvalSuite = AuraEvalTaskSuite | AuraEvalCaseSuite;

export type AuraEvalExpected = {
  requiredRoles: OutfitRole[];
  preferredCategories?: string[];
  preferredSubcategories?: string[];
  preferredColors?: string[];
  avoidedSubcategories?: string[];
  avoidedStyleTags?: string[];
  mustIncludeItemNames?: string[];
  mustIncludeItemIds?: string[];
  mustNotIncludeItemNames?: string[];
  expectedMode?: AuraStylingAgentMode;
  expectedCount?: number;
  expectedMaxCount?: number;
  expectedOccasionPatterns?: string[];
  expectedFormality?: string;
  allowGracefulFailure?: boolean;
  expectedMissingRoles?: OutfitRole[];
  expectedAvoidItemIds?: string[];
  expectedNoExactDuplicateOutfits?: boolean;
  notes: string;
};

export type AuraEvalCase = {
  id: string;
  name: string;
  suite: AuraEvalCaseSuite;
  query: string;
  occasion?: string;
  formality?: string;
  weather?: string;
  closetFixtureId: string;
  previousOutfitItemIds?: string[];
  selectedItemIds?: string[];
  avoidTerms?: string[];
  styleMemory?: {
    dislikedOutfitItemIds?: string[];
    dislikedStyleTags?: string[];
    positiveStyleTags?: string[];
  };
  expected: AuraEvalExpected;
};

export type AuraEvalFixtureItem = {
  id: string;
  name: string;
  category: "top" | "bottom" | "shoes" | "outerwear" | "accessory" | "one_piece";
  subcategory: string;
  colors: string[];
  styleTags: string[];
  occasionTags: string[];
  formality: number;
  material?: string;
  fit?: string;
  weatherTags?: string[];
  seasonTags?: string[];
  embeddingText: string;
  imageUrl?: string | null;
  aiMetadataCategoryOverride?: "top" | "bottom" | "shoes" | "outerwear" | "accessory" | "one_piece" | "unknown";
  status?: "ready" | "draft" | "needs_review";
  itemLifecycleStatus?: "ready" | "draft" | "needs_review";
};

export type AuraEvalClosetFixture = {
  id: string;
  name: string;
  items: AuraEvalFixtureItem[];
};

export type AuraRetrievalEvalResult = {
  caseId: string;
  precisionAt5: number;
  precisionAt10: number;
  requiredRoleCoverage: number;
  forbiddenViolations: number;
  averageRelevantScore: number;
  categoryBalance: number;
  passed: boolean;
  failureReasons: string[];
  results: WardrobeRetrievalResult[];
};

export type AuraOutfitGenerationEvalMetrics = {
  closetOnlyItemRate: number;
  hallucinatedItemCount: number;
  requiredRoleCoverage: number;
  categoryCompleteness: number;
  forbiddenItemViolations: number;
  occasionFitHeuristic: number;
  formalityFit: number;
  colorCoherence: number;
  validationPassRate: number;
  repairRate: number;
  gracefulFailure: boolean;
  hiddenDraftItemCount: number;
  duplicateExactOutfitCount: number;
};

export type AuraOutfitGenerationEvalResult = {
  caseId: string;
  passed: boolean;
  failureReasons: string[];
  metrics: AuraOutfitGenerationEvalMetrics;
  outfits: ValidatedOutfit[];
  validationErrors: string[];
  validationWarnings: string[];
};

export type AuraAgentEvalResult = {
  caseId: string;
  passed: boolean;
  failureReasons: string[];
  mode: AuraStylingAgentMode;
  requestedCount?: number;
  generatedOutfitCount: number;
  occasion?: string;
  formality?: string;
  suggestedActionCount: number;
  vectorLeakageDetected: boolean;
  diagnosticsLeakageDetected: boolean;
  rawResponseLeakageDetected: boolean;
  message: string;
};

export type AuraJudgeResult = {
  occasionScore: number;
  coherenceScore: number;
  styleScore: number;
  weatherScore: number;
  requestSatisfactionScore: number;
  closetFaithfulnessScore: number;
  overallScore: number;
  issues: string[];
  verdict: "pass" | "fail";
};

export type AuraEvalCaseResult = {
  caseId: string;
  name: string;
  suite: AuraEvalCaseSuite;
  query: string;
  expectedNotes: string;
  retrieval?: AuraRetrievalEvalResult;
  generation?: AuraOutfitGenerationEvalResult;
  agent?: AuraAgentEvalResult;
  judge?: AuraJudgeResult | null;
  passed: boolean;
  score: number;
  actualSummary: string;
  failureReasons: string[];
  criticalFailures: string[];
  suggestedFixes: string[];
};

export type AuraEvalReport = {
  timestamp: string;
  suites: AuraEvalSuite[];
  taskSuites: AuraEvalTaskSuite[];
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;
  averageScores: {
    retrievalPrecisionAt5: number;
    requiredRoleCoverage: number;
    closetOnlyItemRate: number;
    hallucinationRate: number;
    occasionFit: number;
    validationPassRate: number;
    agentRegressionPassRate: number;
    gracefulFailureRate: number;
    repairRate: number;
    averageOverallScore: number;
    llmJudgeOverallScore: number | null;
  };
  criticalFailures: string[];
  llmJudgeUsed: boolean;
  llmJudgeAverageScore: number | null;
  cases: AuraEvalCaseResult[];
  failedCaseIds: string[];
  regressionNotes: string[];
};

function text(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

export function validateEvalCase(value: unknown): AuraEvalCase {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Eval case must be an object.");
  }
  const data = value as Record<string, unknown>;
  const expected = data.expected && typeof data.expected === "object" && !Array.isArray(data.expected)
    ? data.expected as Record<string, unknown>
    : null;
  const id = text(data.id);
  const name = text(data.name);
  const query = text(data.query);
  const closetFixtureId = text(data.closetFixtureId);
  if (!id) throw new Error("Eval case id is required.");
  if (!name) throw new Error(`Eval case ${id} name is required.`);
  if (!query) throw new Error(`Eval case ${id} query is required.`);
  if (!closetFixtureId) throw new Error(`Eval case ${id} closetFixtureId is required.`);
  if (!expected) throw new Error(`Eval case ${id} expected block is required.`);
  const requiredRoles = stringArray(expected.requiredRoles) as OutfitRole[];
  if (!requiredRoles.length) throw new Error(`Eval case ${id} expected.requiredRoles is required.`);
  const notes = text(expected.notes);
  if (!notes) throw new Error(`Eval case ${id} expected.notes is required.`);

  return {
    id,
    name,
    suite: text(data.suite) === "hard" ? "hard" : "standard",
    query,
    ...(text(data.occasion) ? { occasion: text(data.occasion) } : {}),
    ...(text(data.formality) ? { formality: text(data.formality) } : {}),
    ...(text(data.weather) ? { weather: text(data.weather) } : {}),
    closetFixtureId,
    previousOutfitItemIds: stringArray(data.previousOutfitItemIds),
    selectedItemIds: stringArray(data.selectedItemIds),
    avoidTerms: stringArray(data.avoidTerms),
    styleMemory: data.styleMemory && typeof data.styleMemory === "object" && !Array.isArray(data.styleMemory)
      ? {
        dislikedOutfitItemIds: stringArray((data.styleMemory as Record<string, unknown>).dislikedOutfitItemIds),
        dislikedStyleTags: stringArray((data.styleMemory as Record<string, unknown>).dislikedStyleTags),
        positiveStyleTags: stringArray((data.styleMemory as Record<string, unknown>).positiveStyleTags),
      }
      : undefined,
    expected: {
      requiredRoles,
      preferredCategories: stringArray(expected.preferredCategories),
      preferredSubcategories: stringArray(expected.preferredSubcategories),
      preferredColors: stringArray(expected.preferredColors),
      avoidedSubcategories: stringArray(expected.avoidedSubcategories),
      avoidedStyleTags: stringArray(expected.avoidedStyleTags),
      mustIncludeItemNames: stringArray(expected.mustIncludeItemNames),
      mustIncludeItemIds: stringArray(expected.mustIncludeItemIds),
      mustNotIncludeItemNames: stringArray(expected.mustNotIncludeItemNames),
      ...(text(expected.expectedMode) ? { expectedMode: text(expected.expectedMode) as AuraStylingAgentMode } : {}),
      ...(Number.isFinite(Number(expected.expectedCount)) ? { expectedCount: Number(expected.expectedCount) } : {}),
      ...(Number.isFinite(Number(expected.expectedMaxCount)) ? { expectedMaxCount: Number(expected.expectedMaxCount) } : {}),
      expectedOccasionPatterns: stringArray(expected.expectedOccasionPatterns),
      ...(text(expected.expectedFormality) ? { expectedFormality: text(expected.expectedFormality) } : {}),
      allowGracefulFailure: expected.allowGracefulFailure === true,
      expectedMissingRoles: stringArray(expected.expectedMissingRoles) as OutfitRole[],
      expectedAvoidItemIds: stringArray(expected.expectedAvoidItemIds),
      expectedNoExactDuplicateOutfits: expected.expectedNoExactDuplicateOutfits === true,
      notes,
    },
  };
}

export function validateEvalCases(cases: unknown[]): AuraEvalCase[] {
  const seen = new Set<string>();
  return cases.map(validateEvalCase).map((evalCase) => {
    if (seen.has(evalCase.id)) throw new Error(`Duplicate eval case id: ${evalCase.id}`);
    seen.add(evalCase.id);
    return evalCase;
  });
}
