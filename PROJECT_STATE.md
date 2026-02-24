# Wardrobe-AI – Project State

## Current status (today)
- Auth: ✅ Email/password login + register
- Auth persistence: ✅ (AsyncStorage)
- Firestore: ✅ items + outfits
- Storage: ✅ photo uploads
- Platforms tested: iOS simulator ✅

## Branches
- dev: main integration branch
- feature/auth: completed + pushed

## Data model
### Firestore
/users/{uid}/items/{itemId}
- brand, name, category, colors, size, notes
- status: AVAILABLE | WORN | IN_LAUNDRY
- wearCountSinceWash, lastWornDate, lastWashedDate
- photoUrl (Storage)

 /users/{uid}/outfits/{dateKey}
- itemIds[], planned, createdAt, updatedAt

### Storage
/users/{uid}/items/{itemId}.jpg

## Security
- Firestore rules: owner-scoped + item/outfit validation (supports partial updateDoc validation)
- Storage rules: owner-scoped + image-only uploads (max 10MB)

### Deploy rules
Run from project root:
- `firebase deploy --only firestore:rules,storage`

## Known issues / tech debt
- [ ] Add proper Firestore/Storage rules
- [ ] Improve onboarding / empty state
- [ ] Add search + filters

## Next milestone
- Implement security rules + test multi-user isolation
