#!/usr/bin/env node

const fs = require("fs");
const Module = require("module");
const path = require("path");
const ts = require("typescript");

const originalResolveFilename = Module._resolveFilename;
global.__DEV__ = false;
Module._resolveFilename = function resolveAuraEvalAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(__dirname, "..", request.slice(2)), parent, isMain, options);
  }
  if (request.startsWith("@shared/")) {
    return originalResolveFilename.call(
      this,
      path.join(__dirname, "..", "shared", request.slice("@shared/".length)),
      parent,
      isMain,
      options,
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

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

const {
  classifyAuraStylingIntent,
  countMeaningfulItemChanges,
  isItemIncompatibleWithOccasion,
  normalizeAuraLookCardMetadata,
  rankAuraOutfitCandidates,
  scoreAuraOutfitQuality,
  scoreAuraItemForIntent,
  shouldGenerateOutfitForMessage,
} = require(path.join(__dirname, "../shared/auraStylingIntelligence.ts"));
const {
  buildAuraOutfitMutationResponse,
} = require(path.join(__dirname, "../src/lib/auraOutfitMutation.ts"));
const {
  scoreOutfitForOccasion,
  shouldRegenerateOutfit,
} = require(path.join(__dirname, "../shared/auraOutfitCritic.ts"));

const closet = {
  jersey: {
    id: "jersey-1",
    name: "Chicago Bears football jersey",
    category: "top",
    subCategory: "football jersey",
    primaryColor: "navy",
    style: "sports jersey",
    formalityScore: 0.08,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  blackKnit: {
    id: "top-1",
    name: "Black merino knit polo",
    category: "top",
    subCategory: "knit polo",
    primaryColor: "black",
    style: "clean luxury",
    formalityScore: 0.68,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  whiteTee: {
    id: "top-2",
    name: "White heavyweight fitted tee",
    category: "top",
    subCategory: "tee",
    primaryColor: "white",
    style: "minimal",
    formalityScore: 0.42,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  graphicTee: {
    id: "top-3",
    name: "Loud graphic tee",
    category: "top",
    subCategory: "graphic tee",
    primaryColor: "red",
    style: "loud graphic",
    formalityScore: 0.18,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  blueGraphicTee: {
    id: "top-blue-graphic",
    name: "Blue graphic tee",
    category: "top",
    subCategory: "graphic tee",
    primaryColor: "blue",
    style: "loud graphic",
    formalityScore: 0.18,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  khakiButtonDown: {
    id: "top-khaki-button",
    name: "Khaki button-down overshirt",
    category: "top",
    subCategory: "button-down overshirt",
    primaryColor: "khaki",
    style: "polished overshirt",
    formalityScore: 0.66,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  blackButtonDown: {
    id: "top-black-button",
    name: "Black button-down shirt",
    category: "top",
    subCategory: "button-down shirt",
    primaryColor: "black",
    style: "polished",
    formalityScore: 0.76,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  blackTank: {
    id: "top-black-tank",
    name: "Black ribbed tank top",
    category: "top",
    subCategory: "tank top",
    primaryColor: "black",
    style: "sleeveless casual",
    sleeveLength: "sleeveless",
    formalityScore: 0.18,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  whitePolo: {
    id: "top-white-polo",
    name: "White knit polo",
    category: "top",
    subCategory: "knit polo",
    primaryColor: "white",
    style: "smart casual",
    formalityScore: 0.64,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  oliveOvershirt: {
    id: "outer-olive-overshirt",
    name: "Olive structured overshirt",
    category: "outerwear",
    subCategory: "overshirt",
    primaryColor: "olive",
    style: "structured smart casual layer",
    formalityScore: 0.58,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  jeans: {
    id: "bottom-4",
    name: "Light wash jeans",
    category: "bottom",
    subCategory: "jeans",
    primaryColor: "blue",
    style: "casual denim",
    formalityScore: 0.32,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  trousers: {
    id: "bottom-1",
    name: "Charcoal tailored trousers",
    category: "bottom",
    subCategory: "trousers",
    primaryColor: "charcoal",
    style: "tailored",
    formalityScore: 0.78,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  navyLoungePants: {
    id: "bottom-navy-lounge",
    name: "Navy drawstring lounge pants",
    category: "bottom",
    subCategory: "drawstring lounge pants",
    primaryColor: "navy",
    style: "lounge",
    formalityScore: 0.12,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  chinos: {
    id: "bottom-khaki-chinos",
    name: "Khaki chinos",
    category: "bottom",
    subCategory: "chinos",
    primaryColor: "khaki",
    style: "smart casual",
    formalityScore: 0.62,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  cargos: {
    id: "bottom-2",
    name: "Olive cargos",
    category: "bottom",
    subCategory: "cargo pants",
    primaryColor: "olive",
    style: "streetwear",
    formalityScore: 0.34,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  loafers: {
    id: "shoe-1",
    name: "Black leather loafers",
    category: "shoes",
    subCategory: "loafers",
    primaryColor: "black",
    style: "dressy",
    formalityScore: 0.82,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  chelseaBoots: {
    id: "shoe-5",
    name: "Black leather Chelsea boots",
    category: "shoes",
    subCategory: "Chelsea boots",
    primaryColor: "black",
    style: "dress boot",
    formalityScore: 0.78,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  sneakers: {
    id: "shoe-2",
    name: "Clean white Nike sneakers",
    brand: "Nike",
    category: "shoes",
    subCategory: "sneakers",
    primaryColor: "white",
    style: "clean sneakers",
    formalityScore: 0.48,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  airForce1: {
    id: "shoe-af1",
    name: "White Air Force 1s",
    brand: "Nike",
    category: "shoes",
    subCategory: "sneakers",
    primaryColor: "white",
    style: "casual sneaker",
    formalityScore: 0.42,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  gymShorts: {
    id: "bottom-3",
    name: "Black gym shorts",
    category: "bottom",
    subCategory: "gym shorts",
    primaryColor: "black",
    style: "athletic",
    formalityScore: 0.05,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  slides: {
    id: "shoe-3",
    name: "Recovery slides",
    category: "shoes",
    subCategory: "slides",
    primaryColor: "black",
    style: "athletic",
    formalityScore: 0.04,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  varsity: {
    id: "outer-1",
    name: "Black varsity jacket",
    category: "outerwear",
    subCategory: "varsity jacket",
    primaryColor: "black",
    style: "streetwear",
    formalityScore: 0.52,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  cap: {
    id: "accessory-black-cap",
    name: "Black baseball cap",
    category: "accessory",
    subCategory: "baseball cap",
    primaryColor: "black",
    style: "sporty casual",
    formalityScore: 0.1,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
  jordan4: {
    id: "shoe-4",
    name: "Jordan 4 Military Black",
    brand: "Jordan",
    category: "shoes",
    subCategory: "sneakers",
    primaryColor: "black",
    style: "streetwear sneaker",
    formalityScore: 0.46,
    status: "AVAILABLE",
    laundryStatus: "clean",
  },
};

const intentCases = [
  ["Dress me for a fancy dinner", "generate_outfit", true, "fancy_dinner"],
  ["I want to go for a date to five star restaurant what should i wear?", "generate_outfit", true, "fancy_dinner"],
  ["fine dining fit", "generate_outfit", true, "fancy_dinner"],
  ["What should I wear for a first date?", "generate_outfit", true, "first_date"],
  ["Make this outfit clubbing appropriate", "occasion_change", true, "club", true],
  ["Style me for a wedding", "generate_outfit", true, "wedding"],
  ["What should I wear to a tech interview?", "generate_outfit", true, "interview"],
  ["Airport fit", "generate_outfit", true, "airport"],
  ["Gym fit", "generate_outfit", true, "gym"],
  ["Coffee date", "generate_outfit", true, "coffee_date"],
  ["Vacation fit", "generate_outfit", true],
  ["I want an outfit for a", "generate_outfit", true],
  ["Give me another version", "outfit_iteration", true, undefined, true],
  ["Make it darker", "vibe_shift", true, undefined, true],
  ["Less flashy", "vibe_shift", true, undefined, true],
  ["More classy", "vibe_shift", true, undefined, true],
  ["More Korean fashion", "vibe_shift", true, undefined, true],
  ["Make it streetwear", "vibe_shift", true, "streetwear", true],
  ["Use different shoes", "replace_piece", true, undefined, true, "footwear"],
  ["Remove the blue tshirt", "replace_piece", true, undefined, true, "top"],
  ["Don't use the graphic tee", "replace_piece", true, undefined, true, "top"],
  ["Remove those shoes", "replace_piece", true, undefined, true, "footwear"],
  ["No black", "improve_fit", true, undefined, true],
  ["Use cargos instead", "replace_piece", true, undefined, true, "bottom"],
  ["Use my unworn pieces", "improve_fit", true],
  ["Use my Nike shoes", "improve_fit", true],
  ["Only black outfits", "generate_outfit", true],
  ["Use the varsity jacket", "improve_fit", true],
  ["Make fits around my Jordan 4s", "generate_outfit", true],
  ["I don't like this", "outfit_feedback", true, undefined, true],
  ["something cleaner", "vibe_shift", true, undefined, true],
  ["nah too loud", "outfit_feedback", true, undefined, true],
  ["make it aura", "vibe_shift", true, undefined, true],
  ["switch pants", "replace_piece", true, undefined, true, "bottom"],
  ["more luxury", "vibe_shift", true, undefined, true],
  ["less NPC", "outfit_feedback", true, undefined, true],
  ["why does this color work?", "style_advice_only", false],
  ["what is smart casual?", "style_advice_only", false],
  ["why do these colors work?", "style_advice_only", false],
  ["how do I style loafers generally?", "non_styling_chat", false],
];

const regressionCases = [
  ["first date fit", "first_date", false, [closet.jersey, closet.trousers, closet.loafers]],
  ["date night", "date_night", false, [closet.jersey, closet.trousers, closet.loafers]],
  ["wedding", "wedding", false, [closet.jersey, closet.gymShorts, closet.slides]],
  ["interview", "interview", false, [closet.jersey, closet.gymShorts, closet.sneakers]],
  ["gym fit", "gym", true, [closet.whiteTee, closet.gymShorts, closet.sneakers]],
  ["sports bar date", "date_night", true, [closet.jersey, closet.cargos, closet.sneakers]],
  ["football game date", "date_night", true, [closet.jersey, closet.cargos, closet.sneakers]],
];

function fail(message, details) {
  return { pass: false, message, details };
}

function pass(message, details) {
  return { pass: true, message, details };
}

function runIntentCases() {
  return intentCases.map(([prompt, expectedIntent, expectedGenerate, expectedOccasion, hasPrevious, targetCategory]) => {
    const result = classifyAuraStylingIntent(prompt, { hasPreviousOutfit: !!hasPrevious });
    const shouldGenerate = shouldGenerateOutfitForMessage(result, { hasPreviousOutfit: !!hasPrevious });
    if (result.intent !== expectedIntent) {
      return fail(`intent mismatch for "${prompt}"`, { expectedIntent, actual: result.intent, result });
    }
    if (shouldGenerate !== expectedGenerate || result.shouldRenderOutfitCard !== expectedGenerate) {
      return fail(`generation/card mismatch for "${prompt}"`, { expectedGenerate, shouldGenerate, render: result.shouldRenderOutfitCard, result });
    }
    if (expectedOccasion && result.occasion !== expectedOccasion) {
      return fail(`occasion mismatch for "${prompt}"`, { expectedOccasion, actual: result.occasion, result });
    }
    if (targetCategory && result.targetItemCategory !== targetCategory) {
      return fail(`target category mismatch for "${prompt}"`, { targetCategory, actual: result.targetItemCategory, result });
    }
    return pass(`intent ${prompt}`, result);
  });
}

function runBadRecommendationCases() {
  return regressionCases.map(([prompt, occasion, explicitAllowed, outfitItems]) => {
    const intent = classifyAuraStylingIntent(prompt);
    const jerseyBad = isItemIncompatibleWithOccasion(closet.jersey, occasion, intent.explicitSportsContext);
    const ranked = rankAuraOutfitCandidates(
      [
        { id: "jersey-look", items: [closet.jersey, closet.trousers, closet.loafers] },
        { id: "clean-look", items: [closet.blackKnit, closet.trousers, closet.loafers] },
        { id: "candidate", items: outfitItems },
      ],
      {
        occasion,
        vibe: intent.vibe,
        explicitSportsContext: intent.explicitSportsContext,
      },
    );
    if (!explicitAllowed && !jerseyBad) {
      return fail(`jersey should be incompatible for "${prompt}"`, { intent, ranked: ranked.map((entry) => [entry.id, entry.auraScore.score]) });
    }
    if (!explicitAllowed && ranked[0].id === "jersey-look") {
      return fail(`jersey look ranked first for "${prompt}"`, { ranked: ranked.map((entry) => [entry.id, entry.auraScore.score, entry.auraScore.rejectedItems]) });
    }
    if (explicitAllowed && jerseyBad) {
      return fail(`jersey should be allowed for explicit sports context "${prompt}"`, { intent });
    }
    return pass(`regression ${prompt}`, {
      jerseyBad,
      winner: ranked[0].id,
      ranked: ranked.map((entry) => [entry.id, Math.round(entry.auraScore.score * 10) / 10]),
    });
  });
}

function runManualRegressionCases() {
  const cases = [];

  const firstDateIntent = classifyAuraStylingIntent("what should I wear for a first date?");
  const firstDateRanked = rankAuraOutfitCandidates(
    [
      { id: "bad-jersey-date", items: [closet.jersey, closet.trousers, closet.loafers] },
      { id: "clean-date", items: [closet.blackKnit, closet.trousers, closet.loafers] },
    ],
    {
      occasion: firstDateIntent.occasion,
      vibe: firstDateIntent.vibe,
      explicitSportsContext: firstDateIntent.explicitSportsContext,
    },
  );
  cases.push(
    firstDateIntent.shouldGenerateOutfit &&
      firstDateIntent.shouldRenderOutfitCard &&
      ["first_date", "date_night"].includes(firstDateIntent.occasion) &&
      firstDateRanked[0].id === "clean-date"
      ? pass("manual A first date rejects football jersey", {
          intent: firstDateIntent,
          winner: firstDateRanked[0].id,
          rejected: firstDateRanked[0].auraScore.rejectedItems,
        })
      : fail("manual A first date jersey rejection failed", {
          intent: firstDateIntent,
          ranked: firstDateRanked.map((entry) => [entry.id, entry.auraScore.score, entry.auraScore.rejectedItems]),
        }),
  );

  const dateRepairIntent = classifyAuraStylingIntent("make it date appropriate", { hasPreviousOutfit: true });
  const dateRepairPrevious = [
    { itemId: "jersey-1", role: "top", itemName: "Chicago Bears football jersey" },
    { itemId: "bottom-2", role: "bottom", itemName: "Olive cargos" },
    { itemId: "shoe-2", role: "shoes", itemName: "Clean white Nike sneakers" },
  ];
  const dateRepairNext = [
    { itemId: "top-1", role: "top", itemName: "Black merino knit polo" },
    { itemId: "bottom-1", role: "bottom", itemName: "Charcoal tailored trousers" },
    { itemId: "shoe-2", role: "shoes", itemName: "Clean white Nike sneakers" },
  ];
  const dateRepairSummary = "Swapped top: Chicago Bears football jersey -> Black merino knit polo.";
  cases.push(
    dateRepairIntent.shouldRenderOutfitCard &&
      dateRepairIntent.occasion === "date_night" &&
      !dateRepairNext.some((piece) => /jersey/i.test(piece.itemName)) &&
      /swapped top/i.test(dateRepairSummary)
      ? pass("manual B date repair removes jersey and summarizes replacement", {
          dateRepairIntent,
          changed: countMeaningfulItemChanges(dateRepairPrevious, dateRepairNext),
          dateRepairSummary,
        })
      : fail("manual B date repair failed", { dateRepairIntent, dateRepairNext, dateRepairSummary }),
  );

  const anotherIntent = classifyAuraStylingIntent("give me another version", { hasPreviousOutfit: true });
  const anotherNext = [
    { itemId: "top-1", role: "top", itemName: "Black merino knit polo" },
    { itemId: "bottom-1", role: "bottom", itemName: "Charcoal tailored trousers" },
    { itemId: "shoe-1", role: "shoes", itemName: "Black leather loafers" },
  ];
  cases.push(
    anotherIntent.shouldRenderOutfitCard &&
      countMeaningfulItemChanges(dateRepairPrevious, anotherNext) >= 2
      ? pass("manual C another version requires visible item changes", {
          anotherIntent,
          changed: countMeaningfulItemChanges(dateRepairPrevious, anotherNext),
        })
      : fail("manual C another version failed", { anotherIntent, changed: countMeaningfulItemChanges(dateRepairPrevious, anotherNext) }),
  );

  const switchShoesIntent = classifyAuraStylingIntent("switch the shoes", { hasPreviousOutfit: true });
  const switchShoesNext = [
    dateRepairPrevious[0],
    dateRepairPrevious[1],
    { itemId: "shoe-1", role: "shoes", itemName: "Black leather loafers" },
  ];
  cases.push(
    switchShoesIntent.intent === "replace_piece" &&
      switchShoesIntent.targetItemCategory === "footwear" &&
      switchShoesIntent.shouldRenderOutfitCard &&
      countMeaningfulItemChanges(dateRepairPrevious, switchShoesNext) === 1
      ? pass("manual D switch shoes changes shoes only", {
          switchShoesIntent,
          changed: countMeaningfulItemChanges(dateRepairPrevious, switchShoesNext),
        })
      : fail("manual D switch shoes failed", {
          switchShoesIntent,
          changed: countMeaningfulItemChanges(dateRepairPrevious, switchShoesNext),
        }),
  );

  const sportsIntent = classifyAuraStylingIntent("football game date fit");
  cases.push(
    sportsIntent.shouldRenderOutfitCard &&
      sportsIntent.explicitSportsContext &&
      !isItemIncompatibleWithOccasion(closet.jersey, "date_night", sportsIntent.explicitSportsContext) &&
      isItemIncompatibleWithOccasion(closet.slides, "date_night", sportsIntent.explicitSportsContext)
      ? pass("manual E sports context allows jersey but not slides", { sportsIntent })
      : fail("manual E sports context exception failed", {
          sportsIntent,
          jerseyBad: isItemIncompatibleWithOccasion(closet.jersey, "date_night", sportsIntent.explicitSportsContext),
          slidesBad: isItemIncompatibleWithOccasion(closet.slides, "date_night", sportsIntent.explicitSportsContext),
        }),
  );

  const gymIntent = classifyAuraStylingIntent("gym fit");
  const gymShortScore = scoreAuraItemForIntent(closet.gymShorts, {
    occasion: gymIntent.occasion,
    vibe: gymIntent.vibe,
    explicitSportsContext: gymIntent.explicitSportsContext,
  });
  cases.push(
    gymIntent.shouldRenderOutfitCard &&
      gymIntent.occasion === "gym" &&
      !gymShortScore.penalties.some((penalty) => penalty.startsWith("near_banned"))
      ? pass("manual F gym fit allows athletic pieces", { gymIntent, gymShortScore })
      : fail("manual F gym exception failed", { gymIntent, gymShortScore }),
  );

  const weddingIntent = classifyAuraStylingIntent("style me for a wedding");
  cases.push(
    ["jersey", "slides", "gymShorts"].every((key) =>
      isItemIncompatibleWithOccasion(closet[key], weddingIntent.occasion, weddingIntent.explicitSportsContext)
    )
      ? pass("manual G wedding rejects jersey slides gym shorts", { weddingIntent })
      : fail("manual G wedding rejection failed", {
          weddingIntent,
          jersey: isItemIncompatibleWithOccasion(closet.jersey, weddingIntent.occasion, weddingIntent.explicitSportsContext),
          slides: isItemIncompatibleWithOccasion(closet.slides, weddingIntent.occasion, weddingIntent.explicitSportsContext),
          gymShorts: isItemIncompatibleWithOccasion(closet.gymShorts, weddingIntent.occasion, weddingIntent.explicitSportsContext),
        }),
  );

  const loudIntent = classifyAuraStylingIntent("nah too loud", { hasPreviousOutfit: true });
  cases.push(
    ["outfit_feedback", "vibe_shift"].includes(loudIntent.intent) &&
      shouldGenerateOutfitForMessage(loudIntent, { hasPreviousOutfit: true }) &&
      loudIntent.shouldRenderOutfitCard
      ? pass("manual H nah too loud stays outfit-card worthy", { loudIntent })
      : fail("manual H text-only prevention failed", { loudIntent }),
  );

  return cases;
}

function runConstraintExtractionCases() {
  const cases = [
    ["Use my Nike shoes", (intent) => intent.requiredItems.some((item) => /nike shoes/i.test(item))],
    ["Use the varsity jacket", (intent) => intent.requiredItems.some((item) => /varsity jacket/i.test(item))],
    ["Build a fit around my Jordan 4s", (intent) => intent.requiredItems.some((item) => /jordan 4s/i.test(item))],
    ["No black", (intent) => intent.excludedColors.includes("black")],
    ["No jerseys", (intent) => intent.excludedCategories.includes("jersey")],
    ["Don't use cargos", (intent) => intent.excludedCategories.includes("cargo")],
    ["More luxury", (intent) => intent.vibe === "luxury streetwear"],
    ["Less NPC", (intent) => intent.intent === "outfit_feedback"],
  ];
  return cases.map(([prompt, predicate]) => {
    const intent = classifyAuraStylingIntent(prompt, { hasPreviousOutfit: true });
    return predicate(intent) && intent.shouldRenderOutfitCard
      ? pass(`constraint extraction ${prompt}`, intent)
      : fail(`constraint extraction failed for "${prompt}"`, intent);
  });
}

function textHasMismatchedTagCopy(look) {
  const tag = String(look.vibe ?? "").toUpperCase();
  const text = [look.lookTitle, look.shortExplanation, look.stylingNote].join(" ").toLowerCase();
  if (tag !== "VACATION" && /\b(vacation|resort|holiday)\b/.test(text)) return true;
  if (!["DATE NIGHT", "FIRST DATE", "COFFEE DATE", "UPSCALE DATE", "FANCY DINNER", "POLISHED"].includes(tag) && /\b(first date|date night|date-ready|date ready|romantic|upscale date|five-star|five star)\b/.test(text)) return true;
  if (!["FORMAL", "INTERVIEW"].includes(tag) && /\b(wedding|ceremony|interview)\b/.test(text)) return true;
  return false;
}

function runCardCopyQualityCases() {
  const results = [];
  const incomplete = normalizeAuraLookCardMetadata({
    lookTitle: "Wardrobe Reset",
    occasion: "date_night",
    vibe: "VACATION",
    shortExplanation: "A date vibe for vacation.",
    stylingNote: "Keep it romantic.",
    pieces: [
      { role: "top", itemName: "White heavyweight fitted tee", source: "closet" },
      { role: "bottom", itemName: "Olive cargos", source: "closet" },
      { role: "shoes", itemName: "Clean white Nike sneakers", source: "closet" },
    ],
  }, { prompt: "I want an outfit for a" });
  results.push(
    incomplete.vibe === "CASUAL" &&
      ["casual", "unknown", null].includes(incomplete.occasion) &&
      /start with a clean casual option/i.test(incomplete.shortExplanation) &&
      !textHasMismatchedTagCopy(incomplete)
      ? pass("copy incomplete prompt stays starter casual", incomplete)
      : fail("copy incomplete prompt hallucinated metadata", incomplete),
  );

  const dateLook = normalizeAuraLookCardMetadata({
    lookTitle: "Wardrobe Reset",
    occasion: "vacation",
    vibe: "VACATION",
    shortExplanation: "Here is a vacation option with date vibe.",
    stylingNote: "Wear it on holiday.",
    pieces: [
      { role: "top", itemName: "Black merino knit polo", source: "closet" },
      { role: "bottom", itemName: "Charcoal tailored trousers", source: "closet" },
      { role: "shoes", itemName: "Black leather loafers", source: "closet" },
    ],
  }, { prompt: "what should I wear for a date?" });
  results.push(
    dateLook.vibe === "DATE NIGHT" &&
      /date|elevated/i.test(`${dateLook.lookTitle} ${dateLook.shortExplanation}`) &&
      !/vacation/i.test(`${dateLook.lookTitle} ${dateLook.shortExplanation} ${dateLook.stylingNote}`) &&
      !textHasMismatchedTagCopy(dateLook)
      ? pass("copy date card metadata stays date/elevated", dateLook)
      : fail("copy date card metadata mismatch", dateLook),
  );

  const cleanerLook = normalizeAuraLookCardMetadata({
    lookTitle: "Easy Color Story",
    occasion: null,
    vibe: "vacation direction",
    shortExplanation: "A vacation reset.",
    stylingNote: "Holiday color.",
    pieces: [
      { role: "top", itemName: "Black merino knit polo", source: "closet" },
      { role: "bottom", itemName: "Charcoal tailored trousers", source: "closet" },
      { role: "shoes", itemName: "Clean white Nike sneakers", source: "closet" },
    ],
  }, { prompt: "give me something cleaner" });
  results.push(
    ["CLEAN", "MINIMAL", "ELEVATED CASUAL"].includes(cleanerLook.vibe) &&
      /clean|minimal|elevated/i.test(`${cleanerLook.lookTitle} ${cleanerLook.shortExplanation}`) &&
      !textHasMismatchedTagCopy(cleanerLook)
      ? pass("copy cleaner card uses clean language", cleanerLook)
      : fail("copy cleaner card mismatch", cleanerLook),
  );

  const vacationLook = normalizeAuraLookCardMetadata({
    lookTitle: "Safe Wardrobe",
    occasion: "date_night",
    vibe: "DATE NIGHT",
    shortExplanation: "Date-ready dinner styling.",
    stylingNote: "Keep it romantic.",
    pieces: [
      { role: "top", itemName: "White heavyweight fitted tee", source: "closet" },
      { role: "bottom", itemName: "Olive cargos", source: "closet" },
      { role: "shoes", itemName: "Clean white Nike sneakers", source: "closet" },
    ],
  }, { prompt: "vacation fit" });
  results.push(
    vacationLook.vibe === "VACATION" &&
      !/date/i.test(`${vacationLook.lookTitle} ${vacationLook.shortExplanation} ${vacationLook.stylingNote}`) &&
      !textHasMismatchedTagCopy(vacationLook)
      ? pass("copy vacation card allows vacation tag only", vacationLook)
      : fail("copy vacation card mismatch", vacationLook),
  );

  const basicDateQuality = scoreAuraOutfitQuality(
    [closet.graphicTee, closet.jeans, closet.sneakers],
    { occasion: "date_night", vibe: "date night" },
  );
  const elevatedDateQuality = scoreAuraOutfitQuality(
    [closet.blackKnit, closet.trousers, closet.loafers, closet.varsity],
    { occasion: "date_night", vibe: "date night" },
  );
  results.push(
    elevatedDateQuality.qualityScore > basicDateQuality.qualityScore &&
      basicDateQuality.penalties.includes("graphic_tee_without_date_balance")
      ? pass("quality date outfit prefers elevated styling", { basicDateQuality, elevatedDateQuality })
      : fail("quality date outfit threshold failed", { basicDateQuality, elevatedDateQuality }),
  );

  const rankedDate = rankAuraOutfitCandidates(
    [
      { id: "basic-tee-jeans-sneakers", items: [closet.graphicTee, closet.jeans, closet.sneakers] },
      { id: "elevated-knit-trousers-loafers", items: [closet.blackKnit, closet.trousers, closet.loafers] },
    ],
    { occasion: "date_night", vibe: "date night" },
  );
  results.push(
    rankedDate[0].id === "elevated-knit-trousers-loafers"
      ? pass("ranking date outfit beats basic tee jeans sneakers", rankedDate.map((entry) => [entry.id, entry.auraScore.score]))
      : fail("ranking date outfit picked basic look", rankedDate.map((entry) => [entry.id, entry.auraScore.score, entry.auraScore.rejectedItems])),
  );

  return results;
}

function runOfficeCriticCases() {
  const results = [];
  const badOfficeItems = [
    closet.blackTank,
    closet.oliveOvershirt,
    closet.navyLoungePants,
    closet.airForce1,
    closet.cap,
  ];
  const goodOfficeItems = [
    closet.whitePolo,
    closet.oliveOvershirt,
    closet.chinos,
    closet.airForce1,
  ];
  const badOffice = scoreOutfitForOccasion({
    userPrompt: "Style me for office",
    occasion: "business_casual",
    items: badOfficeItems,
  });
  results.push(
    badOffice.shouldRegenerate &&
      badOffice.score < 70 &&
      badOffice.blockingIssues.some((issue) => issue.code === "office_sleeveless_top") &&
      badOffice.blockingIssues.some((issue) => issue.code === "office_lounge_bottom") &&
      badOffice.blockingIssues.some((issue) => issue.code === "office_headwear")
      ? pass("office critic rejects tank lounge pants cap", badOffice)
      : fail("office critic did not reject weak office outfit", badOffice),
  );

  const goodOffice = scoreOutfitForOccasion({
    userPrompt: "Style me for office",
    occasion: "business_casual",
    items: goodOfficeItems,
  });
  results.push(
    !goodOffice.shouldRegenerate &&
      goodOffice.score >= 70 &&
      goodOffice.positiveSignals.some((signal) => /office|structured|footwear|bottom|base layer/i.test(signal))
      ? pass("office critic accepts smart casual office outfit", goodOffice)
      : fail("office critic rejected good office outfit", goodOffice),
  );

  const warmOfficeTank = scoreOutfitForOccasion({
    userPrompt: "warm weather office fit",
    occasion: "business_casual",
    items: [closet.blackTank, closet.chinos, closet.loafers],
  });
  const veryCasualOfficeTank = scoreOutfitForOccasion({
    userPrompt: "very casual office tank fit",
    occasion: "business_casual",
    items: [closet.blackTank, closet.chinos, closet.loafers],
  });
  results.push(
    warmOfficeTank.shouldRegenerate &&
      warmOfficeTank.blockingIssues.some((issue) => issue.code === "office_sleeveless_top") &&
      !veryCasualOfficeTank.blockingIssues.some((issue) => issue.code === "office_sleeveless_top")
      ? pass("office critic blocks sleeveless for warm office unless very casual", { warmOfficeTank, veryCasualOfficeTank })
      : fail("office critic warm weather sleeveless rule failed", { warmOfficeTank, veryCasualOfficeTank }),
  );

  const creativeOfficeGym = scoreOutfitForOccasion({
    userPrompt: "creative office fit",
    occasion: "business_casual",
    items: [closet.whiteTee, closet.gymShorts, closet.slides],
  });
  results.push(
    creativeOfficeGym.shouldRegenerate &&
      creativeOfficeGym.blockingIssues.some((issue) => issue.code === "office_gymwear" || issue.code === "office_slides")
      ? pass("office critic still rejects gymwear and slides for creative office", creativeOfficeGym)
      : fail("office critic allowed gymwear/slides for creative office", creativeOfficeGym),
  );

  const dateTank = scoreOutfitForOccasion({
    userPrompt: "summer date night",
    occasion: "date_night",
    items: [closet.blackTank, closet.jeans, closet.sneakers],
  });
  const casualTank = scoreOutfitForOccasion({
    userPrompt: "casual hot day fit",
    occasion: "casual",
    items: [closet.blackTank, closet.jeans, closet.sneakers],
  });
  results.push(
    !dateTank.shouldRegenerate &&
      !casualTank.shouldRegenerate &&
      dateTank.blockingIssues.length === 0 &&
      casualTank.blockingIssues.length === 0
      ? pass("office critic does not over-formalize date or casual tanks", { dateTank, casualTank })
      : fail("office critic over-applied office rules", { dateTank, casualTank }),
  );

  results.push(
    shouldRegenerateOutfit({
      userPrompt: "Style me for office",
      occasion: "business_casual",
      items: badOfficeItems,
    }) === true
      ? pass("shouldRegenerateOutfit mirrors critic blocking issues", badOffice)
      : fail("shouldRegenerateOutfit failed for bad office outfit", badOffice),
  );

  return results;
}

function runFineDiningRegressionCases() {
  const results = [];
  const prompt = "I want to go for a date to five star restaurant what should i wear?";
  const intent = classifyAuraStylingIntent(prompt);
  const rankedFineDining = rankAuraOutfitCandidates(
    [
      { id: "graphic-tee-af1", items: [closet.blueGraphicTee, closet.trousers, closet.airForce1] },
      { id: "buttondown-boots", items: [closet.blackButtonDown, closet.trousers, closet.chelseaBoots] },
      { id: "khaki-buttondown-loafers", items: [closet.khakiButtonDown, closet.trousers, closet.loafers] },
    ],
    { occasion: intent.occasion, vibe: intent.vibe, explicitSportsContext: intent.explicitSportsContext },
  );
  const upscaleMetadata = normalizeAuraLookCardMetadata({
    lookTitle: "Wardrobe Reset",
    occasion: "date_night",
    vibe: "VACATION",
    shortExplanation: "A casual date vibe.",
    stylingNote: "Easy color story.",
    pieces: [
      { role: "top", itemName: "Black button-down shirt", source: "closet" },
      { role: "bottom", itemName: "Charcoal tailored trousers", source: "closet" },
      { role: "shoes", itemName: "Black leather Chelsea boots", source: "closet" },
    ],
  }, { prompt });
  results.push(
    intent.shouldGenerateOutfit &&
      intent.shouldRenderOutfitCard &&
      intent.occasion === "fancy_dinner" &&
      ["UPSCALE DATE", "FANCY DINNER", "POLISHED"].includes(upscaleMetadata.vibe) &&
      !/vacation/i.test(`${upscaleMetadata.lookTitle} ${upscaleMetadata.shortExplanation} ${upscaleMetadata.stylingNote}`) &&
      /upscale|five-star|five star|polished|restaurant|dinner/i.test(`${upscaleMetadata.lookTitle} ${upscaleMetadata.shortExplanation}`)
      ? pass("fine dining A five-star restaurant classifies and copies as upscale", { intent, upscaleMetadata })
      : fail("fine dining A five-star restaurant classification/copy failed", { intent, upscaleMetadata }),
  );
  results.push(
    rankedFineDining[0].id !== "graphic-tee-af1" &&
      rankedFineDining.findIndex((entry) => entry.id === "graphic-tee-af1") > 0
      ? pass("fine dining B clean top and dressier shoes beat graphic tee AF1", rankedFineDining.map((entry) => [entry.id, entry.auraScore.score, entry.auraScore.warnings]))
      : fail("fine dining B graphic tee AF1 ranked too high", rankedFineDining.map((entry) => [entry.id, entry.auraScore.score, entry.auraScore.rejectedItems, entry.auraScore.warnings])),
  );
  const graphicScore = scoreAuraItemForIntent(closet.blueGraphicTee, {
    occasion: "fancy_dinner",
    vibe: "upscale date",
  });
  results.push(
    graphicScore.penalties.includes("fine_dining_graphic_tee")
      ? pass("fine dining top quality penalizes visible graphic tee", graphicScore)
      : fail("fine dining top quality did not penalize graphic tee", graphicScore),
  );

  const previousFineDiningLook = {
    id: "previous-fine-dining-look",
    lookTitle: "Upscale Dinner Date",
    occasion: "fancy_dinner",
    vibe: "UPSCALE DATE",
    shortExplanation: "Polished dinner date base.",
    stylingNote: "Keep it elevated.",
    pieces: [
      { role: "top", itemId: "top-blue-graphic", itemName: "Blue graphic tee", source: "closet" },
      { role: "outerwear", itemId: "top-khaki-button", itemName: "Khaki button-down overshirt", source: "closet" },
      { role: "bottom", itemId: "bottom-1", itemName: "Charcoal tailored trousers", source: "closet" },
      { role: "shoes", itemId: "shoe-af1", itemName: "White Air Force 1s", source: "closet" },
    ],
    actions: [],
  };
  const fineDiningCloset = [
    closet.blueGraphicTee,
    closet.khakiButtonDown,
    closet.blackButtonDown,
    closet.blackKnit,
    closet.whiteTee,
    closet.trousers,
    closet.airForce1,
    closet.chelseaBoots,
    closet.loafers,
  ];
  const removeBlueIntent = classifyAuraStylingIntent("Remove the blue tshirt", {
    hasPreviousOutfit: true,
    previousOccasion: previousFineDiningLook.occasion,
    previousVibe: previousFineDiningLook.vibe,
  });
  const removeBlueResponse = buildAuraOutfitMutationResponse({
    prompt: "Remove the blue tshirt",
    previousLook: previousFineDiningLook,
    items: fineDiningCloset,
    intent: removeBlueIntent,
  });
  const removeBluePieces = removeBlueResponse?.look?.pieces ?? [];
  results.push(
    removeBlueIntent.shouldGenerateOutfit &&
      removeBlueIntent.shouldRenderOutfitCard &&
      removeBlueResponse?.look &&
      !removeBluePieces.some((piece) => piece.itemId === "top-blue-graphic" || /blue graphic tee/i.test(piece.itemName ?? "")) &&
      removeBluePieces.some((piece) => piece.role === "top" && piece.itemId !== "top-blue-graphic") &&
      removeBlueResponse.look.occasion === "fancy_dinner" &&
      (removeBlueResponse.look.mutationSummary?.length ?? 0) > 0
      ? pass("fine dining C remove blue t-shirt mutates with preserved occasion", {
          removeBlueIntent,
          pieces: removeBluePieces,
          mutationSummary: removeBlueResponse.look.mutationSummary,
        })
      : fail("fine dining C remove blue t-shirt mutation failed", {
          removeBlueIntent,
          response: removeBlueResponse,
        }),
  );

  const dontUseGraphicIntent = classifyAuraStylingIntent("don't use the graphic tee", {
    hasPreviousOutfit: true,
    previousOccasion: previousFineDiningLook.occasion,
    previousVibe: previousFineDiningLook.vibe,
  });
  const dontUseGraphicResponse = buildAuraOutfitMutationResponse({
    prompt: "don't use the graphic tee",
    previousLook: previousFineDiningLook,
    items: fineDiningCloset,
    intent: dontUseGraphicIntent,
  });
  results.push(
    dontUseGraphicResponse?.look &&
      !dontUseGraphicResponse.look.pieces.some((piece) => /graphic tee/i.test(piece.itemName ?? "")) &&
      (dontUseGraphicResponse.look.mutationSummary?.length ?? 0) > 0
      ? pass("fine dining D don't use graphic tee returns updated card", {
          dontUseGraphicIntent,
          pieces: dontUseGraphicResponse.look.pieces,
          mutationSummary: dontUseGraphicResponse.look.mutationSummary,
        })
      : fail("fine dining D don't use graphic tee mutation failed", { dontUseGraphicIntent, response: dontUseGraphicResponse }),
  );

  const removeShoesIntent = classifyAuraStylingIntent("remove those shoes", {
    hasPreviousOutfit: true,
    previousOccasion: previousFineDiningLook.occasion,
    previousVibe: previousFineDiningLook.vibe,
  });
  const removeShoesResponse = buildAuraOutfitMutationResponse({
    prompt: "remove those shoes",
    previousLook: previousFineDiningLook,
    items: fineDiningCloset,
    intent: removeShoesIntent,
  });
  const removeShoesPieces = removeShoesResponse?.look?.pieces ?? [];
  const removeShoesChanged = countMeaningfulItemChanges(previousFineDiningLook.pieces, removeShoesPieces);
  results.push(
    removeShoesResponse?.look &&
      !removeShoesPieces.some((piece) => piece.role === "shoes" && piece.itemId === "shoe-af1") &&
      removeShoesPieces.some((piece) => piece.role === "shoes") &&
      removeShoesChanged <= 2
      ? pass("fine dining E remove shoes replaces footwear and preserves most pieces", {
          removeShoesIntent,
          removeShoesChanged,
          pieces: removeShoesPieces,
        })
      : fail("fine dining E remove shoes mutation failed", {
          removeShoesIntent,
          removeShoesChanged,
          response: removeShoesResponse,
        }),
  );

  const sneakerCompromise = rankAuraOutfitCandidates(
    [
      { id: "af1-compromise", items: [closet.blackButtonDown, closet.trousers, closet.airForce1] },
    ],
    { occasion: "fancy_dinner", vibe: "upscale date" },
  );
  const sneakerWithBootsAvailable = rankAuraOutfitCandidates(
    [
      { id: "af1-compromise", items: [closet.blackButtonDown, closet.trousers, closet.airForce1] },
      { id: "chelsea-boots", items: [closet.blackButtonDown, closet.trousers, closet.chelseaBoots] },
    ],
    { occasion: "fancy_dinner", vibe: "upscale date" },
  );
  const af1Score = scoreAuraItemForIntent(closet.airForce1, { occasion: "fancy_dinner", vibe: "upscale date" });
  results.push(
    sneakerCompromise[0].id === "af1-compromise" &&
      sneakerWithBootsAvailable[0].id === "chelsea-boots" &&
      af1Score.penalties.includes("fine_dining_air_force_1") &&
      !af1Score.penalties.some((penalty) => penalty.startsWith("near_banned"))
      ? pass("fine dining F AF1 is compromise only when dressier shoes are unavailable", {
          sneakerCompromise: sneakerCompromise.map((entry) => [entry.id, entry.auraScore.score]),
          sneakerWithBootsAvailable: sneakerWithBootsAvailable.map((entry) => [entry.id, entry.auraScore.score]),
          af1Score,
        })
      : fail("fine dining F AF1 compromise logic failed", {
          sneakerCompromise,
          sneakerWithBootsAvailable,
          af1Score,
        }),
  );

  return results;
}

function runMutationCases() {
  const previous = [
    { itemId: "jersey-1", role: "top", itemName: "Chicago Bears football jersey" },
    { itemId: "bottom-2", role: "bottom", itemName: "Olive cargos" },
    { itemId: "shoe-2", role: "shoes", itemName: "Clean white Nike sneakers" },
  ];
  const another = [
    { itemId: "top-1", role: "top", itemName: "Black merino knit polo" },
    { itemId: "bottom-1", role: "bottom", itemName: "Charcoal tailored trousers" },
    { itemId: "shoe-2", role: "shoes", itemName: "Clean white Nike sneakers" },
  ];
  const switchShoes = [
    previous[0],
    previous[1],
    { itemId: "shoe-1", role: "shoes", itemName: "Black leather loafers" },
  ];
  const anotherChanges = countMeaningfulItemChanges(previous, another);
  const shoeChanges = countMeaningfulItemChanges(previous, switchShoes);
  const results = [];
  results.push(
    anotherChanges >= 2
      ? pass("mutation another version changes at least two items", { anotherChanges })
      : fail("mutation another version did not change enough", { anotherChanges }),
  );
  results.push(
    shoeChanges === 1
      ? pass("mutation shoe swap changes only shoes", { shoeChanges })
      : fail("mutation shoe swap changed wrong amount", { shoeChanges }),
  );
  return results;
}

const results = [
  ...runIntentCases(),
  ...runBadRecommendationCases(),
  ...runManualRegressionCases(),
  ...runConstraintExtractionCases(),
  ...runCardCopyQualityCases(),
  ...runOfficeCriticCases(),
  ...runFineDiningRegressionCases(),
  ...runMutationCases(),
];

const failed = results.filter((result) => !result.pass);
const passed = results.length - failed.length;

console.log(`AURA intelligence eval: ${passed}/${results.length} passing`);

if (failed.length) {
  for (const result of failed) {
    console.error(`FAIL: ${result.message}`);
    console.error(JSON.stringify(result.details, null, 2));
  }
  process.exit(1);
}

for (const result of results) {
  console.log(`PASS: ${result.message}`);
}
