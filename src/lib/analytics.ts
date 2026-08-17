import Constants from "expo-constants";
import { Platform } from "react-native";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { auth, db } from "@/src/lib/firebase";

export type LaunchAnalyticsEventName =
  | "app_opened"
  | "app_error"
  | "unhandled_promise_rejection"
  | "auth_signed_up"
  | "auth_sign_in_succeeded"
  | "onboarding_completed"
  | "wardrobe_item_added"
  | "wardrobe_item_updated"
  | "wardrobe_item_save_failed"
  | "photo_upload_failed"
  | "ai_request_started"
  | "ai_response_succeeded"
  | "ai_response_failed"
  | "aura_agent_action_succeeded"
  | "outfit_generated"
  | "wardrobe_recommendations_generated";

type AnalyticsPrimitive = string | number | boolean | null;
export type AnalyticsProperties = Record<
  string,
  AnalyticsPrimitive | AnalyticsPrimitive[] | Record<string, AnalyticsPrimitive>
>;

type TrackLaunchEventInput = {
  userId?: string | null;
  eventName: LaunchAnalyticsEventName;
  properties?: AnalyticsProperties;
};

type ErrorUtilsLike = {
  getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

const MAX_STRING_LENGTH = 240;
let globalErrorTrackingInstalled = false;
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function trimString(value: string) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > MAX_STRING_LENGTH ? `${trimmed.slice(0, MAX_STRING_LENGTH - 3)}...` : trimmed;
}

function sanitizePrimitive(value: unknown): AnalyticsPrimitive | undefined {
  if (value == null) return null;
  if (typeof value === "string") return trimString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  return undefined;
}

function sanitizeProperties(properties?: AnalyticsProperties) {
  const sanitized: AnalyticsProperties = {};
  Object.entries(properties ?? {}).forEach(([key, value]) => {
    const cleanKey = trimString(key).slice(0, 64);
    if (!cleanKey) return;

    if (Array.isArray(value)) {
      sanitized[cleanKey] = value.slice(0, 20).map((entry) => sanitizePrimitive(entry) ?? null);
      return;
    }

    if (value && typeof value === "object") {
      const nested: Record<string, AnalyticsPrimitive> = {};
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        const cleanNestedKey = trimString(nestedKey).slice(0, 64);
        const cleanValue = sanitizePrimitive(nestedValue);
        if (cleanNestedKey && cleanValue !== undefined) nested[cleanNestedKey] = cleanValue;
      });
      sanitized[cleanKey] = nested;
      return;
    }

    const cleanValue = sanitizePrimitive(value);
    if (cleanValue !== undefined) sanitized[cleanKey] = cleanValue;
  });
  return sanitized;
}

function nativeBuildVersion() {
  if (Platform.OS === "ios") return Constants.expoConfig?.ios?.buildNumber ?? null;
  if (Platform.OS === "android") return Constants.expoConfig?.android?.versionCode ?? null;
  return null;
}

export function analyticsErrorProperties(error: unknown): AnalyticsProperties {
  if (error instanceof Error) {
    return {
      errorName: error.name || "Error",
      errorMessage: error.message || "Unknown error",
      errorStack: error.stack ? trimString(error.stack) : null,
    };
  }
  return {
    errorName: "UnknownError",
    errorMessage: trimString(String(error ?? "Unknown error")),
  };
}

export async function trackLaunchEvent({
  userId,
  eventName,
  properties,
}: TrackLaunchEventInput) {
  if (!userId) return;
  const timestamp = Date.now();
  try {
    await addDoc(collection(db, "users", userId, "launchEvents"), {
      type: eventName,
      eventName,
      userId,
      sessionId,
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? null,
      buildNumber: nativeBuildVersion(),
      timestamp,
      properties: sanitizeProperties(properties),
      createdAt: serverTimestamp(),
    });
  } catch {
    // Launch tracking should never block user-facing flows.
  }
}

export function trackCurrentUserEvent(
  eventName: LaunchAnalyticsEventName,
  properties?: AnalyticsProperties
) {
  void trackLaunchEvent({
    userId: auth.currentUser?.uid ?? null,
    eventName,
    properties,
  });
}

export function installGlobalErrorTracking() {
  if (globalErrorTrackingInstalled) return;
  globalErrorTrackingInstalled = true;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (errorUtils?.setGlobalHandler) {
    const previousHandler = errorUtils.getGlobalHandler?.();
    errorUtils.setGlobalHandler((error, isFatal) => {
      trackCurrentUserEvent("app_error", {
        fatal: Boolean(isFatal),
        ...analyticsErrorProperties(error),
      });
      previousHandler?.(error, isFatal);
    });
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
      trackCurrentUserEvent("unhandled_promise_rejection", {
        ...analyticsErrorProperties(event.reason),
      });
    });
  }
}
