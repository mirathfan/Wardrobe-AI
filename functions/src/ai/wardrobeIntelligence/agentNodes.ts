import { HttpsError } from "firebase-functions/v2/https";
import { classifyAuraStylingAgentIntent, resolveRequestedOutfitCount } from "./agentIntent";
import {
  buildAgentResponse,
  buildExplanationResponse,
  buildFallbackAgentResponse,
  buildFeedbackResponse,
} from "./agentResponse";
import {
  normalizeOutfitGenerationInput,
  retrieveOutfitGenerationContext,
  type RetrieveOutfitContextDeps,
} from "./outfitContext";
import { generateValidatedOutfitsFromContext } from "./outfitGeneration";
import { safeRecordAuraMetricEvent } from "./metrics";
import {
  outfitStyleMemoryContextFromResponse,
  recordStyleMemoryFeedback,
  retrieveStyleMemoryContextForUser,
  type RecordStyleMemoryDeps,
  type RetrieveStyleMemoryDeps,
} from "./styleMemory";
import type {
  NormalizedOutfitGenerationInput,
  OutfitGenerationContext,
  OutfitValidationWarning,
  ValidatedOutfit,
} from "./outfitTypes";
import type { StyleMemoryContextResponse } from "./styleMemoryTypes";
import type {
  AuraAgentErrorLike,
  AuraStylingAgentState,
} from "./agentTypes";

export type AuraAgentDeps = RetrieveOutfitContextDeps & RetrieveStyleMemoryDeps & RecordStyleMemoryDeps & {
  retrieveStyleMemory?: (
    uid: string,
    input: NormalizedOutfitGenerationInput,
    state: AuraStylingAgentState
  ) => Promise<StyleMemoryContextResponse | null>;
  retrieveOutfitContext?: (
    uid: string,
    input: NormalizedOutfitGenerationInput,
    state: AuraStylingAgentState
  ) => Promise<OutfitGenerationContext>;
  generateOutfits?: (args: {
    input: NormalizedOutfitGenerationInput;
    context: OutfitGenerationContext;
    state: AuraStylingAgentState;
  }) => Promise<{
    outfits: ValidatedOutfit[];
    validationErrors: string[];
    validationWarnings: OutfitValidationWarning[];
    repaired: boolean;
  }>;
  recordFeedback?: (
    uid: string,
    input: {
      query?: string;
      occasion?: string;
      formality?: string;
      outfit?: Record<string, unknown>;
      outfitId?: string;
      feedbackType: NonNullable<AuraStylingAgentState["intent"]>["constraints"]["feedbackType"];
      selectedItemIds?: string[];
      note?: string;
    },
    state: AuraStylingAgentState
  ) => Promise<unknown>;
};

type AgentNode = (
  state: AuraStylingAgentState,
  deps: AuraAgentDeps
) => Promise<AuraStylingAgentState> | AuraStylingAgentState;

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function previousOutfitField(state: AuraStylingAgentState, field: string): string {
  const previous = state.request.previousOutfit;
  if (!previous || typeof previous !== "object" || Array.isArray(previous)) return "";
  return cleanText((previous as Record<string, unknown>)[field]);
}

function selectedOutfitContext(state: AuraStylingAgentState): string {
  const context = state.request.conversationContext;
  if (!context) return "";
  const selectedId = cleanText(context.selectedOutfitId);
  const selectedRef = selectedId
    ? context.priorOutfitRefs.find((entry) => entry.outfitId === selectedId)
    : undefined;
  const refs = [
    selectedRef ? `Selected outfit: ${[
      selectedRef.index ? `outfit ${selectedRef.index}` : "",
      selectedRef.title,
      selectedRef.occasion ? `occasion ${selectedRef.occasion}` : "",
      selectedRef.formality ? `formality ${selectedRef.formality}` : "",
      selectedRef.vibe ? `vibe ${selectedRef.vibe}` : "",
      selectedRef.itemIds.length ? `itemIds ${selectedRef.itemIds.join(", ")}` : "",
      selectedRef.summary,
    ].filter(Boolean).join("; ")}` : "",
    context.priorOutfitRefs.length
      ? `Recent outfit cards: ${context.priorOutfitRefs
        .slice(-4)
        .map((entry) => [
          entry.index ? `outfit ${entry.index}` : entry.outfitId,
          entry.title,
          entry.itemIds.length ? `items ${entry.itemIds.join(", ")}` : "",
        ].filter(Boolean).join(" - "))
        .filter(Boolean)
        .join(" | ")}`
      : "",
    context.feedbackSignals.length ? `Recent feedback: ${context.feedbackSignals.slice(-6).join(" | ")}` : "",
  ].filter(Boolean);
  return refs.join(" ");
}

