# AURA Polished Cutout Fix Report

## Summary

Fixed the Add Item Studio Clean-Up handoff so the polished product image is the primary/default source when available, Vision background removal receives a verified polished local file, and saved closet items preserve original, refined, and cleaned image URLs separately.

## Root Cause

- Product Polish could return a visible `refinedImageUrl` while `refinedLocalUri` was missing or stale.
- Cutout retry/refine/save paths each had their own source selection logic, so they could silently fall back to the original upload.
- Saved items could upload the current `localUri` as primary without proving it matched the selected Studio Clean-Up source.
- ImageResolver logs were emitted on every render in dev, making Add Item pipeline logs hard to read.

## Files Changed

- `src/addItem/hooks/usePhotoStep.ts`
- `src/addItem/hooks/useItemDraft.ts`
- `src/addItem/hooks/useAddWizardState.ts`
- `src/addItem/useAddItemController.ts`
- `src/components/PhotoEditorSection.tsx`
- `src/lib/uploadImage.ts`
- `src/lib/photoPipelineLogger.ts`
- `src/lib/resolveItemImage.ts`
- `src/types/ClothingItem.ts`
- `src/types/ProductImageQuality.ts`

## Behavior

- Polished appears before Original in Studio Clean-Up.
- Polished is selected by default when a refined image exists.
- `resolveCutoutInputSource()` now centralizes source selection for cutout, refine, retry, and save.
- Polished cutout requires local download verification:
  - local file exists
  - byte size is greater than 0
  - image dimensions are readable
- If polished verification fails, AURA falls back to Original with a visible reason.
- If Vision fails on a verified polished image, the user can continue with the polished image without background removal.
- Saved metadata now includes:
  - `imageSource`: `polished_cutout`, `polished`, `original_cutout`, or `original`
  - `cutoutSourceKind`: `polished` or `original`

## Expected Logs

Normal successful polished flow should be concise:

```text
[AURA PhotoPipeline] step=photo_selected status=success
[AURA PhotoPipeline] step=local_image_normalized status=start
[AURA PhotoPipeline] step=local_image_normalized status=success
[AURA PhotoPipeline] step=refined_image_received status=success
[AURA PhotoPipeline] step=refined_local_rehydrate status=start
[AURA PhotoPipeline] step=refined_image_download status=success
[AURA PhotoPipeline] step=cutout_input_selected status=success data={"sourceKind":"polished"}
[AURA PhotoPipeline] step=vision_start status=start
[AURA PhotoPipeline] step=vision_success status=success
[AURA PhotoPipeline] step=final_image_selected status=success data={"imageSource":"polished_cutout"}
```

ImageResolver logs are now gated behind `EXPO_PUBLIC_AURA_DEBUG_IMAGES=true`, `AURA_DEBUG_IMAGES=true`, or `globalThis.AURA_DEBUG_IMAGES = true`.

## Manual QA Checklist

- Upload clothing photo.
- Product Polish completes.
- Polished preview appears first.
- Polished is selected by default.
- Retry cutout uses polished local file.
- Refine cutout uses polished local file.
- Continue saves polished cutout.
- If cutout fails, Continue saves polished image, not original bed photo.
- Original fallback still works if polished download fails.
- Closet item renders cleaned image first, then refined, then original fallback.

## Remaining Risk

- If Firebase Storage download for the refined image fails repeatedly, AURA correctly falls back to Original and shows the reason.
- If Vision fails on a polished image, the closet item will use the polished non-cutout image until the user retries successfully.
