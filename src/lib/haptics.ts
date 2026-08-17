import * as ExpoHaptics from "expo-haptics";
import { Platform } from "react-native";

export type AuraHapticType =
  | "light"
  | "medium"
  | "selection"
  | "success"
  | "warning"
  | "error";

async function runSafely(task: () => Promise<void>) {
  if (Platform.OS === "web") return;
  try {
    await task();
  } catch {
    // no-op
  }
}

export function impactLight() {
  return runSafely(() =>
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light),
  );
}

export function impactMedium() {
  return runSafely(() =>
    ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium),
  );
}

export function selection() {
  return runSafely(() => ExpoHaptics.selectionAsync());
}

export function notificationSuccess() {
  return runSafely(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success),
  );
}

export function notificationWarning() {
  return runSafely(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning),
  );
}

export function notificationError() {
  return runSafely(() =>
    ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error),
  );
}

export function runHaptic(type?: AuraHapticType | null) {
  switch (type) {
    case "light":
      return impactLight();
    case "medium":
      return impactMedium();
    case "selection":
      return selection();
    case "success":
      return notificationSuccess();
    case "warning":
      return notificationWarning();
    case "error":
      return notificationError();
    default:
      return Promise.resolve();
  }
}
