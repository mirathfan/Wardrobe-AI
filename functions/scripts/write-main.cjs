const fs = require("node:fs");
const path = require("node:path");

const libDir = path.join(__dirname, "..", "lib");
const deployEntry = path.join(libDir, "functions", "src", "index.js");
const mainEntry = path.join(libDir, "index.js");

if (!fs.existsSync(deployEntry)) {
  throw new Error(`Missing compiled functions entry: ${deployEntry}`);
}

fs.writeFileSync(
  mainEntry,
  [
    '"use strict";',
    'module.exports = require("./functions/src/index.js");',
    "",
  ].join("\n"),
);
