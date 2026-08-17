#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const ts = require("typescript");

global.__DEV__ = false;

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveEvalAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(__dirname, "..", request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  detectShoppingWardrobeGaps,
} = require(path.join(__dirname, "../src/lib/shoppingWardrobeGaps.ts"));

function item(overrides) {
  return {
    id: overrides.id,
    brand: "Test",
    category: "top",
    primaryColor: "white",
    style: "everyday",
    status: "AVAILABLE",
    wearCountSinceWash: 0,
    createdAt: 1,
    ...overrides,
  };
}

function hasGap(gaps, predicate) {
  return gaps.find(predicate);
}

{
  const gaps = detectShoppingWardrobeGaps({
    profilePreferences: {
      styleAesthetics: ["smart casual"],
      occasionPriority: ["workwear"],
      favoriteColors: ["navy"],
      avoidedColors: [],
    },
    wardrobeItems: [
      item({ id: "top-1", category: "top", style: "smart casual", primaryColor: "white" }),
      item({ id: "top-2", category: "top", style: "minimal", primaryColor: "black" }),
      item({ id: "top-3", category: "top", style: "tailored", primaryColor: "blue" }),
      item({ id: "top-4", category: "top", style: "everyday", primaryColor: "cream" }),
      item({ id: "bottom-1", category: "bottom", style: "tailored", primaryColor: "navy" }),
      item({ id: "shoe-1", category: "shoes", style: "clean sneaker", primaryColor: "white" }),
    ],
  });
  const outerwearGap = hasGap(
    gaps,
    (gap) =>
      gap.category === "outerwear" &&
      gap.priorityScore >= 75 &&
      gap.suggestedStyleTags?.some((tag) => tag.includes("layering"))
  );
  assert(outerwearGap, "Expected high-priority outerwear/layering gap");
}

{
  const gaps = detectShoppingWardrobeGaps({
    profilePreferences: {
      occasionPriority: ["work"],
      styleAesthetics: ["polished"],
      favoriteColors: ["black"],
      avoidedColors: [],
    },
    wardrobeItems: [
      item({ id: "shoe-1", category: "shoes", style: "casual sneaker", primaryColor: "white" }),
      item({ id: "shoe-2", category: "shoes", style: "canvas trainer", primaryColor: "blue" }),
      item({ id: "top-1", category: "top", style: "tailored shirt", primaryColor: "white" }),
      item({ id: "bottom-1", category: "bottom", style: "tailored trouser", primaryColor: "black" }),
    ],
  });
  const smartFootwearGap = hasGap(
    gaps,
    (gap) =>
      gap.category === "footwear" &&
      gap.type === "occasion_gap" &&
      gap.suggestedStyleTags?.includes("polished")
  );
  assert(smartFootwearGap, "Expected smart footwear gap");
}

{
  const gaps = detectShoppingWardrobeGaps({
    wardrobeItems: [
      item({ id: "summer-1", category: "top", style: "linen summer shirt", seasonTags: ["summer"] }),
      item({ id: "summer-2", category: "bottom", style: "lightweight shorts", seasonTags: ["summer"] }),
      item({ id: "summer-3", category: "shoes", style: "casual sandal", seasonTags: ["summer"] }),
    ],
  });
  const seasonalGap = hasGap(
    gaps,
    (gap) => gap.type === "season_gap" && gap.category === "outerwear" && gap.priorityScore >= 80
  );
  assert(seasonalGap, "Expected seasonal layering gap");
}

{
  const gaps = detectShoppingWardrobeGaps({
    wardrobeItems: [
      item({ id: "top-1", category: "top", style: "minimal", primaryColor: "white" }),
      item({ id: "top-2", category: "top", style: "smart casual", primaryColor: "blue" }),
      item({ id: "bottom-1", category: "bottom", style: "denim", primaryColor: "blue" }),
      item({ id: "bottom-2", category: "bottom", style: "tailored", primaryColor: "black" }),
      item({ id: "shoe-1", category: "shoes", style: "casual sneaker", primaryColor: "white" }),
      item({ id: "shoe-2", category: "shoes", style: "smart loafer", primaryColor: "black" }),
      item({ id: "outer-1", category: "outerwear", style: "layering jacket", primaryColor: "navy" }),
      item({ id: "accessory-1", category: "accessory", style: "leather belt", primaryColor: "brown" }),
    ],
  });
  assert(
    !gaps.some((gap) => gap.priorityScore >= 70),
    "Balanced closet should not produce noisy high-priority gaps"
  );
}

{
  const gaps = detectShoppingWardrobeGaps({
    profilePreferences: {
      favoriteColors: ["red", "navy"],
      avoidedColors: ["red"],
    },
    wardrobeItems: [
      item({ id: "top-1", category: "top", primaryColor: "white" }),
      item({ id: "top-2", category: "top", primaryColor: "black" }),
      item({ id: "top-3", category: "top", primaryColor: "blue" }),
      item({ id: "top-4", category: "top", primaryColor: "cream" }),
    ],
  });
  assert(
    gaps.every((gap) => !(gap.suggestedColours ?? []).includes("red")),
    "Avoided colours should never be suggested"
  );
}

{
  const gaps = detectShoppingWardrobeGaps({
    wardrobeItems: [
      item({ id: "dup-1", category: "top", primaryColor: "black", style: "minimal tee" }),
      item({ id: "dup-2", category: "top", primaryColor: "black", style: "minimal tee" }),
      item({ id: "dup-3", category: "top", primaryColor: "black", style: "minimal tee" }),
      item({ id: "dup-4", category: "top", primaryColor: "black", style: "minimal tee" }),
      item({ id: "bottom-1", category: "bottom", primaryColor: "blue", style: "denim" }),
    ],
  });
  const duplicateGap = hasGap(gaps, (gap) => gap.type === "duplicate_heavy_area");
  assert(duplicateGap, "Expected duplicate-heavy area gap");
}

console.log("shopping wardrobe gaps eval passed");
