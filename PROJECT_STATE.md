# AURA Project State

Last updated: 2026-08-15

## Product Status

AURA is a substantial working iOS application at the trusted-beta / TestFlight release stage. It is not an early prototype. The current release-stabilization goal is a clean, reproducible iOS build 8 after owner review, intentional commits, and manual beta checks.

## Major Product Capabilities

- Email/password, Sign in with Apple, and Google authentication.
- Onboarding plus style, fit, size, region, shopping, and closet personalization.
- Digital closet management, search, filters, item details, wear state, and laundry state.
- Camera and photo-library intake with iOS Vision background removal and image cleanup.
- AI garment extraction, editable item drafts, product-link import, and outfit-photo extraction.
- Streaming AURA chat with text, image, and voice inputs.
- Closet-grounded outfit cards with save, plan, wear, refine, and feedback/rating flows.
- Styling memory and wardrobe-intelligence retrieval, generation, validation, and actions.
- Today’s Look, calendar planning, optional calendar context, weather context, Studio, saved outfits, and wardrobe insights.
- Shopping recommendations and wardrobe-gap logic, with provider-dependent features gated for beta.
- In-app account deletion backed by recursive user-scoped Firestore, Storage, rate-limit, and Firebase Auth deletion.
- Sentry crash/error monitoring with privacy scrubbers and anonymous identifiers.
- Early-access roles, AI quotas, and server-side rate limits for expensive operations.

## Infrastructure

- Expo React Native, Expo Router, React Native, and TypeScript.
- Firebase Authentication, Firestore, Storage, Security Rules, and Node.js Cloud Functions.
- EAS Build/Submit with local app-version ownership and production auto-increment.
- Native iOS project with Apple Vision foreground extraction.
- OpenAI-backed styling, extraction, vision, and optional transcription paths.
- Sentry for privacy-scrubbed diagnostics.
- Next.js marketing and beta-information site prepared for Vercel, including a server-only Google Sheets waitlist integration.

## Current Release State

- Current working branch: `feature/auth-onboarding-personalization`.
- Latest committed release milestone: `f5f954a` (`Prepare AURA trusted beta build`, 2026-06-21).
- Most recent successful EAS production build: AURA `1.0.0`, iOS build `7`, built from `f5f954a`.
- Local `app.json` and native iOS `Info.plist` intentionally remain at build `7`.
- `eas.json` uses `appVersionSource: "local"` and `production.autoIncrement: true`; the next clean production build is expected to increment to build `8`.
- Whether build 7 is present or available in App Store Connect/TestFlight requires manual verification.
- Firebase Functions are deployed. This stabilization pass does not require a backend redeploy because no backend source behavior changed.

## Remaining Release Blockers

- Owner must configure the production website origin and public support email, approve the policy/terms text, and deploy the site.
- Owner must provide or approve TestFlight demo credentials, age rating, category, contacts, export-compliance response, and App Privacy answers.
- App Store Connect must be checked manually for build 7 and current TestFlight status.
- A clean physical-device/TestFlight QA pass is required, including auth, photo processing, AURA chat, product import, planning, permissions, poor-network behavior, and account deletion.
- Sentry event delivery/scrubbing and alert routing must be verified in the production build.
- OpenAI and Firebase/GCP spend alerts, and the SerpApi disabled/capped state, require owner verification.
- Google Sheets waitlist credentials and Vercel environment variables must be configured before website deployment.
