import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection,
  doc,
  limit as firestoreLimit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  type TextStyle,
  View,
} from "react-native";

import { SafeScreen } from "@/src/components/SafeScreen";
import AuraSubpageHeader from "@/src/components/ui/AuraSubpageHeader";
import {
  auraButtonStyle,
  auraButtonTextStyle,
  auraCardStyle,
  AuraTopSafeAreaScrim,
  auraTypography,
} from "@/src/components/ui/auraStylePrimitives";
import {
  buildStyleMemoryRetrieveRequest,
  nextStyleMemoryQueryState,
  styleMemoryQuickTestState,
  styleMemoryRetrieveRequestPreview,
  type StyleMemoryDebugState,
} from "@/src/dev/styleMemoryDebugRequest";
import { useAppTheme } from "@/src/hooks/useAppTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { app, auth, db } from "@/src/lib/firebase";

const TEST_ITEM_ID = "6Xz1tYMClDqB4VJxnrDo";
const LOG_PREFIX = "[AURA_INTELLIGENCE_DEBUG]";

type ActionName =
  | "preview"
  | "reindex"
  | "backfill"
  | "backfillAll"
  | "audit"
  | "deleteDraft"
  | "retrieve"
  | "previewCleanup"
  | "deleteCleanup"
  | "previewOutfitContext"
  | "generateOutfits"
  | "recordFeedback"
  | "addManualMemory"
  | "retrieveMemories"
  | "getStyleProfile"
  | "rebuildProfile"
  | "listMemories"
  | "deleteMemory"
  | "deleteAllMemories"
  | "runAgent"
  | "getMetrics"
  | "refreshMetrics"
  | "resumeMetrics"
  | "resetMetrics";

type FeedbackType =
  | "like"
  | "dislike"
  | "save"
  | "wear"
  | "not_my_vibe"
  | "more_like_this"
  | "less_like_this"
  | "too_formal"
  | "too_casual"
  | "more_streetwear"
  | "less_streetwear"
  | "more_color"
  | "less_color";

type StatusState = {
  action: ActionName | "idle";
  message: string;
};

type DebugDislikedOutfit = {
  id: string;
  title: string;
  active: boolean;
  createdAt: number;
  itemThumbnails: string[];
};

type BackfillDebugItem = {
  itemId: string;
  name: string;
  category: string;
  reason: string;
};

type BackfillDebugResponse = {
  processed: number;
  indexed: number;
  skipped: number;
  failed: number;
  indexedItems: BackfillDebugItem[];
  skippedItems: BackfillDebugItem[];
  failedItems: BackfillDebugItem[];
  hasMore: boolean;
  nextCursor: string | null;
  totalBatchSize: number;
  dryRun: boolean;
};

type FullBackfillResponse = {
  totalProcessed: number;
  totalIndexed: number;
  totalSkipped: number;
  totalFailed: number;
  batchesExecuted: number;
  dryRun: boolean;
};

type DraftAuditItem = {
  itemId: string;
  name: string;
  category: string;
  status: string | null;
  isDraft: boolean;
  itemLifecycleStatus: string | null;
  draftState: string | null;
  ingestionStatus: string | null;
  nestedIngestionStatus: string | null;
  createdAt: string | number | null;
  updatedAt: string | number | null;
  imageUrl: string | null;
  reason: string;
};

type DraftAuditResponse = {
  totalChecked: number;
  hiddenDraftCount: number;
  trueDraftCount: number;
  needsReviewCount: number;
  candidateCount: number;
  failedCount: number;
  pendingIngestionCount: number;
  readyVisibleCount: number;
  indexedReadyCount: number;
  missingEmbeddingReadyCount: number;
  draftItems: DraftAuditItem[];
};

type DraftCleanupItem = {
  itemId: string;
  name: string;
  category: string;
  createdAt: string | number | null;
  updatedAt: string | number | null;
  draftState: string | null;
  itemLifecycleStatus: string | null;
  reason: string;
};

type DraftCleanupPreviewResponse = {
  cutoffDays: number;
  cutoffTimestamp: number;
  totalChecked: number;
  deleteCandidateCount: number;
  candidates: DraftCleanupItem[];
};

type DraftCleanupBulkResponse = {
  cutoffDays: number;
  totalChecked: number;
  deletedCount: number;
  skippedCount: number;
  deletedItems: DraftCleanupItem[];
  skippedItems: DraftCleanupItem[];
};

type AuraMetricsResponse = {
  metricsVersion: number;
  wardrobe: Record<string, unknown>;
  retrieval: Record<string, unknown>;
  outfitGeneration: Record<string, unknown>;
  agent: Record<string, unknown>;
  styleMemory: Record<string, unknown>;
  savedOutfits: Record<string, unknown>;
  calendar: Record<string, unknown>;
  reliability: Record<string, unknown>;
};

type AuraResumeMetricsResponse = {
  wardrobeItemsIndexed: number;
  embeddingCoveragePercent: number;
  generatedOutfitsCount: number;
  agentRunsCount: number;
  savedOutfitsCount: number;
  wearEventsCount: number;
  styleMemoriesCount: number;
  feedbackActionsCount: number;
  averageAgentLatencyMs: number;
  validationSuccessRate: number;
  repairRate: number;
  langGraphEnabled: boolean;
  featureSummary: string;
  resumeBullets: string[];
};

function debugText(value: unknown, fallback = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function debugTimestamp(value: unknown) {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: () => number }).toMillis;
    if (typeof toMillis === "function") return toMillis();
  }
  return Date.now();
}

function toDebugDislikedOutfit(id: string, data: Record<string, unknown>): DebugDislikedOutfit {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    id,
    title: debugText(data.title, "AURA outfit"),
    active: data.active !== false,
    createdAt: debugTimestamp(data.createdAt ?? data.createdAtMs),
    itemThumbnails: items
      .map((item) => item && typeof item === "object" ? debugText((item as Record<string, unknown>).imageUrl) : "")
      .filter(Boolean)
      .slice(0, 5),
  };
}

type RetrievalResultItem = {
  itemId: string;
  name: string;
  category: string;
  role?: string;
  canonicalRole?: string;
  allowedRole?: string;
  sourceRole?: string;
  sourceCategory?: string | null;
  sourceAiMetadataCategory?: string | null;
  subcategory?: string;
  brand?: string;
  colors: string[];
  score: number | null;
  vectorScore: number | null;
  finalScore: number | null;
  boostsApplied: string[];
  penaltiesApplied: string[];
  distance: number | null;
  reason: string;
  imageUrl: string | null;
  aiMetadata: Record<string, unknown>;
  embeddingTextPreview: string | null;
  status: string | null;
  itemLifecycleStatus: string | null;
};

type RetrievalResponse = {
  query: string;
  retrievalQueryText: string;
  limit: number;
  results: RetrievalResultItem[];
  categoryBuckets: Record<string, RetrievalResultItem[]>;
  diagnostics?: Record<string, unknown>;
};

type OutfitCandidateItem = RetrievalResultItem & {
  role: string;
  canonicalRole: string;
  allowedRole: string;
  sourceRole?: string;
  sourceCategory?: string | null;
  sourceAiMetadataCategory?: string | null;
};

type OutfitContextResponse = {
  query: string;
  retrievalPlan: Record<string, unknown>;
  candidates: Record<string, OutfitCandidateItem[]>;
  diagnostics: Record<string, unknown>;
};

type OutfitItem = {
  itemId: string;
  role: string;
  canonicalRole?: string;
  allowedRole?: string;
  sourceRole?: string;
  sourceCategory?: string | null;
  sourceAiMetadataCategory?: string | null;
  name: string;
  category: string;
  subcategory?: string;
  brand?: string;
  colors: string[];
  imageUrl: string | null;
  reason: string;
  aiMetadata: Record<string, unknown>;
  effectiveFormality?: number;
};

type OutfitRecommendation = {
  outfitId: string;
  title: string;
  vibe: string;
  occasion: string;
  formality: string;
  items: OutfitItem[];
  explanation: string;
  stylingTips: string[];
  missingItems: string[];
  confidence: number;
  scoreBreakdown: Record<string, unknown>;
};

type OutfitGenerationResponse = {
  query: string;
  retrievalPlan: Record<string, unknown>;
  outfits: OutfitRecommendation[];
  diagnostics?: Record<string, unknown>;
};

type AgentMode = "auto" | "generate_outfit" | "refine_outfit" | "explain_outfit" | "feedback";

type AgentSuggestedAction = {
  id: string;
  label: string;
  type: string;
  payload?: Record<string, unknown>;
};

type AgentResponse = {
  mode: string;
  intent: Record<string, unknown>;
  message: string;
  suggestedActions: AgentSuggestedAction[];
  outfits?: OutfitRecommendation[];
  styleMemorySummary?: {
    profileSummary: string;
    positiveMemoryCount: number;
    negativeMemoryCount: number;
    warnings: string[];
  };
  explanation?: {
    outfitId?: string;
    title?: string;
    itemRationales: {
      itemId: string;
      name: string;
      role: string;
      reason: string;
    }[];
    scoreBreakdown?: Record<string, unknown>;
  };
  feedback?: {
    feedbackType?: string;
    recorded: boolean;
    message: string;
  };
  diagnostics?: Record<string, unknown>;
};

type AgentNodeTiming = {
  node: string;
  durationMs: number;
  status: string;
};

type OutfitValidationWarningItem = {
  outfitIndex: number;
  issue: string;
  action: string;
};

type StyleMemoryDiagnostics = {
  returnedMemoryCount: number;
  excludedMemoryCount: number;
  excludedMemoriesPreview: unknown[];
  embeddingDimensions: number;
  inputOccasion: string | null;
  inferredOccasion: string | null;
  resolvedOccasion: string | null;
  occasionSource: string | null;
  warnings: unknown[];
};

type StyleMemoryScoreItem = {
  id: string;
  text: string;
  polarity: string;
  type: string;
  semanticScore: number | null;
  styleMemoryDistance: number | null;
  occasionCompatibility: number | null;
  finalMemoryScore: number | null;
};

type StyleProfileWarningData = {
  broadCategories: string[];
  broadColors: string[];
};

const BROAD_AVOIDED_CATEGORIES = new Set(["top", "bottom", "footwear", "accessory", "one_piece", "one piece"]);
const BROAD_AVOIDED_COLORS = new Set(["black", "white", "blue", "gray", "grey", "beige", "brown", "navy"]);
const CLIENT_VECTOR_KEYS = new Set(["embeddingVector", "embeddingRaw", "_values", "vector", "rawVector", "queryVector"]);

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scoreText(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "none";
}

function percentText(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : "0.0%";
}

function metricValue(record: Record<string, unknown> | undefined, key: string): number {
  return numberValue(record?.[key]);
}

function auraMetricsResponse(value: unknown): AuraMetricsResponse | null {
  if (!isRecord(value) || numberValue(value.metricsVersion) < 1) return null;
  const required = [
    "wardrobe",
    "retrieval",
    "outfitGeneration",
    "agent",
    "styleMemory",
    "savedOutfits",
    "calendar",
    "reliability",
  ];
  if (!required.every((key) => isRecord(value[key]))) return null;
  return value as AuraMetricsResponse;
}

function auraResumeMetricsResponse(value: unknown): AuraResumeMetricsResponse | null {
  if (!isRecord(value) || !Array.isArray(value.resumeBullets)) return null;
  return {
    wardrobeItemsIndexed: numberValue(value.wardrobeItemsIndexed),
    embeddingCoveragePercent: numberValue(value.embeddingCoveragePercent),
    generatedOutfitsCount: numberValue(value.generatedOutfitsCount),
    agentRunsCount: numberValue(value.agentRunsCount),
    savedOutfitsCount: numberValue(value.savedOutfitsCount),
    wearEventsCount: numberValue(value.wearEventsCount),
    styleMemoriesCount: numberValue(value.styleMemoriesCount),
    feedbackActionsCount: numberValue(value.feedbackActionsCount),
    averageAgentLatencyMs: numberValue(value.averageAgentLatencyMs),
    validationSuccessRate: numberValue(value.validationSuccessRate),
    repairRate: numberValue(value.repairRate),
    langGraphEnabled: value.langGraphEnabled === true,
    featureSummary: String(value.featureSummary ?? ""),
    resumeBullets: value.resumeBullets.map((entry) => String(entry)).filter(Boolean),
  };
}

function roleCategory(value: unknown): string | null {
  const text = nullableText(value)?.toLowerCase().replace(/\s+/g, "_") ?? null;
  if (!text) return null;
  if (text === "shoes" || text === "shoe") return "footwear";
  if (text === "one_piece" || text === "one-piece" || text === "one piece") return "one_piece";
  return text;
}

function debugItems(value: unknown): BackfillDebugItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      itemId: String(item.itemId ?? ""),
      name: String(item.name ?? "Untitled item"),
      category: String(item.category ?? "unknown"),
      reason: String(item.reason ?? "unknown"),
    }));
}

function nullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

function backfillDebugResponse(value: unknown): BackfillDebugResponse | null {
  if (!isRecord(value)) return null;
  const hasBackfillShape =
    "processed" in value ||
    "indexedItems" in value ||
    "skippedItems" in value ||
    "failedItems" in value;
  if (!hasBackfillShape) return null;
  return {
    processed: numberValue(value.processed),
    indexed: numberValue(value.indexed),
    skipped: numberValue(value.skipped),
    failed: numberValue(value.failed),
    indexedItems: debugItems(value.indexedItems),
    skippedItems: debugItems(value.skippedItems),
    failedItems: debugItems(value.failedItems),
    hasMore: value.hasMore === true,
    nextCursor: nullableText(value.nextCursor),
    totalBatchSize: numberValue(value.totalBatchSize),
    dryRun: value.dryRun === true,
  };
}

function fullBackfillResponse(value: unknown): FullBackfillResponse | null {
  if (!isRecord(value) || !("totalProcessed" in value)) return null;
  return {
    totalProcessed: numberValue(value.totalProcessed),
    totalIndexed: numberValue(value.totalIndexed),
    totalSkipped: numberValue(value.totalSkipped),
    totalFailed: numberValue(value.totalFailed),
    batchesExecuted: numberValue(value.batchesExecuted),
    dryRun: value.dryRun === true,
  };
}

function draftAuditItems(value: unknown): DraftAuditItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      itemId: String(item.itemId ?? ""),
      name: String(item.name ?? "Untitled item"),
      category: String(item.category ?? "unknown"),
      status: nullableText(item.status),
      isDraft: item.isDraft === true,
      itemLifecycleStatus: nullableText(item.itemLifecycleStatus),
      draftState: nullableText(item.draftState),
      ingestionStatus: nullableText(item.ingestionStatus),
      nestedIngestionStatus: nullableText(item.nestedIngestionStatus),
      createdAt: item.createdAt === undefined ? null : item.createdAt as string | number | null,
      updatedAt: item.updatedAt === undefined ? null : item.updatedAt as string | number | null,
      imageUrl: nullableText(item.imageUrl),
      reason: String(item.reason ?? "unknown"),
    }));
}

function draftAuditResponse(value: unknown): DraftAuditResponse | null {
  if (!isRecord(value) || !("draftItems" in value)) return null;
  return {
    totalChecked: numberValue(value.totalChecked),
    hiddenDraftCount: numberValue(value.hiddenDraftCount),
    trueDraftCount: numberValue(value.trueDraftCount),
    needsReviewCount: numberValue(value.needsReviewCount),
    candidateCount: numberValue(value.candidateCount),
    failedCount: numberValue(value.failedCount),
    pendingIngestionCount: numberValue(value.pendingIngestionCount),
    readyVisibleCount: numberValue(value.readyVisibleCount),
    indexedReadyCount: numberValue(value.indexedReadyCount),
    missingEmbeddingReadyCount: numberValue(value.missingEmbeddingReadyCount),
    draftItems: draftAuditItems(value.draftItems),
  };
}

