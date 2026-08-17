import { getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "../../shared/logger";
import { isReadyClosetItem } from "./draftAudit";
import {
  METRICS_VERSION,
  type AuraMetricEvent,
  type AuraMetrics,
  type AuraMetricsCategory,
  type AuraMetricsFeedbackType,
  type AuraMetricsMode,
  type AuraMetricsNodeName,
  type AuraResumeMetrics,
} from "./metricsTypes";
import type { ClosetItemDocument } from "./types";

const METRICS_DOC_ID = "main";
const METRICS_COLLECTION = "auraMetrics";
const VECTOR_KEYS = new Set([
  "embeddingVector",
  "embeddingRaw",
  "_values",
  "vector",
  "rawVector",
  "queryVector",
]);
const RAW_PAYLOAD_KEYS = new Set([
  "rawOpenAIResponse",
  "rawOpenAiResponse",
  "rawResponse",
  "openAIResponse",
  "openAiResponse",
  "diagnostics",
  "aiMetadata",
  "scoreBreakdown",
]);
const CATEGORIES: AuraMetricsCategory[] = [
  "top",
  "bottom",
  "footwear",
  "outerwear",
  "accessory",
  "one_piece",
];
const MODES: AuraMetricsMode[] = [
  "generate_outfit",
  "refine_outfit",
  "explain_outfit",
  "feedback",
  "unknown",
];
const FEEDBACK_TYPES: AuraMetricsFeedbackType[] = [
  "like",
  "save",
  "wear",
  "not_my_vibe",
  "more_like_this",
  "less_like_this",
  "too_formal",
  "too_casual",
  "more_streetwear",
  "less_streetwear",
];
const NODE_NAMES: AuraMetricsNodeName[] = [
  "classify_intent",
  "retrieve_style_memory",
  "retrieve_outfit_context",
  "generate_outfits",
  "build_agent_response",
  "resolve_refinement_context",
  "build_explanation_response",
  "record_feedback",
];

type MetricUpdateDeps = {
  readMetrics?: (uid: string) => Promise<Record<string, unknown> | null>;
  writeMetrics?: (uid: string, metrics: AuraMetrics) => Promise<void>;
};

type SnapshotDeps = {
  listItems?: (uid: string) => Promise<{ id: string; data: Record<string, unknown> }[]>;
  listStyleMemories?: (uid: string) => Promise<{ id: string; data: Record<string, unknown> }[]>;
  listSavedOutfits?: (uid: string) => Promise<{ id: string; data: Record<string, unknown> }[]>;
  listOutfitEvents?: (uid: string) => Promise<{ id: string; data: Record<string, unknown> }[]>;
  writeMetrics?: (uid: string, metrics: AuraMetrics) => Promise<void>;
};

function zeroRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

function nowMs() {
  return Date.now();
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value: unknown, fallback = 0): number {
  return Math.max(0, numberValue(value, fallback));
}

function cleanCode(value: unknown): string {
  return String(value ?? "unknown")
    .replace(/[^a-zA-Z0-9_.:/-]/g, "_")
    .slice(0, 80) || "unknown";
}

function average(previousAverage: number, previousCount: number, sample: unknown): number {
  const value = Number(sample);
  if (!Number.isFinite(value)) return previousAverage;
  const count = Math.max(0, previousCount);
  return Number((((previousAverage * count) + value) / (count + 1)).toFixed(2));
}

function ratio(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Number(Math.max(0, Math.min(1, numerator / denominator)).toFixed(4));
}

function safePercent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Number(Math.max(0, Math.min(100, (numerator / denominator) * 100)).toFixed(1));
}

