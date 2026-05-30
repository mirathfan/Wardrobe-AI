# Public Beta Launch Readiness Report

Date: 2026-05-25

App: AURA: AI Personal Stylist

## 1. What Was Added

- Installed `@sentry/react-native` for Expo React Native.
- Added DSN-gated Sentry initialization with `EXPO_PUBLIC_SENTRY_DSN`.
- Added privacy scrubbers for Sentry events and breadcrumbs.
- Added safe Sentry tags: `app_version`, `build_number`, `platform`, `environment`.
- Added anonymous hashed Sentry user ID support.
- Added root, AURA chat, and Add Item error boundaries/fallbacks.
- Added Sentry Metro config.
- Added `EXPO_PUBLIC_SENTRY_DSN` to `.env.example`.
- Reduced backend logging exposure for AURA chat, image ingestion, product link import/preview, product image ranking, and URL fetch diagnostics.
- Created the public beta launch document set.

## 2. Files Changed

Code/config touched for this beta readiness pass:

- `.env.example`
- `app.json`
- `metro.config.js`
- `package.json`
- `package-lock.json`
- `app/_layout.tsx`
- `app/(tabs)/add.tsx`
- `src/components/ai/ChatList.tsx`
- `src/lib/sentry.ts`
- `functions/src/askAura.ts`
- `functions/src/askAuraStream.ts`
- `functions/src/ingestItemFromPhotos.ts`
- `functions/src/shared/auraCandidatePreview.ts`
- `functions/src/shared/productLinkExtractor.ts`
- `functions/src/shared/productUrlMetadata.ts`
- `functions/src/shared/safeFetch.ts`

Documents created or finalized:

- `PRIVACY_POLICY.md`
- `TERMS_OF_USE.md`
- `APP_STORE_PRIVACY_ANSWERS.md`
- `TESTFLIGHT_BETA_REVIEW_NOTES.md`
- `PUBLIC_BETA_QA_CHECKLIST.md`
- `PUBLIC_BETA_GO_NO_GO.md`
- `SUPPORT_AND_FEEDBACK.md`
- `APP_STORE_CONNECT_BETA_METADATA.md`
- `ACCOUNT_DELETION_TEST_PLAN.md`
- `SECURITY_SECRETS_AUDIT.md`
- `COST_AND_ABUSE_READINESS.md`
- `PUBLIC_BETA_LAUNCH_READINESS_REPORT.md`

Note: the worktree had many unrelated QA changes before this pass. The list above is the beta readiness scope.

## 3. Sentry Setup Status

Status: code/config added, owner setup still required.

- SDK: installed.
- App init: added in `app/_layout.tsx`.
- Config var: `EXPO_PUBLIC_SENTRY_DSN`.
- Missing DSN behavior: Sentry disabled without crashing.
- App config plugin: added by Expo install.
- Metro config: added with Sentry Expo config.
- Source maps: owner should add Sentry org/project/auth token env vars if source map upload is desired.

`expo-doctor` note: native `ios/` and `android/` folders exist, so Expo warns that app config plugin changes may not sync automatically into native projects. Runtime Sentry works through JS/native package autolinking, but source-map/native build script sync should be verified with the next EAS build or by running an intentional native sync workflow.

## 4. Privacy Safeguards

Sentry safeguards:

- `sendDefaultPii: false`.
- `tracesSampleRate: 0`.
- failed request capture disabled.
- Emails redacted.
- UID-like fields redacted.
- Authorization headers, cookies, tokens, API keys, and secrets redacted.
- `productUrl`, `sourceUrl`, `imageUrl`, `photoUrl`, `downloadUrl`, URL, URI, href, and link fields redacted.
- Prompt/chat/text/message-like user content redacted when it resembles user content.
- Breadcrumbs scrubbed before sending.
- Event tags restricted to safe tags.
- Sentry user set only to `anon_<sha256(uid)>` prefix.

Backend logging safeguards:

- URL log redaction now removes path and query.
- No raw OpenAI image extraction payload logs.
- No raw assistant title/reply text in multi-look fallback logs.
- No full outfit piece arrays in footwear mismatch logs.
- Debug product image ranking logs redact source/image URLs.
- Image ingestion failure logs use safe user-facing messages.

## 5. Documents Created

The required public beta document set is present in repo root:

- Privacy policy draft.
- Terms draft.
- App Store privacy answers draft.
- TestFlight beta review notes.
- Public beta QA checklist.
- Public beta go/no-go checklist.
- Support and feedback instructions.
- App Store Connect beta metadata draft.
- Account deletion test plan.
- Security/secrets audit.
- Cost/abuse readiness plan.

## 6. Remaining Owner Placeholders

Owner must fill:

- Effective dates.
- Contact/support/privacy email.
- Privacy Policy URL.
- Terms URL.
- Support URL.
- Demo account email/password or reviewer account instructions.
- Exact account deletion path copy.
- Sentry organization/project/auth token if uploading source maps.
- Sentry alert recipient email.
- OpenAI budget threshold.
- Firebase/GCP budget threshold and recipients.
- SerpApi monthly cap if enabled.
- Affiliate provider status and disclosure if enabled.
- App age rating and final legal review.

## 7. App Store Connect Items Still Needed

- Host final Privacy Policy, Terms, and Support pages.
- Complete App Privacy answers with owner/legal confirmation.
- Confirm Tracking answer, especially if affiliate links are enabled.
- Confirm Calendar, Location, Audio Data, Product Interaction, Diagnostics, and Identifiers answers.
- Add Beta App Description, What To Test, Reviewer Notes, and Demo Account details.
- Confirm export compliance answer.
- Upload a new TestFlight build after Sentry dependency/config changes.

## 8. Exact EAS Env Commands

Required:

```bash
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN --value "..." --visibility plaintext
```

Optional but recommended for Sentry source maps:

```bash
eas env:create --environment production --name SENTRY_ORG --value "..." --visibility plaintext
eas env:create --environment production --name SENTRY_PROJECT --value "..." --visibility plaintext
eas env:create --environment production --name SENTRY_AUTH_TOKEN --value "..." --visibility secret
```

## 9. Exact Build Commands

Install/update dependencies:

```bash
npm install
```

Validate:

```bash
npx tsc --noEmit
npm run lint
npx expo-doctor
git diff --check
cd functions && npm run lint && npm run build
```

Build iOS TestFlight candidate:

```bash
eas build --platform ios --profile preview
```

Submit if using EAS Submit:

```bash
eas submit --platform ios --latest
```

## 10. TestFlight Build Requirement

New TestFlight build required: **Yes**.

Reason: `@sentry/react-native`, app config plugin, Metro config, and error-boundary code were added. Keep `ios.buildNumber` unchanged in `app.json` until the owner decides whether the next uploaded build should be Build 5 or Build 6. Because the `production` profile has `autoIncrement: true`, confirm the target build number before upload.

## 11. Validation Results

- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- `cd functions && npm run lint`: passed.
- `cd functions && npm run build`: passed.
- `npx expo-doctor`: 17/18 passed; failed on existing native folder/app config sync warning for non-CNG projects.

Additional note: `npx expo install @sentry/react-native` completed, and npm reported 25 audit findings. I did not run `npm audit fix` because it may introduce unrelated dependency churn before beta.

## 12. Recommended Commit Message

```text
Add public beta monitoring and launch documentation
```
