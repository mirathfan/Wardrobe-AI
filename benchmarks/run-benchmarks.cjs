#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..");
const resultsDir = path.join(__dirname, "results");
fs.mkdirSync(resultsDir, { recursive: true });

global.__DEV__ = false;

const originalLoad = Module._load;
const originalJs = require.extensions[".js"];

function canonicalCategory(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (/(dress|jumpsuit|romper|matching set|one piece)/.test(raw)) return "one_piece";
  if (/(outerwear|jacket|coat|hoodie|blazer|cardigan|overshirt|parka|trench|bomber)/.test(raw)) return "outerwear";
  if (/(bottom|pants|trousers|jeans|shorts|joggers|skirt|cargo|chinos)/.test(raw)) return "bottom";
  if (/(shoe|shoes|footwear|sneaker|boot|loafer|heel|sandal|slide|derby|oxford)/.test(raw)) return "shoes";
  if (/(accessory|cap|hat|watch|sunglasses|glasses|belt|bag|necklace|bracelet|ring|earrings|scarf|perfume)/.test(raw)) return "accessory";
  return "top";
}

function normalizeLaundryStatus(item) {
  const raw = String(item?.laundryStatus ?? "").trim().toLowerCase();
  if (raw === "clean" || raw === "needs_wash" || raw === "in_laundry") return raw;
  const legacy = String(item?.status ?? "").trim().toUpperCase();
  if (legacy === "IN_LAUNDRY") return "in_laundry";
  if (legacy === "WORN") return "needs_wash";
  const wears = Number(item?.wearCountSinceWash ?? 0);
  return Number.isFinite(wears) && wears >= 3 ? "needs_wash" : "clean";
}

const itemModuleStub = {
  MAX_WEARS_BEFORE_WASH: 2,
  normalizeLaundryStatus,
  legacyStatusForLaundryStatus: (status) =>
    status === "in_laundry" ? "IN_LAUNDRY" : status === "needs_wash" ? "WORN" : "AVAILABLE",
  isItemClean: (item) => normalizeLaundryStatus(item) === "clean",
  isItemInLaundry: (item) => normalizeLaundryStatus(item) === "in_laundry",
  toCanonicalCategory: canonicalCategory,
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (
    request === "@/src/lib/items" ||
    request === "./items" && parent?.filename?.endsWith(`${path.sep}src${path.sep}lib${path.sep}outfitGenerator.ts`) ||
    request === "@/src/lib/items" ||
    request.endsWith("/src/lib/items")
  ) {
    return itemModuleStub;
  }

  if (request === "firebase-admin/firestore") {
    return {
      FieldValue: { serverTimestamp: () => ({ __benchmarkServerTimestamp: true }) },
      Firestore: class Firestore {},
      Timestamp: { fromMillis: (value) => ({ toMillis: () => value }) },
      getFirestore: () => ({}),
    };
  }
  if (request === "firebase-admin/app") {
    return { getApps: () => [], initializeApp: () => ({}) };
  }
  if (request === "firebase-admin/auth") {
    return { getAuth: () => ({ verifyIdToken: async () => ({ uid: "benchmark-user" }) }) };
  }
  if (request === "firebase-functions/v2") {
    return { logger: { info() {}, warn() {}, error() {}, debug() {} } };
  }
  if (request === "firebase-functions/v2/https") {
    class HttpsError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }
    return { HttpsError, onCall: () => ({}), onRequest: () => ({}) };
  }
  if (request === "firebase/functions") {
    return {
      getFunctions: () => ({}),
      httpsCallable: () => async () => ({
        data: {
          ok: true,
          data: {
            presentation: "chat",
            title: "AURA",
            reply: "Synthetic fallback response.",
            reason: "",
            outfitItems: [],
            ownedPieces: [],
            recommendedAdditions: [],
            swapSuggestion: "",
            missingPieces: [],
            upgradeSuggestions: [],
            upgradeSuggestionItems: [],
            chips: [],
            look: null,
            lookOptions: [],
          },
        },
      }),
    };
  }
  if (request === "react-native") {
    return { Platform: { OS: "web", select: (values) => values.web ?? values.default } };
  }
  if (request === "@/src/lib/firebase") {
    return {
      app: {},
      auth: {
        currentUser: {
          getIdToken: async () => "benchmark-token",
        },
      },
    };
  }
  if (request.startsWith("@/")) {
    return originalLoad.call(this, path.join(repoRoot, request.slice(2)), parent, isMain);
  }
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
    fileName: filename,
  });
  module._compile(output.outputText, filename);
};

