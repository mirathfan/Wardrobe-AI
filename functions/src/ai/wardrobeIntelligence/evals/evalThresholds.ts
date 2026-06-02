import type { AuraEvalCaseSuite, AuraEvalReport } from "./evalTypes";

export type AuraEvalSuiteThreshold = {
  passRate: number;
  hallucinationRate: number;
  vectorLeakage: number;
  gracefulFailureRate?: number;
  averageOverallScore: number;
};

export type AuraEvalGateResult = {
  passed: boolean;
  failures: string[];
  criticalFailures: string[];
  suiteResults: Record<AuraEvalCaseSuite, {
    totalCases: number;
    passRate: number;
    hallucinationRate: number;
    vectorLeakage: number;
    gracefulFailureRate: number;
    averageOverallScore: number;
    threshold: AuraEvalSuiteThreshold;
    passed: boolean;
  }>;
};

export const AURA_EVAL_THRESHOLDS: Record<AuraEvalCaseSuite, AuraEvalSuiteThreshold> = {
  standard: {
    passRate: 0.95,
    hallucinationRate: 0,
    vectorLeakage: 0,
    averageOverallScore: 0.8,
  },
  hard: {
    passRate: 0.75,
    hallucinationRate: 0,
    vectorLeakage: 0,
    gracefulFailureRate: 0.9,
    averageOverallScore: 0.65,
  },
};

function round(value: number): number {
  return Number(value.toFixed(4));
}

function average(values: number[], fallback = 0): number {
  if (!values.length) return fallback;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function suiteStats(report: AuraEvalReport, suite: AuraEvalCaseSuite) {
  const cases = report.cases.filter((entry) => entry.suite === suite);
  const generation = cases.flatMap((entry) => entry.generation ? [entry.generation] : []);
  const agent = cases.flatMap((entry) => entry.agent ? [entry.agent] : []);
  const graceful = generation.filter((entry) => entry.metrics.gracefulFailure);
  return {
    totalCases: cases.length,
    passRate: cases.length ? round(cases.filter((entry) => entry.passed).length / cases.length) : 1,
    hallucinationRate: average(generation.map((entry) => entry.metrics.hallucinatedItemCount > 0 ? 1 : 0), 0),
    vectorLeakage: average(agent.map((entry) => entry.vectorLeakageDetected ? 1 : 0), 0),
    gracefulFailureRate: graceful.length ? average(graceful.map((entry) => entry.passed ? 1 : 0), 1) : 1,
    averageOverallScore: average(cases.map((entry) => entry.score), 1),
  };
}

export function evaluateAuraEvalGate(report: AuraEvalReport): AuraEvalGateResult {
  const failures: string[] = [];
  const suiteResults = {} as AuraEvalGateResult["suiteResults"];
  const criticalFailures = [...report.criticalFailures];
  if (criticalFailures.length) {
    failures.push(...criticalFailures.map((failure) => `Critical failure: ${failure}`));
  }

  for (const suite of Object.keys(AURA_EVAL_THRESHOLDS) as AuraEvalCaseSuite[]) {
    const threshold = AURA_EVAL_THRESHOLDS[suite];
    const stats = suiteStats(report, suite);
    const suiteFailures: string[] = [];
    if (stats.totalCases === 0) {
      suiteFailures.push(`${suite}: no cases were run`);
    }
    if (stats.passRate < threshold.passRate) {
      suiteFailures.push(`${suite}: passRate ${stats.passRate} < ${threshold.passRate}`);
    }
    if (stats.hallucinationRate > threshold.hallucinationRate) {
      suiteFailures.push(`${suite}: hallucinationRate ${stats.hallucinationRate} > ${threshold.hallucinationRate}`);
    }
    if (stats.vectorLeakage > threshold.vectorLeakage) {
      suiteFailures.push(`${suite}: vectorLeakage ${stats.vectorLeakage} > ${threshold.vectorLeakage}`);
    }
    if (threshold.gracefulFailureRate !== undefined && stats.gracefulFailureRate < threshold.gracefulFailureRate) {
      suiteFailures.push(`${suite}: gracefulFailureRate ${stats.gracefulFailureRate} < ${threshold.gracefulFailureRate}`);
    }
    if (stats.averageOverallScore < threshold.averageOverallScore) {
      suiteFailures.push(`${suite}: averageOverallScore ${stats.averageOverallScore} < ${threshold.averageOverallScore}`);
    }
    failures.push(...suiteFailures);
    suiteResults[suite] = {
      ...stats,
      threshold,
      passed: suiteFailures.length === 0,
    };
  }

  return {
    passed: failures.length === 0,
    failures,
    criticalFailures,
    suiteResults,
  };
}

export function renderAuraEvalGateMarkdown(report: AuraEvalReport, gate: AuraEvalGateResult): string {
  return [
    "# AURA Eval Gate Report",
    "",
    `Generated: ${report.timestamp}`,
    `Gate status: ${gate.passed ? "PASS" : "FAIL"}`,
    `Total cases: ${report.totalCases}`,
    `Pass rate: ${(report.passRate * 100).toFixed(1)}%`,
    "",
    "## Suite Thresholds",
    "",
    "| Suite | Cases | Pass Rate | Avg Score | Hallucination | Vector Leakage | Graceful Failure | Verdict |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...Object.entries(gate.suiteResults).map(([suite, result]) => [
      suite,
      result.totalCases,
      result.passRate,
      result.averageOverallScore,
      result.hallucinationRate,
      result.vectorLeakage,
      result.gracefulFailureRate,
      result.passed ? "pass" : "fail",
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "## Critical Failures",
    "",
    gate.criticalFailures.length ? gate.criticalFailures.map((entry) => `- ${entry}`).join("\n") : "- None",
    "",
    "## Gate Failures",
    "",
    gate.failures.length ? gate.failures.map((entry) => `- ${entry}`).join("\n") : "- None",
    "",
  ].join("\n");
}
