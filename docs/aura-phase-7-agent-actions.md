# AURA Phase 7 Agent Actions

Phase 7 makes the production AURA outfit card actions persistent without changing outfit generation or the card design.

## Calendar Model

Calendar visibility uses the existing daily outfit model:

`users/{uid}/outfits/{dateKey}`

Daily docs may contain:

- `plannedOutfit`
- `wornOutfit`

Agent actions also write supporting history records:

- `users/{uid}/outfitEvents/{eventId}`
- `users/{uid}/wearEvents/{wearEventId}`
- `users/{uid}/savedOutfits/{savedOutfitId}`
- `users/{uid}/dislikedOutfits/{dislikedOutfitId}`
- `users/{uid}/outfitFeedback/{feedbackId}` for visible liked/disliked profile history

The Calendar tab reads the daily model, so AURA planning and wear logging must always update `users/{uid}/outfits/{dateKey}`.

## Action Behavior

`Save Preference`

- Calls `saveAuraAgentOutfit`.
- Dedupes by outfit fingerprint.
- Writes `savedOutfits`.
- Records style memory feedback type `save`.

`Wore This`

- Calls `logAuraAgentOutfitWear` with today's `dateKey`.
- Dedupes by `outfitFingerprint + dateKey`.
- Writes `wearEvents`, `outfitEvents`, and Calendar-visible `wornOutfit`.
- Updates item wear metadata when safe.
- Records style memory feedback type `wear`.

`Plan this`

- Prompts for a date in chat.
- Natural-language planning calls `planAuraAgentOutfit`.
- Writes a Calendar-visible `plannedOutfit`.
- Dedupes by `outfitFingerprint + dateKey`.

`Not My Vibe`

- Calls `dislikeAuraAgentOutfit`.
- Writes `dislikedOutfits`.
- Writes visible Profile history through `outfitFeedback` with `feedbackType: "outfit_disliked"`.
- Records style memory feedback type `not_my_vibe`.
- Does not broadly blacklist all item categories or colors.

Completed action state is stored per outfit in `agentActionStates`.

## Natural Language Actions

The chat route handles selected or referenced outfits before generating a new outfit.

Examples:

- `I wore this yesterday`
- `I wore this last Friday`
- `Log this outfit for May 30`
- `Save this for Friday`
- `Plan this outfit for tomorrow`
- `Wear outfit 2 next Monday`
- `Save the third one for Friday`
- `Not my vibe`
- `Save this outfit`

Outfit references use carousel order:

- `outfit 1`, `first one`
- `outfit 2`, `second one`
- `outfit 3`, `third one`

If no outfit number is present, the currently selected carousel outfit is used, falling back to the first outfit in the latest agent response.

## Weather Warnings

Planning can attach weather context when the client already has device location permission and Open-Meteo data is available. Planning never fails if weather is unavailable.

Warnings are deterministic:

- Rain warns about suede, sandals, canvas, linen, light colors, or wet-pavement readiness.
- Cold warns when there is no outerwear.
- Hot warns about heavy layers.
- Wind warns about light or loose layers.
- Snow warns about traction and warm layers.

Warnings are saved on the daily planned outfit and outfit event, and the Calendar card renders a warning indicator plus warning copy.

## Debug / Profile Visibility

Production visibility:

- Profile > My Looks already reads `outfitFeedback`, so disliked AURA outfits appear in the disliked area.

Developer visibility:

- `/dev/intelligence-debug` shows recent `dislikedOutfits` with thumbnails, active state, and hide/restore.

## Manual QA

1. Generate 3 outfits in AURA.
2. Swipe to outfit 2.
3. Tap `Not My Vibe`.
4. Confirm `dislikedOutfits` and `outfitFeedback` records exist.
5. Confirm Profile > My Looks > Disliked can show the outfit.
6. Swipe to outfit 3.
7. Tap `Wore This`.
8. Confirm Calendar today shows the same outfit as worn.
9. Type `I wore this yesterday`.
10. Confirm Calendar yesterday shows the selected outfit.
11. Type `Save this for Friday`.
12. Confirm Calendar Friday shows the planned outfit.
13. Type `Save outfit 2 for tomorrow`.
14. Confirm outfit 2, not outfit 1, is planned.
15. With location/weather available, confirm a planned rainy/cold/hot outfit displays warnings.
