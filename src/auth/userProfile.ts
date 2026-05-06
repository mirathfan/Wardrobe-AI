import {
  EMPTY_USER_PROFILE_PREFERENCES,
  saveUserAccountProfile,
  saveUserProfilePreferences,
} from "@/src/lib/userProfile";

function firstNameFromDisplayName(displayName: string | null | undefined) {
  return displayName?.trim().split(/\s+/)[0] ?? null;
}

export async function saveNewUserProfile(
  uid: string,
  displayName: string | null | undefined,
  email: string | null | undefined,
) {
  const normalizedDisplayName = displayName?.trim() || null;
  const firstName = firstNameFromDisplayName(normalizedDisplayName) ?? email?.split("@")[0]?.trim() ?? null;

  await Promise.all([
    saveUserAccountProfile(uid, {
      name: normalizedDisplayName,
      displayName: normalizedDisplayName,
    }),
    saveUserProfilePreferences(uid, {
      ...EMPTY_USER_PROFILE_PREFERENCES,
      displayName: normalizedDisplayName,
      firstName,
      onboardingCompleted: false,
    }),
  ]);
}
