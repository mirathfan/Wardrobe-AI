import * as fs from "fs";
import * as path from "path";
import { classifyAuraStylingAgentIntent } from "../agentIntent";
import type { AuraStylingAgentResponse } from "../agentTypes";
import type { ValidatedOutfit, ValidatedOutfitItem } from "../outfitTypes";
import { buildFixtureRetrievalResults, getEvalClosetFixture } from "../evals/closetFixtures";
import { AURA_EVAL_CASES, AURA_HARD_EVAL_CASES } from "../evals/evalCases";
import { compareAuraEvalReports, renderAuraEvalComparisonMarkdown } from "../evals/evalComparison";
import { llmJudgeEnabled, parseAuraJudgeResult } from "../evals/evalJudge";
import {
  countForbiddenViolations,
  detectVectorLeakage,
  evaluateAgentResponse,
  evaluateGeneratedOutfits,
  precisionAtK,
  requiredRoleCoverageForItems,
} from "../evals/evalMetrics";
import { renderAuraEvalMarkdownReport, runAuraEvals, runOutfitGenerationEval } from "../evals/evalRunner";
import { evaluateAuraEvalGate } from "../evals/evalThresholds";
import { validateEvalCase } from "../evals/evalTypes";

function caseById(id: string) {
  const evalCase = AURA_EVAL_CASES.find((entry) => entry.id === id);
  if (!evalCase) throw new Error(`Missing eval case ${id}`);
  return evalCase;
}

function item(overrides: Partial<ValidatedOutfitItem>): ValidatedOutfitItem {
  return {
    itemId: "item",
    role: "top",
    reason: "test",
    name: "Test Item",
    category: "top",
    colors: ["black"],
    imageUrl: null,
    aiMetadata: {},
    ...overrides,
  };
}

function outfit(items: ValidatedOutfitItem[]): ValidatedOutfit {
  return {
    outfitId: "outfit-1",
    title: "Test Outfit",
    vibe: "test",
    occasion: "office",
    formality: "smart_casual",
    items,
    explanation: "test outfit",
    stylingTips: [],
    missingItems: [],
    confidence: 0.9,
    scoreBreakdown: { colorCoherence: 0.9 } as ValidatedOutfit["scoreBreakdown"],
  };
}

