import { GoogleAuthProvider, getAdditionalUserInfo, signInWithPopup } from "firebase/auth";

import { saveNewUserProfile } from "@/src/auth/userProfile";
import { auth } from "@/src/lib/firebase";

export function configureGoogleSignIn(): void {
  return;
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(auth, provider);
  const additionalUserInfo = getAdditionalUserInfo(result);

  if (additionalUserInfo?.isNewUser) {
    await saveNewUserProfile(result.user.uid, result.user.displayName, result.user.email);
  }
}

export async function signOutGoogle(): Promise<void> {
  return;
}
