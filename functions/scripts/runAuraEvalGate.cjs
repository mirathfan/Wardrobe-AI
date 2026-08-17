#!/usr/bin/env node

const fs = require("fs/promises");
const path = require("path");
const { runAuraEvals } = require("../lib/functions/src/ai/wardrobeIntelligence/evals/evalRunner.js");
const {
  evaluateAuraEvalGate,
  renderAuraEvalGateMarkdown,
} = require("../lib/functions/src/ai/wardrobeIntelligence/evals/evalThresholds.js");

async function main() {
  const report = await runAuraEvals({
    caseSuites: ["standard", "hard"],
    taskSuites: ["retrieval", "generation", "agent"],
  });
  const gate = evaluateAuraEvalGate(report);
  const jsonPath = path.resolve(process.cwd(), "reports/aura-eval-gate-report.json");
  const markdownPath = path.resolve(process.cwd(), "reports/aura-eval-gate-report.md");
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify({ report, gate }, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderAuraEvalGateMarkdown(report, gate), "utf8");
  console.log(`AURA eval gate ${gate.passed ? "passed" : "failed"}.`);
  console.log(`JSON report: ${jsonPath}`);
  console.log(`Markdown report: ${markdownPath}`);
  if (!gate.passed) {
    console.error(gate.failures.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
