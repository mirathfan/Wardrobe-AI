# Privacy Policy

Effective date: [INSERT EFFECTIVE DATE]

This Privacy Policy explains how AURA: AI Personal Stylist ("AURA", "we", "us") handles information during the public beta. This draft must be reviewed and approved by the app owner and, where appropriate, legal counsel before it is published.

## Beta Notice

AURA is in beta testing. Features, processors, retention practices, and third-party integrations may change before general availability. Beta testers should not upload content they are not comfortable using in a beta product.

## Information We Collect

AURA may collect and process:

- Account data: Firebase Authentication account identifiers, email address, display name or first name if provided, and Firebase user ID.
- Clothing photos: photos you take or select for wardrobe items.
- Edited and cutout images: background-removed, cropped, normalized, thumbnail, or polished clothing images.
- Closet item metadata: item names, categories, colors, sizes, materials, brands, prices, notes, source labels, and other wardrobe attributes.
- AURA chat messages: prompts, assistant replies, conversation history, and message metadata.
- Outfit data: saved looks, outfit plans, wear history, feedback, style preferences, and related planning metadata.
- Product links and imported product metadata: URLs you submit, merchant domains, product titles, images, prices, size options, categories, and item draft metadata.
- Location and weather data if enabled: approximate or precise location coordinates may be used to request local weather for outfit planning.
- Calendar data if enabled: calendar event titles, dates, and times may be read on device to support event-aware outfit planning.
- Microphone and speech data if enabled: speech may be converted to text for AURA chat. Temporary audio for backend transcription is intended to be deleted after processing if that backend path is used.
- Diagnostics: privacy-scrubbed crash and error diagnostics through Sentry, plus operational logs in Firebase/Google Cloud.

## How We Use Information

We use information to:

- Create and maintain your AURA account.
- Store and display your closet.
- Extract item details from clothing photos.
- Generate AI styling suggestions, outfit cards, and chat replies.
- Import product links into closet drafts.
- Plan outfits using calendar and weather context if you grant those permissions.
- Provide support, troubleshoot crashes, prevent abuse, enforce rate limits, and maintain service reliability.

## AI And Cloud Processing

AURA uses Firebase/Google Cloud for authentication, database, storage, backend functions, and logs. AURA sends selected information to OpenAI to generate styling responses, analyze clothing or outfit photos, extract item metadata, rank product images, and transcribe audio if voice transcription is enabled.

AI requests may include AURA chat text, recent conversation context, wardrobe metadata, clothing image URLs, product metadata, and selected profile preferences needed to provide the feature. AURA should not intentionally send raw Firebase tokens, auth headers, or unnecessary account contact information to AI processors.

## Third-Party Services

AURA may use:

- Firebase and Google Cloud for auth, Firestore, Storage, Cloud Functions, and operational logs.
- OpenAI for AI styling, vision analysis, image extraction support, and transcription if enabled.
- Sentry for crash and error diagnostics. Sentry is configured with `sendDefaultPii: false`, privacy scrubbers, safe tags, and anonymous hashed user IDs only.
- SerpApi or another shopping/search provider if live product search is enabled.
- Affiliate providers such as Skimlinks if affiliate shopping links are enabled.
- Apple services for Sign in with Apple, TestFlight, App Store distribution, and platform diagnostics.
- Google Sign-In if enabled for authentication.
- Weather providers such as Open-Meteo if weather features are enabled.

## Crash And Error Diagnostics

AURA uses Sentry only when `EXPO_PUBLIC_SENTRY_DSN` is configured. If the DSN is missing, Sentry is disabled and the app should continue running.

Sentry events are configured to avoid raw user prompts, raw chat messages, raw emails, full user IDs, product URLs, image URLs, Firebase tokens, auth headers, and cookies. Events may include safe diagnostics such as app version, build number, platform, environment, error type, stack trace, and an anonymous hashed user ID.

## Data Sharing

We do not sell personal information. We share data with service providers only as needed to operate AURA, provide AI features, diagnose errors, prevent abuse, or comply with legal obligations. If affiliate links are enabled, product link interactions may be processed by the affiliate provider according to its terms. Owner confirmation is required before enabling affiliate tracking for public beta.

## Data Retention

Account, closet, chat, outfit, product import, and image data are generally kept until you delete specific content or delete your account. Operational logs, provider logs, backups, and shared non-user caches may remain for a limited time according to provider policies and operational needs.

## Account Deletion

You can request account deletion in the app at [INSERT ACCOUNT DELETION PATH IF DIFFERENT]. The backend deletion flow is intended to delete:

- Firebase Authentication user.
- Firestore `users/{uid}` data and subcollections.
- Firebase Storage files under `users/{uid}/`.
- AURA chats, closet items, outfit plans, saved looks, and related user-scoped metadata.
- Known function rate-limit documents tied to the account.

Some provider logs, backups, or non-user-specific caches may remain for limited periods.

## Your Choices

You can:

- Deny or revoke camera, photo library, location, calendar, microphone, and speech permissions in iOS settings.
- Delete items, chats, looks, and your account where the app provides controls.
- Contact support for privacy or deletion questions.

## Children

AURA is not intended for children under [INSERT AGE THRESHOLD]. Owner must confirm age rating and child-directed status before public launch.

## Changes

We may update this Privacy Policy as the beta evolves. The effective date will be updated when changes are published.

## Contact

Privacy contact: [INSERT CONTACT EMAIL]

Privacy Policy URL: [INSERT PRIVACY POLICY URL]
