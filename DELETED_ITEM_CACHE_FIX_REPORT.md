# Deleted Item Cache Fix Report

## Root Cause

Outfit cards could render stale closet pieces from cached AURA look payloads because card pieces carried their own `itemId`, `itemName`, and `imageUrl`. If `users/{uid}/items/{itemId}` was deleted, Home and AURA could still hydrate a cached Home snapshot, saved look, chat card, or planned outfit preview and render the cached image without first checking the live closet item set.

## Fix Summary

- Added live closet validation helpers:
  - `filterOutfitItemsToLiveCloset(outfit, liveItemIds)`
  - `hasDeletedClosetReferences(outfit, liveItemIds)`
  - `getMissingClosetItemIds(outfit, liveItemIds)`
- Shared AURA outfit cards now filter closet-sourced pieces whose `itemId` is not in the live closet set before building the flat-lay render plan.
- The AURA item detail sheet now shows clean removed-item copy instead of opening details for a stale closet item.
- Home no longer hydrates saved look or today outfit previews directly from the cached Home snapshot.
- Deleting an item clears the cached Home snapshot and removes the item from cached closet items.
- Home hides stale recommendation looks that reference deleted item IDs.
- Calendar and My Looks keep planned/saved looks but mark removed references instead of treating them as available closet pieces.
- Outfit wear/plan writes reconcile against Firestore before saving daily outfit item IDs.

## Manual QA Checklist

1. Add 3 closet items.
2. Generate outfit using them.
3. Delete one item.
4. Return Home.
5. Confirm deleted item disappears from closet.
6. Confirm Home card no longer shows deleted item.
7. Confirm tapping old deleted item does not open detail.
8. Confirm “Complete from your closet” is false/hidden if missing.
9. Force close/reopen app.
10. Confirm deleted item does not reappear from cache.
11. Delete item used in saved look.
12. Saved look marks item as removed or hides stale piece.
13. Delete item used in planned today outfit.
14. Calendar handles missing item cleanly.

## Notes

- Saved looks and planned outfits are preserved.
- Home recommendation cards with deleted closet references are hidden from Home instead of rendered as complete.
- No fake replacement items are added.