require.extensions[".tsx"] = require.extensions[".ts"];
require.extensions[".js"] = originalJs;

const closetModel = require("../src/closet/closetListModel.ts");
const clientOutfitGenerator = require("../src/lib/outfitGenerator.ts");
const serverOutfitEngine = require("../functions/src/shared/outfitEngine.ts");
const wardrobeSuggestions = require("../src/lib/wardrobeSuggestions.ts");
const aura = require("../src/lib/aura.ts");

const COLORS = [
  "black",
  "white",
  "navy",
  "grey",
  "beige",
  "cream",
  "blue",
  "brown",
  "olive",
  "green",
  "red",
  "tan",
  "silver",
  "gold",
];
const BRANDS = ["Nike", "Adidas", "Uniqlo", "Zara", "H&M", "Levi's", "COS", "Aritzia", "Gap", "Everlane"];
const CATEGORY_BLUEPRINTS = [
  { category: "top", subCategory: "t-shirt", type: "tee", name: "Clean Cotton Tee", share: 0.24 },
  { category: "bottom", subCategory: "jeans", type: "jeans", name: "Straight Jeans", share: 0.22 },
  { category: "footwear", subCategory: "sneaker", type: "sneakers", name: "Minimal Sneakers", share: 0.16 },
  { category: "outerwear", subCategory: "jacket", type: "jacket", name: "Light Jacket", share: 0.12 },
  { category: "accessory", subCategory: "watch", type: "watch", name: "Silver Watch", share: 0.16 },
  { category: "one_piece", subCategory: "dress", type: "dress", name: "Knit Dress", share: 0.10 },
];
const CATEGORY_CYCLE = [
  CATEGORY_BLUEPRINTS[0],
  CATEGORY_BLUEPRINTS[0],
  CATEGORY_BLUEPRINTS[1],
  CATEGORY_BLUEPRINTS[1],
  CATEGORY_BLUEPRINTS[2],
  CATEGORY_BLUEPRINTS[3],
  CATEGORY_BLUEPRINTS[4],
  CATEGORY_BLUEPRINTS[0],
  CATEGORY_BLUEPRINTS[1],
  CATEGORY_BLUEPRINTS[2],
  CATEGORY_BLUEPRINTS[4],
  CATEGORY_BLUEPRINTS[5],
  CATEGORY_BLUEPRINTS[0],
  CATEGORY_BLUEPRINTS[1],
  CATEGORY_BLUEPRINTS[3],
  CATEGORY_BLUEPRINTS[4],
  CATEGORY_BLUEPRINTS[2],
  CATEGORY_BLUEPRINTS[0],
  CATEGORY_BLUEPRINTS[1],
  CATEGORY_BLUEPRINTS[5],
];

function blueprintForIndex(index) {
  return CATEGORY_CYCLE[index % CATEGORY_CYCLE.length];
}

