export function getAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string; name?: string })?.code ?? (error as { name?: string })?.name;

  switch (code) {
    case "SIGN_IN_CANCELLED":
      return "Sign in cancelled";
    case "IN_PROGRESS":
      return "Sign in already in progress";
    case "PLAY_SERVICES_NOT_AVAILABLE":
      return "Google Play Services not available";
    case "1001":
    case "ERR_REQUEST_CANCELED":
      return "Sign in cancelled";
    case "auth/account-exists-with-different-credential":
      return "An account already exists with this email. Please sign in with your original method.";
    case "auth/invalid-credential":
      return "Sign in failed. Please try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/network-request-failed":
      return "Network error. Check your connection.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment.";
    default:
      return "Sign in failed. Please try again.";
  }
}
