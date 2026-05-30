export function allowedWebOrigins(value = process.env.ALLOWED_WEB_ORIGINS): string[] {
  return value
    ? value.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [];
}
