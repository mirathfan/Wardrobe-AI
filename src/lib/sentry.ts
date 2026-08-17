import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Sentry from "@sentry/react-native";
import type { ComponentType } from "react";
import { Platform } from "react-native";

type Scrubbable =
  | null
  | undefined
  | string
  | number
  | boolean
  | Scrubbable[]
  | { [key: string]: Scrubbable };

const SAFE_TAGS = ["app_version", "build_number", "platform", "environment"] as const;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\bhttps?:\/\/[^\s"'<>)}\]]+/gi;
const UID_KEY_RE = /^(uid|userId|user_id|firebaseUid|firebase_uid)$/i;
const SECRET_KEY_RE = /(authorization|cookie|set-cookie|token|idToken|refreshToken|firebaseToken|authToken|apiKey|secret)/i;
const URL_KEY_RE = /(productUrl|sourceUrl|imageUrl|photoUrl|downloadUrl|url|uri|href|link)$/i;
const USER_CONTENT_KEY_RE = /^(prompt|message|chatText|text|input|query|content)$/i;

let initialized = false;
let enabled = false;

function nativeBuildVersion() {
  if (Platform.OS === "ios") return Constants.expoConfig?.ios?.buildNumber ?? null;
  if (Platform.OS === "android") return Constants.expoConfig?.android?.versionCode ?? null;
  return Constants.nativeBuildVersion ?? null;
}

function sentryEnvironment() {
  const raw = process.env.EXPO_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? (__DEV__ ? "development" : "production");
  return String(raw).replace(/[^\w.-]/g, "_").slice(0, 64) || "production";
}

function safeTags() {
  return {
    app_version: String(Constants.expoConfig?.version ?? "unknown"),
    build_number: String(nativeBuildVersion() ?? "unknown"),
    platform: Platform.OS,
    environment: sentryEnvironment(),
  };
}

function scrubString(value: string) {
  return value
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(URL_RE, "[redacted-url]");
}

function hasEmailOrUrl(value: string) {
  EMAIL_RE.lastIndex = 0;
  URL_RE.lastIndex = 0;
  return EMAIL_RE.test(value) || URL_RE.test(value);
}

function looksLikeUserContent(value: string) {
  const clean = value.trim();
  if (!clean) return false;
  if (hasEmailOrUrl(clean)) return true;
  if (clean.length > 120) return true;
  return /\b(i|me|my|mine|we|our|wear|style|outfit|closet|photo|picture|link|product|please|can you|what should)\b/i.test(clean);
}

function scrubValue(value: unknown, key = "", depth = 0): Scrubbable {
  if (value == null) return value as null | undefined;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (SECRET_KEY_RE.test(key)) return "[redacted-secret]";
    if (UID_KEY_RE.test(key)) return "[redacted-id]";
    if (URL_KEY_RE.test(key)) return "[redacted-url]";
    if (USER_CONTENT_KEY_RE.test(key) && looksLikeUserContent(value)) return "[redacted-user-content]";
    return scrubString(value);
  }
  if (depth > 5) return "[redacted-depth]";
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => scrubValue(entry, key, depth + 1));
  }
  if (typeof value === "object") {
    const scrubbed: Record<string, Scrubbable> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(entryKey)) {
        scrubbed[entryKey] = "[redacted-secret]";
      } else if (UID_KEY_RE.test(entryKey)) {
        scrubbed[entryKey] = "[redacted-id]";
      } else if (URL_KEY_RE.test(entryKey)) {
        scrubbed[entryKey] = "[redacted-url]";
      } else {
        scrubbed[entryKey] = scrubValue(entryValue, entryKey, depth + 1);
      }
    }
    return scrubbed;
  }
  return scrubString(String(value));
}

function applySafeTags(event: Sentry.Event) {
  const tags = safeTags();
  event.tags = SAFE_TAGS.reduce<Record<string, string>>((acc, key) => {
    acc[key] = tags[key];
    return acc;
  }, {});
}

export function scrubSentryEvent<T extends Sentry.Event>(event: T): T {
  applySafeTags(event);

  event.message =
    typeof event.message === "string"
      ? looksLikeUserContent(event.message)
        ? "[redacted-user-content]"
        : scrubString(event.message)
      : event.message;
  event.extra = scrubValue(event.extra ?? {}, "extra") as Sentry.Event["extra"];
  event.contexts = scrubValue(event.contexts ?? {}, "contexts") as Sentry.Event["contexts"];
  event.breadcrumbs = event.breadcrumbs?.map((breadcrumb) => ({
    ...breadcrumb,
    message:
      typeof breadcrumb.message === "string"
        ? looksLikeUserContent(breadcrumb.message)
          ? "[redacted-user-content]"
          : scrubString(breadcrumb.message)
        : breadcrumb.message,
    data: scrubValue(breadcrumb.data ?? {}, "breadcrumb") as Record<string, unknown>,
  }));
  event.request = scrubValue(event.request ?? {}, "request") as Sentry.Event["request"];
  const userId = typeof event.user?.id === "string" ? event.user.id : "";
  event.user = userId.startsWith("anon_") ? { id: userId } : undefined;

  if (event.exception?.values) {
    event.exception.values = event.exception.values.map((exception) => ({
      ...exception,
      value:
        typeof exception.value === "string"
          ? looksLikeUserContent(exception.value)
            ? "[redacted-user-content]"
            : scrubString(exception.value)
          : exception.value,
    }));
  }

  return event;
}

export function initializeSentry() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  enabled = true;

  const tags = safeTags();
  Sentry.init({
    dsn,
    environment: tags.environment,
    release: `aura@${tags.app_version}+${tags.build_number}`,
    dist: tags.build_number,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    enableCaptureFailedRequests: false,
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => {
      const message =
        typeof breadcrumb.message === "string"
          ? looksLikeUserContent(breadcrumb.message)
            ? "[redacted-user-content]"
            : scrubString(breadcrumb.message)
          : breadcrumb.message;
      return {
        ...breadcrumb,
        message,
        data: scrubValue(breadcrumb.data ?? {}, "breadcrumb") as Record<string, unknown>,
      };
    },
    initialScope: {
      tags,
    },
  });
}

export function captureSafeException(error: unknown, context?: Record<string, unknown>) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext("aura", scrubValue(context, "context") as Record<string, unknown>);
    }
    Sentry.captureException(error);
  });
}

export async function setSentryUserFromUid(uid: string | null | undefined) {
  if (!enabled) return;
  if (!uid) {
    Sentry.setUser(null);
    return;
  }
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, uid);
  Sentry.setUser({ id: `anon_${digest.slice(0, 16)}` });
}

export function wrapWithSentry<P extends Record<string, unknown>>(component: ComponentType<P>) {
  return enabled ? Sentry.wrap(component) : component;
}
