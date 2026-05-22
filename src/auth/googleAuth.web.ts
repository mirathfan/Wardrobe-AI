import { GoogleAuthProvider, getAdditionalUserInfo, signInWithPopup } from "firebase/auth";

import { saveNewUserProfile } from "@/src/auth/userProfile";
import { trackLaunchEvent } from "@/src/lib/analytics";
import { auth } from "@/src/lib/firebase";

export function configureGoogleSignIn(): void {
  return;
}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const result = await signInWithPopup(auth, provider);
  const additionalUserInfo = getAdditionalUserInfo(result);
  const isNewUser = Boolean(additionalUserInfo?.isNewUser);

  if (isNewUser) {
    await saveNewUserProfile(result.user.uid, result.user.displayName, result.user.email);
    void trackLaunchEvent({
      userId: result.user.uid,
      eventName: "auth_signed_up",
      properties: {
        provider: "google",
      },
    });
  }
  void trackLaunchEvent({
    userId: result.user.uid,
    eventName: "auth_sign_in_succeeded",
    properties: {
      provider: "google",
      isNewUser,
    },
  });
}

export async function signOutGoogle(): Promise<void> {
  return;
}
