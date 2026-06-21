import * as fs from "fs/promises";
import * as path from "path";
import { classifyAuraStylingAgentIntent, resolveRequestedOutfitCount } from "../agentIntent";
import type { AuraStylingAgentResponse } from "../agentTypes";
import { generateValidatedOutfitsFromContext, type OutfitOpenAIClient } from "../outfitGeneration";
import type { GeneratedOutfit, OutfitRole, ValidatedOutfit } from "../outfitTypes";
import { buildEvalOutfitContext, buildEvalOutfitInput, buildFixtureRetrievalResults, getEvalClosetFixture } from "./closetFixtures";
import { AURA_EVAL_CASES } from "./evalCases";
import { runOptionalAuraLlmJudge } from "./evalJudge";
import {
  evaluateAgentResponse,
  evaluateGeneratedOutfits,
  evaluateRetrievalResults,
} from "./evalMetrics";
import type {
  AuraAgentEvalResult,
  AuraEvalCase,
  AuraEvalCaseSuite,
  AuraEvalCaseResult,
  AuraEvalReport,
  AuraEvalTaskSuite,
  AuraEvalSuite,
  AuraOutfitGenerationEvalResult,
  AuraRetrievalEvalResult,
} from "./evalTypes";

export type AuraEvalRunnerOptions = {
  suites?: AuraEvalSuite[];
  caseSuites?: AuraEvalCaseSuite[];
  taskSuites?: AuraEvalTaskSuite[];
  caseId?: string;
  judge?: boolean;
  output?: string;
  cwd?: string;
  now?: Date;
};

const DEFAULT_OUTPUT_PATH = "reports/aura-eval-report.json";

