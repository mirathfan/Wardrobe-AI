#!/usr/bin/env node

const { runAuraEvalCompareCli } = require("../lib/functions/src/ai/wardrobeIntelligence/evals/evalComparison.js");

runAuraEvalCompareCli(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
