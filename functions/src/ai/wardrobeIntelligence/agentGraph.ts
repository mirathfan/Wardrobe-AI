import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { HttpsError } from "firebase-functions/v2/https";
import {
  buildAgentResponseNode,
  buildExplanationResponseNode,
  buildFeedbackResponseNode,
  classifyIntentNode,
  fallbackResponseNode,
  generateOutfitsNode,
  recordFeedbackNode,
  resolveRefinementContextNode,
  retrieveOutfitContextNode,
  retrieveStyleMemoryNode,
  type AuraAgentDeps,
} from "./agentNodes";
import type {
  AuraAgentNodeName,
  AuraStylingAgentDiagnostics,
  AuraStylingAgentMode,
  AuraStylingAgentRequest,
  AuraStylingAgentResponse,
  AuraStylingAgentState,
} from "./agentTypes";

const MAX_AGENT_STEPS = 10;
const LANGGRAPH_VERSION = "phase-5-langgraph-v1";
const INTERNAL_VERSION = "phase-5-internal-v1";

type AgentNode = (
  state: AuraStylingAgentState,
  deps: AuraAgentDeps
) => Promise<AuraStylingAgentState> | AuraStylingAgentState;

type AgentStateKey = Exclude<keyof AuraStylingAgentState, "uid" | "request" | "diagnostics">;

type AgentStateUpdate = Partial<AuraStylingAgentState>;

const AuraAgentStateAnnotation = Annotation.Root({
  uid: Annotation<string>(),
  request: Annotation<AuraStylingAgentRequest>(),
  intent: Annotation<AuraStylingAgentState["intent"]>(),
  input: Annotation<AuraStylingAgentState["input"]>(),
  context: Annotation<AuraStylingAgentState["context"]>(),
  styleMemory: Annotation<AuraStylingAgentState["styleMemory"]>(),
  outfits: Annotation<AuraStylingAgentState["outfits"]>(),
  validationErrors: Annotation<AuraStylingAgentState["validationErrors"]>(),
  validationWarnings: Annotation<AuraStylingAgentState["validationWarnings"]>(),
  repaired: Annotation<AuraStylingAgentState["repaired"]>(),
  feedbackResult: Annotation<AuraStylingAgentState["feedbackResult"]>(),
  response: Annotation<AuraStylingAgentState["response"]>(),
  diagnostics: Annotation<AuraStylingAgentDiagnostics>(),
});

export type AuraAgentGraphState = typeof AuraAgentStateAnnotation.State;

const NODE_REGISTRY: Record<AuraAgentNodeName, AgentNode> = {
  classify_intent: classifyIntentNode,
  retrieve_style_memory: retrieveStyleMemoryNode,
  retrieve_outfit_context: retrieveOutfitContextNode,
  generate_outfits: generateOutfitsNode,
  build_agent_response: buildAgentResponseNode,
  resolve_refinement_context: resolveRefinementContextNode,
  build_explanation_response: buildExplanationResponseNode,
  record_feedback: recordFeedbackNode,
  build_feedback_response: buildFeedbackResponseNode,
  fallback_response: fallbackResponseNode,
  update_style_profile: (state) => state,
};

const STATE_KEYS: AgentStateKey[] = [
  "intent",
  "input",
  "context",
  "styleMemory",
  "outfits",
  "validationErrors",
  "validationWarnings",
  "repaired",
  "feedbackResult",
  "response",
];

