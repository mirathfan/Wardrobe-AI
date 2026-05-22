# Privacy Policy Draft

Draft only. Must be reviewed and customized by the app owner/legal professional before launch.

Effective date: [insert date]

AURA: AI Personal Stylist ("AURA", "we", "us") helps you create a digital wardrobe, plan outfits, and receive AI styling suggestions based on the clothing items, preferences, and context you choose to provide.

## Information We Collect

We collect account information such as your email address, user ID, display name, and optional profile photo. We collect wardrobe content you add, including clothing photos, edited cutout images, item names, brands, colors, categories, sizes, notes, prices, product links, outfit plans, saved looks, laundry status, wear history, and AURA chat messages.

If you grant permission, AURA may use your camera or photo library so you can add clothing photos. If you grant location permission, AURA may use your approximate location while you use the app to show local weather for outfit planning. If you grant calendar permission, AURA may read upcoming calendar event titles and times to help plan outfits around your day.

AURA includes voice dictation features. Voice input may be processed by the device speech recognition service and, if enabled in the backend, may be sent to our Firebase Functions for transcription through OpenAI. The app owner must confirm the final voice behavior before launch.

## AI Processing

AURA uses Firebase Functions to call OpenAI for styling features. Depending on the feature, we may send OpenAI your chat prompt, recent chat context, wardrobe item metadata, style preferences, clothing image URLs, product link metadata, or outfit photos. We use this information to generate outfit suggestions, classify clothing items, extract product details, and respond to your styling requests.

We do not put the OpenAI API key in the mobile app. AI requests are made from Firebase Functions.

## Product Link Import and Shopping Features

If you paste a product link, AURA may fetch the product page, read product metadata, analyze product images, and create a draft wardrobe item for your review. Some shopping or product links may be routed through affiliate providers, such as Skimlinks, if that feature is enabled. AURA may earn a commission from some shopping links.

## Where Data Is Stored

AURA uses Firebase Authentication for accounts, Cloud Firestore for wardrobe/profile/chat/outfit data, Cloud Storage for photos and audio files, and Firebase Functions for backend processing. AURA may also use OpenAI, Apple, Google Sign-In, SerpApi, affiliate providers, and weather APIs such as Open-Meteo depending on enabled features.

## Retention and Deletion

We keep your account and wardrobe data while your account is active. You can delete individual closet items and chats in the app. You can delete your account in the app. Account deletion is intended to delete your Firebase Auth account, Firestore user data, Storage files under your user folder, chats, outfits, saved looks, and related metadata.

Some shared caches or provider logs may not be deleted by the in-app deletion flow. The app owner must confirm provider retention periods before launch.

## Your Choices

You can decline camera, photo library, location, calendar, microphone, and speech permissions. Some features may not work without those permissions. You can sign out, delete chats/items, export certain profile data, and request account deletion in the app.

## Children

AURA is not intended for children under 13, or under the minimum digital consent age in your region. If you believe a child has provided personal information, contact us so we can delete it.

## Security

We use Firebase Authentication, user-scoped Firestore and Storage rules, and server-side API keys in Firebase Functions. No system is perfectly secure. You should not upload content you do not want processed for styling features.

## Changes

We may update this Privacy Policy from time to time. We will update the effective date and provide notice when required.

## Contact

Contact: [insert support email]

Privacy Policy URL: [insert URL]