function draftCleanupItems(value: unknown): DraftCleanupItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      itemId: String(item.itemId ?? ""),
      name: String(item.name ?? "Untitled item"),
      category: String(item.category ?? "unknown"),
      createdAt: item.createdAt === undefined ? null : item.createdAt as string | number | null,
      updatedAt: item.updatedAt === undefined ? null : item.updatedAt as string | number | null,
      draftState: nullableText(item.draftState),
      itemLifecycleStatus: nullableText(item.itemLifecycleStatus),
      reason: String(item.reason ?? "unknown"),
    }));
}

function draftCleanupPreviewResponse(value: unknown): DraftCleanupPreviewResponse | null {
  if (!isRecord(value) || !("deleteCandidateCount" in value) || !("candidates" in value)) return null;
  return {
    cutoffDays: numberValue(value.cutoffDays),
    cutoffTimestamp: numberValue(value.cutoffTimestamp),
    totalChecked: numberValue(value.totalChecked),
    deleteCandidateCount: numberValue(value.deleteCandidateCount),
    candidates: draftCleanupItems(value.candidates),
  };
}

function draftCleanupBulkResponse(value: unknown): DraftCleanupBulkResponse | null {
  if (!isRecord(value) || !("deletedCount" in value) || !("deletedItems" in value)) return null;
  return {
    cutoffDays: numberValue(value.cutoffDays),
    totalChecked: numberValue(value.totalChecked),
    deletedCount: numberValue(value.deletedCount),
    skippedCount: numberValue(value.skippedCount),
    deletedItems: draftCleanupItems(value.deletedItems),
    skippedItems: draftCleanupItems(value.skippedItems),
  };
}

function retrievalItems(value: unknown): RetrievalResultItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      itemId: String(item.itemId ?? ""),
      name: String(item.name ?? "Untitled item"),
      category: String(item.category ?? "unknown"),
      role: nullableText(item.role) ?? undefined,
      canonicalRole: nullableText(item.canonicalRole) ?? undefined,
      allowedRole: nullableText(item.allowedRole) ?? undefined,
      sourceRole: nullableText(item.sourceRole) ?? undefined,
      sourceCategory: nullableText(item.sourceCategory),
      sourceAiMetadataCategory: nullableText(item.sourceAiMetadataCategory),
      subcategory: nullableText(item.subcategory) ?? undefined,
      brand: nullableText(item.brand) ?? undefined,
      colors: Array.isArray(item.colors) ? item.colors.map((color) => String(color)) : [],
      score: item.score === null || item.score === undefined ? null : numberValue(item.score),
      vectorScore: item.vectorScore === null || item.vectorScore === undefined ? null : numberValue(item.vectorScore),
      finalScore: item.finalScore === null || item.finalScore === undefined ? null : numberValue(item.finalScore),
      boostsApplied: Array.isArray(item.boostsApplied) ? item.boostsApplied.map((entry) => String(entry)) : [],
      penaltiesApplied: Array.isArray(item.penaltiesApplied) ? item.penaltiesApplied.map((entry) => String(entry)) : [],
      distance: item.distance === null || item.distance === undefined ? null : numberValue(item.distance),
      reason: String(item.reason ?? "semantically similar wardrobe match"),
      imageUrl: nullableText(item.imageUrl),
      aiMetadata: isRecord(item.aiMetadata) ? item.aiMetadata : {},
      embeddingTextPreview: nullableText(item.embeddingTextPreview),
      status: nullableText(item.status),
      itemLifecycleStatus: nullableText(item.itemLifecycleStatus),
    }));
}

function retrievalResponse(value: unknown): RetrievalResponse | null {
  if (!isRecord(value) || !("retrievalQueryText" in value) || !("results" in value)) return null;
  const results = retrievalItems(value.results);
  const categoryBuckets: Record<string, RetrievalResultItem[]> = {};
  if (isRecord(value.categoryBuckets)) {
    for (const [bucket, items] of Object.entries(value.categoryBuckets)) {
      categoryBuckets[bucket] = retrievalItems(items);
    }
  }
  return {
    query: String(value.query ?? ""),
    retrievalQueryText: String(value.retrievalQueryText ?? ""),
    limit: numberValue(value.limit),
    results,
    categoryBuckets,
    diagnostics: isRecord(value.diagnostics) ? value.diagnostics : undefined,
  };
}

function outfitCandidateRecords(value: unknown): OutfitCandidateItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      ...retrievalItems([item])[0],
      role: String(item.role ?? item.category ?? "unknown"),
      canonicalRole: String(item.canonicalRole ?? item.role ?? item.category ?? "unknown"),
      allowedRole: String(item.allowedRole ?? item.canonicalRole ?? item.role ?? item.category ?? "unknown"),
      sourceRole: nullableText(item.sourceRole) ?? undefined,
      sourceCategory: nullableText(item.sourceCategory),
      sourceAiMetadataCategory: nullableText(item.sourceAiMetadataCategory),
    }));
}

function outfitContextResponse(value: unknown): OutfitContextResponse | null {
  if (!isRecord(value) || !("candidates" in value) || !("retrievalPlan" in value)) return null;
  const candidates: Record<string, OutfitCandidateItem[]> = {};
  if (isRecord(value.candidates)) {
    for (const [role, items] of Object.entries(value.candidates)) {
      candidates[role] = outfitCandidateRecords(items);
    }
  }
  return {
    query: String(value.query ?? ""),
    retrievalPlan: isRecord(value.retrievalPlan) ? value.retrievalPlan : {},
    candidates,
    diagnostics: isRecord(value.diagnostics) ? value.diagnostics : {},
  };
}

function outfitItems(value: unknown): OutfitItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      itemId: String(item.itemId ?? ""),
      role: String(item.role ?? "unknown"),
      canonicalRole: nullableText(item.canonicalRole) ?? undefined,
      allowedRole: nullableText(item.allowedRole) ?? undefined,
      sourceRole: nullableText(item.sourceRole) ?? undefined,
      sourceCategory: nullableText(item.sourceCategory),
      sourceAiMetadataCategory: nullableText(item.sourceAiMetadataCategory),
      name: String(item.name ?? "Untitled item"),
      category: String(item.category ?? "unknown"),
      subcategory: nullableText(item.subcategory) ?? undefined,
      brand: nullableText(item.brand) ?? undefined,
      colors: Array.isArray(item.colors) ? item.colors.map(String) : [],
      imageUrl: nullableText(item.imageUrl),
      reason: String(item.reason ?? ""),
      aiMetadata: isRecord(item.aiMetadata) ? item.aiMetadata : {},
      effectiveFormality: item.effectiveFormality === undefined ? undefined : numberValue(item.effectiveFormality),
    }));
}

function outfitRecommendations(value: unknown): OutfitRecommendation[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((outfit) => ({
      outfitId: String(outfit.outfitId ?? ""),
      title: String(outfit.title ?? "Closet Outfit"),
      vibe: String(outfit.vibe ?? ""),
      occasion: String(outfit.occasion ?? ""),
      formality: String(outfit.formality ?? ""),
      items: outfitItems(outfit.items),
      explanation: String(outfit.explanation ?? ""),
      stylingTips: Array.isArray(outfit.stylingTips) ? outfit.stylingTips.map(String) : [],
      missingItems: Array.isArray(outfit.missingItems) ? outfit.missingItems.map(String) : [],
      confidence: numberValue(outfit.confidence),
      scoreBreakdown: isRecord(outfit.scoreBreakdown) ? outfit.scoreBreakdown : {},
    }));
}

function outfitGenerationResponse(value: unknown): OutfitGenerationResponse | null {
  if (!isRecord(value) || !("outfits" in value) || !("retrievalPlan" in value)) return null;
  return {
    query: String(value.query ?? ""),
    retrievalPlan: isRecord(value.retrievalPlan) ? value.retrievalPlan : {},
    outfits: outfitRecommendations(value.outfits),
    diagnostics: isRecord(value.diagnostics) ? value.diagnostics : undefined,
  };
}

function agentResponse(value: unknown): AgentResponse | null {
  if (!isRecord(value) || !("mode" in value) || !("intent" in value) || !("suggestedActions" in value)) return null;
  return {
    mode: String(value.mode ?? "unknown"),
    intent: isRecord(value.intent) ? value.intent : {},
    message: String(value.message ?? ""),
    suggestedActions: Array.isArray(value.suggestedActions)
      ? value.suggestedActions.filter(isRecord).map((action) => ({
        id: String(action.id ?? action.label ?? "action"),
        label: String(action.label ?? "Action"),
        type: String(action.type ?? "debug"),
        payload: isRecord(action.payload) ? action.payload : undefined,
      }))
      : [],
    outfits: Array.isArray(value.outfits) ? outfitRecommendations(value.outfits) : undefined,
    styleMemorySummary: isRecord(value.styleMemorySummary)
      ? {
        profileSummary: String(value.styleMemorySummary.profileSummary ?? ""),
        positiveMemoryCount: numberValue(value.styleMemorySummary.positiveMemoryCount),
        negativeMemoryCount: numberValue(value.styleMemorySummary.negativeMemoryCount),
        warnings: Array.isArray(value.styleMemorySummary.warnings)
          ? value.styleMemorySummary.warnings.map(String)
          : [],
      }
      : undefined,
    explanation: isRecord(value.explanation)
      ? {
        outfitId: nullableText(value.explanation.outfitId) ?? undefined,
        title: nullableText(value.explanation.title) ?? undefined,
        itemRationales: Array.isArray(value.explanation.itemRationales)
          ? value.explanation.itemRationales.filter(isRecord).map((item) => ({
            itemId: String(item.itemId ?? ""),
            name: String(item.name ?? "Closet item"),
            role: String(item.role ?? "item"),
            reason: String(item.reason ?? ""),
          }))
          : [],
        scoreBreakdown: isRecord(value.explanation.scoreBreakdown) ? value.explanation.scoreBreakdown : undefined,
      }
      : undefined,
    feedback: isRecord(value.feedback)
      ? {
        feedbackType: nullableText(value.feedback.feedbackType) ?? undefined,
        recorded: value.feedback.recorded === true,
        message: String(value.feedback.message ?? ""),
      }
      : undefined,
    diagnostics: isRecord(value.diagnostics) ? value.diagnostics : undefined,
  };
}

function outfitValidationWarningItems(value: unknown): OutfitValidationWarningItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((warning) => ({
      outfitIndex: numberValue(warning.outfitIndex),
      issue: String(warning.issue ?? "Unknown validation warning"),
      action: String(warning.action ?? "warning"),
    }));
}

function styleMemoryDiagnostics(value: unknown): StyleMemoryDiagnostics | null {
  if (!isRecord(value) || !isRecord(value.diagnostics)) return null;
  const diagnostics = value.diagnostics;
  if (!("returnedMemoryCount" in diagnostics) && !("excludedMemoriesPreview" in diagnostics)) return null;
  return {
    returnedMemoryCount: numberValue(diagnostics.returnedMemoryCount),
    excludedMemoryCount: numberValue(diagnostics.excludedMemoryCount),
    excludedMemoriesPreview: Array.isArray(diagnostics.excludedMemoriesPreview)
      ? diagnostics.excludedMemoriesPreview
      : [],
    embeddingDimensions: numberValue(diagnostics.embeddingDimensions),
    inputOccasion: nullableText(diagnostics.inputOccasion),
    inferredOccasion: nullableText(diagnostics.inferredOccasion),
    resolvedOccasion: nullableText(diagnostics.resolvedOccasion),
    occasionSource: nullableText(diagnostics.occasionSource),
    warnings: Array.isArray(diagnostics.warnings) ? diagnostics.warnings : [],
  };
}

function styleMemoryScoreItems(value: unknown): StyleMemoryScoreItem[] {
  if (!isRecord(value)) return [];
  const entries = [
    ...(Array.isArray(value.positiveMemories) ? value.positiveMemories : []),
    ...(Array.isArray(value.negativeMemories) ? value.negativeMemories : []),
  ];
  return entries
    .filter(isRecord)
    .map((memory) => ({
      id: String(memory.id ?? ""),
      text: String(memory.text ?? ""),
      polarity: String(memory.polarity ?? ""),
      type: String(memory.type ?? ""),
      semanticScore: memory.semanticScore === undefined ? null : numberValue(memory.semanticScore),
      styleMemoryDistance: memory.styleMemoryDistance === undefined ? null : numberValue(memory.styleMemoryDistance),
      occasionCompatibility: memory.occasionCompatibility === undefined ? null : numberValue(memory.occasionCompatibility),
      finalMemoryScore: memory.finalMemoryScore === undefined ? null : numberValue(memory.finalMemoryScore),
    }));
}

function styleProfileRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.profileSignals)) return value.profileSignals;
  if (isRecord(value.styleProfilePreview)) return value.styleProfilePreview;
  if (isRecord(value.profile)) return value.profile;
  return null;
}

function signalValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((entry) => String(entry.value ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function styleProfileWarningData(value: unknown): StyleProfileWarningData | null {
  const profile = styleProfileRecord(value);
  if (!profile) return null;
  const broadCategories = signalValues(profile.avoidedCategories).filter((entry) => BROAD_AVOIDED_CATEGORIES.has(entry));
  const broadColors = signalValues(profile.avoidedColors).filter((entry) => BROAD_AVOIDED_COLORS.has(entry));
  if (!broadCategories.length && !broadColors.length) return null;
  return {
    broadCategories: [...new Set(broadCategories)],
    broadColors: [...new Set(broadColors)],
  };
}

function vectorLeakPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => vectorLeakPaths(entry, `${path}[${index}]`));
  }
  if (!isRecord(value)) return [];
  const paths: string[] = [];
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (CLIENT_VECTOR_KEYS.has(key)) {
      paths.push(nextPath);
      continue;
    }
    paths.push(...vectorLeakPaths(entry, nextPath));
  }
  return paths.slice(0, 20);
}

function errorPayload(error: unknown) {
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    name?: unknown;
    stack?: unknown;
  };
  return {
    name: typeof candidate?.name === "string" ? candidate.name : "Error",
    code: typeof candidate?.code === "string" ? candidate.code : undefined,
    message: typeof candidate?.message === "string" ? candidate.message : String(error),
    details: candidate?.details,
    stack: __DEV__ && typeof candidate?.stack === "string" ? candidate.stack : undefined,
  };
}

function ProductionUnavailable() {
  const { colors } = useAppTheme();
  return (
    <SafeScreen backgroundColor={colors.background} style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <Text style={[auraTypography.body, { color: colors.text, textAlign: "center" }]}>
        Intelligence Debug unavailable in production.
      </Text>
    </SafeScreen>
  );
}

function DebugButton({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "tertiary" | "danger";
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        ...auraButtonStyle(colors, variant, disabled),
        opacity: disabled ? 0.55 : pressed ? 0.82 : 1,
      })}
    >
      <Text style={auraButtonTextStyle(colors, variant, disabled)}>{label}</Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text style={[auraTypography.caption, { color: colors.textSecondary, fontWeight: "700" }]}>
      {children}
    </Text>
  );
}

function inputStyle(colors: ReturnType<typeof useAppTheme>["colors"]): TextStyle {
  return {
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceInteractive,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  };
}

