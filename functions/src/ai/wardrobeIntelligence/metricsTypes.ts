export const METRICS_VERSION = 1;

export const AURA_METRIC_EVENT_TYPES = [
  "wardrobe_coverage_checked",
  "retrieval_completed",
  "retrieval_failed",
  "outfit_generation_completed",
  "outfit_generation_failed",
  "agent_run_completed",
  "agent_run_failed",
  "style_feedback_recorded",
  "style_memory_retrieved",
  "saved_outfit_created",
  "saved_outfit_duplicate",
  "wear_event_created",
  "planned_event_created",
  "weather_warning_generated",
] as const;

export type AuraMetricEventType = typeof AURA_METRIC_EVENT_TYPES[number];

export type AuraMetricsMode =
  | "generate_outfit"
  | "refine_outfit"
  | "explain_outfit"
  | "feedback"
  | "unknown";

export type AuraMetricsCategory =
  | "top"
  | "bottom"
  | "footwear"
  | "outerwear"
  | "accessory"
  | "one_piece";

export type AuraMetricsNodeName =
  | "classify_intent"
  | "retrieve_style_memory"
  | "retrieve_outfit_context"
  | "generate_outfits"
  | "build_agent_response"
  | "resolve_refinement_context"
  | "build_explanation_response"
  | "record_feedback";

export type AuraMetricsFeedbackType =
  | "like"
  | "save"
  | "wear"
  | "not_my_vibe"
  | "more_like_this"
  | "less_like_this"
  | "too_formal"
  | "too_casual"
  | "more_streetwear"
  | "less_streetwear";

export type AuraMetrics = {
  userId: string;
  wardrobe: {
    readyVisibleItems: number;
    indexedReadyItems: number;
    missingEmbeddingReadyItems: number;
    embeddingCoveragePercent: number;
    lastCoverageCheckedAt: number | null;
  };
  retrieval: {
    totalRetrievals: number;
    successfulRetrievals: number;
    failedRetrievals: number;
    averageLatencyMs: number;
    averageReturnedItems: number;
    averageCandidateCountsByCategory: Record<AuraMetricsCategory, number>;
  };
  outfitGeneration: {
    totalGenerationRequests: number;
    successfulGenerations: number;
    failedGenerations: number;
    requestedOutfitCountTotal: number;
    returnedOutfitCountTotal: number;
    averageRequestedOutfitCount: number;
    averageReturnedOutfitCount: number;
    averageOutfitScore: number;
    averageStylePreferenceFit: number;
    validationFailureCount: number;
    repairCount: number;
    repairRate: number;
    zeroValidOutfitFailures: number;
  };
  agent: {
    totalAgentRuns: number;
    successfulAgentRuns: number;
    failedAgentRuns: number;
    averageGraphDurationMs: number;
    averageNodeTimings: Partial<Record<AuraMetricsNodeName, number>>;
    modeCounts: Record<AuraMetricsMode, number>;
    langGraphRunCount: number;
    internalRunnerFallbackCount: number;
  };
  styleMemory: {
    totalMemories: number;
    activeMemories: number;
    positiveMemories: number;
    negativeMemories: number;
    manualMemories: number;
    averageMemoriesRetrieved: number;
    totalFeedbackActions: number;
    feedbackCounts: Record<AuraMetricsFeedbackType, number>;
  };
  savedOutfits: {
    totalSavedOutfits: number;
    auraAgentSavedOutfits: number;
    duplicateSaveAttempts: number;
  };
  calendar: {
    totalWearEvents: number;
    totalPlannedEvents: number;
    auraAgentWearEvents: number;
    auraAgentPlannedEvents: number;
    weatherWarningsGenerated: number;
  };
  reliability: {
    lastErrorAt: number | null;
    recentErrorCount: number;
    errorsByCode: Record<string, number>;
    timeoutCount: number;
    fallbackCount: number;
  };
  updatedAt: number | null;
  metricsVersion: number;
};

export type AuraMetricsSnapshot = AuraMetrics;

export type AuraResumeMetrics = {
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

export type AuraMetricEvent =
  | {
    type: "wardrobe_coverage_checked";
    readyVisibleItems: number;
    indexedReadyItems: number;
    missingEmbeddingReadyItems: number;
  }
  | {
    type: "retrieval_completed";
    latencyMs?: number;
    returnedCount?: number;
    categoryCounts?: Partial<Record<AuraMetricsCategory, number>>;
  }
  | {
    type: "retrieval_failed";
    code?: string;
    timeout?: boolean;
  }
  | {
    type: "outfit_generation_completed";
    requestedCount?: number;
    returnedCount?: number;
    averageOutfitScore?: number;
    averageStylePreferenceFit?: number;
    validationFailureCount?: number;
    repaired?: boolean;
  }
  | {
    type: "outfit_generation_failed";
    requestedCount?: number;
    code?: string;
    zeroValidOutfits?: boolean;
    timeout?: boolean;
  }
  | {
    type: "agent_run_completed";
    mode?: AuraMetricsMode;
    durationMs?: number;
    runner?: "langgraph" | "controlled-internal-graph" | string;
    nodeTimings?: { node: string; durationMs: number }[];
  }
  | {
    type: "agent_run_failed";
    mode?: AuraMetricsMode;
    code?: string;
    timeout?: boolean;
    fallback?: boolean;
  }
  | {
    type: "style_feedback_recorded";
    feedbackType?: string;
  }
  | {
    type: "style_memory_retrieved";
    retrievedCount?: number;
  }
  | {
    type: "saved_outfit_created";
    source?: string;
  }
  | {
    type: "saved_outfit_duplicate";
  }
  | {
    type: "wear_event_created";
    source?: string;
  }
  | {
    type: "planned_event_created";
    source?: string;
    weatherWarningsCount?: number;
  }
  | {
    type: "weather_warning_generated";
    count?: number;
  };