export function createDefaultAuraMetrics(userId: string): AuraMetrics {
  return {
    userId,
    wardrobe: {
      readyVisibleItems: 0,
      indexedReadyItems: 0,
      missingEmbeddingReadyItems: 0,
      embeddingCoveragePercent: 0,
      lastCoverageCheckedAt: null,
    },
    retrieval: {
      totalRetrievals: 0,
      successfulRetrievals: 0,
      failedRetrievals: 0,
      averageLatencyMs: 0,
      averageReturnedItems: 0,
      averageCandidateCountsByCategory: zeroRecord(CATEGORIES),
    },
    outfitGeneration: {
      totalGenerationRequests: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      requestedOutfitCountTotal: 0,
      returnedOutfitCountTotal: 0,
      averageRequestedOutfitCount: 0,
      averageReturnedOutfitCount: 0,
      averageOutfitScore: 0,
      averageStylePreferenceFit: 0,
      validationFailureCount: 0,
      repairCount: 0,
      repairRate: 0,
      zeroValidOutfitFailures: 0,
    },
    agent: {
      totalAgentRuns: 0,
      successfulAgentRuns: 0,
      failedAgentRuns: 0,
      averageGraphDurationMs: 0,
      averageNodeTimings: {},
      modeCounts: zeroRecord(MODES),
      langGraphRunCount: 0,
      internalRunnerFallbackCount: 0,
    },
    styleMemory: {
      totalMemories: 0,
      activeMemories: 0,
      positiveMemories: 0,
      negativeMemories: 0,
      manualMemories: 0,
      averageMemoriesRetrieved: 0,
      totalFeedbackActions: 0,
      feedbackCounts: zeroRecord(FEEDBACK_TYPES),
    },
    savedOutfits: {
      totalSavedOutfits: 0,
      auraAgentSavedOutfits: 0,
      duplicateSaveAttempts: 0,
    },
    calendar: {
      totalWearEvents: 0,
      totalPlannedEvents: 0,
      auraAgentWearEvents: 0,
      auraAgentPlannedEvents: 0,
      weatherWarningsGenerated: 0,
    },
    reliability: {
      lastErrorAt: null,
      recentErrorCount: 0,
      errorsByCode: {},
      timeoutCount: 0,
      fallbackCount: 0,
    },
    updatedAt: null,
    metricsVersion: METRICS_VERSION,
  };
}

function mergeRecord<T extends string>(
  defaults: Record<T, number>,
  value: unknown,
): Record<T, number> {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    Object.keys(defaults).map((key) => [key, positiveNumber(record[key])]),
  ) as Record<T, number>;
}