function seededItem(index) {
  const blueprint = blueprintForIndex(index);
  const color = COLORS[index % COLORS.length];
  const secondaryColor = COLORS[(index * 7 + 3) % COLORS.length];
  const brand = BRANDS[(index * 5 + 2) % BRANDS.length];
  const isFormal = index % 7 === 0;
  const isStreet = index % 5 === 0;
  const now = Date.UTC(2026, 4, 25);
  const lastWornDaysAgo = (index * 11) % 90;
  return {
    id: `item-${index}`,
    name: `${color} ${blueprint.name} ${index}`,
    title: `${color} ${blueprint.name}`,
    productName: `${color} ${blueprint.name}`,
    brand,
    category: blueprint.category,
    subCategory: blueprint.subCategory,
    type: blueprint.type,
    primaryColor: color,
    colorLabel: color,
    displayColor: color,
    colors: [color, secondaryColor],
    displayColors: [color, secondaryColor],
    aiColors: [color, secondaryColor],
    material: index % 4 === 0 ? "cotton" : index % 4 === 1 ? "denim" : index % 4 === 2 ? "leather" : "wool",
    materials: ["cotton", "denim", "leather", "wool"].slice(0, (index % 3) + 1),
    pattern: index % 6 === 0 ? "stripe" : "solid",
    style: isFormal ? "smart casual" : isStreet ? "streetwear" : "minimal",
    formality: isFormal ? "smart_casual" : isStreet ? "streetwear" : "casual",
    formalityScore: isFormal ? 0.72 : isStreet ? 0.36 : 0.5,
    warmthScore: blueprint.category === "outerwear" ? 0.78 : blueprint.category === "footwear" ? 0.35 : 0.48,
    hasLogo: index % 13 === 0,
    aestheticTags: [isStreet ? "streetwear" : "minimal", isFormal ? "classic" : "casual"],
    occasionTags: [isFormal ? "work" : "casual", index % 9 === 0 ? "date" : "everyday"],
    seasonTags: [index % 3 === 0 ? "winter" : "summer"],
    detailTags: [blueprint.subCategory],
    status: index % 17 === 0 ? "WORN" : "AVAILABLE",
    laundryStatus: index % 19 === 0 ? "needs_wash" : "clean",
    isDraft: false,
    draftState: "ready",
    ingestion: { status: "done" },
    ingestionStatus: "done",
    wearSlot: blueprint.category === "accessory" ? "accessory" : "core",
    wearCountSinceWash: index % 19 === 0 ? 1 : 0,
    isFavorite: index % 23 === 0,
    lastWornDate: now - lastWornDaysAgo * 24 * 60 * 60 * 1000,
    createdAt: now - index * 60 * 60 * 1000,
    updatedAt: now - index * 30 * 60 * 1000,
  };
}

