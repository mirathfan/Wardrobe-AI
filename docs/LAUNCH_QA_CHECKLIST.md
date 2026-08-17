# AURA Launch QA Checklist

Use a fresh iOS simulator or TestFlight install when possible. Do not reuse a logged-in account unless the step says persistence.

## 1. Fresh Register
- Start signed out and tap create account.
- Register with a new email and password.
- Expected: account is created, no raw Firebase error appears, and the app routes to onboarding.

## 2. Complete Onboarding
- Complete every onboarding step with realistic style, size, and preference choices.
- Expected: onboarding saves once, routes to the app shell, and does not return after force quitting and reopening.

## 3. Add Item Manually
- Open Add Item, choose manual add, enter category, name, color, size, and notes, then save.
- Expected: item appears in Closet with the entered fields and opens from item detail.

## 4. Add Item From Photo
- Add a clear clothing photo from library or camera.
- Wait for upload, cutout/background removal, and AI extraction.
- Expected: progress state advances, no infinite spinner, item saves with image, category, color, and reviewable metadata.

## 5. Add Item From Product Link
- Paste a normal product URL into the link flow.
- Confirm the preview and save the draft.
- Expected: preview shows product image/title when available, blocked stores show a friendly fallback, and saved item appears in Closet.

## 6. Edit Item
- Open an existing item, tap edit, change name/color/size/notes, and save.
- Expected: item detail reflects edits, user-edited fields are not overwritten by ingestion.

## 7. Delete Item
- Delete a user-uploaded item from item detail, then try bulk deleting another item from Closet selection.
- Expected: item document disappears, owned Storage images are deleted when possible, external product source URLs are not deleted, and cleanup failure shows a friendly notice.

## 8. Ask AURA Normal Chat
- Ask a simple style question with no attachments.
- Expected: response streams smoothly, stop button works during generation, message order stays correct, and refresh/reopen keeps the chat.

## 9. Ask AURA For Outfit
- Ask AURA to build an outfit from the closet.
- Expected: response includes usable outfit cards with owned item references, no duplicate/blank cards, and saved feedback actions work.

## 10. Save And Plan Outfit
- Save a look from AURA, open it from My Looks, then plan it on the calendar.
- Expected: saved look persists, planning creates a calendar entry, and item images render.

## 11. Calendar Flow
- Create, edit, and remove a planned outfit for today and another date.
- Expected: dates remain correct after app restart, empty states are clear, and planned looks are not hidden by the floating dock.

## 12. Profile Update
- Update name/avatar where available, change profile preferences, export profile JSON, and clear AURA memory.
- Expected: updates persist, export sheet opens without logging data, and clear memory does not delete closet items.

## 13. Logout And Login
- Log out, log back in with the same account, then force quit and reopen.
- Expected: existing onboarded users route to the app shell, not onboarding, even if cached profile data loads first.

## 14. Bad Network And Error Behavior
- Disable network during profile load, AURA chat, add-photo upload, and product-link import.
- Expected: no onboarding reset, no infinite spinner, friendly retry/error states appear, and local cached Closet/Profile data remains readable when available.

## 15. Rate Limit Test
- Rapidly trigger AURA chat, product-link preview/import, image ingestion, outfit generation, voice transcription, and account delete attempts.
- Expected: each expensive flow eventually returns "Too many requests. Try again in a minute." without exposing internal limiter paths or raw IDs.