export function normalizeAuraMetrics(userId: string, value: unknown): AuraMetrics {
  const defaults = createDefaultAuraMetrics(userId);
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const data = value as Record<string, unknown>;
  const wardrobe = data.wardrobe && typeof data.wardrobe === "object" ? data.wardrobe as Record<string, unknown> : {};
  const retrieval = data.retrieval && typeof data.retrieval === "object" ? data.retrieval as Record<string, unknown> : {};
  const generation = data.outfitGeneration && typeof data.outfitGeneration === "object" ? data.outfitGeneration as Record<string, unknown> : {};
  const agent = data.agent && typeof data.agent === "object" ? data.agent as Record<string, unknown> : {};
  const styleMemory = data.styleMemory && typeof data.styleMemory === "object" ? data.styleMemory as Record<string, unknown> : {};
  const savedOutfits = data.savedOutfits && typeof data.savedOutfits === "object" ? data.savedOutfits as Record<string, unknown> : {};
  const calendar = data.calendar && typeof data.calendar === "object" ? data.calendar as Record<string, unknown> : {};
  const reliability = data.reliability && typeof data.reliability === "object" ? data.reliability as Record<string, unknown> : {};
  return {
    ...defaults,
    userId,
    wardrobe: {
      readyVisibleItems: positiveNumber(wardrobe.readyVisibleItems),
      indexedReadyItems: positiveNumber(wardrobe.indexedReadyItems),
      missingEmbeddingReadyItems: positiveNumber(wardrobe.missingEmbeddingReadyItems),
      embeddingCoveragePercent: positiveNumber(wardrobe.embeddingCoveragePercent),
      lastCoverageCheckedAt: wardrobe.lastCoverageCheckedAt == null ? null : positiveNumber(wardrobe.lastCoverageCheckedAt),
    },
    retrieval: {
      totalRetrievals: positiveNumber(retrieval.totalRetrievals),
      successfulRetrievals: positiveNumber(retrieval.successfulRetrievals),
      failedRetrievals: positiveNumber(retrieval.failedRetrievals),
      averageLatencyMs: positiveNumber(retrieval.averageLatencyMs),
      averageReturnedItems: positiveNumber(retrieval.averageReturnedItems),
      averageCandidateCountsByCategory: mergeRecord(defaults.retrieval.averageCandidateCountsByCategory, retrieval.averageCandidateCountsByCategory),
    },
    outfitGeneration: {
      totalGenerationRequests: positiveNumber(generation.totalGenerationRequests),
      successfulGenerations: positiveNumber(generation.successfulGenerations),
      failedGenerations: positiveNumber(generation.failedGenerations),
      requestedOutfitCountTotal: positiveNumber(generation.requestedOutfitCountTotal),
      returnedOutfitCountTotal: positiveNumber(generation.returnedOutfitCountTotal),
      averageRequestedOutfitCount: positiveNumber(generation.averageRequestedOutfitCount),
      averageReturnedOutfitCount: positiveNumber(generation.averageReturnedOutfitCount),
      averageOutfitScore: positiveNumber(generation.averageOutfitScore),
      averageStylePreferenceFit: positiveNumber(generation.averageStylePreferenceFit),
      validationFailureCount: positiveNumber(generation.validationFailureCount),
      repairCount: positiveNumber(generation.repairCount),
      repairRate: positiveNumber(generation.repairRate),
      zeroValidOutfitFailures: positiveNumber(generation.zeroValidOutfitFailures),
    },
    agent: {
      totalAgentRuns: positiveNumber(agent.totalAgentRuns),
      successfulAgentRuns: positiveNumber(agent.successfulAgentRuns),
      failedAgentRuns: positiveNumber(agent.failedAgentRuns),
      averageGraphDurationMs: positiveNumber(agent.averageGraphDurationMs),
      averageNodeTimings: sanitizeNodeTimings(agent.averageNodeTimings),
      modeCounts: mergeRecord(defaults.agent.modeCounts, agent.modeCounts),
      langGraphRunCount: positiveNumber(agent.langGraphRunCount),
      internalRunnerFallbackCount: positiveNumber(agent.internalRunnerFallbackCount),
    },
    styleMemory: {
      totalMemories: positiveNumber(styleMemory.totalMemories),
      activeMemories: positiveNumber(styleMemory.activeMemories),
      positiveMemories: positiveNumber(styleMemory.positiveMemories),
      negativeMemories: positiveNumber(styleMemory.negativeMemories),
      manualMemories: positiveNumber(styleMemory.manualMemories),
      averageMemoriesRetrieved: positiveNumber(styleMemory.averageMemoriesRetrieved),
      totalFeedbackActions: positiveNumber(styleMemory.totalFeedbackActions),
      feedbackCounts: mergeRecord(defaults.styleMemory.feedbackCounts, styleMemory.feedbackCounts),
    },
    savedOutfits: {
      totalSavedOutfits: positiveNumber(savedOutfits.totalSavedOutfits),
      auraAgentSavedOutfits: positiveNumber(savedOutfits.auraAgentSavedOutfits),
      duplicateSaveAttempts: positiveNumber(savedOutfits.duplicateSaveAttempts),
    },
    calendar: {
      totalWearEvents: positiveNumber(calendar.totalWearEvents),
      totalPlannedEvents: positiveNumber(calendar.totalPlannedEvents),
      auraAgentWearEvents: positiveNumber(calendar.auraAgentWearEvents),
      auraAgentPlannedEvents: positiveNumber(calendar.auraAgentPlannedEvents),
      weatherWarningsGenerated: positiveNumber(calendar.weatherWarningsGenerated),
    },
    reliability: {
      lastErrorAt: reliability.lastErrorAt == null ? null : positiveNumber(reliability.lastErrorAt),
      recentErrorCount: positiveNumber(reliability.recentErrorCount),
      errorsByCode: mergeErrorsByCode(reliability.errorsByCode),
      timeoutCount: positiveNumber(reliability.timeoutCount),
      fallbackCount: positiveNumber(reliability.fallbackCount),
    },
    updatedAt: data.updatedAt == null ? null : positiveNumber(data.updatedAt),
    metricsVersion: METRICS_VERSION,
  };
}

function mergeErrorsByCode(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]): [string, number] => [cleanCode(key), positiveNumber(entry)])
      .filter(([, entry]) => entry > 0),
  );
}

function sanitizeNodeTimings(value: unknown): Partial<Record<AuraMetricsNodeName, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const out: Partial<Record<AuraMetricsNodeName, number>> = {};
  for (const node of NODE_NAMES) {
    const duration = Number(record[node]);
    if (Number.isFinite(duration) && duration >= 0) out[node] = Number(duration.toFixed(2));
  }
  return out;
}

