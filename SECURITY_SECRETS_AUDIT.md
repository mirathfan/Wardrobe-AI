# AURA Security And Secrets Audit

Audit date: 2026-05-25

Scope: Expo app, Firebase Functions, local config references, Sentry setup, backend logging, product URL fetch safety, rate-limit storage, and public beta readiness. This is an engineering audit, not legal advice.

## Summary

No committed OpenAI API key, Firebase private key, service account JSON, Sentry DSN, Sentry auth token, SerpApi key, Skimlinks ID, bearer token, or private key was added in this pass.

Sentry was added with `EXPO_PUBLIC_SENTRY_DSN` only. The app silently disables Sentry when the DSN is missing. The SDK is configured with `sendDefaultPii: false`, safe tags, anonymous hashed user IDs only, and a `beforeSend` scrubber for emails, raw IDs, auth headers, cookies, tokens, prompt/chat text, product URLs, image URLs, photo URLs, and download URLs.

Backend logging was reduced for the public beta path. Logs now prefer hashed user IDs, event names, durations/status where present, domains or URL hosts, safe counts, booleans, category/type labels, and redacted error codes/messages. Product URL redaction now removes path and query details.

## Required Public Beta Secrets And Env Vars

| Name | Where | Visibility | Commit? | Notes |
|---|---|---|---|---|
| `EXPO_PUBLIC_SENTRY_DSN` | EAS env and local `.env` when testing Sentry | Plaintext | No | Public DSN. Missing value disables Sentry. |
| `SENTRY_AUTH_TOKEN` | EAS env if uploading source maps | Secret | No | Optional but recommended for source maps. |
| `SENTRY_ORG` | EAS env if uploading source maps | Plaintext | No | Optional Sentry project setup. |
| `SENTRY_PROJECT` | EAS env if uploading source maps | Plaintext | No | Optional Sentry project setup. |
| `OPENAI_API_KEY` | Firebase Functions secret | Secret | No | Server-side only. |
| `SERPAPI_API_KEY` | Firebase Functions secret/env if product search enabled | Secret | No | Keep product search disabled until capped. |
| `SKIMLINKS_ID` | Firebase Functions env if affiliate links enabled | Plaintext/secret per owner policy | No | Requires affiliate disclosure and tracking confirmation. |

Exact DSN command:

```bash
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value "..." --visibility plaintext
```

Optional source map upload env commands:

```bash
eas env:create --environment production --name SENTRY_ORG --value "..." --visibility plaintext
eas env:create --environment production --name SENTRY_PROJECT --value "..." --visibility plaintext
eas env:create --environment production --name SENTRY_AUTH_TOKEN --value "..." --visibility secret
```

## Current Findings

| Severity | Finding | File/path | Why it matters | Required action |
|---|---|---|---|---|
| Blocker | Confirm Firebase native config matches bundle/package IDs before public beta | `GoogleService-Info.plist`, `google-services.json`, `app.json` | Wrong Firebase app config can break auth or attach beta traffic to the wrong app | Owner must verify Firebase Console apps for `com.kasat.aura` before release |
| High | App Check is not configured or enforced | No `initializeAppCheck`; callable functions do not enforce App Check | Authenticated abuse can come from modified clients | Add App Check for iOS and enforce after QA |
| High | `askAuraStream` is an HTTP endpoint with bearer auth but no App Check | `functions/src/askAuraStream.ts` | Expensive endpoint is harder to protect than callable functions | Add manual App Check verification or migrate streaming strategy |
| Medium | Sentry source map upload still needs project env setup | `app.json`, `metro.config.js` | Events work with DSN, but stack traces are better with source maps | Add `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` in EAS |
| Medium | Existing local Firebase launch analytics stores error messages/stacks in Firestore | `src/lib/analytics.ts` | This is not Sentry, but still user-scoped diagnostics | Decide whether to keep, reduce, or disable for public beta |
| Medium | Product import stores product URLs and metadata in user item docs | Product link functions and item docs | Expected feature behavior, but must be disclosed | Privacy Policy and App Store answers must disclose product links/metadata |
| Low | Product search cache is top-level and not account-deleted | `productSearchCache` | Non-user-specific cache may retain product results | Keep TTL short and document retention |

