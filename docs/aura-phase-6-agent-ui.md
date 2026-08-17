# AURA Phase 6 Agent UI

Phase 6 adds an optional production-facing UI path for the deployed `runAuraStylingAgent` callable.

## Feature Flag

Set `EXPO_PUBLIC_AURA_AGENT_ENABLED=1` or `true` to route supported AURA chat requests through the LangGraph styling agent.

When the flag is missing or false, the existing AURA chat flow remains unchanged.

For EAS/TestFlight builds this value must exist at build time. The `preview` and `production` profiles in `eas.json` pin:

```json
"env": {
  "EXPO_PUBLIC_AURA_AGENT_ENABLED": "1"
}
```

If this flag is missing from the build profile or remote EAS environment, production builds render the legacy AURA card path for new styling prompts.

## Callable Wrapper

Client calls go through `src/lib/auraStylingAgent.ts`.

The wrapper:

- Uses the existing Firebase app/auth setup.
- Calls `runAuraStylingAgent` with `getFunctions()` and `httpsCallable()`.
- Defaults `includeDiagnostics` to development builds only.
- Removes vectors, diagnostics, and score breakdowns before chat persistence.
- Normalizes callable/auth/config errors into user-safe messages.

## Chat Integration

The main AURA chat screen routes only styling-related requests to the agent:

- outfit generation
- outfit refinement
- outfit explanation
- outfit feedback

Attachments and non-styling flows continue through the classic AURA path. If the agent route fails, the screen renders a friendly fallback message instead of silently producing a legacy outfit card. Suggested action failures show a friendly retryable message.

Development builds show a small AURA chat route diagnostic with:

- agent enabled state
- last route: `agent`, `fallback`, or `agent_failed_fallback`
- agent failure code when available

Development outfit cards also show a source badge: `agent`, `legacy`, or `cached`.

## UI Surface

Agent responses are stored on `AIMessage.agentResponse` and rendered with:

- `AuraAgentMessage`
- `AuraAgentOutfitCard`
- `AuraAgentActionRail`

The card shows outfit titles, item names, item roles, categories, styling notes, missing pieces, and suggested actions. It does not display diagnostics, raw scores, vectors, or item IDs in the UI.

## Suggested Actions

Supported actions:

- refine outfit
- explain outfit
- record feedback
- save preference feedback
- wear feedback

Save and wear currently record style-memory feedback first. Connecting those actions to saved/worn outfit records is intentionally left as a follow-up.

## Manual QA

1. Confirm the flag is off and `Style me today` still uses the classic AURA flow.
2. Set `EXPO_PUBLIC_AURA_AGENT_ENABLED=1`, restart Expo, and send `Style me today`.
3. Confirm the response renders an agent outfit card.
4. Tap an outfit card to select it.
5. Tap `Explain this outfit` and confirm a follow-up explanation appears.
6. Tap `Save Preference` or `Wore This` and confirm feedback is recorded.
7. Temporarily break the callable or use an unauthenticated session and confirm friendly fallback/error behavior.
