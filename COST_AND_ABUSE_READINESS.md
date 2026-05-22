# AURA Cost And Abuse Readiness

Audit date: 2026-05-11

## Current Controls

| Area | Current control | Status |
|---|---|---|
| AURA chat | 10/min and 80/day per user | Good for small TestFlight, still costly if 50 active users all hit cap |
| Streaming AURA chat | Same `auraChat` limit | Good, but HTTP endpoint lacks App Check |
| Product link import/preview | 5/min and 30/day per user | Good for TestFlight |
| Image ingestion | 3/min and 25/day per user | Good for TestFlight |
| Outfit generation | 10/min and 100/day per user | Too high for external launch; okay for tiny internal group |
| Voice transcription | 6/min and 60/day per user | Good if feature is used |
| Live product search | Env daily limit default 20/day per user; disabled unless env enables provider | Good if disabled by default |
| Image size | Storage rules cap images at 10 MB; client compresses item/chat images | Good |
| Audio size | Storage rules and function cap audio at 10 MB | Good |
| Product URL fetch | Safe fetch timeout, content-type checks, 3 MB HTML cap in safeFetch | Good |
| Product search cache | Top-level `productSearchCache` with TTL setting | Good, but monitor cache growth |
| Account deletion | 3/day per user | Good |

## Expensive Endpoints

1. `askAuraStream` and `askAura`: OpenAI GPT-5.4, wardrobe context, possible vision inputs.
2. `ingestItemFromPhotos`: OpenAI vision, Sharp/background removal, Storage writes.
3. `previewProductLink`/`importProductLink`: external fetch, OpenAI image ranking/extraction, Storage/Firestore writes.
4. `generateAuraSwipeBatch`/`generateOutfitsV1`: OpenAI plus wardrobe reads.
5. `transcribeAuraAudio`: OpenAI transcription if wired.
6. `searchLiveProducts`: SerpApi paid search if enabled.

## Risks

- App Check missing means authenticated abuse can come from modified clients.
- `askAuraStream` is HTTP, so callable App Check enforcement will not protect it automatically.
- `outfitGeneration` daily cap of 100/user is high if a tester loops swipes.
- AURA chat cap of 80/day/user can become expensive with image-rich prompts.
- Stored chat history and wardrobe context can grow; backend slices history but Firestore storage still grows.
- Storage growth risk exists for repeated AURA attachments because attachment cleanup is account-level, not per-chat.
- Product link extraction logs and cached metadata should be watched for growth and privacy.
- Firebase reads from Calendar/Home may become hot if closet size grows, but acceptable for small TestFlight.

## Recommended Small TestFlight Caps

- User cap: 10 to 25 internal testers until Firebase config, App Check, and deletion QA are confirmed.
- AURA message cap: 30/day/user for internal TestFlight; raise only after monitoring.
- Product import cap: 10/day/user.
- Image upload/ingestion cap: 10/day/user.
- Outfit generation/swipe cap: 30/day/user.
- Voice transcription cap: 20/day/user if voice is enabled.
- Live product search: keep disabled unless explicitly testing shopping; if enabled, cap at 5/day/user.

## Monitoring Metrics

Watch daily during TestFlight:

- Function invocations by endpoint.
- Function errors by endpoint and error code.
- OpenAI spend by model and feature.
- Firebase Storage bytes and object count under `users/`.
- Firestore reads/writes/deletes and top collections by volume.
- Rate-limit block counts.
- `askAuraStream` non-200 responses and aborted streams.
- Product link import failure rate by domain.
- Image ingestion failure rate.
- Account deletion success counts and any deletion errors.

## Recommended Before External TestFlight

1. Enable App Check for Firestore, Storage, and callable functions.
2. Add manual App Check verification to HTTP endpoints or convert streaming endpoint to callable-compatible approach.
3. Lower caps in `RATE_LIMITS` for external testing.
4. Add budget alerts in Google Cloud/OpenAI/SerpApi.
5. Add log-based metrics for expensive endpoint success/failure without logging prompts, URLs, or wardrobe details.
6. Add scheduled cleanup for stale AURA attachments and old failed drafts.
