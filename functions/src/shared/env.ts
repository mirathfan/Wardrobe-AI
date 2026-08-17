import { HttpsError } from "firebase-functions/v2/https";

export function requireOpenAiApiKey() {
  const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "OPENAI_API_KEY is not configured for Firebase Functions.",
      { code: "missing_openai_api_key" },
    );
  }
  return apiKey;
}