const CASE_OUTFIT_PLANS: Record<string, string[][]> = {
  "office-black-shoes": [
    ["eval-blue-polo", "eval-black-trousers", "eval-black-loafers", "eval-watch"],
  ],
  "date-night-smart-casual": [
    ["eval-linen-shirt", "eval-black-trousers", "eval-black-loafers", "eval-watch", "eval-racer-jacket"],
    ["eval-blue-polo", "eval-black-trousers", "eval-black-loafers", "eval-belt"],
    ["eval-linen-shirt", "eval-black-jeans", "eval-black-white-sneakers", "eval-racer-jacket", "eval-watch"],
  ],
  "summer-casual-lightweight": [
    ["eval-resort-shirt", "eval-white-linen-trousers", "eval-sandals", "eval-cap"],
  ],
  "streetwear-statement": [
    ["eval-graphic-tee", "eval-black-jeans", "eval-black-white-sneakers", "eval-cap", "eval-racer-jacket"],
  ],
  "rainy-day-weather-safe": [
    ["eval-linen-shirt", "eval-black-jeans", "eval-black-white-sneakers", "eval-racer-jacket"],
  ],
  "refine-less-formal": [
    ["eval-graphic-tee", "eval-black-jeans", "eval-black-white-sneakers", "eval-cap"],
  ],
  "refine-different-shoes": [
    ["eval-blue-polo", "eval-black-trousers", "eval-black-white-sneakers", "eval-watch"],
  ],
  "not-my-vibe-memory": [
    ["eval-linen-shirt", "eval-black-jeans", "eval-black-white-sneakers", "eval-cap", "eval-racer-jacket"],
  ],
  "sparse-office-black-shoes": [
    ["sparse-blue-polo", "sparse-black-jeans", "sparse-black-sneakers"],
  ],
  "missing-footwear": [
    ["missing-fw-linen-shirt", "missing-fw-black-trousers", "missing-fw-racer-jacket", "missing-fw-watch"],
  ],
  "conflicting-memory-streetwear": [
    ["eval-linen-shirt", "eval-black-jeans", "eval-black-white-sneakers", "eval-cap", "eval-racer-jacket"],
  ],
  "ambiguous-look-good": [
    ["eval-blue-polo", "eval-black-trousers", "eval-black-loafers", "eval-watch"],
  ],
  "count-too-high-date": [
    ["diverse-linen-shirt", "diverse-black-trousers", "diverse-black-loafers", "diverse-watch"],
    ["diverse-blue-polo", "diverse-navy-chinos", "diverse-clean-sneakers", "diverse-belt"],
    ["diverse-oxford-shirt", "diverse-black-jeans", "diverse-black-loafers", "diverse-watch"],
    ["diverse-linen-shirt", "diverse-navy-chinos", "diverse-clean-sneakers", "diverse-belt"],
    ["diverse-blue-polo", "diverse-black-trousers", "diverse-black-loafers", "diverse-watch"],
  ],
  "weather-conflict-rainy": [
    ["weather-resort-shirt", "weather-white-linen-trousers", "weather-sneakers", "weather-racer-jacket"],
  ],
  "hot-weather-conflict": [
    ["weather-resort-shirt", "weather-white-linen-trousers", "weather-sneakers"],
  ],
  "hard-refine-different-shoes": [
    ["eval-blue-polo", "eval-black-trousers", "eval-black-white-sneakers", "eval-watch"],
  ],
  "too-formal-refinement": [
    ["eval-graphic-tee", "eval-black-jeans", "eval-black-white-sneakers", "eval-cap"],
  ],
  "bad-metadata-canonical-roles": [
    ["bad-meta-shirt", "bad-meta-trousers", "bad-meta-loafers"],
  ],
  "duplicate-office-avoidance": [
    ["diverse-blue-polo", "diverse-black-trousers", "diverse-black-loafers", "diverse-watch"],
    ["diverse-oxford-shirt", "diverse-navy-chinos", "diverse-clean-sneakers", "diverse-belt"],
    ["diverse-linen-shirt", "diverse-black-jeans", "diverse-black-loafers", "diverse-watch"],
  ],
  "disliked-exact-outfit": [
    ["eval-linen-shirt", "eval-black-jeans", "eval-black-white-sneakers", "eval-cap", "eval-racer-jacket"],
  ],
  "multi-turn-date-more": [
    ["eval-linen-shirt", "eval-black-trousers", "eval-black-loafers", "eval-watch"],
    ["eval-blue-polo", "eval-black-trousers", "eval-black-loafers", "eval-belt"],
    ["eval-linen-shirt", "eval-black-jeans", "eval-black-white-sneakers", "eval-racer-jacket"],
  ],
  "make-outfit-2-more-casual": [
    ["eval-graphic-tee", "eval-black-cargos", "eval-black-white-sneakers", "eval-cap"],
  ],
  "selected-black-cargos": [
    ["eval-graphic-tee", "eval-black-cargos", "eval-black-white-sneakers", "eval-racer-jacket"],
  ],
  "style-just-added-pants": [
    ["eval-blue-polo", "eval-black-cargos", "eval-black-white-sneakers", "eval-belt"],
  ],
  "no-sandals-negative": [
    ["eval-resort-shirt", "eval-white-linen-trousers", "eval-black-white-sneakers", "eval-cap"],
  ],
  "more-like-outfit-2": [
    ["eval-blue-polo", "eval-black-trousers", "eval-black-loafers", "eval-watch"],
  ],
  "why-this-works-followup": [
    ["eval-blue-polo", "eval-black-trousers", "eval-black-loafers"],
  ],
  "no-ready-items": [
    [],
  ],
  "casual-only-formal-dinner": [
    ["casual-resort-shirt", "casual-black-jeans", "casual-sneakers", "casual-cap"],
  ],
  "vector-leakage-regression": [
    ["eval-blue-polo", "eval-black-trousers", "eval-black-loafers", "eval-watch"],
  ],
};

function normalizedText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function roleFromCategory(category: string): OutfitRole {
  if (category === "shoes") return "footwear";
  if (category === "top" || category === "bottom" || category === "footwear" || category === "outerwear" || category === "accessory" || category === "one_piece") {
    return category;
  }
  return "accessory";
}

function formalityForCase(evalCase: AuraEvalCase): "casual" | "smart_casual" | "formal" {
  const formality = normalizedText(evalCase.formality);
  if (formality === "formal") return "formal";
  if (formality === "casual") return "casual";
  return "smart_casual";
}

