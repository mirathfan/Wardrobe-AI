# AURA TestFlight Submission Checklist

Repository audit date: 2026-08-15

## Repository And Configuration Status

| Item | Status | Evidence | Required action |
|---|---|---|---|
| App name | PASS | Expo and native display name are `AURA` | Confirm App Store listing name |
| iOS bundle ID | PASS | Expo, Xcode, and Firebase plist use `com.kasat.aura` | None |
| Version/build baseline | PASS | Version `1.0.0`; checked-in iOS build `7` | Production EAS auto-increment is expected to create build `8` |
| Icons and splash | PASS WITH MANUAL QA | Assets and native resources are present | Verify on a physical-device/TestFlight install |
| Permissions | PASS WITH MANUAL QA | Native usage descriptions cover location, calendar, reminders, camera, photos, microphone, and speech | Verify prompt behavior and denied states on device |
| Deep links | PASS | Native `aura` scheme matches Expo config | Smoke test sign-in and deep-link return |
| Google Sign-In iOS scheme | FIXED | Native scheme matches the `com.kasat.aura` Firebase reversed client ID | Verify Google sign-in on build 8 |
| Sign in with Apple | PASS WITH MANUAL QA | Native entitlement and Expo setting are present | Verify Apple sign-in on build 8 |
| Firebase iOS config | PASS | Root/native plist bundle is `com.kasat.aura` | Keep both copies synchronized |
| Firebase Android config | PASS FOR PACKAGE | Native config includes `com.kasat.aura` | Android release is outside build-8 scope |
| EAS production environment | PASS FROM TOOLING | Firebase, Google client IDs, AURA agent, and Sentry DSN are configured | Do not change production values during cleanup |
| EAS profile | PASS | Store distribution, local credentials, production environment, and auto-increment configured | Build only after review/commit/merge |
| Firebase backend | PASS FROM TOOLING | Required Cloud Functions are deployed | No redeploy for this stabilization pass |
| Privacy/terms/support routes | PASS IN SOURCE | Next.js routes exist at `/privacy`, `/terms`, `/support`, `/delete-account` | Owner approve and deploy website |
| Support email and website origin | OWNER INPUT | Environment-backed; no production value exists in the repository | Configure Vercel values before external beta |
| App Store metadata | DRAFT READY | Repository metadata draft is current | Enter and approve in App Store Connect |
| App Privacy answers | OWNER REVIEW | Inventory and draft answers exist | Review third-party processors and publish answers |
| App Check | DEFERRED RISK | No enforced App Check path was established in this cleanup | Accept for trusted beta or schedule before broader beta |
| Privacy manifest | OWNER REVIEW | Native privacy manifest exists | Confirm collected-data declarations against App Store answers |

## Before Creating Build 8

- [ ] Review and intentionally commit the stabilization diff.
- [ ] Push the feature branch, merge through the chosen workflow, and build from a clean `main`.
- [ ] Confirm `npm test`, `npm run lint`, mobile TypeScript, Expo Doctor, iOS export, backend validation, and website validation pass.
- [ ] Configure/approve production website origin and support email.
- [ ] Approve Privacy Policy and Terms text.
- [ ] Confirm Apple Developer agreements and credentials remain valid.

## Before Internal TestFlight

- [ ] Manually inspect **App Store Connect → AURA → TestFlight** for build 7 and current status.
- [ ] Create/upload build 8 if proceeding with the cleaned candidate.
- [ ] Complete export-compliance prompts.
- [ ] Install from TestFlight on a physical iPhone.
- [ ] Complete the trusted-beta smoke test in `PUBLIC_BETA_QA_CHECKLIST.md`.

## Before External TestFlight

- [ ] Deploy the reviewed website and verify all four public routes.
- [ ] Set support URL/email, privacy URL, terms URL, category, age rating, test instructions, and reviewer contact.
- [ ] Provide a working demo account if required by review.
- [ ] Complete and publish accurate App Privacy answers.
- [ ] Verify account deletion against Firebase Auth, Firestore, Storage, chats, and outfit plans.
- [ ] Verify Sentry delivery/scrubbing and alert routing.
- [ ] Verify OpenAI and Firebase/GCP budget alerts and the SerpApi cap/disabled state.
- [ ] Decide whether deferring App Check is acceptable for the size and trust level of the tester cohort.
