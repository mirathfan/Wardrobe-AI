# AURA Phase 9: Calendar Planner Polish

## Purpose

The Calendar now treats planned and worn AURA outfits as visible outfit events while keeping the existing Calendar model:

```text
users/{uid}/outfits/{dateKey}
```

No separate hidden event collection is used by the client.

## Calendar Model

Daily documents may contain:

- `plannedOutfit`
- `wornOutfit`

The UI adapts these into event cards with:

- status: `Planned` or `Worn`
- source: `AURA` or `Calendar`
- outfit title
- item IDs and item previews from the live closet
- weather warnings when present

## UI Behavior

On a selected Calendar date, the Outfit section displays planned and worn outfit event cards. Tapping a card opens a detail sheet with:

- outfit collage
- title, date, status, and source
- closet item list
- styling notes
- weather warnings
- actions

## Actions

- Planned outfit: `Mark as Worn`, `Remove Plan`, `Ask AURA to Remix`.
- Worn outfit: `Plan Again`, `Remove Log`, `Ask AURA to Remix`.

`Remove Plan` and `Remove Log` call the existing daily outfit clear helpers. Removing a worn log preserves the planned outfit when one exists on the same date.

`Plan Again` copies the selected outfit to the next day and attaches deterministic weather warnings when weather context is available.

## Weather Warnings

Weather warnings are warnings only. They do not block planning.

Sources:

- Existing planned outfit warnings from AURA callables.
- Client-side deterministic warnings for Calendar `Plan Again` using `buildOutfitWeatherWarnings`.

## Manual QA

1. Generate 3 outfits in AURA.
2. Save one outfit.
3. Open Saved Outfits and plan it for tomorrow.
4. Open Calendar tomorrow and confirm the planned AURA outfit card appears.
5. Tap the planned outfit and confirm detail opens with items and any weather warning.
6. Tap Mark as Worn and confirm a worn outfit card appears.
7. Tap the worn outfit and tap Plan Again.
8. Confirm the outfit is planned for the next day.
9. Tap Remove Log and confirm only the worn log is removed.
10. Tap Remove Plan and confirm the planned event is removed.
11. Tap Ask AURA to Remix and confirm AURA chat opens with the outfit item context.
