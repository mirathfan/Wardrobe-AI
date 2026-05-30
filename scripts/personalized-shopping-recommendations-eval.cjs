#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const Module = require("module");
const path = require("path");
const ts = require("typescript");

global.__DEV__ = false;

process.env.EXPO_PUBLIC_FIREBASE_API_KEY ??= "AIzaAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "example.firebaseapp.com";
process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ??= "example-project";
process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ??= "example.appspot.com";
process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??= "123456789";
process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??= "1:123456789:web:abcdef";

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
  buildPersonalizedShoppingRecommendations,
  getCuratedFallbackShoppingProducts,
  productOptionToShoppingProduct,
} = require(path.join(__dirname, "../src/lib/productRecommendations.ts"));

function wardrobeItem(overrides) {
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

function shoppingProduct(overrides) {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    url: `https://example.com/${overrides.id}`,
    category: "tops",
    colours: [],
    sizesAvailable: [],
    styleTags: [],
    seasonTags: [],
    occasionTags: [],
    ...overrides,
  };
}

const adapted = productOptionToShoppingProduct({
  id: "live-option",
  title: "Live option",
  brand: "Brand",
  merchant: "Merchant",
  productUrl: "https://example.com/live-option",
  tier: "mid",
  source: "live",
  affiliateEligible: false,
});

assert.strictEqual(adapted.id, "live-option");
assert.strictEqual(adapted.providerProductId, "live-option");
assert.strictEqual(adapted.url, "https://example.com/live-option");
assert.strictEqual(adapted.category, "unknown");

const curatedProducts = getCuratedFallbackShoppingProducts();
assert(curatedProducts.length > 0, "Expected local curated fallback products");
assert(
  curatedProducts.every((product) => product.source === "curated_fallback"),
  "Curated products must be marked as fallback"
);

const candidates = buildPersonalizedShoppingRecommendations({
  wardrobeItems: [
    wardrobeItem({ id: "top-1", category: "top", style: "smart casual", primaryColor: "white" }),
    wardrobeItem({ id: "top-2", category: "top", style: "tailored", primaryColor: "blue" }),
    wardrobeItem({ id: "top-3", category: "top", style: "minimal", primaryColor: "black" }),
    wardrobeItem({ id: "bottom-1", category: "bottom", style: "tailored trouser", primaryColor: "navy" }),
    wardrobeItem({ id: "shoe-1", category: "shoes", style: "clean sneaker", primaryColor: "white" }),
  ],
  profilePreferences: {
    styleAesthetics: ["smart casual"],
    occasionPriority: ["workwear"],
    favoriteColors: ["navy", "black"],
    avoidedColors: [],
  },
  context: {
    sourceSurface: "home",
  },
  limit: 5,
  includeDebug: true,
});

assert(candidates.length > 0, "Expected personalized candidates");
assert(candidates.length <= 5, "Expected limit to be applied");
assert(
  candidates.some(
    (candidate) =>
      candidate.product.category === "outerwear" &&
      candidate.reasons.includes("fills_wardrobe_gap")
  ),
  "Expected an outerwear candidate boosted by detected wardrobe gaps"
);
assert(
  candidates.every((candidate) => candidate.product.source === "curated_fallback"),
  "Expected candidates to come from local curated fallback products"
);

const feedbackFilteredCandidates = buildPersonalizedShoppingRecommendations({
  feedback: [
    {
      id: "dismissed-feedback",
      userId: "user",
      productId: "dismissed-product",
      action: "dismissed",
      createdAt: 3,
    },
    {
      id: "purchased-feedback",
      userId: "user",
      productId: "purchased-product",
      action: "purchased",
      createdAt: 4,
    },
  ],
  shoppingProducts: [
    shoppingProduct({ id: "dismissed-product", title: "Dismissed product" }),
    shoppingProduct({ id: "purchased-product", title: "Purchased product" }),
    shoppingProduct({ id: "visible-product", title: "Visible product" }),
  ],
  context: {
    sourceSurface: "home",
    limit: 3,
  },
});
assert.deepStrictEqual(
  feedbackFilteredCandidates.map((candidate) => candidate.product.id),
  ["visible-product"],
  "Personalized bridge should hide exact dismissed and purchased products"
);

const latestFeedbackCandidates = buildPersonalizedShoppingRecommendations({
  feedback: [
    {
      id: "old-dismissed-feedback",
      userId: "user",
      productId: "changed-mind-product",
      action: "dismissed",
      createdAt: 1,
    },
    {
      id: "new-saved-feedback",
      userId: "user",
      productId: "changed-mind-product",
      action: "saved",
      createdAt: 2,
    },
  ],
  shoppingProducts: [
    shoppingProduct({ id: "changed-mind-product", title: "Changed mind product" }),
  ],
  context: {
    sourceSurface: "home",
  },
});
assert.strictEqual(
  latestFeedbackCandidates[0]?.product.id,
  "changed-mind-product",
  "Latest saved feedback should override an older dismissal"
);

console.log("personalized shopping recommendations eval passed");