function ToggleRow({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        ...auraCardStyle(colors, "inset"),
        minHeight: 54,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Text style={[auraTypography.bodySecondary, { color: colors.text, fontWeight: "700" }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={disabled ? undefined : onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderStrong, true: colors.purpleSurface }}
        thumbColor={value ? colors.ctaCream : colors.textSecondary}
      />
    </View>
  );
}

function FormalityOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 38,
        borderRadius: 999,
        paddingHorizontal: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? colors.secondaryCta : colors.surfaceInteractive,
        borderWidth: 1,
        borderColor: selected ? colors.purpleBorder : colors.border,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <Text style={[auraTypography.chipLabel, { color: selected ? colors.textPrimary : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function JsonCard({
  title,
  data,
  tone = "default",
}: {
  title: string;
  data: unknown;
  tone?: "default" | "error" | "status";
}) {
  const { colors } = useAppTheme();
  const text = typeof data === "string" ? data : prettyJson(data);
  const borderColor = tone === "error" ? colors.dangerBorder : tone === "status" ? colors.purpleBorder : colors.border;
  return (
    <View style={{ ...auraCardStyle(colors, "card"), borderColor, gap: 10 }}>
      <Text style={[auraTypography.cardTitle, { color: tone === "error" ? colors.danger : colors.text }]}>
        {title}
      </Text>
      <Text
        selectable
        style={{
          color: tone === "error" ? colors.danger : colors.textSecondary,
          fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
          fontSize: 12,
          lineHeight: 18,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ flex: 1, minWidth: 72, gap: 3 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text, textAlign: "center" }]}>{value}</Text>
      <Text style={[auraTypography.caption, { color: colors.textSecondary, textAlign: "center" }]}>{label}</Text>
    </View>
  );
}

function MetricsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "inset"), gap: 8 }}>
      <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>{title}</Text>
      {children}
    </View>
  );
}

function MetricsSnapshotCard({ data }: { data: AuraMetricsResponse }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>AURA Metrics Snapshot</Text>
      <MetricsGroup title="Wardrobe Coverage">
        <DetailLine label="Ready visible" value={String(metricValue(data.wardrobe, "readyVisibleItems"))} />
        <DetailLine label="Indexed ready" value={String(metricValue(data.wardrobe, "indexedReadyItems"))} />
        <DetailLine label="Missing embeddings" value={String(metricValue(data.wardrobe, "missingEmbeddingReadyItems"))} />
        <DetailLine label="Coverage" value={percentText(data.wardrobe.embeddingCoveragePercent)} />
      </MetricsGroup>
      <MetricsGroup title="Agent">
        <DetailLine label="Total runs" value={String(metricValue(data.agent, "totalAgentRuns"))} />
        <DetailLine label="Successful runs" value={String(metricValue(data.agent, "successfulAgentRuns"))} />
        <DetailLine label="Average latency" value={`${metricValue(data.agent, "averageGraphDurationMs")} ms`} />
        <DetailLine label="LangGraph runs" value={String(metricValue(data.agent, "langGraphRunCount"))} />
        <DetailLine label="Internal fallback runs" value={String(metricValue(data.agent, "internalRunnerFallbackCount"))} />
      </MetricsGroup>
      <MetricsGroup title="Outfit Generation">
        <DetailLine label="Requests" value={String(metricValue(data.outfitGeneration, "totalGenerationRequests"))} />
        <DetailLine label="Generated outfits" value={String(metricValue(data.outfitGeneration, "returnedOutfitCountTotal"))} />
        <DetailLine label="Average returned" value={scoreText(data.outfitGeneration.averageReturnedOutfitCount)} />
        <DetailLine label="Average score" value={scoreText(data.outfitGeneration.averageOutfitScore)} />
        <DetailLine label="Repair rate" value={percentText(metricValue(data.outfitGeneration, "repairRate") * 100)} />
      </MetricsGroup>
      <MetricsGroup title="Style Memory">
        <DetailLine label="Total memories" value={String(metricValue(data.styleMemory, "totalMemories"))} />
        <DetailLine label="Active memories" value={String(metricValue(data.styleMemory, "activeMemories"))} />
        <DetailLine label="Positive / negative" value={`${metricValue(data.styleMemory, "positiveMemories")} / ${metricValue(data.styleMemory, "negativeMemories")}`} />
        <DetailLine label="Feedback actions" value={String(metricValue(data.styleMemory, "totalFeedbackActions"))} />
      </MetricsGroup>
      <MetricsGroup title="Saved / Calendar">
        <DetailLine label="Saved outfits" value={String(metricValue(data.savedOutfits, "totalSavedOutfits"))} />
        <DetailLine label="Wear events" value={String(metricValue(data.calendar, "totalWearEvents"))} />
        <DetailLine label="Planned events" value={String(metricValue(data.calendar, "totalPlannedEvents"))} />
        <DetailLine label="Weather warnings" value={String(metricValue(data.calendar, "weatherWarningsGenerated"))} />
      </MetricsGroup>
      <MetricsGroup title="Reliability">
        <DetailLine label="Recent errors" value={String(metricValue(data.reliability, "recentErrorCount"))} />
        <DetailLine label="Timeouts" value={String(metricValue(data.reliability, "timeoutCount"))} />
        <DetailLine label="Fallbacks" value={String(metricValue(data.reliability, "fallbackCount"))} />
      </MetricsGroup>
    </View>
  );
}

function ResumeMetricsCard({ data }: { data: AuraResumeMetricsResponse }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Resume Metrics</Text>
      <Text selectable style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        {data.featureSummary}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Indexed" value={data.wardrobeItemsIndexed} />
        <SummaryMetric label="Outfits" value={data.generatedOutfitsCount} />
        <SummaryMetric label="Agent runs" value={data.agentRunsCount} />
        <SummaryMetric label="Memories" value={data.styleMemoriesCount} />
      </View>
      <Text
        selectable
        style={{
          color: colors.textSecondary,
          fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
          fontSize: 12,
          lineHeight: 18,
        }}
      >
        {data.resumeBullets.map((bullet) => `- ${bullet}`).join("\n")}
      </Text>
    </View>
  );
}

function BackfillSummaryCard({ data }: { data: BackfillDebugResponse }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Backfill Summary</Text>
        <Text style={[auraTypography.caption, { color: colors.textSecondary, fontWeight: "700" }]}>
          {data.dryRun ? "Dry run" : "Writes enabled"} · Batch {data.totalBatchSize}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Processed" value={data.processed} />
        <SummaryMetric label="Indexed" value={data.indexed} />
        <SummaryMetric label="Skipped" value={data.skipped} />
        <SummaryMetric label="Failed" value={data.failed} />
      </View>
    </View>
  );
}

function CursorCard({ data }: { data: BackfillDebugResponse }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 8 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Current Cursor</Text>
      <DetailLine label="hasMore" value={String(data.hasMore)} />
      <DetailLine label="nextCursor" value={data.nextCursor ?? "none"} />
    </View>
  );
}

function FullBackfillSummaryCard({ data }: { data: FullBackfillResponse }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Full Backfill Summary</Text>
        <Text style={[auraTypography.caption, { color: colors.textSecondary, fontWeight: "700" }]}>
          {data.dryRun ? "Dry run" : "Writes enabled"}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Total Processed" value={data.totalProcessed} />
        <SummaryMetric label="Total Indexed" value={data.totalIndexed} />
        <SummaryMetric label="Total Skipped" value={data.totalSkipped} />
        <SummaryMetric label="Total Failed" value={data.totalFailed} />
        <SummaryMetric label="Batches Executed" value={data.batchesExecuted} />
      </View>
    </View>
  );
}

function RetrievalSummaryCard({ data }: { data: RetrievalResponse }) {
  const { colors } = useAppTheme();
  const topScore = data.results[0]?.score;
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Wardrobe Retrieval Summary</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Results" value={data.results.length} />
        <SummaryMetric label="Limit" value={data.limit} />
      </View>
      <DetailLine label="Query" value={data.query} />
      <DetailLine label="Top score" value={topScore === null || topScore === undefined ? "none" : topScore.toFixed(3)} />
      <Text selectable style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        {data.retrievalQueryText}
      </Text>
    </View>
  );
}

function RetrievalBucketsCard({ data }: { data: RetrievalResponse }) {
  const { colors } = useAppTheme();
  const bucketNames = ["top", "bottom", "footwear", "outerwear", "accessory", "one_piece", "unknown"];
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Category Buckets</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {bucketNames.map((bucket) => (
          <SummaryMetric key={bucket} label={bucket.replace("_", " ")} value={data.categoryBuckets[bucket]?.length ?? 0} />
        ))}
      </View>
    </View>
  );
}

function RetrievalResultCard({ item }: { item: RetrievalResultItem }) {
  const { colors } = useAppTheme();
  const aiMetadataCategory = typeof item.aiMetadata.category === "string" ? item.aiMetadata.category : null;
  const canonicalAiMetadataCategory = aiMetadataCategory === "shoes" ? "footwear" : aiMetadataCategory;
  const categoryMismatch = Boolean(canonicalAiMetadataCategory && canonicalAiMetadataCategory !== item.category);
  return (
    <View style={{ ...auraCardStyle(colors, "inset"), gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={{
              width: 68,
              height: 82,
              borderRadius: 14,
              backgroundColor: colors.surfaceMuted,
            }}
            resizeMode="cover"
          />
        ) : null}
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>
            {item.name || "Untitled item"}
          </Text>
          <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
            {item.itemId}
          </Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
            {item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}
          </Text>
          {categoryMismatch ? (
            <View
              style={{
                alignSelf: "flex-start",
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: colors.dangerSurface,
                borderWidth: 1,
                borderColor: colors.dangerBorder,
              }}
            >
              <Text style={[auraTypography.caption, { color: colors.danger, fontWeight: "800" }]}>
                Category mismatch
              </Text>
            </View>
          ) : null}
          <Text style={[auraTypography.bodySecondary, { color: colors.text, fontWeight: "700" }]}>
            {item.reason}
          </Text>
        </View>
      </View>
      <View style={{ gap: 3 }}>
        {item.role ? <DetailLine label="Candidate role" value={item.role} /> : null}
        {item.canonicalRole ? <DetailLine label="canonicalRole" value={item.canonicalRole} /> : null}
        {item.allowedRole ? <DetailLine label="allowedRole" value={item.allowedRole} /> : null}
        {item.sourceRole ? <DetailLine label="sourceRole" value={item.sourceRole} /> : null}
        {item.sourceCategory ? <DetailLine label="sourceCategory" value={item.sourceCategory} /> : null}
        {item.sourceAiMetadataCategory ? (
          <DetailLine label="source aiMetadata.category" value={item.sourceAiMetadataCategory} />
        ) : null}
        <DetailLine label="Brand" value={item.brand} />
        <DetailLine label="Category" value={item.category} />
        <DetailLine label="aiMetadata.category" value={aiMetadataCategory} />
        <DetailLine label="Colors" value={item.colors.join(", ")} />
        <DetailLine label="Vector score" value={item.vectorScore === null ? "none" : item.vectorScore.toFixed(3)} />
        <DetailLine label="Final score" value={item.finalScore === null ? "none" : item.finalScore.toFixed(3)} />
        <DetailLine label="Score" value={item.score === null ? "none" : item.score.toFixed(3)} />
        <DetailLine label="Distance" value={item.distance === null ? "none" : item.distance.toFixed(6)} />
        <DetailLine label="Status" value={item.status} />
        <DetailLine label="Lifecycle" value={item.itemLifecycleStatus} />
      </View>
      {item.boostsApplied.length ? (
        <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
          Boosts: {item.boostsApplied.join(" | ")}
        </Text>
      ) : null}
      {item.penaltiesApplied.length ? (
        <Text selectable style={[auraTypography.caption, { color: colors.danger }]}>
          Penalties: {item.penaltiesApplied.join(" | ")}
        </Text>
      ) : null}
      {item.embeddingTextPreview ? (
        <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
          {item.embeddingTextPreview}
        </Text>
      ) : null}
    </View>
  );
}

function OutfitContextCard({ data }: { data: OutfitContextResponse }) {
  const { colors } = useAppTheme();
  const roles = ["top", "bottom", "footwear", "outerwear", "accessory", "one_piece"];
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Outfit Context Summary</Text>
      <DetailLine label="Query" value={data.query} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {roles.map((role) => (
          <SummaryMetric key={role} label={role.replace("_", " ")} value={data.candidates[role]?.length ?? 0} />
        ))}
      </View>
    </View>
  );
}