describe("AURA offline eval harness", () => {
  it("validates eval case schema", () => {
    expect(AURA_EVAL_CASES.length).toBeGreaterThanOrEqual(8);
    expect(() => AURA_EVAL_CASES.map(validateEvalCase)).not.toThrow();
  });

  it("hard suite has at least 12 valid cases", () => {
    expect(AURA_HARD_EVAL_CASES.length).toBeGreaterThanOrEqual(12);
    expect(AURA_HARD_EVAL_CASES.every((evalCase) => evalCase.suite === "hard")).toBe(true);
    expect(() => AURA_HARD_EVAL_CASES.map(validateEvalCase)).not.toThrow();
  });

  it("computes retrieval Precision@K", () => {
    const evalCase = caseById("office-black-shoes");
    const results = buildFixtureRetrievalResults(evalCase);
    expect(precisionAtK(evalCase, results, 5)).toBeGreaterThanOrEqual(0.6);
  });

  it("computes required role coverage", () => {
    const evalCase = caseById("office-black-shoes");
    const results = buildFixtureRetrievalResults(evalCase);
    expect(requiredRoleCoverageForItems(evalCase, results.slice(0, 10))).toBe(1);
  });

  it("detects forbidden item violations", () => {
    const evalCase = caseById("rainy-day-weather-safe");
    const violations = countForbiddenViolations(evalCase, [
      item({
        itemId: "eval-sandals",
        role: "footwear",
        name: "Black Leather Sandals",
        category: "footwear",
        subcategory: "sandals",
        aiMetadata: { styleTags: ["open"] },
      }),
    ]);
    expect(violations).toBe(1);
  });

  it("catches hallucinated outfit item ids", () => {
    const evalCase = caseById("office-black-shoes");
    const fixture = getEvalClosetFixture(evalCase.closetFixtureId);
    const result = evaluateGeneratedOutfits({
      evalCase,
      fixtureItems: fixture.items,
      outfits: [
        outfit([
          item({ itemId: "hallucinated-shirt", role: "top", name: "Imaginary Shirt" }),
          item({ itemId: "eval-black-trousers", role: "bottom", name: "Black Relaxed Trousers", category: "bottom", subcategory: "trousers" }),
          item({ itemId: "eval-black-loafers", role: "footwear", name: "Black Penny Loafers", category: "footwear", subcategory: "loafers" }),
        ]),
      ],
    });
    expect(result.metrics.hallucinatedItemCount).toBe(1);
    expect(result.passed).toBe(false);
  });

  it("sparse closet case expects no hallucination", async () => {
    const result = await runOutfitGenerationEval(caseById("sparse-office-black-shoes"));
    expect(result.metrics.hallucinatedItemCount).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("catches missing footwear", () => {
    const evalCase = caseById("office-black-shoes");
    const fixture = getEvalClosetFixture(evalCase.closetFixtureId);
    const result = evaluateGeneratedOutfits({
      evalCase,
      fixtureItems: fixture.items,
      outfits: [
        outfit([
          item({ itemId: "eval-blue-polo", role: "top", name: "Light Blue Polo" }),
          item({ itemId: "eval-black-trousers", role: "bottom", name: "Black Relaxed Trousers", category: "bottom" }),
        ]),
      ],
    });
    expect(result.metrics.requiredRoleCoverage).toBeLessThan(1);
    expect(result.failureReasons.join(" ")).toContain("Missing");
  });

  it("missing footwear hard case fails gracefully", async () => {
    const result = await runOutfitGenerationEval(caseById("missing-footwear"));
    expect(result.metrics.gracefulFailure).toBe(true);
    expect(result.passed).toBe(true);
  });

  it("bad metadata case uses canonical roles", async () => {
    const result = await runOutfitGenerationEval(caseById("bad-metadata-canonical-roles"));
    const roles = result.outfits[0]?.items.map((entry) => [entry.itemId, entry.role]);
    expect(roles).toContainEqual(["bad-meta-shirt", "top"]);
    expect(roles).toContainEqual(["bad-meta-loafers", "footwear"]);
    expect(result.passed).toBe(true);
  });

  it("no ready items case fails gracefully", async () => {
    const result = await runOutfitGenerationEval(caseById("no-ready-items"));
    expect(result.metrics.gracefulFailure).toBe(true);
    expect(result.outfits).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it("agent eval detects wrong requested count", () => {
    const evalCase = caseById("date-night-smart-casual");
    const intent = classifyAuraStylingAgentIntent({ query: evalCase.query });
    const response: AuraStylingAgentResponse = {
      mode: intent.mode,
      intent,
      requestedCount: 1,
      message: "I found one closet-based option.",
      suggestedActions: [],
      outfits: [outfit([
        item({ itemId: "eval-linen-shirt", role: "top" }),
        item({ itemId: "eval-black-trousers", role: "bottom", category: "bottom" }),
        item({ itemId: "eval-black-loafers", role: "footwear", category: "footwear" }),
      ])],
    };
    expect(evaluateAgentResponse(evalCase, response).passed).toBe(false);
  });

  it("agent eval detects vector leakage", () => {
    expect(detectVectorLeakage({ item: { embeddingVector: [1, 2, 3] } })).toBe(true);
  });

  it("eval thresholds pass and fail correctly", async () => {
    const report = await runAuraEvals({ suites: ["standard"], now: new Date("2026-06-01T00:00:00.000Z") });
    expect(evaluateAuraEvalGate(report).passed).toBe(false);
    const fullReport = await runAuraEvals({ suites: ["standard", "hard"], now: new Date("2026-06-01T00:00:00.000Z") });
    expect(evaluateAuraEvalGate(fullReport).passed).toBe(true);
  });

  it("critical hallucination fails gate", async () => {
    const report = await runAuraEvals({ suites: ["standard", "hard"], now: new Date("2026-06-01T00:00:00.000Z") });
    report.criticalFailures.push("test: hallucinated item id");
    expect(evaluateAuraEvalGate(report).passed).toBe(false);
  });

  it("critical vector leakage fails gate", async () => {
    const report = await runAuraEvals({ suites: ["standard", "hard"], now: new Date("2026-06-01T00:00:00.000Z") });
    const first = report.cases[0];
    if (!first.agent) throw new Error("Expected agent result.");
    first.agent.vectorLeakageDetected = true;
    first.criticalFailures.push("vector leakage");
    report.criticalFailures.push(`${first.caseId}: vector leakage`);
    expect(evaluateAuraEvalGate(report).passed).toBe(false);
  });

  it("comparison report detects improved and regressed cases", async () => {
    const before = await runAuraEvals({ suites: ["standard"], now: new Date("2026-06-01T00:00:00.000Z") });
    const after = JSON.parse(JSON.stringify(before)) as typeof before;
    after.passRate = 0.5;
    if (!after.cases[0]) throw new Error("Expected case.");
    after.cases[0].passed = false;
    after.cases[0].score = 0.2;
    after.cases[0].failureReasons = ["selected sandals in rain"];
    if (after.cases[1]) after.cases[1].score = before.cases[1].score + 0.1;
    const comparison = compareAuraEvalReports({ before, after });
    expect(comparison.regressedCases).toContain(after.cases[0].caseId);
    if (after.cases[1]) expect(comparison.improvedCases).toContain(after.cases[1].caseId);
    const markdown = renderAuraEvalComparisonMarkdown(comparison);
    expect(markdown).toContain("Regressed Cases");
  });

  it("parses valid LLM judge JSON", () => {
    const parsed = parseAuraJudgeResult(JSON.stringify({
      occasionScore: 5,
      coherenceScore: 4,
      styleScore: 4,
      weatherScore: 3,
      requestSatisfactionScore: 5,
      closetFaithfulnessScore: 5,
      overallScore: 4,
      issues: ["minor weather caveat"],
      verdict: "pass",
    }));
    expect(parsed.verdict).toBe("pass");
    expect(parsed.overallScore).toBe(4);
  });

  it("keeps LLM judge disabled by default", () => {
    expect(llmJudgeEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  });

  it("generates markdown reports", async () => {
    const report = await runAuraEvals({
      suites: ["retrieval"],
      caseId: "office-black-shoes",
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    const markdown = renderAuraEvalMarkdownReport(report);
    expect(markdown).toContain("AURA Eval Report");
    expect(markdown).toContain("| Case | Suite | Verdict | Score |");
    expect(markdown).toContain("office-black-shoes");
  });

  it("suite selection works", async () => {
    const hard = await runAuraEvals({ suites: ["hard"], now: new Date("2026-06-01T00:00:00.000Z") });
    expect(hard.cases).toHaveLength(AURA_HARD_EVAL_CASES.length);
    expect(hard.cases.every((entry) => entry.suite === "hard")).toBe(true);
  });

  it("case selection works", async () => {
    const report = await runAuraEvals({ caseId: "missing-footwear", now: new Date("2026-06-01T00:00:00.000Z") });
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]?.caseId).toBe("missing-footwear");
  });

  it("defines the npm eval:aura script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["eval:aura"]).toContain("runAuraEvals");
    expect(pkg.scripts?.["eval:aura:gate"]).toContain("runAuraEvalGate");
    expect(pkg.scripts?.["eval:aura:compare"]).toContain("runAuraEvalCompare");
  });
});
