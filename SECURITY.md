# Security

## Firebase API Key Restrictions

- Open GCP Console -> APIs & Services -> Credentials
- Select the web API key (EXPO_PUBLIC_FIREBASE_API_KEY)
- Under "Application restrictions" set to "HTTP referrers" for web, or verify the iOS key is restricted to bundle ID com.kasat.aura
- Under "API restrictions" limit to: Identity Toolkit API, Token Service API, Firebase Installations API, Cloud Firestore API, Firebase Storage API
- Confirm no key is set to "None (unrestricted)"
