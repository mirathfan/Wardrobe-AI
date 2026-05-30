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
  generateShoppingRecommendations,
} = require(path.join(__dirname, "../src/lib/shoppingRecommendationScoring.ts"));

function product(overrides) {
  return {
    id: "product",
    title: "Product",
    url: "https://example.com/product",
    category: "tops",
    colours: [],
    sizesAvailable: [],
    styleTags: [],
    seasonTags: [],
    occasionTags: [],
    ...overrides,
  };
}

function recommendationById(recommendations, id) {
  return recommendations.find((recommendation) => recommendation.product.id === id);
}

function scoreFor(input, id) {
  const recommendation = recommendationById(generateShoppingRecommendations(input), id);
  assert(recommendation, `Expected recommendation for ${id}`);
  return recommendation.score;
}

const baseProfile = {
  budgetPreference: "budget",
  favoriteColors: ["navy"],
  avoidedColors: [],
  styleAesthetics: [],
  stylePreferences: {
    preferredStyles: [],
    favoriteColors: [],
    avoidedColors: [],
    preferredBrands: [],
  },
  defaultSizes: {
    tops: "M",
    shoes: "10",
  },
};

{
  const recommendations = generateShoppingRecommendations({
    profilePreferences: baseProfile,
    shoppingProducts: [
      product({ id: "in-budget", title: "Cotton tee", price: 45 }),
      product({ id: "premium", title: "Designer tee", price: 300 }),
    ],
  });
  assert.strictEqual(recommendations[0].product.id, "in-budget");
  assert(recommendationById(recommendations, "in-budget").reasons.includes("within_budget"));
}

{
  const profilePreferences = { ...baseProfile, avoidedColors: ["red"] };
  const redScore = scoreFor(
    {
      profilePreferences,
      shoppingProducts: [product({ id: "red", colours: ["red"] })],
    },
    "red"
  );
  const blueScore = scoreFor(
    {
      profilePreferences,
      shoppingProducts: [product({ id: "blue", colours: ["blue"] })],
    },
    "blue"
  );
  assert(redScore < blueScore, "Avoided colour should downrank matching products");
}

{
  const profilePreferences = { ...baseProfile, styleAesthetics: ["minimal"] };
  const minimalScore = scoreFor(
    {
      profilePreferences,
      shoppingProducts: [product({ id: "minimal", styleTags: ["minimal"] })],
    },
    "minimal"
  );
  const loudScore = scoreFor(
    {
      profilePreferences,
      shoppingProducts: [product({ id: "loud", styleTags: ["maximal graphic"] })],
    },
    "loud"
  );
  assert(minimalScore > loudScore, "Preferred style should boost matching products");
}

{
  const recommendations = generateShoppingRecommendations({
    shoppingProducts: [
      product({ id: "outerwear", category: "outerwear", title: "Navy chore jacket" }),
      product({ id: "top", category: "tops", title: "White tee" }),
    ],
    wardrobeGaps: [
      {
        id: "outerwear-gap",
        type: "missing_layer",
        category: "outerwear",
        priorityScore: 80,
        explanation: "Needs a layer.",
        suggestedCategories: ["outerwear"],
        suggestedColours: ["navy"],
        suggestedStyleTags: ["casual"],
        source: "eval",
      },
    ],
  });
  assert.strictEqual(recommendations[0].product.id, "outerwear");
  assert(recommendations[0].reasons.includes("fills_wardrobe_gap"));
}

{
  const wardrobeItems = [
    {
      id: "owned-top",
      brand: "Owned",
      category: "top",
      primaryColor: "black",
      style: "minimal",
      status: "AVAILABLE",
      wearCountSinceWash: 0,
      createdAt: 1,
    },
  ];
  const duplicateScore = scoreFor(
    {
      wardrobeItems,
      shoppingProducts: [
        product({
          id: "duplicate",
          category: "tops",
          colours: ["black"],
          styleTags: ["minimal"],
        }),
      ],
    },
    "duplicate"
  );
  const freshScore = scoreFor(
    {
      wardrobeItems,
      shoppingProducts: [
        product({
          id: "fresh",
          category: "bottoms",
          colours: ["navy"],
          styleTags: ["minimal"],
        }),
      ],
    },
    "fresh"
  );
  assert(duplicateScore < freshScore, "Owned-similar products should be downranked");
}

{
  const feedback = [
    {
      id: "dismissed-feedback",
      userId: "user",
      productId: "dismissed",
      action: "dismissed",
      createdAt: 2,
    },
  ];
  const recommendations = generateShoppingRecommendations({
    feedback,
    shoppingProducts: [
      product({ id: "dismissed", title: "Dismissed product" }),
      product({ id: "other", title: "Other product" }),
    ],
  });
  assert.strictEqual(recommendations[0].product.id, "other");
}

{
  const recommendations = generateShoppingRecommendations({
    feedback: [
      {
        id: "purchased-feedback",
        userId: "user",
        productId: "purchased",
        action: "purchased",
        createdAt: 3,
      },
    ],
    shoppingProducts: [
      product({ id: "purchased", title: "Purchased product" }),
      product({ id: "available", title: "Available product" }),
    ],
  });
  assert(!recommendationById(recommendations, "purchased"));
  assert(recommendationById(recommendations, "available"));
}

{
  const recommendations = generateShoppingRecommendations({
    shoppingProducts: [
      product({ id: "b-product", title: "Beta" }),
      product({ id: "a-product", title: "Alpha" }),
      product({ id: "c-product", title: "Alpha" }),
    ],
  });
  assert.deepStrictEqual(
    recommendations.map((recommendation) => recommendation.product.id),
    ["a-product", "c-product", "b-product"]
  );
}

console.log("shopping recommendation scoring eval passed");