function generatedOutfitForPlan(evalCase: AuraEvalCase, plan: string[], index: number): GeneratedOutfit {
  const fixture = getEvalClosetFixture(evalCase.closetFixtureId);
  const itemsById = new Map(fixture.items.map((item) => [item.id, item]));
  const items = plan.map((itemId) => {
    const item = itemsById.get(itemId);
    if (!item) throw new Error(`Eval outfit plan references unknown item ${itemId}.`);
    return {
      itemId,
      role: roleFromCategory(item.category),
      reason: "Selected from the synthetic eval closet.",
    };
  });
  return {
    title: `Eval Outfit${index > 0 ? ` ${index + 1}` : ""}`,
    vibe: "closet-based eval look",
    occasion: evalCase.occasion ?? evalCase.expected.expectedOccasionPatterns?.[0] ?? "outfit",
    formality: formalityForCase(evalCase),
    items,
    explanation: `Synthetic eval outfit for ${evalCase.query}.`,
    stylingTips: ["Check role coverage, relevance, and closet-only constraints."],
    missingItems: [],
    confidence: 0.9,
  };
}

function previousOutfitForCase(evalCase: AuraEvalCase): Record<string, unknown> | undefined {
  const ids = evalCase.previousOutfitItemIds ?? [];
  if (!ids.length) return undefined;
  const fixture = getEvalClosetFixture(evalCase.closetFixtureId);
  const itemsById = new Map(fixture.items.map((item) => [item.id, item]));
  return {
    outfitId: "previous-outfit",
    title: "Previous eval outfit",
    occasion: evalCase.occasion,
    formality: evalCase.formality,
    items: ids.flatMap((itemId) => {
      const item = itemsById.get(itemId);
      if (!item) return [];
      return [{
        itemId,
        name: item.name,
        role: roleFromCategory(item.category),
        category: item.category,
      }];
    }),
  };
}

function mockOutfitClient(evalCase: AuraEvalCase): OutfitOpenAIClient {
  return {
    responses: {
      create: async () => {
        const plans = CASE_OUTFIT_PLANS[evalCase.id] ?? CASE_OUTFIT_PLANS["office-black-shoes"];
        const count = Math.max(1, evalCase.expected.expectedCount ?? 1);
        return {
          output_text: JSON.stringify({
            outfits: plans.slice(0, count).map((plan, index) => generatedOutfitForPlan(evalCase, plan, index)),
          }),
        };
      },
    },
  };
}

export function runRetrievalEval(evalCase: AuraEvalCase): AuraRetrievalEvalResult {
  return evaluateRetrievalResults(evalCase, buildFixtureRetrievalResults(evalCase));
}

export async function runOutfitGenerationEval(
  evalCase: AuraEvalCase,
  client: OutfitOpenAIClient = mockOutfitClient(evalCase),
): Promise<AuraOutfitGenerationEvalResult> {
  const input = buildEvalOutfitInput(evalCase);
  const context = buildEvalOutfitContext(evalCase);
  const fixture = getEvalClosetFixture(evalCase.closetFixtureId);
  try {
    const response = await generateValidatedOutfitsFromContext(input, context, {
      client,
      repair: false,
    });
    return evaluateGeneratedOutfits({
      evalCase,
      outfits: response.outfits,
      fixtureItems: fixture.items,
      validationErrors: response.validationErrors,
      repaired: response.repaired,
    });
  } catch (error) {
    const details = error && typeof error === "object" && "details" in error
      ? (error as { details?: unknown }).details
      : {};
    const validationErrors = details && typeof details === "object" && !Array.isArray(details) &&
      Array.isArray((details as Record<string, unknown>).validationErrors)
      ? (details as Record<string, unknown>).validationErrors as string[]
      : [error instanceof Error ? error.message : String(error)];
    return evaluateGeneratedOutfits({
      evalCase,
      outfits: [],
      fixtureItems: fixture.items,
      validationErrors,
      repaired: false,
    });
  }
}

