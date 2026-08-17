# Public Beta Debug UI Audit

Date: 2026-05-27

## Strings Searched

- `Debug`
- `debug`
- `trace`
- `Copy debug`
- `diagnostics`
- `diagnostic`
- `dev`
- `__DEV__`
- `pipeline`
- `PhotoPipeline`
- `ImageResolver`
- `Config diagnostics`
- `Firebase env validation`
- `Build diagnostics`
- `test error`
- `Sentry test`
- `console.log shown in UI`
- `raw error.message displayed to user`
- `Debug trace`
- `Copy debug summary`
- `raw error`
- `error dump`

## Files Changed

- `app/_layout.tsx`
- `app/(tabs)/ai.tsx`
- `app/(tabs)/calendar.tsx`
- `app/(tabs)/closet.tsx`
- `app/(tabs)/index.tsx`
- `app/(tabs)/item/[id].tsx`
- `app/(tabs)/laundry.tsx`
- `app/(tabs)/studio.tsx`
- `app/aura/swipe.tsx`
- `app/insights.tsx`
- `app/profile/my-looks.tsx`
- `src/addItem/components/AddItemPhotoPanel.tsx`
- `src/addItem/components/OutfitExtractionEntry.tsx`
- `src/addItem/hooks/useItemDraft.ts`
- `src/addItem/hooks/useItemExtraction.ts`
- `src/addItem/hooks/usePhotoStep.ts`
- `src/addItem/useAddItemController.ts`
- `src/components/PhotoEditorSection.tsx`
- `src/components/profile/LookDetailModal.tsx`
- `src/lib/auraActions.ts`
- `src/lib/auraAttachments.ts`
- `src/lib/firebaseConfig.ts`
- `src/lib/imageFraming.ts`
- `src/lib/items.ts`
- `src/lib/outfitExtraction.ts`
- `src/lib/photoPipelineLogger.ts`
- `src/lib/productLinkClosetImport.ts`
- `src/profile/screens.tsx`
- `functions/src/extractOutfitItems.ts`
- `functions/src/polishProductImage.ts`

## Visible Debug UI Removed

- Removed the Add Item visible `Debug trace` row.
- Removed the Add Item `Copy debug summary` button.
- Removed visible Firebase/build diagnostics from the app configuration error screen.
- Removed visible trace IDs from user-facing photo flow UI.
- Removed debug mask preview UI from public builds.
- Removed visible raw technical fallback copy such as local polished file availability.
- Removed developer-facing outfit extraction labels such as raw crop fallback and low confidence.
- Removed Product Polish internal wording from user-facing client and function messages.
- Replaced raw exception text in common user actions with stable friendly copy.

## Gated Behind `__DEV__`

- Photo preview mask debug UI requires `__DEV__` and an explicit photo preview debug flag.
- PhotoPipeline console output requires `__DEV__` and an explicit photo/image debug flag.
- Outfit extraction client logs require `__DEV__` and `EXPO_PUBLIC_AURA_DEBUG_OUTFIT_EXTRACTION=true`.
- Image framing logs require `__DEV__` and an explicit image framing debug flag.
- Firebase configuration diagnostics still exist for local developer inspection, but public builds log only concise counts.
- Existing AURA, closet, image, cache, and swipe debug logs remain gated by `__DEV__` plus the relevant debug flag.

## Known Remaining Non-User-Visible Logs

- Photo pipeline trace IDs remain available in internal item/photo records and gated developer logs.
- ImageResolver logs remain internal and gated by the image debug flag.
- Sentry remains enabled through `src/lib/sentry.ts`; scrubbers continue redacting identifiers, URLs, secrets, and likely user content.
- Production warnings/errors are kept concise and privacy-safe where they are needed for failure visibility.

## Manual QA Checklist

- [ ] Add item from photo.
- [ ] Photo cleanup fails.
- [ ] Retry cutout.
- [ ] Product link import fails.
- [ ] AURA chat error.
- [ ] App config error screen.
- [ ] Sentry enabled but no debug UI.
- [ ] No visible trace IDs.
- [ ] No Copy debug summary button.
- [ ] No raw error dumps.
