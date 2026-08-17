# TestFlight Beta Review Notes

## Beta App Description

AURA: AI Personal Stylist helps beta testers build a digital closet, add clothing from photos or product links, chat with an AI stylist, and plan outfits using their wardrobe, weather, and calendar context when permissions are granted.

## What To Test

- Create or sign in to an account.
- Complete onboarding and style preferences.
- Add clothing manually.
- Add clothing from photos and review AI item details.
- Confirm polished/cutout images display correctly.
- Import a product link into a closet draft.
- Chat with AURA and verify messages do not duplicate or disappear.
- Save or plan an outfit card.
- Use Wear Today or Plan Today.
- Test weather, calendar, camera, photo library, microphone, and speech permissions.
- Delete the account from the profile/settings flow.

## Reviewer Notes

This is a public beta build. AI suggestions are informational and may be imperfect. Product links may fail if a merchant blocks automated reading. Shopping/search and affiliate features may be disabled unless specifically configured for beta.

## Demo Account

Demo email: Owner must provide a dedicated beta-review account or confirm reviewer self-registration.

Demo password: Owner must provide this securely in App Store Connect; never commit it.

If no demo account is provided, reviewers can create a test account using email/password or configured Apple/Google sign-in.

## Account Deletion Path

Profile tab → Account → Danger Zone → Delete account, followed by both confirmation prompts.

Backend deletion is intended to remove Firebase Auth, Firestore `users/{uid}` data, Storage `users/{uid}` files, chats, closet items, saved looks, and outfit plans.

## URLs

Privacy Policy URL: `${NEXT_PUBLIC_SITE_URL}/privacy` after deployment.

Support URL: `${NEXT_PUBLIC_SITE_URL}/support` after deployment.

Terms URL: `${NEXT_PUBLIC_SITE_URL}/terms` after deployment.

Contact email: Production value of `NEXT_PUBLIC_SUPPORT_EMAIL` (owner input required).
