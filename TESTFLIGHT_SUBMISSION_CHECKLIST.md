# AURA TestFlight Submission Checklist

Audit date: 2026-05-11

## Repo/Config Status

| Item | Status | Evidence | Required action |
|---|---|---|---|
| App name | PASS | `app.json` name `AURA`; native display name `AURA` | Confirm App Store listing name remains `AURA: AI Personal Stylist` |
| Bundle ID | PARTIAL | Expo/iOS project use `com.kasat.aura` | Regenerate Firebase iOS config for this bundle |
| Android package | PARTIAL | Expo/Android Gradle use `com.kasat.aura` | Regenerate Firebase Android config for this package |
| Version/build number | FIXED | `version` 1.0.0, iOS `buildNumber` 1, Android `versionCode` 1 | Increment for every TestFlight upload |
| Icons | PASS WITH MANUAL QA | App icons referenced in `assets/` | Verify actual icon appearance in TestFlight |
| Splash screen | PASS WITH MANUAL QA | `expo-splash-screen` configured black background and splash icon | Verify first launch on device |
| Camera permission text | PASS | Specific AURA text in `app.json`/Info.plist | Test prompt on device |
| Photo library permission text | PASS | Specific AURA text in `app.json`/Info.plist | Test limited photo access |
| Microphone/speech text | PASS | AURA voice dictation text present | Confirm voice feature is intended for launch |
| Location text | FIXED | More specific foreground/location strings added | Verify no unwanted Always prompt appears |
| Calendar/reminders text | FIXED | Calendar/reminders strings made less vague | Confirm reminders permission is actually required |
| Support URL | MISSING | No repo/App Store metadata found | Add in App Store Connect |
| Privacy Policy URL | MISSING | Draft file created, no hosted URL | Host reviewed policy before external testing |
| Terms URL | MISSING | Draft file created, no hosted URL | Host reviewed terms before external testing |
| App category | MISSING | Not represented in repo | Set in App Store Connect |
| Minimum iOS version | PASS | Expo build properties deployment target 17.0 | Confirm iOS 17 minimum is acceptable |
| EAS build profiles | FIXED | `eas.json` added with development/preview/production | Run `eas build --profile preview --platform ios` |
| Firebase iOS config bundle match | FAIL | `GoogleService-Info.plist` says `com.athfan.AURA` | Download new `GoogleService-Info.plist` for `com.kasat.aura` |
| Firebase Android config package match | FAIL | `google-services.json` says `com.athfan.aura` | Download new `google-services.json` for `com.kasat.aura` |
| Firebase config included in EAS build | FAIL/RISK | Firebase config files are ignored/untracked by git | After replacing with correct configs, either commit them intentionally or configure EAS secret file handling so cloud builds receive them |
| Google Sign-In OAuth | FAIL/RISK | Reversed client IDs are tied to old Firebase config | Regenerate OAuth clients and `.env.local` values |
| No development-only endpoints | PARTIAL | No localhost client endpoints found; `parseOutfitIntent` HTTP endpoint exists | Decide whether `parseOutfitIntent` is still needed |
| No test keys | PASS FROM TRACKED CODE | No service account/private key tracked | Firebase API keys exist in ignored local files; restrict in Google Cloud |
| No hardcoded local URLs | PASS | `localhost` only blocked in server safe fetch or native dev config | None |
| No debug screens exposed | PASS/RISK | Debug logs mostly gated; AURA training route exists as product feature | Manually inspect route access |
| No sensitive console logs | PARTIAL/FIXED | Backend wardrobe context logs reduced; client debug logs gated by `__DEV__`/env | Review Functions logs after QA |
| App Check | FAIL/RISK | No App Check SDK or `enforceAppCheck` found | Configure before external TestFlight if possible |
| Privacy manifest | RISK | `ios/AURA/PrivacyInfo.xcprivacy` collected data array is empty | Legal/owner review required |

## Required Before Internal TestFlight

1. Register Firebase iOS app for `com.kasat.aura` and replace both root and native `GoogleService-Info.plist`.
2. Register Firebase Android app for `com.kasat.aura` and replace both root and native `google-services.json` if Android is kept.
3. Make sure the corrected Firebase config files are available to EAS cloud builds.
4. Verify Google Sign-In iOS/web client IDs in `.env.local`.
5. Run `eas build --profile preview --platform ios`.
6. Smoke test on a physical iPhone.

## Required Before External TestFlight

1. Host reviewed Privacy Policy and Terms.
2. Complete App Store Connect privacy answers.
3. Configure App Check or document why it is deferred for small internal-only launch.
4. Confirm deletion behavior from Firebase Console.
5. Set support URL, category, age rating, test instructions, and export compliance.
