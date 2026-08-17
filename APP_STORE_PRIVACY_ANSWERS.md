# App Store Privacy Answers Draft

Draft only. Do not submit without owner/legal review and confirmation of Apple, Firebase, OpenAI, Sentry, SerpApi, and affiliate settings.

## Tracking Recommendation

Recommended answer: **No tracking**, only if the owner confirms no advertising SDKs, no cross-app tracking, and no affiliate provider behavior that qualifies as tracking under Apple's rules. If Skimlinks or another affiliate provider tracks users across apps or websites, the answer may need to change.

## Data Linked To The User

| Category | Draft answer | Purpose | Owner confirmation needed |
|---|---|---|---|
| Contact Info - Email Address | Collected, linked to user | Account creation, sign in, account management | Confirm Firebase Auth provider settings |
| Contact Info - Name | Collected if provided, linked to user | Personalization and account display | Confirm onboarding/profile collection |
| User Content - Photos or Videos | Collected, linked to user | Closet photos, profile photo, AURA image attachments, polished/cutout images | Confirm photo retention and deletion behavior |
| User Content - Other User Content | Collected, linked to user | AURA chat, closet metadata, product links, outfit plans, saved looks, wear history | Confirm all beta features enabled |
| Identifiers - User ID | Collected, linked to user | Firebase UID, security, rate limits, data scoping | Confirm whether any device identifiers are used outside Firebase |
| Diagnostics | Collected, linked or pseudonymously linked | Sentry crash/error diagnostics and Firebase/GCP operational logs | Confirm Sentry project settings and Apple/TestFlight diagnostics |
| Location | Collected if weather/location is enabled | Weather-aware outfit planning | Confirm whether precise lat/lon is used in production |
| Calendars | Collected if calendar access is enabled | Event-aware outfit planning | Confirm calendar event storage is not persisted remotely |
| Audio Data | Collected if voice dictation/transcription is enabled | Speech-to-text for chat | Confirm whether backend transcription is enabled in beta |
| Product Interaction / Other Data | Collected if shopping/search is tracked | Product import, live search, affiliate links, commerce events | Confirm SerpApi and affiliate settings |

## Data Not Linked To The User

Potentially non-user-linked operational metrics may exist through Apple, Firebase, Sentry, or provider dashboards. Owner must confirm dashboard settings before submission.

## Data Used For Tracking

Draft answer: **None**, pending owner confirmation that affiliate links and shopping providers are not used for cross-app/site tracking.

## Not Collected Based On Repo Evidence

- Contacts.
- Health and Fitness.
- Payment Info.
- In-app purchases.
- Advertising identifiers.

## Purposes To Select

Likely purposes:

- App Functionality.
- Account Management.
- Product Personalization.
- Analytics or Diagnostics for Sentry/Firebase diagnostics only if Apple classification requires it.

## Items Owner Must Confirm

- Final support, privacy policy, and terms URLs.
- Whether live product search is enabled for beta.
- Whether affiliate links are enabled for beta.
- Whether voice dictation uses only on-device/native speech or backend OpenAI transcription.
- Whether calendar events are sent to backend or remain on device.
- Whether Sentry user association remains anonymous hashed ID only.
- Whether TestFlight/Apple diagnostics are enabled outside repo code.
