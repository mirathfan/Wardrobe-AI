# Account Deletion Test Plan

Build under test: Record the installed TestFlight build (next intended candidate: 8).

Tester: Record the tester name.

Date: Record the test date.

## Manual Verification

1. Create a new test account.
2. Record the Firebase Auth UID for the account.
3. Add one clothing item from a photo.
4. Confirm the original and processed item images exist under `users/{uid}/` in Firebase Storage.
5. Add one clothing item manually.
6. Send at least one AURA chat message.
7. Save or plan one outfit.
8. If product import is enabled, import one product link.
9. Open **Profile tab → Account → Danger Zone → Delete account** and complete both confirmation prompts.
10. Delete the account.
11. Confirm the app signs out and returns to auth/welcome.

## Firebase Verification

- [ ] Firebase Auth user for the UID is deleted.
- [ ] Firestore `users/{uid}` document is deleted.
- [ ] Firestore `users/{uid}/items` is deleted.
- [ ] Firestore `users/{uid}/aiChats` and messages are deleted.
- [ ] Firestore `users/{uid}/outfits` or daily outfit plan data is deleted.
- [ ] Firestore saved looks, saved outfits, outfit feedback, assistant profile, commerce events, and style events are deleted.
- [ ] Firebase Storage prefix `users/{uid}/` is empty or deleted.
- [ ] Chat deletion is verified by absence of `aiChats` subcollections.
- [ ] Outfit plan deletion is verified by absence of planned outfit docs.
- [ ] Known hashed function rate-limit docs for the user are deleted where applicable.

## Expected Result

The user cannot sign in to the deleted account and cannot access prior closet, chat, photo, saved look, or outfit plan data.

## Notes

Non-user-specific provider logs, backups, product search caches, and external processor logs may remain according to provider retention policies.
