# Public Beta QA Checklist

Build under test: [INSERT BUILD NUMBER]

Tester: [INSERT NAME]

Date: [INSERT DATE]

## Core App

- [ ] Install from TestFlight.
- [ ] Open app without startup crash.
- [ ] Sign up with email/password.
- [ ] Sign in with existing account.
- [ ] Sign out and sign back in.
- [ ] Complete onboarding.
- [ ] Confirm onboarding persists after force quit.

## Closet And Add Item

- [ ] Add item manually.
- [ ] Add item from camera photo.
- [ ] Add item from photo library.
- [ ] Confirm AI item details are editable before save.
- [ ] Confirm polished image and background removal display correctly.
- [ ] Confirm failed image processing shows a recoverable state.
- [ ] View closet list and filters.
- [ ] Open item detail.
- [ ] Edit item.
- [ ] Delete item and verify image disappears from closet.

## AURA Chat

- [ ] Send a basic styling prompt.
- [ ] Send a prompt that produces an outfit card.
- [ ] Retry after a failed/poor network response.
- [ ] Verify AURA does not duplicate messages.
- [ ] Verify AURA does not lose messages after leaving and returning.
- [ ] Verify AURA chat fallback appears if a message cannot render.
- [ ] Verify image attachment flow.

## Product Links And Shopping

- [ ] Preview/import a product link.
- [ ] Confirm imported product metadata is editable.
- [ ] Confirm product import does not corrupt item images.
- [ ] Confirm blocked/unsupported merchant shows a friendly fallback.
- [ ] Confirm live product search is disabled or rate-limited as expected.

## Outfits And Planning

- [ ] Save outfit card.
- [ ] Plan Today from an outfit card.
- [ ] Wear Today.
- [ ] Open calendar view.
- [ ] Plan or clear a daily outfit.
- [ ] Confirm weather card works with location permission granted.
- [ ] Confirm weather gracefully degrades when location is denied.
- [ ] Confirm calendar context works with permission granted.
- [ ] Confirm calendar gracefully degrades when permission is denied.

## Permissions

- [ ] Camera permission.
- [ ] Photo library permission.
- [ ] Location permission.
- [ ] Calendar permission.
- [ ] Microphone permission if voice is enabled.
- [ ] Speech recognition permission if voice is enabled.
- [ ] Denied permissions do not crash the app.

## Account And Privacy

- [ ] Delete account from app.
- [ ] Confirm app signs out after deletion.
- [ ] Confirm deleted account cannot access previous data.
- [ ] Confirm privacy policy, terms, and support links are reachable.

## Reliability

- [ ] Poor network while signing in.
- [ ] Poor network during AURA chat.
- [ ] Poor network during photo upload.
- [ ] Poor network during product import.
- [ ] Force quit and reopen.
- [ ] Sentry is enabled for the build when DSN is configured.
- [ ] Missing `EXPO_PUBLIC_SENTRY_DSN` does not crash startup.
- [ ] Crash/error events in Sentry do not include raw prompts, emails, user IDs, product URLs, image URLs, auth headers, cookies, or tokens.

## Notes

Known issues found:

- [INSERT ISSUE]