function productionAgentResponse(args: {
  evalCase: AuraEvalCase;
  outfits: ValidatedOutfit[];
}): AuraStylingAgentResponse {
  const requestedCount = resolveRequestedOutfitCount({ query: args.evalCase.query });
  const intent = classifyAuraStylingAgentIntent({
    query: args.evalCase.query,
    mode: "auto",
    count: requestedCount,
    occasion: args.evalCase.occasion,
    formality: args.evalCase.formality as "casual" | "smart_casual" | "formal" | "any" | undefined,
    weather: args.evalCase.weather,
    previousOutfit: previousOutfitForCase(args.evalCase),
    selectedItemIds: args.evalCase.selectedItemIds,
    conversationContext: args.evalCase.previousOutfitItemIds?.length
      ? {
        recentTurns: [],
        selectedItemIds: args.evalCase.selectedItemIds ?? [],
        feedbackSignals: [],
        priorOutfitRefs: [{
          outfitId: "previous-outfit",
          index: 2,
          itemIds: args.evalCase.previousOutfitItemIds,
          occasion: args.evalCase.occasion,
          formality: args.evalCase.formality,
        }],
        selectedOutfitId: "previous-outfit",
      }
      : undefined,
  });
  const countText = args.outfits.length === 1 ? "one closet-based option" : `${args.outfits.length} closet-based options`;
  return {
    mode: intent.mode,
    intent,
    message: `I found ${countText}.`,
    requestedCount,
    outfits: args.outfits,
    suggestedActions: [
      { id: "save", label: "Save Outfit", type: "feedback", payload: { feedbackType: "save" } },
      { id: "wear", label: "Wore This", type: "feedback", payload: { feedbackType: "wear" } },
      { id: "not-my-vibe", label: "Not My Vibe", type: "feedback", payload: { feedbackType: "not_my_vibe" } },
    ],
  };
}

export async function runAgentEval(evalCase: AuraEvalCase): Promise<AuraAgentEvalResult> {
  const generation = await runOutfitGenerationEval(evalCase);
  return evaluateAgentResponse(evalCase, productionAgentResponse({
    evalCase,
    outfits: generation.outfits,
  }));
}

const CASE_SUITES = new Set<AuraEvalCaseSuite>(["standard", "hard"]);
const TASK_SUITES = new Set<AuraEvalTaskSuite>(["retrieval", "generation", "agent"]);

function selectedTaskSuites(options: AuraEvalRunnerOptions): AuraEvalTaskSuite[] {
  if (options.taskSuites?.length) return options.taskSuites;
  const fromSuites = (options.suites ?? []).filter((suite): suite is AuraEvalTaskSuite => TASK_SUITES.has(suite as AuraEvalTaskSuite));
  return fromSuites.length ? fromSuites : ["retrieval", "generation", "agent"];
}

function selectedCaseSuites(options: AuraEvalRunnerOptions): AuraEvalCaseSuite[] {
  if (options.caseSuites?.length) return options.caseSuites;
  const fromSuites = (options.suites ?? []).filter((suite): suite is AuraEvalCaseSuite => CASE_SUITES.has(suite as AuraEvalCaseSuite));
  return fromSuites.length ? fromSuites : ["standard", "hard"];
}

function selectedCases(options: AuraEvalRunnerOptions): AuraEvalCase[] {
  const caseSuites = new Set(selectedCaseSuites(options));
  const cases = options.caseId
    ? AURA_EVAL_CASES.filter((evalCase) => evalCase.id === options.caseId)
    : AURA_EVAL_CASES.filter((evalCase) => caseSuites.has(evalCase.suite));
  if (options.caseId && !cases.length) throw new Error(`Unknown AURA eval case: ${options.caseId}`);
  return cases;
}

function casePassed(result: AuraEvalCaseResult): boolean {
  return Boolean(
    (!result.retrieval || result.retrieval.passed) &&
    (!result.generation || result.generation.passed) &&
    (!result.agent || result.agent.passed) &&
    (!result.judge || result.judge.verdict === "pass"),
  );
}

function collectFailureReasons(result: AuraEvalCaseResult): string[] {
  return [
    ...(result.retrieval?.failureReasons ?? []),
    ...(result.generation?.failureReasons ?? []),
    ...(result.agent?.failureReasons ?? []),
    ...(result.judge?.verdict === "fail" ? result.judge.issues : []),
  ];
}

function collectCriticalFailures(result: AuraEvalCaseResult): string[] {
  const critical: string[] = [];
  const hallucinated = result.generation?.metrics.hallucinatedItemCount ?? 0;
  const hiddenDraft = result.generation?.metrics.hiddenDraftItemCount ?? 0;
  if (hallucinated > 0) critical.push(`${result.caseId}: hallucinated item id`);
  if (hiddenDraft > 0) critical.push(`${result.caseId}: hidden/draft item selected`);
  if (result.agent?.vectorLeakageDetected) critical.push(`${result.caseId}: vector leakage`);
  if (result.agent?.rawResponseLeakageDetected) critical.push(`${result.caseId}: raw response leakage`);
  return critical;
}

