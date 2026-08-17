# AURA TestFlight QA Fix Report

Date: 2026-05-21
Build target: TestFlight Build 4

## Root Causes Found

- Product-link wardrobe saves could inherit a prior AURA chat image because the candidate local-photo resolver fell back to the only recent chat attachment when there was one candidate and one image. Link candidates now never use chat attachment local photos.
- Product preview fallback was too permissive. A 404/error page or weak client preview could still become an "I found this item" card. Product-link previews now require a real product title and selected product image.
- Retailer titles were not fully HTML-decoded, so values such as `Men&#x27;s` surfaced in cards. Numeric HTML entities are now decoded in client and Functions extraction paths.
- Footwear detection ran too late for retailer titles that contain generic men's/women's text. Air Jordan, New Balance, Foot Locker, JD Sports, shoes, sneakers, trainers, and men's/women's shoes now map to footwear before top inference.
- "Better" follow-ups were routed to existing-outfit advice instead of generating a concrete replacement. Refinement prompts now force a new outfit card with diversity constraints.
- Streaming assistant messages were local-only until final completion. The client now persists the pending assistant placeholder, overwrites it with the final message, and recovers stale pending streams on rehydrate.
- The AURA chat bottom inset did not leave enough room for the composer plus floating dock, so outfit cards and action buttons could sit behind controls.
- Outfit-photo answers used the generic detected-outfit intro even when the user asked "What am I wearing?" Direct outfit descriptions now appear before the review card.

## Bugs Fixed

- H&M/product-link stale image regression: product-link items use only product preview image candidates.
- Aritzia/error-page preview: semantic 404/error/bot pages fail cleanly instead of creating fake item cards.
- Amazon/Foot Locker/JD Sports/Macy's/Aritzia retailer quality: added safer title cleanup, brand fallback labels, HTML entity decoding, and stricter card creation.
- Footwear categorization: shoe retailer and sneaker model cues now map to footwear/shoes.
- AURA bottom overlap: chat padding now accounts for composer height, floating dock height, safe area bottom, and extra scroll room.
- Message controls: long-press user messages for Copy/Edit and assistant/system messages for Copy/Regenerate.
- Streaming persistence: user messages and pending assistant placeholders persist before stream completion; stale pending responses show Retry.
- Better/different outfit requests: now generate concrete alternate looks and avoid recent repeated combinations.
- Outfit photo direct answer: "What am I wearing?" responds naturally first, dedupes color words, and improves displayed roles.
- Shopping recommendations: existing AURA wardrobe suggestion cards and missing-piece actions continue to expose the live shopping/search sheet without pretending exact product availability.

## Files Changed In This Pass

- `app/(tabs)/ai.tsx`
- `app/(tabs)/closet.tsx`
- `functions/src/previewProductLink.ts`
- `functions/src/shared/auraCandidatePreview.ts`
- `functions/src/shared/auraOutfitPhotoAnalysis.ts`
- `functions/src/shared/auraUrlCandidatePreview.ts`
- `functions/src/shared/productLinkExtractor.ts`
- `functions/src/shared/productUrlMetadata.ts`
- `src/components/ai/AuraReplyCard.tsx`
- `src/components/ai/ChatList.tsx`
- `src/components/ai/ChatMessage.tsx`
- `src/hooks/aura/useAuraChatHydration.ts`
- `src/lib/aiChats.ts`
- `src/lib/aura.ts`
- `src/lib/auraAttachments.ts`
- `src/lib/auraChatHelpers.ts`
- `src/lib/auraOutfitAnalysisDisplay.ts`
- `src/lib/productLinkClosetImport.ts`
- `src/types/aura.ts`

## Known Remaining Issues

- `npx expo-doctor` still warns that native folders are present, so native config in `app.json` will not auto-sync through CNG. This is not from the QA fixes, but Build 4 should be made from the current native project or the native config should be synced intentionally.
- No Sentry was added in this pass per instruction.
- Retailer scraping can still be blocked by some stores; blocked/unsupported states now fail cleanly and ask the tester to try another link, screenshot, or manual add.
- I did not redesign AURA UI; message controls use the platform alert menu to keep the chat uncluttered.

## Manual QA Checklist

- Aritzia 404: paste a known bad Aritzia product URL. Expected: no product card, friendly failure message.
- Amazon product link: paste a real Amazon product URL. Expected: decoded title, real image if readable, Add enabled only with title plus image.
- Foot Locker shoe: paste a New Balance/Air Jordan shoe URL. Expected: title apostrophes decoded and category shoes/footwear.
- JD Sports shoe: paste an Air Jordan/JD Sports URL. Expected: title apostrophes decoded and category shoes/footwear.
- Macy's product: paste a readable Macy's product URL. Expected: real title/image preview or clean unsupported failure.
- H&M stale image regression: send an outfit/photo in AURA chat, then import an H&M product link. Expected: saved closet item image matches H&M product preview, not the prior chat photo.
- Better refinement: ask for a look, then send "Better" or "make it better." Expected: concrete updated outfit card, at least one meaningful changed piece, short explanation.
- Different outfit request: ask "another" or "different." Expected: no exact repeat of the recent top/bottom/shoes combination within recent suggestions.
- What am I wearing: upload an outfit photo and ask "What am I wearing?" Expected: natural text answer first, then detected pieces card; tie/sunglasses as accessories, shoes as footwear.
- Bottom composer overlap: with no keyboard, keyboard open, long assistant response, and outfit card at the bottom, Save Look/Wear Today/Plan Today remain scrollable above the composer/dock on small and large iPhones.
- App background mid-stream: send a prompt, background/close mid-response, reopen. Expected: chat rehydrates from Firestore; completed final appears if written, otherwise pending response shows Retry.

## Checks Run

- `npx tsc --noEmit` - passed
- `npm run lint` - passed
- `npx expo-doctor` - ran, 17/18 passed; failed only the native-folder/app-config CNG warning
- `cd functions && npm run lint` - passed
- `cd functions && npm run build` - passed
- `git diff --check` - passed