function selectedOutfitField(state: AuraStylingAgentState, field: "occasion" | "formality" | "vibe"): string {
  const context = state.request.conversationContext;
  const selectedId = cleanText(context?.selectedOutfitId);
  const selectedRef = selectedId
    ? context?.priorOutfitRefs.find((entry) => entry.outfitId === selectedId)
    : undefined;
  return cleanText(selectedRef?.[field]);
}

function recentTurnContext(state: AuraStylingAgentState): string {
  const turns = state.request.conversationContext?.recentTurns ?? [];
  if (!turns.length) return "";
  return turns
    .slice(-6)
    .map((turn) => `${turn.role}: ${cleanText(turn.text).slice(0, 600)}`)
    .join(" | ");
}

function nonAnyFormality(value: unknown): string {
  const text = cleanText(value);
  return text && text !== "any" ? text : "";
}

function errorMessage(error: unknown): string {
  const candidate = error as AuraAgentErrorLike;
  return typeof candidate?.message === "string" ? candidate.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { code?: unknown };
  return typeof candidate.code === "string" ? candidate.code : undefined;
}

function styleMemoryIndexWarning(error: unknown): string | null {
  const code = errorCode(error);
  const message = errorMessage(error);
  const details = error && typeof error === "object"
    ? JSON.stringify((error as { details?: unknown }).details ?? {})
    : "{}";
  const combined = `${message} ${details}`;
  if (code === "failed-precondition" && /\b(index|vector|embedding)\b/i.test(combined)) {
    return `Style memory unavailable: ${message}`;
  }
  if (/\b(style memory|memory).*\b(index|vector)\b/i.test(combined)) {
    return `Style memory unavailable: ${message}`;
  }
  return null;
}

function assertMinimumContext(context: OutfitGenerationContext) {
  if (context.diagnostics.missingRequiredRoles.length) {
    throw new HttpsError("failed-precondition", "Not enough ready closet items to generate a complete outfit.", {
      missingRequiredRoles: context.diagnostics.missingRequiredRoles,
      candidateCounts: context.diagnostics.candidateCounts,
    });
  }
}

function agentOutfitQuery(state: AuraStylingAgentState): string {
  const intent = state.intent;
  const requestQuery = cleanText(state.request.query);
  const base = requestQuery || intent?.query || "closet outfit";
  const context = [
    selectedOutfitContext(state),
    recentTurnContext(state),
  ].filter(Boolean).join(" ");
  const contextSuffix = context ? ` Recent chat/card context: ${context}` : "";
  if (intent?.mode !== "refine_outfit") return `${base}.${contextSuffix}`.trim();
  const avoid = intent.constraints.avoidItemIds.length
    ? ` Avoid these previous item IDs when possible: ${intent.constraints.avoidItemIds.join(", ")}.`
    : "";
  return `${base}. Refinement request: ${intent.constraints.refinementInstruction ?? base}.${avoid}${contextSuffix}`;
}

function outfitInputFromState(state: AuraStylingAgentState): NormalizedOutfitGenerationInput {
  if (!state.intent) throw new Error("Cannot build outfit input before intent classification.");
  return normalizeOutfitGenerationInput({
    query: agentOutfitQuery(state),
    count: resolveRequestedOutfitCount(state.request),
    occasion: state.request.occasion ||
      state.intent.constraints.occasion ||
      previousOutfitField(state, "occasion") ||
      selectedOutfitField(state, "occasion"),
    weather: state.request.weather || state.intent.constraints.weather,
    formality: nonAnyFormality(state.request.formality) ||
      nonAnyFormality(state.intent.constraints.formality) ||
      nonAnyFormality(previousOutfitField(state, "formality")) ||
      nonAnyFormality(selectedOutfitField(state, "formality")) ||
      state.intent.constraints.formality,
    preferredColors: state.intent.constraints.preferredColors,
    requiredColors: state.intent.constraints.requiredColors,
    requiredCategories: state.intent.constraints.requiredCategories,
    requiredItemIds: state.intent.constraints.selectedItemIds,
    avoidItemIds: state.intent.constraints.avoidItemIds,
    avoidTerms: state.intent.constraints.avoidTerms,
    includeDiagnostics: state.request.includeDiagnostics === true,
    useStyleMemory: state.request.useStyleMemory !== false,
  });
}

export const classifyIntentNode: AgentNode = (state) => ({
  ...state,
  intent: classifyAuraStylingAgentIntent(state.request),
});

export const resolveRefinementContextNode: AgentNode = (state) => {
  if (!state.request.previousOutfit) {
    return {
      ...state,
      diagnostics: {
        ...state.diagnostics,
        warnings: [
          ...state.diagnostics.warnings,
          "Refinement requested without a previous outfit; falling back to a fresh generation.",
        ],
      },
    };
  }
  return state;
};

