import { Platform } from "react-native";

export async function logDeviceSecurityContext() {
  if (__DEV__) return;

  console.log("[Security] Platform:", Platform.OS);
  console.log("[Security] Version:", Platform.Version);
  // In production, send to your analytics/monitoring.
  // Do not block the app for jailbroken devices during testing phase.
}
