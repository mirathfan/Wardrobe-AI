import type { HttpsError } from "firebase-functions/v2/https";
import type { WardrobeRetrievalFormality } from "./retrievalTypes";
import type {
  NormalizedOutfitGenerationInput,
  OutfitGenerationContext,
  OutfitRetrievalPlan,
  OutfitRole,
  OutfitValidationWarning,
  ValidatedOutfit,
} from "./outfitTypes";
import type {
  FeedbackType,
  StyleMemoryContextResponse,
} from "./styleMemoryTypes";

export type AuraStylingAgentMode =
  | "generate_outfit"
  | "refine_outfit"
  | "explain_outfit"
  | "feedback"
  | "unknown";

export type AuraStylingAgentRequestMode = AuraStylingAgentMode | "auto";

export type AuraStylingAgentRequest = {
  query?: string;
  mode?: AuraStylingAgentRequestMode;
  count?: number;
  occasion?: string;
  weather?: string;
  formality?: WardrobeRetrievalFormality;
  preferredColors?: string[];
  requiredColors?: string[];
  requiredCategories?: string[];
  useStyleMemory?: boolean;
  includeDiagnostics?: boolean;
  previousOutfit?: Record<string, unknown>;
  outfitId?: string;
  feedbackType?: FeedbackType;
  selectedItemIds?: string[];
  conversationContext?: AuraAgentConversationContext;
  note?: string;
};

export type AuraAgentConversationTurn = {
  role: "user" | "assistant";
  text: string;
};

export type AuraAgentConversationOutfitRef = {
  outfitId?: string;
  sourceMessageId?: string;
  index?: number;
  title?: string;
  occasion?: string;
  formality?: string;
  vibe?: string;
  itemIds: string[];
  summary?: string;
};

export type AuraAgentConversationContext = {
  recentTurns: AuraAgentConversationTurn[];
  priorOutfitRefs: AuraAgentConversationOutfitRef[];
  selectedOutfitId?: string;
  selectedItemIds: string[];
  feedbackSignals: string[];
};

export type AuraStylingAgentIntentConstraints = {
  occasion?: string;
  weather?: string;
  formality: WardrobeRetrievalFormality;
  preferredColors: string[];
  requiredColors: string[];
  requiredCategories: OutfitRole[];
  styleHints: string[];
  avoidItemIds: string[];
  avoidCategories: OutfitRole[];
  avoidTerms: string[];
  refinementInstruction?: string;
  feedbackType?: FeedbackType;
  selectedItemIds: string[];
};

export type AuraStylingAgentIntent = {
  mode: AuraStylingAgentMode;
  query: string;
  normalizedQuery: string;
  confidence: number;
  reason: string;
  constraints: AuraStylingAgentIntentConstraints;
};

export type AuraAgentNodeName =
  | "classify_intent"
  | "retrieve_style_memory"
  | "retrieve_outfit_context"
  | "generate_outfits"
  | "build_agent_response"
  | "resolve_refinement_context"
  | "build_explanation_response"
  | "record_feedback"
  | "update_style_profile"
  | "build_feedback_response"
  | "fallback_response";

export type AuraAgentNodeTiming = {
  node: AuraAgentNodeName;
  durationMs: number;
  status: "success" | "failed";
};

export type AuraStylingAgentDiagnostics = {
  graphRunId: string;
  runner: "controlled-internal-graph" | "langgraph";
  langGraphEnabled: boolean;
  graphVersion: "phase-5-internal-v1" | "phase-5-langgraph-v1";
  maxSteps: number;
  mode: AuraStylingAgentMode;
  steps: AuraAgentNodeName[];
  nodesExecuted: AuraAgentNodeName[];
  nodeTimings: AuraAgentNodeTiming[];
  warnings: string[];
  errors: string[];
  retrievalPlan?: OutfitRetrievalPlan;
  contextDiagnostics?: OutfitGenerationContext["diagnostics"];
  validationErrors?: string[];
  validationWarnings?: OutfitValidationWarning[];
  repaired?: boolean;
};

export type AuraAgentStyleMemorySummary = {
  profileSummary: string;
  positiveMemoryCount: number;
  negativeMemoryCount: number;
  warnings: string[];
};

export type AuraAgentSuggestedAction = {
  id: string;
  label: string;
  type: "generate" | "refine" | "explain" | "feedback" | "debug";
  payload?: Record<string, unknown>;
};

export type AuraAgentExplanation = {
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

export type AuraAgentFeedbackResult = {
  feedbackType?: FeedbackType;
  recorded: boolean;
  message: string;
};

export type AuraStylingAgentResponse = {
  mode: AuraStylingAgentMode;
  intent: AuraStylingAgentIntent;
  message: string;
  suggestedActions: AuraAgentSuggestedAction[];
  requestedCount?: number;
  outfits?: ValidatedOutfit[];
  styleMemorySummary?: AuraAgentStyleMemorySummary;
  explanation?: AuraAgentExplanation;
  feedback?: AuraAgentFeedbackResult;
  diagnostics?: AuraStylingAgentDiagnostics;
};

export type AuraStylingAgentState = {
  uid: string;
  request: AuraStylingAgentRequest;
  intent?: AuraStylingAgentIntent;
  input?: NormalizedOutfitGenerationInput;
  context?: OutfitGenerationContext;
  styleMemory?: StyleMemoryContextResponse | null;
  outfits?: ValidatedOutfit[];
  validationErrors?: string[];
  validationWarnings?: OutfitValidationWarning[];
  repaired?: boolean;
  feedbackResult?: unknown;
  response?: AuraStylingAgentResponse;
  diagnostics: AuraStylingAgentDiagnostics;
};

export type AuraAgentErrorLike = Error | HttpsError | {
  code?: unknown;
  message?: unknown;
  details?: unknown;
};
