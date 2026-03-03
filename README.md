# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

### iOS background removal note

This app includes a local native Expo module (`modules/expo-vision-bg`) that uses Apple Vision (`VNGenerateForegroundInstanceMaskRequest`) for on-device background removal on iOS 17+.
It requires a Development Build; Expo Go will not load this native module.

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Wardrobe Ingestion v1

- Items stay multi-tenant under `users/{uid}/items/{itemId}`.
- On create/update of an item doc, Cloud Functions v2 (`ingestItemFromPhotos`) checks for photo URLs and `ingestion.status`.
- The function writes `ingestion.status: processing`, calls OpenAI with the primary photo, validates taxonomy (`category/subCategory`), normalizes colors/pattern/material/scores, then writes `ingestion.status: done`.
- Loop safety: it stores `ingestion.lastProcessedPhotoHash` and skips unchanged photos.
- Retry safety: failed ingestions are not retried more than once per hour unless a new photo is added.
- If AI fails, item remains usable and `ingestion.status: failed` with error details.

### Local verification checklist

1. Create an item with a photo in the app, then confirm Firestore item has `ingestion.status: done` plus `category/subCategory/colors/pattern/material/formalityScore/warmthScore`.
2. Update the same item with a new photo and confirm ingestion reruns once and updates extracted fields.
3. Open AI outfits and confirm generation still works with no runtime errors.
4. Confirm function logs show no repeated processing loop for unchanged photo hashes.

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Firebase Storage Rules (Example)

Use rules like this so each authenticated user can only access their own files under `users/{uid}/**`:

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

If upload fails with a permission error, verify your Storage rules and that the app is signed in before uploading.

## Firestore Rules (Example)

Use rules like this so each authenticated user can only read/write their own `users/{uid}` documents and nested collections (including `items` and `outfits`):

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```
