# AURA App Audit Fix Plan

This plan prioritizes narrow, production-readiness fixes before larger product work.

## Suggested Order

1. Restore clean verification.
2. Remove misleading placeholder routes/actions.
3. Standardize core navigation and empty/error states.
4. Wire the highest-value AURA actions.
5. Improve ingestion recovery and closet data quality.
6. Upgrade premium UI consistency.
7. Add performance and edge-case testing.

## Implementation Plan

| Priority | Fix | Likely files | Difficulty | Risk |
|---|---|---|---|---|
| 1 | Fix TypeScript route failure for Laundry. Replace `router.push("/(tabs)/laundry")` with the valid route or adjust route registration. | `app/(tabs)/index.tsx`, `app/(tabs)/_layout.tsx`, `app/laundry.tsx` | S | Low |
| 1 | Route Home Studio to real tab Studio or delete/rename placeholder `app/studio.tsx`. | `app/(tabs)/index.tsx`, `app/studio.tsx`, `app/(tabs)/studio.tsx` | S | Medium |
| 1 | Hide or clearly mark UI-only tools from Home. | `app/(tabs)/index.tsx`, `app/packing.tsx`, `app/insights/*`, `src/components/home/SmartToolsGrid.tsx` | S | Low |
| 1 | Remove disabled Closet bulk actions from “More” until wired. | `app/(tabs)/closet.tsx` | S | Low |
| 1 | Add real AURA chat empty state. | `app/(tabs)/ai.tsx`, `src/components/ai/ChatList.tsx`, new `src/components/ai/AuraEmptyState.tsx` | S | Low |
| 1 | Fix Item Detail dark input styles and old constants. | `app/(tabs)/item/[id].tsx` | S | Low |
| 1 | Guard or remove dev logging. | `app/(tabs)/ai.tsx`, `app/(tabs)/closet.tsx`, `app/(tabs)/item/[id].tsx`, `src/addItem/*`, `src/lib/*`, `src/utils/dailyOutfits.ts` | M | Low |
| 2 | Add branded confirmation/error sheets for common flows. | new `src/components/aura/AuraConfirmSheet.tsx`, `src/lib/toast.ts`, screens using `Alert.alert` | M | Medium |
| 2 | Wire Product Link quick add to a direct import/review path. | `app/(tabs)/closet.tsx`, `src/lib/auraAttachments.ts`, `src/lib/aura.ts`, `functions/src/importProductLink.ts`, `app/(tabs)/add.tsx` | M | Medium |
| 2 | Add failed-ingestion recovery actions in Item Detail. | `app/(tabs)/item/[id].tsx`, `src/lib/items.ts`, `src/addItem/hooks/useItemExtraction.ts` | M | Medium |
| 2 | Apply closet preferences to default filters/sort. | `app/(tabs)/closet.tsx`, `src/lib/userProfile.ts`, `src/types/UserProfilePreferences.ts` | S | Low |
| 2 | Wire AURA laundry actions with confirmation. | `app/(tabs)/ai.tsx`, `src/lib/items.ts`, `functions/src/shared/auraPrompt.ts`, `src/types/aura.ts` | M | Medium |
| 2 | Wire AURA arbitrary-date planner actions. | `app/(tabs)/ai.tsx`, `app/(tabs)/calendar.tsx`, `src/utils/dailyOutfits.ts`, `src/types/aura.ts` | M | Medium |
| 2 | Replace placeholder Insights with live unworn/gap data. | `app/insights/unworn.tsx`, `app/insights/gaps.tsx`, `functions/src/shared/detectWardrobeGaps.ts`, `src/lib/items.ts` | M | Medium |
| 3 | Virtualize large Closet and Studio grids. | `app/(tabs)/closet.tsx`, `src/components/closet/ClosetCategorySection.tsx`, `app/(tabs)/studio.tsx` | M/L | Medium |
| 3 | Consolidate route/header patterns. | `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, tool screens, profile screens | M | Medium |
| 3 | Consolidate profile/style/memory save paths. | `src/profile/screens.tsx`, `src/lib/userProfile.ts`, `src/lib/auraMemory.ts`, `src/lib/assistantMemory.ts`, `functions/src/shared/loadAuraUserProfile.ts` | L | High |
| 3 | Add duplicate detection and merge flow. | `src/addItem/*`, `functions/src/ingestItemFromPhotos.ts`, `src/lib/items.ts` | L | Medium |
| 4 | Full privacy deletion. | `src/profile/screens.tsx`, new callable Function, Firestore/Storage cleanup rules | L | High |

## Specific Fix Notes

### 1. Clean Verification

- Fix `app/(tabs)/index.tsx` line around the Laundry CTA.
- Re-run:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `cd functions && npm run build`
- Address lint warnings in:
  - `src/addItem/hooks/useAddWizardState.ts`
  - `src/addItem/hooks/useItemExtraction.ts`
  - `src/components/AiInsightCard.tsx`
  - `src/components/PhotoEditorSection.tsx`
  - `src/components/closet/ClosetFilterSheet.tsx`

### 2. Placeholder and Route Cleanup

- Decide whether `Studio` is top-level or hidden tab route. Prefer one canonical route.
- Remove Home cards for Packing/Insights until live, or route them into AURA prompts instead of dead screens.
- For Insights:
  - `Most worn` and `Color balance` need `onPress` or removal.
  - `Wardrobe gaps` should use real closet data or AURA backend gap detection.
  - `Unworn items` should query and render real items.

### 3. AURA Action Framework

Start with client-side deterministic actions before adding a broad tool system:

- Laundry:
  - Parse assistant action payload or use explicit buttons.
  - Confirm item names.
  - Call `updateLaundryStatus`.
- Planner:
  - Let action include `dateKey`.
  - Call `savePlannedRecord`.
  - Show confirmation with “Open Calendar.”
- Closet edits:
  - Start with safe fields: favorite, status, notes, size.
  - Use confirmation sheet before destructive edits.
- Product links:
  - Use direct import/review instead of chat-only prompt.

Likely files: `app/(tabs)/ai.tsx`, `src/types/aura.ts`, `src/lib/aura.ts`, `functions/src/askAuraStream.ts`, `functions/src/shared/auraPrompt.ts`.

### 4. Premium UI System

Add shared primitives:

- `src/components/aura/AuraScreenHeader.tsx`
- `src/components/aura/AuraBottomSheet.tsx`
- `src/components/aura/AuraConfirmSheet.tsx`
- `src/components/aura/AuraEmptyState.tsx`
- `src/components/aura/AuraErrorState.tsx`

Then migrate:

- Item Detail overflow/delete/wash.
- Add Item permission/upload failures.
- AURA retry errors.
- Closet quick add/product link modal.
- Profile save/delete/logout flows.

### 5. Ingestion Recovery

Add a single recovery model:

- Processing: show progress and what AURA is doing.
- Failed: Retry AI, Edit manually, Remove draft.
- Needs review: Review now, Save as-is, Remove.

Likely files:

- `src/components/closet/ClosetProcessingSection.tsx`
- `app/(tabs)/item/[id].tsx`
- `src/addItem/hooks/useItemExtraction.ts`
- `src/addItem/hooks/useItemDraft.ts`
- `functions/src/ingestItemFromPhotos.ts`

### 6. Data Cleanup

- Align laundry thresholds between `MAX_WEARS_BEFORE_WASH` and `normalizeLaundryStatus`.
- Backfill `laundryStatus` for all items and reduce reliance on legacy `status`.
- Create one helper for item image source selection and use it everywhere.
- Document the canonical profile fields consumed by AURA.

Likely files:

- `src/lib/items.ts`
- `src/lib/itemImage.ts`
- `scripts/backfill-closet-consistency.mjs`
- `src/types/ClothingItem.ts`
- `src/types/UserProfilePreferences.ts`

## Testing Checklist

### Commands

- `cd /Users/athfan/wardrobe-ai/closet`
- `npm run lint`
- `npx tsc --noEmit`
- `cd functions && npm run build`
- `npm run ios` or `npm run start`

### Manual App Pass

- New user: register, onboarding, empty closet Home, empty AURA chat.
- Auth: login, forgot password, Google/Apple if available, sign out.
- Home: all quick actions, smart tools, latest chat, latest look, minimum closet card.
- Closet: empty, many items, filters, search, selection mode, quick add, product link, processing failed/retry.
- Add Item: camera denied, photo denied, upload failure, extraction failure, edit existing item, duplicate last item.
- Item Detail: no image, long names, color correction, pattern/material edit, mark worn, send laundry, wash, delete.
- AURA: text prompt, image attach, product link, outfit photo, streaming error, retry, chat drawer actions.
- Calendar: plan today, copy plan, swap item, mark worn, laundry exclusion, past date, future date.
- Laundry: all tabs empty/full, single status changes, bulk changes.
- Profile: every subpage save, avatar upload denied, clear memory, export, logout, delete-account warning.
- Studio: empty closet, large closet, max item limits, one-piece constraints, save, plan, ask AURA.
- Insights/Packing: verify hidden or honest if not wired.

### Device/Edge Cases

- Small phone with keyboard open.
- Large phone.
- No internet/backend error.
- Permission denied for camera/photos/location/calendar/microphone.
- Missing item images.
- Long item/brand names.
- Duplicate-looking items.
- 100+ closet items.
- Empty closet.
- All items in laundry.
- User with profile preferences changed after onboarding.
