# AURA Production AI QA

Run this checklist before shipping agent, action, saved outfit, calendar, memory, or prompt/retrieval changes.

## A. Agent Chat

1. Ask: `office outfit with black shoes`.
2. Confirm one AURA outfit card renders.
3. Ask: `give me 3 outfits for a date`.
4. Confirm three outfits return in the carousel.
5. Swipe the carousel and confirm the page indicator changes.
6. Open `Why this works` and confirm it updates for the selected outfit.
7. Tap `Explain`.
8. Tap `Make it less formal`.
9. Tap `Different shoes`.
10. Tap `More Like This`.
11. Tap `Not My Vibe`.
12. Confirm no production UI shows RAG, LangGraph, vector, embedding, function error, or diagnostics.

## B. Saved Outfits

1. Generate three outfits.
2. Swipe to outfit 2.
3. Tap `Save Preference` or the save outfit action used by the current UI.
4. Open `Profile > Saved Outfits`.
5. Confirm the same outfit appears in the saved outfit list.
6. Open the saved outfit detail screen.
7. Tap `Ask AURA to Remix`.
8. Delete or remove the saved outfit.
9. Confirm it disappears from Saved Outfits without deleting calendar entries.

## C. Calendar

1. Generate an outfit.
2. Tap `Wore This`.
3. Open Calendar and select today.
4. Confirm the same outfit appears as worn.
5. Return to AURA and type: `save this for tomorrow`.
6. Open Calendar and select tomorrow.
7. Confirm the same outfit appears as planned.
8. Mark the planned outfit as worn.
9. Remove the plan and confirm the date updates correctly.

## D. Memory

1. Like or save an outfit.
2. Ask for a similar outfit request.
3. Confirm the preference is reflected without exact duplicate forcing.
4. Tap `Not My Vibe`.
5. Ask for a similar request again.
6. Confirm the exact disliked combination is avoided without broadly banning all colors or categories.

## E. Metrics And Evals

1. Open the dev intelligence debug screen in development.
2. Refresh metrics.
3. Confirm saved outfit, wear, planned, disliked, eval, and critical failure metrics are plausible.
4. Run:

```sh
cd functions
npm run eval:aura:gate
```

5. Confirm the gate passes before prompt/retrieval/scoring changes ship.

## F. Feature Flags

1. Set `EXPO_PUBLIC_AURA_AGENT_ENABLED=1`.
2. Restart Expo and confirm agent cards render.
3. Set `EXPO_PUBLIC_AURA_AGENT_ENABLED=0`.
4. Restart Expo and confirm the old AURA fallback flow handles styling prompts.
5. If testing backend fallback, set `AURA_AGENT_USE_LANGGRAPH=false` in a safe environment and confirm only the callable runner path changes.

## G. Error Handling

1. Simulate no network or block the callable.
2. Confirm the typing bubble clears.
3. Confirm loading/action states clear.
4. Confirm the user sees friendly copy, such as `I couldn’t complete that right now. Try again.`
5. Simulate timeout if possible.
6. Confirm duplicate taps are blocked while an action is pending.
7. Confirm chat reload still renders older messages after the failure.

## Reload And Persistence

1. Send a text-only message and reload the app.
2. Confirm the text-only message renders.
3. Generate one outfit and reload.
4. Confirm the agent outfit card renders.
5. Generate multiple outfits and reload.
6. Confirm the carousel renders.
7. Confirm a message with missing item images still renders.
8. Confirm action states do not crash if they are missing from older messages.
9. Confirm local cache does not contain diagnostics, vectors, raw model output, or full `aiMetadata`.
