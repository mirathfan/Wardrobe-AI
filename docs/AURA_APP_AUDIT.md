# AURA App Audit

Audited on 2026-04-30 against the Expo Router app in `app/`, shared UI/data modules in `src/`, and Firebase Functions in `functions/src`.

## 1. Executive Summary

AURA has a strong product direction: dark fashion-app styling, a closet data model, Firebase-backed chat/history, ingestion, laundry, planner, saved looks, and a real AURA chat surface. The app is not just a mock. But it currently feels like a very ambitious prototype with several production-trust gaps:

- The strongest surfaces are Home, Closet, AURA chat, Add Item, Laundry, and the real Studio tab.
- The weakest surfaces are Insights, Packing, some profile settings, and standalone `app/studio.tsx`, which read as placeholder tool shells.
- AURA can save looks, plan looks, create item drafts from images/product candidates, save outfit-photo worn logs, and learn from feedback. It cannot reliably perform many expected app actions by command, such as changing laundry state, editing closet records, planning arbitrary dates, changing preferences, generating reminders, or making product recommendations with purchasable links.
- TypeScript is currently failing for one route (`/(tabs)/laundry` in Home), so the app is not in a clean typed state.
- There are many dev logs and lint warnings. They are not fatal, but they make the codebase feel pre-production.
- The visual system is inconsistent. The premium glass language exists, but item details, profile subpages, tool shells, alerts, and some modal sheets use basic inline styles, system alerts, old white/gray constants, or route headers.

The product can become much more premium without a rewrite by tightening navigation, replacing placeholder tools, making AURA actions explicit and reliable, and standardizing the design primitives.

## 2. Top 10 Urgent Fixes

1. Fix the TypeScript failure in `app/(tabs)/index.tsx`: `router.push("/(tabs)/laundry")` is not a valid typed route. Use `/laundry` or align the route registration.
2. Remove or hide UI-only tool surfaces: `app/packing.tsx`, `app/studio.tsx`, `app/insights/gaps.tsx`, and parts of `app/insights/index.tsx`/`unworn.tsx`.
3. Wire disabled Closet bulk actions or remove them: Edit Tags / Bulk Edit, Add to Collection, Plan to Calendar, Archive / Hide.
4. Add true AURA action integrations for laundry, closet edits, planner date selection, saved looks, and profile preferences instead of only sending follow-up prompts.
5. Standardize back/close behavior across hidden tab routes, top-level tool routes, modals, and item detail. Some routes use `router.back`, some replace to tabs, some use Stack headers, some custom buttons.
6. Replace production-facing `Alert.alert` feedback with premium AURA toast/sheet patterns for common success/error states.
7. Make profile settings honest: notifications, closet preferences, subscription, billing, and delete account disclose “not wired” in the UI or move to a future section.
8. Fix dark-mode readability in item detail editable fields, color warnings, and static style constants.
9. Add robust empty/error states for no internet, permission denied, image upload failure, failed ingestion, empty chat, empty planner, and empty closet.
10. Remove dev logging or guard it consistently behind `__DEV__`/debug flags across Add Item, Closet, Item Detail, AURA, image processing, and outfit saves.

## 3. Screen-by-Screen Audit

### Auth and Onboarding

Files: `app/(auth)/*`, `src/components/auth/AuthScaffold.tsx`, `app/(onboarding)/index.tsx`, `app/_layout.tsx`.

- Functional status: Partially working.
- Good: Auth gate is real, branded loading screen is polished, Google/Apple/email flows are implemented, onboarding saves `onboardingCompleted`.
- Problems:
  - Auth errors use system alerts, not branded UI.
  - Login injects web CSS by hand, which is brittle and indicates design-system gaps.
  - Onboarding gathers useful fit/style/category data, but later surfaces only partially honor it.
  - Permission/network failure states are generic.
  - Users can be repeatedly revalidated through onboarding in `app/_layout.tsx`; this is sensible, but failures default to onboarding incomplete, which may trap users if profile loading fails.

### Navigation and Tab Bar

