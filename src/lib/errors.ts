import { FunctionsError } from "firebase/functions";

import { earlyAccessErrorMessage, isEarlyAccessError } from "@/src/lib/earlyAccess";

const RATE_LIMIT_ERROR_CODE = "functions/resource-exhausted";

export function isRateLimitError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as FunctionsError).code === RATE_LIMIT_ERROR_CODE
  );
}

export function getFriendlyErrorMessage(error: unknown): string {
  if (isEarlyAccessError(error)) {
    return earlyAccessErrorMessage(error);
  }
  if (isRateLimitError(error)) {
    return "You're going a bit fast — please wait a moment and try again.";
  }
  return "Something went wrong. Please try again.";
}
