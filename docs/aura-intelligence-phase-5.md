# AURA Intelligence Phase 5: LangGraph-Powered Styling Agent

Phase 5 adds a developer-only LangGraph-powered AURA Styling Agent callable on top of the Phase 2 wardrobe retrieval, Phase 3 outfit generation, and Phase 4 style memory systems.

The first version is intentionally controlled and deterministic. It does not add free-form multi-agent autonomy. The graph has fixed nodes, no loops, and a max step budget of 10.

## Callable

```text
runAuraStylingAgent
```

Auth is required.

Input:

```json
{
  "query": "office outfit with black shoes",
  "mode": "auto",
  "count": 3,
  "occasion": "office",
  "weather": "",
  "formality": "smart_casual",
  "useStyleMemory": true,
  "includeDiagnostics": true,
  "previousOutfit": {},
  "feedbackType": "not_my_vibe"
}
```

Supported modes:

- `generate_outfit`
- `refine_outfit`
- `explain_outfit`
- `feedback`
- `unknown`

`auto` can be sent by clients, but the response always resolves to one of the supported modes above.

## Real LangGraph Migration

Phase 5 now uses the official LangGraph JS package:

```text
@langchain/langgraph
@langchain/core
```

The graph is built with:

```ts
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
```

The Firebase callable uses the compiled LangGraph app by default. The old controlled internal runner remains available only as a rollback fallback behind:

```text
AURA_AGENT_USE_LANGGRAPH=false
```

Default behavior is equivalent to:

```text
AURA_AGENT_USE_LANGGRAPH=true
```

Graph state is represented with a LangGraph `Annotation.Root` containing the authenticated user ID, normalized request, classified intent, style memory context, outfit retrieval context, generated outfits, feedback result, final response, and diagnostics.

Graph properties:

- fixed routes
- no loops
- max 10 steps
- LangGraph `recursionLimit` set to 10
- structured diagnostics
- deterministic intent classification
- wardrobe retrieval failures fail the request
- style memory vector-index failures continue without memory and return a warning

Diagnostics identify the active runner:

```json
{
  "runner": "langgraph",
  "langGraphEnabled": true,
  "graphVersion": "phase-5-langgraph-v1"
}
```

If fallback is explicitly enabled, diagnostics show:

```json
{
  "runner": "controlled-internal-graph",
  "langGraphEnabled": false,
  "graphVersion": "phase-5-internal-v1"
}
```

## Workflow

Generate route:

1. `classify_intent`
2. `retrieve_style_memory`
3. `retrieve_outfit_context`
4. `generate_outfits`
5. `build_agent_response`

Refine route:

1. `classify_intent`
2. `resolve_refinement_context`
3. `retrieve_style_memory`
4. `retrieve_outfit_context`
5. `generate_outfits`
6. `build_agent_response`

Explain route:

1. `classify_intent`
2. `build_explanation_response`

Feedback route:

1. `classify_intent`
2. `record_feedback`
3. `build_feedback_response`

Unknown route:

1. `classify_intent`
2. `fallback_response`

## Response Shape

```json
{
  "mode": "generate_outfit",
  "intent": {
    "mode": "generate_outfit",
    "query": "office outfit with black shoes",
    "confidence": 0.88,
    "constraints": {
      "occasion": "office",
      "formality": "smart_casual",
      "requiredColors": ["black"],
      "requiredCategories": ["footwear"]
    }
  },
  "message": "I found 3 closet-based options. First up: Clean Office Fit.",
  "suggestedActions": [],
  "outfits": [],
  "styleMemorySummary": {
    "profileSummary": "Prefers polished outfits.",
    "positiveMemoryCount": 1,
    "negativeMemoryCount": 0,
    "warnings": []
  },
  "diagnostics": {
    "runner": "langgraph",
    "langGraphEnabled": true,
    "graphVersion": "phase-5-langgraph-v1",
    "maxSteps": 10,
    "steps": [
      "classify_intent",
      "retrieve_style_memory",
      "retrieve_outfit_context",
      "generate_outfits",
      "build_agent_response"
    ]
  }
}
```

Callable responses sanitize vector-like fields before returning to the client.

## Debug Panel

The developer-only `/dev/intelligence-debug` screen includes an AURA Styling Agent section with:

- query
- mode selector
- count
- occasion
- weather
- formality
- use style memory toggle
- include diagnostics toggle
- quick tests for generation, refinement, explanation, and feedback

The result viewer shows:

- agent message
- intent
- suggested next actions
- outfits
- style memory summary
- explanation
- feedback result
- diagnostics
- raw JSON response

Refinement, explanation, and feedback use the most recent generated outfit when available.

The diagnostics viewer shows:

- `runner`
- `langGraphEnabled`
- `graphVersion`
- nodes executed
- node timings

It warns when `runner !== "langgraph"`:

```text
Agent is not using real LangGraph.
```

## Retest

1. Open `/dev/intelligence-debug`.
2. In AURA Styling Agent, run `Agent: Office black shoes`.
3. Verify `mode` is `generate_outfit`, outfits are returned, and diagnostics show `runner: "langgraph"`, `langGraphEnabled: true`, and `graphVersion: "phase-5-langgraph-v1"`.
4. Run `Refine: Less formal` after an outfit exists.
5. Verify the request uses the previous outfit and returns a new generated outfit.
6. Run `Explain Previous Outfit`.
7. Verify item rationales and score breakdown appear.
8. Run `Feedback: Not my vibe`.
9. Verify the feedback result is recorded and style memory can be retrieved in the Style Memory section.
10. Temporarily disable or omit the style memory vector index only in a safe dev environment and verify generation continues with a style memory warning.
