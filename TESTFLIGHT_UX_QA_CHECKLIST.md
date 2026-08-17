# AURA TestFlight UX QA Checklist

Audit date: 2026-05-11

This checklist separates what was verified from code from what must be tested on a real iPhone TestFlight build.

## Code-Verified Coverage

- Onboarding/auth routes exist: `app/(auth)/*`, `app/(onboarding)/index.tsx`.
- Add item wizard exists for create/edit/duplicate: `app/(tabs)/add.tsx`, `src/addItem/AddItemWizard.tsx`.
- Manual details are edited in the add/edit wizard, not inline on item detail. Item detail routes "Edit" to `/(tabs)/add`.
- Photo add, native iOS background removal, refinement, and upload flows exist in `src/addItem/hooks/usePhotoStep.ts` and `modules/expo-vision-bg`.
- Product link import exists in Closet with preview/edit/add states.
- Closet grid, processing/failed states, and empty states exist in `app/(tabs)/closet.tsx`.
- AURA chat clears composer before sending, reserves one streaming message ID, replaces that message on final, and writes failures as system messages.
- Daily outfit planning and Wear Today exist in Home, Calendar, Today, and `src/lib/wearOutfit.ts`.
- Account deletion exists and calls backend `deleteAccountData`.

## Real iPhone QA Script

Use a fresh TestFlight install, not Expo Go. Run on at least one current iPhone and one older supported iPhone if available.

| Pass | Severity if failed | Flow | Steps | Expected result |
|---|---|---|---|---|
| [ ] | Blocker | Install/open | Install TestFlight build, launch cold | Splash shows AURA, app does not crash, initial auth/onboarding state is correct |
| [ ] | Blocker | Sign up | Create email/password account with first name | Account is created, onboarding starts, no Firebase permission error |
| [ ] | High | Sign in/out | Sign out, sign back in with same account | Closet/profile/chats reload correctly |
| [ ] | High | Apple Sign In | Sign in with Apple on iPhone | Native sheet works and Firebase account links/creates |
| [ ] | High | Google Sign-In | Sign in with Google | Must work only after Firebase/OAuth configs are regenerated for `com.kasat.aura` |
| [ ] | High | Onboarding | Complete all onboarding screens | User lands in main app and preferences persist |
| [ ] | Blocker | Add item manually | Closet > add item > enter photo, brand, name, category, color, save | Item appears in closet and item detail |
| [ ] | High | Add from photo | Take a garment photo, allow camera, save | Upload completes, AI autofill runs or fails gracefully, no stuck spinner |
| [ ] | High | Photo library | Add from photo library, allow limited photo access | Picker works with limited access, photo uploads |
| [ ] | High | Background removal | Use iOS cutout/refine controls | Cutout renders, refine applies, original fallback is available on failure |
| [ ] | High | Failed upload | Enable poor network/airplane mode during photo upload | User sees retryable failure, draft is not silently lost |
| [ ] | High | Product link import | Paste Nike/Zara/H&M/Amazon product URL, Search, edit preview, Add to Wardrobe | Preview appears or recovery UI appears; saved item opens for review |
| [ ] | Medium | Product link failure | Paste invalid/local/private URL | App rejects it safely and suggests retry/screenshot/manual add |
| [ ] | Blocker | Closet grid | Add 0, 1, 5, 30 items | Empty state, few-item state, and scrolling grid are usable |
| [ ] | High | Item detail | Open item, edit, delete, mark worn, laundry actions | Edit opens edit wizard; delete removes doc/images; status changes persist |
| [ ] | High | AURA basic chat | Send "style me today" | Composer clears immediately, streaming appears once, final response replaces stream |
| [ ] | High | AURA multiline | Type a long multiline prompt | Input grows up to max height and send button stays reachable |
| [ ] | High | AURA failed stream | Turn network off mid-stream | No duplicate assistant messages; error appears; retry works |
| [ ] | High | AURA outfit cards | Ask for "3 outfits for dinner" | Structured cards render, buttons are tappable, composer does not cover cards/tab bar |
| [ ] | High | AURA image attach | Attach item/outfit photo and ask AURA to analyze/add | Attachment uploads, backend validates owned Storage path, result appears |
| [ ] | Medium | Voice dictation | Tap mic, speak, stop, send | Speech text appears or friendly unavailable/permission message appears |
| [ ] | High | Plan Today | From AURA card or Calendar, plan outfit for today | Firestore `users/{uid}/outfits/{dateKey}` updates and Home/Today reflect it |
| [ ] | High | Wear Today | Tap Wear Today from Home/Calendar/item | Wear counts update once; repeated tap says already marked worn |
| [ ] | Medium | Calendar date picker | Open Calendar, pick another date, copy/clear/swap plan | Date selection and swap sheet work without layout overlap |
| [ ] | High | Offline app start | Launch with no network after prior session | App does not crash; cached/local states are graceful |
| [ ] | High | Empty AURA | New account with zero closet items asks for outfit | AURA explains limits without crashing; no fake owned items |
| [ ] | High | Few closet items | Account with 1 top only asks for full outfit | AURA handles missing categories and shows suggestions or clear limitation |
| [ ] | Blocker | Account deletion | Delete account from Profile > Account | User is signed out; Auth user, Firestore `users/{uid}`, Storage `users/{uid}/` files are gone |
| [ ] | High | Reinstall after deletion | Delete app, reinstall, try old account | Old account cannot access deleted data |

## Manual Firebase Console Checks

- Confirm the TestFlight bundle uses Firebase iOS app registered for `com.kasat.aura`.
- Confirm Firestore has no remaining `users/{uid}` tree after account deletion.
- Confirm Storage has no `users/{uid}/` objects after account deletion.
- Confirm Functions logs do not include raw prompts, emails, full image URLs, or full product URLs during the QA run.
- Confirm rate limits trigger with repeated AURA chat/product link/image ingestion attempts.

## Known UX Risks To Watch

- Product link import depends heavily on retailer page markup and network behavior.
- AURA chat has multiple fallback routes; verify no duplicate final messages under retry/poor network.
- Calendar and weather permissions must be tested on real iOS because simulator permission behavior is not enough.
- Native background removal must be tested on physical iPhone, not just TypeScript/build.