function recordError(metrics: AuraMetrics, code?: string, options: { timeout?: boolean; fallback?: boolean } = {}) {
  metrics.reliability.recentErrorCount += 1;
  metrics.reliability.lastErrorAt = nowMs();
  const errorCode = cleanCode(code);
  metrics.reliability.errorsByCode[errorCode] = (metrics.reliability.errorsByCode[errorCode] ?? 0) + 1;
  if (options.timeout) metrics.reliability.timeoutCount += 1;
  if (options.fallback) metrics.reliability.fallbackCount += 1;
}

function normalizeMode(value: unknown): AuraMetricsMode {
  const mode = String(value ?? "unknown") as AuraMetricsMode;
  return MODES.includes(mode) ? mode : "unknown";
}

function normalizeFeedbackType(value: unknown): AuraMetricsFeedbackType | null {
  const feedbackType = String(value ?? "") as AuraMetricsFeedbackType;
  return FEEDBACK_TYPES.includes(feedbackType) ? feedbackType : null;
}

function normalizeNode(value: unknown): AuraMetricsNodeName | null {
  const node = String(value ?? "") as AuraMetricsNodeName;
  return NODE_NAMES.includes(node) ? node : null;
}

export function applyAuraMetricEvent(current: AuraMetrics, event: AuraMetricEvent): AuraMetrics {
  const metrics = normalizeAuraMetrics(current.userId, current);
  if (event.type === "wardrobe_coverage_checked") {
    metrics.wardrobe.readyVisibleItems = positiveNumber(event.readyVisibleItems);
    metrics.wardrobe.indexedReadyItems = positiveNumber(event.indexedReadyItems);
    metrics.wardrobe.missingEmbeddingReadyItems = positiveNumber(event.missingEmbeddingReadyItems);
    metrics.wardrobe.embeddingCoveragePercent = safePercent(
      metrics.wardrobe.indexedReadyItems,
      metrics.wardrobe.readyVisibleItems,
    );
    metrics.wardrobe.lastCoverageCheckedAt = nowMs();
  } else if (event.type === "retrieval_completed") {
    const previousSuccesses = metrics.retrieval.successfulRetrievals;
    metrics.retrieval.totalRetrievals += 1;
    metrics.retrieval.successfulRetrievals += 1;
    metrics.retrieval.averageLatencyMs = average(metrics.retrieval.averageLatencyMs, previousSuccesses, event.latencyMs);
    metrics.retrieval.averageReturnedItems = average(metrics.retrieval.averageReturnedItems, previousSuccesses, event.returnedCount);
    for (const category of CATEGORIES) {
      metrics.retrieval.averageCandidateCountsByCategory[category] = average(
        metrics.retrieval.averageCandidateCountsByCategory[category],
        previousSuccesses,
        event.categoryCounts?.[category] ?? 0,
      );
    }
  } else if (event.type === "retrieval_failed") {
    metrics.retrieval.totalRetrievals += 1;
    metrics.retrieval.failedRetrievals += 1;
    recordError(metrics, event.code, { timeout: event.timeout });
  } else if (event.type === "outfit_generation_completed") {
    const previousSuccesses = metrics.outfitGeneration.successfulGenerations;
    metrics.outfitGeneration.totalGenerationRequests += 1;
    metrics.outfitGeneration.successfulGenerations += 1;
    metrics.outfitGeneration.requestedOutfitCountTotal += positiveNumber(event.requestedCount);
    metrics.outfitGeneration.returnedOutfitCountTotal += positiveNumber(event.returnedCount);
    metrics.outfitGeneration.averageRequestedOutfitCount = average(
      metrics.outfitGeneration.averageRequestedOutfitCount,
      previousSuccesses,
      event.requestedCount,
    );
    metrics.outfitGeneration.averageReturnedOutfitCount = average(
      metrics.outfitGeneration.averageReturnedOutfitCount,
      previousSuccesses,
      event.returnedCount,
    );
    metrics.outfitGeneration.averageOutfitScore = average(
      metrics.outfitGeneration.averageOutfitScore,
      previousSuccesses,
      event.averageOutfitScore,
    );
    metrics.outfitGeneration.averageStylePreferenceFit = average(
      metrics.outfitGeneration.averageStylePreferenceFit,
      previousSuccesses,
      event.averageStylePreferenceFit,
    );
    metrics.outfitGeneration.validationFailureCount += positiveNumber(event.validationFailureCount);
    if (event.repaired) metrics.outfitGeneration.repairCount += 1;
    metrics.outfitGeneration.repairRate = ratio(
      metrics.outfitGeneration.repairCount,
      metrics.outfitGeneration.totalGenerationRequests,
    );
  } else if (event.type === "outfit_generation_failed") {
    metrics.outfitGeneration.totalGenerationRequests += 1;
    metrics.outfitGeneration.failedGenerations += 1;
    metrics.outfitGeneration.requestedOutfitCountTotal += positiveNumber(event.requestedCount);
    if (event.zeroValidOutfits) metrics.outfitGeneration.zeroValidOutfitFailures += 1;
    recordError(metrics, event.code, { timeout: event.timeout });
    metrics.outfitGeneration.repairRate = ratio(
      metrics.outfitGeneration.repairCount,
      metrics.outfitGeneration.totalGenerationRequests,
    );
  } else if (event.type === "agent_run_completed") {
    const previousSuccesses = metrics.agent.successfulAgentRuns;
    const mode = normalizeMode(event.mode);
    metrics.agent.totalAgentRuns += 1;
    metrics.agent.successfulAgentRuns += 1;
    metrics.agent.modeCounts[mode] += 1;
    metrics.agent.averageGraphDurationMs = average(metrics.agent.averageGraphDurationMs, previousSuccesses, event.durationMs);
    if (event.runner === "langgraph") metrics.agent.langGraphRunCount += 1;
    if (event.runner === "controlled-internal-graph") metrics.agent.internalRunnerFallbackCount += 1;
    for (const timing of event.nodeTimings ?? []) {
      const node = normalizeNode(timing.node);
      if (!node) continue;
      metrics.agent.averageNodeTimings[node] = average(metrics.agent.averageNodeTimings[node] ?? 0, previousSuccesses, timing.durationMs);
    }
  } else if (event.type === "agent_run_failed") {
    const mode = normalizeMode(event.mode);
    metrics.agent.totalAgentRuns += 1;
    metrics.agent.failedAgentRuns += 1;
    metrics.agent.modeCounts[mode] += 1;
    recordError(metrics, event.code, { timeout: event.timeout, fallback: event.fallback });
  } else if (event.type === "style_feedback_recorded") {
    metrics.styleMemory.totalFeedbackActions += 1;
    const feedbackType = normalizeFeedbackType(event.feedbackType);
    if (feedbackType) metrics.styleMemory.feedbackCounts[feedbackType] += 1;
  } else if (event.type === "style_memory_retrieved") {
    metrics.styleMemory.averageMemoriesRetrieved = average(
      metrics.styleMemory.averageMemoriesRetrieved,
      Math.max(0, metrics.agent.totalAgentRuns),
      event.retrievedCount,
    );
  } else if (event.type === "saved_outfit_created") {
    metrics.savedOutfits.totalSavedOutfits += 1;
    if (event.source === "aura_agent") metrics.savedOutfits.auraAgentSavedOutfits += 1;
  } else if (event.type === "saved_outfit_duplicate") {
    metrics.savedOutfits.duplicateSaveAttempts += 1;
  } else if (event.type === "wear_event_created") {
    metrics.calendar.totalWearEvents += 1;
    if (event.source === "aura_agent") metrics.calendar.auraAgentWearEvents += 1;
  } else if (event.type === "planned_event_created") {
    metrics.calendar.totalPlannedEvents += 1;
    if (event.source === "aura_agent") metrics.calendar.auraAgentPlannedEvents += 1;
    metrics.calendar.weatherWarningsGenerated += positiveNumber(event.weatherWarningsCount);
  } else if (event.type === "weather_warning_generated") {
    metrics.calendar.weatherWarningsGenerated += positiveNumber(event.count);
  }

  metrics.updatedAt = nowMs();
  metrics.metricsVersion = METRICS_VERSION;
  return metrics;
}