function caseScore(result: AuraEvalCaseResult): number {
  const scores: number[] = [];
  if (result.retrieval) {
    scores.push(result.retrieval.precisionAt5, result.retrieval.requiredRoleCoverage);
  }
  if (result.generation) {
    scores.push(
      result.generation.metrics.closetOnlyItemRate,
      1 - Math.min(1, result.generation.metrics.hallucinatedItemCount),
      result.generation.metrics.requiredRoleCoverage,
      result.generation.metrics.categoryCompleteness,
      1 - Math.min(1, result.generation.metrics.forbiddenItemViolations),
      result.generation.metrics.occasionFitHeuristic,
      result.generation.metrics.validationPassRate,
    );
  }
  if (result.agent) scores.push(result.agent.passed ? 1 : 0);
  if (result.judge) scores.push(result.judge.overallScore / 5);
  return average(scores);
}

function actualSummary(result: AuraEvalCaseResult): string {
  const outfitSummaries = result.generation?.outfits.map((outfit) =>
    `${outfit.title}: ${outfit.items.map((item) => `${item.role}=${item.name}`).join(", ")}`,
  ) ?? [];
  if (outfitSummaries.length) return outfitSummaries.join(" | ");
  if (result.generation?.metrics.gracefulFailure) return `Graceful failure: ${result.generation.validationErrors.join("; ")}`;
  return "No outfit summary.";
}

function suggestedFixes(result: AuraEvalCaseResult): string[] {
  return result.failureReasons.map((reason) => {
    if (/hallucinated/i.test(reason)) return "Tighten closet-only item ID validation or repair prompt.";
    if (/role coverage|Missing top/i.test(reason)) return "Review role retrieval and generation required-role constraints.";
    if (/forbidden/i.test(reason)) return "Strengthen weather/style-memory avoidance scoring for this case.";
    if (/Mode|Requested count/i.test(reason)) return "Review agent intent/count classifier rules.";
    if (/leakage/i.test(reason)) return "Sanitize agent/retrieval response before returning production-shaped output.";
    return "Inspect retrieval ranking, prompt constraints, and validation details for this case.";
  });
}

function buildReport(
  timestamp: string,
  caseSuites: AuraEvalCaseSuite[],
  taskSuites: AuraEvalTaskSuite[],
  cases: AuraEvalCaseResult[],
): AuraEvalReport {
  const passedCases = cases.filter((entry) => entry.passed).length;
  const generation = cases.flatMap((entry) => entry.generation ? [entry.generation] : []);
  const retrieval = cases.flatMap((entry) => entry.retrieval ? [entry.retrieval] : []);
  const agent = cases.flatMap((entry) => entry.agent ? [entry.agent] : []);
  const judges = cases.flatMap((entry) => entry.judge ? [entry.judge] : []);
  const gracefulCases = generation.filter((entry) => entry.metrics.gracefulFailure);
  return {
    timestamp,
    suites: caseSuites,
    taskSuites,
    totalCases: cases.length,
    passedCases,
    failedCases: cases.length - passedCases,
    passRate: cases.length ? round(passedCases / cases.length) : 0,
    averageScores: {
      retrievalPrecisionAt5: average(retrieval.map((entry) => entry.precisionAt5)),
      requiredRoleCoverage: average([
        ...retrieval.map((entry) => entry.requiredRoleCoverage),
        ...generation.map((entry) => entry.metrics.requiredRoleCoverage),
      ]),
      closetOnlyItemRate: average(generation.map((entry) => entry.metrics.closetOnlyItemRate)),
      hallucinationRate: average(generation.map((entry) => entry.metrics.hallucinatedItemCount > 0 ? 1 : 0)),
      occasionFit: average(generation.map((entry) => entry.metrics.occasionFitHeuristic)),
      validationPassRate: average(generation.map((entry) => entry.metrics.validationPassRate)),
      agentRegressionPassRate: agent.length ? round(agent.filter((entry) => entry.passed).length / agent.length) : 0,
      gracefulFailureRate: gracefulCases.length
        ? average(gracefulCases.map((entry) => entry.passed ? 1 : 0))
        : 1,
      repairRate: average(generation.map((entry) => entry.metrics.repairRate)),
      averageOverallScore: average(cases.map((entry) => entry.score)),
      llmJudgeOverallScore: judges.length ? average(judges.map((entry) => entry.overallScore)) : null,
    },
    criticalFailures: cases.flatMap((entry) => entry.criticalFailures),
    llmJudgeUsed: judges.length > 0,
    llmJudgeAverageScore: judges.length ? average(judges.map((entry) => entry.overallScore)) : null,
    cases,
    failedCaseIds: cases.filter((entry) => !entry.passed).map((entry) => entry.caseId),
    regressionNotes: cases.flatMap((entry) => entry.failureReasons.map((reason) => `${entry.caseId}: ${reason}`)),
  };
}