Files: `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `src/components/FloatingGlassTabBar.tsx`, `src/constants/dock.ts`, `src/components/SafeScreen.tsx`.

- Functional status: Partially working.
- Good: Floating glass tab bar is premium, keyboard-hide is enabled, hidden routes keep source tab context for item details.
- Problems:
  - Typed route mismatch for laundry breaks `npx tsc --noEmit`.
  - `app/(tabs)/_layout.tsx` registers `laundry`, but the actual shown file list includes top-level `app/laundry.tsx` exporting `./(tabs)/laundry`; this route shape is confusing.
  - There are duplicate tab-bar files: `components/FloatingGlassTabBar.tsx` re-exports `src/components/FloatingGlassTabBar.tsx`.
  - Back/close patterns vary: text “Back”, icon close, Stack header back, `router.replace("/(tabs)")`, `router.back()`.
  - Safe-area and dock padding are manually handled per screen; most are okay, but the approach is easy to regress and sometimes over-pads.

### Home

Files: `app/(tabs)/index.tsx`, `src/components/home/*`, `src/components/closet/MinimumClosetProgressCard.tsx`.

- Functional status: Partially working.
- Good: Home has a clear “Today’s Look” direction, quick outcomes, minimum closet progress, recent items, latest chat, latest saved/AURA look, and smart tools.
- Problems:
  - Home says “Style me now” and “3 directions”, but those actions route into chat instead of an immediate native planner/action flow.
  - The smart tool grid includes tools of very uneven maturity. Studio and Laundry are real; Insights/Packing are mostly shells.
  - `HOME_DEFERRED_FEATURES` is a non-rendered product note in app code. Useful for developers, but it signals unfinished product churn.
  - Weather copy can be informative, but Celsius-only display in parts of the app may feel odd for US users despite onboarding units.
  - The minimum closet card may duplicate the “Add pieces” message already present in Home empty states.

### Closet

Files: `app/(tabs)/closet.tsx`, `src/components/closet/*`, `src/lib/items.ts`.

- Functional status: Partially working.
- Good: Live Firestore listener, search, filters, category/subcategory grouping, quick add, product link entry, processing section, selection mode, bulk delete/favorite/laundry/available/style/share/mark worn.
- Problems:
  - Some “More” bulk actions are visibly disabled and UI-only: bulk edit, collections, calendar planning, archive/hide.
  - Product link flow sends the URL to AURA chat instead of a direct import/review flow, although a backend `importProductLink` function exists.
  - Quick add creates AURA drafts, but recovery UX depends on the processing section and stale timeout. Users need clearer “what happened” and retry explanations.
  - No obvious duplicate handling in the UI.
  - Filters do not honor `profile.closetPreferences.hideLaundryByDefault` or `defaultSort`.
  - Grid cards are nice, but long names/brands are aggressively truncated and status text is raw-ish (`IN LAUNDRY`).
  - Selection mode is useful but dense and could occlude top controls on small phones.

### Item Detail

Files: `app/(tabs)/item/[id].tsx`, `src/lib/itemImage.ts`, `src/lib/items.ts`.

- Functional status: Partially working.
- Good: Live item snapshot, image carousel/modal, quick facts, AI details, color correction, pattern/material edits, mark worn/laundry/washed/delete.
- Problems:
  - Visual language is noticeably less premium than Home/Closet. Many styles are old static constants (`#ddd`, `#fff`, bare text buttons).
  - TextInputs do not consistently set `color`/`placeholderTextColor`, risking dark-mode readability.
  - Uses system `Alert.alert` for overflow actions, delete, wash confirmation, and errors.
  - “Reset to AI” refuses if ingestion is already done, so there is no clear way to re-run extraction after manual edits.
  - Failed ingestion only says “Couldn't analyze, you can edit manually”; no retry action is shown here.
  - Back behavior replaces source tabs when `sourceTab` exists, which may discard stack context.

### AURA Chat

Files: `app/(tabs)/ai.tsx`, `src/components/ai/*`, `src/components/aura/AuraLookCard.tsx`, `src/lib/aura.ts`, `src/lib/auraAttachments.ts`, `src/lib/aiChats.ts`, `functions/src/askAuraStream.ts`.

- Functional status: Partially working.
- Good: Real chat threads, cache, drawer, streaming with fallback, text/image/audio attachment support, candidate item cards, outfit cards, saved looks, planning for today, feedback logging, image outfit analysis actions.
- Problems:
  - Empty state is visually almost blank (`<View height=24>`), so a new user does not know what AURA can do.
  - `onSaveOutfit={() => {}}` is passed for legacy outfit messages; any old `OutfitMessage` save button may be dead.
  - “Projects” in the drawer is coming soon.
  - AURA actions are narrow. It can save/plan today/create drafts, but many expected app operations are only prompts.
  - Product recommendation/shopping is a brief generator, not a real product discovery/affiliate/link flow.
  - Structured multi-look generation has substantial frontend fallback/repair logic, including outerwear repair. That can make AURA appear confident while hiding backend limitations.
  - Error feedback is a system message plus sometimes an alert; no retry button on failed assistant turns.
  - Voice requires native support and may fail with a plain alert.

### Calendar / Planner

Files: `app/(tabs)/calendar.tsx`, `src/components/calendar/*`, `src/utils/dailyOutfits.ts`, `src/utils/outfitPlanning.ts`.

- Functional status: Partially working.
- Good: Date rail, range status subscription, weather/events hooks, generated daily looks, plan/copy/clear/swap/mark worn, worn streak.
- Problems:
  - Planner generation appears local/rule-based (`generateDailyPlan`) rather than AURA/server-backed.
  - Planned outfits are stored under `users/{uid}/outfits/{dateKey}` and sync to Home, but AURA “plan for today” only targets today, not arbitrary dates.
  - Mark worn checks laundry/max wears only for today. Past/future behavior is less strict.
  - Swap options exclude laundry, but initial generated looks depend on `generateDailyPlan` correctness.
  - Empty past day has a “Plan an outfit” CTA that only sets selected look id and may not obviously create a plan.
  - Date picker dependency is optional; if unavailable, the sheet shows a dead-ish message.
  - Some copy uses Celsius and generic weather labels, not user units.

### Laundry

Files: `app/(tabs)/laundry.tsx`, `app/laundry.tsx`, `src/lib/items.ts`.

- Functional status: Mostly working.
- Good: Dedicated status buckets, single-item status updates, bulk move needs-wash to laundry, bulk mark laundry clean.
- Problems:
  - Home route type is broken.
  - Empty state says “Tell AURA what you washed,” but AURA does not have a wired laundry command integration.
  - Back uses `router.replace("/(tabs)")`, which can feel abrupt.
  - The three status cards may be tight on small devices; long labels are constrained to one line.

### Profile / Settings

Files: `app/(tabs)/profile.tsx`, `app/profile/*`, `src/profile/screens.tsx`, `src/lib/userProfile.ts`.

- Functional status: Partially working.
- Good: Profile hub, account profile, avatar upload, default sizes, body/fit, style preferences, units, my looks, memory clearing, export/share.
- Problems:
  - Notifications screen says “Saved now for later. Not yet wired into reminders.” It is UI-only.
  - Closet preferences screen says “Saved now for later. Not yet wired into sorting/filtering.” It is UI-only.
  - Subscription/billing are coming soon.
  - Delete account explicitly does not delete backend closet data. This is a serious privacy/product gap.
  - Profile subpages are functional but visually basic and alert-heavy.
  - There are two style profile concepts: `UserProfilePreferences` and `StyleProfile`/learned memory. The mapping exists but is easy to desync.

### Add Item / Ingestion

Files: `app/(tabs)/add.tsx`, `src/addItem/*`, `src/lib/uploadImage.ts`, `src/lib/visualNormalization.ts`, `src/lib/cutoutNormalize.ts`, `functions/src/ingestItemFromPhotos.ts`, `functions/src/generateCleanedProductImages.ts`.

- Functional status: Partially working.
- Good: Multi-step wizard, edit mode, photo step, draft sync, AI extraction, background removal/cutout, duplicate last item, profile default sizes.
- Problems:
  - Care tags are explicitly “coming soon.”
  - Lots of lifecycle complexity and hook dependency lint warnings in extraction; stale closures are a risk.
  - Failure recovery is spread across Add Item and Closet Processing instead of one clear retry/edit/delete flow.
  - Duplicate detection is not visible.
  - Upload/background-removal failures mostly become alerts/toasts, not rich recovery states.
  - The footer and keyboard padding are heavily manual; small-phone keyboard overlap needs device testing.

### Studio

Files: `app/(tabs)/studio.tsx`, `app/studio.tsx`.

- Functional status: Partially working for tab Studio; UI-only for top-level Studio.
- Good: The tab Studio is a real manual outfit builder using closet items, AuraLookCard preview, save look, plan today, ask AURA.
- Problems:
  - There is a separate top-level `app/studio.tsx` that is a placeholder shell. Home routes to `/studio`, not the tab route, so users may hit the wrong Studio.
  - The tab Studio only plans for today.
  - No drag/reorder/swipe affordances despite “Studio” implying a board/editor.
  - Selection is tap-based only; no search/filter beyond category chips.

### Insights and Packing

Files: `app/insights/*`, `app/packing.tsx`, `src/components/tools/ToolScreenScaffold.tsx`.

- Functional status: UI-only / not wired.
- Problems:
  - Wardrobe gaps are hardcoded cards.
  - Unworn says real rotation data will come later.
  - Most worn and Color balance cards in Insights have no `onPress`.
  - Packing fields are static cards and “Build capsule” has no action.
  - These screens lower trust because Home presents them as live tools.

## 4. Broken or Non-Functional Features

- Broken: app TypeScript check fails in `app/(tabs)/index.tsx` at the laundry route.
- Broken/confusing: Home `Studio` opens top-level `/studio`, which is a placeholder, while the real builder is `/(tabs)/studio`.
- UI-only: Packing.
- UI-only: Insights gap cards and unworn preview.
- UI-only: Profile notifications.
- UI-only: Profile closet preferences.
- UI-only: Profile subscription/billing.
- UI-only: AURA drawer “Projects.”
- UI-only/disabled: Closet bulk edit, collection, plan to calendar, archive/hide.
- Missing privacy completion: Delete account does not delete backend user data.
- Partially wired: Product link import is routed through chat even though a backend function exists.
- Partially wired: AURA shopping/missing pieces produces a brief, not product recommendations.
- Partially wired: AURA planner actions only plan today.

## 5. UI Inconsistencies

- Card radius varies from 12 to 28+ across screens. Premium areas use large glass cards; settings/item detail use basic bordered rectangles.
- Accent colors vary: purple, cream, pink/lavender, white CTAs, red warnings, and older `#ddd`/`#fff` constants are mixed.
- System alerts are used for core product actions instead of branded sheets/toasts.
- Header patterns vary across tab screens, Stack screens, custom back rows, and modal sheets.
- Icons are mixed across Ionicons, MaterialCommunity-like names, text symbols (`⋯`, `←`, hearts/stars in My Looks), and custom AURA mark.
- Tool shell screens use basic cards and buttons that do not match the rich Home/AURA surfaces.
- Some button disabled states are just opacity; others have no explanation.
- Typography is inline and inconsistent, especially in profile/settings/item detail.
- Some screens use route headers (`Stack.Screen`) while the main app hides headers.
- Warm/cream board backgrounds appear in outfit previews, while the rest is dark glass; this can work, but the transitions need more intentional framing.

## 6. Missing Empty, Loading, and Error States

- AURA empty state should explain capabilities with 3-5 real action chips and attachment examples.
- AURA failed response should show Retry / Edit prompt / Report problem.
- Closet empty state should include direct photo, camera, link, and manual actions.
- Closet filtered empty state should show active filters and a clear-filters CTA.
- Add Item failed ingestion should show retry extraction, edit manually, remove draft.
- Product link failure should preserve URL and allow retry.
- Image upload failure should keep selected assets and offer retry/remove.
- Permission denied states should offer Settings deep link where possible.
- No internet/backend unavailable states are not consistently represented.
- Calendar no-closet state should not pretend to generate useful looks.
- Insights/Packing should either be hidden or show honest “not available yet” with a single route back to AURA.
- Missing item images need a more premium placeholder with category/color/brand context.

## 7. AURA Action Integration Gaps

AURA can currently:

- Save a look.
- Plan a look for today.
- Like/dislike/more/less feedback.
- Create closet drafts from images/product candidates.
- Analyze an outfit photo and save it as worn today.
- Add detected outfit pieces as drafts.
- Route prompts from Home/Closet/Studio.

AURA cannot yet reliably:

- Move specific items to laundry or mark them clean by natural language.
- Edit closet item fields like color, category, size, brand, tags, image, or notes.
- Delete/archive closet items with confirmation.
- Plan outfits for arbitrary dates or trip ranges.
- Swap planner items directly from chat.
- Read/write notification preferences.
- Use closet preferences like hidden laundry/default sort.
- Create collections/capsules.
- Run real product recommendations with links, prices, sizes, and availability.
- Create reminders.
- Explain and execute account/privacy actions.

## 8. Data and Model Issues

- `ClothingStatus` and `LaundryStatus` coexist with legacy mapping. This works but increases bugs unless backfilled everywhere.
- Wear logic uses `MAX_WEARS_BEFORE_WASH = 2`, while `normalizeLaundryStatus` marks needs-wash at `>= 3`; this threshold mismatch should be reviewed.
- Planned outfits store category item IDs only; analyzed outfit photos store detected pieces under `wornOutfit` with empty `itemsByCategory`, which may break consumers expecting IDs.
- Product link backend exists (`importProductLink`) but frontend primarily starts a chat prompt.
- `UserProfilePreferences`, `StyleProfile`, learned memory, assistant memory, and AURA memory overlap. Save paths need a single source-of-truth map.
- Several profile settings are saved but not consumed.
- Generated planner looks are local and may not use the same outfit engine as AURA chat/swipe.
- Many image fields exist (`photoUrl`, `originalImageUrl`, `cleanedImageUrl`, `photos.*`, `images[]`), requiring normalization discipline.

## 9. Performance Concerns

- Heavy inline styles and large screens may re-render more than needed; many screens create object styles on every render.
- AURA chat message rendering can be expensive with image-heavy look cards and FlatList autoscroll.
- Add Item extraction hooks are complex and have hook dependency warnings.
- Closet renders category sections with many cards in ScrollView rather than virtualized section lists.
- Studio renders all filtered items in a wrapping View, not a virtualized grid.
- Calendar subscribes to a 121-day date range and all items; acceptable for small closets but should be watched.
- Many console logs can slow dev and pollute production diagnostics if not guarded.

## 10. Suggested Premium UI Upgrades

- Create one `AuraScreenHeader`, `AuraBottomSheet`, `AuraActionRow`, `AuraEmptyState`, `AuraErrorState`, and `AuraConfirmSheet`.
- Replace routine `Alert.alert` with branded sheets/toasts.
- Give AURA chat a real empty state: “Style me today,” “Add from photo,” “Plan Friday,” “Fix this outfit,” “What should I buy?”
- Turn disabled buttons into either hidden actions or “Coming later” tooltips/sheets.
- Add skeletons for Home, Closet cards, AURA look cards, Add Item extraction, and Profile looks.
- Add press/haptic consistency through `AuraPressable`.
- Use real icon buttons for back/close/more instead of text where possible.
- Standardize card radius and color tokens; remove old `#ddd`, `#fff`, `#d11` constants from dark screens.
- Make tool screens feel like real workspaces or hide them until wired.
- Add confidence/progress UI for ingestion so users trust the AI extraction.

## 11. Prioritized Roadmap

### Fix Today

- Fix TypeScript route failure for laundry.
- Route Home Studio to the real builder or remove the placeholder top-level Studio.
- Hide or label UI-only Home tools.
- Remove visible disabled Closet bulk actions or wire one obvious action: Plan to Calendar.
- Add AURA empty state with real quick actions.
- Guard/remove dev logs in production-facing files.
- Fix Item Detail dark TextInput styles and warning colors.

### Fix This Week

- Build branded confirm/error sheets and replace high-volume alerts.
- Wire product link quick add directly to `importProductLink` or a dedicated review flow.
- Add retry/edit/remove recovery to failed ingestion in Item Detail and Closet Processing.
- Make AURA perform laundry updates and planner-date updates via explicit client-side tool/action handlers.
- Apply profile closet preferences to Closet default sort and hide-laundry behavior.
- Wire Insights Unworn and Gaps to real closet data.
- Add no-network/backend-error states for AURA, Closet, Add Item, and Calendar.

### Later Polish

- Virtualize Closet and Studio grids for large wardrobes.
- Consolidate design tokens and remove inline one-off styles.
- Add gesture affordances to Studio.
- Improve planner weather/units and arbitrary-date planning from AURA.
- Add duplicate detection and merge flow in ingestion.
- Add richer microinteractions, skeleton loading, and card reveal consistency.

### Future Premium Features

- AURA action framework with explicit permissions and confirmations.
- Trip packing capsule builder.
- Product recommendations with live links, sizes, prices, and wardrobe-gap rationale.
- Collections/capsules/lookbooks.
- Notification/reminder system for laundry, planned outfits, and underused pieces.
- Full privacy controls: complete account/data deletion, export files, consent audit.
- Personalized wardrobe health dashboard.

## Verification Results

- `npm run lint`: completed with 11 warnings, 0 errors.
- `npx tsc --noEmit`: failed with a typed route error in `app/(tabs)/index.tsx`.
- `cd functions && npm run build`: completed successfully.