function graphRunId(now = Date.now()): string {
  return `aura-agent-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

function diagnostics(runner: AuraStylingAgentDiagnostics["runner"]): AuraStylingAgentDiagnostics {
  return {
    graphRunId: graphRunId(),
    runner,
    langGraphEnabled: runner === "langgraph",
    graphVersion: runner === "langgraph" ? LANGGRAPH_VERSION : INTERNAL_VERSION,
    maxSteps: MAX_AGENT_STEPS,
    mode: "unknown",
    steps: [],
    nodesExecuted: [],
    nodeTimings: [],
    warnings: [],
    errors: [],
  };
}

function errorMessage(error: unknown): string {
  const candidate = error as { message?: unknown };
  return typeof candidate?.message === "string" ? candidate.message : String(error);
}

function appendNodeDiagnostics(
  diagnosticsValue: AuraStylingAgentDiagnostics,
  node: AuraAgentNodeName,
  status: "success" | "failed",
  durationMs: number,
  mode: AuraStylingAgentMode | undefined,
  error?: unknown,
): AuraStylingAgentDiagnostics {
  return {
    ...diagnosticsValue,
    mode: mode ?? diagnosticsValue.mode,
    steps: [...diagnosticsValue.steps, node],
    nodesExecuted: [...diagnosticsValue.nodesExecuted, node],
    nodeTimings: [
      ...diagnosticsValue.nodeTimings,
      { node, durationMs, status },
    ],
    errors: error ? [...diagnosticsValue.errors, errorMessage(error)] : diagnosticsValue.errors,
  };
}

function patchFromState(
  previous: AuraStylingAgentState,
  next: AuraStylingAgentState,
  diagnosticsValue: AuraStylingAgentDiagnostics,
): AgentStateUpdate {
  const patch: AgentStateUpdate = { diagnostics: diagnosticsValue };
  for (const key of STATE_KEYS) {
    if (next[key] !== previous[key]) {
      patch[key] = next[key] as never;
    }
  }
  return patch;
}

function timedLangGraphNode(node: AuraAgentNodeName, deps: AuraAgentDeps) {
  return async (state: AuraAgentGraphState): Promise<AgentStateUpdate> => {
    if (state.diagnostics.steps.length >= MAX_AGENT_STEPS) {
      throw new Error(`AURA styling agent exceeded max graph steps (${MAX_AGENT_STEPS}).`);
    }
    const current = state as AuraStylingAgentState;
    const startedAt = Date.now();
    try {
      const nextState = await NODE_REGISTRY[node](current, deps);
      const nextDiagnostics = appendNodeDiagnostics(
        nextState.diagnostics,
        node,
        "success",
        Date.now() - startedAt,
        nextState.intent?.mode,
      );
      return patchFromState(current, nextState, nextDiagnostics);
    } catch (error) {
      const failedDiagnostics = appendNodeDiagnostics(
        current.diagnostics,
        node,
        "failed",
        Date.now() - startedAt,
        current.intent?.mode,
        error,
      );
      current.diagnostics = failedDiagnostics;
      throw error;
    }
  };
}

function routeAfterClassify(state: AuraAgentGraphState): AuraAgentNodeName {
  const mode = state.intent?.mode ?? "unknown";
  if (mode === "generate_outfit") return "retrieve_style_memory";
  if (mode === "refine_outfit") return "resolve_refinement_context";
  if (mode === "explain_outfit") return "build_explanation_response";
  if (mode === "feedback") return "record_feedback";
  return "fallback_response";
}

export function createAuraStylingAgentLangGraph(deps: AuraAgentDeps = {}) {
  return new StateGraph(AuraAgentStateAnnotation)
    .addNode("classify_intent", timedLangGraphNode("classify_intent", deps))
    .addNode("retrieve_style_memory", timedLangGraphNode("retrieve_style_memory", deps))
    .addNode("retrieve_outfit_context", timedLangGraphNode("retrieve_outfit_context", deps))
    .addNode("generate_outfits", timedLangGraphNode("generate_outfits", deps))
    .addNode("build_agent_response", timedLangGraphNode("build_agent_response", deps))
    .addNode("resolve_refinement_context", timedLangGraphNode("resolve_refinement_context", deps))
    .addNode("build_explanation_response", timedLangGraphNode("build_explanation_response", deps))
    .addNode("record_feedback", timedLangGraphNode("record_feedback", deps))
    .addNode("build_feedback_response", timedLangGraphNode("build_feedback_response", deps))
    .addNode("fallback_response", timedLangGraphNode("fallback_response", deps))
    .addEdge(START, "classify_intent")
    .addConditionalEdges("classify_intent", routeAfterClassify, {
      retrieve_style_memory: "retrieve_style_memory",
      resolve_refinement_context: "resolve_refinement_context",
      build_explanation_response: "build_explanation_response",
      record_feedback: "record_feedback",
      fallback_response: "fallback_response",
    })
    .addEdge("retrieve_style_memory", "retrieve_outfit_context")
    .addEdge("retrieve_outfit_context", "generate_outfits")
    .addEdge("generate_outfits", "build_agent_response")
    .addEdge("build_agent_response", END)
    .addEdge("resolve_refinement_context", "retrieve_style_memory")
    .addEdge("build_explanation_response", END)
    .addEdge("record_feedback", "build_feedback_response")
    .addEdge("build_feedback_response", END)
    .addEdge("fallback_response", END)
    .compile({ name: "aura-styling-agent" });
}

function routeForInternal(state: AuraStylingAgentState): AuraAgentNodeName[] {
  const mode = state.intent?.mode ?? "unknown";
  if (mode === "generate_outfit") {
    return [
      "retrieve_style_memory",
      "retrieve_outfit_context",
      "generate_outfits",
      "build_agent_response",
    ];
  }
  if (mode === "refine_outfit") {
    return [
      "resolve_refinement_context",
      "retrieve_style_memory",
      "retrieve_outfit_context",
      "generate_outfits",
      "build_agent_response",
    ];
  }
  if (mode === "explain_outfit") return ["build_explanation_response"];
  if (mode === "feedback") return ["record_feedback", "build_feedback_response"];
  return ["fallback_response"];
}

async function executeInternalNode(
  name: AuraAgentNodeName,
  state: AuraStylingAgentState,
  deps: AuraAgentDeps,
): Promise<AuraStylingAgentState> {
  if (state.diagnostics.steps.length >= MAX_AGENT_STEPS) {
    throw new Error(`AURA styling agent exceeded max graph steps (${MAX_AGENT_STEPS}).`);
  }
  const startedAt = Date.now();
  try {
    const nextState = await NODE_REGISTRY[name](state, deps);
    return {
      ...nextState,
      diagnostics: appendNodeDiagnostics(
        nextState.diagnostics,
        name,
        "success",
        Date.now() - startedAt,
        nextState.intent?.mode,
      ),
    };
  } catch (error) {
    state.diagnostics = appendNodeDiagnostics(
      state.diagnostics,
      name,
      "failed",
      Date.now() - startedAt,
      state.intent?.mode,
      error,
    );
    throw error;
  }
}

export async function runAuraStylingAgentInternalGraph(
  uid: string,
  request: AuraStylingAgentRequest,
  deps: AuraAgentDeps = {},
): Promise<AuraStylingAgentResponse> {
  let state: AuraStylingAgentState = {
    uid,
    request,
    diagnostics: diagnostics("controlled-internal-graph"),
  };
  state = await executeInternalNode("classify_intent", state, deps);
  for (const node of routeForInternal(state)) {
    state = await executeInternalNode(node, state, deps);
  }
  if (!state.response) {
    throw new Error("AURA styling agent completed without a response.");
  }
  if (request.includeDiagnostics) {
    return {
      ...state.response,
      diagnostics: state.diagnostics,
    };
  }
  return state.response;
}

export function shouldUseLangGraph(): boolean {
  return process.env.AURA_AGENT_USE_LANGGRAPH !== "false";
}

export async function runAuraStylingAgentLangGraph(
  uid: string,
  request: AuraStylingAgentRequest,
  deps: AuraAgentDeps = {},
): Promise<AuraStylingAgentResponse> {
  const graph = createAuraStylingAgentLangGraph(deps);
  const state = await graph.invoke({
    uid,
    request,
    diagnostics: diagnostics("langgraph"),
  }, {
    recursionLimit: MAX_AGENT_STEPS,
  }) as AuraStylingAgentState;
  if (!state.response) {
    throw new Error("AURA LangGraph styling agent completed without a response.");
  }
  if (request.includeDiagnostics) {
    return {
      ...state.response,
      diagnostics: state.diagnostics,
    };
  }
  return state.response;
}

export async function runAuraStylingAgentGraph(
  uid: string,
  request: AuraStylingAgentRequest,
  deps: AuraAgentDeps = {},
): Promise<AuraStylingAgentResponse> {
  if (!shouldUseLangGraph()) {
    return runAuraStylingAgentInternalGraph(uid, request, deps);
  }
  try {
    return await runAuraStylingAgentLangGraph(uid, request, deps);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `AURA LangGraph styling agent failed: ${errorMessage(error)}`);
  }
}