export async function runAuraEvals(options: AuraEvalRunnerOptions = {}): Promise<AuraEvalReport> {
  const taskSuites = selectedTaskSuites(options);
  const caseSuites = selectedCaseSuites(options);
  const results: AuraEvalCaseResult[] = [];
  for (const evalCase of selectedCases(options)) {
    const retrieval = taskSuites.includes("retrieval") ? runRetrievalEval(evalCase) : undefined;
    const generation = taskSuites.includes("generation") || taskSuites.includes("agent")
      ? await runOutfitGenerationEval(evalCase)
      : undefined;
    const agent = taskSuites.includes("agent")
      ? evaluateAgentResponse(evalCase, productionAgentResponse({
        evalCase,
        outfits: generation?.outfits ?? [],
      }))
      : undefined;
    const judge = options.judge && generation && evalCase.suite === "hard"
      ? await runOptionalAuraLlmJudge({ evalCase, outfits: generation.outfits, enabled: true })
      : null;
    const caseResult: AuraEvalCaseResult = {
      caseId: evalCase.id,
      name: evalCase.name,
      suite: evalCase.suite,
      query: evalCase.query,
      expectedNotes: evalCase.expected.notes,
      retrieval,
      generation: taskSuites.includes("generation") ? generation : undefined,
      agent,
      judge,
      passed: false,
      score: 0,
      actualSummary: "",
      failureReasons: [],
      criticalFailures: [],
      suggestedFixes: [],
    };
    caseResult.passed = casePassed(caseResult);
    caseResult.failureReasons = collectFailureReasons(caseResult);
    caseResult.criticalFailures = collectCriticalFailures(caseResult);
    caseResult.score = caseScore(caseResult);
    caseResult.actualSummary = actualSummary(caseResult);
    caseResult.suggestedFixes = suggestedFixes(caseResult);
    results.push(caseResult);
  }
  return buildReport((options.now ?? new Date()).toISOString(), caseSuites, taskSuites, results);
}

