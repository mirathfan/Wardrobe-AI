# AURA Privacy Policy

Last updated: 2026-08-15

Status: Prepared for beta; owner approval and final production contact/domain are required before external distribution.

This policy explains how AURA: AI Personal Stylist ("AURA") handles information during beta. The deployable version is the Next.js `/privacy` route.

## Information AURA Processes

AURA may process account identifiers, email address, display name, authentication provider, style and fit preferences, closet item metadata, clothing photos, edited or background-removed images, chat messages, saved and planned outfits, wear history, feedback, and submitted product links or metadata.

With permission, AURA may use location for weather, read calendar context for outfit planning, and use microphone or speech input for voice chat. Users can deny or revoke device permissions in iOS Settings.

## Uses

AURA uses information to authenticate users, store and organize closets, process garment images, extract item attributes, generate closet-grounded styling suggestions, import products, plan outfits, remember feedback, enforce quotas, prevent abuse, diagnose errors, and operate the beta.

## AI And Cloud Processing

AURA uses Firebase and Google Cloud for authentication, Firestore, Storage, Cloud Functions, and operational logs. Selected prompts, recent conversation context, wardrobe metadata, preferences, product metadata, images, or temporary audio may be sent to OpenAI when required by an AI feature. The implementation is designed not to send authentication tokens or unnecessary account contact information in AI requests.

## Providers

Depending on enabled beta features, AURA may use Firebase/Google Cloud, OpenAI, Apple, Google Sign-In, Sentry, weather providers such as Open-Meteo, and optional shopping/search or affiliate providers. Product search and affiliate functionality may remain disabled during beta.

## Diagnostics

When configured, Sentry receives crash and error diagnostics. AURA disables default PII collection, scrubs sensitive fields and user content, restricts tags, and uses an anonymous hashed user identifier. Firebase and Google Cloud may retain operational logs.

## Sharing And Retention

AURA does not sell personal information. Information is shared with service providers only as needed to operate, secure, diagnose, or provide a requested feature, or as required by law.

User-scoped account, closet, chat, outfit, preference, and image data is generally kept until the user removes content or deletes the account. Operational logs, processor logs, backups, and non-user-specific caches may remain for limited periods under provider retention practices.

## Account Deletion

In-app path: **Profile tab → Account → Danger Zone → Delete account**, followed by two confirmations.

The callable backend removes the Firebase Authentication user, the user’s Firestore document tree and subcollections, owned files under `users/{uid}/` in Firebase Storage, and known user-linked function rate-limit records. After success, the app clears user-scoped local data and signs out. Provider logs, backups, and non-user-specific caches may remain for limited periods.

## Children

AURA is not directed to children. The owner must approve the final minimum age and App Store age rating before external beta distribution.

## Contact And Published URL

- Privacy/support contact: value configured as `NEXT_PUBLIC_SUPPORT_EMAIL` on the production website.
- Published URL after deployment: `${NEXT_PUBLIC_SITE_URL}/privacy`.