## Backend Logging Audit

Reviewed endpoints:

- `askAura`
- `askAuraStream`
- `ingestItemFromPhotos`
- `previewProductLink`
- `importProductLink`
- `transcribeAuraAudio`
- `deleteAccountData`
- `searchLiveProducts`

Beta-safe logging standard:

- Keep trace IDs, event names, endpoint names, hashed UID values, durations, success/failure, status/category labels, safe counts, and booleans.
- Do not log raw prompts, chat messages, emails, full user IDs, full product URLs, full image URLs, Firebase tokens, auth headers/cookies, or OpenAI response payloads.
- Product URL logging should keep at most scheme/host and redact path/query.
- Image URL logging should keep at most scheme/host and redact path/query.

Changes made in this pass:

- `redactUrlForLogs` now removes path and query details.
- Image ingestion no longer logs raw OpenAI response payload language.
- Image ingestion errors log safe user-facing failure text instead of raw failure strings.
- AURA chat multi-look diagnostics no longer log assistant title/reply text.
- AURA footwear mismatch diagnostics no longer log full piece arrays or item metadata.
- AURA sparse wardrobe debug logs use counts instead of raw suggestion arrays.
- Product URL metadata logs no longer include product paths.
- Product link debug/fallback logs no longer include H&M fallback paths.
- Product image ranking debug logs redact source and image URLs before logging.

## Endpoint/Auth Audit

| Endpoint | Type | Auth | Current limit | Public beta note |
|---|---|---|---|---|
| `askAura` | Callable | Firebase Auth | `auraChat`: 10/min, 80/day | Lower daily cap before broad beta if cost risk is high |
| `askAuraStream` | HTTP `onRequest` | Bearer Firebase ID token | `auraChat`: 10/min, 80/day | Add App Check/manual verification |
| `ingestItemFromPhotos` | Firestore trigger | Admin-triggered user item write | `imageIngestion`: 3/min, 25/day | Keep Storage rules and image caps |
| `previewProductLink` | Callable | Firebase Auth | `productLink`: 5/min, 30/day | Safe fetch and redacted logs in place |
| `importProductLink` | Callable | Firebase Auth | `productLink`: 5/min, 30/day | Safe fetch and redacted logs in place |
| `transcribeAuraAudio` | Callable | Firebase Auth | `voiceTranscription`: 6/min, 60/day | Enable only if voice beta is intended |
| `searchLiveProducts` | Callable | Firebase Auth | Env daily limit, default 20/day | Keep disabled unless SerpApi cap is set |
| `deleteAccountData` | Callable | Firebase Auth | 3/day | Verify with manual deletion test plan |

## Sentry Privacy Checklist

- [x] SDK installed with Expo-compatible package.
- [x] `EXPO_PUBLIC_SENTRY_DSN` used.
- [x] Missing DSN disables Sentry without crashing.
- [x] `sendDefaultPii: false`.
- [x] `beforeSend` scrubber added.
- [x] Breadcrumb scrubber added.
- [x] Safe tags only: `app_version`, `build_number`, `platform`, `environment`.
- [x] Anonymous hashed user ID only.
- [x] Root error boundary added.
- [x] AURA chat fallback reports safe exception context.
- [x] Add Item fallback reports safe exception context.
- [ ] Owner creates Sentry project.
- [ ] Owner adds DSN to EAS env.
- [ ] Owner verifies one test event in Sentry.
- [ ] Owner configures alert email.

## Human Review Required

- Final legal/privacy review of policy, terms, and App Store privacy answers.
- Confirm Firebase native config files and Google OAuth clients are correct for public beta bundle IDs.
- Confirm App Check rollout plan.
- Confirm Sentry organization/project/auth token setup if source maps are uploaded.
- Confirm whether affiliate links or shopping providers qualify as tracking under Apple rules.