function generateWardrobe(size) {
  return Array.from({ length: size }, (_, index) => seededItem(index));
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((acc, value) => acc + value, 0);
  return {
    runs: samples.length,
    minMs: Number(sorted[0].toFixed(3)),
    p50Ms: Number(percentile(sorted, 50).toFixed(3)),
    meanMs: Number((sum / Math.max(1, samples.length)).toFixed(3)),
    p75Ms: Number(percentile(sorted, 75).toFixed(3)),
    p95Ms: Number(percentile(sorted, 95).toFixed(3)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

function timeOnce(fn) {
  const start = performance.now();
  const result = fn();
  return { ms: performance.now() - start, result };
}

function benchmark(fn, { warmups = 8, runs = 40 } = {}) {
  for (let index = 0; index < warmups; index += 1) fn();
  const samples = [];
  let lastResult;
  for (let index = 0; index < runs; index += 1) {
    const timed = timeOnce(fn);
    samples.push(timed.ms);
    lastResult = timed.result;
  }
  return { stats: summarize(samples), samples, lastResult };
}

function benchmarkBySize(sizes, fnForSize, optionsForSize = () => ({}), label = "benchmark") {
  return sizes.map((size) => {
    console.log(`[${label}] size=${size}`);
    const bench = benchmark(fnForSize(size), optionsForSize(size));
    return {
      size,
      ...bench.stats,
      resultSummary: summarizeResult(bench.lastResult),
    };
  });
}

function summarizeResult(result) {
  if (Array.isArray(result)) {
    return { kind: "array", length: result.length };
  }
  if (result && typeof result === "object") {
    return {
      kind: "object",
      outfits: Array.isArray(result.outfits) ? result.outfits.length : undefined,
      eligibleCount: typeof result.eligibleCount === "number" ? result.eligibleCount : undefined,
      slotCounts: result.slotCounts ?? undefined,
      fallbackMode: result.fallbackMode ?? undefined,
    };
  }
  return { kind: typeof result };
}

async function benchmarkSyntheticAuraStream() {
  const originalFetch = global.fetch;
  const scenarios = [
    {
      name: "micro_delta_25ms",
      chunkDelayMs: 25,
      deltas: [
        "Here ",
        "are ",
        "three ",
        "closet-first ",
        "ideas ",
        "for ",
        "tonight.",
      ],
    },
    {
      name: "single_large_delta_smoothed",
      chunkDelayMs: 25,
      deltas: [
        "Here are three closet-first ideas for tonight: a clean tee, straight denim, minimal sneakers, and a light jacket.",
      ],
    },
  ];
  const rows = [];
  for (const scenario of scenarios) {
    const callbackTimes = [];
    const statusTimes = [];
    const finalTimes = [];
    const totalTimes = [];
    const intervalSamples = [];
    const runs = 12;
    for (let runIndex = 0; runIndex < runs; runIndex += 1) {
      const encoder = new TextEncoder();
      const events = [
        { type: "status", status: "thinking" },
        ...scenario.deltas.map((delta) => ({ type: "delta", delta })),
        {
          type: "final",
          data: {
            presentation: "chat",
            title: "AURA",
            reply: scenario.deltas.join(""),
            reason: "",
            outfitItems: [],
            ownedPieces: [],
            recommendedAdditions: [],
            swapSuggestion: "",
            missingPieces: [],
            upgradeSuggestions: [],
            upgradeSuggestionItems: [],
            chips: [],
            look: null,
            lookOptions: [],
          },
        },
      ];
      global.fetch = async () =>
        new Response(
          new ReadableStream({
            async start(controller) {
              for (const event of events) {
                await new Promise((resolve) => setTimeout(resolve, scenario.chunkDelayMs));
                controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
              }
              controller.close();
            },
          }),
          { status: 200 },
        );

      const start = performance.now();
      const deltas = [];
      await aura.askAuraStream(
        { message: "Give me a quick outfit." },
        {
          onStatus: () => statusTimes.push(performance.now() - start),
          onDelta: () => {
            const now = performance.now() - start;
            callbackTimes.push(now);
            deltas.push(now);
          },
          onFinal: () => finalTimes.push(performance.now() - start),
        },
      );
      totalTimes.push(performance.now() - start);
      for (let index = 1; index < deltas.length; index += 1) {
        intervalSamples.push(deltas[index] - deltas[index - 1]);
      }
    }
    rows.push({
      scenario: scenario.name,
      syntheticServerChunkDelayMs: scenario.chunkDelayMs,
      runs,
      firstStatus: summarize(statusTimes),
      timeToFirstVisibleDelta: summarize(callbackTimes.filter((_, index) => index % scenario.deltas.length === 0)),
      deltaCallbackInterval: summarize(intervalSamples),
      timeToFinalCallback: summarize(finalTimes),
      timeToResolvedResponse: summarize(totalTimes),
      note:
        "Synthetic benchmark of src/lib/aura.ts client stream parsing and smoothing; excludes deployed function, OpenAI, Firebase Auth, and network latency.",
    });
  }
  global.fetch = originalFetch;
  return rows;
}

function readText(file) {
  return fs.readFileSync(path.join(repoRoot, file), "utf8");
}

function walk(dir, matcher = () => true) {
  const root = path.join(repoRoot, dir);
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (matcher(full)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function countMatches(text, pattern) {
  return (text.match(pattern) ?? []).length;
}

function staticAudit() {
  const sourceDirs = ["app", "src", "functions/src", "shared", "modules/expo-vision-bg/src", "modules/expo-vision-bg/ios"];
  const files = sourceDirs.flatMap((dir) =>
    walk(dir, (file) => /\.(ts|tsx|js|jsx|swift)$/.test(file) && !file.includes(`${path.sep}node_modules${path.sep}`)),
  );
  const tsFiles = files.filter((file) => /\.(ts|tsx)$/.test(file));
  const tsxFiles = files.filter((file) => /\.tsx$/.test(file));
  const jsFiles = files.filter((file) => /\.(js|jsx)$/.test(file));
  const swiftFiles = files.filter((file) => /\.swift$/.test(file));
  const fileStats = files.map((file) => {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(repoRoot, file);
    return {
      file: rel,
      loc: text.split(/\r?\n/).length,
      asyncCount: countMatches(text, /\basync\b/g),
      awaitCount: countMatches(text, /\bawait\b/g),
      tryCount: countMatches(text, /\btry\b/g),
      catchCount: countMatches(text, /\bcatch\b/g),
      useMemoCount: countMatches(text, /\buseMemo\s*\(/g),
      useCallbackCount: countMatches(text, /\buseCallback\s*\(/g),
      reactMemoCount: countMatches(text, /\bmemo\s*\(/g),
      accessibilityLabelCount: countMatches(text, /accessibilityLabel\s*=/g),
      accessibilityRoleCount: countMatches(text, /accessibilityRole\s*=/g),
      loadingStateCount: countMatches(text, /\b(loading|isLoading|ActivityIndicator|Skeleton)\b/gi),
      errorStateCount: countMatches(text, /\b(error|failed|failure|retry)\b/gi),
      fallbackCount: countMatches(text, /\bfallback\b/gi),
      timeoutCount: countMatches(text, /\b(timeout|setTimeout|AbortController)\b/gi),
    };
  });
  const combined = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const packageJson = JSON.parse(readText("package.json"));
  const tsconfig = JSON.parse(readText("tsconfig.json"));
  const rateLimitText = readText("functions/src/shared/rateLimit.ts");
  const rateLimitMatches = [...rateLimitText.matchAll(/^\s{2}([a-zA-Z0-9_]+):\s*\[/gm)].map((match) => match[1]);
  const functionIndex = readText("functions/src/index.ts");
  const functionExports = [
    ...functionIndex.matchAll(/^export\s+\{\s*([a-zA-Z0-9_]+)\s*\}/gm),
    ...functionIndex.matchAll(/^export\s+const\s+([a-zA-Z0-9_]+)/gm),
  ].map((match) => match[1]);

  return {
    environment: environmentSummary(),
    sourceFileCounts: {
      totalSourceFiles: files.length,
      tsFiles: tsFiles.length,
      tsxFiles: tsxFiles.length,
      jsFiles: jsFiles.length,
      swiftFiles: swiftFiles.length,
      typescriptSharePct: Number(((tsFiles.length / Math.max(1, tsFiles.length + jsFiles.length)) * 100).toFixed(1)),
      srcComponentTsxFiles: walk("src/components", (file) => /\.tsx$/.test(file)).length,
      hookFiles: walk("src", (file) => /\/use[A-Z][^/]*\.(ts|tsx)$/.test(file)).length,
      appRouteFiles: walk("app", (file) => /\.(ts|tsx)$/.test(file)).length,
      libServiceFiles: walk("src/lib", (file) => /\.(ts|tsx)$/.test(file)).length,
      cloudFunctionSourceFiles: walk("functions/src", (file) => /\.(ts|tsx)$/.test(file)).length,
      exportedFirebaseFunctions: Array.from(new Set(functionExports)).length,
      exportedFirebaseFunctionNames: Array.from(new Set(functionExports)).sort(),
    },
    package: {
      dependencies: Object.keys(packageJson.dependencies ?? {}).length,
      devDependencies: Object.keys(packageJson.devDependencies ?? {}).length,
      scripts: Object.keys(packageJson.scripts ?? {}),
    },
    typescript: {
      strict: tsconfig.compilerOptions?.strict === true,
      typedRoutes: readText("app.json").includes("\"typedRoutes\": true"),
      reactCompiler: readText("app.json").includes("\"reactCompiler\": true"),
    },
    staticFeatureCounts: {
      accessibilityLabelOccurrences: countMatches(combined, /accessibilityLabel\s*=/g),
      accessibilityRoleOccurrences: countMatches(combined, /accessibilityRole\s*=/g),
      interactiveComponentOccurrences: countMatches(combined, /<(Pressable|TouchableOpacity|TouchableWithoutFeedback|Button)\b/g),
      keyboardAwareOccurrences: countMatches(combined, /\b(KeyboardAvoidingView|keyboardShouldPersistTaps|Keyboard)\b/g),
      activityIndicatorOccurrences: countMatches(combined, /\bActivityIndicator\b/g),
      skeletonOccurrences: countMatches(combined, /\bSkeleton\b/g),
      emptyStateOccurrences: countMatches(combined, /\b(empty|Empty)\b/g),
      errorRetryOccurrences: countMatches(combined, /\b(error|Error|failed|failure|retry|Retry)\b/g),
      fallbackOccurrences: countMatches(combined, /\bfallback\b/gi),
      timeoutAbortOccurrences: countMatches(combined, /\b(timeout|setTimeout|AbortController)\b/gi),
      tryCatchBlocks: countMatches(combined, /\btry\b/g),
      catchBlocks: countMatches(combined, /\bcatch\b/g),
      onSnapshotOccurrences: countMatches(combined, /\bonSnapshot\b/g),
      writeBatchOccurrences: countMatches(combined, /\bwriteBatch\b/g),
      useMemoOccurrences: countMatches(combined, /\buseMemo\s*\(/g),
      useCallbackOccurrences: countMatches(combined, /\buseCallback\s*\(/g),
      reactMemoOccurrences: countMatches(combined, /\bmemo\s*\(/g),
      flatListOccurrences: countMatches(combined, /\bFlatList\b/g),
      reducedMotionOccurrences: countMatches(combined, /\b(useReducedMotion|reduceMotion|reducedMotion)\b/g),
      rateLimitedEndpointTypes: rateLimitMatches.length,
      rateLimitedEndpointNames: rateLimitMatches,
    },
    largestFiles: fileStats
      .sort((a, b) => b.loc - a.loc)
      .slice(0, 20),
    asyncHotspots: fileStats
      .map((entry) => ({
        file: entry.file,
        asyncSignal: entry.asyncCount + entry.awaitCount + entry.tryCount + entry.catchCount,
        asyncCount: entry.asyncCount,
        awaitCount: entry.awaitCount,
        tryCount: entry.tryCount,
        catchCount: entry.catchCount,
        loc: entry.loc,
      }))
      .sort((a, b) => b.asyncSignal - a.asyncSignal)
      .slice(0, 20),
    uxStateHotspots: fileStats
      .map((entry) => ({
        file: entry.file,
        uxStateSignal: entry.loadingStateCount + entry.errorStateCount + entry.fallbackCount + entry.timeoutCount,
        loadingStateCount: entry.loadingStateCount,
        errorStateCount: entry.errorStateCount,
        fallbackCount: entry.fallbackCount,
        timeoutCount: entry.timeoutCount,
        loc: entry.loc,
      }))
      .sort((a, b) => b.uxStateSignal - a.uxStateSignal)
      .slice(0, 20),
  };
}

function environmentSummary() {
  return {
    measuredAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCount: require("node:os").cpus().length,
    cpuModel: require("node:os").cpus()[0]?.model ?? "unknown",
    repoRoot,
    benchmarkMode:
      "Node.js microbenchmarks with deterministic synthetic closet datasets; Firebase, React Native, Expo, and network dependencies mocked unless explicitly noted.",
  };
}

function markdownTable(headers, rows) {
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|");
  return [
    `| ${headers.map(escape).join(" |")} |`,
    `| ${headers.map(() => "---").join(" |")} |`,
    ...rows.map((row) => `| ${headers.map((header) => escape(row[header])).join(" |")} |`),
  ].join("\n");
}

function compactPerfRows(rows) {
  return rows.map((row) => ({
    items: row.size,
    p50Ms: row.p50Ms,
    p95Ms: row.p95Ms,
    meanMs: row.meanMs,
    maxMs: row.maxMs,
    result: row.resultSummary?.outfits ?? row.resultSummary?.length ?? "",
    eligible: row.resultSummary?.eligibleCount ?? "",
    fallback: row.resultSummary?.fallbackMode ?? "",
  }));
}

function renderMarkdownReport(results) {
  const lines = [];
  lines.push("# AURA Performance Benchmark Report");
  lines.push("");
  lines.push(`Generated: ${results.environment.measuredAt}`);
  lines.push("");
  lines.push("## Environment");
  lines.push("");
  lines.push(markdownTable(["key", "value"], Object.entries(results.environment).map(([key, value]) => ({ key, value }))));
  lines.push("");
  lines.push("## Recommendation Latency");
  lines.push("");
  lines.push("Server-side candidate engine: `functions/src/shared/outfitEngine.ts::generateOutfitCandidates`.");
  lines.push("");
  lines.push(markdownTable(["items", "p50Ms", "p95Ms", "meanMs", "maxMs", "result", "eligible", "fallback"], compactPerfRows(results.recommendations.serverGenerateOutfitCandidates)));
  lines.push("");
  lines.push("Client fallback generator: `src/lib/outfitGenerator.ts::generateOutfits`.");
  lines.push("");
  lines.push(markdownTable(["items", "p50Ms", "p95Ms", "meanMs", "maxMs", "result", "eligible", "fallback"], compactPerfRows(results.recommendations.clientGenerateOutfits)));
  lines.push("");
  lines.push("Wardrobe gap suggestions: `src/lib/wardrobeSuggestions.ts::buildWardrobeSuggestions`.");
  lines.push("");
  lines.push(markdownTable(["items", "p50Ms", "p95Ms", "meanMs", "maxMs", "result"], compactPerfRows(results.recommendations.wardrobeSuggestions)));
  lines.push("");
  lines.push("## Closet/Search Latency");
  lines.push("");
  lines.push(markdownTable(["items", "p50Ms", "p95Ms", "meanMs", "maxMs", "result"], compactPerfRows(results.closet.combinedRows)));
  lines.push("");
  lines.push("Individual closet operations:");
  lines.push("");
  lines.push(markdownTable(["operation", "items", "p50Ms", "p95Ms", "meanMs", "maxMs", "result"], results.closet.individualOperations.map((row) => ({
    operation: row.operation,
    items: row.size,
    p50Ms: row.p50Ms,
    p95Ms: row.p95Ms,
    meanMs: row.meanMs,
    maxMs: row.maxMs,
    result: row.resultSummary?.length ?? "",
  }))));
  lines.push("");
  lines.push("## Synthetic Streaming Client Timing");
  lines.push("");
  lines.push("Measured `src/lib/aura.ts::askAuraStream` client-side stream parsing against an in-process synthetic `ReadableStream`; this does not include deployed Cloud Function, OpenAI, Firebase Auth, or public internet latency.");
  lines.push("");
  lines.push(markdownTable([
    "scenario",
    "chunkDelayMs",
    "firstVisibleP50Ms",
    "deltaIntervalP50Ms",
    "finalCallbackP50Ms",
    "resolvedP50Ms",
  ], results.streaming.syntheticAuraStream.map((row) => ({
    scenario: row.scenario,
    chunkDelayMs: row.syntheticServerChunkDelayMs,
    firstVisibleP50Ms: row.timeToFirstVisibleDelta.p50Ms,
    deltaIntervalP50Ms: row.deltaCallbackInterval.p50Ms,
    finalCallbackP50Ms: row.timeToFinalCallback.p50Ms,
    resolvedP50Ms: row.timeToResolvedResponse.p50Ms,
  }))));
  lines.push("");
  lines.push("## Static Architecture And Reliability Audit");
  lines.push("");
  lines.push(markdownTable(["metric", "value"], Object.entries(results.staticAudit.sourceFileCounts).filter(([, value]) => !Array.isArray(value)).map(([metric, value]) => ({ metric, value }))));
  lines.push("");
  lines.push(markdownTable(["metric", "value"], Object.entries(results.staticAudit.staticFeatureCounts).filter(([, value]) => !Array.isArray(value)).map(([metric, value]) => ({ metric, value }))));
  lines.push("");
  lines.push("### Largest Files");
  lines.push("");
  lines.push(markdownTable(["file", "loc", "asyncCount", "awaitCount", "tryCount", "catchCount"], results.staticAudit.largestFiles.slice(0, 12)));
  lines.push("");
  lines.push("### Async Complexity Hotspots");
  lines.push("");
  lines.push(markdownTable(["file", "asyncSignal", "asyncCount", "awaitCount", "tryCount", "catchCount", "loc"], results.staticAudit.asyncHotspots.slice(0, 12)));
  lines.push("");
  lines.push("## Methodology Notes");
  lines.push("");
  lines.push("- Recommendation and closet/search latency are measured with deterministic synthetic wardrobe datasets at 50, 100, 250, 500, 800, and 1,000 items.");
  lines.push("- Timings use `performance.now()` in Node and report min, p50, mean, p75, p95, and max after warmup iterations.");
  lines.push("- Firebase, React Native, Expo, and network dependencies are mocked for pure function benchmarks so the measured values isolate local ranking/search/client parsing logic.");
  lines.push("- Upload/image optimization duration and native rendering FPS were not measured in this Node benchmark because Expo native modules and device rendering require a simulator/device profile.");
  lines.push("- Synthetic streaming numbers validate client parser/callback responsiveness, not real model first-token latency.");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const environment = environmentSummary();
  const sizes = [50, 100, 250, 500, 800, 1000];
  const baseIntent = serverOutfitEngine.fallbackIntent(
    "Give me 5 smart casual date night outfits with clean sneakers, outerwear, and a watch."
  );
  const clientIntent = {
    occasion: "date",
    vibe: "smart casual clean",
    colorPreference: ["black", "white"],
    includeOuterwear: true,
    includeAccessory: true,
    numOutfits: 5,
  };
  const categoryOrder = ["top", "one_piece", "outerwear", "bottom", "shoes", "accessory"];
  const expandedSections = {
    top: true,
    one_piece: true,
    outerwear: true,
    bottom: true,
    shoes: true,
    accessory: true,
  };

  const recommendations = {
    serverGenerateOutfitCandidates: benchmarkBySize(
      sizes,
      (size) => {
        const items = generateWardrobe(size);
        return () =>
          serverOutfitEngine.generateOutfitCandidates(items, baseIntent, {
            numOutfits: 5,
            diversity: {
              recentItemIds: items.slice(0, 10).map((item) => item.id),
              previousLookItemIds: items.slice(5, 9).map((item) => item.id),
              previousLookSignatures: [],
              maxOverlap: 2,
            },
          });
      },
      (size) => ({
        warmups: size <= 100 ? 2 : 1,
        runs: size <= 100 ? 8 : size <= 250 ? 6 : size <= 500 ? 4 : size <= 800 ? 3 : 2,
      }),
      "serverGenerateOutfitCandidates",
    ),
    clientGenerateOutfits: benchmarkBySize(
      sizes,
      (size) => {
        const items = generateWardrobe(size);
        return () => clientOutfitGenerator.generateOutfits(items, clientIntent);
      },
      (size) => ({
        warmups: 1,
        runs: size <= 100 ? 5 : size <= 250 ? 4 : size <= 800 ? 3 : 2,
      }),
      "clientGenerateOutfits",
    ),
    filterEligibleItems: benchmarkBySize(
      sizes,
      (size) => {
        const items = generateWardrobe(size);
        return () => serverOutfitEngine.filterEligibleItems(items, baseIntent);
      },
      () => ({ warmups: 10, runs: 70 }),
      "filterEligibleItems",
    ),
    wardrobeSuggestions: benchmarkBySize(
      sizes,
      (size) => {
        const items = generateWardrobe(size);
        return () =>
          wardrobeSuggestions.buildWardrobeSuggestions({
            items,
            profilePreferences: {
              favoriteColors: ["black", "white", "navy"],
              styleAesthetics: ["minimal", "smart casual"],
              goals: ["build a stronger everyday rotation"],
              budgetRange: "mid",
            },
            savedLooks: [
              { addToComplete: ["black loafers"], missingPieces: ["navy blazer"] },
              { upgradeSuggestions: ["white oxford shirt"] },
            ],
          });
      },
      () => ({ warmups: 10, runs: 70 }),
      "wardrobeSuggestions",
    ),
  };

  const closetIndividualOperations = [];
  for (const size of sizes) {
    console.log(`[closetIndividualOperations] size=${size}`);
    const items = generateWardrobe(size);
    const operations = {
      rankSearchItems: () => closetModel.rankSearchItems(items, "black"),
      sortItemsRecentlyAdded: () => closetModel.sortItems(items, "RECENTLY_ADDED"),
      buildSections: () => closetModel.buildSections(items, categoryOrder, ["sneaker", "jeans", "jacket"]),
      buildRowsFromSections: () => {
        const sections = closetModel.buildSections(items, categoryOrder, ["sneaker", "jeans", "jacket"]);
        return closetModel.buildClosetListRows(sections, expandedSections);
      },
    };
    for (const [operation, fn] of Object.entries(operations)) {
      const bench = benchmark(fn, { warmups: 10, runs: 80 });
      closetIndividualOperations.push({
        operation,
        size,
        ...bench.stats,
        resultSummary: summarizeResult(bench.lastResult),
      });
    }
  }

  const closet = {
    combinedRows: benchmarkBySize(
      sizes,
      (size) => {
        const items = generateWardrobe(size);
        return () => {
          const ranked = closetModel.rankSearchItems(items, "black");
          const sorted = closetModel.sortItems(ranked, "RECENTLY_ADDED");
          const sections = closetModel.buildSections(sorted, categoryOrder, ["sneaker", "jeans", "jacket"]);
          return closetModel.buildClosetListRows(sections, expandedSections);
        };
      },
      () => ({ warmups: 10, runs: 80 }),
      "closetCombinedRows",
    ),
    individualOperations: closetIndividualOperations,
  };

  const streaming = {
    syntheticAuraStream: await benchmarkSyntheticAuraStream(),
  };

  const audit = staticAudit();
  const results = {
    environment,
    recommendations,
    closet,
    streaming,
    staticAudit: audit,
  };

  const jsonPath = path.join(resultsDir, "benchmark-results.json");
  const mdPath = path.join(resultsDir, "benchmark-report.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdownReport(results));
  console.log(`Wrote ${path.relative(repoRoot, jsonPath)}`);
  console.log(`Wrote ${path.relative(repoRoot, mdPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
