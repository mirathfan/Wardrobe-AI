# AURA Launch Privacy Data Inventory

Audit date: 2026-05-11

Scope: repo evidence from the Expo app, Firebase rules, Firebase Functions, native config, and local environment key names. This is an engineering inventory, not final legal advice.

## Standards Used

- Firebase security checklist: https://firebase.google.com/support/guides/security-checklist
- Firebase App Check overview: https://firebase.google.com/docs/app-check
- Firebase API key guidance: https://firebase.google.com/docs/projects/api-keys
- Firebase Storage user security rules: https://firebase.google.com/docs/storage/security/user-securityBAK

## Account Data

| Data type | Source screen or flow | Storage or processor | Purpose | Retention and deletion | User deletion | App Store privacy disclosure |
|---|---|---|---|---|---|---|
| Email address | Email sign up/sign in in `app/(auth)/register.tsx` and `app/(auth)/login.tsx` | Firebase Auth; may also be visible through Auth user object | Account creation and sign in | Kept until account deletion | Deleted by `deleteAccountData` via Firebase Auth deletion | Yes: Contact Info, Email Address, linked to user |
| UID | Firebase Auth after sign in | Firebase Auth; Firestore path `users/{uid}`; Storage path `users/{uid}/...`; hashed UID in function rate limits | Access control, user data scoping, rate limiting | Kept until account deletion; hashed rate-limit docs deleted for known endpoints | Deleted by `deleteAccountData`; legacy `parseOutfitIntent` rate-limit doc is now included | Yes: User ID or Identifiers, linked to user |
| First/display name | Register, onboarding/profile/account screens | Firestore `users/{uid}` profile fields | Personalization and account display | Kept until account deletion | Deleted by `deleteAccountData` | Yes: Contact Info or Other User Content, linked to user |
| Profile photo | Profile account screen | Firebase Storage `users/{uid}/profile/avatar.jpg`; URL in Firestore/Auth profile fields if saved | Account personalization | Kept until account deletion | Deleted by account deletion storage prefix cleanup | Yes: User Content, Photos or Other User Content |

## User Content

| Data type | Source screen or flow | Storage or processor | Purpose | Retention and deletion | User deletion | App Store privacy disclosure |
|---|---|---|---|---|---|---|
| Clothing photos | Add item, closet quick add, AURA image attachments | Firebase Storage `users/{uid}/items/...`; temporary local file cache | Closet item creation, visual display, AI extraction | Stored until item/account deletion | Item deletion attempts owned Storage cleanup; account deletion removes `users/{uid}/` prefix | Yes: User Content, Photos, linked to user |
| Cutout/cleaned/normalized images | Native iOS background removal, server ingestion | Firebase Storage `users/{uid}/items/...cleaned.png`, `.normalized.png`, thumbs/crops | Display polished item images and AI ingestion | Stored until item/account deletion | Same as clothing photos | Yes: User Content, Photos |
| Item metadata | Manual add, AI ingestion, product link import | Firestore `users/{uid}/items/{itemId}` | Closet, laundry, styling, recommendations, planner | Stored until item/account deletion | Item delete and account delete | Yes: User Content or Other Data, linked to user |
| Product links and product metadata | Closet product link import, AURA chat product-link intent | Firestore item fields such as `productUrl`, `sourceUrl`, `linkMetadata`; Firebase Functions process URL; external merchant pages fetched server-side | Create clothing draft from a product URL | Stored with item until item/account deletion | Item/account deletion | Yes: User Content, Browsing/Search-like content depending App Store interpretation; needs owner/legal confirmation |
| Outfit plans | Calendar, Home, AURA actions, Wear Today | Firestore `users/{uid}/outfits/{dateKey}` | Daily planning and wear logging | Stored until user clears plan or account deletion | Clear plan, item/account deletion | Yes: User Content, linked to user |
| Saved looks and feedback | AURA chat, AURA swipe, Studio, profile My Looks | Firestore `users/{uid}/savedLooks`, `savedOutfits`, `outfitFeedback`, `styleEvents`, `assistantProfile` | Personalization and saved outfit history | Stored until deleted/account deletion | My Looks deletion and account deletion | Yes: User Content, Preferences, linked to user |
| AURA chat messages | AURA tab and chat drawer | Firestore `users/{uid}/aiChats/{chatId}/messages`; local MMKV cache | AI stylist conversation history and continuity | Stored until chat/account deletion; local cache cleared on sign out/account deletion | Chat delete and account deletion | Yes: User Content, Other User Content, linked to user |
| AURA image attachments | AURA chat image upload | Firebase Storage `users/{uid}/auraAttachments/...`; message metadata in Firestore | Image-aware styling, outfit analysis, add item from image | Stored until account deletion unless item draft consumes it | Account deletion | Yes: User Content, Photos |
| Voice transcripts | AURA composer voice dictation | Current composer uses native speech recognition to insert text into chat. Backend `transcribeAuraAudio` exists but no current call site was found. | Dictation into chat | Transcript becomes chat text if sent; temporary backend audio would be deleted in `finally` if endpoint is used | Chat/account deletion | Yes if enabled: Audio Data and User Content. Needs owner confirmation |

## Device and Technical Data

