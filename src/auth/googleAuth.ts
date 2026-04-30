import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { GoogleAuthProvider, getAdditionalUserInfo, signInWithCredential } from "firebase/auth";

import { saveNewUserProfile } from "@/src/auth/userProfile";
import { auth } from "@/src/lib/firebase";

export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    offlineAccess: false,
    scopes: ["profile", "email"],
  });
}

export async function signInWithGoogle(): Promise<void> {
  await GoogleSignin.hasPlayServices({
    showPlayServicesUpdateDialog: true,
  });

  const userInfo = await GoogleSignin.signIn();
  if (userInfo.type === "cancelled") {
    const error = new Error("Sign in cancelled");
    error.name = "SIGN_IN_CANCELLED";
    throw error;
  }

  const tokens = await GoogleSignin.getTokens();
  if (!tokens.idToken) {
    throw new Error("Google sign in failed: no idToken");
  }

  const googleCredential = GoogleAuthProvider.credential(tokens.idToken);
  const result = await signInWithCredential(auth, googleCredential);
  const additionalUserInfo = getAdditionalUserInfo(result);

  if (additionalUserInfo?.isNewUser) {
    await saveNewUserProfile(result.user.uid, result.user.displayName, result.user.email);
  }
}

export async function signOutGoogle(): Promise<void> {
  try {
    if (GoogleSignin.hasPreviousSignIn() || GoogleSignin.getCurrentUser()) {
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
    }
  } catch (error) {
    console.log("[GoogleAuth] Sign out error:", error instanceof Error ? error.message : String(error));
  }
}
