import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { OAuthProvider, getAdditionalUserInfo, signInWithCredential } from "firebase/auth";

import { auth } from "@/src/lib/firebase";
import { saveNewUserProfile } from "@/src/auth/userProfile";

function createRawNonce() {
  return Array.from(Crypto.getRandomBytes(32))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signInWithApple(): Promise<void> {
  const rawNonce = createRawNonce();
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!appleCredential.identityToken) {
    throw new Error("Apple sign in failed: no identity token");
  }

  const fullName = appleCredential.fullName;
  const displayName = fullName
    ? [fullName.givenName, fullName.familyName].filter(Boolean).join(" ").trim() || null
    : null;

  const provider = new OAuthProvider("apple.com");
  const firebaseCredential = provider.credential({
    idToken: appleCredential.identityToken,
    rawNonce,
  });

  const result = await signInWithCredential(auth, firebaseCredential);
  const additionalUserInfo = getAdditionalUserInfo(result);

  if (additionalUserInfo?.isNewUser) {
    await saveNewUserProfile(result.user.uid, displayName ?? result.user.displayName, result.user.email);
  }
}
