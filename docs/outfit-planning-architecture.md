# Outfit Planning Architecture

This note documents the current planner boundaries. It exists because AURA has
multiple outfit-generation paths that should not be consolidated casually.

## Active systems

- `src/utils/dailyOutfits.ts` is the canonical daily outfit persistence layer.
  `PlannedOutfit` from this file is the saved daily plan shape used by Calendar,
  Today, Home, AURA "Plan Today", Studio, and saved-look planning.
- `src/utils/outfitPlanning.ts` is the active Calendar suggestion engine. It
  creates `PlannedLook` options for a selected date, then Calendar adapts the
  selected look into `dailyOutfits.PlannedOutfit` before saving.
- `src/lib/auraActions.ts` handles shared AURA look actions. For
  `planForToday`, it converts an AURA look with `auraLookToPlannedOutfit` and
  saves through `savePlannedRecord`.
- `functions/src/shared/outfitEngine.ts` is the server outfit engine used by
  `generateAuraSwipeBatch`, `generateOutfitsV1`, and `outfitChatV1`.
- `functions/src/askAura.ts` and `functions/src/askAuraStream.ts` do not call
  the server outfit engine. They build AURA context from wardrobe/profile/memory
  and ask the model to return `look` or `lookOptions`.
- `src/lib/outfitGenerator.ts` is still active as the client fallback for AURA
  Swipe through `src/lib/auraSwipe.ts`.

## Legacy candidates

- `src/utils/outfitPlanner.ts` and `src/hooks/usePlannedOutfit.ts` are legacy
  planner paths. The current Calendar/Today flows do not use them.
- `src/lib/outfits.ts` is a disabled legacy writer and should stay disabled.
- Calendar component files under `src/components/calendar/` include several
  compatibility re-exports. Do not delete them without an import sweep.
- `functions/src/outfitChatV1.ts` is exported and functional, but current app
  callers were not found in the client usage sweep. Treat it as compatibility
  until production callable usage is confirmed.

## Flow map

### Calendar saves a plan

1. `app/(tabs)/calendar.tsx` listens to wardrobe items and date-key outfit docs.
2. Calendar calls `generateDailyPlan` from `src/utils/outfitPlanning.ts`.
3. Calendar converts the selected `PlannedLook` into
   `dailyOutfits.PlannedOutfit`.
4. Calendar saves with `setPlanned`, which delegates to `savePlannedRecord` and
   `savePlannedOutfit`.

### Today tab reads a plan

1. `app/(tabs)/today.tsx` subscribes with `subscribeOutfitByDate`.
2. It renders `record.plannedOutfit` if one exists.
3. It does not generate or save outfits.

### AURA Plan Today

1. AURA look UI emits `planForToday`.
2. `handleSharedAuraLookAction` in `src/lib/auraActions.ts` handles the action.
3. `auraLookToPlannedOutfit` converts closet pieces into the daily plan shape.
4. `savePlannedRecord(uid, new Date(), plannedOutfit)` writes the date-key doc.

### AURA generates a recommendation

1. Client calls `askAuraStream` first, with callable `askAura` as fallback.
2. Functions load wardrobe items, profile, memory, weather, and occasion.
3. `buildAuraContext` prepares compact context for the prompt.
4. The model returns structured `look` or `lookOptions`.
5. Nothing is saved to the daily planner until the user taps Plan Today.

## Shared collection warning

`users/{uid}/outfits` currently stores two different kinds of documents:

- Date-key daily docs such as `2026-05-02`, with `dateKey`, `plannedOutfit`,
  and/or `wornOutfit`.
- Generated candidate docs from server outfit functions, with generated IDs and
  fields like `picks`, `itemIds`, `planned`, `score`, `reason`, and `version`.

Calendar and Today should only treat documents with `plannedOutfit` or
`wornOutfit` as daily records. Do not replace daily plan payloads with
server-candidate `picks`-only payloads without a schema migration.

## Adapter checks to add when tests exist

- `lookToItems` maps a `PlannedLook` slot id object to the expected item slots.
- Calendar's local `lookToPlanned` adapter produces `dailyOutfits.PlannedOutfit`
  with `itemsByCategory`, `score`, `reasons`, and `createdAt`.
- `auraLookToPlannedOutfit` keeps only closet-sourced AURA pieces and maps them
  to `outerwear`, `top`, `bottom`, and `shoes`.
- `savePlannedRecord` writes date-key daily docs containing `dateKey` and
  `plannedOutfit`, not server candidate docs containing only `picks`.
