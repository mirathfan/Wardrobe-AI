# Native Release Configuration

Last audited: 2026-08-15

AURA commits native `ios/` and `android/` projects. EAS therefore builds the committed native projects and does not automatically synchronize every `app.json` config-plugin value. Do not assume changing `app.json` alone changes an App Store build.

## iOS Effective Configuration

| Setting | Effective native value | Source parity |
|---|---|---|
| Display name | `AURA` | Matches `app.json` |
| Bundle identifier | `com.kasat.aura` | Matches `app.json` and Firebase plist |
| Marketing version | `1.0.0` in `Info.plist` | Matches `app.json` |
| Current build | `7` in `Info.plist` | Matches `app.json` |
| Deep-link scheme | `aura` | Matches `app.json` |
| Google reversed client scheme | Firebase iOS client for `com.kasat.aura` | Matches root/native Firebase plist and EAS iOS client ID |
| Sign in with Apple | `com.apple.developer.applesignin = Default` | Matches `usesAppleSignIn` |
| Deployment target | iOS `17.0` for the app target | Matches `expo-build-properties` and `Podfile.properties.json` |
| New architecture | Enabled | Matches `app.json` |
| Usage descriptions | Location, calendar, reminders, camera, photos, microphone, and speech present | Matches `app.json` |
| Firebase config | `ios/AURA/GoogleService-Info.plist`, bundle `com.kasat.aura` | Matches root Firebase plist |

Native dependency integration is present through CocoaPods for Apple Authentication, Google Sign-In, Expo Audio, Image Picker, voice, the local Vision module, and the other installed Expo/React Native packages. Sentry is initialized from JavaScript and configured through the installed Expo/native package; source-map upload still depends on optional Sentry organization/project/token configuration.

## Android Effective Configuration

- Application ID and namespace: `com.kasat.aura`.
- Display name: `AURA`.
- Version: `1.0.0` / version code `1`.
- Deep-link scheme: `aura`.
- Camera, location, calendar, media, and audio permissions are present in the committed manifest.
- `android/app/google-services.json` includes the `com.kasat.aura` Firebase client.

Android is not the target of the current build-8 release, so its version code remains unchanged.

## Build Number Ownership

`eas.json` sets `cli.appVersionSource` to `local` and enables `build.production.autoIncrement`. The checked-in baseline should remain build `7`; running the production EAS build from a clean reviewed tree should increment the iOS build number to `8`. Review and commit the resulting local build-number change after the build as part of release bookkeeping.

Do not run a destructive `expo prebuild --clean` against this repository. When app config or native plugins change, audit and reconcile the committed native files intentionally.