export const retrieveStyleMemoryNode: AgentNode = async (state, deps) => {
  const input = outfitInputFromState(state);
  if (!input.useStyleMemory) {
    return {
      ...state,
      input,
      styleMemory: null,
    };
  }
  try {
    const styleMemory = deps.retrieveStyleMemory
      ? await deps.retrieveStyleMemory(state.uid, input, state)
      : await retrieveStyleMemoryContextForUser(state.uid, {
        query: input.query,
        occasion: input.occasion,
        formality: input.formality,
        limit: 8,
        respectInputOccasion: true,
      }, deps);
    await safeRecordAuraMetricEvent(state.uid, {
      type: "style_memory_retrieved",
      retrievedCount: (styleMemory?.positiveMemories.length ?? 0) + (styleMemory?.negativeMemories.length ?? 0),
    });
    return {
      ...state,
      input,
      styleMemory,
    };
  } catch (error) {
    const warning = styleMemoryIndexWarning(error);
    if (!warning) throw error;
    return {
      ...state,
      input,
      styleMemory: null,
      diagnostics: {
        ...state.diagnostics,
        warnings: [...state.diagnostics.warnings, warning],
      },
    };
  }
};

export const retrieveOutfitContextNode: AgentNode = async (state, deps) => {
  const input = state.input ?? outfitInputFromState(state);
  const context = deps.retrieveOutfitContext
    ? await deps.retrieveOutfitContext(state.uid, input, state)
    : await retrieveOutfitGenerationContext(state.uid, input, deps);
  const contextWithMemory: OutfitGenerationContext = state.styleMemory
    ? { ...context, styleMemory: outfitStyleMemoryContextFromResponse(state.styleMemory) }
    : context;
  assertMinimumContext(contextWithMemory);
  return {
    ...state,
    input,
    context: contextWithMemory,
    diagnostics: {
      ...state.diagnostics,
      retrievalPlan: contextWithMemory.retrievalPlan,
      contextDiagnostics: contextWithMemory.diagnostics,
    },
  };
};

export const generateOutfitsNode: AgentNode = async (state, deps) => {
  if (!state.input || !state.context) {
    throw new Error("Cannot generate outfits before retrieval context is available.");
  }
  const generated = deps.generateOutfits
    ? await deps.generateOutfits({ input: state.input, context: state.context, state })
    : await generateValidatedOutfitsFromContext(state.input, state.context);
  return {
    ...state,
    outfits: generated.outfits,
    validationErrors: generated.validationErrors,
    validationWarnings: generated.validationWarnings,
    repaired: generated.repaired,
    diagnostics: {
      ...state.diagnostics,
      validationErrors: generated.validationErrors,
      validationWarnings: generated.validationWarnings,
      repaired: generated.repaired,
    },
  };
};

export const buildAgentResponseNode: AgentNode = (state) => ({
  ...state,
  response: buildAgentResponse(state),
});

export const buildExplanationResponseNode: AgentNode = (state) => ({
  ...state,
  response: buildExplanationResponse(state),
});

export const recordFeedbackNode: AgentNode = async (state, deps) => {
  const feedbackType = state.intent?.constraints.feedbackType;
  if (!feedbackType) {
    throw new HttpsError("invalid-argument", "A feedbackType is required for feedback mode.");
  }
  if (!state.request.previousOutfit) {
    throw new HttpsError("invalid-argument", "previousOutfit is required for feedback mode.");
  }
  const input = {
    query: cleanText(state.request.query) || state.intent?.constraints.occasion || "outfit feedback",
    occasion: state.request.occasion || state.intent?.constraints.occasion,
    formality: state.request.formality,
    outfit: state.request.previousOutfit,
    outfitId: state.request.outfitId || cleanText(state.request.previousOutfit.outfitId),
    feedbackType,
    selectedItemIds: state.intent?.constraints.selectedItemIds,
    note: state.request.note,
  };
  const result = deps.recordFeedback
    ? await deps.recordFeedback(state.uid, input, state)
    : await recordStyleMemoryFeedback(state.uid, input, deps);
  await safeRecordAuraMetricEvent(state.uid, {
    type: "style_feedback_recorded",
    feedbackType,
  });
  return {
    ...state,
    feedbackResult: result,
  };
};

export const updateStyleProfileNode: AgentNode = (state) => state;

export const buildFeedbackResponseNode: AgentNode = (state) => ({
  ...state,
  response: buildFeedbackResponse(state),
});

export const fallbackResponseNode: AgentNode = (state) => ({
  ...state,
  response: buildFallbackAgentResponse(state),
});
