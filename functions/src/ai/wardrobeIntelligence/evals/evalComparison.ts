import * as fs from "fs/promises";
import * as path from "path";
import type { AuraEvalCaseResult, AuraEvalReport } from "./evalTypes";

export type AuraEvalComparison = {
  beforePath: string;
  afterPath: string;
  passRateDelta: number;
  hallucinationDelta: number;
  repairRateDelta: number;
  validationFailureDelta: number;
  averageOverallScoreDelta: number;
  changedVerdicts: {
    caseId: string;
    before: "pass" | "fail" | "missing";
    after: "pass" | "fail" | "missing";
    scoreDelta: number;
    reason: string;
  }[];
  improvedCases: string[];
  regressedCases: string[];
};

function round(value: number): number {
  return Number(value.toFixed(4));
}

function readNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function caseMap(report: AuraEvalReport): Map<string, AuraEvalCaseResult> {
  return new Map(report.cases.map((entry) => [entry.caseId, entry]));
}

function score(entry: AuraEvalCaseResult | undefined): number {
  return readNumber(entry?.score);
}

function verdict(entry: AuraEvalCaseResult | undefined): "pass" | "fail" | "missing" {
  if (!entry) return "missing";
  return entry.passed ? "pass" : "fail";
}

function reason(before: AuraEvalCaseResult | undefined, after: AuraEvalCaseResult | undefined): string {
  if (!after) return "Case missing from after report.";
  if (!before) return "Case added in after report.";
  if (after.failureReasons.length) return after.failureReasons.join("; ");
  return "Score/verdict changed.";
}

export function compareAuraEvalReports(args: {
  before: AuraEvalReport;
  after: AuraEvalReport;
  beforePath?: string;
  afterPath?: string;
}): AuraEvalComparison {
  const beforeCases = caseMap(args.before);
  const afterCases = caseMap(args.after);
  const allCaseIds = [...new Set([...beforeCases.keys(), ...afterCases.keys()])].sort();
  const changedVerdicts = allCaseIds.flatMap((caseId) => {
    const before = beforeCases.get(caseId);
    const after = afterCases.get(caseId);
    const beforeVerdict = verdict(before);
    const afterVerdict = verdict(after);
    const scoreDelta = round(score(after) - score(before));
    if (beforeVerdict === afterVerdict && Math.abs(scoreDelta) < 0.001) return [];
    return [{
      caseId,
      before: beforeVerdict,
      after: afterVerdict,
      scoreDelta,
      reason: reason(before, after),
    }];
  });
  return {
    beforePath: args.beforePath ?? "before",
    afterPath: args.afterPath ?? "after",
    passRateDelta: round(args.after.passRate - args.before.passRate),
    hallucinationDelta: round(args.after.averageScores.hallucinationRate - args.before.averageScores.hallucinationRate),
    repairRateDelta: round(args.after.averageScores.repairRate - args.before.averageScores.repairRate),
    validationFailureDelta: round((1 - args.after.averageScores.validationPassRate) - (1 - args.before.averageScores.validationPassRate)),
    averageOverallScoreDelta: round(args.after.averageScores.averageOverallScore - args.before.averageScores.averageOverallScore),
    changedVerdicts,
    improvedCases: changedVerdicts
      .filter((entry) => entry.after === "pass" && entry.before !== "pass" || entry.scoreDelta > 0.05)
      .map((entry) => entry.caseId),
    regressedCases: changedVerdicts
      .filter((entry) => entry.after === "fail" && entry.before === "pass" || entry.scoreDelta < -0.05)
      .map((entry) => entry.caseId),
  };
}

export function renderAuraEvalComparisonMarkdown(comparison: AuraEvalComparison): string {
  return [
    "# AURA Eval Comparison",
    "",
    `Before: ${comparison.beforePath}`,
    `After: ${comparison.afterPath}`,
    "",
    "## Deltas",
    "",
    `- Pass rate delta: ${comparison.passRateDelta}`,
    `- Average score delta: ${comparison.averageOverallScoreDelta}`,
    `- Hallucination delta: ${comparison.hallucinationDelta}`,
    `- Repair rate delta: ${comparison.repairRateDelta}`,
    `- Validation failure delta: ${comparison.validationFailureDelta}`,
    "",
    "## Changed Verdicts",
    "",
    comparison.changedVerdicts.length
      ? comparison.changedVerdicts
        .map((entry) => `- ${entry.caseId}: ${entry.before} -> ${entry.after}, score delta ${entry.scoreDelta}. ${entry.reason}`)
        .join("\n")
      : "- None",
    "",
    "## Improved Cases",
    "",
    comparison.improvedCases.length ? comparison.improvedCases.map((entry) => `- ${entry}`).join("\n") : "- None",
    "",
    "## Regressed Cases",
    "",
    comparison.regressedCases.length ? comparison.regressedCases.map((entry) => `- ${entry}`).join("\n") : "- None",
    "",
  ].join("\n");
}

export async function readAuraEvalReport(filePath: string): Promise<AuraEvalReport> {
  return JSON.parse(await fs.readFile(path.resolve(process.cwd(), filePath), "utf8")) as AuraEvalReport;
}

export async function writeAuraEvalComparison(comparison: AuraEvalComparison, outputPath = "reports/aura-eval-comparison.md"): Promise<string> {
  const resolved = path.resolve(process.cwd(), outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, renderAuraEvalComparisonMarkdown(comparison), "utf8");
  return resolved;
}

export function parseAuraEvalCompareArgs(argv: string[]): { before?: string; after?: string; output?: string } {
  const options: { before?: string; after?: string; output?: string } = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--before") {
      options.before = argv[index + 1];
      index += 1;
    } else if (arg === "--after") {
      options.after = argv[index + 1];
      index += 1;
    } else if (arg === "--output") {
      options.output = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

export async function runAuraEvalCompareCli(argv: string[] = process.argv.slice(2)): Promise<AuraEvalComparison> {
  const options = parseAuraEvalCompareArgs(argv);
  if (!options.before || !options.after) {
    throw new Error("Usage: npm run eval:aura:compare -- --before reports/before.json --after reports/after.json");
  }
  const before = await readAuraEvalReport(options.before);
  const after = await readAuraEvalReport(options.after);
  const comparison = compareAuraEvalReports({
    before,
    after,
    beforePath: options.before,
    afterPath: options.after,
  });
  const outputPath = await writeAuraEvalComparison(comparison, options.output);
  console.log(`AURA eval comparison written: ${outputPath}`);
  return comparison;
}
