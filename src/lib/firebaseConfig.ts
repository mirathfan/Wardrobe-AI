import type { FirebaseOptions } from "firebase/app";

export type FirebaseEnvVarName =
  | "EXPO_PUBLIC_FIREBASE_API_KEY"
  | "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN"
  | "EXPO_PUBLIC_FIREBASE_PROJECT_ID"
  | "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET"
  | "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
  | "EXPO_PUBLIC_FIREBASE_APP_ID";

export type PublicEnvDiagnosticName =
  | FirebaseEnvVarName
  | "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"
  | "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID";

export const REQUIRED_FIREBASE_ENV_VARS: readonly FirebaseEnvVarName[] = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
] as const;

export const DIAGNOSTIC_PUBLIC_ENV_VARS: readonly PublicEnvDiagnosticName[] = [
  ...REQUIRED_FIREBASE_ENV_VARS,
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
] as const;

const publicEnvValues: Record<PublicEnvDiagnosticName, string | undefined> = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
};

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

export type FirebaseEnvDiagnostic = {
  name: PublicEnvDiagnosticName;
  requiredForLaunch: boolean;
  present: boolean;
  length: number;
  valid: boolean;
  checks: Record<string, boolean>;
};

function isDevBuild() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function envValue(name: PublicEnvDiagnosticName) {
  return String(publicEnvValues[name] ?? "").trim();
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

function isGoogleClientIdValid(value: string) {
  if (isPlaceholder(value)) return false;
  return /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
}

function diagnosticChecks(name: PublicEnvDiagnosticName, value: string): Record<string, boolean> {
  switch (name) {
    case "EXPO_PUBLIC_FIREBASE_API_KEY":
      return { startsWithAIza: value.startsWith("AIza") };
    case "EXPO_PUBLIC_FIREBASE_APP_ID":
      return {
        containsIosAppId: value.includes(":ios:"),
        containsWebAppId: value.includes(":web:"),
      };
    case "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN":
    case "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET":
      return { hostShape: hasValidHostShape(value) };
    case "EXPO_PUBLIC_FIREBASE_PROJECT_ID":
      return { projectIdShape: hasValidProjectIdShape(value) };
    case "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID":
      return { numeric: /^\d{6,}$/.test(value) };
    case "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID":
    case "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID":
      return { googleClientIdShape: isGoogleClientIdValid(value) };
    default:
      return {};
  }
}

function isDiagnosticValid(name: PublicEnvDiagnosticName, value: string) {
  if (!value || isPlaceholder(value)) return false;
  if (REQUIRED_FIREBASE_ENV_VARS.includes(name as FirebaseEnvVarName)) {
    return !isInvalid(name as FirebaseEnvVarName, value);
  }
  return isGoogleClientIdValid(value);
}

export function getFirebaseEnvDiagnostics(): FirebaseEnvDiagnostic[] {
  return DIAGNOSTIC_PUBLIC_ENV_VARS.map((name) => {
    const value = envValue(name);
    return {
      name,
      requiredForLaunch: REQUIRED_FIREBASE_ENV_VARS.includes(name as FirebaseEnvVarName),
      present: value.length > 0,
      length: value.length,
      valid: isDiagnosticValid(name, value),
      checks: diagnosticChecks(name, value),
    };
  });
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
export const firebaseEnvDiagnostics = getFirebaseEnvDiagnostics();

export function logFirebaseConfigProblem(status: FirebaseConfigStatus) {
  if (status.ok) return;

  if (isDevBuild()) {
    console.error("[Firebase] Missing or invalid required app configuration.", {
      missingEnvVars: status.missingEnvVars,
      invalidEnvVars: status.invalidEnvVars,
      diagnostics: firebaseEnvDiagnostics,
    });
    return;
  }

  console.error("[Firebase] Missing or invalid required app configuration.", {
    missingRequiredCount: status.missingEnvVars.length,
    invalidRequiredCount: status.invalidEnvVars.length,
  });
}
