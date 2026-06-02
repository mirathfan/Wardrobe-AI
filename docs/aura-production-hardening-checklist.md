# AURA Production Hardening Checklist

Use this checklist before shipping AURA agent changes. It focuses on reliability, privacy, fallback behavior, and production readiness rather than new product features.

## Production Route

- User sends a styling prompt from the AURA chat screen.
- `EXPO_PUBLIC_AURA_AGENT_ENABLED` is checked before the agent route is used.
- `runAuraStylingAgentClient` calls `runAuraStylingAgent` in `us-central1`.
- Agent responses are sanitized before rendering, Firestore persistence, and local cache persistence.
- Outfit cards render with one outfit and multiple outfits.
- Carousel selection updates the selected outfit, details panel, and action rail.
- Action buttons use the selected carousel outfit.
- Save writes to `users/{uid}/savedOutfits`.
- Wear and plan actions write to the existing calendar daily outfit model.
- Dislike writes the disliked outfit/style feedback model.
- Chat reload renders old classic AURA messages and newer agent messages.

## Loading And Timeouts

- Main agent call timeout: `45s`.
- Action callable timeout: `20s` for save, wear, plan, and dislike.
- Chat send paths clear loading and typing state in `finally`.
- Action paths clear the pending action state in `finally`.
- Duplicate action taps are blocked while an action is pending.
- User-facing failures avoid internal terms and use friendly copy.
- Dev logs for the hardened agent route use `[AURA_HARDENING]`.

## Feature Flags And Fallback

To disable the production agent quickly:

```sh
EXPO_PUBLIC_AURA_AGENT_ENABLED=0
```

Then restart Expo or rebuild the app environment. With the flag off, AURA should use the older fallback styling flow and must not call `runAuraStylingAgent`.

Backend internal fallback:

- `AURA_AGENT_USE_LANGGRAPH=false` should only affect the callable runner fallback.
- Eval, metrics, and debug routes must stay dev-only or callable-auth protected.
- `/dev/intelligence-debug` remains hidden behind `__DEV__`.

## Security And Privacy

Never store or display these in production chat, cache, saved outfits, or client-visible payloads:

- `embeddingVector`
- `embeddingRaw`
- `_values`
- `vector`
- `rawVector`
- `queryVector`
- raw OpenAI responses
- raw LangGraph state
- auth tokens, API keys, or secrets
- production diagnostics
- `scoreBreakdown`
- full `aiMetadata`

Client-side sanitizers:

- `sanitizeAuraClientPayload`
- `sanitizeAuraAgentPayload`
- `sanitizeAgentResponseForStorage`
- `sanitizeChatMessageForCache`

Backend responses and metrics should continue to sanitize before returning to the client.

## Firestore Rules Review

Rules are present in `firestore.rules` and deny all unmatched paths. Current AURA user data paths are under `users/{uid}` and use owner checks.

Review these collections before production deploys:

- `users/{uid}/items`
- `users/{uid}/aiChats`
- `users/{uid}/aiChats/{chatId}/messages`
- `users/{uid}/styleEvents`
- `users/{uid}/savedOutfits`
- `users/{uid}/outfits`
- `users/{uid}/auraLooks`
- `users/{uid}/outfitFeedback`
- `users/{uid}/dislikedOutfits`

If a client-visible collection is missing explicit rules, keep the deny-all fallback until a scoped rule and QA case are added.

## Performance Notes

- Keep chat state free of giant diagnostics JSON.
- Cache only renderable agent payloads and remote image URLs.
- Prefer cleaned/thumbnail item image URLs in outfit cards.
- Keep agent card components memo-friendly and avoid recomputing carousel page data from raw diagnostics.
- Saved outfits and calendar lists should use bounded queries and list virtualization where available.

## Error And Empty States

Verify friendly states for:

- no closet items
- no indexed closet items
- no valid outfits found
- callable timeout or network failure
- missing vector index
- no saved outfits
- no calendar events
- no style memories

Avoid production UI terms like RAG, LangGraph, vector, embedding, function error, or raw diagnostics.

## Eval Gate

Before changing prompts, retrieval, scoring, or generation behavior:

```sh
cd functions
npm run eval:aura:gate
```

From the app root, this shortcut is also available:

```sh
npm run eval:aura:gate
```

The current baseline is 23/23 pass, hallucination rate 0, critical failures 0.
