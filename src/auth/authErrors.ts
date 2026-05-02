export function getAuthErrorMessage(error: unknown): string {
  const code = (error as { code?: string; name?: string })?.code ?? (error as { name?: string })?.name;
  const normalizedCode = String(code ?? "").replace(/^auth\//, "");

  switch (normalizedCode) {
    case "SIGN_IN_CANCELLED":
      return "Sign in cancelled";
    case "IN_PROGRESS":
      return "Sign in already in progress";
    case "PLAY_SERVICES_NOT_AVAILABLE":
      return "Google Play Services not available";
    case "1001":
    case "ERR_REQUEST_CANCELED":
      return "Sign in cancelled";
    case "account-exists-with-different-credential":
      return "An account already exists with this email. Please sign in with your original method.";
    case "invalid-email":
      return "Enter a valid email address.";
    case "invalid-credential":
    case "wrong-password":
    case "user-not-found":
      return "Email or password is incorrect.";
    case "email-already-in-use":
      return "That email is already registered.";
    case "weak-password":
      return "Use at least 6 characters.";
    case "user-disabled":
      return "This account has been disabled.";
    case "network-request-failed":
      return "Network issue. Try again.";
    case "too-many-requests":
      return "Too many attempts. Please wait a moment.";
    default:
      return "Sign in failed. Please try again.";
  }
}
