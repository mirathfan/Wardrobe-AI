#!/usr/bin/env node

const { runAuraEvalCli } = require("../lib/functions/src/ai/wardrobeIntelligence/evals/evalRunner.js");

runAuraEvalCli(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
