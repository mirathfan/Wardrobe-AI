import type { FirebaseOptions } from "firebase/app";

export type FirebaseEnvVarName =
  | "EXPO_PUBLIC_FIREBASE_API_KEY"
  | "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"
  | "EXPO_PUBLIC_FIREBASE_PROJECT_ID"
  | "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"
  | "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  | "EXPO_PUBLIC_FIREBASE_APP_ID";

export const REQUIRED_FIREBASE_ENV_VARS: readonly FirebaseEnvVarName[] = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

type FirebaseConfigStatus =
  | {
      ok: true;
      config: FirebaseOptions;
      missingEnvVars: readonly [];
      invalidEnvVars: readonly [];
    }
  | {
      ok: false;
      config: null;
      missingEnvVars: readonly FirebaseEnvVarName[];
      invalidEnvVars: readonly FirebaseEnvVarName[];
    };

function isDevBuild() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function envValue(name: FirebaseEnvVarName) {
  return String(process.env[name] ?? "").trim();
}

function isPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null" ||
    normalized === "changeme" ||
    normalized === "todo" ||
    normalized.startsWith("your_") ||
    normalized.startsWith("replace_")
  );
}

function hasValidHostShape(value: string) {
  return /^[a-z0-9.-]+$/i.test(value) && value.includes(".") && !value.includes("://");
}

function hasValidProjectIdShape(value: string) {
  return /^[a-z0-9-]+$/i.test(value) && !value.startsWith("-") && !value.endsWith("-");
}

function isInvalid(name: FirebaseEnvVarName, value: string) {
  if (isPlaceholder(value)) return true;

  switch (name) {
    case "EXPO_PUBLIC_FIREBASE_API_KEY":
      return !/^AIza[A-Za-z0-9_-]{20,}$/.test(value);
    case "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN":
      return !hasValidHostShape(value);
    case "EXPO_PUBLIC_FIREBASE_PROJECT_ID":
      return !hasValidProjectIdShape(value);
    case "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET":
      return !hasValidHostShape(value);
    case "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID":
      return !/^\d{6,}$/.test(value);
    case "EXPO_PUBLIC_FIREBASE_APP_ID":
      return !/^1:\d+:[a-z]+:[A-Za-z0-9_-]+$/i.test(value);
    default:
      return true;
  }
}

function buildFirebaseConfigStatus(): FirebaseConfigStatus {
  const values = REQUIRED_FIREBASE_ENV_VARS.reduce<Record<FirebaseEnvVarName, string>>(
    (acc, name) => {
      acc[name] = envValue(name);
      return acc;
    },
    {
      EXPO_PUBLIC_FIREBASE_API_KEY: "",
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "",
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: "",
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: "",
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "",
      EXPO_PUBLIC_FIREBASE_APP_ID: "",
    },
  );

  const missingEnvVars = REQUIRED_FIREBASE_ENV_VARS.filter((name) => !values[name]);
  const invalidEnvVars = REQUIRED_FIREBASE_ENV_VARS.filter(
    (name) => values[name] && isInvalid(name, values[name]),
  );

  if (missingEnvVars.length || invalidEnvVars.length) {
    return {
      ok: false,
      config: null,
      missingEnvVars,
      invalidEnvVars,
    };
  }

  return {
    ok: true,
    config: {
      apiKey: values.EXPO_PUBLIC_FIREBASE_API_KEY,
      authDomain: values.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: values.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: values.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: values.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: values.EXPO_PUBLIC_FIREBASE_APP_ID,
    },
    missingEnvVars: [],
    invalidEnvVars: [],
  };
}

export const firebaseConfigStatus = buildFirebaseConfigStatus();

export function logFirebaseConfigProblem(status: FirebaseConfigStatus) {
  if (status.ok) return;

  if (isDevBuild()) {
    console.error("[Firebase] Missing or invalid required app configuration.", {
      missingEnvVars: status.missingEnvVars,
      invalidEnvVars: status.invalidEnvVars,
    });
    return;
  }

  console.error("[Firebase] Missing or invalid required app configuration.");
}
