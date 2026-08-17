# TestFlight Env Fix

## Root Cause

TestFlight Build 1 crashed on launch because Firebase Auth received an invalid or missing API key:

`FirebaseError: Firebase: Error (auth/invalid-api-key)`

The app initializes Firebase from `process.env.EXPO_PUBLIC_*` values in the JS bundle. EAS reported that the production environment had no variables, so the TestFlight bundle was built without the required Firebase config.

## Required EAS Production Env Vars

Required for app launch and Firebase Auth startup:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

Required for Google sign-in:

- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`

Not required by the current client bundle:

- `EXPO_PUBLIC_OUTFIT_INTENT_URL` is not referenced in the app code. Do not add it unless a legacy client endpoint is reintroduced.

## Commands

Run these from the `closet/` directory. Source local values first so `.env.local` can override `.env`:

```sh
set -a
[ -f .env ] && source .env
[ -f .env.local ] && source .env.local
set +a
```

Create the production EAS environment variables:

```sh
eas env:create --environment production --name EXPO_PUBLIC_FIREBASE_API_KEY --value "$EXPO_PUBLIC_FIREBASE_API_KEY" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "$EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "$EXPO_PUBLIC_FIREBASE_PROJECT_ID" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "$EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "$EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_FIREBASE_APP_ID --value "$EXPO_PUBLIC_FIREBASE_APP_ID" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID" --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID --value "$EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID" --visibility plaintext
```

Confirm the production environment before rebuilding:

```sh
eas env:list --environment production
```

Confirm those EAS values are readable by a process using the production EAS environment:

```sh
eas env:exec --environment production 'npm run check:eas-env'
```

With `eas-cli/18.11.0`, `env:exec` uses the environment as a positional argument:

```sh
eas env:exec production 'npm run check:eas-env'
```

`eas env:list` proves the variables exist in EAS. Because these values are plaintext/public, that command may print the actual values; do not paste its raw output into tickets, logs, or commits. `eas env:exec` with `npm run check:eas-env` proves they are readable by a process launched with that EAS environment and prints only redacted diagnostics. The actual TestFlight binary still requires a rebuild because `EXPO_PUBLIC_*` values are bundled into the JavaScript app at build time.

Expo only inlines `EXPO_PUBLIC_*` variables when the app code references them with static dot notation, such as `process.env.EXPO_PUBLIC_FIREBASE_API_KEY`. Dynamic bracket access such as `process.env[name]` is not inlined into the production bundle.

After adding or changing these EAS env vars, create a new build; installing an old binary will not pick them up.

```sh
eas build --profile preview --platform ios
```

## Safety Notes

- Do not commit `.env`, `.env.local`, `credentials.json`, `.p12`, or provisioning profile files.
- Firebase client API keys are not service-account secrets, but they should still be restricted in Google Cloud to the intended Firebase APIs and app identifiers.
- The app now validates required Firebase config before initialization and renders a production-safe configuration error instead of hard-crashing when the bundle is missing required values.
- Build 3 includes temporary redacted diagnostics on the configuration error screen. Remove them after confirming the production build receives the bundled Firebase values.