export function renderAuraEvalMarkdownReport(report: AuraEvalReport): string {
  const failed = report.cases.filter((entry) => !entry.passed);
  const row = (entry: AuraEvalCaseResult) => [
    entry.caseId,
    entry.suite,
    entry.passed ? "pass" : "fail",
    entry.score,
    entry.generation?.metrics.hallucinatedItemCount ?? 0,
    entry.generation?.metrics.requiredRoleCoverage ?? entry.retrieval?.requiredRoleCoverage ?? "n/a",
    entry.failureReasons.length ? entry.failureReasons.join("; ") : "none",
  ].map((value) => String(value).replace(/\|/g, "/")).join(" | ");
  return [
    "# AURA Eval Report",
    "",
    `- Timestamp: ${report.timestamp}`,
    `- Suite: ${report.suites.join(", ")}`,
    `- Task suites: ${report.taskSuites.join(", ")}`,
    `- Total cases: ${report.totalCases}`,
    `- Pass count: ${report.passedCases}`,
    `- Fail count: ${report.failedCases}`,
    `- Pass rate: ${(report.passRate * 100).toFixed(1)}%`,
    `- Critical failures: ${report.criticalFailures.length}`,
    "",
    "## Average Retrieval Metrics",
    "",
    `- Retrieval Precision@5: ${report.averageScores.retrievalPrecisionAt5}`,
    `- Required Role Coverage: ${report.averageScores.requiredRoleCoverage}`,
    "",
    "## Average Generation Metrics",
    "",
    `- Closet-only Item Rate: ${report.averageScores.closetOnlyItemRate}`,
    `- Hallucination Rate: ${report.averageScores.hallucinationRate}`,
    `- Occasion Fit: ${report.averageScores.occasionFit}`,
    `- Validation Pass Rate: ${report.averageScores.validationPassRate}`,
    `- Repair Rate: ${report.averageScores.repairRate}`,
    `- Graceful Failure Rate: ${report.averageScores.gracefulFailureRate}`,
    "",
    "## Average Agent Metrics",
    "",
    `- Agent Regression Pass Rate: ${report.averageScores.agentRegressionPassRate}`,
    `- Average Overall Score: ${report.averageScores.averageOverallScore}`,
    `- LLM Judge Overall Score: ${report.averageScores.llmJudgeOverallScore ?? "not run"}`,
    `- LLM Judge Used: ${report.llmJudgeUsed ? "true" : "false"}`,
    "",
    "## Case Table",
    "",
    "| Case | Suite | Verdict | Score | Hallucinations | Role Coverage | Issues |",
    "| --- | --- | --- | ---: | ---: | ---: | --- |",
    ...report.cases.map((entry) => `| ${row(entry)} |`),
    "",
    "## Critical Failures",
    "",
    report.criticalFailures.length ? report.criticalFailures.map((entry) => `- ${entry}`).join("\n") : "- None",
    "",
    "## Failed Cases",
    "",
    failed.length
      ? failed.map((entry) => [
        `### ${entry.caseId}`,
        "",
        `- Query: ${entry.query}`,
        `- Expected: ${entry.expectedNotes}`,
        `- Actual: ${entry.actualSummary}`,
        `- Failure reasons: ${entry.failureReasons.join("; ")}`,
        `- Suggested fix: ${entry.suggestedFixes.join("; ")}`,
      ].join("\n")).join("\n\n")
      : "- None",
    "",
    "## Regression Notes",
    "",
    report.regressionNotes.length
      ? report.regressionNotes.map((note) => `- ${note}`).join("\n")
      : "- No regressions detected.",
    "",
    "## Resume / Product Summary",
    "",
    `- Eval pass rate: ${(report.passRate * 100).toFixed(1)}%`,
    `- Hallucination rate: ${(report.averageScores.hallucinationRate * 100).toFixed(1)}%`,
    `- Validation success rate: ${(report.averageScores.validationPassRate * 100).toFixed(1)}%`,
    `- Regression gate status: ${report.criticalFailures.length ? "blocked by critical failures" : "eligible for gate check"}`,
    "",
  ].join("\n");
}

export async function writeAuraEvalReports(report: AuraEvalReport, outputPath = DEFAULT_OUTPUT_PATH, cwd = process.cwd()): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  const jsonPath = path.resolve(cwd, outputPath);
  const markdownPath = jsonPath.replace(/\.json$/i, ".md");
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderAuraEvalMarkdownReport(report), "utf8");
  return { jsonPath, markdownPath };
}

export function parseAuraEvalCliArgs(argv: string[]): AuraEvalRunnerOptions {
  const options: AuraEvalRunnerOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--suite") {
      const value = argv[index + 1] ?? "";
      options.suites = value.split(",").map((entry) => normalizedText(entry)).filter(Boolean) as AuraEvalSuite[];
      index += 1;
    } else if (arg === "--case") {
      options.caseId = argv[index + 1];
      index += 1;
    } else if (arg === "--judge") {
      options.judge = true;
    } else if (arg === "--output") {
      options.output = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

export async function runAuraEvalCli(argv: string[] = process.argv.slice(2)): Promise<AuraEvalReport> {
  const options = parseAuraEvalCliArgs(argv);
  const report = await runAuraEvals(options);
  const paths = await writeAuraEvalReports(report, options.output ?? DEFAULT_OUTPUT_PATH, options.cwd);
  console.log(`AURA eval complete: ${report.passedCases}/${report.totalCases} cases passed.`);
  console.log(`JSON report: ${paths.jsonPath}`);
  console.log(`Markdown report: ${paths.markdownPath}`);
  return report;
}
