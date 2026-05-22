#!/usr/bin/env node

const REQUIRED_FIREBASE_ENV_VARS = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
];

const DIAGNOSTIC_PUBLIC_ENV_VARS = [
  ...REQUIRED_FIREBASE_ENV_VARS,
  "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
];

function envValue(name) {
  return String(process.env[name] ?? "").trim();
}

function isPlaceholder(value) {
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

function hasValidHostShape(value) {
  return /^[a-z0-9.-]+$/i.test(value) && value.includes(".") && !value.includes("://");
}

function hasValidProjectIdShape(value) {
  return /^[a-z0-9-]+$/i.test(value) && !value.startsWith("-") && !value.endsWith("-");
}

function isGoogleClientIdValid(value) {
  if (isPlaceholder(value)) return false;
  return /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
}

function checksFor(name, value) {
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

function isFirebaseEnvValid(name, value) {
  if (isPlaceholder(value)) return false;

  switch (name) {
    case "EXPO_PUBLIC_FIREBASE_API_KEY":
      return /^AIza[A-Za-z0-9_-]{20,}$/.test(value);
    case "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN":
      return hasValidHostShape(value);
    case "EXPO_PUBLIC_FIREBASE_PROJECT_ID":
      return hasValidProjectIdShape(value);
    case "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET":
      return hasValidHostShape(value);
    case "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID":
      return /^\d{6,}$/.test(value);
    case "EXPO_PUBLIC_FIREBASE_APP_ID":
      return /^1:\d+:[a-z]+:[A-Za-z0-9_-]+$/i.test(value);
    default:
      return false;
  }
}

function isDiagnosticValid(name, value) {
  if (REQUIRED_FIREBASE_ENV_VARS.includes(name)) {
    return isFirebaseEnvValid(name, value);
  }
  return isGoogleClientIdValid(value);
}

const diagnostics = DIAGNOSTIC_PUBLIC_ENV_VARS.map((name) => {
  const value = envValue(name);
  return {
    name,
    requiredForLaunch: REQUIRED_FIREBASE_ENV_VARS.includes(name),
    present: value.length > 0,
    length: value.length,
    valid: isDiagnosticValid(name, value),
    checks: checksFor(name, value),
  };
});

console.log("[eas-env] Redacted EXPO_PUBLIC env diagnostics:");
for (const diagnostic of diagnostics) {
  console.log(
    `[eas-env] ${diagnostic.name} requiredForLaunch=${diagnostic.requiredForLaunch} present=${diagnostic.present} length=${diagnostic.length} valid=${diagnostic.valid} checks=${JSON.stringify(diagnostic.checks)}`,
  );
}

const invalidRequired = diagnostics.filter(
  (diagnostic) => diagnostic.requiredForLaunch && !diagnostic.valid,
);

if (invalidRequired.length) {
  console.error(
    `[eas-env] Missing or invalid required Firebase env vars: ${invalidRequired
      .map((diagnostic) => diagnostic.name)
      .join(", ")}`,
  );
  process.exit(1);
}

console.log("[eas-env] Required Firebase env vars are present and valid.");