| Data type | Source screen or flow | Storage or processor | Purpose | Retention and deletion | User deletion | App Store privacy disclosure |
|---|---|---|---|---|---|---|
| Auth/session tokens | Firebase Auth SDK | Firebase Auth/AsyncStorage | Keep user signed in | Managed by Firebase Auth; removed on sign out | Sign out/account deletion | Usually not disclosed as collected data, but confirm |
| Local cache | Chat cache, weather cache, closet cache | MMKV `aura-storage` and AsyncStorage | Performance/offline UX | Until cleared or overwritten | `Storage.clearUserScopedData(uid)` clears user-scoped MMKV keys; weather cache is not UID-scoped | May not require disclosure unless tied to user |
| Location coordinates | Weather cards and calendar planning | Sent to Open-Meteo API request; city/weather stored locally | Weather-aware outfit planning | Weather cached locally for 30 minutes | User can deny permission; cache not explicitly cleared on account deletion if unscoped | Yes: Location, likely Precise Location if lat/lon sent |
| Calendar event titles/times | Home/calendar event cards | Read from device calendar; displayed in app. No direct Firestore storage found | Event-aware outfit planning | In memory during use | User can deny/revoke permission | Yes if collected/processed: Calendar or Other User Content. Needs owner/legal confirmation |
| Crash logs/analytics | `@sentry/react-native` plus user-scoped launch/error events in `src/lib/analytics.ts` | Privacy-scrubbed Sentry diagnostics; Firestore `users/{uid}/launchEvents` | Reliability, error diagnosis, and beta feature health | User-scoped launch events remain until account deletion; Sentry/provider retention follows configured provider policies | Firestore launch events are removed by recursive account deletion | Yes: Diagnostics and user-linked/pseudonymous identifiers; owner must confirm final App Store classification |
| Device identifiers | Firebase SDKs may process installation/auth/device signals | Firebase | Auth/security/service operation | Managed by Firebase | Account deletion/sign out partly affects auth data | App Store answers need owner confirmation based on Firebase console and SDK behavior |

## AI Processing

| Data sent | Sent to | Code evidence | Purpose | Stored by AURA | Deletion |
|---|---|---|---|---|---|
| Chat prompt, recent history, compact profile, wardrobe context, required item IDs | OpenAI via Firebase Functions `askAura`/`askAuraStream` | `functions/src/askAura.ts`, `functions/src/askAuraStream.ts` | Generate AURA chat and outfit advice | Final chat stored in Firestore; OpenAI request not stored in repo code | Chat/account deletion for AURA storage; OpenAI retention must be reviewed in processor terms |
| Clothing image URLs | OpenAI vision via `ingestItemFromPhotos` | `functions/src/ingestItemFromPhotos.ts` | Extract item category, color, material, brand, details | Parsed metadata stored in Firestore; images stored in Storage | Item/account deletion |
| Product URL metadata and product images | Firebase Functions and OpenAI image candidate ranking/extraction | `functions/src/shared/productLinkExtractor.ts`, `auraUrlCandidatePreview.ts` | Build item draft from product link | Product metadata may be stored in item doc | Item/account deletion |
| Outfit photo attachments | OpenAI vision through AURA chat photo analysis | `functions/src/shared/auraOutfitPhotoAnalysis.ts` | Analyze worn outfit or add pieces | Output stored in chat if sent | Chat/account deletion |
| Voice audio | OpenAI transcription if dormant callable is wired | `functions/src/transcribeAuraAudio.ts`; no current client call found | Transcribe voice note | Audio temp file deleted after transcription; transcript returned | Transcript deletion if sent as chat |

## Third Parties

| Third party | Evidence | Data involved | Notes |
|---|---|---|---|
| Firebase / Google Cloud | Firebase SDKs, Auth, Firestore, Storage, Functions | Account data, UID, closet data, photos, chat, function logs, rate limits | Primary backend and storage processor |
| OpenAI | `openai` package and direct API calls in Functions | Chat text, wardrobe context, image URLs, product context, possible transcripts | Processor for AI responses. Owner must review current OpenAI API data terms |
| Apple | Apple Sign In, iOS permissions, TestFlight/App Store | Apple auth identifier, app metadata, TestFlight diagnostics if enabled | Owner must configure App Store privacy answers |
| Google Sign-In | `@react-native-google-signin/google-signin` | Google OAuth profile/email depending consent | Native bundle, Firebase plist, reversed client scheme, and production iOS client ID are aligned for `com.kasat.aura`; verify on the next TestFlight build |
| Sentry | `@sentry/react-native`, `src/lib/sentry.ts`, `metro.config.js` | Scrubbed crash/error context, safe build tags, anonymous hashed user ID | Enabled in the EAS production environment; delivery, scrubber output, and alert routing require manual verification |
| SerpApi | `SERPAPI_API_KEY`, `searchLiveProducts` | Product search query and shopping results | Feature is gated by env flags |
| Skimlinks or affiliate provider | `SKIMLINKS_ID`, `wrapAffiliateLinks` | Product URLs for affiliate wrapping | Affiliate disclosure exists in shopping sheet; owner must confirm program and disclosure |
| Open-Meteo | Weather fetch URL in `useLocalWeather`/`weatherDaily` | Latitude/longitude and selected date | Not listed in original prompt but present in code |

## Deletion Summary

- In-app account deletion exists in `src/profile/screens.tsx` and calls `deleteAccountData`.
- Backend deletion removes Auth user, Firestore `users/{uid}` tree, Storage `users/{uid}/` files, hashed function rate-limit docs, and now the legacy `parseOutfitIntent` raw-UID rate-limit doc.
- Shared top-level caches such as `productSearchCache` are not user-specific and are not deleted by account deletion.
- Local user-scoped MMKV data is cleared on sign out/account deletion. Non-user-scoped weather cache is not explicitly cleared.

## Human Review Required

- Final Privacy Policy, Terms, App Store privacy labels, age rating, and AI disclosure.
- Whether Firebase/OpenAI/SerpApi/affiliate provider processor terms match AURA's intended launch.
- Whether TestFlight diagnostics, Apple crash data, or Firebase console features collect diagnostics not visible in repo code.
