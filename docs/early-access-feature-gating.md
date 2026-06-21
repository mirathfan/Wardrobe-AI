# Early Access Feature Gating

Use Firebase Console to enable expensive AURA AI features for a specific account.

## Grant Access

1. Open Firebase Console.
2. Go to Firestore Database.
3. Find `users/{uid}` for the account.
4. Set `betaRole` to `"power"`.
5. Set `featureAccess.aiPolish` to `true`.
6. Set `featureAccess.outfitExtraction` to `true`.

The app treats missing `betaRole` as `"standard"` and missing `featureAccess` as no enabled expensive AI features.

## Usage Document

Monthly usage is stored at:

```text
users/{uid}/usage/earlyAccess
```

Expected fields:

```json
{
  "periodKey": "2026-06",
  "aiPolishUsed": 0,
  "outfitExtractionUsed": 0,
  "updatedAt": "server timestamp"
}
```
