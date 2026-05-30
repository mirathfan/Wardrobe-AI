# AURA Cost And Abuse Readiness

Audit date: 2026-05-25

## Current Controls

| Area | Current control | Status |
|---|---|---|
| AURA chat | `auraChat`: 10/min and 80/day per user | Good for small beta, costly if broad |
| Streaming AURA chat | Same `auraChat` limit | Good, but HTTP endpoint needs App Check/manual verification |
| Image ingestion | `imageIngestion`: 3/min and 25/day per user | Good for beta |
| Product link preview/import | `productLink`: 5/min and 30/day per user | Good for beta |
| Voice transcription | `voiceTranscription`: 6/min and 60/day per user | Good if feature remains limited |
| Product search | Env daily limit, default 20/day per user; provider gated | Keep disabled unless testing shopping |
| Product polish | `productPolish`: 3/min and 20/day per user | Good for beta |
| Outfit generation | `outfitGeneration`: 10/min and 100/day per user | High for public beta |
| Storage image size | Storage rules and clients cap/compress images | Good |
| Audio size | Storage rules and function cap audio at 10 MB | Good |
| Product URL fetch | Safe fetch, timeout, content-type checks, private IP checks, byte limits | Good, monitor merchant failures |
| Sentry diagnostics | DSN-gated, privacy scrubbed | Good after owner configures project and alerts |

## Recommended Public Beta Limits

These are recommended caps for the first public beta wave. Adjust after observing real usage and spend.

| Feature | Recommended public beta limit |
|---|---|
| AURA messages per user/day | 30/day initially; 50/day after spend is stable |
| Streaming chat per user/day | Same pool as AURA messages |
| Image uploads/ingestions per user/day | 10/day |
| Product imports/previews per user/day | 10/day |
| Live product searches per user/day | 5/day if enabled; otherwise disabled |
| Voice transcription per user/day | 20/day if enabled |
| Outfit generation/swipe per user/day | 30/day |
| Product polish per user/day | 10/day |

## Expensive Endpoints

1. `askAura` and `askAuraStream`: OpenAI chat/styling, wardrobe context, possible image attachments.
2. `ingestItemFromPhotos`: OpenAI vision, image processing, Storage writes.
3. `previewProductLink` and `importProductLink`: external page fetches, image ranking, OpenAI extraction, Storage/Firestore writes.
4. `transcribeAuraAudio`: OpenAI transcription if wired.
5. `searchLiveProducts`: SerpApi paid search if enabled.
6. `generateAuraSwipeBatch` and `generateOutfitsV1`: OpenAI outfit generation.

## Setup Steps

### OpenAI Spend Monitoring

1. Confirm all OpenAI usage is server-side through Firebase Functions.
2. Set project-level spend limits and alerts in the OpenAI dashboard.
3. Review daily usage by model during the beta.
4. Watch for spikes in `askAura`, `askAuraStream`, `ingestItemFromPhotos`, and product link import.

### Firebase/GCP Budget Alerts

1. In Google Cloud Billing, create a budget for the Firebase/GCP billing account.
2. Add alert thresholds at 50 percent, 75 percent, 90 percent, and 100 percent.
3. Add email recipients for the owner and engineering contact.
4. Monitor Cloud Functions invocations, Firestore reads/writes/deletes, Storage bytes, and egress.
5. Create log-based metrics for rate-limit blocks and expensive endpoint errors.

### SerpApi Cap

1. Keep `PRODUCT_SEARCH_ENABLED=false` unless shopping search is being tested.
2. If enabled, set `PRODUCT_SEARCH_DAILY_LIMIT=5` for early beta.
3. Configure provider-side monthly cap in SerpApi.
4. Confirm `SERPAPI_API_KEY` is only set in server-side environment/secrets.

### Sentry Alert Email

1. Create a Sentry React Native project for AURA.
2. Add the DSN to EAS:

```bash
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value "..." --visibility plaintext
```

3. Optional source maps:

```bash
eas env:create --environment production --name SENTRY_ORG --value "..." --visibility plaintext
eas env:create --environment production --name SENTRY_PROJECT --value "..." --visibility plaintext
eas env:create --environment production --name SENTRY_AUTH_TOKEN --value "..." --visibility secret
```

4. Configure an issue alert for new issues and regressions to [INSERT ALERT EMAIL].
5. Verify a test event and confirm no prompts, emails, product URLs, image URLs, tokens, auth headers, or cookies appear.

## Monitoring Metrics

Watch daily during beta:

- OpenAI spend by model and feature.
- Function invocations by endpoint.
- Function errors by endpoint and sanitized error code.
- Rate-limit block counts.
- `askAuraStream` non-200 responses and aborted streams.
- Image ingestion success/failure rate.
- Product link import failure rate by domain.
- SerpApi usage if enabled.
- Sentry new issues and crash-free sessions.
- Firestore reads/writes/deletes and Storage object growth.
- Account deletion success/failure counts.

## Go/No-Go Cost Gates

- [ ] OpenAI spend alert active.
- [ ] Firebase/GCP budget alert active.
- [ ] SerpApi cap active or product search disabled.
- [ ] Sentry alert email active.
- [ ] Public beta rate limits reviewed and accepted.
- [ ] App Check plan accepted for HTTP streaming gap.
