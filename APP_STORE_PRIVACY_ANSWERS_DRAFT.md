# AURA App Store Privacy Answers Draft

Draft based only on repo evidence. Do not submit without owner/legal review.

## Data Used To Track You

- NEEDS OWNER CONFIRMATION: No tracking SDK or ad SDK was found in package.json. Affiliate links are present, but code evidence does not prove cross-app tracking. Confirm Skimlinks/affiliate behavior before answering "No."

## Data Linked To The User

| App Store category | Draft answer | Status | Repo basis |
|---|---|---|---|
| Contact Info - Email Address | Collected, linked to user, used for app functionality/account management | CONFIRMED FROM CODE | Firebase email/password auth |
| Contact Info - Name | Collected if user enters it, linked to user, used for personalization | CONFIRMED FROM CODE | Register/profile stores name/displayName |
| User Content - Photos or Videos | Clothing photos, profile photo, AURA image attachments are collected and linked to user | CONFIRMED FROM CODE | Firebase Storage `users/{uid}/...` |
| User Content - Other User Content | Closet metadata, outfit plans, AURA chats, product links, saved looks | CONFIRMED FROM CODE | Firestore `users/{uid}` subcollections |
| Identifiers - User ID | Firebase UID is used and linked to user | CONFIRMED FROM CODE | Auth UID scopes Firestore/Storage |
| Location - Precise Location | Likely collected/processed when weather is enabled because lat/lon is sent to weather API | LIKELY | `expo-location`, Open-Meteo fetch with lat/lon |
| Contacts | Not found | CONFIRMED FROM CODE | No contacts permission/API found |
| Calendars | Calendar event titles/times are read when permission is granted | LIKELY | `expo-calendar` reads events; confirm App Store category wording |
| Audio Data | Voice dictation is present; backend transcription callable exists but no current call site found | NEEDS OWNER CONFIRMATION | `@react-native-voice/voice`, `transcribeAuraAudio` |
| Search History | Product searches/import links may count depending interpretation | NEEDS OWNER CONFIRMATION | SerpApi and product URL import flows |
| Purchases | No in-app purchase code found | CONFIRMED FROM CODE | No StoreKit/IAP dependency found |
| Financial Info | Item price fields can be stored manually or from product links; no payment info found | LIKELY | Clothing item price fields |
| Health and Fitness | Not found | CONFIRMED FROM CODE | No HealthKit/fitness APIs found |
| Sensitive Info | Not intentionally collected in code | NEEDS OWNER CONFIRMATION | User-generated chat/photos can contain sensitive content |
| Diagnostics | No Crashlytics/Sentry SDK found | NEEDS OWNER CONFIRMATION | App Store/TestFlight or Firebase console settings may collect outside repo |
| Product Interaction | No analytics SDK found, but Firestore commerce events are written for product suggestions | LIKELY | `commerceEvents` and suggestion analytics |

## Data Not Linked To The User

- NEEDS OWNER CONFIRMATION: Weather cache and device-level SDK telemetry may be unlinked, but repo alone is insufficient.

## Privacy Manifest Risk

`ios/AURA/PrivacyInfo.xcprivacy` currently has an empty `NSPrivacyCollectedDataTypes` array. That may be acceptable only if App Store Connect privacy answers carry the disclosure and SDK manifests cover required APIs, but owner/legal should review before external TestFlight/App Review.

## Recommended Owner Answers To Confirm

- Tracking: probably "No" only if affiliate/Skimlinks setup does not track users across apps/sites.
- Data linked to user: Email, name, user ID, photos, other user content, product interaction, location if weather enabled, calendar data if enabled.
- Purposes: App functionality, personalization, account management, product personalization/recommendations.
- Third-party advertising: not confirmed.
- Developer advertising or marketing: not confirmed.
- Analytics: not confirmed from code.
