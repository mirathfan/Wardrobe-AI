# AURA Phase 8: Saved Outfits

## Purpose

Saved Outfits is the user-facing lookbook for outfits saved from the AURA agent. It reuses the existing `users/{uid}/savedOutfits/{savedOutfitId}` collection written by `saveAuraAgentOutfit`.

## Data Model

The client reads active saved outfit documents from:

```text
users/{uid}/savedOutfits/{savedOutfitId}
```

Important fields:

- `source`: expected to be `aura_agent` for AURA generated outfits.
- `title`, `vibe`, `occasion`, `formality`
- `itemIds`
- `items[]`: normalized item snapshots with role, name, category, colors, and image URL.
- `explanation`, `stylingTips`, `missingItems`
- `outfitFingerprint`, `outfitId`
- `sourceQuery`, `sourceMessageId`, `sourceAgentRunId`
- `savedAtMs`
- `active`

Deleted saved outfits are soft-deleted by setting `active: false`.

## Routes

- `/saved-outfits`: list of saved AURA outfits.
- `/saved-outfits/[id]`: detail screen with outfit visual, item list, styling notes, and actions.

## Actions

- `Wear Today`: calls `logAuraAgentOutfitWear` with today's `dateKey`. The callable writes the Calendar-visible worn outfit model.
- `Plan`: calls `planAuraAgentOutfit` for quick dates and includes weather context when available.
- `Ask AURA to Remix`: routes to the AURA tab with the saved outfit item IDs as required item hints.
- `Remove Saved Outfit`: soft-deletes the lookbook record only. It does not delete Calendar plans or worn logs.

## Manual QA

1. Generate an outfit in AURA chat.
2. Tap Save Outfit.
3. Open Profile.
4. Open Saved Outfits.
5. Confirm the outfit appears with the AURA visual, title, source, item count, and saved date.
6. Open the outfit detail.
7. Tap Wear Today and confirm Calendar shows the outfit for today.
8. Tap a Plan date and confirm Calendar shows the planned outfit for that date.
9. Tap Ask AURA to Remix and confirm the AURA chat opens with the outfit as context.
10. Remove the saved outfit and confirm it disappears from Saved Outfits without removing Calendar entries.