export function sanitizeMetricsPayload<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeMetricsPayload(entry)).filter((entry) => entry !== undefined) as T;
  }
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (VECTOR_KEYS.has(key) || RAW_PAYLOAD_KEYS.has(key)) continue;
    output[key] = sanitizeMetricsPayload(entry);
  }
  return output as T;
}

function metricsRef(uid: string) {
  return getFirestore()
    .collection("users")
    .doc(uid)
    .collection(METRICS_COLLECTION)
    .doc(METRICS_DOC_ID);
}

async function readMetrics(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await metricsRef(uid).get();
  return snap.exists ? snap.data() ?? null : null;
}

async function writeMetrics(uid: string, metrics: AuraMetrics) {
  await metricsRef(uid).set(sanitizeMetricsPayload(metrics), { merge: false });
}

export async function recordAuraMetricEvent(
  userId: string,
  event: AuraMetricEvent,
  deps: MetricUpdateDeps = {},
) {
  const current = normalizeAuraMetrics(userId, await (deps.readMetrics ?? readMetrics)(userId));
  const next = applyAuraMetricEvent(current, sanitizeMetricsPayload(event));
  await (deps.writeMetrics ?? writeMetrics)(userId, next);
  return next;
}

export async function safeRecordAuraMetricEvent(userId: string, event: AuraMetricEvent) {
  if (!getApps().length) return;
  try {
    await recordAuraMetricEvent(userId, event);
  } catch (error) {
    logger.warn("[AURA_METRICS] non-blocking metric write failed", {
      eventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function getAuraMetricsSnapshot(userId: string, deps: Pick<MetricUpdateDeps, "readMetrics"> = {}) {
  return normalizeAuraMetrics(userId, await (deps.readMetrics ?? readMetrics)(userId));
}

function hasEmbedding(item: Record<string, unknown>) {
  return Boolean(item.embeddingVector ?? item.embeddingHash);
}

function active(data: Record<string, unknown>) {
  return data.active !== false;
}

function sourceIsAura(data: Record<string, unknown>) {
  return data.source === "aura_agent" || data.source === "aura";
}

async function listCollection(uid: string, collectionName: string) {
  const snap = await getFirestore().collection("users").doc(uid).collection(collectionName).get();
  return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
}

export function buildAuraMetricsFromCollections(
  userId: string,
  collections: {
    items: { id: string; data: Record<string, unknown> }[];
    styleMemories: { id: string; data: Record<string, unknown> }[];
    savedOutfits: { id: string; data: Record<string, unknown> }[];
    outfitEvents: { id: string; data: Record<string, unknown> }[];
  },
  previous: AuraMetrics = createDefaultAuraMetrics(userId),
): AuraMetrics {
  const metrics = normalizeAuraMetrics(userId, previous);
  let readyVisibleItems = 0;
  let indexedReadyItems = 0;
  for (const entry of collections.items) {
    const item = { id: entry.id, ...entry.data } as ClosetItemDocument;
    if (!isReadyClosetItem(item)) continue;
    readyVisibleItems += 1;
    if (hasEmbedding(entry.data)) indexedReadyItems += 1;
  }
  metrics.wardrobe.readyVisibleItems = readyVisibleItems;
  metrics.wardrobe.indexedReadyItems = indexedReadyItems;
  metrics.wardrobe.missingEmbeddingReadyItems = Math.max(0, readyVisibleItems - indexedReadyItems);
  metrics.wardrobe.embeddingCoveragePercent = safePercent(indexedReadyItems, readyVisibleItems);
  metrics.wardrobe.lastCoverageCheckedAt = nowMs();

  const activeMemories = collections.styleMemories.filter((entry) => active(entry.data));
  metrics.styleMemory.totalMemories = collections.styleMemories.length;
  metrics.styleMemory.activeMemories = activeMemories.length;
  metrics.styleMemory.positiveMemories = activeMemories.filter((entry) => entry.data.polarity === "positive").length;
  metrics.styleMemory.negativeMemories = activeMemories.filter((entry) => entry.data.polarity === "negative").length;
  metrics.styleMemory.manualMemories = activeMemories.filter((entry) => entry.data.source === "manual" || entry.data.type === "manual_note").length;

  const activeSaved = collections.savedOutfits.filter((entry) => active(entry.data));
  metrics.savedOutfits.totalSavedOutfits = activeSaved.length;
  metrics.savedOutfits.auraAgentSavedOutfits = activeSaved.filter((entry) => sourceIsAura(entry.data)).length;

  const activeEvents = collections.outfitEvents.filter((entry) => active(entry.data));
  const wearEvents = activeEvents.filter((entry) => entry.data.type === "worn" || entry.data.status === "worn");
  const plannedEvents = activeEvents.filter((entry) => entry.data.type === "planned" || entry.data.status === "planned");
  metrics.calendar.totalWearEvents = wearEvents.length;
  metrics.calendar.auraAgentWearEvents = wearEvents.filter((entry) => sourceIsAura(entry.data)).length;
  metrics.calendar.totalPlannedEvents = plannedEvents.length;
  metrics.calendar.auraAgentPlannedEvents = plannedEvents.filter((entry) => sourceIsAura(entry.data)).length;
  metrics.calendar.weatherWarningsGenerated = activeEvents.reduce((total, entry) => {
    const warnings = Array.isArray(entry.data.weatherWarnings) ? entry.data.weatherWarnings.length : 0;
    return total + warnings;
  }, 0);

  metrics.updatedAt = nowMs();
  metrics.metricsVersion = METRICS_VERSION;
  return metrics;
}

export async function refreshAuraMetricsSnapshotForUser(
  userId: string,
  options: { dryRun?: boolean } = {},
  deps: SnapshotDeps = {},
) {
  const previous = await getAuraMetricsSnapshot(userId);
  const metrics = buildAuraMetricsFromCollections(userId, {
    items: await (deps.listItems ?? ((uid) => listCollection(uid, "items")))(userId),
    styleMemories: await (deps.listStyleMemories ?? ((uid) => listCollection(uid, "styleMemories")))(userId),
    savedOutfits: await (deps.listSavedOutfits ?? ((uid) => listCollection(uid, "savedOutfits")))(userId),
    outfitEvents: await (deps.listOutfitEvents ?? ((uid) => listCollection(uid, "outfitEvents")))(userId),
  }, previous);
  if (!options.dryRun) await (deps.writeMetrics ?? writeMetrics)(userId, metrics);
  return sanitizeMetricsForClient(metrics);
}

export function validationSuccessRate(metrics: AuraMetrics): number {
  const total = metrics.outfitGeneration.successfulGenerations + metrics.outfitGeneration.failedGenerations;
  if (!total) return 0;
  return Number((metrics.outfitGeneration.successfulGenerations / total).toFixed(4));
}

export function buildAuraResumeMetrics(metrics: AuraMetrics): AuraResumeMetrics {
  const generatedOutfitsCount = metrics.outfitGeneration.returnedOutfitCountTotal;
  const langGraphEnabled = metrics.agent.langGraphRunCount >= metrics.agent.internalRunnerFallbackCount;
  return {
    wardrobeItemsIndexed: metrics.wardrobe.indexedReadyItems,
    embeddingCoveragePercent: metrics.wardrobe.embeddingCoveragePercent,
    generatedOutfitsCount,
    agentRunsCount: metrics.agent.totalAgentRuns,
    savedOutfitsCount: metrics.savedOutfits.totalSavedOutfits,
    wearEventsCount: metrics.calendar.totalWearEvents,
    styleMemoriesCount: metrics.styleMemory.activeMemories,
    feedbackActionsCount: metrics.styleMemory.totalFeedbackActions,
    averageAgentLatencyMs: metrics.agent.averageGraphDurationMs,
    validationSuccessRate: validationSuccessRate(metrics),
    repairRate: metrics.outfitGeneration.repairRate,
    langGraphEnabled,
    featureSummary: "LangGraph-powered AURA styling agent with wardrobe RAG, style memory, outfit validation, saved outfits, calendar planning, wear logging, and developer quality metrics.",
    resumeBullets: [
      "Built a LangGraph-powered AI styling agent with wardrobe RAG, style memory, closet-only outfit generation, refinement, explanation, and feedback learning.",
      `Indexed ${metrics.wardrobe.indexedReadyItems} wardrobe items with ${metrics.wardrobe.embeddingCoveragePercent}% embedding coverage for retrieval-augmented outfit generation.`,
      `Generated ${generatedOutfitsCount}+ closet-based outfit recommendations with validation to prevent hallucinated items.`,
      `Implemented feedback learning across ${metrics.styleMemory.activeMemories} active style memories from likes, saves, wears, and dislikes.`,
      `Instrumented AURA reliability and quality metrics across ${metrics.agent.totalAgentRuns} agent runs, ${metrics.savedOutfits.totalSavedOutfits} saved outfits, and ${metrics.calendar.totalWearEvents} wear events.`,
    ],
  };
}

export function sanitizeMetricsForClient(metrics: AuraMetrics): AuraMetrics {
  return sanitizeMetricsPayload(normalizeAuraMetrics(metrics.userId, metrics));
}

export async function resetAuraMetricsForUser(userId: string, deps: Pick<MetricUpdateDeps, "writeMetrics"> = {}) {
  const metrics = createDefaultAuraMetrics(userId);
  metrics.updatedAt = nowMs();
  await (deps.writeMetrics ?? writeMetrics)(userId, metrics);
  return sanitizeMetricsForClient(metrics);
}
