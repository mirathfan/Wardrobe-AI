# AURA Phase 8 Calendar Planning

This phase connects AURA agent outfit actions to the existing Calendar tab.

## Daily Record

Calendar reads:

`users/{uid}/outfits/{dateKey}`

Agent planned records use:

```ts
{
  dateKey: "YYYY-MM-DD",
  planned: true,
  itemIds: string[],
  plannedSource: "aura_agent",
  plannedOutfit: {
    source: "aura_agent",
    title,
    outfitId,
    outfitFingerprint,
    itemsByCategory,
    reasons,
    outfitSnapshot,
    weatherContext?,
    weatherWarnings?
  }
}
```

Agent worn records use:

```ts
{
  dateKey: "YYYY-MM-DD",
  planned: false,
  itemIds: string[],
  wornOutfit: {
    source: "aura_agent",
    title,
    outfitId,
    outfitFingerprint,
    itemsByCategory,
    wornAt,
    outfitSnapshot,
    weatherContext?,
    weatherWarnings?
  }
}
```

## Callables

`planAuraAgentOutfit`

- Auth required.
- Requires `outfit` and `dateKey`.
- Dedupes by `planned_{dateKey}_{outfitFingerprint}`.
- Writes `outfitEvents`.
- Writes Calendar-visible `plannedOutfit`.
- Returns warning copy when weather context is provided.

`logAuraAgentOutfitWear`

- Auth required.
- Accepts optional `dateKey`.
- Dedupes by `aura_agent_{dateKey}_{outfitFingerprint}`.
- Writes `wearEvents`.
- Writes `outfitEvents`.
- Writes Calendar-visible `wornOutfit`.
- Updates item wear metadata.

`dislikeAuraAgentOutfit`

- Auth required.
- Dedupes by `outfitFingerprint`.
- Writes `dislikedOutfits`.
- Writes `outfitFeedback` so the outfit is visible in disliked look history.
- Records negative style memory.

## Natural Language Dates

The shared parser supports:

- `today`
- `tomorrow`
- `yesterday`
- `this Friday`
- `next Friday`
- `last Friday`
- weekdays
- `MM/DD`
- `May 30`
- `in 2 days`

Ambiguous commands return low confidence and should ask a clarification instead of writing data.

## Calendar UI

The Calendar outfit card now recognizes AURA planned/worn records, including:

- AURA source label.
- Original AURA title.
- Outfit fingerprint and snapshot metadata.
- Weather warning icon and warning text.

Marking an AURA planned outfit as worn preserves AURA metadata from the planned record.

## Weather Provider

The app currently uses client-side Open-Meteo utilities. AURA planning attempts weather lookup only when location permission is already granted.

TODO:

- Add a server-side weather provider if warnings must be guaranteed from backend-only actions.
- Add richer Calendar detail actions such as Ask AURA to remix from a planned outfit.