function OutfitCandidateSection({ role, items }: { role: string; items: OutfitCandidateItem[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>{role.replace("_", " ")} Candidates</Text>
      {items.length ? (
        items.slice(0, 4).map((item) => (
          <RetrievalResultCard key={`${role}-${item.itemId}`} item={item} />
        ))
      ) : (
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          No candidates returned for {role}.
        </Text>
      )}
    </View>
  );
}

function OutfitRecommendationCard({
  outfit,
  onFeedback,
  feedbackDisabled,
}: {
  outfit: OutfitRecommendation;
  onFeedback?: (outfit: OutfitRecommendation, feedbackType: FeedbackType) => void;
  feedbackDisabled?: boolean;
}) {
  const { colors } = useAppTheme();
  const totalScore = numberValue(outfit.scoreBreakdown.total);
  const colorReasons = Array.isArray(outfit.scoreBreakdown.colorCoherenceReasons)
    ? outfit.scoreBreakdown.colorCoherenceReasons.map(String)
    : [];
  const diversityPenalties = Array.isArray(outfit.scoreBreakdown.diversityPenalties)
    ? outfit.scoreBreakdown.diversityPenalties.map(String)
    : [];
  const penalties = Array.isArray(outfit.scoreBreakdown.penalties)
    ? outfit.scoreBreakdown.penalties.map(String)
    : [];
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text style={[auraTypography.cardTitle, { color: colors.text }]}>{outfit.title}</Text>
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          {outfit.vibe} · {outfit.occasion} · {outfit.formality}
        </Text>
        <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
          Confidence {outfit.confidence.toFixed(2)} · Score {totalScore.toFixed(2)}
        </Text>
      </View>
      <View style={{ ...auraCardStyle(colors, "inset"), gap: 6 }}>
        <Text style={[auraTypography.bodySecondary, { color: colors.text, fontWeight: "800" }]}>Score</Text>
        <DetailLine label="total" value={scoreText(outfit.scoreBreakdown.total)} />
        <DetailLine label="categoryCompleteness" value={scoreText(outfit.scoreBreakdown.categoryCompleteness)} />
        <DetailLine label="occasionFit" value={scoreText(outfit.scoreBreakdown.occasionFit)} />
        <DetailLine label="colorCoherence" value={scoreText(outfit.scoreBreakdown.colorCoherence)} />
        <DetailLine label="formalityFit" value={scoreText(outfit.scoreBreakdown.formalityFit)} />
        <DetailLine label="targetFormality" value={outfit.scoreBreakdown.targetFormality} />
        <DetailLine label="diversityScore" value={scoreText(outfit.scoreBreakdown.diversityScore)} />
        <DetailLine label="retrievalStrength" value={scoreText(outfit.scoreBreakdown.retrievalStrength)} />
        {colorReasons.length ? (
          <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
            Color reasons: {colorReasons.join(" | ")}
          </Text>
        ) : null}
        {diversityPenalties.length ? (
          <Text selectable style={[auraTypography.caption, { color: colors.danger }]}>
            Diversity penalties: {diversityPenalties.join(" | ")}
          </Text>
        ) : null}
        {penalties.length ? (
          <Text selectable style={[auraTypography.caption, { color: colors.danger }]}>
            Penalties: {penalties.join(" | ")}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: 10 }}>
        {outfit.items.map((item) => {
          const rawCategory = typeof item.aiMetadata.category === "string" ? item.aiMetadata.category : null;
          const canonicalCategory = roleCategory(item.canonicalRole ?? item.allowedRole ?? item.role);
          const rawCategoryMismatch = Boolean(rawCategory && canonicalCategory && roleCategory(rawCategory) !== canonicalCategory);
          const rawFormality = Number(item.aiMetadata.formality);
          const hasFormalityMismatch = Number.isFinite(rawFormality) &&
            item.effectiveFormality !== undefined &&
            Math.abs(rawFormality - item.effectiveFormality) >= 1.5;
          return (
            <View key={`${outfit.outfitId}-${item.itemId}`} style={{ ...auraCardStyle(colors, "inset"), gap: 8 }}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={{
                      width: 62,
                      height: 74,
                      borderRadius: 14,
                      backgroundColor: colors.surfaceMuted,
                    }}
                    resizeMode="cover"
                  />
                ) : null}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>{item.name}</Text>
                  <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
                    {item.role} · {item.category}{item.subcategory ? ` · ${item.subcategory}` : ""}
                  </Text>
                  <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
                    {item.itemId}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {rawCategoryMismatch ? <WarningChip label="Category mismatch" /> : null}
                    {hasFormalityMismatch ? <WarningChip label="Formality corrected" /> : null}
                  </View>
                </View>
              </View>
              <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{item.reason}</Text>
              <View style={{ gap: 3 }}>
                <DetailLine label="Generated role" value={item.role} />
                <DetailLine label="canonicalRole" value={item.canonicalRole} />
                <DetailLine label="allowedRole" value={item.allowedRole} />
                <DetailLine label="sourceRole" value={item.sourceRole} />
                <DetailLine label="sourceCategory" value={item.sourceCategory} />
                <DetailLine label="source aiMetadata.category" value={item.sourceAiMetadataCategory} />
                <DetailLine label="aiMetadata.category" value={rawCategory} />
                <DetailLine label="raw aiMetadata.formality" value={Number.isFinite(rawFormality) ? rawFormality : null} />
                <DetailLine label="effectiveFormality" value={item.effectiveFormality} />
              </View>
            </View>
          );
        })}
      </View>
      <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{outfit.explanation}</Text>
      {outfit.stylingTips.length ? (
        <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
          Styling tips: {outfit.stylingTips.join(" | ")}
        </Text>
      ) : null}
      {outfit.missingItems.length ? (
        <Text style={[auraTypography.caption, { color: colors.danger }]}>
          Missing items: {outfit.missingItems.join(" | ")}
        </Text>
      ) : null}
      <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
        Score breakdown: {prettyJson(outfit.scoreBreakdown)}
      </Text>
      {onFeedback ? (
        <View style={{ gap: 8 }}>
          <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Record Feedback</Text>
          {[
            ["Like", "like"],
            ["Dislike", "dislike"],
            ["Save", "save"],
            ["Wear", "wear"],
            ["Not my vibe", "not_my_vibe"],
            ["More like this", "more_like_this"],
            ["Less like this", "less_like_this"],
            ["Too formal", "too_formal"],
            ["Too casual", "too_casual"],
            ["More streetwear", "more_streetwear"],
            ["Less streetwear", "less_streetwear"],
            ["More color", "more_color"],
            ["Less color", "less_color"],
          ].map(([label, feedbackType]) => (
            <DebugButton
              key={`${outfit.outfitId}-${feedbackType}`}
              label={label}
              onPress={() => onFeedback(outfit, feedbackType as FeedbackType)}
              disabled={feedbackDisabled}
              variant="secondary"
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OutfitValidationWarningsCard({ warnings }: { warnings: OutfitValidationWarningItem[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Validation Warnings</Text>
      {warnings.map((warning, index) => (
        <View key={`${warning.outfitIndex}-${warning.action}-${index}`} style={{ ...auraCardStyle(colors, "inset"), gap: 4 }}>
          <DetailLine label="Outfit index" value={warning.outfitIndex + 1} />
          <DetailLine label="Action" value={warning.action} />
          <Text selectable style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
            {warning.issue}
          </Text>
        </View>
      ))}
    </View>
  );
}

function AgentSummaryCard({ data }: { data: AgentResponse }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>AURA Styling Agent</Text>
      <DetailLine label="Mode" value={data.mode} />
      <Text selectable style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        {data.message}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Outfits" value={data.outfits?.length ?? 0} />
        <SummaryMetric label="Actions" value={data.suggestedActions.length} />
      </View>
    </View>
  );
}

function AgentIntentCard({ data }: { data: AgentResponse }) {
  return <JsonCard title="Agent Intent" data={data.intent} />;
}

function AgentActionsCard({ actions }: { actions: AgentSuggestedAction[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Suggested Next Actions</Text>
      {actions.length ? (
        actions.map((action) => (
          <View key={action.id} style={{ ...auraCardStyle(colors, "inset"), gap: 5 }}>
            <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>{action.label}</Text>
            <DetailLine label="Type" value={action.type} />
            {action.payload ? (
              <Text
                selectable
                style={{
                  color: colors.textSecondary,
                  fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
                  fontSize: 12,
                  lineHeight: 18,
                }}
              >
                {prettyJson(action.payload)}
              </Text>
            ) : null}
          </View>
        ))
      ) : (
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          No suggested actions returned.
        </Text>
      )}
    </View>
  );
}

function AgentStyleMemoryCard({ summary }: { summary: NonNullable<AgentResponse["styleMemorySummary"]> }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Agent Style Memory</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Positive" value={summary.positiveMemoryCount} />
        <SummaryMetric label="Negative" value={summary.negativeMemoryCount} />
        <SummaryMetric label="Warnings" value={summary.warnings.length} />
      </View>
      {summary.profileSummary ? (
        <Text selectable style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          {summary.profileSummary}
        </Text>
      ) : null}
      {summary.warnings.length ? (
        <Text selectable style={[auraTypography.caption, { color: colors.danger }]}>
          {summary.warnings.join("\n")}
        </Text>
      ) : null}
    </View>
  );
}

function AgentExplanationCard({ explanation }: { explanation: NonNullable<AgentResponse["explanation"]> }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Outfit Explanation</Text>
      <DetailLine label="Outfit" value={explanation.title ?? explanation.outfitId ?? "previous outfit"} />
      {explanation.itemRationales.length ? (
        explanation.itemRationales.map((item) => (
          <View key={`${item.itemId}-${item.role}`} style={{ ...auraCardStyle(colors, "inset"), gap: 5 }}>
            <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>{item.name}</Text>
            <DetailLine label="itemId" value={item.itemId} />
            <DetailLine label="role" value={item.role} />
            <Text selectable style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
              {item.reason}
            </Text>
          </View>
        ))
      ) : (
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          No previous outfit items were included.
        </Text>
      )}
      {explanation.scoreBreakdown ? (
        <Text
          selectable
          style={{
            color: colors.textSecondary,
            fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
            fontSize: 12,
            lineHeight: 18,
          }}
        >
          {prettyJson(explanation.scoreBreakdown)}
        </Text>
      ) : null}
    </View>
  );
}

function AgentFeedbackCard({ feedback }: { feedback: NonNullable<AgentResponse["feedback"]> }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 10 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Agent Feedback</Text>
      <DetailLine label="feedbackType" value={feedback.feedbackType ?? "none"} />
      <DetailLine label="recorded" value={String(feedback.recorded)} />
      <Text selectable style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        {feedback.message}
      </Text>
    </View>
  );
}

function AgentDiagnosticsSummaryCard({ diagnostics }: { diagnostics: Record<string, unknown> }) {
  const { colors } = useAppTheme();
  const runner = String(diagnostics.runner ?? "unknown");
  const langGraphEnabled = diagnostics.langGraphEnabled === true;
  const graphVersion = String(diagnostics.graphVersion ?? "unknown");
  const nodesExecuted = Array.isArray(diagnostics.nodesExecuted)
    ? diagnostics.nodesExecuted.map(String)
    : Array.isArray(diagnostics.steps)
      ? diagnostics.steps.map(String)
      : [];
  const nodeTimings: AgentNodeTiming[] = Array.isArray(diagnostics.nodeTimings)
    ? diagnostics.nodeTimings.filter(isRecord).map((timing) => ({
      node: String(timing.node ?? "unknown"),
      durationMs: numberValue(timing.durationMs),
      status: String(timing.status ?? "unknown"),
    }))
    : [];
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12, borderColor: runner === "langgraph" ? colors.purpleBorder : colors.dangerBorder }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Agent Diagnostics</Text>
      {runner !== "langgraph" ? (
        <View style={{ ...auraCardStyle(colors, "inset"), borderColor: colors.dangerBorder, gap: 6 }}>
          <Text style={[auraTypography.bodySecondary, { color: colors.danger, fontWeight: "800" }]}>
            Agent is not using real LangGraph.
          </Text>
        </View>
      ) : null}
      <DetailLine label="runner" value={runner} />
      <DetailLine label="langGraphEnabled" value={String(langGraphEnabled)} />
      <DetailLine label="graphVersion" value={graphVersion} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Nodes" value={nodesExecuted.length} />
        <SummaryMetric label="Timings" value={nodeTimings.length} />
      </View>
      {nodesExecuted.length ? (
        <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
          Nodes executed: {nodesExecuted.join(" -> ")}
        </Text>
      ) : null}
      {nodeTimings.length ? (
        <View style={{ gap: 6 }}>
          <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Node Timings</Text>
          {nodeTimings.map((timing, index) => (
            <DetailLine
              key={`${timing.node}-${index}`}
              label={timing.node}
              value={`${timing.durationMs}ms · ${timing.status}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function StyleMemoryDiagnosticsCard({ diagnostics }: { diagnostics: StyleMemoryDiagnostics }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Memory Relevance Diagnostics</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Returned" value={diagnostics.returnedMemoryCount} />
        <SummaryMetric label="Excluded" value={diagnostics.excludedMemoryCount} />
        <SummaryMetric label="Dimensions" value={diagnostics.embeddingDimensions} />
      </View>
      <View style={{ gap: 4 }}>
        <DetailLine label="inputOccasion" value={diagnostics.inputOccasion ?? "none"} />
        <DetailLine label="inferredOccasion" value={diagnostics.inferredOccasion ?? "none"} />
        <DetailLine label="resolvedOccasion" value={diagnostics.resolvedOccasion ?? "none"} />
        <DetailLine label="occasionSource" value={diagnostics.occasionSource ?? "none"} />
      </View>
      {diagnostics.warnings.length ? (
        <View style={{ ...auraCardStyle(colors, "inset"), gap: 8, borderColor: colors.dangerBorder }}>
          <Text style={[auraTypography.bodySecondary, { color: colors.danger, fontWeight: "800" }]}>
            Occasion Warnings
          </Text>
          <Text
            selectable
            style={{
              color: colors.danger,
              fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            {prettyJson(diagnostics.warnings)}
          </Text>
        </View>
      ) : null}
      {diagnostics.excludedMemoriesPreview.length ? (
        <View style={{ ...auraCardStyle(colors, "inset"), gap: 8 }}>
          <Text style={[auraTypography.bodySecondary, { color: colors.text, fontWeight: "800" }]}>
            Excluded Memory Preview
          </Text>
          <Text
            selectable
            style={{
              color: colors.textSecondary,
              fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
              fontSize: 12,
              lineHeight: 18,
            }}
          >
            {prettyJson(diagnostics.excludedMemoriesPreview)}
          </Text>
        </View>
      ) : (
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          No memories were excluded for occasion mismatch.
        </Text>
      )}
    </View>
  );
}

function VectorLeakWarningCard({ paths }: { paths: string[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), borderColor: colors.dangerBorder, gap: 10 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.danger }]}>BUG: embeddingVector leaked to client</Text>
      <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        Vector-like fields were found in the callable response. This should be fixed before relying on this response shape.
      </Text>
      <Text selectable style={[auraTypography.caption, { color: colors.danger }]}>
        {paths.join("\n")}
      </Text>
    </View>
  );
}

function StreetwearOfficeBugWarningCard() {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), borderColor: colors.dangerBorder, gap: 8 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.danger }]}>BUG: Streetwear query resolved as office.</Text>
      <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        Clear the manual occasion/formality fields or turn Auto infer occasion back on before retrieving memories.
      </Text>
    </View>
  );
}

function StyleMemoryRelevanceCard({ items }: { items: StyleMemoryScoreItem[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Memory Relevance Scores</Text>
      {items.length ? (
        items.map((item) => (
          <View key={`memory-score-${item.id}`} style={{ ...auraCardStyle(colors, "inset"), gap: 6 }}>
            <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>
              {item.polarity || "memory"} · {item.type || "unknown"}
            </Text>
            <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
              {item.id}
            </Text>
            <DetailLine label="finalMemoryScore" value={item.finalMemoryScore === null ? "none" : item.finalMemoryScore.toFixed(3)} />
            <DetailLine label="semanticScore" value={item.semanticScore === null ? "none" : item.semanticScore.toFixed(3)} />
            <DetailLine label="styleMemoryDistance" value={item.styleMemoryDistance === null ? "none" : item.styleMemoryDistance.toFixed(6)} />
            <DetailLine label="occasionCompatibility" value={item.occasionCompatibility === null ? "none" : item.occasionCompatibility.toFixed(3)} />
            <Text selectable style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
              {item.text}
            </Text>
          </View>
        ))
      ) : (
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
          No scored memories returned for this response.
        </Text>
      )}
    </View>
  );
}

function StyleProfileWarningCard({ data }: { data: StyleProfileWarningData }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), borderColor: colors.dangerBorder, gap: 10 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.danger }]}>Style Profile Warning</Text>
      <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        Suspicious broad avoided signals are present. Use Rebuild Style Profile Write after verifying the current memories.
      </Text>
      {data.broadCategories.length ? <DetailLine label="Broad categories" value={data.broadCategories.join(", ")} /> : null}
      {data.broadColors.length ? <DetailLine label="Broad colors" value={data.broadColors.join(", ")} /> : null}
    </View>
  );
}

function BackfillItemCard({ item, tone = "default" }: { item: BackfillDebugItem; tone?: "default" | "error" }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        ...auraCardStyle(colors, "inset"),
        borderColor: tone === "error" ? colors.dangerBorder : colors.border,
        gap: 5,
      }}
    >
      <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>{item.name}</Text>
      <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
        {item.itemId}
      </Text>
      <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
        Category: {item.category}
      </Text>
      <Text style={[auraTypography.bodySecondary, { color: tone === "error" ? colors.danger : colors.textSecondary }]}>
        Reason: {item.reason}
      </Text>
    </View>
  );
}

function BackfillItemsSection({
  title,
  items,
  emptyText,
  tone = "default",
}: {
  title: string;
  items: BackfillDebugItem[];
  emptyText: string;
  tone?: "default" | "error";
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={[auraTypography.eyebrow, { color: tone === "error" ? colors.danger : colors.textSecondary }]}>
        {title}
      </Text>
      {items.length ? (
        items.map((item) => (
          <BackfillItemCard key={`${title}-${item.itemId}-${item.reason}`} item={item} tone={tone} />
        ))
      ) : (
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{emptyText}</Text>
      )}
    </View>
  );
}

function DraftAuditSummaryCard({ data }: { data: DraftAuditResponse }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Draft Audit Summary</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Total checked" value={data.totalChecked} />
        <SummaryMetric label="Hidden drafts" value={data.hiddenDraftCount} />
        <SummaryMetric label="True drafts" value={data.trueDraftCount} />
        <SummaryMetric label="Needs review" value={data.needsReviewCount} />
        <SummaryMetric label="Candidate" value={data.candidateCount} />
        <SummaryMetric label="Failed" value={data.failedCount} />
        <SummaryMetric label="Pending ingestion" value={data.pendingIngestionCount} />
        <SummaryMetric label="Ready visible" value={data.readyVisibleCount} />
        <SummaryMetric label="Indexed ready" value={data.indexedReadyCount} />
        <SummaryMetric label="Missing embedding ready" value={data.missingEmbeddingReadyCount} />
      </View>
    </View>
  );
}

function IntelligenceCoverageCard({ data }: { data: DraftAuditResponse }) {
  const { colors } = useAppTheme();
  const coveragePercent = data.readyVisibleCount > 0
    ? Math.round((data.indexedReadyCount / data.readyVisibleCount) * 100)
    : 0;
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Intelligence Coverage</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Ready Visible" value={data.readyVisibleCount} />
        <SummaryMetric label="Indexed Ready" value={data.indexedReadyCount} />
        <SummaryMetric label="Missing Embedding Ready" value={data.missingEmbeddingReadyCount} />
        <SummaryMetric label="Coverage" value={coveragePercent} />
      </View>
      <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
        Coverage: {coveragePercent}%
      </Text>
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: unknown }) {
  const { colors } = useAppTheme();
  const text = value === null || value === undefined || value === "" ? "none" : String(value);
  return (
    <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
      {label}: {text}
    </Text>
  );
}

function WarningChip({ label }: { label: string }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: colors.dangerSurface,
        borderWidth: 1,
        borderColor: colors.dangerBorder,
      }}
    >
      <Text style={[auraTypography.caption, { color: colors.danger, fontWeight: "800" }]}>
        {label}
      </Text>
    </View>
  );
}

function DraftAuditItemCard({
  item,
  onDelete,
  deleting,
}: {
  item: DraftAuditItem;
  onDelete: (item: DraftAuditItem) => void;
  deleting: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "inset"), gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={{
              width: 64,
              height: 74,
              borderRadius: 14,
              backgroundColor: colors.surfaceMuted,
            }}
            resizeMode="cover"
          />
        ) : null}
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>
            {item.name || "Untitled item"}
          </Text>
          <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
            {item.itemId}
          </Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.danger, fontWeight: "700" }]}>
            {item.reason}
          </Text>
        </View>
      </View>
      <View style={{ gap: 3 }}>
        <DetailLine label="Category" value={item.category} />
        <DetailLine label="Status" value={item.status} />
        <DetailLine label="Lifecycle" value={item.itemLifecycleStatus} />
        <DetailLine label="Draft state" value={item.draftState} />
        <DetailLine label="Ingestion" value={item.ingestionStatus ?? item.nestedIngestionStatus} />
        <DetailLine label="Created" value={item.createdAt} />
        <DetailLine label="Updated" value={item.updatedAt} />
      </View>
      <DebugButton
        label={deleting ? "Deleting..." : "Delete Draft"}
        onPress={() => onDelete(item)}
        disabled={deleting}
        variant="danger"
      />
    </View>
  );
}

function DraftCleanupSummaryCard({
  title,
  totalChecked,
  cutoffDays,
  candidateCount,
  deletedCount,
  skippedCount,
}: {
  title: string;
  totalChecked: number;
  cutoffDays: number;
  candidateCount?: number;
  deletedCount?: number;
  skippedCount?: number;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
      <Text style={[auraTypography.cardTitle, { color: colors.text }]}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <SummaryMetric label="Cutoff days" value={cutoffDays} />
        <SummaryMetric label="Total checked" value={totalChecked} />
        {candidateCount === undefined ? null : <SummaryMetric label="Candidates" value={candidateCount} />}
        {deletedCount === undefined ? null : <SummaryMetric label="Deleted" value={deletedCount} />}
        {skippedCount === undefined ? null : <SummaryMetric label="Skipped" value={skippedCount} />}
      </View>
    </View>
  );
}

function DraftCleanupItemCard({ item, tone = "default" }: { item: DraftCleanupItem; tone?: "default" | "error" }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        ...auraCardStyle(colors, "inset"),
        borderColor: tone === "error" ? colors.dangerBorder : colors.border,
        gap: 8,
      }}
    >
      <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>
        {item.name || "Untitled item"}
      </Text>
      <Text selectable style={[auraTypography.caption, { color: colors.textSecondary }]}>
        {item.itemId}
      </Text>
      <Text style={[auraTypography.bodySecondary, { color: tone === "error" ? colors.danger : colors.textSecondary }]}>
        {item.reason}
      </Text>
      <View style={{ gap: 3 }}>
        <DetailLine label="Category" value={item.category} />
        <DetailLine label="Lifecycle" value={item.itemLifecycleStatus} />
        <DetailLine label="Draft state" value={item.draftState} />
        <DetailLine label="Created" value={item.createdAt} />
        <DetailLine label="Updated" value={item.updatedAt} />
      </View>
    </View>
  );
}

function DraftCleanupItemsSection({
  title,
  items,
  emptyText,
  tone = "default",
}: {
  title: string;
  items: DraftCleanupItem[];
  emptyText: string;
  tone?: "default" | "error";
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text style={[auraTypography.eyebrow, { color: tone === "error" ? colors.danger : colors.textSecondary }]}>
        {title}
      </Text>
      {items.length ? (
        items.map((item) => (
          <DraftCleanupItemCard key={`${title}-${item.itemId}-${item.reason}`} item={item} tone={tone} />
        ))
      ) : (
        <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>{emptyText}</Text>
      )}
    </View>
  );
}

function IntelligenceDebugScreen() {
  const { colors } = useAppTheme();
  const layout = useResponsiveLayout();
  const functions = useMemo(() => getFunctions(app), []);
  const [itemId, setItemId] = useState("");
  const [limit, setLimit] = useState("10");
  const [dryRun, setDryRun] = useState(true);
  const [force, setForce] = useState(false);
  const [status, setStatus] = useState<StatusState>({ action: "idle", message: "Ready." });
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [busyAction, setBusyAction] = useState<ActionName | null>(null);
  const [showOnlyIndexedItems, setShowOnlyIndexedItems] = useState(false);
  const [showOnlyFailures, setShowOnlyFailures] = useState(false);
  const [draftAuditLimit, setDraftAuditLimit] = useState("100");
  const [showOnlyNeedsReview, setShowOnlyNeedsReview] = useState(false);
  const [showOnlyIsDraft, setShowOnlyIsDraft] = useState(false);
  const [cleanupCutoffDays, setCleanupCutoffDays] = useState("7");
  const [cleanupLimit, setCleanupLimit] = useState("100");
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [retrievalLimit, setRetrievalLimit] = useState("12");
  const [retrievalOccasion, setRetrievalOccasion] = useState("");
  const [retrievalWeather, setRetrievalWeather] = useState("");
  const [retrievalFormality, setRetrievalFormality] = useState<"any" | "casual" | "smart_casual" | "formal">("any");
  const [retrievalCategories, setRetrievalCategories] = useState("");
  const [retrievalStyleTags, setRetrievalStyleTags] = useState("");
  const [retrievalColors, setRetrievalColors] = useState("");
  const [includeRetrievalDiagnostics, setIncludeRetrievalDiagnostics] = useState(true);
  const [outfitQuery, setOutfitQuery] = useState("");
  const [outfitCount, setOutfitCount] = useState("3");
  const [outfitOccasion, setOutfitOccasion] = useState("");
  const [outfitWeather, setOutfitWeather] = useState("");
  const [outfitFormality, setOutfitFormality] = useState<"any" | "casual" | "smart_casual" | "formal">("any");
  const [includeOutfitDiagnostics, setIncludeOutfitDiagnostics] = useState(true);
  const [agentQuery, setAgentQuery] = useState("");
  const [agentMode, setAgentMode] = useState<AgentMode>("auto");
  const [agentCount, setAgentCount] = useState("3");
  const [agentOccasion, setAgentOccasion] = useState("");
  const [agentWeather, setAgentWeather] = useState("");
  const [agentFormality, setAgentFormality] = useState<"any" | "casual" | "smart_casual" | "formal">("any");
  const [agentUseStyleMemory, setAgentUseStyleMemory] = useState(true);
  const [includeAgentDiagnostics, setIncludeAgentDiagnostics] = useState(true);
  const [styleMemoryNote, setStyleMemoryNote] = useState("");
  const [styleMemoryPolarity, setStyleMemoryPolarity] = useState<"positive" | "negative" | "neutral">("positive");
  const [styleMemoryDebugState, setStyleMemoryDebugState] = useState<StyleMemoryDebugState>({
    query: "",
    occasion: "",
    formality: "",
    autoInferOccasion: true,
    respectInputOccasion: false,
  });
  const [styleMemoryDeleteId, setStyleMemoryDeleteId] = useState("");
  const [debugDislikedOutfits, setDebugDislikedOutfits] = useState<DebugDislikedOutfit[]>([]);
  const styleMemoryQuery = styleMemoryDebugState.query;
  const styleMemoryOccasion = styleMemoryDebugState.occasion;
  const styleMemoryFormality = styleMemoryDebugState.formality;
  const styleMemoryAutoInferOccasion = styleMemoryDebugState.autoInferOccasion;
  const styleMemoryRespectInputOccasion = styleMemoryDebugState.respectInputOccasion;

  const parsedLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 10));
  const parsedDraftAuditLimit = Math.max(1, Math.min(200, Number.parseInt(draftAuditLimit, 10) || 100));
  const parsedCleanupCutoffDays = Math.max(1, Number.parseInt(cleanupCutoffDays, 10) || 7);
  const parsedCleanupLimit = Math.max(1, Math.min(500, Number.parseInt(cleanupLimit, 10) || 100));
  const parsedAgentCount = Math.max(1, Math.min(5, Number.parseInt(agentCount, 10) || 3));
  const isBusy = Boolean(busyAction);
  const backfillData = useMemo(() => backfillDebugResponse(response), [response]);
  const fullBackfillData = useMemo(() => fullBackfillResponse(response), [response]);
  const draftAuditData = useMemo(() => draftAuditResponse(response), [response]);
  const cleanupPreviewData = useMemo(() => draftCleanupPreviewResponse(response), [response]);
  const cleanupBulkData = useMemo(() => draftCleanupBulkResponse(response), [response]);
  const retrievalData = useMemo(() => retrievalResponse(response), [response]);
  const outfitContextData = useMemo(() => outfitContextResponse(response), [response]);
  const outfitGenerationData = useMemo(() => outfitGenerationResponse(response), [response]);
  const agentData = useMemo(() => agentResponse(response), [response]);
  const metricsData = useMemo(() => auraMetricsResponse(response), [response]);
  const resumeMetricsData = useMemo(() => auraResumeMetricsResponse(response), [response]);
  const memoryDiagnosticsData = useMemo(() => styleMemoryDiagnostics(response), [response]);
  const memoryScoreItems = useMemo(() => styleMemoryScoreItems(response), [response]);
  const styleProfileWarning = useMemo(() => styleProfileWarningData(response), [response]);
  const leakedVectorPaths = useMemo(() => vectorLeakPaths(response), [response]);
  const styleMemoryRequest = useMemo(
    () => buildStyleMemoryRetrieveRequest(styleMemoryDebugState, outfitQuery || retrievalQuery),
    [outfitQuery, retrievalQuery, styleMemoryDebugState],
  );
  const styleMemoryRequestPreview = useMemo(
    () => styleMemoryRetrieveRequestPreview(styleMemoryRequest),
    [styleMemoryRequest],
  );
  const streetwearResolvedAsOffice = Boolean(
    memoryDiagnosticsData?.resolvedOccasion === "office" &&
    /streetwear/i.test(styleMemoryRequest?.query ?? ""),
  );
  const outfitValidationWarnings = useMemo(
    () => outfitValidationWarningItems(outfitGenerationData?.diagnostics?.validationWarnings),
    [outfitGenerationData?.diagnostics],
  );
  const previousOutfitForAgent = outfitGenerationData?.outfits[0] ?? agentData?.outfits?.[0] ?? null;

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setDebugDislikedOutfits([]);
      return;
    }

    const dislikedQuery = query(
      collection(db, "users", uid, "dislikedOutfits"),
      orderBy("createdAt", "desc"),
      firestoreLimit(8),
    );
    return onSnapshot(
      dislikedQuery,
      (snapshot) => {
        setDebugDislikedOutfits(
          snapshot.docs.map((entry) => toDebugDislikedOutfit(entry.id, entry.data())),
        );
      },
      () => setDebugDislikedOutfits([]),
    );
  }, []);

  const toggleDebugDislikedOutfit = useCallback(async (record: DebugDislikedOutfit) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await setDoc(
        doc(db, "users", uid, "dislikedOutfits", record.id),
        { active: !record.active, updatedAt: Date.now() },
        { merge: true },
      );
    } catch {
      Alert.alert("Disliked outfits", "Unable to update this record.");
    }
  }, []);

  const visibleDraftItems = useMemo(() => {
    const items = draftAuditData?.draftItems ?? [];
    return items.filter((item) => {
      if (showOnlyNeedsReview && item.itemLifecycleStatus !== "needs_review") return false;
      if (showOnlyIsDraft && !item.isDraft) return false;
      return true;
    });
  }, [draftAuditData?.draftItems, showOnlyIsDraft, showOnlyNeedsReview]);

  const runCallable = useCallback(async <TData extends Record<string, unknown>>(
    action: ActionName,
    callableName: string,
    data: TData,
  ) => {
    console.log(`${LOG_PREFIX} ${action} started`, data);
    setBusyAction(action);
    setStatus({ action, message: `${action} started` });
    setResponse(null);
    setError(null);

    try {
      const callable = httpsCallable<TData, unknown>(functions, callableName);
      const result = await callable(data);
      console.log(`${LOG_PREFIX} ${action} success`, result.data);
      setResponse(result.data);
      setStatus({ action, message: `${action} success` });
    } catch (nextError) {
      const payload = errorPayload(nextError);
      console.error(`${LOG_PREFIX} ${action} failed`, payload);
      setError(payload);
      setStatus({ action, message: `${action} failed` });
    } finally {
      setBusyAction(null);
    }
  }, [functions]);

  const getAuraMetrics = useCallback(() => {
    void runCallable("getMetrics", "getAuraMetrics", {});
  }, [runCallable]);

  const refreshAuraMetrics = useCallback((dryRunValue: boolean) => {
    void runCallable("refreshMetrics", "refreshAuraMetricsSnapshot", { dryRun: dryRunValue });
  }, [runCallable]);

  const getAuraResumeMetrics = useCallback(() => {
    void runCallable("resumeMetrics", "getAuraResumeMetrics", {});
  }, [runCallable]);

  const resetAuraMetrics = useCallback(() => {
    Alert.alert(
      "Reset AURA metrics?",
      "This resets only the aggregate metrics document. It does not delete closet, saved outfit, memory, or calendar data.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            void runCallable("resetMetrics", "resetAuraMetrics", { confirm: "RESET_AURA_METRICS" });
          },
        },
      ],
    );
  }, [runCallable]);

  const runPreview = useCallback((nextItemId = itemId) => {
    const trimmedItemId = nextItemId.trim();
    if (!trimmedItemId) {
      const payload = { message: "Enter an itemId before previewing." };
      setError(payload);
      setStatus({ action: "preview", message: "preview failed" });
      return;
    }
    void runCallable("preview", "previewClosetItemIntelligence", { itemId: trimmedItemId });
  }, [itemId, runCallable]);

  const runReindex = useCallback(() => {
    const trimmedItemId = itemId.trim();
    if (!trimmedItemId) {
      const payload = { message: "Enter an itemId before reindexing." };
      setError(payload);
      setStatus({ action: "reindex", message: "reindex failed" });
      return;
    }
    void runCallable("reindex", "reindexClosetItem", { itemId: trimmedItemId, force: true });
  }, [itemId, runCallable]);

  const runBackfill = useCallback((cursor?: string | null) => {
    void runCallable("backfill", "backfillWardrobeIntelligence", {
      limit: parsedLimit,
      dryRun,
      force,
      cursor: cursor ?? null,
    });
  }, [dryRun, force, parsedLimit, runCallable]);

  const runBackfillAll = useCallback(() => {
    void runCallable("backfillAll", "backfillWardrobeIntelligenceAll", {
      dryRun,
      force,
    });
  }, [dryRun, force, runCallable]);

  const runDraftAudit = useCallback(() => {
    void runCallable("audit", "auditClosetDraftItems", {
      limit: parsedDraftAuditLimit,
    });
  }, [parsedDraftAuditLimit, runCallable]);

  const runCleanupPreview = useCallback(() => {
    void runCallable("previewCleanup", "previewAbandonedDraftCleanup", {
      cutoffDays: parsedCleanupCutoffDays,
      limit: parsedCleanupLimit,
    });
  }, [parsedCleanupCutoffDays, parsedCleanupLimit, runCallable]);

  const runBulkCleanup = useCallback(() => {
    Alert.alert(
      "Delete abandoned drafts?",
      `This deletes only strict empty abandoned drafts older than ${parsedCleanupCutoffDays} days. It will NOT delete ready items, needs_review items, photo_uploaded items, candidate items, pending items, failed items, or any item with images.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Abandoned Drafts",
          style: "destructive",
          onPress: () => {
            void runCallable("deleteCleanup", "bulkDeleteAbandonedDrafts", {
              cutoffDays: parsedCleanupCutoffDays,
              limit: parsedCleanupLimit,
              confirm: "DELETE_ABANDONED_DRAFTS",
            });
          },
        },
      ],
    );
  }, [parsedCleanupCutoffDays, parsedCleanupLimit, runCallable]);

  const splitList = useCallback((value: string) => (
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  ), []);

  const runRetrieval = useCallback((overrides: Partial<{
    query: string;
    limit: string;
    occasion: string;
    weather: string;
    formality: "any" | "casual" | "smart_casual" | "formal";
    categories: string;
    styleTags: string;
    colors: string;
    includeDiagnostics: boolean;
  }> = {}) => {
    const nextQuery = (overrides.query ?? retrievalQuery).trim();
    if (!nextQuery) {
      const payload = { message: "Enter a retrieval query before searching." };
      setError(payload);
      setStatus({ action: "retrieve", message: "retrieve failed" });
      return;
    }

    const nextLimit = Math.max(1, Math.min(50, Number.parseInt(overrides.limit ?? retrievalLimit, 10) || 12));
    void runCallable("retrieve", "retrieveWardrobeContext", {
      query: nextQuery,
      limit: nextLimit,
      occasion: (overrides.occasion ?? retrievalOccasion).trim(),
      weather: (overrides.weather ?? retrievalWeather).trim(),
      formality: overrides.formality ?? retrievalFormality,
      categories: splitList(overrides.categories ?? retrievalCategories),
      styleTags: splitList(overrides.styleTags ?? retrievalStyleTags),
      colors: splitList(overrides.colors ?? retrievalColors),
      includeDiagnostics: overrides.includeDiagnostics ?? includeRetrievalDiagnostics,
    });
  }, [
    includeRetrievalDiagnostics,
    retrievalCategories,
    retrievalColors,
    retrievalFormality,
    retrievalLimit,
    retrievalOccasion,
    retrievalQuery,
    retrievalStyleTags,
    retrievalWeather,
    runCallable,
    splitList,
  ]);

  const runRetrievalQuickTest = useCallback((preset: {
    query: string;
    occasion?: string;
    weather?: string;
    formality?: "any" | "casual" | "smart_casual" | "formal";
    categories?: string;
    styleTags?: string;
    colors?: string;
  }) => {
    setRetrievalQuery(preset.query);
    setRetrievalOccasion(preset.occasion ?? "");
    setRetrievalWeather(preset.weather ?? "");
    setRetrievalFormality(preset.formality ?? "any");
    setRetrievalCategories(preset.categories ?? "");
    setRetrievalStyleTags(preset.styleTags ?? "");
    setRetrievalColors(preset.colors ?? "");
    runRetrieval({
      query: preset.query,
      occasion: preset.occasion ?? "",
      weather: preset.weather ?? "",
      formality: preset.formality ?? "any",
      categories: preset.categories ?? "",
      styleTags: preset.styleTags ?? "",
      colors: preset.colors ?? "",
    });
  }, [runRetrieval]);

  const runOutfitAction = useCallback((action: "previewOutfitContext" | "generateOutfits", overrides: Partial<{
    query: string;
    count: string;
    occasion: string;
    weather: string;
    formality: "any" | "casual" | "smart_casual" | "formal";
    includeDiagnostics: boolean;
  }> = {}) => {
    const nextQuery = (overrides.query ?? outfitQuery).trim();
    if (!nextQuery) {
      const payload = { message: "Enter an outfit query before running Phase 3." };
      setError(payload);
      setStatus({ action, message: `${action} failed` });
      return;
    }
    const nextCount = Math.max(1, Math.min(5, Number.parseInt(overrides.count ?? outfitCount, 10) || 3));
    void runCallable(
      action,
      action === "previewOutfitContext" ? "previewOutfitGenerationContext" : "generateOutfitRecommendations",
      {
        query: nextQuery,
        count: nextCount,
        occasion: (overrides.occasion ?? outfitOccasion).trim(),
        weather: (overrides.weather ?? outfitWeather).trim(),
        formality: overrides.formality ?? outfitFormality,
        includeDiagnostics: overrides.includeDiagnostics ?? includeOutfitDiagnostics,
      },
    );
  }, [
    includeOutfitDiagnostics,
    outfitCount,
    outfitFormality,
    outfitOccasion,
    outfitQuery,
    outfitWeather,
    runCallable,
  ]);

  const runOutfitQuickTest = useCallback((preset: {
    query: string;
    occasion?: string;
    weather?: string;
    formality?: "any" | "casual" | "smart_casual" | "formal";
  }, action: "previewOutfitContext" | "generateOutfits" = "generateOutfits") => {
    setOutfitQuery(preset.query);
    setOutfitOccasion(preset.occasion ?? "");
    setOutfitWeather(preset.weather ?? "");
    setOutfitFormality(preset.formality ?? "any");
    runOutfitAction(action, {
      query: preset.query,
      occasion: preset.occasion ?? "",
      weather: preset.weather ?? "",
      formality: preset.formality ?? "any",
    });
  }, [runOutfitAction]);

  const runAgent = useCallback((overrides: Partial<{
    query: string;
    mode: AgentMode;
    occasion: string;
    weather: string;
    formality: "any" | "casual" | "smart_casual" | "formal";
    feedbackType: FeedbackType;
    previousOutfit: OutfitRecommendation | null;
  }> = {}) => {
    const nextMode = overrides.mode ?? agentMode;
    const nextQuery = (overrides.query ?? agentQuery).trim();
    const needsQuery = nextMode === "auto" || nextMode === "generate_outfit" || nextMode === "refine_outfit";
    if (needsQuery && !nextQuery) {
      setError({ message: "Enter an agent query before running the styling agent." });
      setStatus({ action: "runAgent", message: "runAgent failed" });
      return;
    }
    const previousOutfit = overrides.previousOutfit === undefined ? previousOutfitForAgent : overrides.previousOutfit;
    const payload: Record<string, unknown> = {
      query: nextQuery,
      mode: nextMode === "auto" ? undefined : nextMode,
      count: parsedAgentCount,
      occasion: (overrides.occasion ?? agentOccasion).trim(),
      weather: (overrides.weather ?? agentWeather).trim(),
      formality: overrides.formality ?? agentFormality,
      useStyleMemory: agentUseStyleMemory,
      includeDiagnostics: includeAgentDiagnostics,
    };
    if (previousOutfit && (
      nextMode === "refine_outfit" ||
      nextMode === "explain_outfit" ||
      nextMode === "feedback"
    )) {
      payload.previousOutfit = previousOutfit;
      payload.outfitId = previousOutfit.outfitId;
    }
    if (overrides.feedbackType) payload.feedbackType = overrides.feedbackType;
    void runCallable("runAgent", "runAuraStylingAgent", payload);
  }, [
    agentFormality,
    agentMode,
    agentOccasion,
    agentQuery,
    agentUseStyleMemory,
    agentWeather,
    includeAgentDiagnostics,
    parsedAgentCount,
    previousOutfitForAgent,
    runCallable,
  ]);

  const runAgentQuickTest = useCallback((preset: {
    query: string;
    mode?: AgentMode;
    occasion?: string;
    weather?: string;
    formality?: "any" | "casual" | "smart_casual" | "formal";
    feedbackType?: FeedbackType;
  }) => {
    setAgentQuery(preset.query);
    setAgentMode(preset.mode ?? "auto");
    setAgentOccasion(preset.occasion ?? "");
    setAgentWeather(preset.weather ?? "");
    setAgentFormality(preset.formality ?? "any");
    runAgent({
      query: preset.query,
      mode: preset.mode ?? "auto",
      occasion: preset.occasion ?? "",
      weather: preset.weather ?? "",
      formality: preset.formality ?? "any",
      feedbackType: preset.feedbackType,
    });
  }, [runAgent]);

  const recordOutfitFeedback = useCallback((outfit: OutfitRecommendation, feedbackType: FeedbackType) => {
    void runCallable("recordFeedback", "recordOutfitFeedback", {
      query: outfitQuery.trim() || outfit.occasion || "outfit feedback",
      occasion: outfitOccasion.trim() || outfit.occasion,
      formality: outfitFormality,
      outfit,
      outfitId: outfit.outfitId,
      feedbackType,
    });
  }, [outfitFormality, outfitOccasion, outfitQuery, runCallable]);

  const addManualStyleMemory = useCallback(() => {
    const note = styleMemoryNote.trim();
    if (!note) {
      setError({ message: "Enter a manual style memory note." });
      setStatus({ action: "addManualMemory", message: "addManualMemory failed" });
      return;
    }
    void runCallable("addManualMemory", "recordOutfitFeedback", {
      query: styleMemoryQuery.trim() || note,
      occasion: styleMemoryOccasion.trim(),
      formality: styleMemoryFormality.trim() || undefined,
      feedbackType: "manual_note",
      note,
      polarity: styleMemoryPolarity,
    });
  }, [runCallable, styleMemoryFormality, styleMemoryNote, styleMemoryOccasion, styleMemoryPolarity, styleMemoryQuery]);

  const retrieveStyleMemories = useCallback(() => {
    const request = buildStyleMemoryRetrieveRequest(styleMemoryDebugState, outfitQuery || retrievalQuery);
    if (!request) {
      setError({ message: "Enter a style memory query." });
      setStatus({ action: "retrieveMemories", message: "retrieveMemories failed" });
      return;
    }
    void runCallable("retrieveMemories", "retrieveStyleMemoryContext", request);
  }, [outfitQuery, retrievalQuery, runCallable, styleMemoryDebugState]);

  const setStyleMemoryQuickTest = useCallback((query: string) => {
    setStyleMemoryDebugState(styleMemoryQuickTestState(query));
  }, []);

  const clearStyleMemoryOccasionFormality = useCallback(() => {
    setStyleMemoryDebugState((current) => ({
      ...current,
      occasion: "",
      formality: "",
      respectInputOccasion: false,
    }));
  }, []);

  const getStyleProfile = useCallback(() => {
    void runCallable("getStyleProfile", "getStyleProfile", {});
  }, [runCallable]);

  const rebuildStyleProfile = useCallback((dryRun: boolean) => {
    void runCallable("rebuildProfile", "rebuildStyleProfileFromMemories", { dryRun });
  }, [runCallable]);

  const listStyleMemories = useCallback(() => {
    void runCallable("listMemories", "listStyleMemories", { limit: 25 });
  }, [runCallable]);

  const deleteStyleMemory = useCallback(() => {
    const memoryId = styleMemoryDeleteId.trim();
    if (!memoryId) {
      setError({ message: "Enter a style memory ID to soft delete." });
      setStatus({ action: "deleteMemory", message: "deleteMemory failed" });
      return;
    }
    Alert.alert(
      "Delete style memory?",
      "This soft deletes the style memory and rebuilds can exclude it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Memory",
          style: "destructive",
          onPress: () => {
            void runCallable("deleteMemory", "deleteStyleMemory", {
              memoryId,
              confirm: "DELETE_STYLE_MEMORY",
            });
          },
        },
      ],
    );
  }, [runCallable, styleMemoryDeleteId]);

  const deleteAllStyleMemories = useCallback(() => {
    Alert.alert(
      "Delete all style memories?",
      "This soft deletes every active style memory for the signed-in user and resets the style profile. Use this only for debug cleanup.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Soft Delete All",
          style: "destructive",
          onPress: () => {
            void runCallable("deleteAllMemories", "softDeleteAllStyleMemories", {
              confirm: "SOFT_DELETE_ALL_STYLE_MEMORIES",
            });
          },
        },
      ],
    );
  }, [runCallable]);

  const runTestItem = useCallback(() => {
    setItemId(TEST_ITEM_ID);
    runPreview(TEST_ITEM_ID);
  }, [runPreview]);

  const removeDraftItemFromResponse = useCallback((deletedItem: DraftAuditItem) => {
    setResponse((current: unknown) => {
      const audit = draftAuditResponse(current);
      if (!audit) return current;
      return {
        ...audit,
        totalChecked: Math.max(0, audit.totalChecked - 1),
        hiddenDraftCount: Math.max(0, audit.hiddenDraftCount - 1),
        trueDraftCount: deletedItem.isDraft ? Math.max(0, audit.trueDraftCount - 1) : audit.trueDraftCount,
        needsReviewCount: deletedItem.itemLifecycleStatus === "needs_review"
          ? Math.max(0, audit.needsReviewCount - 1)
          : audit.needsReviewCount,
        candidateCount: deletedItem.itemLifecycleStatus === "candidate"
          ? Math.max(0, audit.candidateCount - 1)
          : audit.candidateCount,
        failedCount:
          deletedItem.itemLifecycleStatus === "failed" ||
          deletedItem.draftState === "failed" ||
          deletedItem.ingestionStatus === "failed" ||
          deletedItem.nestedIngestionStatus === "failed"
            ? Math.max(0, audit.failedCount - 1)
            : audit.failedCount,
        pendingIngestionCount:
          deletedItem.ingestionStatus === "pending" || deletedItem.nestedIngestionStatus === "pending"
            ? Math.max(0, audit.pendingIngestionCount - 1)
            : audit.pendingIngestionCount,
        draftItems: audit.draftItems.filter((item) => item.itemId !== deletedItem.itemId),
      };
    });
  }, []);

  const deleteDraftItem = useCallback((draftItem: DraftAuditItem) => {
    Alert.alert(
      "Delete draft item?",
      "This deletes only the Firestore draft item document. It does not delete Storage images.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Draft",
          style: "destructive",
          onPress: () => {
            void (async () => {
              console.log(`${LOG_PREFIX} deleteDraft started`, { itemId: draftItem.itemId });
              setBusyAction("deleteDraft");
              setError(null);
              setStatus({ action: "deleteDraft", message: "deleteDraft started" });
              try {
                const callable = httpsCallable<
                  { itemId: string; confirm: "DELETE_DRAFT_ITEM" },
                  unknown
                >(functions, "deleteDraftClosetItem");
                const result = await callable({
                  itemId: draftItem.itemId,
                  confirm: "DELETE_DRAFT_ITEM",
                });
                console.log(`${LOG_PREFIX} deleteDraft success`, result.data);
                removeDraftItemFromResponse(draftItem);
                setStatus({ action: "deleteDraft", message: "deleteDraft success" });
              } catch (nextError) {
                const payload = errorPayload(nextError);
                console.error(`${LOG_PREFIX} deleteDraft failed`, payload);
                setError(payload);
                setStatus({ action: "deleteDraft", message: "deleteDraft failed" });
              } finally {
                setBusyAction(null);
              }
            })();
          },
        },
      ],
    );
  }, [functions, removeDraftItemFromResponse]);

  return (
    <SafeScreen backgroundColor={colors.background} includeTopInset={false} includeBottomInset={false} style={{ flex: 1 }}>
      <AuraTopSafeAreaScrim color={colors.background} />
      <AuraSubpageHeader title="Intelligence Debug" eyebrow="DEVELOPER" fallbackRoute="/(tabs)/profile" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 12,
          paddingBottom: layout.bottomDockPadding + 40,
          gap: 16,
        }}
      >
        <View style={{ gap: 6 }}>
          <Text style={[auraTypography.body, { color: colors.textSecondary }]}>
            Temporary controls for Phase 1 indexing, draft audits, Phase 2 retrieval, and Phase 3 outfit generation.
          </Text>
        </View>

        <JsonCard title="Status" tone="status" data={{ action: status.action, message: status.message, busy: busyAction }} />

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Item</Text>
          <View style={{ gap: 7 }}>
            <FieldLabel>itemId</FieldLabel>
            <TextInput
              value={itemId}
              onChangeText={setItemId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Closet item ID"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <DebugButton
            label={busyAction === "preview" ? "Previewing..." : "Preview Item Intelligence"}
            onPress={() => runPreview()}
            disabled={isBusy}
          />
          <DebugButton
            label={busyAction === "reindex" ? "Reindexing..." : "Reindex Item"}
            onPress={runReindex}
            disabled={isBusy}
            variant="secondary"
          />
          <DebugButton
            label="Test My Item"
            onPress={runTestItem}
            disabled={isBusy}
            variant="tertiary"
          />
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Wardrobe Retrieval</Text>
          <View style={{ gap: 7 }}>
            <FieldLabel>query</FieldLabel>
            <TextInput
              value={retrievalQuery}
              onChangeText={setRetrievalQuery}
              autoCapitalize="sentences"
              placeholder="office outfit with black shoes"
              placeholderTextColor={colors.textMuted}
              style={[inputStyle(colors), { minHeight: 72, textAlignVertical: "top" }]}
              multiline
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>limit (max 50)</FieldLabel>
            <TextInput
              value={retrievalLimit}
              onChangeText={setRetrievalLimit}
              keyboardType="number-pad"
              placeholder="12"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>occasion</FieldLabel>
            <TextInput
              value={retrievalOccasion}
              onChangeText={setRetrievalOccasion}
              placeholder="office"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>weather</FieldLabel>
            <TextInput
              value={retrievalWeather}
              onChangeText={setRetrievalWeather}
              placeholder="hot"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>formality</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Any", "any"],
                ["Casual", "casual"],
                ["Smart casual", "smart_casual"],
                ["Formal", "formal"],
              ].map(([label, value]) => (
                <FormalityOption
                  key={value}
                  label={label}
                  selected={retrievalFormality === value}
                  onPress={() => setRetrievalFormality(value as typeof retrievalFormality)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>categories (comma separated)</FieldLabel>
            <TextInput
              value={retrievalCategories}
              onChangeText={setRetrievalCategories}
              autoCapitalize="none"
              placeholder="top, bottom, footwear"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>styleTags (comma separated)</FieldLabel>
            <TextInput
              value={retrievalStyleTags}
              onChangeText={setRetrievalStyleTags}
              autoCapitalize="none"
              placeholder="minimal, streetwear"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>colors (comma separated)</FieldLabel>
            <TextInput
              value={retrievalColors}
              onChangeText={setRetrievalColors}
              autoCapitalize="none"
              placeholder="black, white"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <ToggleRow
            label="Include diagnostics"
            value={includeRetrievalDiagnostics}
            onValueChange={setIncludeRetrievalDiagnostics}
          />
          <DebugButton
            label={busyAction === "retrieve" ? "Retrieving..." : "Retrieve Wardrobe Context"}
            onPress={() => runRetrieval()}
            disabled={isBusy}
          />
          <View style={{ gap: 8 }}>
            <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Quick Tests</Text>
            <DebugButton
              label="Office outfit with black shoes"
              onPress={() => runRetrievalQuickTest({
                query: "office outfit with black shoes",
                occasion: "office",
                formality: "smart_casual",
                categories: "top, bottom, footwear, outerwear",
                colors: "black",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Summer casual outfit"
              onPress={() => runRetrievalQuickTest({
                query: "summer casual outfit",
                occasion: "vacation",
                weather: "hot",
                formality: "casual",
                styleTags: "casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Date night outfit"
              onPress={() => runRetrievalQuickTest({
                query: "date night outfit",
                occasion: "dinner",
                formality: "smart_casual",
                styleTags: "polished",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Streetwear outfit"
              onPress={() => runRetrievalQuickTest({
                query: "streetwear outfit",
                formality: "casual",
                styleTags: "streetwear",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Rainy day outfit"
              onPress={() => runRetrievalQuickTest({
                query: "rainy day outfit",
                weather: "rain",
                categories: "outerwear, footwear",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Smart casual dinner"
              onPress={() => runRetrievalQuickTest({
                query: "smart casual dinner",
                occasion: "dinner",
                formality: "smart_casual",
                styleTags: "classic, minimal",
              })}
              disabled={isBusy}
              variant="secondary"
            />
          </View>
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Outfit Generation</Text>
          <View style={{ gap: 7 }}>
            <FieldLabel>query</FieldLabel>
            <TextInput
              value={outfitQuery}
              onChangeText={setOutfitQuery}
              autoCapitalize="sentences"
              placeholder="office outfit with black shoes"
              placeholderTextColor={colors.textMuted}
              style={[inputStyle(colors), { minHeight: 72, textAlignVertical: "top" }]}
              multiline
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>count</FieldLabel>
            <TextInput
              value={outfitCount}
              onChangeText={setOutfitCount}
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>occasion</FieldLabel>
            <TextInput
              value={outfitOccasion}
              onChangeText={setOutfitOccasion}
              placeholder="office"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>weather</FieldLabel>
            <TextInput
              value={outfitWeather}
              onChangeText={setOutfitWeather}
              placeholder="rain"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>formality</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Any", "any"],
                ["Casual", "casual"],
                ["Smart casual", "smart_casual"],
                ["Formal", "formal"],
              ].map(([label, value]) => (
                <FormalityOption
                  key={`outfit-${value}`}
                  label={label}
                  selected={outfitFormality === value}
                  onPress={() => setOutfitFormality(value as typeof outfitFormality)}
                />
              ))}
            </View>
          </View>
          <ToggleRow
            label="Include diagnostics"
            value={includeOutfitDiagnostics}
            onValueChange={setIncludeOutfitDiagnostics}
          />
          <DebugButton
            label={busyAction === "previewOutfitContext" ? "Previewing Context..." : "Preview Outfit Context"}
            onPress={() => runOutfitAction("previewOutfitContext")}
            disabled={isBusy}
            variant="secondary"
          />
          <DebugButton
            label={busyAction === "generateOutfits" ? "Generating Outfits..." : "Generate Outfits"}
            onPress={() => runOutfitAction("generateOutfits")}
            disabled={isBusy}
          />
          <View style={{ gap: 8 }}>
            <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Quick Tests</Text>
            <DebugButton
              label="Office outfit with black shoes"
              onPress={() => runOutfitQuickTest({
                query: "office outfit with black shoes",
                occasion: "office",
                formality: "smart_casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Summer casual outfit"
              onPress={() => runOutfitQuickTest({
                query: "summer casual outfit",
                occasion: "vacation",
                weather: "hot",
                formality: "casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Date night outfit"
              onPress={() => runOutfitQuickTest({
                query: "date night outfit",
                occasion: "dinner",
                formality: "smart_casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Streetwear outfit"
              onPress={() => runOutfitQuickTest({
                query: "streetwear outfit",
                formality: "casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Smart casual dinner"
              onPress={() => runOutfitQuickTest({
                query: "smart casual dinner",
                occasion: "dinner",
                formality: "smart_casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Rainy day outfit"
              onPress={() => runOutfitQuickTest({
                query: "rainy day outfit",
                weather: "rain",
              })}
              disabled={isBusy}
              variant="secondary"
            />
          </View>
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>AURA Styling Agent</Text>
          <View style={{ gap: 7 }}>
            <FieldLabel>query</FieldLabel>
            <TextInput
              value={agentQuery}
              onChangeText={setAgentQuery}
              autoCapitalize="sentences"
              placeholder="office outfit with black shoes"
              placeholderTextColor={colors.textMuted}
              style={[inputStyle(colors), { minHeight: 72, textAlignVertical: "top" }]}
              multiline
            />
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>mode</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Auto", "auto"],
                ["Generate", "generate_outfit"],
                ["Refine", "refine_outfit"],
                ["Explain", "explain_outfit"],
                ["Feedback", "feedback"],
              ].map(([label, value]) => (
                <FormalityOption
                  key={`agent-mode-${value}`}
                  label={label}
                  selected={agentMode === value}
                  onPress={() => setAgentMode(value as AgentMode)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>count</FieldLabel>
            <TextInput
              value={agentCount}
              onChangeText={setAgentCount}
              keyboardType="number-pad"
              placeholder="3"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>occasion</FieldLabel>
            <TextInput
              value={agentOccasion}
              onChangeText={setAgentOccasion}
              placeholder="office"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>weather</FieldLabel>
            <TextInput
              value={agentWeather}
              onChangeText={setAgentWeather}
              placeholder="hot"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>formality</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Any", "any"],
                ["Casual", "casual"],
                ["Smart casual", "smart_casual"],
                ["Formal", "formal"],
              ].map(([label, value]) => (
                <FormalityOption
                  key={`agent-formality-${value}`}
                  label={label}
                  selected={agentFormality === value}
                  onPress={() => setAgentFormality(value as typeof agentFormality)}
                />
              ))}
            </View>
          </View>
          <ToggleRow
            label="Use style memory"
            value={agentUseStyleMemory}
            onValueChange={setAgentUseStyleMemory}
          />
          <ToggleRow
            label="Include diagnostics"
            value={includeAgentDiagnostics}
            onValueChange={setIncludeAgentDiagnostics}
          />
          <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
            Previous outfit available: {previousOutfitForAgent ? previousOutfitForAgent.title : "none"}
          </Text>
          <DebugButton
            label={busyAction === "runAgent" ? "Running Agent..." : "Run Styling Agent"}
            onPress={() => runAgent()}
            disabled={isBusy}
          />
          <View style={{ gap: 8 }}>
            <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Quick Tests</Text>
            <DebugButton
              label="Agent: Office black shoes"
              onPress={() => runAgentQuickTest({
                query: "office outfit with black shoes",
                occasion: "office",
                formality: "smart_casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Agent: Date night"
              onPress={() => runAgentQuickTest({
                query: "date night outfit",
                occasion: "dinner",
                formality: "smart_casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Refine: Less formal"
              onPress={() => runAgentQuickTest({
                query: "make it less formal",
                mode: "refine_outfit",
                formality: "casual",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Explain Previous Outfit"
              onPress={() => runAgentQuickTest({
                query: "why does this outfit work?",
                mode: "explain_outfit",
              })}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Feedback: Not my vibe"
              onPress={() => runAgentQuickTest({
                query: "not my vibe",
                mode: "feedback",
                feedbackType: "not_my_vibe",
              })}
              disabled={isBusy}
              variant="secondary"
            />
          </View>
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>AURA Metrics</Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
            Developer-only aggregate counters for AURA quality, reliability, and resume evidence. No prompts, vectors, or raw model responses are stored.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 150 }}>
              <DebugButton
                label={busyAction === "getMetrics" ? "Loading Metrics..." : "Get Metrics"}
                onPress={getAuraMetrics}
                disabled={isBusy}
                variant="secondary"
              />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <DebugButton
                label={busyAction === "refreshMetrics" ? "Refreshing..." : "Refresh Snapshot"}
                onPress={() => refreshAuraMetrics(false)}
                disabled={isBusy}
              />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <DebugButton
                label="Dry Run Snapshot"
                onPress={() => refreshAuraMetrics(true)}
                disabled={isBusy}
                variant="tertiary"
              />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <DebugButton
                label={busyAction === "resumeMetrics" ? "Building Resume Metrics..." : "Get Resume Metrics"}
                onPress={getAuraResumeMetrics}
                disabled={isBusy}
                variant="secondary"
              />
            </View>
            <View style={{ flex: 1, minWidth: 150 }}>
              <DebugButton
                label={busyAction === "resetMetrics" ? "Resetting..." : "Reset Metrics"}
                onPress={resetAuraMetrics}
                disabled={isBusy}
                variant="danger"
              />
            </View>
          </View>
          {metricsData ? <MetricsSnapshotCard data={metricsData} /> : null}
          {resumeMetricsData ? <ResumeMetricsCard data={resumeMetricsData} /> : null}
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 10 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>AURA Offline Evals</Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
            Local-only golden-set checks for retrieval quality, outfit quality, hallucination rate, and agent regressions.
          </Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
            Run from Functions: npm run eval:aura, npm run eval:aura -- --suite hard, or npm run eval:aura:gate.
          </Text>
          <Text style={[auraTypography.caption, { color: colors.textMuted }]}>
            Optional judge: AURA_EVAL_USE_LLM_JUDGE=true npm run eval:aura -- --judge
          </Text>
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Backfill</Text>
          <View style={{ gap: 7 }}>
            <FieldLabel>limit (max 100 per batch)</FieldLabel>
            <TextInput
              value={limit}
              onChangeText={setLimit}
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <ToggleRow label="Dry run" value={dryRun} onValueChange={setDryRun} />
          <ToggleRow label="Force" value={force} onValueChange={setForce} />
          <ToggleRow
            label="Show only indexed items"
            value={showOnlyIndexedItems}
            onValueChange={(value) => {
              setShowOnlyIndexedItems(value);
              if (value) setShowOnlyFailures(false);
            }}
          />
          <ToggleRow
            label="Show only failures"
            value={showOnlyFailures}
            onValueChange={(value) => {
              setShowOnlyFailures(value);
              if (value) setShowOnlyIndexedItems(false);
            }}
          />
          <DebugButton
            label={busyAction === "backfill" ? "Running Backfill..." : "Run Backfill"}
            onPress={() => runBackfill(null)}
            disabled={isBusy}
          />
          <DebugButton
            label="Run Next Batch"
            onPress={() => runBackfill(backfillData?.nextCursor ?? null)}
            disabled={isBusy || !backfillData?.hasMore || !backfillData.nextCursor}
            variant="secondary"
          />
          <DebugButton
            label={busyAction === "backfillAll" ? "Backfilling Entire Closet..." : "Backfill Entire Closet"}
            onPress={runBackfillAll}
            disabled={isBusy}
            variant="tertiary"
          />
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Style Memory</Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
            Developer tools for recording feedback memories, retrieving personalization context, and inspecting the deterministic style profile.
          </Text>
          <View style={{ gap: 7 }}>
            <FieldLabel>memory query</FieldLabel>
            <TextInput
              value={styleMemoryQuery}
              onChangeText={(value) => {
                setStyleMemoryDebugState((current) => nextStyleMemoryQueryState(current, value));
              }}
              placeholder="office outfit with black shoes"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <ToggleRow
            label="Auto infer occasion"
            value={styleMemoryAutoInferOccasion}
            onValueChange={(value) => {
              setStyleMemoryDebugState((current) => ({
                ...current,
                autoInferOccasion: value,
                occasion: value ? "" : current.occasion,
                formality: value ? "" : current.formality,
                respectInputOccasion: value ? false : current.respectInputOccasion,
              }));
            }}
          />
          <ToggleRow
            label="Respect manual occasion"
            value={styleMemoryRespectInputOccasion}
            onValueChange={(value) => {
              setStyleMemoryDebugState((current) => ({ ...current, respectInputOccasion: value }));
            }}
            disabled={styleMemoryAutoInferOccasion}
          />
          <View style={{ gap: 7 }}>
            <FieldLabel>occasion</FieldLabel>
            <TextInput
              value={styleMemoryOccasion}
              onChangeText={(value) => {
                setStyleMemoryDebugState((current) => ({ ...current, occasion: value }));
              }}
              editable={!styleMemoryAutoInferOccasion}
              placeholder="office"
              placeholderTextColor={colors.textMuted}
              style={[inputStyle(colors), { opacity: styleMemoryAutoInferOccasion ? 0.55 : 1 }]}
            />
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>formality</FieldLabel>
            <TextInput
              value={styleMemoryFormality}
              onChangeText={(value) => {
                setStyleMemoryDebugState((current) => ({ ...current, formality: value }));
              }}
              editable={!styleMemoryAutoInferOccasion}
              placeholder="smart_casual"
              placeholderTextColor={colors.textMuted}
              style={[inputStyle(colors), { opacity: styleMemoryAutoInferOccasion ? 0.55 : 1 }]}
            />
          </View>
          <DebugButton
            label="Clear occasion/formality"
            onPress={clearStyleMemoryOccasionFormality}
            disabled={isBusy}
            variant="tertiary"
          />
          <JsonCard title="Style Memory Request Preview" data={styleMemoryRequestPreview} />
          <View style={{ gap: 8 }}>
            <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Quick Tests</Text>
            <DebugButton
              label="Streetwear outfit"
              onPress={() => setStyleMemoryQuickTest("Streetwear outfit")}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Office outfit with black shoes"
              onPress={() => setStyleMemoryQuickTest("office outfit with black shoes")}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Date night outfit"
              onPress={() => setStyleMemoryQuickTest("Date night outfit")}
              disabled={isBusy}
              variant="secondary"
            />
            <DebugButton
              label="Summer casual outfit"
              onPress={() => setStyleMemoryQuickTest("Summer casual outfit")}
              disabled={isBusy}
              variant="secondary"
            />
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>manual memory polarity</FieldLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                ["Positive", "positive"],
                ["Negative", "negative"],
                ["Neutral", "neutral"],
              ].map(([label, value]) => (
                <FormalityOption
                  key={`memory-${value}`}
                  label={label}
                  selected={styleMemoryPolarity === value}
                  onPress={() => setStyleMemoryPolarity(value as typeof styleMemoryPolarity)}
                />
              ))}
            </View>
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>manual note</FieldLabel>
            <TextInput
              value={styleMemoryNote}
              onChangeText={setStyleMemoryNote}
              placeholder="Prefers clean neutral smart-casual outfits with loafers."
              placeholderTextColor={colors.textMuted}
              style={[inputStyle(colors), { minHeight: 86, textAlignVertical: "top" }]}
              multiline
            />
          </View>
          <DebugButton
            label={busyAction === "addManualMemory" ? "Adding Memory..." : "Add Manual Style Memory"}
            onPress={addManualStyleMemory}
            disabled={isBusy}
          />
          <DebugButton
            label={busyAction === "retrieveMemories" ? "Retrieving Memories..." : "Retrieve Memories"}
            onPress={retrieveStyleMemories}
            disabled={isBusy}
            variant="secondary"
          />
          <DebugButton
            label={busyAction === "getStyleProfile" ? "Loading Profile..." : "Get Style Profile"}
            onPress={getStyleProfile}
            disabled={isBusy}
            variant="secondary"
          />
          <DebugButton
            label="Rebuild Style Profile Dry Run"
            onPress={() => rebuildStyleProfile(true)}
            disabled={isBusy}
            variant="tertiary"
          />
          <DebugButton
            label="Rebuild Style Profile Write"
            onPress={() => rebuildStyleProfile(false)}
            disabled={isBusy}
            variant="tertiary"
          />
          <DebugButton
            label={busyAction === "listMemories" ? "Listing Memories..." : "List Style Memories"}
            onPress={listStyleMemories}
            disabled={isBusy}
            variant="secondary"
          />
          <View style={{ gap: 10 }}>
            <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Disliked Outfits</Text>
            {debugDislikedOutfits.length ? (
              debugDislikedOutfits.map((record) => (
                <View
                  key={record.id}
                  style={{
                    borderColor: colors.border,
                    borderRadius: layout.mediumRadius,
                    borderWidth: 1,
                    gap: 8,
                    padding: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[auraTypography.body, { color: colors.text, fontWeight: "800" }]}>{record.title}</Text>
                      <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
                        {record.active ? "Active" : "Hidden"} - {new Date(record.createdAt).toLocaleString()}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => toggleDebugDislikedOutfit(record)}
                      style={{
                        ...auraButtonStyle(colors, "secondary"),
                        minHeight: 34,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                      }}
                    >
                      <Text style={auraButtonTextStyle(colors, "secondary")}>
                        {record.active ? "Hide" : "Restore"}
                      </Text>
                    </Pressable>
                  </View>
                  {record.itemThumbnails.length ? (
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {record.itemThumbnails.map((uri, index) => (
                        <Image
                          key={`${record.id}-${index}`}
                          source={{ uri }}
                          style={{
                            backgroundColor: colors.surfaceSoft,
                            borderRadius: 8,
                            height: 42,
                            width: 42,
                          }}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                No disliked AURA outfits found for the signed-in user.
              </Text>
            )}
          </View>
          <View style={{ gap: 7 }}>
            <FieldLabel>memoryId to soft delete</FieldLabel>
            <TextInput
              value={styleMemoryDeleteId}
              onChangeText={setStyleMemoryDeleteId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="style memory id"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <DebugButton
            label={busyAction === "deleteMemory" ? "Deleting Memory..." : "Soft Delete Style Memory"}
            onPress={deleteStyleMemory}
            disabled={isBusy}
            variant="danger"
          />
          <DebugButton
            label={busyAction === "deleteAllMemories" ? "Deleting All Memories..." : "Delete All Debug Memories"}
            onPress={deleteAllStyleMemories}
            disabled={isBusy}
            variant="danger"
          />
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Draft Audit</Text>
          <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
            Inspect hidden draft, needs-review, or unfinished ingestion closet item documents.
          </Text>
          <Text style={[auraTypography.caption, { color: colors.textSecondary }]}>
            Items with draftState: ready are finalized closet items and are not treated as drafts.
          </Text>
          <View style={{ gap: 7 }}>
            <FieldLabel>limit</FieldLabel>
            <TextInput
              value={draftAuditLimit}
              onChangeText={setDraftAuditLimit}
              keyboardType="number-pad"
              placeholder="100"
              placeholderTextColor={colors.textMuted}
              style={inputStyle(colors)}
            />
          </View>
          <ToggleRow label="Show only needs review" value={showOnlyNeedsReview} onValueChange={setShowOnlyNeedsReview} />
          <ToggleRow label="Show only isDraft" value={showOnlyIsDraft} onValueChange={setShowOnlyIsDraft} />
          <DebugButton
            label={busyAction === "audit" ? "Running Draft Audit..." : "Run Draft Audit"}
            onPress={runDraftAudit}
            disabled={isBusy}
            variant="secondary"
          />
        </View>

        <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
          <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Abandoned Draft Cleanup</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 130, gap: 7 }}>
              <FieldLabel>cutoffDays</FieldLabel>
              <TextInput
                value={cleanupCutoffDays}
                onChangeText={setCleanupCutoffDays}
                keyboardType="number-pad"
                placeholder="7"
                placeholderTextColor={colors.textMuted}
                style={inputStyle(colors)}
              />
            </View>
            <View style={{ flex: 1, minWidth: 130, gap: 7 }}>
              <FieldLabel>limit (max 500)</FieldLabel>
              <TextInput
                value={cleanupLimit}
                onChangeText={setCleanupLimit}
                keyboardType="number-pad"
                placeholder="100"
                placeholderTextColor={colors.textMuted}
                style={inputStyle(colors)}
              />
            </View>
          </View>
          <DebugButton
            label={busyAction === "previewCleanup" ? "Previewing Cleanup..." : "Preview Cleanup"}
            onPress={runCleanupPreview}
            disabled={isBusy}
            variant="secondary"
          />
          <DebugButton
            label={busyAction === "deleteCleanup" ? "Deleting Abandoned Drafts..." : "Delete Abandoned Drafts"}
            onPress={runBulkCleanup}
            disabled={isBusy}
            variant="danger"
          />
        </View>

        {isBusy ? (
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <ActivityIndicator color={colors.ctaCream} />
          </View>
        ) : null}

        {agentData ? (
          <>
            <AgentSummaryCard data={agentData} />
            <AgentIntentCard data={agentData} />
            {agentData.styleMemorySummary ? (
              <AgentStyleMemoryCard summary={agentData.styleMemorySummary} />
            ) : null}
            {agentData.explanation ? <AgentExplanationCard explanation={agentData.explanation} /> : null}
            {agentData.feedback ? <AgentFeedbackCard feedback={agentData.feedback} /> : null}
            {agentData.suggestedActions.length ? (
              <AgentActionsCard actions={agentData.suggestedActions} />
            ) : null}
            {agentData.outfits?.length ? (
              agentData.outfits.map((outfit) => (
                <OutfitRecommendationCard
                  key={`agent-${outfit.outfitId || outfit.title}`}
                  outfit={outfit}
                  onFeedback={recordOutfitFeedback}
                  feedbackDisabled={isBusy}
                />
              ))
            ) : null}
            {agentData.diagnostics ? (
              <>
                <AgentDiagnosticsSummaryCard diagnostics={agentData.diagnostics} />
                <JsonCard title="Agent Diagnostics Raw" data={agentData.diagnostics} />
              </>
            ) : null}
          </>
        ) : null}

        {outfitContextData && !outfitGenerationData ? (
          <>
            <OutfitContextCard data={outfitContextData} />
            <JsonCard title="Retrieval Plan" data={outfitContextData.retrievalPlan} />
            {["top", "bottom", "footwear", "outerwear", "accessory", "one_piece"].map((role) => (
              <OutfitCandidateSection
                key={`outfit-candidates-${role}`}
                role={role}
                items={outfitContextData.candidates[role] ?? []}
              />
            ))}
          </>
        ) : null}

        {outfitGenerationData ? (
          <>
            <View style={{ ...auraCardStyle(colors, "card"), gap: 12 }}>
              <Text style={[auraTypography.cardTitle, { color: colors.text }]}>Outfit Generation Summary</Text>
              <DetailLine label="Query" value={outfitGenerationData.query} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                <SummaryMetric label="Outfits" value={outfitGenerationData.outfits.length} />
              </View>
            </View>
            {outfitValidationWarnings.length ? (
              <OutfitValidationWarningsCard warnings={outfitValidationWarnings} />
            ) : null}
            {outfitGenerationData.outfits.length ? (
              outfitGenerationData.outfits.map((outfit) => (
                <OutfitRecommendationCard
                  key={outfit.outfitId || outfit.title}
                  outfit={outfit}
                  onFeedback={recordOutfitFeedback}
                  feedbackDisabled={isBusy}
                />
              ))
            ) : (
              <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                No outfits returned.
              </Text>
            )}
          </>
        ) : null}

        {cleanupPreviewData ? (
          <>
            <DraftCleanupSummaryCard
              title="Cleanup Preview"
              cutoffDays={cleanupPreviewData.cutoffDays}
              totalChecked={cleanupPreviewData.totalChecked}
              candidateCount={cleanupPreviewData.deleteCandidateCount}
            />
            <DraftCleanupItemsSection
              title="Cleanup Candidates"
              items={cleanupPreviewData.candidates}
              emptyText="No abandoned empty drafts matched the cleanup rules."
            />
          </>
        ) : null}

        {cleanupBulkData ? (
          <>
            <DraftCleanupSummaryCard
              title="Cleanup Result"
              cutoffDays={cleanupBulkData.cutoffDays}
              totalChecked={cleanupBulkData.totalChecked}
              deletedCount={cleanupBulkData.deletedCount}
              skippedCount={cleanupBulkData.skippedCount}
            />
            <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
              Cleanup finished. Rerun Draft Audit to verify remaining hidden states.
            </Text>
            <DraftCleanupItemsSection
              title="Deleted Items"
              items={cleanupBulkData.deletedItems}
              emptyText="No abandoned drafts were deleted."
            />
            <DraftCleanupItemsSection
              title="Skipped Items"
              items={cleanupBulkData.skippedItems}
              emptyText="No skipped items were returned."
              tone="error"
            />
          </>
        ) : null}

        {retrievalData ? (
          <>
            <RetrievalSummaryCard data={retrievalData} />
            <RetrievalBucketsCard data={retrievalData} />
            <View style={{ gap: 10 }}>
              <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Retrieval Results</Text>
              {retrievalData.results.length ? (
                retrievalData.results.map((item) => (
                  <RetrievalResultCard key={`retrieval-${item.itemId}`} item={item} />
                ))
              ) : (
                <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                  No retrievable ready items matched the current query and filters.
                </Text>
              )}
            </View>
          </>
        ) : null}

        {draftAuditData ? (
          <>
            <DraftAuditSummaryCard data={draftAuditData} />
            <IntelligenceCoverageCard data={draftAuditData} />
            <View style={{ gap: 10 }}>
              <Text style={[auraTypography.eyebrow, { color: colors.textSecondary }]}>Draft Items</Text>
              {visibleDraftItems.length ? (
                visibleDraftItems.map((item) => (
                  <DraftAuditItemCard
                    key={`draft-${item.itemId}`}
                    item={item}
                    onDelete={deleteDraftItem}
                    deleting={busyAction === "deleteDraft"}
                  />
                ))
              ) : (
                <Text style={[auraTypography.bodySecondary, { color: colors.textSecondary }]}>
                  No draft audit items match the current filters.
                </Text>
              )}
            </View>
          </>
        ) : null}

        {backfillData ? (
          <>
            <BackfillSummaryCard data={backfillData} />
            <CursorCard data={backfillData} />
            {!showOnlyFailures ? (
              <BackfillItemsSection
                title="Indexed Items"
                items={backfillData.indexedItems}
                emptyText="No indexed items returned in the first 50 debug entries."
              />
            ) : null}
            {!showOnlyIndexedItems && !showOnlyFailures ? (
              <BackfillItemsSection
                title="Skipped Items"
                items={backfillData.skippedItems}
                emptyText="No skipped items returned in the first 50 debug entries."
              />
            ) : null}
            {!showOnlyIndexedItems ? (
              <BackfillItemsSection
                title="Failed Items"
                items={backfillData.failedItems}
                emptyText="No failed items returned in the first 50 debug entries."
                tone="error"
              />
            ) : null}
          </>
        ) : null}

        {fullBackfillData ? <FullBackfillSummaryCard data={fullBackfillData} /> : null}

        {memoryDiagnosticsData ? <StyleMemoryDiagnosticsCard diagnostics={memoryDiagnosticsData} /> : null}
        {memoryDiagnosticsData ? <StyleMemoryRelevanceCard items={memoryScoreItems} /> : null}
        {styleProfileWarning ? <StyleProfileWarningCard data={styleProfileWarning} /> : null}
        {streetwearResolvedAsOffice ? <StreetwearOfficeBugWarningCard /> : null}
        {leakedVectorPaths.length ? <VectorLeakWarningCard paths={leakedVectorPaths} /> : null}

        {response ? <JsonCard title="Response" data={response} /> : null}
        {error ? <JsonCard title="Error" tone="error" data={error} /> : null}
      </ScrollView>
    </SafeScreen>
  );
}

export default function IntelligenceDebugRoute() {
  // TODO: Remove before production launch.
  if (!__DEV__) {
    return <ProductionUnavailable />;
  }
  return <IntelligenceDebugScreen />;
}
