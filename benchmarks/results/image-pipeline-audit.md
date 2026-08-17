# Image Pipeline Audit

This audit records static, code-supported image pipeline facts. Native image
optimization, Firebase Storage upload duration, and background-removal duration
were not measured in Node because the relevant code depends on Expo native
modules, device image APIs, Firebase Storage, and platform-specific background
removal modules.

| Area | Measured / audited value | Evidence |
| --- | --- | --- |
| Upload local file read timeout | 15,000 ms XHR timeout | `src/lib/uploadImage.ts::blobFromFileUri` |
| Item display optimization preset | max dimension 1600 px, JPEG quality 0.88, skip re-encode under 2,400 KB | `src/lib/imageOptimization.ts` |
| Item ingestion optimization preset | max dimension 1280 px, JPEG quality 0.82, skip re-encode under 1,300 KB | `src/lib/imageOptimization.ts` |
| AURA chat image preset | max dimension 1024 px, JPEG quality 0.80, skip re-encode under 900 KB | `src/lib/imageOptimization.ts` |
| Android background removal retry cap | Up to 4 attempts | `src/bg/removeBackground.ts::removeBackgroundAndroid` |
| Android warmup backoff | 900 ms * attempt for model/download/warmup errors | `src/bg/removeBackground.ts::removeBackgroundAndroid` |
| Android generic retry delay | 350 ms between non-warmup attempts | `src/bg/removeBackground.ts::removeBackgroundAndroid` |
| iOS unsupported/failure fallback | Returns original image result with `method: "none"` | `src/bg/removeBackground.ts::removeBackground` |
| Upload variants supported | primary/display JPEG, source original JPEG, refined JPEG, AI JPEG, cleaned PNG, normalized PNG | `src/lib/uploadImage.ts::uploadItemPhoto` |
| User-facing retry entry points | background-removal retry and photo-upload retry | `src/addItem/hooks/usePhotoStep.ts::retryBackgroundRemoval`, `src/addItem/hooks/usePhotoStep.ts::retryPhotoUpload` |

Recommended next measurement: run a device/simulator benchmark with 10-20 fixed
image fixtures, instrumenting `optimizeImageForUpload`, `removeBackground`, and
`uploadItemPhoto` with existing `photoPipelineLogger` trace IDs.
