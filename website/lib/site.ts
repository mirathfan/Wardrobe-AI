const configuredSupportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ?? "";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const supportEmail = emailPattern.test(configuredSupportEmail)
  ? configuredSupportEmail
  : null;

export const supportEmailLabel = supportEmail ?? "Support email pending final configuration";
export const supportEmailHref = supportEmail ? `mailto:${supportEmail}` : null;
export const policyUpdatedLabel = "August 15, 2026";
