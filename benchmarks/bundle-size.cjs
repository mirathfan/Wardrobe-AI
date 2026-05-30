#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const repoRoot = path.resolve(__dirname, "..");
const exportDir = process.argv[2]
  ? path.resolve(repoRoot, process.argv[2])
  : path.join(__dirname, "results", "expo-web-export");
const outDir = path.join(__dirname, "results");
fs.mkdirSync(outDir, { recursive: true });

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out.sort();
}

const files = walk(exportDir).map((file) => {
  const data = fs.readFileSync(file);
  return {
    file: path.relative(exportDir, file),
    bytes: data.length,
    gzipBytes: zlib.gzipSync(data).length,
  };
});

const report = {
  measuredAt: new Date().toISOString(),
  exportDir: path.relative(repoRoot, exportDir),
  totalFiles: files.length,
  totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
  totalGzipBytes: files.reduce((sum, file) => sum + file.gzipBytes, 0),
  javascript: files.filter((file) => file.file.endsWith(".js")),
  largestFiles: [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 25),
};

const jsonPath = path.join(outDir, "bundle-size.json");
const mdPath = path.join(outDir, "bundle-size.md");
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(
  mdPath,
  [
    "# Expo Web Bundle Size",
    "",
    `Generated: ${report.measuredAt}`,
    "",
    `Export directory: \`${report.exportDir}\``,
    "",
    `Total files: ${report.totalFiles}`,
    `Total size: ${(report.totalBytes / 1024 / 1024).toFixed(2)} MB raw / ${(report.totalGzipBytes / 1024 / 1024).toFixed(2)} MB gzip`,
    "",
    "## JavaScript Bundles",
    "",
    "| file | raw | gzip |",
    "| --- | ---: | ---: |",
    ...report.javascript.map((file) =>
      `| \`${file.file}\` | ${(file.bytes / 1024 / 1024).toFixed(2)} MB | ${(file.gzipBytes / 1024 / 1024).toFixed(2)} MB |`
    ),
    "",
    "## Largest Files",
    "",
    "| file | raw KB | gzip KB |",
    "| --- | ---: | ---: |",
    ...report.largestFiles.map((file) =>
      `| \`${file.file}\` | ${(file.bytes / 1024).toFixed(1)} | ${(file.gzipBytes / 1024).toFixed(1)} |`
    ),
    "",
  ].join("\n"),
);

console.log(`Wrote ${path.relative(repoRoot, jsonPath)}`);
console.log(`Wrote ${path.relative(repoRoot, mdPath)}`);
