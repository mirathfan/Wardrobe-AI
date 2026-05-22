# AURA Security And Secrets Audit

Audit date: 2026-05-11

Standards used: Firebase production rules, least privilege, API key restrictions, App Check, backend key protection, safe URL fetching, abuse controls, and deletion completeness.

## Summary

No committed OpenAI key, Firebase private key, service account JSON, hardcoded bearer token, or private key was found in tracked files. Firebase client API keys exist in ignored local config/env files; Firebase says these keys are not secrets for Firebase services, but they should still be restricted in Google Cloud.

## Findings

| Severity | Finding | File/path | Why it matters | Exact fix |
|---|---|---|---|---|
| Blocker | Firebase iOS native config is for old bundle `com.athfan.AURA`, not `com.kasat.aura` | `GoogleService-Info.plist`; `ios/AURA/GoogleService-Info.plist` | Firebase Auth/Google Sign-In/native services may fail or attach to the wrong registered app | In Firebase Console, add/download iOS app config for `com.kasat.aura`; replace both plist files; update iOS OAuth client env |
| Blocker | Firebase Android config is for old package `com.athfan.aura`; it also references `com.athfan.wardrobeai` OAuth | `google-services.json`; `android/app/google-services.json` | Android Firebase/Google Sign-In would be wrong if Android is built | Download `google-services.json` for `com.kasat.aura`; replace both files |
| Blocker | Firebase config files are ignored/untracked while app config references them | `.gitignore`, `app.json`, Firebase config files | EAS cloud builds may not receive required native Firebase config files | After regenerating correct configs, commit them intentionally or provide them through EAS secret file handling |
| High | App Check is not configured or enforced | No `initializeAppCheck`, no `enforceAppCheck`, no `consumeAppCheckToken` | Authenticated abuse from modified clients remains possible, especially expensive AI endpoints | Add Firebase App Check for iOS App Attest/DeviceCheck; enforce for callable functions and Firebase services after testing |
| High | Expensive `askAuraStream` is an HTTP `onRequest` endpoint with manual ID token verification but no App Check | `functions/src/askAuraStream.ts` | App Check callable protection does not automatically cover raw HTTP functions | Either convert to callable/streaming callable when viable, or manually verify App Check token for the HTTP endpoint |
| Medium | Local `.env` and Firebase config files exist but are ignored | `.env`, `.env.local`, `GoogleService-Info.plist`, `google-services.json` | Local secrets/config can leak outside git; Firebase API keys need restrictions | Keep ignored; rotate/restrict keys if shared; never commit service account JSON or OpenAI/SERPAPI keys |
| Medium | Backend logs still include redacted product URL paths and product metadata summaries | `functions/src/shared/productLinkExtractor.ts`, `auraUrlCandidatePreview.ts`, `productUrlMetadata.ts` | Redacted paths can still reveal product IDs or shopping behavior | For external launch, reduce to domain/count/status only and set short log retention |
| Medium | Function logs previously included wardrobe gap arrays and footwear metadata; reduced in this audit | `functions/src/askAura.ts`, `functions/src/askAuraStream.ts` | Wardrobe metadata in logs is personal styling data | Keep aggregate-only logs; verify production logs after QA |
| Medium | `outfitChatV1` stores user messages and debug constraints in Firestore | `functions/src/outfitChatV1.ts` | Expected product behavior, but debug fields can increase stored personal data | Confirm this legacy chat endpoint is used; remove debug fields or cap retention if not needed |
| Low | Legacy `parseOutfitIntent` rate-limit doc was not deleted on account deletion; fixed in this audit | `functions/src/deleteAccountData.ts`, `functions/src/index.ts` | Raw UID rate-limit metadata could remain after deletion | Patched account deletion to delete `functionRateLimits/parseOutfitIntent/users/{uid}` |
| Low | `functions/node_modules` has extraneous package and dry-run showed duplicate libvips Objective-C class warning | `functions/node_modules`, deploy dry-run output | Could cause local tooling/runtime instability | Run clean install in functions: `rm -rf functions/node_modules functions/package-lock.json` only if intentionally refreshing lock, then `npm install`; do not do this casually during release |

## Rules Audit

### Firestore

- PASS: Default wildcard deny rules exist.
- PASS: `users/{uid}` reads/writes are owner-scoped.
- PASS: `items`, `outfits`, `threads/messages`, `aiChats/messages`, `styleEvents`, `savedLooks`, `auraLooks`, `savedOutfits`, `outfitFeedback`, and `commerceEvents` are scoped to `request.auth.uid == uid`.
- PASS: No public wildcard write rule found.
- RISK: `assistantProfile`, `profile`, `ai`, `auraLooks`, `savedOutfits`, and `outfitFeedback` allow owner writes with limited or generic validation. Acceptable for TestFlight, but harden schemas before public launch.
- NOTE: `allow delete: if false` on root `users/{uid}` is fine because account deletion uses Admin SDK.

### Storage

- PASS: `users/{uid}/{allPaths=**}` is owner-scoped.
- PASS: Image uploads are limited to `image/*` and 10 MB.
- PASS: Temporary transcription audio is owner-scoped and limited to 10 MB audio/video/mp4.
- PASS: Final wildcard denies all other paths.

## Endpoint/Auth Audit

| Endpoint | Type | Auth | Rate limit | Notes |
|---|---|---|---|---|
| `askAura` | Callable | Required | `auraChat`: 10/min, 80/day | OpenAI key server-side |
| `askAuraStream` | HTTP onRequest | Bearer Firebase ID token | `auraChat`: 10/min, 80/day | Needs App Check/manual App Check |
| `generateAuraSwipeBatch` | Callable | Required | `outfitGeneration`: 10/min, 100/day | Uses OpenAI |
| `generateOutfitsV1` | Callable | Required | `outfitGeneration`: 10/min, 100/day | Uses OpenAI |
| `outfitChatV1` | Callable | Required | `auraChat` or endpoint-specific logic in file | Legacy storage/debug should be reviewed |
| `previewProductLink` | Callable | Required | `productLink`: 5/min, 30/day | Uses safe URL fetch/extraction |
| `importProductLink` | Callable | Required | `productLink`: 5/min, 30/day | Creates item draft |
| `ingestItemFromPhotos` | Firestore trigger | Admin trigger | `imageIngestion`: 3/min, 25/day | Triggered from item writes |
| `transcribeAuraAudio` | Callable | Required | `voiceTranscription`: 6/min, 60/day | No current client call found |
| `searchLiveProducts` | Callable | Required | Env daily limit, default 20/day | Gated by `PRODUCT_SEARCH_ENABLED=true` |
| `wrapAffiliateLinks` | Callable | Not expensive | No user rate limit found | Add simple auth/rate limit if abused |
| `parseOutfitIntent` | HTTP onRequest | Bearer Firebase ID token | 20/min | Legacy endpoint; consider removal or App Check |

## SSRF/Product URL Import

- PASS: `safeFetch` rejects non-http(s), localhost, private/internal IPs, oversized responses, bad content types, and too many redirects.
- PASS: Product image URLs are also validated.
- RISK: DNS can change between validation and fetch in any SSRF design. For public launch, consider resolving and fetching by validated IP with Host header or using a hardened fetch proxy.

## Secrets Search Terms Covered

Searched for `OPENAI_API_KEY`, `FIREBASE_PRIVATE_KEY`, `SERPAPI`, API keys, bearer tokens, service account JSON, private keys, debug bypasses, unsafe eval/dynamic code, local URLs, and SSRF-sensitive fetches.
